const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// 반응형 캔버스: 논리 해상도는 500×700 고정, CSS 스케일로 대응
const CANVAS_LOGICAL_W = 500;
const CANVAS_LOGICAL_H = 700;
canvas.width  = CANVAS_LOGICAL_W;
canvas.height = CANVAS_LOGICAL_H;

function resizeCanvas() {
    const container = document.getElementById('game-container');
    if (!container) return;
    const vpW = window.innerWidth;
    const vpH = window.innerHeight;
    // 게임 캔버스 비율 유지하며 최대 크기
    const scaleX = vpW / CANVAS_LOGICAL_W;
    const scaleY = vpH / CANVAS_LOGICAL_H;
    const scale  = Math.min(scaleX, scaleY, 1.4); // 최대 1.4배
    canvas.style.width  = Math.floor(CANVAS_LOGICAL_W * scale) + 'px';
    canvas.style.height = Math.floor(CANVAS_LOGICAL_H * scale) + 'px';
    // postprocess 캔버스도 동일하게
    const ppCanvas = document.getElementById('postProcessCanvas');
    if (ppCanvas) {
        ppCanvas.style.width  = canvas.style.width;
        ppCanvas.style.height = canvas.style.height;
    }
}
window.addEventListener('resize', resizeCanvas);
// 첫 리사이즈는 게임 컨테이너가 표시될 때
document.addEventListener('DOMContentLoaded', () => {
    const observer = new MutationObserver(() => {
        const gc = document.getElementById('game-container');
        if (gc && gc.style.display !== 'none') resizeCanvas();
    });
    observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['style'] });
});

// 선택된 캐릭터
let selectedCharacter = 'human';
let gameStarted = false;

// 게임 모드 설정
let gameMode = 'normal'; // 'normal' 또는 'bet'
let maxJumps = 10;
let currentJumps = 0;
let gameEnded = false;

// 게임 상수
const GRAVITY = 0.5;
const MAX_JUMP_POWER = 18;
const CHARGE_SPEED = 0.4;
const HORIZONTAL_SPEED = 5;
const BLOCK_WIDTH = 80;
const BLOCK_HEIGHT = 20;
const FLOOR_HEIGHT = 30;

// 향상된 물리 시스템
const COYOTE_TIME = 8; // 플랫폼 이탈 후 점프 가능한 프레임 수
const JUMP_BUFFER_TIME = 10; // 점프 버퍼링 프레임 수
const AIR_FRICTION = 0.985; // 공중 마찰 (기존 0.99에서 감소)
const GROUND_FRICTION = 0.85; // 지면 마찰 (슬라이딩 효과)
const AIR_CONTROL = 0.6; // 공중 제어력 (기존 0.8에서 감소)
const VARIABLE_JUMP_MULTIPLIER = 0.5; // 짧은 점프용 중력 배수

// 월드 좌표계 기준점 (바닥 y 좌표)
const WORLD_FLOOR_Y = 1000;

// 플레이어 설정 (월드 좌표계 사용)
const player = {
    x: canvas.width / 2 - 15,
    y: WORLD_FLOOR_Y - 40, // 월드 좌표
    width: 30,
    height: 40,
    velocityX: 0,
    velocityY: 0,
    isOnGround: true,
    isCharging: false,
    jumpPower: 0,
    direction: 0, // -1: 왼쪽, 0: 없음, 1: 오른쪽
    facingRight: true,
    currentBlock: null, // 현재 서 있는 블록 추적
    // Physics animation properties
    squashStretch: 1.0,  // 1.0 = normal, <1 = squash, >1 = stretch
    animTimer: 0,
    breathePhase: 0,
    landingImpact: 0,  // 0 to 1, decays over time
    trailParticles: [],  // motion trail
    blinkTimer: 0,
    isBlinking: false,
    blinkDuration: 0,
    coyoteTimer: 0,
    jumpBufferTimer: 0,
    wasOnGround: false,
    walkCycle: 0,
    isMoving: false,
    lastGroundY: WORLD_FLOOR_Y - 40
};

// 카메라 오프셋 (스크롤용)
let cameraY = 0;
let maxHeight = 0;

// Scanline cache for performance optimization
let scanlineCache = null;
function createScanlineCache() {
    const scanlineCanvas = document.createElement('canvas');
    scanlineCanvas.width = canvas.width;
    scanlineCanvas.height = canvas.height;
    const scanlineCtx = scanlineCanvas.getContext('2d');

    // Pre-render scanlines to offscreen canvas
    scanlineCtx.strokeStyle = 'rgba(0, 0, 0, 0.03)';
    scanlineCtx.lineWidth = 1;
    for (let i = 0; i < canvas.height; i += 4) {
        scanlineCtx.beginPath();
        scanlineCtx.moveTo(0, i);
        scanlineCtx.lineTo(canvas.width, i);
        scanlineCtx.stroke();
    }
    return scanlineCanvas;
}
scanlineCache = createScanlineCache();

// 체크포인트 시스템
let lastCheckpointHeight = 0;
let checkpointFlashTimer = 0;
const CHECKPOINT_HEIGHTS = [100, 200, 300, 400, 500];

// ===== AUDIO SYSTEM =====
let audioCtx = null;
let bgmGainNode = null;
let currentZoneMusic = null;
let lastMusicZone = -1;
let audioInitialized = false;

function initAudio() {
    if (audioInitialized) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    bgmGainNode = audioCtx.createGain();
    bgmGainNode.gain.value = 0.08;
    bgmGainNode.connect(audioCtx.destination);
    audioInitialized = true;
}

function playSFX(type) {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;

    switch(type) {
        case 'jump_charge':
            const chargeOsc = audioCtx.createOscillator();
            const chargeGain = audioCtx.createGain();
            chargeOsc.connect(chargeGain);
            chargeGain.connect(audioCtx.destination);
            chargeOsc.frequency.setValueAtTime(200, now);
            chargeOsc.frequency.exponentialRampToValueAtTime(400, now + 0.3);
            chargeGain.gain.setValueAtTime(0.1, now);
            chargeGain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
            chargeOsc.start(now);
            chargeOsc.stop(now + 0.3);
            break;

        case 'jump_release':
            const jumpOsc = audioCtx.createOscillator();
            const jumpGain = audioCtx.createGain();
            jumpOsc.connect(jumpGain);
            jumpGain.connect(audioCtx.destination);
            jumpOsc.frequency.setValueAtTime(600, now);
            jumpOsc.frequency.exponentialRampToValueAtTime(300, now + 0.15);
            jumpGain.gain.setValueAtTime(0.15, now);
            jumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            jumpOsc.start(now);
            jumpOsc.stop(now + 0.15);
            break;

        case 'landing':
            const landOsc = audioCtx.createOscillator();
            const landFilter = audioCtx.createBiquadFilter();
            const landGain = audioCtx.createGain();
            landOsc.connect(landFilter);
            landFilter.connect(landGain);
            landGain.connect(audioCtx.destination);
            landFilter.type = 'lowpass';
            landFilter.frequency.value = 200;
            landOsc.frequency.setValueAtTime(150, now);
            landGain.gain.setValueAtTime(0.2, now);
            landGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
            landOsc.start(now);
            landOsc.stop(now + 0.1);
            break;

        case 'footstep':
            // Short low-frequency tap with slight variation
            const footOsc = audioCtx.createOscillator();
            const footGain = audioCtx.createGain();
            footOsc.connect(footGain);
            footGain.connect(audioCtx.destination);
            footOsc.frequency.setValueAtTime(100 + Math.random() * 20, now);
            footGain.gain.setValueAtTime(0.08, now);
            footGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
            footOsc.start(now);
            footOsc.stop(now + 0.05);
            break;

        case 'rain':
            // Random high-frequency ticks for rain
            const rainOsc = audioCtx.createOscillator();
            const rainFilter = audioCtx.createBiquadFilter();
            const rainGain = audioCtx.createGain();
            rainOsc.connect(rainFilter);
            rainFilter.connect(rainGain);
            rainGain.connect(audioCtx.destination);
            rainFilter.type = 'highpass';
            rainFilter.frequency.value = 3000 + Math.random() * 2000;
            rainOsc.frequency.setValueAtTime(5000 + Math.random() * 3000, now);
            rainGain.gain.setValueAtTime(0.05, now);
            rainGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
            rainOsc.start(now);
            rainOsc.stop(now + 0.08);
            break;

        case 'crumble':
            // Low rumbling for crumbling blocks
            const crumbleOsc = audioCtx.createOscillator();
            const crumbleGain = audioCtx.createGain();
            crumbleOsc.connect(crumbleGain);
            crumbleGain.connect(audioCtx.destination);
            crumbleOsc.frequency.setValueAtTime(80, now);
            crumbleOsc.frequency.exponentialRampToValueAtTime(30, now + 0.2);
            crumbleGain.gain.setValueAtTime(0.12, now);
            crumbleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
            crumbleOsc.start(now);
            crumbleOsc.stop(now + 0.2);
            break;

        case 'bounce_block':
            // Springy boing sound
            const bounceOsc1 = audioCtx.createOscillator();
            const bounceOsc2 = audioCtx.createOscillator();
            const bounceMerge = audioCtx.createGain();
            const bounceGain = audioCtx.createGain();
            bounceOsc1.type = 'sine';
            bounceOsc2.type = 'sine';
            bounceOsc1.frequency.setValueAtTime(300, now);
            bounceOsc1.frequency.exponentialRampToValueAtTime(900, now + 0.08);
            bounceOsc2.frequency.setValueAtTime(200, now);
            bounceOsc2.frequency.exponentialRampToValueAtTime(600, now + 0.08);
            bounceOsc1.connect(bounceMerge);
            bounceOsc2.connect(bounceMerge);
            bounceMerge.connect(bounceGain);
            bounceGain.connect(audioCtx.destination);
            bounceGain.gain.setValueAtTime(0.18, now);
            bounceGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
            bounceOsc1.start(now); bounceOsc1.stop(now + 0.25);
            bounceOsc2.start(now); bounceOsc2.stop(now + 0.25);
            break;

        case 'ice_slide':
            // Icy swish sound
            const iceOsc = audioCtx.createOscillator();
            const iceFilter = audioCtx.createBiquadFilter();
            const iceGain = audioCtx.createGain();
            iceOsc.type = 'sine';
            iceOsc.frequency.setValueAtTime(1200, now);
            iceOsc.frequency.linearRampToValueAtTime(800, now + 0.15);
            iceFilter.type = 'highpass';
            iceFilter.frequency.value = 600;
            iceOsc.connect(iceFilter);
            iceFilter.connect(iceGain);
            iceGain.connect(audioCtx.destination);
            iceGain.gain.setValueAtTime(0.06, now);
            iceGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            iceOsc.start(now); iceOsc.stop(now + 0.15);
            break;

        case 'ember':
            // Crackling fire-like sound
            const emberOsc = audioCtx.createOscillator();
            const emberGain = audioCtx.createGain();
            emberOsc.connect(emberGain);
            emberGain.connect(audioCtx.destination);
            emberOsc.frequency.setValueAtTime(200 + Math.random() * 300, now);
            emberGain.gain.setValueAtTime(0.06, now);
            emberGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            emberOsc.start(now);
            emberOsc.stop(now + 0.15);
            break;

        case 'heartbeat':
            // Low rhythmic thump for horror zones
            const beatOsc = audioCtx.createOscillator();
            const beatGain = audioCtx.createGain();
            beatOsc.connect(beatGain);
            beatGain.connect(audioCtx.destination);
            beatOsc.frequency.setValueAtTime(60, now);
            beatGain.gain.setValueAtTime(0.15, now);
            beatGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
            beatOsc.start(now);
            beatOsc.stop(now + 0.12);
            break;

        case 'wind_rush':
            const windOsc = audioCtx.createOscillator();
            const windFilter = audioCtx.createBiquadFilter();
            const windGain = audioCtx.createGain();
            windOsc.type = 'sawtooth';
            windOsc.frequency.value = 100 + Math.random() * 50;
            windFilter.type = 'bandpass';
            windFilter.frequency.value = 800;
            windFilter.Q.value = 0.5;
            windOsc.connect(windFilter);
            windFilter.connect(windGain);
            windGain.connect(audioCtx.destination);
            windGain.gain.setValueAtTime(0.05, now);
            windGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
            windOsc.start(now);
            windOsc.stop(now + 0.3);
            break;

        case 'story_appear':
            // Mysterious chime for story milestones
            const storyOsc1 = audioCtx.createOscillator();
            const storyOsc2 = audioCtx.createOscillator();
            const storyGain = audioCtx.createGain();
            const storyFilter = audioCtx.createBiquadFilter();
            storyOsc1.type = 'sine';
            storyOsc2.type = 'sine';
            storyFilter.type = 'lowpass';
            storyFilter.frequency.value = 2000;
            storyOsc1.connect(storyFilter);
            storyOsc2.connect(storyFilter);
            storyFilter.connect(storyGain);
            storyGain.connect(audioCtx.destination);
            storyOsc1.frequency.setValueAtTime(523.25, now); // C5
            storyOsc1.frequency.exponentialRampToValueAtTime(783.99, now + 0.3); // G5
            storyOsc2.frequency.setValueAtTime(659.25, now + 0.1); // E5
            storyOsc2.frequency.exponentialRampToValueAtTime(1046.5, now + 0.4); // C6
            storyGain.gain.setValueAtTime(0, now);
            storyGain.gain.linearRampToValueAtTime(0.12, now + 0.05);
            storyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
            storyOsc1.start(now);
            storyOsc1.stop(now + 0.5);
            storyOsc2.start(now + 0.1);
            storyOsc2.stop(now + 0.6);
            break;

        case 'danger_ambient':
            // Deep rumbling for dangerous zones
            const dangerOsc = audioCtx.createOscillator();
            const dangerOsc2 = audioCtx.createOscillator();
            const dangerGain = audioCtx.createGain();
            dangerOsc.type = 'sawtooth';
            dangerOsc2.type = 'sine';
            dangerOsc.frequency.setValueAtTime(40, now);
            dangerOsc.frequency.exponentialRampToValueAtTime(30, now + 0.5);
            dangerOsc2.frequency.setValueAtTime(55, now);
            dangerOsc.connect(dangerGain);
            dangerOsc2.connect(dangerGain);
            dangerGain.connect(audioCtx.destination);
            dangerGain.gain.setValueAtTime(0.08, now);
            dangerGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
            dangerOsc.start(now);
            dangerOsc.stop(now + 0.5);
            dangerOsc2.start(now);
            dangerOsc2.stop(now + 0.5);
            break;

        case 'achievement':
            // Triumphant arpeggio for major milestones
            const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
            notes.forEach((freq, idx) => {
                const achOsc = audioCtx.createOscillator();
                const achGain = audioCtx.createGain();
                achOsc.type = 'sine';
                achOsc.frequency.value = freq;
                achOsc.connect(achGain);
                achGain.connect(audioCtx.destination);
                const startTime = now + idx * 0.08;
                achGain.gain.setValueAtTime(0, startTime);
                achGain.gain.linearRampToValueAtTime(0.1, startTime + 0.02);
                achGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.4);
                achOsc.start(startTime);
                achOsc.stop(startTime + 0.4);
            });
            break;

        case 'charge_loop':
            // Rising tone while charging jump
            const clOsc = audioCtx.createOscillator();
            const clGain = audioCtx.createGain();
            const clFilter = audioCtx.createBiquadFilter();
            clOsc.type = 'triangle';
            clFilter.type = 'lowpass';
            clFilter.frequency.value = 500;
            clOsc.connect(clFilter);
            clFilter.connect(clGain);
            clGain.connect(audioCtx.destination);
            clOsc.frequency.setValueAtTime(100, now);
            clOsc.frequency.linearRampToValueAtTime(600, now + 1.5);
            clGain.gain.setValueAtTime(0.06, now);
            clGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
            clOsc.start(now);
            clOsc.stop(now + 0.2);
            break;
    }
}

// 존 기반 환경음 시스템
let lastAmbientTime = 0;
function updateAmbientSounds() {
    if (!audioCtx) return;
    const now = Date.now();
    if (now - lastAmbientTime < 3000) return; // 3초마다
    lastAmbientTime = now;

    const zone = getCurrentZone();

    // 존별 환경음
    if (zone >= 4 && zone <= 7 && Math.random() < 0.3) {
        playSFX('danger_ambient');
    }
    if (zone >= 2 && zone <= 5 && Math.random() < 0.2) {
        playSFX('rain');
    }
    if (zone >= 6 && Math.random() < 0.25) {
        playSFX('heartbeat');
    }
}

function updateBGM() {
    if (!audioCtx) return;

    const zone = getCurrentZone();
    if (zone === lastMusicZone) return;

    lastMusicZone = zone;

    // Stop existing oscillators gracefully
    if (currentZoneMusic) {
        currentZoneMusic.forEach(osc => {
            try { osc.stop(); } catch(e) {}
        });
    }

    currentZoneMusic = [];
    const now = audioCtx.currentTime;

    if (zone <= 1) {
        // Calm ambient - C minor
        const notes = [130.81, 155.56, 196]; // C3, Eb3, G3
        notes.forEach(freq => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            osc.connect(gain);
            gain.connect(bgmGainNode);
            gain.gain.setValueAtTime(0.05, now);
            osc.start(now);
            currentZoneMusic.push(osc);
        });
    } else if (zone <= 3) {
        // Unsettling - dissonant
        const notes = [110, 130.81, 148]; // A2, C3, D3
        notes.forEach((freq, idx) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'triangle';
            osc.frequency.value = freq;
            osc.connect(gain);
            gain.connect(bgmGainNode);
            gain.gain.setValueAtTime(0.03, now);
            osc.start(now);
            currentZoneMusic.push(osc);
        });
    } else if (zone <= 5) {
        // Tense - deep bass drone
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 55; // A1
        osc.connect(gain);
        gain.connect(bgmGainNode);
        gain.gain.setValueAtTime(0.04, now);
        osc.start(now);
        currentZoneMusic.push(osc);

        // High whisper
        const whisper = audioCtx.createOscillator();
        const whisperGain = audioCtx.createGain();
        whisper.type = 'sawtooth';
        whisper.frequency.value = 880;
        whisper.connect(whisperGain);
        whisperGain.connect(bgmGainNode);
        whisperGain.gain.setValueAtTime(0.01, now);
        whisper.start(now);
        currentZoneMusic.push(whisper);
    } else if (zone <= 7) {
        // Horror - very low rumble
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 27.5; // A0
        osc.connect(gain);
        gain.connect(bgmGainNode);
        gain.gain.setValueAtTime(0.05, now);
        osc.start(now);
        currentZoneMusic.push(osc);
    } else if (zone === 8) {
        // Surreal - otherworldly chords
        const notes = [261.63, 277.18, 329.63]; // C4, C#4, E4
        notes.forEach(freq => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq * 0.5;
            osc.connect(gain);
            gain.connect(bgmGainNode);
            gain.gain.setValueAtTime(0.04, now);
            osc.start(now);
            currentZoneMusic.push(osc);
        });
    } else {
        // Hopeful - C major
        const notes = [261.63, 329.63, 392]; // C4, E4, G4
        notes.forEach(freq => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            osc.connect(gain);
            gain.connect(bgmGainNode);
            gain.gain.setValueAtTime(0.06, now);
            osc.start(now);
            currentZoneMusic.push(osc);
        });
    }
}

// ===== SYSTEM 2: PHYSICS ANIMATIONS =====
function updatePhysicsAnimation() {
    // Update breathing phase when idle
    if (player.isOnGround && !player.isCharging) {
        player.breathePhase += 0.03;
        player.squashStretch = 1.0 + Math.sin(player.breathePhase) * 0.02; // Subtle breathing
    }

    // Squash on landing
    if (player.isOnGround && player.landingImpact > 0) {
        player.squashStretch = 0.8 + (player.landingImpact * 0.2); // Squash effect
        player.landingImpact = Math.max(0, player.landingImpact - 0.05);
    }

    // Stretch while jumping
    if (!player.isOnGround && player.velocityY < 0) {
        player.squashStretch = 1.0 + (Math.abs(player.velocityY) / MAX_JUMP_POWER) * 0.25; // Stretch
    } else if (!player.isOnGround) {
        player.squashStretch = Math.max(0.95, player.squashStretch - 0.02); // Return to normal
    }

    // Add motion trail particles
    if (!player.isOnGround && (Math.abs(player.velocityX) > 2 || Math.abs(player.velocityY) > 2)) {
        player.trailParticles.push({
            x: player.x + player.width / 2,
            y: player.y + player.height / 2,
            life: 1,
            maxLife: 0.6
        });
    }

    // Update trail particles
    for (let i = player.trailParticles.length - 1; i >= 0; i--) {
        player.trailParticles[i].life -= 0.1;
        if (player.trailParticles[i].life <= 0) {
            player.trailParticles.splice(i, 1);
        }
    }

    // Keep squashStretch within bounds
    player.squashStretch = Math.max(0.7, Math.min(1.3, player.squashStretch));

    // Eye blinking
    player.blinkTimer++;
    if (!player.isBlinking && player.blinkTimer > 120 + Math.random() * 180) {
        player.isBlinking = true;
        player.blinkDuration = 0;
        player.blinkTimer = 0;
    }
    if (player.isBlinking) {
        player.blinkDuration++;
        if (player.blinkDuration > 8) {
            player.isBlinking = false;
        }
    }
}

function drawMotionTrail() {
    for (const particle of player.trailParticles) {
        const alpha = (particle.life / particle.maxLife) * 0.3;
        ctx.globalAlpha = alpha;

        // Draw a faded copy of the player
        const size = 2;
        const trailY = particle.y + cameraY;

        // Simple trail visualization
        ctx.fillStyle = '#3a5858';
        ctx.fillRect(particle.x - 3, trailY - 5, 6, 10);
    }

    ctx.globalAlpha = 1;
}

// ===== SYSTEM 3: DYNAMIC LIGHTING =====
let lightSources = [];

function updateLighting() {
    lightSources = [];

    const zone = getCurrentZone();

    // Player light - changes with zone
    let playerLightColor = '#3a6868'; // Default muted teal
    if (zone <= 1) playerLightColor = '#3a6868';
    else if (zone <= 3) playerLightColor = '#7a6a3a';
    else if (zone <= 7) playerLightColor = '#6a3030';
    else if (zone === 8) playerLightColor = '#7a6a4a';
    else playerLightColor = '#4a6a4a';

    lightSources.push({
        x: player.x + player.width / 2,
        y: player.y + cameraY + player.height / 2,
        radius: 80 + player.jumpPower * 2,
        color: playerLightColor,
        intensity: 0.6
    });

    // Moving block lights — 화면 안의 블록만 처리
    const sinVal = Math.sin(Date.now() * 0.005);
    for (const block of blocks) {
        if (block.type !== 'moving' || block.disappeared) continue;
        const blockScreenY = block.y + cameraY;
        // 화면 밖 블록은 스킵 (성능 최적화)
        if (blockScreenY < -100 || blockScreenY > canvas.height + 100) continue;

        lightSources.push({
            x: block.x + block.moveOffset + block.width / 2,
            y: blockScreenY + block.height / 2,
            radius: 40 + sinVal * 10,
            color: '#7a6a3a',
            intensity: 0.3
        });
    }

    // Zone-specific lights
    if (zone === 8) {
        // Floating dim amber orbs
        for (let i = 0; i < 3; i++) {
            lightSources.push({
                x: (Math.sin(Date.now() * 0.0005 + i) * 100 + canvas.width / 2),
                y: (Math.cos(Date.now() * 0.0005 + i) * 100 + canvas.height / 2),
                radius: 60,
                color: '#6a5a3a',
                intensity: 0.25
            });
        }
    }
}

function drawLighting() {
    const zone = getCurrentZone();

    // Dark overlay based on zone darkness
    let overlayOpacity = 0;
    if (zone <= 1) overlayOpacity = 0;
    else if (zone <= 3) overlayOpacity = 0.2;
    else if (zone <= 5) overlayOpacity = 0.4;
    else if (zone <= 7) overlayOpacity = 0.6;
    else if (zone === 8) overlayOpacity = 0.3;
    else overlayOpacity = 0;

    // Draw dark overlay
    if (overlayOpacity > 0) {
        ctx.fillStyle = `rgba(0, 0, 0, ${overlayOpacity})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Draw light sources
    ctx.globalCompositeOperation = 'lighten';

    for (const light of lightSources) {
        const gradient = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, light.radius);

        // Parse color for gradient
        const rgb = light.color.substring(1);
        const r = parseInt(rgb.substring(0, 2), 16);
        const g = parseInt(rgb.substring(2, 4), 16);
        const b = parseInt(rgb.substring(4, 6), 16);

        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${light.intensity})`);
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

        ctx.fillStyle = gradient;
        ctx.fillRect(light.x - light.radius, light.y - light.radius, light.radius * 2, light.radius * 2);
    }

    ctx.globalCompositeOperation = 'source-over';
}

// ===== EXPANDED STORY SYSTEM =====
const storyMilestones = {
    // === Zone 0: Entry (0-50m) - 버려진 도시의 지하 시설 ===
    0: "여긴... 버려진 타워의 입구야. 아이를 찾으려면 올라가야 해.",
    10: "비상등이 깜빡인다. 이 시설은... 오래전에 폐쇄된 것 같다.",
    25: "바닥에 먼지가 두껍게 쌓여있다. 하지만 작은 발자국이... 최근 것이다.",
    40: "벽에 긁힌 자국. '출구는 위에'라고 적혀 있다.",

    // === Zone 1: Unease (50-100m) - 불안감의 시작 ===
    50: "벽에 누군가의 메시지가 있다... '올라가지 마라. 위에는 아무것도 없다.'",
    60: "환기구에서 차가운 바람이 불어온다. 뭔가... 살아있는 것 같다.",
    75: "깨진 유리 파편 사이에서 아이의 운동화 한 짝을 발견했다.",
    90: "보안 카메라가 아직 작동하고 있다. 누군가 지켜보고 있는 걸까?",

    // === Zone 2: Deeper (100-150m) - 과거 연구시설의 흔적 ===
    100: "점점 어두워진다. 하지만 아이의 인형이 여기 있었어... 맞는 방향이야.",
    110: "실험실 문이 열려있다. 안에는 깨진 시험관과... 이상한 액체가.",
    125: "벽에 붙은 연구 보고서. '프로젝트 바벨탑 - 3단계 승인'이라고 적혀있다.",
    140: "여기서 무슨 실험을 했던 거지? 벽의 스크래치 자국이 사람 것이 아니다.",

    // === Zone 3: Rust (150-200m) - 공포의 시작 ===
    150: "다른 생존자의 흔적... 이미 오래전 일이다. 마른 핏자국이 보인다.",
    165: "라디오에서 잡음이 들린다. 가끔... 아이의 목소리 같은 것이 섞여있다.",
    180: "여기 일기장이 있다. '7일째, 위에서 내려오는 소리가 점점 커진다...'",
    195: "복도가 갈라진다. 한쪽에는 '돌아가라'는 경고문. 다른 쪽에는 아이의 그림.",

    // === Zone 4: Danger (200-250m) - 위험 구역 ===
    200: "이상한 소리가 들린다. 위에서... 뭔가가 움직이고 있어.",
    215: "비상 방송 시스템이 갑자기 켜졌다. '모든 인원은 즉시 대피하십시오.'",
    230: "깨진 창문 너머로 도시가 보인다. 불빛이 하나도 없다... 모두 떠난 건가?",
    245: "누군가 남긴 무전기. '...아이들이... 꼭대기에서... 빛을...' 잡음에 끊긴다.",

    // === Zone 5: Deep Danger (250-300m) - 진실에 가까워짐 ===
    250: "아이가 쓴 편지를 찾았다. '아빠, 무서워요. 위에서 기다릴게요.'",
    265: "벽에 손톱자국이... 누군가 필사적으로 올라갔다.",
    280: "연구원의 마지막 기록. '바벨탑 프로젝트의 본질을 이해했다. 이것은 실험이 아니라...'",
    295: "공기가 차갑다. 숨을 쉴 때마다 하얀 김이 나온다.",

    // === Zone 6: Core (300-400m) - 핵심 구역, 진실이 드러남 ===
    300: "공기가 차갑다. 벽에 손톱자국이... 누군가 필사적으로 올라갔다.",
    320: "이곳의 구조가 바뀌기 시작했다. 계단이 있어야 할 곳에 벽이, 벽이 있어야 할 곳에 공허가.",
    340: "또 다른 일기장. '바벨탑은 물리적 구조물이 아니다. 이것은 의지의 시험이다.'",
    360: "거울이 있다. 내 모습이... 이상하다. 피로한 것 이상의 무언가.",
    380: "아이의 목소리가 들린다. 점점 선명해진다. '아빠, 거의 다 왔어요!'",

    // === Zone 7: Abyss (400-500m) - 심연, 정신적 한계 ===
    400: "시야가 흐려진다. 현실인지 환상인지... 아이의 목소리가 들리는 것 같다.",
    420: "벽이 숨을 쉬고 있다. 아니... 내가 숨을 쉬는 것에 맞춰 벽이 움직이는 것인가?",
    440: "과거의 기억이 스쳐 지나간다. 아이와 함께 공원에서 놀던 날...",
    460: "다리가 떨린다. 하지만 포기할 수 없어. 아이가 기다리고 있으니까.",
    480: "어둠 속에서 빛이 보인다. 환상인가... 아닌가.",

    // === Zone 8: Anomaly (500-600m) - 초자연적 공간 ===
    500: "거의 다 왔어... 빛이 보인다. 아이가... 거기 있는 거야?",
    520: "공간이 뒤틀린다. 위와 아래의 구분이 사라지고 있다.",
    540: "떠다니는 기억의 파편들. 아이의 웃음소리, 첫 걸음마, 생일 파티...",
    560: "이 탑은... 올라가는 사람의 의지를 시험하는 것이었구나.",
    580: "마지막 문이 보인다. 그 너머에서 따뜻한 빛이 새어 나온다.",

    // === Zone 9: Surface (600m+) - 구원, 엔딩 ===
    600: "정상에 도달했다. 아이는... 여기 있었구나. 이제 괜찮아.",
    620: "햇빛이 눈부시다. 이 탑 위에서 바라본 세상은... 아직 아름답다.",
    650: "아이가 웃고 있다. '아빠가 올 줄 알았어요.' 이 한마디에 모든 고통이 사라진다.",
    700: "함께 내려가자. 이제 더 이상 무섭지 않아. 아빠가 여기 있으니까."
};

// 캐릭터별 추가 대사 시스템
const characterDialogues = {
    human: {
        50: "(주머니에서 아이의 사진을 꺼내본다...)",
        200: "군인 시절의 훈련이 도움이 되고 있어. 하지만 이건 전쟁이 아니야.",
        400: "다리가 후들거린다... 하지만 아빠니까. 아빠는 포기하면 안 돼.",
        600: "(눈물을 참으며) 드디어... 찾았다."
    },
    skeleton: {
        50: "...뼈만 남은 몸이지만, 기억은 아직 선명하다.",
        200: "살아있을 때 하지 못한 일... 이제라도 해야지.",
        400: "이 몸이 부서질 때까지... 올라간다.",
        600: "...이 따뜻함은 뭐지? 잊고 있었던 감정이다."
    },
    dog: {
        50: "(코를 킁킁거리며 아이의 냄새를 추적한다)",
        200: "(불안하게 꼬리를 내린다. 하지만 냄새는 확실히 위에서 온다.)",
        400: "(지치지만 충성스러운 눈빛으로 위를 바라본다)",
        600: "(꼬리를 미친 듯이 흔들며 아이에게 달려간다!)"
    },
    cat: {
        50: "(귀를 쫑긋 세우고 위를 향해 조용히 걷는다)",
        200: "(어둠 속에서도 눈이 빛난다. 고양이의 야간 시력이 도움이 된다.)",
        400: "(지쳐서 잠시 웅크린다... 하지만 이내 다시 일어선다.)",
        600: "(조용히 아이 옆에 앉아 그르렁거린다)"
    }
};

// 환경 스토리텔링 - 블록에 표시되는 시각적 단서
const environmentalClues = {
    30: { type: 'footprint', desc: '작은 발자국' },
    80: { type: 'toy', desc: '떨어진 인형 팔' },
    130: { type: 'note', desc: '찢어진 메모' },
    220: { type: 'photo', desc: '깨진 가족 사진' },
    350: { type: 'drawing', desc: '아이의 크레용 그림' },
    480: { type: 'light', desc: '희미한 빛' },
    550: { type: 'warmth', desc: '따뜻한 공기' }
};

let shownStories = new Set();

// ===== FEATURE 2: HORROR ATMOSPHERE SYSTEM =====
let fogParticles = [];
let screenShakeIntensity = 0;
let glitchTimer = 0;
let heartbeatTime = 0;

// ===== 아이템/파워업 시스템 =====
// 아이템 오브젝트 배열 (월드에 떠 있는 아이템)
let items = [];

// 플레이어 파워업 상태
const powerups = {
    doubleJump:  { active: false, timer: 0, hasExtraJump: false },   // 이중 점프 (1회용 공중 점프 추가)
    speedBoost:  { active: false, timer: 0 },                         // 속도 부스트 (수평속도 1.6배)
    shield:      { active: false, timer: 0, flicker: 0 },            // 실드 (추락 1회 방지)
    slowMotion:  { active: false, timer: 0 }                          // 슬로우 모션 (중력/속도 절반)
};

// 아이템 정의
const ITEM_TYPES = [
    { type: 'doubleJump', color: '#ffdd00', glyph: '2x', duration: 0 },    // 즉시 발동
    { type: 'speedBoost', color: '#ff6600', glyph: '▶▶', duration: 420 },  // 7초
    { type: 'shield',     color: '#4488ff', glyph: '🛡', duration: 0 },     // 1회 사용
    { type: 'slowMotion', color: '#cc44ff', glyph: '⏳', duration: 300 }    // 5초
];

// 포그 파티클 초기화
function initializeFogParticles() {
    fogParticles = [];
    const particleCount = Math.floor(maxHeight / 50);
    for (let i = 0; i < particleCount; i++) {
        fogParticles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            opacity: Math.random() * 0.3 + 0.1,
            speed: Math.random() * 0.3 + 0.1
        });
    }
}

// ===== SYSTEM 1: ENVIRONMENT PARTICLE SYSTEM =====
let envParticles = [];
let windStrength = 0;
let windDirection = 1;

// ===== FEATURE 1: LANDING DUST/IMPACT PARTICLES =====
let impactParticles = [];

function initEnvParticles() {
    envParticles = [];
    const zone = getCurrentZone();
    const particleCount = Math.min(100, Math.floor(maxHeight / 50) + 20);

    if (zone <= 1) {
        // Zone 0-1: Digital rain (dim muted teal)
        for (let i = 0; i < particleCount; i++) {
            envParticles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                vx: 0,
                vy: Math.random() * 0.5 + 0.3,
                size: Math.random() * 2 + 1,
                color: '#3a6868',
                opacity: Math.random() * 0.5 + 0.15,
                life: 1,
                maxLife: 1,
                type: 'rain'
            });
        }
    } else if (zone <= 3) {
        // Zone 2-3: Dust motes and ash (gray-brown)
        for (let i = 0; i < particleCount * 0.8; i++) {
            envParticles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                vx: Math.random() * 0.2 - 0.1,
                vy: Math.random() * 0.3 + 0.05,
                size: Math.random() * 2 + 0.5,
                color: '#6a5a4a',
                opacity: Math.random() * 0.35 + 0.1,
                life: 1,
                maxLife: 1,
                type: 'dust'
            });
        }
    } else if (zone <= 5) {
        // Zone 4-5: Heavy rain (dark gray-blue)
        for (let i = 0; i < particleCount; i++) {
            envParticles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                vx: Math.random() * 0.3 - 0.15,
                vy: Math.random() * 2 + 1.5,
                size: Math.random() * 2 + 0.5,
                color: '#4a5a68',
                opacity: Math.random() * 0.55 + 0.2,
                life: 1,
                maxLife: 1,
                type: 'rain'
            });
        }
    } else if (zone <= 7) {
        // Zone 6-7: Dark orange-brown embers
        for (let i = 0; i < particleCount * 0.9; i++) {
            envParticles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                vx: Math.random() * 0.4 - 0.2,
                vy: Math.random() * -0.5 - 0.5,
                size: Math.random() * 2 + 1,
                color: Math.random() > 0.7 ? '#6a5a3a' : '#5a3a2a',
                opacity: Math.random() * 0.5 + 0.3,
                life: 1,
                maxLife: 1,
                type: 'ember'
            });
        }
    } else if (zone === 8) {
        // Zone 8: Dim amber orbs
        for (let i = 0; i < particleCount * 0.6; i++) {
            envParticles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                vx: Math.random() * 0.2 - 0.1,
                vy: Math.random() * 0.2 - 0.1,
                size: Math.random() * 3 + 1,
                color: '#7a6a4a',
                opacity: Math.random() * 0.4 + 0.2,
                life: 1,
                maxLife: 1,
                type: 'glow'
            });
        }
    } else {
        // Zone 9: Leaves and petals (dark brown/olive)
        for (let i = 0; i < particleCount * 0.7; i++) {
            envParticles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                vx: Math.random() * 0.5 - 0.25,
                vy: Math.random() * 0.4 + 0.2,
                size: Math.random() * 3 + 1,
                color: Math.random() > 0.5 ? '#4a6a5a' : '#5a4a3a',
                opacity: Math.random() * 0.4 + 0.15,
                life: 1,
                maxLife: 1,
                type: 'leaf'
            });
        }
    }
}

function updateEnvParticles() {
    const zone = getCurrentZone();

    // Update particles and filter in single pass for performance
    let survivingParticles = [];
    for (let i = 0; i < envParticles.length; i++) {
        const p = envParticles[i];

        // Apply wind
        p.vx += windStrength * windDirection * 0.02;

        // Update position
        p.x += p.vx;
        p.y += p.vy;

        // Keep particles that are still visible
        if (!(p.y > canvas.height + 50 || p.x < -50 || p.x > canvas.width + 50)) {
            survivingParticles.push(p);
        }
    }
    envParticles = survivingParticles;

    // 파티클이 부족하면 개별 추가 (전체 재생성 대신 점진적 보충)
    if (envParticles.length < 80 && Math.random() < 0.3) {
        const zone = getCurrentZone();
        let p = null;
        if (zone <= 1) {
            p = { x: Math.random() * canvas.width, y: -5, vx: 0, vy: Math.random() * 0.5 + 0.3, size: Math.random() * 2 + 1, color: '#3a6868', opacity: Math.random() * 0.5 + 0.15, life: 1, maxLife: 1, type: 'rain' };
        } else if (zone <= 3) {
            p = { x: Math.random() * canvas.width, y: -5, vx: Math.random() * 0.2 - 0.1, vy: Math.random() * 0.3 + 0.05, size: Math.random() * 2 + 0.5, color: '#6a5a4a', opacity: Math.random() * 0.35 + 0.1, life: 1, maxLife: 1, type: 'dust' };
        } else if (zone <= 5) {
            p = { x: Math.random() * canvas.width, y: -5, vx: Math.random() * 0.3 - 0.15, vy: Math.random() * 2 + 1.5, size: Math.random() * 2 + 0.5, color: '#4a5a68', opacity: Math.random() * 0.55 + 0.2, life: 1, maxLife: 1, type: 'rain' };
        } else if (zone <= 7) {
            p = { x: Math.random() * canvas.width, y: canvas.height + 5, vx: Math.random() * 0.4 - 0.2, vy: Math.random() * -0.5 - 0.5, size: Math.random() * 2 + 1, color: Math.random() > 0.7 ? '#6a5a3a' : '#5a3a2a', opacity: Math.random() * 0.5 + 0.3, life: 1, maxLife: 1, type: 'ember' };
        } else if (zone === 8) {
            p = { x: Math.random() * canvas.width, y: Math.random() * canvas.height, vx: Math.random() * 0.2 - 0.1, vy: Math.random() * 0.2 - 0.1, size: Math.random() * 3 + 1, color: '#7a6a4a', opacity: Math.random() * 0.4 + 0.2, life: 1, maxLife: 1, type: 'glow' };
        } else {
            p = { x: Math.random() * canvas.width, y: -5, vx: Math.random() * 0.5 - 0.25, vy: Math.random() * 0.4 + 0.2, size: Math.random() * 3 + 1, color: Math.random() > 0.5 ? '#4a6a5a' : '#5a4a3a', opacity: Math.random() * 0.4 + 0.15, life: 1, maxLife: 1, type: 'leaf' };
        }
        if (p) envParticles.push(p);
    }

    // Update wind
    windStrength = Math.sin(Date.now() * 0.001) * 0.3;
    windDirection = Math.random() > 0.5 ? 1 : -1;
}

function drawEnvParticles(foreground = false) {
    const zone = getCurrentZone();

    for (const p of envParticles) {
        const isBackgroundType = ['dust', 'glow', 'leaf'].includes(p.type);

        // Draw background particles first, foreground particles last
        if (foreground && isBackgroundType) continue;
        if (!foreground && !isBackgroundType) continue;

        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.opacity * 0.7;
        ctx.fillRect(p.x, p.y, p.size, p.size);
    }

    ctx.globalAlpha = 1;
}

function spawnLandingDust(x, y) {
    const count = 8 + Math.floor(Math.random() * 5);
    const zone = getCurrentZone();
    let dustColor;

    if (zone <= 1) {
        dustColor = '#4a6868'; // Muted teal
    } else if (zone <= 3) {
        dustColor = '#6a5a4a'; // Gray-brown
    } else if (zone <= 5) {
        dustColor = '#5a4a4a'; // Dark brown
    } else if (zone <= 7) {
        dustColor = '#5a3a2a'; // Dark rust
    } else if (zone === 8) {
        dustColor = '#6a5a3a'; // Dim amber
    } else {
        dustColor = '#4a5a4a'; // Muted green-gray
    }

    for (let i = 0; i < count; i++) {
        impactParticles.push({
            x: x + Math.random() * 30,
            y: y,
            vx: (Math.random() - 0.5) * 4,
            vy: -Math.random() * 2 - 0.5,
            size: 2 + Math.random() * 3,
            life: 1.0,
            decay: 0.02 + Math.random() * 0.02,
            color: dustColor
        });
    }
}

function updateImpactParticles() {
    for (let i = impactParticles.length - 1; i >= 0; i--) {
        const p = impactParticles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05; // slight gravity
        p.life -= p.decay;
        if (p.life <= 0) impactParticles.splice(i, 1);
    }
}

function drawImpactParticles() {
    for (const p of impactParticles) {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y + cameraY, p.size, p.size);
    }
    ctx.globalAlpha = 1;
}

// 현재 존 가져오기 (0-9)
function getCurrentZone() {
    return Math.min(9, Math.floor(maxHeight / 100));
}

// ===== 10 ZONES THEME SYSTEM =====
const zones = {
    0: { // 0-100m: Entry - Dark industrial, dim teal emergency lights
        blockColor1: '#1a2428',
        blockColor2: '#0f1820',
        blockBorder: '#3a6868',
        blockDot: '#5a8888',
        backgroundColor: '#2a4848',
        particleColors: ['#3a6868', '#2a5858', '#4a7878'],
        backgroundOpacity: 0.08,
        name: 'entry',
        vignette: 0.15,
        screenShake: 0,
        glitch: false,
        fogDensity: 0.08
    },
    1: { // 50-100m: Slight unease - Concrete and metal, dim teal accents
        blockColor1: '#1a2428',
        blockColor2: '#0f1820',
        blockBorder: '#3a6868',
        blockDot: '#5a8888',
        backgroundColor: '#2a4a52',
        particleColors: ['#3a6868', '#4a7878', '#2a5858'],
        backgroundOpacity: 0.1,
        name: 'unease',
        vignette: 0.18,
        screenShake: 0.2,
        glitch: false,
        fogDensity: 0.1
    },
    2: { // 100-150m: Deeper - Rust-tinged, amber warning lights
        blockColor1: '#2a1f20',
        blockColor2: '#1a1218',
        blockBorder: '#6a5a4a',
        blockDot: '#8a7a6a',
        backgroundColor: '#3a3028',
        particleColors: ['#8a7a3a', '#7a6a5a', '#6a5a4a'],
        backgroundOpacity: 0.12,
        name: 'deeper',
        vignette: 0.25,
        screenShake: 0.4,
        glitch: false,
        fogDensity: 0.15
    },
    3: { // 150-200m: More rust - Failing systems, amber accents
        blockColor1: '#2a1f20',
        blockColor2: '#1a1218',
        blockBorder: '#7a6a5a',
        blockDot: '#8a7a6a',
        backgroundColor: '#4a3a2a',
        particleColors: ['#8a7a3a', '#7a6a4a', '#6a5a3a'],
        backgroundOpacity: 0.14,
        name: 'rust',
        vignette: 0.3,
        screenShake: 0.6,
        glitch: true,
        fogDensity: 0.2
    },
    4: { // 200-250m: Danger - Dark red emergency lighting, corroded
        blockColor1: '#2a1a1a',
        blockColor2: '#1a0a0a',
        blockBorder: '#6a3030',
        blockDot: '#7a4a4a',
        backgroundColor: '#3a2020',
        particleColors: ['#6a3030', '#7a4040', '#5a2a2a'],
        backgroundOpacity: 0.16,
        name: 'danger',
        vignette: 0.4,
        screenShake: 1.2,
        glitch: true,
        fogDensity: 0.3
    },
    5: { // 250-300m: Deeper danger - Dark red, corrupted systems
        blockColor1: '#1a1010',
        blockColor2: '#0a0808',
        blockBorder: '#5a2828',
        blockDot: '#6a3a3a',
        backgroundColor: '#2a1515',
        particleColors: ['#5a2828', '#6a3030', '#4a2020'],
        backgroundOpacity: 0.18,
        name: 'deepdanger',
        vignette: 0.5,
        screenShake: 1.5,
        glitch: true,
        fogDensity: 0.4
    },
    6: { // 300-400m: Core - Almost total darkness, faint red glow
        blockColor1: '#0a0808',
        blockColor2: '#050404',
        blockBorder: '#4a2020',
        blockDot: '#5a3030',
        backgroundColor: '#1a0a0a',
        particleColors: ['#4a2020', '#5a2828', '#3a1818'],
        backgroundOpacity: 0.15,
        name: 'core',
        vignette: 0.6,
        screenShake: 1.8,
        glitch: true,
        fogDensity: 0.5
    },
    7: { // 400-500m: Total darkness - Faint red, barely visible
        blockColor1: '#050404',
        blockColor2: '#020202',
        blockBorder: '#3a1818',
        blockDot: '#4a2828',
        backgroundColor: '#0f0808',
        particleColors: ['#3a1818', '#4a2020', '#2a1010'],
        backgroundOpacity: 0.12,
        name: 'abyss',
        vignette: 0.7,
        screenShake: 2,
        glitch: true,
        fogDensity: 0.6
    },
    8: { // 500-600m: Anomaly - Dim amber/yellow, otherworldly but muted
        blockColor1: '#1a1810',
        blockColor2: '#0a0a08',
        blockBorder: '#6a5a3a',
        blockDot: '#7a6a4a',
        backgroundColor: '#2a2418',
        particleColors: ['#6a5a3a', '#7a6a4a', '#5a4a2a'],
        backgroundOpacity: 0.14,
        name: 'anomaly',
        vignette: 0.45,
        screenShake: 1.2,
        glitch: true,
        fogDensity: 0.35
    },
    9: { // 600m+: Surface - First hint of pale daylight, muted greens/grays
        blockColor1: '#1a2a20',
        blockColor2: '#0a1a10',
        blockBorder: '#4a6a5a',
        blockDot: '#5a7a6a',
        backgroundColor: '#3a5a4a',
        particleColors: ['#4a6a5a', '#5a7a6a', '#3a5a4a'],
        backgroundOpacity: 0.1,
        name: 'surface',
        vignette: 0.2,
        screenShake: 0.3,
        glitch: false,
        fogDensity: 0.1
    }
};

// 현재 존 테마 가져오기
function getCurrentZoneTheme() {
    return zones[getCurrentZone()];
}

// ===== FEATURE 3: ENHANCED BLOCK SYSTEM =====
let blocks = [];

// 바닥 (월드 좌표계)
const floor = {
    x: 0,
    y: WORLD_FLOOR_Y,
    width: canvas.width,
    height: FLOOR_HEIGHT
};

// 키 입력 상태
const keys = {
    left: false,
    right: false,
    space: false
};

// 블록 타입별 생성 함수
function createBlock(x, y, width) {
    const zone = Math.floor((WORLD_FLOOR_Y - y) / 1000 * 100);
    const block = {
        x: x,
        y: y,
        width: width,
        height: BLOCK_HEIGHT,
        type: 'normal',
        wobble: 0
    };

    // 존에 따라 블록 타입 결정
    if (zone >= 400 && Math.random() < 0.3) {
        block.type = 'moving';
        block.moveSpeed = Math.random() * 1.5 + 0.5;
        block.moveRange = 80;
        block.moveDirection = 1;
        block.moveOffset = 0;
    } else if (zone >= 300 && Math.random() < 0.25) {
        block.type = 'crumbling';
        block.crumbleTimer = 0;
        block.isCrumbling = false;
    } else if (zone >= 500 && Math.random() < 0.35) {
        // 페이크 블록 (버그 수정: 700 → 500)
        block.type = 'fake';
        block.opacity = 0.5;
    } else if (zone >= 150 && Math.random() < 0.2) {
        // 바운스 블록: 착지하면 높이 튕겨 오름
        block.type = 'bounce';
        block.bounceMultiplier = 1.35 + Math.random() * 0.2; // 1.35~1.55
        block.bouncePhase = 0; // 애니메이션
    } else if (zone >= 200 && Math.random() < 0.22) {
        // 얼음 블록: 매우 미끄러움
        block.type = 'ice';
        block.icePhase = Math.random() * Math.PI * 2; // 반짝임 위상
    } else if (zone >= 250 && Math.random() < 0.22) {
        // 컨베이어 블록: 한 방향으로 밀림
        block.type = 'conveyor';
        block.conveyorDirection = Math.random() < 0.5 ? 1 : -1;
        block.conveyorSpeed = 2.0 + Math.random() * 1.5;
        block.conveyorPhase = 0; // 화살표 애니메이션
    }

    return block;
}

// 블록 생성 함수 (월드 좌표계) - 500 블록
function generateBlocks() {
    blocks = [];

    // 시작 블록 (바닥 바로 위)
    blocks.push({
        x: canvas.width / 2 - BLOCK_WIDTH / 2,
        y: WORLD_FLOOR_Y - 100,
        width: 80,
        height: BLOCK_HEIGHT,
        type: 'normal',
        wobble: 0
    });

    // 블록 생성 (위로 올라가면서) - 도달 가능한 위치에 배치
    let lastY = WORLD_FLOOR_Y - 100;
    let lastX = canvas.width / 2 - BLOCK_WIDTH / 2;

    // 최대 점프 높이 계산: v^2 / (2*g) = 18^2 / (2*0.5) = 324
    const maxJumpHeight = (MAX_JUMP_POWER * MAX_JUMP_POWER) / (2 * GRAVITY);
    const safeVerticalGap = maxJumpHeight * 0.4; // 안전하게 40%만 사용 (약 130)

    // 최대 점프 거리 계산 (수평)
    const maxJumpDistance = HORIZONTAL_SPEED * (2 * MAX_JUMP_POWER / GRAVITY) * 0.5;
    const safeHorizontalGap = maxJumpDistance * 0.6;

    // Performance optimization: Generate blocks incrementally
    // Initial visible area: generate first batch to avoid startup stutter
    // Remaining blocks generated lazily via generateMoreBlocks()
    const initialBlockCount = 40;
    _blockGenState = {
        lastY: lastY,
        lastX: lastX,
        generated: 0,
        totalTarget: 500,
        maxJumpHeight: maxJumpHeight,
        safeVerticalGap: safeVerticalGap,
        safeHorizontalGap: safeHorizontalGap
    };

    for (let i = 0; i < initialBlockCount; i++) {
        const currentHeight = WORLD_FLOOR_Y - lastY;
        const zone = Math.floor(currentHeight / 1000 * 100);

        // 높이에 따른 블록 크기 조정
        let blockWidth = 80;
        if (zone >= 500) blockWidth = 40;
        else if (zone >= 400) blockWidth = 50;
        else if (zone >= 300) blockWidth = 60;
        else if (zone >= 200) blockWidth = 70;
        else if (zone >= 100) blockWidth = 70;
        else blockWidth = 80;

        // 높이에 따른 간격 조정 (높을수록 더 촘촘해짐)
        let minGap = 60;
        let maxGap = 120;
        if (zone >= 500) {
            minGap = 50;
            maxGap = 90;
        } else if (zone >= 400) {
            minGap = 55;
            maxGap = 100;
        } else if (zone >= 300) {
            minGap = 60;
            maxGap = 110;
        }

        const yGap = minGap + Math.random() * (maxGap - minGap);

        // 수평 위치 계산
        const heightRatio = yGap / maxGap;
        let allowedHorizontalMove = safeHorizontalGap * (1 - heightRatio * 0.5);

        // 높이에 따라 수평 이동 제한
        if (zone >= 300) {
            allowedHorizontalMove *= (1 - (zone - 300) / 300 * 0.3);
        }

        let newX = lastX + (Math.random() - 0.5) * allowedHorizontalMove * 2;
        newX = Math.max(20, Math.min(canvas.width - blockWidth - 20, newX));

        const newY = lastY - yGap;

        const block = createBlock(newX, newY, blockWidth);

        // 환경 단서 블록에 부착
        const blockHeight = Math.floor((WORLD_FLOOR_Y - newY) / 10);
        for (const [clueHeight, clue] of Object.entries(environmentalClues)) {
            if (Math.abs(blockHeight - parseInt(clueHeight)) < 5) {
                block.envClue = clue;
                break;
            }
        }

        blocks.push(block);

        lastY = newY;
        lastX = newX;
    }

    // Save generation state for lazy loading
    _blockGenState.lastY = lastY;
    _blockGenState.lastX = lastX;
    _blockGenState.generated = initialBlockCount;

    initializeFogParticles();
}

// Lazy block generation state
let _blockGenState = null;

// Generate more blocks incrementally as player climbs
// Called from update() - generates a batch of blocks per frame when needed
function generateMoreBlocks() {
    if (!_blockGenState) return;
    if (_blockGenState.generated >= _blockGenState.totalTarget) return;

    // Check if player is approaching the top of generated blocks
    const topBlockY = blocks.length > 0 ? blocks[blocks.length - 1].y : WORLD_FLOOR_Y;
    const playerDistToTop = topBlockY - player.y;

    // Generate more when player is within 2000px of the top generated block
    if (playerDistToTop > 2000) return;

    const batchSize = 30; // Generate 30 blocks per call
    let lastY = _blockGenState.lastY;
    let lastX = _blockGenState.lastX;
    const safeHorizontalGap = _blockGenState.safeHorizontalGap;

    for (let i = 0; i < batchSize && _blockGenState.generated < _blockGenState.totalTarget; i++) {
        const currentHeight = WORLD_FLOOR_Y - lastY;
        const zone = Math.floor(currentHeight / 1000 * 100);

        let blockWidth = 80;
        if (zone >= 500) blockWidth = 40;
        else if (zone >= 400) blockWidth = 50;
        else if (zone >= 300) blockWidth = 60;
        else if (zone >= 200) blockWidth = 70;
        else if (zone >= 100) blockWidth = 70;

        let minGap = 60, maxGap = 120;
        if (zone >= 500) { minGap = 50; maxGap = 90; }
        else if (zone >= 400) { minGap = 55; maxGap = 100; }
        else if (zone >= 300) { minGap = 60; maxGap = 110; }

        const yGap = minGap + Math.random() * (maxGap - minGap);
        const heightRatio = yGap / maxGap;
        let allowedHorizontalMove = safeHorizontalGap * (1 - heightRatio * 0.5);
        if (zone >= 300) {
            allowedHorizontalMove *= (1 - (zone - 300) / 300 * 0.3);
        }

        let newX = lastX + (Math.random() - 0.5) * allowedHorizontalMove * 2;
        newX = Math.max(20, Math.min(canvas.width - blockWidth - 20, newX));
        const newY = lastY - yGap;

        const block = createBlock(newX, newY, blockWidth);

        const blockHeight = Math.floor((WORLD_FLOOR_Y - newY) / 10);
        for (const [clueHeight, clue] of Object.entries(environmentalClues)) {
            if (Math.abs(blockHeight - parseInt(clueHeight)) < 5) {
                block.envClue = clue;
                break;
            }
        }

        blocks.push(block);
        lastY = newY;
        lastX = newX;
        _blockGenState.generated++;
    }

    _blockGenState.lastY = lastY;
    _blockGenState.lastX = lastX;

    // Re-generate items when new blocks are added
    if (_blockGenState.generated > 40) {
        generateItems();
    }
}

// ─── 아이템 생성 ───
function generateItems() {
    items = [];
    // 블록 위 일부에 아이템 배치 (zone >= 50 이상부터)
    const eligibleBlocks = blocks.filter(b => {
        const h = (WORLD_FLOOR_Y - b.y) / 10;
        return h >= 50 && b.type !== 'fake' && b.type !== 'crumbling';
    });

    // 블록 50개당 약 1개 비율
    const itemCount = Math.max(4, Math.floor(eligibleBlocks.length / 50));
    const step = Math.floor(eligibleBlocks.length / itemCount);
    for (let i = 0; i < itemCount; i++) {
        const idx = i * step + Math.floor(Math.random() * step);
        const block = eligibleBlocks[Math.min(idx, eligibleBlocks.length - 1)];
        const iDef = ITEM_TYPES[i % ITEM_TYPES.length];

        items.push({
            x: block.x + block.width / 2 - 12,
            y: block.y - 30,
            width: 24,
            height: 24,
            type: iDef.type,
            color: iDef.color,
            glyph: iDef.glyph,
            duration: iDef.duration,
            collected: false,
            bobPhase:  Math.random() * Math.PI * 2,
            glowPhase: Math.random() * Math.PI * 2
        });
    }
}

// ─── 아이템 업데이트 ───
function updateItems() {
    for (const item of items) {
        if (item.collected) continue;
        item.bobPhase  = (item.bobPhase  + 0.05) % (Math.PI * 2);
        item.glowPhase = (item.glowPhase + 0.03) % (Math.PI * 2);

        // 플레이어와 충돌 체크 (월드 좌표계로 비교)
        const itemWorldY = item.y + Math.sin(item.bobPhase) * 4;
        const pL = player.x, pR = player.x + player.width;
        const pT = player.y, pB = player.y + player.height;
        const iL = item.x,   iR = item.x + item.width;
        const iT = itemWorldY, iB = itemWorldY + item.height;

        if (pR > iL && pL < iR && pB > iT && pT < iB) {
            collectItem(item);
        }
    }
}

// ─── 아이템 수집 ───
function collectItem(item) {
    item.collected = true;
    achievementStats.itemsCollected++;
    playSFX('achievement');
    screenShakeIntensity = 2;

    // 수집 파티클 (월드 좌표계 — drawImpactParticles에서 +cameraY 적용)
    for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        impactParticles.push({
            x: item.x + item.width / 2,
            y: item.y + item.height / 2,
            vx: Math.cos(angle) * (2 + Math.random() * 2),
            vy: Math.sin(angle) * (2 + Math.random() * 2),
            life: 1.0, decay: 0.04,
            color: item.color, size: 4
        });
    }

    switch (item.type) {
        case 'doubleJump':
            powerups.doubleJump.active = true;
            powerups.doubleJump.hasExtraJump = true;
            powerups.doubleJump.timer = 600;
            showStoryDialog('✦ 이중 점프 획득!', false);
            break;
        case 'speedBoost':
            powerups.speedBoost.active = true;
            powerups.speedBoost.timer = item.duration;
            showStoryDialog('✦ 스피드 부스트!', false);
            break;
        case 'shield':
            powerups.shield.active = true;
            powerups.shield.timer = 999999;
            showStoryDialog('✦ 실드 획득!', false);
            break;
        case 'slowMotion':
            powerups.slowMotion.active = true;
            powerups.slowMotion.timer = item.duration;
            showStoryDialog('✦ 슬로우 모션!', false);
            break;
    }
}

// ─── 파워업 타이머 업데이트 ───
function updatePowerups() {
    if (powerups.doubleJump.active) {
        if (powerups.doubleJump.timer > 0) powerups.doubleJump.timer--;
        else { powerups.doubleJump.active = false; powerups.doubleJump.hasExtraJump = false; }
    }
    if (powerups.speedBoost.active) {
        if (powerups.speedBoost.timer > 0) powerups.speedBoost.timer--;
        else powerups.speedBoost.active = false;
    }
    if (powerups.slowMotion.active) {
        if (powerups.slowMotion.timer > 0) powerups.slowMotion.timer--;
        else powerups.slowMotion.active = false;
    }
    // shield는 추락 1회 방지 시 소모
}

// ─── 아이템 렌더링 ───
function drawItems() {
    for (const item of items) {
        if (item.collected) continue;
        const screenY = item.y + cameraY + Math.sin(item.bobPhase) * 4;
        if (screenY < -40 || screenY > canvas.height + 40) continue;

        const cx = item.x + item.width / 2;
        const cy = screenY + item.height / 2;
        const glow = 8 + Math.sin(item.glowPhase) * 5;

        // 글로우 효과 (shadowBlur 대신 반투명 원으로 대체 - 성능 최적화)
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = item.color;
        ctx.beginPath();
        ctx.arc(cx, cy, 14 + glow * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        // 원형 배경
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.beginPath();
        ctx.arc(cx, cy, 14, 0, Math.PI * 2);
        ctx.fill();
        // 색상 테두리
        ctx.strokeStyle = item.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, 14, 0, Math.PI * 2);
        ctx.stroke();
        // 글리프
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.glyph, cx, cy);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
    }
}

// ─── 파워업 HUD ───
function drawPowerupHUD() {
    let hudY = 110;
    const hudX = 8;
    ctx.font = '10px monospace';
    ctx.textBaseline = 'middle';

    const actives = [];
    if (powerups.doubleJump.active) actives.push({ label: '2x JUMP', color: '#ffdd00', t: powerups.doubleJump.timer, max: 600 });
    if (powerups.speedBoost.active) actives.push({ label: 'SPEED',   color: '#ff6600', t: powerups.speedBoost.timer, max: 420 });
    if (powerups.shield.active)     actives.push({ label: 'SHIELD',  color: '#4488ff', t: -1, max: 1 });
    if (powerups.slowMotion.active) actives.push({ label: 'SLOW',    color: '#cc44ff', t: powerups.slowMotion.timer, max: 300 });

    for (const p of actives) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(hudX, hudY - 9, 72, 18);
        const ratio = p.t < 0 ? 1.0 : p.t / p.max;
        ctx.fillStyle = p.color;
        ctx.globalAlpha = 0.35;
        ctx.fillRect(hudX, hudY - 9, 72 * ratio, 18);
        ctx.globalAlpha = 1;
        ctx.fillStyle = p.color;
        const secStr = p.t > 0 ? ' ' + Math.ceil(p.t / 60) + 's' : '';
        ctx.fillText(p.label + secStr, hudX + 4, hudY);
        hudY += 22;
    }
    ctx.textBaseline = 'alphabetic';
}

// 충돌 감지
function checkCollision(rect1, rect2) {
    return rect1.x < rect2.x + rect2.width &&
           rect1.x + rect1.width > rect2.x &&
           rect1.y < rect2.y + rect2.height &&
           rect1.y + rect1.height > rect2.y;
}

// 플레이어가 블록 위에 착지하는지 체크 (월드 좌표계)
function checkLanding() {
    const playerBottom = player.y + player.height;
    const prevPlayerBottom = player.y + player.height - player.velocityY;

    // 바닥 체크
    if (playerBottom >= floor.y && player.velocityY >= 0) {
        player.y = floor.y - player.height;
        player.velocityY = 0;
        player.isOnGround = true;
        playSFX('landing');
        // 이중점프 착지 리셋
        if (powerups.doubleJump.active) powerups.doubleJump.hasExtraJump = true;
        // Physics animation on landing
        player.landingImpact = 1.0;
        player.squashStretch = 0.7;
        spawnLandingDust(player.x, player.y + player.height);
        triggerHitStop(3); // 바닥 착지 3프레임 동결
        return;
    }

    // 블록 체크 (월드 좌표 기준) — 플레이어 근처 블록만 검사
    for (const block of blocks) {
        if (block.disappeared) continue;
        // 수직 거리로 빠른 필터 (점프 최대 높이 범위 밖이면 스킵)
        if (block.y < player.y - 400 || block.y > player.y + 200) continue;

        const actualBlockX = block.type === 'moving' ? block.x + block.moveOffset : block.x;

        // Fake 블록은 가까워지면 사라짐
        if (block.type === 'fake') {
            const distToPlayer = Math.sqrt(
                Math.pow(player.x + player.width / 2 - (actualBlockX + block.width / 2), 2) +
                Math.pow(player.y + player.height / 2 - (block.y + block.height / 2), 2)
            );
            if (distToPlayer < 80) {
                continue; // 가짜 블록 무시
            }
        }

        // 수평으로 블록과 겹치는지 확인 (무빙 블록은 실제 위치 사용)
        const horizontalOverlap = player.x + player.width > actualBlockX && player.x < actualBlockX + block.width;

        if (!horizontalOverlap) continue;

        // 떨어지는 중 착지 체크
        if (player.velocityY >= 0 &&
            prevPlayerBottom <= block.y &&
            playerBottom >= block.y) {
            player.y = block.y - player.height;
            player.velocityY = 0;
            player.isOnGround = true;
            player.currentBlock = block; // 현재 서 있는 블록 추적
            playSFX('landing');

            // 이중점프 착지 리셋 (타이머가 남아있으면 재사용 가능)
            if (powerups.doubleJump.active) powerups.doubleJump.hasExtraJump = true;

            // Physics animation on landing
            player.landingImpact = 1.0;
            player.squashStretch = 0.7;
            spawnLandingDust(player.x, player.y + player.height);
            // 낙하 높이에 비례한 히트스톱
            const fallHeight = (player.lastGroundY - player.y) / 10;
            if (fallHeight > 20) triggerHitStop(Math.min(6, Math.floor(fallHeight / 15)));
            block.wobble = 1.0;

            // 크럼블링 블록 시작
            if (block.type === 'crumbling' && !block.isCrumbling) {
                block.isCrumbling = true;
                block.crumbleTimer = 0;
                screenShakeIntensity = 2;
                playSFX('crumble');
            }

            // 바운스 블록: 즉시 강하게 튕겨 오름
            if (block.type === 'bounce') {
                achievementStats.bounceLandings++;
                const bounceForce = MAX_JUMP_POWER * block.bounceMultiplier;
                player.velocityY = -bounceForce;
                player.isOnGround = false;
                player.currentBlock = null;
                player.squashStretch = 1.6;  // 위로 늘어나는 효과
                player.landingImpact = 1.0;
                triggerHitStop(2);
                screenShakeIntensity = 4;
                spawnLandingDust(player.x, player.y + player.height);
                // 바운스 파티클 (추가 효과)
                for (let i = 0; i < 8; i++) {
                    const angle = -Math.PI + (Math.random() * Math.PI);
                    impactParticles.push({
                        x: player.x + player.width / 2,
                        y: player.y + player.height,
                        vx: Math.cos(angle) * (2 + Math.random() * 3),
                        vy: Math.sin(angle) * 3 - 3,
                        life: 1.0, decay: 0.04,
                        color: '#00ff88', size: 3
                    });
                }
                playSFX('bounce_block');
                return;
            }

            // 얼음 블록: 착지음 살짝 다르게 (미끄러지는 효과)
            if (block.type === 'ice') {
                playSFX('ice_slide');
                // 착지 시 수평 속도 보존 (미끄러짐)
                // (velocityX는 그대로 유지, friction이 알아서 처리)
            }

            return;
        }
    }

    player.isOnGround = false;
    player.currentBlock = null;
}

// 벽 충돌 체크
function checkWallCollision() {
    // 왼쪽 벽
    if (player.x < 0) {
        player.x = 0;
        player.velocityX = 0;
    }
    // 오른쪽 벽
    if (player.x + player.width > canvas.width) {
        player.x = canvas.width - player.width;
        player.velocityX = 0;
    }
}

// 블록 측면 충돌 체크 (월드 좌표계)
function checkBlockSideCollision() {
    for (const block of blocks) {
        if (block.disappeared) continue;
        if (block.type === 'fake') continue;
        // 수직 거리로 빠른 필터
        if (block.y < player.y - 200 || block.y > player.y + 200) continue;

        const actualBlockX = block.type === 'moving' ? block.x + block.moveOffset : block.x;

        const blockRect = {
            x: actualBlockX,
            y: block.y,
            width: block.width,
            height: block.height
        };

        const playerRect = {
            x: player.x,
            y: player.y,
            width: player.width,
            height: player.height
        };

        if (checkCollision(playerRect, blockRect)) {
            // 위로 올라가는 중 머리 충돌
            if (player.velocityY < 0) {
                if (player.y < block.y + block.height &&
                    player.y + player.height > block.y + block.height) {
                    player.velocityY = 0;
                }
            }
        }
    }
}

// 게임 업데이트
function update() {
    // Lazy block generation - generate more blocks as player climbs
    generateMoreBlocks();

    // 아이템 & 파워업 업데이트
    updateItems();
    updatePowerups();

    // 업적 통계 업데이트
    achievementStats.maxHeight = maxHeight;
    achievementStats.timeElapsed++;
    checkAchievements();

    // Environment particles update
    updateEnvParticles();

    // Impact particles update
    updateImpactParticles();

    // Physics animations update
    updatePhysicsAnimation();

    // Lighting update
    updateLighting();

    // 포그 파티클 업데이트
    for (let fog of fogParticles) {
        fog.y += fog.speed;
        if (fog.y > canvas.height) {
            fog.y = -10;
            fog.x = Math.random() * canvas.width;
        }
    }

    // 블록 업데이트 (화면 근처 블록만 세부 애니메이션)
    for (let block of blocks) {
        const blockScreenY = block.y + cameraY;
        const isNearScreen = blockScreenY > -300 && blockScreenY < canvas.height + 300;

        if (block.type === 'moving') {
            block.moveOffset += block.moveSpeed * block.moveDirection;
            if (block.moveOffset > block.moveRange || block.moveOffset < -block.moveRange) {
                block.moveDirection *= -1;
            }
        }

        // 크럼블링 블록 업데이트
        if (block.type === 'crumbling' && block.isCrumbling) {
            block.crumbleTimer += 1;
            if (block.crumbleTimer > 60) { // 1초 후
                block.opacity = Math.max(0, 1 - (block.crumbleTimer - 60) / 30);
                if (block.crumbleTimer > 90) {
                    block.disappeared = true;
                }
            }
        }

        // 화면 근처 블록만 시각 애니메이션 업데이트 (성능 최적화)
        if (isNearScreen) {
            if (block.type === 'conveyor') {
                block.conveyorPhase = (block.conveyorPhase + 0.08) % 1.0;
            }
            if (block.type === 'bounce') {
                block.bouncePhase = (block.bouncePhase + 0.06) % (Math.PI * 2);
            }
            if (block.type === 'ice') {
                block.icePhase = (block.icePhase + 0.03) % (Math.PI * 2);
            }
        }

        // Block wobble decay - only for near-screen blocks to save processing
        if (block.wobble > 0 && isNearScreen) {
            block.wobble *= 0.9;
            if (block.wobble < 0.01) block.wobble = 0;
        }
    }

    // 글리치 타이머
    glitchTimer += 1;

    // 스크린 셰이크 감소
    screenShakeIntensity = Math.max(0, screenShakeIntensity - 0.15);

    // 코요테 타임 관리
    if (player.isOnGround) {
        player.coyoteTimer = COYOTE_TIME;
        player.wasOnGround = true;
        player.lastGroundY = player.y;
    } else {
        if (player.coyoteTimer > 0) player.coyoteTimer--;
    }

    // 점프 버퍼링
    if (player.jumpBufferTimer > 0) player.jumpBufferTimer--;

    // 서 있는 블록 상태 체크 (크럼블링 블록 사라짐 / 무빙 블록 따라가기)
    if (player.isOnGround && player.currentBlock) {
        const cb = player.currentBlock;
        // 크럼블링 블록이 사라지면 떨어짐
        if (cb.disappeared) {
            player.isOnGround = false;
            player.currentBlock = null;
        }
        // 무빙 블록 위에 서 있으면 함께 이동
        if (cb.type === 'moving' && !cb.disappeared) {
            player.x += cb.moveSpeed * cb.moveDirection;
            if (player.x < 0) player.x = 0;
            if (player.x + player.width > canvas.width) player.x = canvas.width - player.width;
        }

        // 컨베이어 블록 위에 서 있으면 방향으로 밀림
        if (cb.type === 'conveyor') {
            player.x += cb.conveyorDirection * cb.conveyorSpeed;
            if (player.x < 0) { player.x = 0; player.velocityX = 0; }
            if (player.x + player.width > canvas.width) { player.x = canvas.width - player.width; player.velocityX = 0; }
        }
    }

    // 점프 버퍼 체크 - 착지 시 버퍼된 점프 자동 실행
    if (player.isOnGround && player.jumpBufferTimer > 0 && !player.isCharging && keys.space) {
        player.isCharging = true;
        player.jumpPower = 0;
        player.jumpBufferTimer = 0;
        playSFX('jump_charge');
    }

    // 점프 충전
    if (player.isCharging && player.isOnGround) {
        player.jumpPower = Math.min(player.jumpPower + CHARGE_SPEED, MAX_JUMP_POWER);

        // 방향 설정
        if (keys.left) {
            player.direction = -1;
            player.facingRight = false;
        } else if (keys.right) {
            player.direction = 1;
            player.facingRight = true;
        } else {
            player.direction = 0;
        }
    }

    // 점프 실행 (스페이스 뗐을 때)
    if (!keys.space && player.isCharging && player.isOnGround && !gameEnded) {
        // 내기 모드에서 점프 횟수 체크
        if (gameMode === 'bet' && currentJumps >= maxJumps) {
            player.isCharging = false;
            player.jumpPower = 0;
            return;
        }

        playSFX('jump_release');
        player.velocityY = -player.jumpPower;
        player.velocityX = player.direction * HORIZONTAL_SPEED * (player.jumpPower / MAX_JUMP_POWER);
        player.isOnGround = false;
        player.isCharging = false;
        player.jumpPower = 0;
        // Physics animation on jump
        player.squashStretch = 1.3;
        // 업적 통계
        achievementStats.totalJumps++;

        // 내기 모드에서 점프 카운트 증가
        if (gameMode === 'bet') {
            currentJumps++;
            updateJumpCountDisplay();

            // 점프 횟수 소진 시 게임 종료 예약
            if (currentJumps >= maxJumps) {
                setTimeout(checkGameEnd, 100);
            }
        }
    }

    // 슬로우 모션 계수
    const slowFactor = powerups.slowMotion.active ? 0.45 : 1.0;

    // 중력 적용
    if (!player.isOnGround) {
        player.velocityY += GRAVITY * slowFactor;

        // 가변 점프 높이 - 스페이스바를 빨리 떼면 낮게 점프
        if (!keys.space && player.velocityY < 0) {
            player.velocityY += GRAVITY * VARIABLE_JUMP_MULTIPLIER * slowFactor;
        }
    }

    // 공중에서 방향키 제어 (약간의 움직임)
    if (!player.isOnGround) {
        const airControlForce = AIR_CONTROL * slowFactor;
        if (keys.left) {
            player.velocityX = Math.max(player.velocityX - airControlForce, -HORIZONTAL_SPEED * 1.2);
            player.facingRight = false;
        }
        if (keys.right) {
            player.velocityX = Math.min(player.velocityX + airControlForce, HORIZONTAL_SPEED * 1.2);
            player.facingRight = true;
        }
    }

    // 스피드 부스트: 이동 중일 때 속도 증폭
    if (powerups.speedBoost.active) {
        const boostedSpeed = HORIZONTAL_SPEED * 1.7;
        if (keys.left && player.velocityX > -boostedSpeed) {
            player.velocityX = -boostedSpeed;
        }
        if (keys.right && player.velocityX < boostedSpeed) {
            player.velocityX = boostedSpeed;
        }
    }

    // 위치 업데이트 (슬로우모션 적용)
    player.x += player.velocityX * slowFactor;
    player.y += player.velocityY * slowFactor;

    // 걷기 사이클 업데이트
    if (player.isOnGround && Math.abs(player.velocityX) > 0.5) {
        player.isMoving = true;
        player.walkCycle += 0.15;
    } else {
        player.isMoving = false;
    }

    // 발소리 효과
    if (player.isOnGround && Math.abs(player.velocityX) > 1 && Math.random() < 0.1) {
        playSFX('footstep');
    }

    // Wind rush sound when falling fast
    if (player.velocityY > 10 && !player.isOnGround && Math.random() < 0.1) {
        playSFX('wind_rush');
    }

    // 공중에서 마찰
    if (!player.isOnGround) {
        player.velocityX *= AIR_FRICTION;
    } else {
        // 얼음 블록은 마찰 거의 없음 (미끄러움)
        const isOnIce = player.currentBlock && player.currentBlock.type === 'ice';
        const friction = isOnIce ? 0.998 : GROUND_FRICTION;
        player.velocityX *= friction;
        if (!isOnIce && Math.abs(player.velocityX) < 0.1) player.velocityX = 0;
    }

    // 충돌 체크
    checkWallCollision();
    checkBlockSideCollision();
    checkLanding();

    // 체크포인트 이하로 떨어졌을 때 리스폰
    if (player.isOnGround && (WORLD_FLOOR_Y - player.y - player.height) / 10 < 5) {
        // 실드: 추락 1회 방지 → 체크포인트로 리스폰
        if (powerups.shield.active) {
            powerups.shield.active = false;
            screenShakeIntensity = 5;
            showStoryDialog('✦ 실드가 추락을 막았습니다!', false);
            if (lastCheckpointHeight > 0) respawnAtCheckpoint();
            else {
                // 체크포인트 없으면 시작 위치로
                player.y = WORLD_FLOOR_Y - 140;
                player.x = canvas.width / 2 - 15;
                player.velocityY = -8;
            }
        } else if (lastCheckpointHeight > 0) {
            if (respawnAtCheckpoint()) {
                showStoryDialog('체크포인트에서 다시 시작합니다...', false);
            }
        }
    }

    // 향상된 카메라 시스템 - 데드존 + 룩어헤드
    const CAMERA_DEAD_ZONE_TOP = canvas.height * 0.35;
    const CAMERA_DEAD_ZONE_BOTTOM = canvas.height * 0.65;
    const LOOK_AHEAD_AMOUNT = 80;

    const playerScreenY = player.y + cameraY;
    let targetCameraY = cameraY;

    // 데드존: 플레이어가 데드존을 벗어날 때만 카메라 이동
    if (playerScreenY < CAMERA_DEAD_ZONE_TOP) {
        targetCameraY = CAMERA_DEAD_ZONE_TOP - player.y;
    } else if (playerScreenY > CAMERA_DEAD_ZONE_BOTTOM) {
        targetCameraY = CAMERA_DEAD_ZONE_BOTTOM - player.y;
    }

    // 룩어헤드: 이동 방향으로 카메라 약간 선행
    if (player.velocityY < -5) {
        targetCameraY += LOOK_AHEAD_AMOUNT; // 위로 올라갈 때 위를 더 보여줌
    } else if (player.velocityY > 8) {
        targetCameraY -= LOOK_AHEAD_AMOUNT * 0.5; // 떨어질 때 아래를 더 보여줌
    }

    // 부드러운 카메라 추적 (상승 시 더 빠르게)
    const cameraSmoothness = player.velocityY < 0 ? 0.12 : 0.08;
    cameraY += (targetCameraY - cameraY) * cameraSmoothness;

    // 착지 카메라 드롭 효과
    if (player.landingImpact > 0.5) {
        cameraY -= player.landingImpact * 6;
    }

    // 최대 높이 업데이트 (바닥 기준)
    const currentHeight = Math.floor((WORLD_FLOOR_Y - player.y - player.height) / 10);
    if (currentHeight > maxHeight) {
        maxHeight = currentHeight;
        checkStoryMilestone(currentHeight);
        checkCheckpoint(currentHeight);
    }

    // UI 업데이트
    document.getElementById('height').textContent = Math.max(0, currentHeight);
    document.getElementById('power-bar').style.width = (player.jumpPower / MAX_JUMP_POWER * 100) + '%';

    // Update BGM
    updateBGM();
    updateAmbientSounds();
}

// ===== FEATURE 1: STORY SYSTEM =====

// ===== 체크포인트 시스템 =====
function checkCheckpoint(height) {
    for (const cpHeight of CHECKPOINT_HEIGHTS) {
        if (height >= cpHeight && lastCheckpointHeight < cpHeight) {
            lastCheckpointHeight = cpHeight;
            checkpointFlashTimer = 120; // 2초간 플래시
            showCheckpointNotice(cpHeight);
            playSFX('achievement');
            // 체크포인트 저장
            sessionStorage.setItem('jj_checkpoint', JSON.stringify({
                height: cpHeight,
                blockIndex: findNearestBlockIndex(cpHeight)
            }));
        }
    }
}

function findNearestBlockIndex(targetHeight) {
    // 목표 높이에 가장 가까운 블록 인덱스 찾기
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < blocks.length; i++) {
        const bh = Math.floor((WORLD_FLOOR_Y - blocks[i].y - blocks[i].height) / 10);
        const dist = Math.abs(bh - targetHeight);
        if (dist < bestDist) { bestDist = dist; best = i; }
    }
    return best;
}

function showCheckpointNotice(height) {
    const existing = document.getElementById('checkpoint-notice');
    if (existing) existing.remove();

    const notice = document.createElement('div');
    notice.id = 'checkpoint-notice';
    notice.innerHTML = `<span class="cp-icon">✦</span> 체크포인트 저장 <span class="cp-height">${height}m</span>`;
    notice.style.cssText = `
        position: fixed; top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0,0,0,0.85);
        border: 2px solid #4a7878;
        border-radius: 8px; padding: 12px 30px;
        color: #4a7878; font-size: 16px; font-weight: bold;
        font-family: Arial, sans-serif; z-index: 2000;
        letter-spacing: 2px; text-transform: uppercase;
        box-shadow: 0 0 30px rgba(74,120,120,0.6);
        animation: cpFlash 2.5s ease-in-out forwards;
        pointer-events: none;
    `;
    if (!document.querySelector('style[data-cp]')) {
        const s = document.createElement('style');
        s.setAttribute('data-cp','true');
        s.textContent = `
            @keyframes cpFlash {
                0%   { opacity:0; transform:translate(-50%,-50%) scale(0.8); }
                15%  { opacity:1; transform:translate(-50%,-50%) scale(1.05); }
                80%  { opacity:1; transform:translate(-50%,-50%) scale(1); }
                100% { opacity:0; transform:translate(-50%,-50%) scale(1); }
            }
            .cp-icon { color:#6a4a5a; margin-right:8px; }
            .cp-height { color:#7a9aaa; margin-left:8px; }
        `;
        document.head.appendChild(s);
    }
    document.body.appendChild(notice);
    setTimeout(() => notice.remove(), 2500);
}

function respawnAtCheckpoint() {
    const saved = sessionStorage.getItem('jj_checkpoint');
    if (!saved) return false;
    const cp = JSON.parse(saved);
    const idx = Math.min(cp.blockIndex, blocks.length - 1);
    const block = blocks[idx];
    if (!block) return false;

    player.x = block.x + block.width / 2 - player.width / 2;
    player.y = block.y - player.height;
    player.velocityX = 0;
    player.velocityY = 0;
    player.isOnGround = true;
    player.isCharging = false;
    player.jumpPower = 0;
    player.coyoteTimer = 0;
    player.jumpBufferTimer = 0;
    screenShakeIntensity = 0;
    return true;
}

function checkStoryMilestone(height) {
    // 기본 스토리 마일스톤
    if (storyMilestones[height] && !shownStories.has(height)) {
        shownStories.add(height);
        showStoryDialog(storyMilestones[height]);
    }

    // 캐릭터별 추가 대사
    if (characterDialogues[selectedCharacter] &&
        characterDialogues[selectedCharacter][height] &&
        !shownStories.has('char_' + height)) {
        shownStories.add('char_' + height);
        // 기본 대사 1.5초 후에 캐릭터 대사 표시
        setTimeout(() => {
            showStoryDialog(characterDialogues[selectedCharacter][height], true);
        }, storyMilestones[height] ? 2000 : 0);
    }

    // 환경 단서 체크
    if (environmentalClues[height] && !shownStories.has('env_' + height)) {
        shownStories.add('env_' + height);
        showEnvironmentalClue(environmentalClues[height]);
    }
}

function showStoryDialog(text, isCharacterLine = false) {
    playSFX('story_appear');
    // 기존 다이얼로그 제거 (캐릭터 대사가 아닌 경우만)
    if (!isCharacterLine) {
        const existingDialog = document.getElementById('story-dialog');
        if (existingDialog) existingDialog.remove();
    }

    const dialog = document.createElement('div');
    dialog.id = isCharacterLine ? 'character-dialog' : 'story-dialog';

    const borderColor = isCharacterLine ? '#4a7878' : '#ff6699';
    const shadowColor = isCharacterLine ? 'rgba(74, 120, 120, 0.5)' : 'rgba(255, 102, 153, 0.5)';
    const bottomPos = isCharacterLine ? '80px' : '20px';

    dialog.style.cssText = `
        position: fixed;
        bottom: ${bottomPos};
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.9);
        border: 2px solid ${borderColor};
        border-radius: 8px;
        padding: 15px 25px;
        color: ${isCharacterLine ? '#b0d0d0' : '#fff'};
        font-size: ${isCharacterLine ? '13px' : '14px'};
        font-style: ${isCharacterLine ? 'italic' : 'normal'};
        line-height: 1.6;
        max-width: 420px;
        text-align: center;
        font-family: Arial, sans-serif;
        z-index: ${isCharacterLine ? 1001 : 1000};
        box-shadow: 0 0 20px ${shadowColor};
        animation: fadeInOut 5s ease-in-out;
    `;
    dialog.textContent = text;

    if (!document.querySelector('style[data-story]')) {
        const style = document.createElement('style');
        style.setAttribute('data-story', 'true');
        style.textContent = `
            @keyframes fadeInOut {
                0% { opacity: 0; transform: translateX(-50%) translateY(20px); }
                10% { opacity: 1; transform: translateX(-50%) translateY(0); }
                85% { opacity: 1; transform: translateX(-50%) translateY(0); }
                100% { opacity: 0; transform: translateX(-50%) translateY(20px); }
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(dialog);

    const duration = isCharacterLine ? 4000 : 5000;
    setTimeout(() => { dialog.remove(); }, duration);
}

// 환경 단서 시각 효과
function showEnvironmentalClue(clue) {
    const indicator = document.createElement('div');
    indicator.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        color: #7a6a4a;
        font-size: 12px;
        font-family: Arial, sans-serif;
        text-transform: uppercase;
        letter-spacing: 3px;
        opacity: 0;
        z-index: 999;
        animation: clueAppear 3s ease-in-out;
        pointer-events: none;
        text-shadow: 0 0 10px rgba(122, 106, 74, 0.5);
    `;
    indicator.textContent = `[ ${clue.desc} 발견 ]`;

    if (!document.querySelector('style[data-clue]')) {
        const style = document.createElement('style');
        style.setAttribute('data-clue', 'true');
        style.textContent = `
            @keyframes clueAppear {
                0% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
                20% { opacity: 0.8; transform: translate(-50%, -50%) scale(1); }
                80% { opacity: 0.8; transform: translate(-50%, -50%) scale(1); }
                100% { opacity: 0; transform: translate(-50%, -50%) scale(1.1); }
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(indicator);
    setTimeout(() => { indicator.remove(); }, 3000);
}

// ===== PIXEL ART HELPER FUNCTIONS =====
function drawPixel(x, y, color, size) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, size, size);
}

function drawPixelArt(baseX, baseY, pixelSize, spriteData) {
    for (let row = 0; row < spriteData.length; row++) {
        for (let col = 0; col < spriteData[row].length; col++) {
            if (spriteData[row][col]) {
                ctx.fillStyle = spriteData[row][col];
                ctx.fillRect(baseX + col * pixelSize, baseY + row * pixelSize, pixelSize, pixelSize);
            }
        }
    }
}

// Get scare level based on zone
function getScareLevel() {
    const zone = getCurrentZone();
    if (zone <= 1) return 0; // Normal
    if (zone <= 3) return 1; // Scared
    if (zone <= 6) return 2; // Very scared
    return 3; // Terrified
}

// ===== HUMAN CHARACTER (PIXEL ART) =====
function drawHuman(screenY) {
    const scareLevel = getScareLevel();
    const pixelSize = 2;
    const baseX = player.x;
    const baseY = screenY;
    const dir = player.facingRight ? 1 : -1;

    // Simplified pixel art human (15x20 pixels = 30x40 on screen)
    // Hair
    drawPixel(baseX + 3*pixelSize, baseY + 0*pixelSize, '#3a2a1a', pixelSize);
    drawPixel(baseX + 4*pixelSize, baseY + 0*pixelSize, '#3a2a1a', pixelSize);
    drawPixel(baseX + 5*pixelSize, baseY + 0*pixelSize, '#3a2a1a', pixelSize);
    drawPixel(baseX + 6*pixelSize, baseY + 0*pixelSize, '#3a2a1a', pixelSize);
    drawPixel(baseX + 7*pixelSize, baseY + 0*pixelSize, '#3a2a1a', pixelSize);
    drawPixel(baseX + 8*pixelSize, baseY + 0*pixelSize, '#3a2a1a', pixelSize);
    drawPixel(baseX + 9*pixelSize, baseY + 0*pixelSize, '#3a2a1a', pixelSize);
    drawPixel(baseX + 10*pixelSize, baseY + 0*pixelSize, '#3a2a1a', pixelSize);
    drawPixel(baseX + 11*pixelSize, baseY + 0*pixelSize, '#3a2a1a', pixelSize);

    // Hair second row
    drawPixel(baseX + 2*pixelSize, baseY + 1*pixelSize, '#3a2a1a', pixelSize);
    drawPixel(baseX + 3*pixelSize, baseY + 1*pixelSize, '#3a2a1a', pixelSize);
    drawPixel(baseX + 4*pixelSize, baseY + 1*pixelSize, '#3a2a1a', pixelSize);
    drawPixel(baseX + 5*pixelSize, baseY + 1*pixelSize, '#1a1a1a', pixelSize);
    drawPixel(baseX + 6*pixelSize, baseY + 1*pixelSize, '#3a2a1a', pixelSize);
    drawPixel(baseX + 7*pixelSize, baseY + 1*pixelSize, '#3a2a1a', pixelSize);
    drawPixel(baseX + 8*pixelSize, baseY + 1*pixelSize, '#1a1a1a', pixelSize);
    drawPixel(baseX + 9*pixelSize, baseY + 1*pixelSize, '#3a2a1a', pixelSize);
    drawPixel(baseX + 10*pixelSize, baseY + 1*pixelSize, '#3a2a1a', pixelSize);
    drawPixel(baseX + 11*pixelSize, baseY + 1*pixelSize, '#3a2a1a', pixelSize);
    drawPixel(baseX + 12*pixelSize, baseY + 1*pixelSize, '#3a2a1a', pixelSize);

    // Face - skin tone (lighter)
    drawPixel(baseX + 3*pixelSize, baseY + 2*pixelSize, '#d4a574', pixelSize);
    drawPixel(baseX + 4*pixelSize, baseY + 2*pixelSize, '#d4a574', pixelSize);
    drawPixel(baseX + 5*pixelSize, baseY + 2*pixelSize, '#d4a574', pixelSize);
    drawPixel(baseX + 6*pixelSize, baseY + 2*pixelSize, '#d4a574', pixelSize);
    drawPixel(baseX + 7*pixelSize, baseY + 2*pixelSize, '#d4a574', pixelSize);
    drawPixel(baseX + 8*pixelSize, baseY + 2*pixelSize, '#d4a574', pixelSize);
    drawPixel(baseX + 9*pixelSize, baseY + 2*pixelSize, '#d4a574', pixelSize);
    drawPixel(baseX + 10*pixelSize, baseY + 2*pixelSize, '#d4a574', pixelSize);
    drawPixel(baseX + 11*pixelSize, baseY + 2*pixelSize, '#d4a574', pixelSize);
    drawPixel(baseX + 12*pixelSize, baseY + 2*pixelSize, '#d4a574', pixelSize);

    // Face row 2
    for (let i = 3; i < 13; i++) {
        drawPixel(baseX + i*pixelSize, baseY + 3*pixelSize, '#d4a574', pixelSize);
    }

    // Eyes - based on scare level and blinking
    if (!player.isBlinking) {
        if (scareLevel === 0) {
            // Normal eyes - closed/neutral
            drawPixel(baseX + 5*pixelSize, baseY + 3*pixelSize, '#1a1a1a', pixelSize);
            drawPixel(baseX + 9*pixelSize, baseY + 3*pixelSize, '#1a1a1a', pixelSize);
        } else if (scareLevel <= 1) {
            // Slightly scared - small pupils
            drawPixel(baseX + 5*pixelSize, baseY + 3*pixelSize, '#ffffff', pixelSize);
            drawPixel(baseX + 9*pixelSize, baseY + 3*pixelSize, '#ffffff', pixelSize);
            drawPixel(baseX + 5*pixelSize, baseY + 4*pixelSize, '#1a1a1a', pixelSize);
            drawPixel(baseX + 9*pixelSize, baseY + 4*pixelSize, '#1a1a1a', pixelSize);
        } else {
            // Very scared - wide eyes
            drawPixel(baseX + 4*pixelSize, baseY + 3*pixelSize, '#ffffff', pixelSize);
            drawPixel(baseX + 5*pixelSize, baseY + 3*pixelSize, '#ffffff', pixelSize);
            drawPixel(baseX + 8*pixelSize, baseY + 3*pixelSize, '#ffffff', pixelSize);
            drawPixel(baseX + 9*pixelSize, baseY + 3*pixelSize, '#ffffff', pixelSize);
            drawPixel(baseX + 4*pixelSize, baseY + 4*pixelSize, '#1a1a1a', pixelSize);
            drawPixel(baseX + 5*pixelSize, baseY + 4*pixelSize, '#1a1a1a', pixelSize);
            drawPixel(baseX + 8*pixelSize, baseY + 4*pixelSize, '#1a1a1a', pixelSize);
            drawPixel(baseX + 9*pixelSize, baseY + 4*pixelSize, '#1a1a1a', pixelSize);
        }
    }

    // Mouth - based on scare level
    if (scareLevel === 0) {
        // Normal - line
        drawPixel(baseX + 5*pixelSize, baseY + 6*pixelSize, '#8a5a3a', pixelSize);
        drawPixel(baseX + 6*pixelSize, baseY + 6*pixelSize, '#8a5a3a', pixelSize);
        drawPixel(baseX + 7*pixelSize, baseY + 6*pixelSize, '#8a5a3a', pixelSize);
        drawPixel(baseX + 8*pixelSize, baseY + 6*pixelSize, '#8a5a3a', pixelSize);
        drawPixel(baseX + 9*pixelSize, baseY + 6*pixelSize, '#8a5a3a', pixelSize);
    } else if (scareLevel === 1) {
        // Worried - O shape
        drawPixel(baseX + 6*pixelSize, baseY + 6*pixelSize, '#8a5a3a', pixelSize);
        drawPixel(baseX + 7*pixelSize, baseY + 6*pixelSize, '#8a5a3a', pixelSize);
        drawPixel(baseX + 8*pixelSize, baseY + 6*pixelSize, '#8a5a3a', pixelSize);
        drawPixel(baseX + 6*pixelSize, baseY + 7*pixelSize, '#8a5a3a', pixelSize);
        drawPixel(baseX + 8*pixelSize, baseY + 7*pixelSize, '#8a5a3a', pixelSize);
    } else {
        // Terrified - open mouth
        for (let i = 6; i <= 8; i++) {
            drawPixel(baseX + i*pixelSize, baseY + 6*pixelSize, '#8a5a3a', pixelSize);
        }
        drawPixel(baseX + 6*pixelSize, baseY + 7*pixelSize, '#8a5a3a', pixelSize);
        drawPixel(baseX + 8*pixelSize, baseY + 7*pixelSize, '#8a5a3a', pixelSize);
        drawPixel(baseX + 7*pixelSize, baseY + 8*pixelSize, '#8a5a3a', pixelSize);
    }

    // Jacket - dark green
    for (let row = 8; row < 16; row++) {
        for (let col = 2; col < 13; col++) {
            drawPixel(baseX + col*pixelSize, baseY + row*pixelSize, '#2a3a2a', pixelSize);
        }
    }

    // Jacket shading (darker on left side for volume)
    if (player.facingRight) {
        for (let row = 8; row < 12; row++) {
            drawPixel(baseX + 2*pixelSize, baseY + row*pixelSize, '#1a2a1a', pixelSize);
        }
    } else {
        for (let row = 8; row < 12; row++) {
            drawPixel(baseX + 12*pixelSize, baseY + row*pixelSize, '#1a2a1a', pixelSize);
        }
    }

    // Jacket details - pockets
    drawPixel(baseX + 4*pixelSize, baseY + 10*pixelSize, '#1a2a1a', pixelSize);
    drawPixel(baseX + 10*pixelSize, baseY + 10*pixelSize, '#1a2a1a', pixelSize);

    // Arms - swing animation
    const armSwing = player.isMoving ? Math.sin(player.walkCycle) * 3 : 0;
    if (!player.isOnGround) {
        // Arms up while jumping
        drawPixel(baseX + 1*pixelSize, baseY + 9*pixelSize, '#2a3a2a', pixelSize);
        drawPixel(baseX + 13*pixelSize, baseY + 9*pixelSize, '#2a3a2a', pixelSize);
        drawPixel(baseX + 0*pixelSize, baseY + 8*pixelSize, '#d4a574', pixelSize);
        drawPixel(baseX + 14*pixelSize, baseY + 8*pixelSize, '#d4a574', pixelSize);
    } else {
        // Normal arm position with walk swing
        drawPixel(baseX + 1*pixelSize, baseY + (11 + armSwing)*pixelSize, '#2a3a2a', pixelSize);
        drawPixel(baseX + 13*pixelSize, baseY + (11 - armSwing)*pixelSize, '#2a3a2a', pixelSize);
        drawPixel(baseX + 0*pixelSize, baseY + (12 + armSwing)*pixelSize, '#d4a574', pixelSize);
        drawPixel(baseX + 14*pixelSize, baseY + (12 - armSwing)*pixelSize, '#d4a574', pixelSize);
    }

    // Belt buckle - metallic gold
    drawPixel(baseX + 6*pixelSize, baseY + 14*pixelSize, '#ffaa00', pixelSize);
    drawPixel(baseX + 7*pixelSize, baseY + 14*pixelSize, '#ffaa00', pixelSize);
    drawPixel(baseX + 8*pixelSize, baseY + 14*pixelSize, '#ffaa00', pixelSize);

    // Pants - dark brown
    for (let row = 16; row < 19; row++) {
        for (let col = 3; col < 12; col++) {
            drawPixel(baseX + col*pixelSize, baseY + row*pixelSize, '#3a3020', pixelSize);
        }
    }

    // Pants shading
    if (player.facingRight) {
        for (let row = 16; row < 18; row++) {
            drawPixel(baseX + 3*pixelSize, baseY + row*pixelSize, '#2a2010', pixelSize);
        }
    } else {
        for (let row = 16; row < 18; row++) {
            drawPixel(baseX + 11*pixelSize, baseY + row*pixelSize, '#2a2010', pixelSize);
        }
    }

    // Boots - animated walk cycle
    const walkOffset = player.isMoving ? Math.sin(player.walkCycle) * 2 : 0;
    drawPixel(baseX + (4 + walkOffset)*pixelSize, baseY + 19*pixelSize, '#1a1a1a', pixelSize);
    drawPixel(baseX + (10 - walkOffset)*pixelSize, baseY + 19*pixelSize, '#1a1a1a', pixelSize);

    // Walking dust effect
    if (player.isOnGround && player.isMoving) {
        const walkPhase = Math.sin(player.walkCycle || 0);
        if (Math.abs(walkPhase) > 0.8 && Math.random() < 0.3) {
            impactParticles.push({
                x: baseX + 7*pixelSize,
                y: baseY + 20*pixelSize,
                vx: (Math.random() - 0.5) * 1,
                vy: -Math.random() * 0.5,
                size: 1 + Math.random(),
                life: 0.5,
                decay: 0.05,
                color: '#6a5a4a'
            });
        }
    }
}

// ===== SKELETON CHARACTER (PIXEL ART) =====
function drawSkeleton(screenY) {
    const scareLevel = getScareLevel();
    const pixelSize = 2;
    const baseX = player.x;
    const baseY = screenY;

    // Skull - off white
    for (let row = 0; row < 5; row++) {
        for (let col = 4; col < 11; col++) {
            if ((row === 0 && col > 4 && col < 10) ||
                (row === 1 && col > 3 && col < 11) ||
                (row === 2 && col > 3 && col < 11) ||
                (row === 3 && col > 4 && col < 10) ||
                (row === 4 && col === 5 || col === 9)) {
                drawPixel(baseX + col*pixelSize, baseY + row*pixelSize, '#e8e0d0', pixelSize);
            }
        }
    }

    // Eyes - dark sockets (with blinking)
    if (!player.isBlinking) {
        if (scareLevel === 0) {
            drawPixel(baseX + 5*pixelSize, baseY + 2*pixelSize, '#1a1a1a', pixelSize);
            drawPixel(baseX + 9*pixelSize, baseY + 2*pixelSize, '#1a1a1a', pixelSize);
        } else if (scareLevel <= 1) {
            drawPixel(baseX + 5*pixelSize, baseY + 2*pixelSize, '#cc6666', pixelSize);
            drawPixel(baseX + 9*pixelSize, baseY + 2*pixelSize, '#cc6666', pixelSize);
        } else {
            drawPixel(baseX + 4*pixelSize, baseY + 2*pixelSize, '#ff0000', pixelSize);
            drawPixel(baseX + 5*pixelSize, baseY + 2*pixelSize, '#ff0000', pixelSize);
            drawPixel(baseX + 9*pixelSize, baseY + 2*pixelSize, '#ff0000', pixelSize);
            drawPixel(baseX + 10*pixelSize, baseY + 2*pixelSize, '#ff0000', pixelSize);
        }
    }

    // Nose - dark
    drawPixel(baseX + 7*pixelSize, baseY + 3*pixelSize, '#1a1a1a', pixelSize);

    // Teeth/Jaw - based on scare
    const teethY = scareLevel <= 1 ? 4 : 5;
    for (let col = 5; col < 10; col++) {
        drawPixel(baseX + col*pixelSize, baseY + teethY*pixelSize, '#e8e0d0', pixelSize);
    }

    // Spine/Ribcage - light grey
    drawPixel(baseX + 7*pixelSize, baseY + 6*pixelSize, '#c0b8a8', pixelSize);
    drawPixel(baseX + 7*pixelSize, baseY + 7*pixelSize, '#c0b8a8', pixelSize);
    drawPixel(baseX + 7*pixelSize, baseY + 8*pixelSize, '#c0b8a8', pixelSize);
    drawPixel(baseX + 7*pixelSize, baseY + 9*pixelSize, '#c0b8a8', pixelSize);
    drawPixel(baseX + 7*pixelSize, baseY + 10*pixelSize, '#c0b8a8', pixelSize);

    // Ribs
    drawPixel(baseX + 5*pixelSize, baseY + 7*pixelSize, '#c0b8a8', pixelSize);
    drawPixel(baseX + 9*pixelSize, baseY + 7*pixelSize, '#c0b8a8', pixelSize);
    drawPixel(baseX + 5*pixelSize, baseY + 9*pixelSize, '#c0b8a8', pixelSize);
    drawPixel(baseX + 9*pixelSize, baseY + 9*pixelSize, '#c0b8a8', pixelSize);

    // Arms - bone
    drawPixel(baseX + 3*pixelSize, baseY + 7*pixelSize, '#e8e0d0', pixelSize);
    drawPixel(baseX + 11*pixelSize, baseY + 7*pixelSize, '#e8e0d0', pixelSize);

    // Legs - bone
    drawPixel(baseX + 5*pixelSize, baseY + 16*pixelSize, '#e8e0d0', pixelSize);
    drawPixel(baseX + 9*pixelSize, baseY + 16*pixelSize, '#e8e0d0', pixelSize);
    drawPixel(baseX + 5*pixelSize, baseY + 17*pixelSize, '#e8e0d0', pixelSize);
    drawPixel(baseX + 9*pixelSize, baseY + 17*pixelSize, '#e8e0d0', pixelSize);
    drawPixel(baseX + 5*pixelSize, baseY + 18*pixelSize, '#e8e0d0', pixelSize);
    drawPixel(baseX + 9*pixelSize, baseY + 18*pixelSize, '#e8e0d0', pixelSize);
    drawPixel(baseX + 5*pixelSize, baseY + 19*pixelSize, '#e8e0d0', pixelSize);
    drawPixel(baseX + 9*pixelSize, baseY + 19*pixelSize, '#e8e0d0', pixelSize);

    // Bone cracks - dark lines for damage/detail
    drawPixel(baseX + 4*pixelSize, baseY + 1*pixelSize, '#4a3a2a', pixelSize);
    drawPixel(baseX + 9*pixelSize, baseY + 1*pixelSize, '#4a3a2a', pixelSize);
    drawPixel(baseX + 7*pixelSize, baseY + 8*pixelSize, '#4a3a2a', pixelSize);
    drawPixel(baseX + 7*pixelSize, baseY + 11*pixelSize, '#4a3a2a', pixelSize);
}

// ===== DOG CHARACTER (PIXEL ART) =====
function drawDog(screenY) {
    const scareLevel = getScareLevel();
    const pixelSize = 2;
    const baseX = player.x;
    const baseY = screenY;

    // Body - golden brown
    for (let row = 8; row < 18; row++) {
        for (let col = 3; col < 12; col++) {
            drawPixel(baseX + col*pixelSize, baseY + row*pixelSize, '#c4a050', pixelSize);
        }
    }

    // Body shading (darker side for volume)
    if (player.facingRight) {
        for (let row = 8; row < 16; row++) {
            drawPixel(baseX + 3*pixelSize, baseY + row*pixelSize, '#a08030', pixelSize);
        }
    } else {
        for (let row = 8; row < 16; row++) {
            drawPixel(baseX + 11*pixelSize, baseY + row*pixelSize, '#a08030', pixelSize);
        }
    }

    // Head
    for (let row = 2; row < 9; row++) {
        for (let col = 5; col < 10; col++) {
            drawPixel(baseX + col*pixelSize, baseY + row*pixelSize, '#c4a050', pixelSize);
        }
    }

    // Ears - position based on scare
    if (scareLevel <= 1) {
        // Ears up
        drawPixel(baseX + 4*pixelSize, baseY + 3*pixelSize, '#8a6a30', pixelSize);
        drawPixel(baseX + 4*pixelSize, baseY + 4*pixelSize, '#8a6a30', pixelSize);
        drawPixel(baseX + 10*pixelSize, baseY + 3*pixelSize, '#8a6a30', pixelSize);
        drawPixel(baseX + 10*pixelSize, baseY + 4*pixelSize, '#8a6a30', pixelSize);
    } else {
        // Ears back/flattened
        drawPixel(baseX + 4*pixelSize, baseY + 2*pixelSize, '#8a6a30', pixelSize);
        drawPixel(baseX + 10*pixelSize, baseY + 2*pixelSize, '#8a6a30', pixelSize);
    }

    // Eyes - dark (with blinking)
    if (!player.isBlinking) {
        drawPixel(baseX + 5*pixelSize, baseY + 4*pixelSize, '#3a2010', pixelSize);
        drawPixel(baseX + 9*pixelSize, baseY + 4*pixelSize, '#3a2010', pixelSize);
    }

    // Nose - black
    drawPixel(baseX + 7*pixelSize, baseY + 5*pixelSize, '#1a1a1a', pixelSize);

    // Tail - up normally, tucked when scared
    if (scareLevel <= 1) {
        // Tail up
        drawPixel(baseX + 2*pixelSize, baseY + 10*pixelSize, '#c4a050', pixelSize);
        drawPixel(baseX + 2*pixelSize, baseY + 9*pixelSize, '#c4a050', pixelSize);
        drawPixel(baseX + 2*pixelSize, baseY + 8*pixelSize, '#c4a050', pixelSize);
        drawPixel(baseX + 3*pixelSize, baseY + 7*pixelSize, '#c4a050', pixelSize);
    } else {
        // Tail tucked down
        drawPixel(baseX + 2*pixelSize, baseY + 15*pixelSize, '#c4a050', pixelSize);
        drawPixel(baseX + 2*pixelSize, baseY + 16*pixelSize, '#c4a050', pixelSize);
    }

    // Collar - red
    drawPixel(baseX + 5*pixelSize, baseY + 8*pixelSize, '#cc2222', pixelSize);
    drawPixel(baseX + 6*pixelSize, baseY + 8*pixelSize, '#cc2222', pixelSize);
    drawPixel(baseX + 7*pixelSize, baseY + 8*pixelSize, '#cc2222', pixelSize);
    drawPixel(baseX + 8*pixelSize, baseY + 8*pixelSize, '#cc2222', pixelSize);
    drawPixel(baseX + 9*pixelSize, baseY + 8*pixelSize, '#cc2222', pixelSize);

    // Collar tag - small metallic square
    drawPixel(baseX + 7*pixelSize, baseY + 9*pixelSize, '#7a6a3a', pixelSize);

    // Paws - toe pads
    drawPixel(baseX + 4*pixelSize, baseY + 18*pixelSize, '#e0e0e0', pixelSize);
    drawPixel(baseX + 8*pixelSize, baseY + 18*pixelSize, '#e0e0e0', pixelSize);
}

// ===== CAT CHARACTER (PIXEL ART) =====
function drawCat(screenY) {
    const scareLevel = getScareLevel();
    const pixelSize = 2;
    const baseX = player.x;
    const baseY = screenY;

    // Body - grey
    for (let row = 8; row < 18; row++) {
        for (let col = 3; col < 12; col++) {
            drawPixel(baseX + col*pixelSize, baseY + row*pixelSize, '#808080', pixelSize);
        }
    }

    // Body shading (darker side for volume)
    if (player.facingRight) {
        for (let row = 8; row < 16; row++) {
            drawPixel(baseX + 3*pixelSize, baseY + row*pixelSize, '#606060', pixelSize);
        }
    } else {
        for (let row = 8; row < 16; row++) {
            drawPixel(baseX + 11*pixelSize, baseY + row*pixelSize, '#606060', pixelSize);
        }
    }

    // Stripes
    for (let row = 10; row < 16; row++) {
        if (row % 2 === 0) {
            drawPixel(baseX + 5*pixelSize, baseY + row*pixelSize, '#606060', pixelSize);
            drawPixel(baseX + 9*pixelSize, baseY + row*pixelSize, '#606060', pixelSize);
        }
    }

    // Head
    for (let row = 2; row < 9; row++) {
        for (let col = 4; col < 11; col++) {
            if (row < 8 || (row === 8 && col > 4 && col < 10)) {
                drawPixel(baseX + col*pixelSize, baseY + row*pixelSize, '#808080', pixelSize);
            }
        }
    }

    // Ears - pointed triangles
    if (scareLevel <= 1) {
        // Normal ears up
        drawPixel(baseX + 4*pixelSize, baseY + 2*pixelSize, '#ffa0a0', pixelSize);
        drawPixel(baseX + 10*pixelSize, baseY + 2*pixelSize, '#ffa0a0', pixelSize);
        drawPixel(baseX + 4*pixelSize, baseY + 1*pixelSize, '#808080', pixelSize);
        drawPixel(baseX + 10*pixelSize, baseY + 1*pixelSize, '#808080', pixelSize);
    } else {
        // Ears back
        drawPixel(baseX + 5*pixelSize, baseY + 2*pixelSize, '#ffa0a0', pixelSize);
        drawPixel(baseX + 9*pixelSize, baseY + 2*pixelSize, '#ffa0a0', pixelSize);
    }

    // Eyes - green with vertical pupils (with blinking)
    if (!player.isBlinking) {
        drawPixel(baseX + 5*pixelSize, baseY + 4*pixelSize, '#44cc44', pixelSize);
        drawPixel(baseX + 9*pixelSize, baseY + 4*pixelSize, '#44cc44', pixelSize);

        // Pupils - dilate when scared
        if (scareLevel <= 1) {
            drawPixel(baseX + 5*pixelSize, baseY + 5*pixelSize, '#000000', pixelSize);
            drawPixel(baseX + 9*pixelSize, baseY + 5*pixelSize, '#000000', pixelSize);
        } else {
            drawPixel(baseX + 4*pixelSize, baseY + 4*pixelSize, '#000000', pixelSize);
            drawPixel(baseX + 5*pixelSize, baseY + 4*pixelSize, '#000000', pixelSize);
        drawPixel(baseX + 9*pixelSize, baseY + 4*pixelSize, '#000000', pixelSize);
        drawPixel(baseX + 10*pixelSize, baseY + 4*pixelSize, '#000000', pixelSize);
    }
    } // end blink check

    // Whiskers - animated based on breathing/movement
    const whiskerPhase = Math.sin(player.breathePhase) * 0.5;
    const whiskerCol1 = Math.floor(3 - whiskerPhase);
    const whiskerCol2 = Math.floor(11 + whiskerPhase);
    drawPixel(baseX + whiskerCol1*pixelSize, baseY + 6*pixelSize, '#f0f0f0', pixelSize);
    drawPixel(baseX + whiskerCol2*pixelSize, baseY + 6*pixelSize, '#f0f0f0', pixelSize);

    // Tail - curved up normally, puffed when scared
    if (scareLevel <= 1) {
        // Tail up
        drawPixel(baseX + 12*pixelSize, baseY + 10*pixelSize, '#808080', pixelSize);
        drawPixel(baseX + 13*pixelSize, baseY + 9*pixelSize, '#808080', pixelSize);
        drawPixel(baseX + 13*pixelSize, baseY + 8*pixelSize, '#808080', pixelSize);
    } else {
        // Tail puffed
        drawPixel(baseX + 12*pixelSize, baseY + 9*pixelSize, '#808080', pixelSize);
        drawPixel(baseX + 13*pixelSize, baseY + 9*pixelSize, '#808080', pixelSize);
        drawPixel(baseX + 13*pixelSize, baseY + 10*pixelSize, '#808080', pixelSize);
    }

    // Paws - white toe tips
    drawPixel(baseX + 4*pixelSize, baseY + 18*pixelSize, '#e0e0e0', pixelSize);
    drawPixel(baseX + 8*pixelSize, baseY + 18*pixelSize, '#e0e0e0', pixelSize);
}

// 착지 임팩트 플래시 효과
function drawLandingFlash() {
    if (player.landingImpact <= 0) return;
    const intensity = player.landingImpact;
    // 하얀 플래시 링 - 착지 지점 중심으로 퍼져나감
    const screenY = player.y + cameraY + player.height;
    const radius = (1 - intensity) * 60 + 10;
    ctx.save();
    // 글로우 효과를 반투명 두꺼운 링으로 대체 (shadowBlur 제거 - 성능 최적화)
    ctx.globalAlpha = intensity * 0.2;
    ctx.strokeStyle = '#4a7878';
    ctx.lineWidth = 8 * intensity;
    ctx.beginPath();
    ctx.arc(player.x + player.width / 2, screenY, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = intensity * 0.5;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3 * intensity;
    ctx.beginPath();
    ctx.arc(player.x + player.width / 2, screenY, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}

// 플레이어 그리기 (화면 좌표로 변환)
function drawPlayer() {
    ctx.save();

    // 화면 좌표로 변환
    const screenY = player.y + cameraY;

    // Apply squashStretch transform
    const centerX = player.x + player.width / 2;
    const centerY = screenY + player.height / 2;

    ctx.translate(centerX, centerY);
    // 웅크리기 강화: 충전 중에는 squash 추가 적용
    const chargeSquash = (player.isCharging && player.isOnGround)
        ? (1 - (player.jumpPower / MAX_JUMP_POWER) * 0.3)
        : 1;
    ctx.scale(1, player.squashStretch * chargeSquash);
    ctx.translate(-centerX, -centerY);

    // 선택된 캐릭터에 따라 그리기
    switch (selectedCharacter) {
        case 'skeleton':
            drawSkeleton(screenY);
            break;
        case 'human':
            drawHuman(screenY);
            break;
        case 'dog':
            drawDog(screenY);
            break;
        case 'cat':
            drawCat(screenY);
            break;
    }

    // 존별 캐릭터 상태 이펙트
    const zone = getCurrentZone();

    // 고도에서 호흡 이펙트 (작은 안개 입김)
    if (zone >= 3 && player.isOnGround && Math.random() < 0.05) {
        impactParticles.push({
            x: player.x + player.width / 2 + (player.facingRight ? 8 : -8),
            y: screenY + 6,
            vx: player.facingRight ? 0.5 : -0.5,
            vy: -0.3,
            size: 2,
            life: 0.6,
            decay: 0.03,
            color: 'rgba(200, 200, 255, 0.3)'
        });
    }

    // 고도에서 땀 이펙트
    if (zone >= 5 && Math.random() < 0.02) {
        impactParticles.push({
            x: player.x + player.width / 2 + (Math.random() - 0.5) * 10,
            y: screenY + 4,
            vx: 0,
            vy: 0.5 + Math.random() * 0.5,
            size: 1,
            life: 0.8,
            decay: 0.04,
            color: '#88ccff'
        });
    }

    // 충전 중 표시 (사이버네틱 차지 링)
    if (player.isCharging && player.isOnGround) {
        const chargeRatio = player.jumpPower / MAX_JUMP_POWER;
        const chargeR = Math.floor(90 + chargeRatio * 165);
        const chargeG = Math.floor(136 - chargeRatio * 80);
        const chargeB = Math.floor(136 - chargeRatio * 80);
        const chargeColor = `rgb(${chargeR},${chargeG},${chargeB})`;
        // 충전 링 (shadowBlur 제거 - 성능 최적화)
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = chargeColor;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(player.x + player.width / 2, screenY - 10, 8 + player.jumpPower / 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = chargeColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(player.x + player.width / 2, screenY - 10, 8 + player.jumpPower / 3, 0, Math.PI * 2);
        ctx.stroke();
        // 외부 링
        ctx.strokeStyle = '#6a4a5a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(player.x + player.width / 2, screenY - 10, 12 + player.jumpPower / 2, 0, (player.jumpPower / MAX_JUMP_POWER) * Math.PI * 2);
        ctx.stroke();

        // 방향 화살표 (홀로그래픽 - shadowBlur 제거)
        if (player.direction !== 0) {
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = '#5a8888';
            ctx.beginPath();
            const arrowX = player.x + player.width / 2 + player.direction * 25;
            const arrowY = screenY + player.height / 2;
            ctx.moveTo(arrowX - player.direction * 2, arrowY - 12);
            ctx.lineTo(arrowX + player.direction * 17, arrowY);
            ctx.lineTo(arrowX - player.direction * 2, arrowY + 12);
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#5a8888';
            ctx.beginPath();
            ctx.moveTo(arrowX, arrowY - 10);
            ctx.lineTo(arrowX + player.direction * 15, arrowY);
            ctx.lineTo(arrowX, arrowY + 10);
            ctx.fill();
        }

        // Ground crack effect during charging
        if (player.isCharging && player.isOnGround) {
            const chargeRatio = player.jumpPower / MAX_JUMP_POWER;
            const zoneTheme = getCurrentZoneTheme();

            // Energy gather particles (converging toward player)
            if (chargeRatio > 0.3) {
                ctx.fillStyle = '#5a8888';
                ctx.globalAlpha = chargeRatio * 0.5;
                for (let i = 0; i < 6; i++) {
                    const angle = (Date.now() / 200 + i * Math.PI / 3) % (Math.PI * 2);
                    const dist = 40 * (1 - chargeRatio) + 10;
                    const px = player.x + player.width / 2 + Math.cos(angle) * dist;
                    const py = screenY + player.height / 2 + Math.sin(angle) * dist;
                    ctx.fillRect(px - 1, py - 1, 3, 3);
                }
                ctx.globalAlpha = 1;
            }

            // Ground cracks beneath player
            if (chargeRatio > 0.5) {
                ctx.strokeStyle = zoneTheme ? zoneTheme.blockBorder : '#5a8888';
                ctx.globalAlpha = chargeRatio * 0.6;
                ctx.lineWidth = 1;
                const groundY = screenY + player.height;
                for (let i = 0; i < 4; i++) {
                    ctx.beginPath();
                    const startX = player.x + player.width / 2;
                    ctx.moveTo(startX, groundY);
                    ctx.lineTo(startX + (i % 2 === 0 ? 1 : -1) * (10 + i * 8) * chargeRatio, groundY + 5 + i * 3);
                    ctx.stroke();
                }
                ctx.globalAlpha = 1;
            }

            // Screen subtle vibration during high charge
            if (chargeRatio > 0.7) {
                screenShakeIntensity = Math.max(screenShakeIntensity, chargeRatio * 1.5);
            }
        }
    }

    ctx.restore();
}

// 블록 그리기 - Pixel Art Platforms
function drawBlocks() {
    const zoneTheme = getCurrentZoneTheme();
    const zone = getCurrentZone();
    const pixelSize = 4;

    for (const block of blocks) {
        // 사라진 크럼블링 블록 스킵
        if (block.disappeared) continue;

        let screenY = block.y + cameraY;

        // 화면에 보이는 블록만 그리기
        if (screenY > -50 && screenY < canvas.height + 50) {
            // 무빙 블록의 오프셋 계산
            const blockX = block.type === 'moving' ? block.x + block.moveOffset : block.x;

            // Apply wobble effect
            if (block.wobble > 0) {
                const wobbleOffset = Math.sin(block.wobble * 10) * block.wobble * 3;
                screenY += wobbleOffset;
            }

            // Depth fog effect
            const distFromPlayer = Math.abs(screenY - (player.y + cameraY));
            const depthFade = Math.max(0.3, 1 - distFromPlayer / 600);
            ctx.globalAlpha *= depthFade;

            // 페이크 블록 처리
            if (block.type === 'fake') {
                ctx.globalAlpha *= block.opacity;
            }

            // Zone 0-1 (Cyberpunk): Metal plates with rivets - simplified for performance
            if (zone <= 1) {
                ctx.fillStyle = zoneTheme.blockColor1;
                ctx.fillRect(blockX, screenY, block.width, block.height);

                // Simplified texture: single accent layer instead of nested loops
                ctx.fillStyle = '#2a4a5a';
                ctx.globalAlpha = 0.4;
                ctx.fillRect(blockX, screenY, block.width, block.height * 0.4);
                ctx.globalAlpha = 1;

                // Simplified circuit traces: fewer lines
                ctx.strokeStyle = '#3a6868';
                ctx.globalAlpha = 0.3;
                ctx.lineWidth = 1;
                for (let i = 0; i < block.width; i += 40) {
                    ctx.beginPath();
                    ctx.moveTo(blockX + i, screenY);
                    ctx.lineTo(blockX + i, screenY + block.height);
                    ctx.stroke();
                }
                ctx.globalAlpha = 1;

                // Simplified rivets: reduced count
                ctx.fillStyle = '#4a7878';
                ctx.globalAlpha = 0.4;
                ctx.fillRect(blockX + 10, screenY + 5, pixelSize, pixelSize);
                ctx.fillRect(blockX + block.width - 14, screenY + 5, pixelSize, pixelSize);
                ctx.globalAlpha = 1;
            }
            // Zone 2-3 (Red tint): Cracked concrete with moss
            else if (zone <= 3) {
                ctx.fillStyle = zoneTheme.blockColor1;
                ctx.fillRect(blockX, screenY, block.width, block.height);

                // Concrete texture
                ctx.fillStyle = '#3a2a2a';
                for (let x = 0; x < block.width; x += pixelSize * 2) {
                    for (let y = 0; y < block.height; y += pixelSize * 2) {
                        ctx.fillRect(blockX + x, screenY + y, pixelSize, pixelSize);
                    }
                }

                // Cracks
                ctx.strokeStyle = '#1a0a0a';
                ctx.globalAlpha = 0.5;
                ctx.lineWidth = 1;
                for (let i = 0; i < block.width; i += 25) {
                    ctx.beginPath();
                    ctx.moveTo(blockX + i, screenY);
                    ctx.lineTo(blockX + i + 5, screenY + block.height);
                    ctx.stroke();
                }
                ctx.globalAlpha = 1;

                // Moss spots
                ctx.fillStyle = '#00aa44';
                ctx.globalAlpha = 0.6;
                for (let x = 10; x < block.width; x += 30) {
                    for (let y = 5; y < block.height; y += 15) {
                        if ((x + y) % 20 === 0) {
                            ctx.fillRect(blockX + x, screenY + y, pixelSize * 2, pixelSize);
                        }
                    }
                }
                ctx.globalAlpha = 1;

                // Blood splatter dots (zone 3+)
                if (zone >= 3) {
                    ctx.fillStyle = '#ff0000';
                    ctx.globalAlpha = 0.4;
                    for (let i = 0; i < 5; i++) {
                        const x = blockX + Math.random() * block.width;
                        const y = screenY + Math.random() * block.height;
                        ctx.fillRect(x, y, pixelSize, pixelSize);
                    }
                    ctx.globalAlpha = 1;
                }
            }
            // Zone 4-5 (Heavy fog/Very dark): Rusty metal with dents
            else if (zone <= 5) {
                ctx.fillStyle = zoneTheme.blockColor1;
                ctx.fillRect(blockX, screenY, block.width, block.height);

                // Rusty metal texture
                ctx.fillStyle = '#4a3a2a';
                for (let x = 0; x < block.width; x += pixelSize * 4) {
                    for (let y = 0; y < block.height; y += pixelSize * 3) {
                        ctx.fillRect(blockX + x, screenY + y, pixelSize * 2, pixelSize * 2);
                    }
                }

                // Dents and rust
                ctx.fillStyle = '#2a1a0a';
                ctx.globalAlpha = 0.7;
                for (let x = 15; x < block.width; x += 25) {
                    for (let y = 5; y < block.height; y += 10) {
                        ctx.fillRect(blockX + x, screenY + y, pixelSize * 2, pixelSize);
                    }
                }
                ctx.globalAlpha = 1;

                // Dripping effects
                ctx.strokeStyle = '#1a0a00';
                ctx.globalAlpha = 0.5;
                ctx.lineWidth = 1;
                for (let i = 0; i < block.width; i += 30) {
                    ctx.beginPath();
                    ctx.moveTo(blockX + i, screenY + block.height);
                    ctx.lineTo(blockX + i, screenY + block.height + 10);
                    ctx.stroke();
                }
                ctx.globalAlpha = 1;
            }
            // Zone 6-7 (Glitch/Darkness): Corrupted platforms with red glow
            else if (zone <= 7) {
                ctx.fillStyle = zoneTheme.blockColor1;
                ctx.fillRect(blockX, screenY, block.width, block.height);

                // Corrupted pattern
                ctx.fillStyle = '#1a0a1a';
                for (let x = 0; x < block.width; x += pixelSize * 3) {
                    for (let y = 0; y < block.height; y += pixelSize * 3) {
                        if ((x + y) % (pixelSize * 6) === 0) {
                            ctx.fillRect(blockX + x, screenY + y, pixelSize * 2, pixelSize * 2);
                        }
                    }
                }

                // Red glow cracks
                ctx.strokeStyle = '#ff0000';
                ctx.globalAlpha = 0.8;
                ctx.lineWidth = 1;
                for (let i = 0; i < block.width; i += 20) {
                    ctx.beginPath();
                    ctx.moveTo(blockX + i, screenY);
                    ctx.lineTo(blockX + i + 5, screenY + block.height);
                    ctx.stroke();
                }
                ctx.globalAlpha = 1;

                // Red glow edges
                ctx.strokeStyle = '#ff0000';
                ctx.globalAlpha = 0.4;
                ctx.lineWidth = 2;
                ctx.strokeRect(blockX, screenY, block.width, block.height);
                ctx.globalAlpha = 1;
            }
            // Zone 8 (Surreal): Floating crystal-like platforms with yellow glow
            else if (zone === 8) {
                ctx.fillStyle = zoneTheme.blockColor1;
                ctx.fillRect(blockX, screenY, block.width, block.height);

                // Crystal pattern
                ctx.fillStyle = '#3a3a5a';
                for (let x = 0; x < block.width; x += pixelSize * 5) {
                    for (let y = 0; y < block.height; y += pixelSize * 4) {
                        ctx.fillRect(blockX + x, screenY + y, pixelSize * 3, pixelSize * 2);
                    }
                }

                // Dim amber glow spots
                ctx.fillStyle = '#6a5a3a';
                ctx.globalAlpha = 0.5;
                for (let x = 10; x < block.width; x += 25) {
                    for (let y = 5; y < block.height; y += 10) {
                        ctx.fillRect(blockX + x, screenY + y, pixelSize * 2, pixelSize * 2);
                    }
                }
                ctx.globalAlpha = 1;

                // Dim amber glow border
                ctx.strokeStyle = '#7a6a4a';
                ctx.globalAlpha = 0.5;
                ctx.lineWidth = 1;
                ctx.strokeRect(blockX, screenY, block.width, block.height);
                ctx.globalAlpha = 1;
            }
            // Zone 9 (Redemption): Natural wood/stone with green moss and flowers
            else {
                ctx.fillStyle = zoneTheme.blockColor1;
                ctx.fillRect(blockX, screenY, block.width, block.height);

                // Wood/stone texture
                ctx.fillStyle = '#3a4a2a';
                for (let x = 0; x < block.width; x += pixelSize * 3) {
                    for (let y = 0; y < block.height; y += pixelSize * 2) {
                        ctx.fillRect(blockX + x, screenY + y, pixelSize * 2, pixelSize);
                    }
                }

                // Muted green moss coverage
                ctx.fillStyle = '#4a6a5a';
                ctx.globalAlpha = 0.5;
                for (let x = 0; x < block.width; x += 20) {
                    for (let y = 0; y < block.height; y += 12) {
                        if ((x + y) % 30 === 0) {
                            ctx.fillRect(blockX + x, screenY + y, pixelSize * 2, pixelSize);
                        }
                    }
                }
                ctx.globalAlpha = 1;

                // Flower spots (muted brown-orange)
                ctx.fillStyle = '#6a5a3a';
                ctx.globalAlpha = 0.5;
                for (let x = 15; x < block.width; x += 35) {
                    ctx.fillRect(blockX + x, screenY + 5, pixelSize, pixelSize);
                }
                ctx.globalAlpha = 1;
            }

            // 환경 단서 시각 렌더링
            if (block.envClue) {
                const clueAlpha = 0.4 + Math.sin(Date.now() * 0.003) * 0.2;
                ctx.globalAlpha = clueAlpha;
                if (block.envClue.type === 'footprint') {
                    ctx.fillStyle = '#8a7a6a';
                    ctx.fillRect(blockX + block.width * 0.3, screenY - 4, 6, 3);
                    ctx.fillRect(blockX + block.width * 0.6, screenY - 4, 6, 3);
                } else if (block.envClue.type === 'toy') {
                    ctx.fillStyle = '#cc8888';
                    ctx.fillRect(blockX + block.width * 0.5 - 4, screenY - 8, 8, 8);
                } else if (block.envClue.type === 'note') {
                    ctx.fillStyle = '#e8e0c0';
                    ctx.fillRect(blockX + block.width * 0.4, screenY - 6, 10, 6);
                } else if (block.envClue.type === 'photo') {
                    ctx.fillStyle = '#a09080';
                    ctx.fillRect(blockX + block.width * 0.3, screenY - 10, 12, 10);
                    ctx.fillStyle = '#706050';
                    ctx.fillRect(blockX + block.width * 0.3 + 1, screenY - 9, 10, 8);
                } else if (block.envClue.type === 'drawing') {
                    ctx.fillStyle = '#ffaa66';
                    ctx.fillRect(blockX + block.width * 0.4, screenY - 6, 8, 6);
                } else if (block.envClue.type === 'light') {
                    ctx.fillStyle = '#ffff88';
                    ctx.beginPath();
                    ctx.arc(blockX + block.width * 0.5, screenY - 5, 5, 0, Math.PI * 2);
                    ctx.fill();
                } else if (block.envClue.type === 'warmth') {
                    ctx.fillStyle = '#ff8844';
                    for (let w = 0; w < 3; w++) {
                        const waveY = screenY - 5 - w * 4 - Math.sin(Date.now() * 0.005 + w) * 2;
                        ctx.fillRect(blockX + block.width * 0.3 + w * 8, waveY, 6, 2);
                    }
                }
                ctx.globalAlpha = 1;
            }

            // 상단 엣지 하이라이트
            ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.fillRect(blockX, screenY, block.width, pixelSize);

            // 블록 테두리
            ctx.strokeStyle = zoneTheme.blockBorder;
            ctx.lineWidth = 2;
            ctx.strokeRect(blockX, screenY, block.width, block.height);

            // 크럼블링 블록 효과
            if (block.type === 'crumbling' && block.isCrumbling) {
                ctx.globalAlpha = Math.max(0, 1 - block.crumbleTimer / 60);
                ctx.fillStyle = 'rgba(255, 100, 100, 0.3)';
                ctx.fillRect(blockX, screenY, block.width, block.height);

                // 크랙 패턴
                ctx.strokeStyle = '#ff6666';
                ctx.lineWidth = 1;
                for (let i = 0; i < 3; i++) {
                    ctx.beginPath();
                    ctx.moveTo(blockX + 10 + i * 20, screenY);
                    ctx.lineTo(blockX + 15 + i * 20, screenY + block.height);
                    ctx.stroke();
                }

                ctx.globalAlpha = 1;
            }

            // 무빙 블록 글로우 (shadowBlur 제거 - 성능 최적화)
            if (block.type === 'moving') {
                // 글로우를 반투명 두꺼운 테두리로 대체
                ctx.globalAlpha = 0.3;
                ctx.strokeStyle = zoneTheme.blockBorder;
                ctx.lineWidth = 6;
                ctx.strokeRect(blockX - 3, screenY - 3, block.width + 6, block.height + 6);
                ctx.globalAlpha = 1;
                ctx.strokeStyle = zoneTheme.blockBorder;
                ctx.lineWidth = 2;
                ctx.strokeRect(blockX - 2, screenY - 2, block.width + 4, block.height + 4);
            }

            // ── 바운스 블록 효과 ── (shadowBlur 제거)
            if (block.type === 'bounce') {
                // 초록 글로우 테두리 - 반투명 레이어로 대체
                ctx.globalAlpha = 0.3;
                ctx.strokeStyle = '#00ff88';
                ctx.lineWidth = 6;
                ctx.strokeRect(blockX - 2, screenY - 2, block.width + 4, block.height + 4);
                ctx.globalAlpha = 1;
                ctx.strokeStyle = '#00ff88';
                ctx.lineWidth = 2;
                ctx.strokeRect(blockX - 1, screenY - 1, block.width + 2, block.height + 2);
                // 블록 표면 초록 오버레이
                ctx.fillStyle = 'rgba(0,255,136,0.18)';
                ctx.fillRect(blockX, screenY, block.width, block.height);
                // 위쪽 화살표 (펄스)
                const arrowBounce = Math.sin(block.bouncePhase) * 2;
                ctx.fillStyle = '#00ff88';
                ctx.globalAlpha = 0.85;
                const bMid = blockX + block.width / 2;
                const bTop = screenY + 3 - arrowBounce;
                ctx.beginPath();
                ctx.moveTo(bMid,        bTop);
                ctx.lineTo(bMid - 7,    bTop + 9);
                ctx.lineTo(bMid - 3,    bTop + 9);
                ctx.lineTo(bMid - 3,    bTop + 15);
                ctx.lineTo(bMid + 3,    bTop + 15);
                ctx.lineTo(bMid + 3,    bTop + 9);
                ctx.lineTo(bMid + 7,    bTop + 9);
                ctx.closePath();
                ctx.fill();
                ctx.globalAlpha = 1;
            }

            // ── 얼음 블록 효과 ──
            if (block.type === 'ice') {
                // 하늘색 반투명 오버레이
                ctx.fillStyle = 'rgba(136,221,255,0.28)';
                ctx.fillRect(blockX, screenY, block.width, block.height);
                // 얼음 테두리 (shadowBlur 제거 - 성능 최적화)
                ctx.globalAlpha = 0.3;
                ctx.strokeStyle = '#88ddff';
                ctx.lineWidth = 5;
                ctx.strokeRect(blockX - 2, screenY - 2, block.width + 4, block.height + 4);
                ctx.globalAlpha = 1;
                ctx.strokeStyle = '#aaeeff';
                ctx.lineWidth = 1.5;
                ctx.strokeRect(blockX - 1, screenY - 1, block.width + 2, block.height + 2);
                // 이동하는 반짝임 (shimmer)
                const shimmerPos = (Math.sin(block.icePhase) * 0.5 + 0.5) * (block.width + 20) - 10;
                const shimmerGrad = ctx.createLinearGradient(
                    blockX + shimmerPos - 15, screenY,
                    blockX + shimmerPos + 15, screenY + block.height
                );
                shimmerGrad.addColorStop(0, 'rgba(255,255,255,0)');
                shimmerGrad.addColorStop(0.5, 'rgba(255,255,255,0.45)');
                shimmerGrad.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.fillStyle = shimmerGrad;
                ctx.fillRect(blockX, screenY, block.width, block.height);
                // 결정 무늬 (작은 x 패턴)
                ctx.strokeStyle = 'rgba(180,240,255,0.4)';
                ctx.lineWidth = 0.5;
                for (let ix = blockX + 8; ix < blockX + block.width - 4; ix += 14) {
                    ctx.beginPath();
                    ctx.moveTo(ix - 3, screenY + 5); ctx.lineTo(ix + 3, screenY + 15);
                    ctx.moveTo(ix + 3, screenY + 5); ctx.lineTo(ix - 3, screenY + 15);
                    ctx.stroke();
                }
            }

            // ── 컨베이어 블록 효과 ──
            if (block.type === 'conveyor') {
                // 오렌지 오버레이
                ctx.fillStyle = 'rgba(255,153,0,0.22)';
                ctx.fillRect(blockX, screenY, block.width, block.height);
                // 테두리
                ctx.strokeStyle = '#ffaa22';
                ctx.lineWidth = 1.5;
                ctx.strokeRect(blockX - 1, screenY - 1, block.width + 2, block.height + 2);
                // 이동하는 화살표 줄
                ctx.fillStyle = '#ffcc44';
                ctx.globalAlpha = 0.9;
                const arrowSpacing = 18;
                const dir = block.conveyorDirection;
                const phaseOffset = block.conveyorPhase * arrowSpacing * dir;
                // 한 번만 clip (save/restore는 루프 밖에서)
                ctx.save();
                ctx.beginPath();
                ctx.rect(blockX, screenY, block.width, block.height);
                ctx.clip();
                const ay = screenY + block.height / 2;
                for (let aIdx = -1; aIdx < Math.ceil(block.width / arrowSpacing) + 1; aIdx++) {
                    const ax = blockX + aIdx * arrowSpacing + phaseOffset;
                    ctx.beginPath();
                    ctx.moveTo(ax - dir * 4, ay - 4);
                    ctx.lineTo(ax + dir * 4, ay);
                    ctx.lineTo(ax - dir * 4, ay + 4);
                    ctx.closePath();
                    ctx.fill();
                }
                ctx.restore();
                ctx.globalAlpha = 1;
            }

            ctx.globalAlpha = 1;
            ctx.globalAlpha = 1; // Reset after wobble and depth fade
        }
    }
}

// 포그 파티클 그리기
function drawFog() {
    const zoneTheme = getCurrentZoneTheme();
    if (zoneTheme.fogDensity < 0.05) return;

    ctx.globalAlpha = zoneTheme.fogDensity * 0.3;
    for (let fog of fogParticles) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(fog.x, fog.y, 30, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}

// 비네트 효과 그리기
function drawVignette() {
    const zoneTheme = getCurrentZoneTheme();
    if (zoneTheme.vignette < 0.01) return;

    const gradient = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 0, canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height));
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(1, `rgba(0, 0, 0, ${zoneTheme.vignette})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// 글리치 효과 그리기
function drawGlitch() {
    const zoneTheme = getCurrentZoneTheme();
    if (!zoneTheme.glitch) return;
    if (Math.random() > 0.3) return; // 30% 확률로만 글리치

    const glitchStrength = (getCurrentZone() - 2) / 7;
    const lineCount = Math.floor(Math.random() * 3) + 1;

    for (let i = 0; i < lineCount; i++) {
        const y = Math.random() * canvas.height;
        const height = Math.random() * 20 + 5;
        const offset = Math.random() * 20 - 10;

        ctx.fillStyle = `rgba(255, 0, 0, ${0.1 * glitchStrength})`;
        ctx.fillRect(0 + offset, y, canvas.width, height);
    }
}

// 하트비트 UI 펄스
function getHeartbeatScale() {
    const zone = getCurrentZone();
    if (zone < 5) return 1;

    heartbeatTime += 0.05;
    const pulse = Math.sin(heartbeatTime * 3) * 0.1;
    return 1 + pulse * (zone / 9);
}

// 바닥 그리기 - Enhanced Pixel Art Ground
function drawFloor() {
    const floorScreenY = floor.y + cameraY;
    const zoneTheme = getCurrentZoneTheme();
    const zone = getCurrentZone();

    if (floorScreenY < canvas.height + floor.height && floorScreenY > -floor.height) {
        // 기본 색상
        const gradient = ctx.createLinearGradient(0, floorScreenY, 0, floorScreenY + floor.height);
        gradient.addColorStop(0, '#0a1520');
        gradient.addColorStop(1, '#050a10');
        ctx.fillStyle = gradient;
        ctx.fillRect(floor.x, floorScreenY, floor.width, floor.height);

        // Zone-specific floor appearance with pixel art pattern
        const pixelSize = 4;

        if (zone <= 1) {
            // Cyberpunk: Metal plates with rivets
            ctx.fillStyle = '#1a2a3a';
            for (let x = 0; x < canvas.width; x += pixelSize * 5) {
                for (let y = 0; y < floor.height; y += pixelSize * 3) {
                    ctx.fillRect(floor.x + x, floorScreenY + y, pixelSize * 4, pixelSize * 2);
                }
            }
            // Rivet pattern (muted mauve)
            ctx.fillStyle = '#5a4a5a';
            ctx.globalAlpha = 0.5;
            for (let x = 0; x < canvas.width; x += pixelSize * 10) {
                for (let y = 0; y < floor.height; y += pixelSize * 6) {
                    ctx.fillRect(floor.x + x + pixelSize, floorScreenY + y + pixelSize, pixelSize, pixelSize);
                }
            }
            ctx.globalAlpha = 1;
        } else if (zone <= 3) {
            // Red/Unease: Cracked concrete with moss
            for (let x = 0; x < canvas.width; x += pixelSize * 6) {
                for (let y = 0; y < floor.height; y += pixelSize * 4) {
                    ctx.fillStyle = '#2a1a1a';
                    ctx.fillRect(floor.x + x, floorScreenY + y, pixelSize * 5, pixelSize * 3);
                    // Moss spots (muted green)
                    if ((x + y) % (pixelSize * 20) === 0) {
                        ctx.fillStyle = '#3a5a4a';
                        ctx.globalAlpha = 0.4;
                        ctx.fillRect(floor.x + x + pixelSize, floorScreenY + y + pixelSize, pixelSize * 2, pixelSize);
                        ctx.globalAlpha = 1;
                    }
                }
            }
        } else if (zone <= 5) {
            // Heavy fog/Dark: Rusty metal with dents
            for (let x = 0; x < canvas.width; x += pixelSize * 8) {
                for (let y = 0; y < floor.height; y += pixelSize * 5) {
                    ctx.fillStyle = '#3a2a1a';
                    ctx.fillRect(floor.x + x, floorScreenY + y, pixelSize * 7, pixelSize * 4);
                    // Dents
                    ctx.fillStyle = '#1a0a00';
                    ctx.globalAlpha = 0.7;
                    ctx.fillRect(floor.x + x + pixelSize * 2, floorScreenY + y + pixelSize, pixelSize * 2, pixelSize);
                    ctx.globalAlpha = 1;
                }
            }
        } else if (zone <= 7) {
            // Glitch/Darkness: Corrupted platforms
            for (let x = 0; x < canvas.width; x += pixelSize * 7) {
                for (let y = 0; y < floor.height; y += pixelSize * 4) {
                    ctx.fillStyle = '#1a0000';
                    ctx.fillRect(floor.x + x, floorScreenY + y, pixelSize * 6, pixelSize * 3);
                    // Red glow cracks
                    ctx.strokeStyle = '#ff0000';
                    ctx.globalAlpha = 0.8;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(floor.x + x + pixelSize * 2, floorScreenY + y);
                    ctx.lineTo(floor.x + x + pixelSize * 4, floorScreenY + y + pixelSize * 3);
                    ctx.stroke();
                    ctx.globalAlpha = 1;
                }
            }
        } else if (zone === 8) {
            // Surreal: Crystal-like platforms
            for (let x = 0; x < canvas.width; x += pixelSize * 6) {
                for (let y = 0; y < floor.height; y += pixelSize * 5) {
                    ctx.fillStyle = '#2a2a4a';
                    ctx.fillRect(floor.x + x, floorScreenY + y, pixelSize * 5, pixelSize * 4);
                    // Dim amber glow
                    ctx.fillStyle = '#6a5a3a';
                    ctx.globalAlpha = 0.4;
                    ctx.fillRect(floor.x + x + pixelSize * 2, floorScreenY + y + pixelSize, pixelSize * 2, pixelSize * 2);
                    ctx.globalAlpha = 1;
                }
            }
        } else {
            // Redemption: Natural wood/stone with moss
            for (let x = 0; x < canvas.width; x += pixelSize * 5) {
                for (let y = 0; y < floor.height; y += pixelSize * 4) {
                    ctx.fillStyle = '#3a4a2a';
                    ctx.fillRect(floor.x + x, floorScreenY + y, pixelSize * 4, pixelSize * 3);
                    // Muted green moss
                    ctx.fillStyle = '#4a6a5a';
                    ctx.globalAlpha = 0.4;
                    ctx.fillRect(floor.x + x + pixelSize, floorScreenY + y + pixelSize, pixelSize * 2, pixelSize);
                    // Flowers (muted brown)
                    if ((x + y) % (pixelSize * 15) === 0) {
                        ctx.fillStyle = '#6a5a3a';
                        ctx.globalAlpha = 0.5;
                        ctx.fillRect(floor.x + x + pixelSize * 2, floorScreenY + y, pixelSize, pixelSize);
                        ctx.globalAlpha = 1;
                    }
                }
            }
        }

        // 상단 네온 라인 (shadowBlur 제거 - 성능 최적화)
        ctx.strokeStyle = zoneTheme.blockBorder;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, floorScreenY);
        ctx.lineTo(canvas.width, floorScreenY);
        ctx.stroke();
        // 글로우 효과를 반투명 두꺼운 선으로 대체
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(0, floorScreenY);
        ctx.lineTo(canvas.width, floorScreenY);
        ctx.stroke();
        ctx.globalAlpha = 1;
    }
}

// 배경 그리기 - Enhanced Pixel Art Background with Parallax
function drawBackground() {
    const zoneTheme = getCurrentZoneTheme();
    const zone = getCurrentZone();
    const pixelSize = 4;

    // ── 존 전환 크로스페이드 배경 그라데이션 ──
    // 현재 존 내에서의 진행률 (0~1)
    const zoneProgress = (maxHeight % 100) / 100;
    // 존 경계 30m 전부터 다음 존으로 블렌딩 시작
    const blendStart = 0.70; // 70% 지점부터 블렌딩
    const blendAmount = zoneProgress >= blendStart
        ? (zoneProgress - blendStart) / (1.0 - blendStart)
        : 0;

    // 현재 존 배경 (항상)
    ctx.fillStyle = zones[zone].backgroundColor;
    ctx.globalAlpha = 0.3;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;

    // 다음 존 배경 페이드인
    if (blendAmount > 0 && zone < 9) {
        const nextZone = Math.min(zone + 1, 9);
        ctx.fillStyle = zones[nextZone].backgroundColor;
        ctx.globalAlpha = blendAmount * 0.25;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1;

        // 전환 수직 그라데이션 (화면 위쪽에서 다음 존 색 침투)
        // hex → rgba 변환 헬퍼
        const hexBg = zones[nextZone].backgroundColor;
        const r = parseInt(hexBg.slice(1,3), 16);
        const g = parseInt(hexBg.slice(3,5), 16);
        const b = parseInt(hexBg.slice(5,7), 16);
        const transGrad = ctx.createLinearGradient(0, 0, 0, canvas.height * 0.6);
        transGrad.addColorStop(0, `rgba(${r},${g},${b},${blendAmount * 0.4})`);
        transGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = transGrad;
        ctx.globalAlpha = 1;
        ctx.fillRect(0, 0, canvas.width, canvas.height * 0.6);
    }

    // Zone 0-1 (Cyberpunk): City buildings with lit windows
    if (zone <= 1) {
        // Building silhouettes with parallax
        const parallax1 = cameraY * 0.1;
        const parallax2 = cameraY * 0.15;

        // Ultra-far background - mountain/skyline silhouette (optimized iteration)
        const parallax0 = cameraY * 0.05;
        ctx.fillStyle = '#0f1a28';
        ctx.globalAlpha = 0.3;
        for (let i = 0; i < canvas.width; i += 50) {
            const mtnHeight = 40 + Math.sin(i * 0.05) * 30 + Math.cos(i * 0.03) * 20;
            ctx.fillRect(i, canvas.height - 220 - parallax0, 40, mtnHeight);
        }
        ctx.globalAlpha = 1;

        // Background buildings (far layer - reduced iterations)
        ctx.fillStyle = '#1a2a3a';
        ctx.globalAlpha = 0.5;
        for (let i = 0; i < canvas.width; i += 80) {
            const buildingHeight = 80 + (i % 40);
            ctx.fillRect(i, canvas.height - 150 - parallax1, 60, buildingHeight);
        }

        // Lit windows in buildings (dim amber - fewer windows)
        ctx.fillStyle = '#7a6a3a';
        ctx.globalAlpha = 0.5;
        for (let i = 0; i < canvas.width; i += 80) {
            for (let y = 0; y < 60; y += 25) {
                ctx.fillRect(i + 10, canvas.height - 130 - parallax1 + y, 8, 8);
                ctx.fillRect(i + 35, canvas.height - 130 - parallax1 + y, 8, 8);
            }
        }

        // Dim signs (closer layer - reduced count)
        ctx.fillStyle = '#4a6868';
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = '#4a6868';
        ctx.lineWidth = 2;
        for (let i = 40; i < canvas.width; i += 120) {
            const signY = canvas.height - 200 - parallax2;
            ctx.strokeRect(i, signY, 30, 20);
        }

        // 가까운 레이어 - 전선과 안테나
        ctx.strokeStyle = '#2a4858';
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.3;
        const parallax3 = cameraY * 0.22;
        for (let i = 0; i < canvas.width; i += 100) {
            // 수직 전선
            ctx.beginPath();
            ctx.moveTo(i + 40, canvas.height - 250 - parallax3);
            ctx.lineTo(i + 40, canvas.height - 100 - parallax3);
            ctx.stroke();
            // 안테나
            ctx.beginPath();
            ctx.moveTo(i + 35, canvas.height - 250 - parallax3);
            ctx.lineTo(i + 45, canvas.height - 260 - parallax3);
            ctx.stroke();
            // 수평 전선 (처진 곡선)
            ctx.beginPath();
            ctx.moveTo(i, canvas.height - 200 - parallax3);
            ctx.quadraticCurveTo(i + 50, canvas.height - 180 - parallax3, i + 100, canvas.height - 200 - parallax3);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }
    // Zone 2-3 (Abandoned): Broken buildings with dead trees
    else if (zone <= 3) {
        const parallax = cameraY * 0.12;

        // Abandoned buildings
        ctx.fillStyle = '#2a1a1a';
        ctx.globalAlpha = 0.6;
        for (let i = 0; i < canvas.width; i += 80) {
            ctx.fillRect(i, canvas.height - 180 - parallax, 60, 120);
        }

        // Broken windows
        ctx.fillStyle = '#4a3a2a';
        ctx.globalAlpha = 0.8;
        for (let i = 0; i < canvas.width; i += 80) {
            for (let y = 0; y < 100; y += 20) {
                ctx.fillRect(i + 10, canvas.height - 170 - parallax + y, 12, 12);
                ctx.fillRect(i + 30, canvas.height - 170 - parallax + y, 12, 12);
            }
        }

        // Dead trees
        ctx.strokeStyle = '#3a2a1a';
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.7;
        for (let i = 30; i < canvas.width; i += 100) {
            ctx.beginPath();
            ctx.moveTo(i, canvas.height - 100);
            ctx.lineTo(i - 20, canvas.height - 180);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(i, canvas.height - 100);
            ctx.lineTo(i + 20, canvas.height - 180);
            ctx.stroke();
        }

        // Flickering lights
        if (Math.sin(cameraY * 0.05) > 0.5) {
            ctx.fillStyle = 'rgba(255, 100, 100, 0.5)';
            for (let i = 0; i < canvas.width; i += 80) {
                ctx.fillRect(i + 10, canvas.height - 170 - parallax, 12, 12);
            }
        }
    }
    // Zone 4-5 (Heavy fog): Ruins with chains and water
    else if (zone <= 5) {
        const parallax = cameraY * 0.08;

        // Fog-covered ruins
        ctx.fillStyle = '#2a3a4a';
        ctx.globalAlpha = 0.5;
        for (let i = 0; i < canvas.width; i += 100) {
            ctx.fillRect(i, canvas.height - 200 - parallax, 70, 150);
        }

        // Hanging chains
        ctx.strokeStyle = '#5a5a5a';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.6;
        for (let i = 20; i < canvas.width; i += 60) {
            for (let chainLen = 0; chainLen < 80; chainLen += 10) {
                ctx.fillRect(i, canvas.height - 200 - parallax + chainLen, 2, 8);
            }
        }

        // Dripping water
        ctx.strokeStyle = '#5a8aaa';
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.4;
        for (let i = 0; i < canvas.width; i += 40) {
            const drippingAmount = Math.sin(cameraY * 0.03 + i) * 5 + 10;
            ctx.beginPath();
            ctx.moveTo(i, canvas.height - 50);
            ctx.lineTo(i, canvas.height - 50 + drippingAmount);
            ctx.stroke();
        }

        // Shadow areas
        ctx.fillStyle = '#1a2a3a';
        ctx.globalAlpha = 0.4;
        for (let y = 0; y < canvas.height; y += 40) {
            ctx.fillRect(0, y, canvas.width, 20);
        }
    }
    // Zone 6-7 (Glitch): Distorted reality with floating debris
    else if (zone <= 7) {
        const parallax = cameraY * 0.1;

        // Distorted background
        ctx.fillStyle = '#1a0a2a';
        ctx.globalAlpha = 0.5;
        for (let i = 0; i < canvas.width; i += 80) {
            const offset = Math.sin(cameraY * 0.02 + i * 0.1) * 20;
            ctx.fillRect(i, canvas.height - 150 - parallax + offset, 70, 100);
        }

        // Red lightning effects
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.3;
        for (let i = 0; i < 3; i++) {
            const startX = Math.random() * canvas.width;
            const startY = Math.random() * canvas.height * 0.6;
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            for (let j = 0; j < 5; j++) {
                ctx.lineTo(startX + Math.random() * 60 - 30, startY + 30 + j * 20);
            }
            ctx.stroke();
        }

        // Eye-like shapes
        ctx.fillStyle = '#ff0000';
        ctx.globalAlpha = 0.4;
        for (let i = 40; i < canvas.width; i += 120) {
            ctx.beginPath();
            ctx.ellipse(i, canvas.height * 0.4 - parallax, 15, 20, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillRect(i - 5, canvas.height * 0.4 - parallax - 3, 10, 6);
        }

        // Floating debris
        for (let i = 0; i < 10; i++) {
            const x = (i * 47 + cameraY * 0.2) % canvas.width;
            const y = (i * 71 - cameraY * 0.1) % (canvas.height + 100);
            ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
            ctx.fillRect(x, y, 12, 12);
        }
    }
    // Zone 8 (Surreal): Floating islands with strange symbols
    else if (zone === 8) {
        const parallax = cameraY * 0.12;

        // Floating islands
        ctx.fillStyle = '#3a3a5a';
        ctx.globalAlpha = 0.6;
        for (let i = 0; i < canvas.width; i += 120) {
            const offset = Math.sin(cameraY * 0.01 + i * 0.05) * 30;
            ctx.fillRect(i, canvas.height * 0.3 - parallax + offset, 80, 30);
        }

        // Strange symbols (dim amber)
        ctx.strokeStyle = '#6a5a3a';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.4;
        for (let i = 0; i < canvas.width; i += 150) {
            const symbolY = canvas.height * 0.2 - parallax;
            // Circle with crossing lines
            ctx.beginPath();
            ctx.arc(i + 20, symbolY, 8, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(i + 12, symbolY);
            ctx.lineTo(i + 28, symbolY);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(i + 20, symbolY - 8);
            ctx.lineTo(i + 20, symbolY + 8);
            ctx.stroke();
        }

        // Otherworldly glow particles (dim amber)
        for (let i = 0; i < 30; i++) {
            const x = (i * 61) % canvas.width;
            const y = ((i * 89 - cameraY * 0.2) % (canvas.height + 200)) - 100;
            ctx.fillStyle = '#7a6a4a';
            ctx.globalAlpha = 0.4 + Math.sin(cameraY * 0.05 + i) * 0.2;
            ctx.beginPath();
            ctx.arc(x, y, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    // Zone 9 (Redemption): Dawn sky with green vegetation
    else {
        const parallax = cameraY * 0.08;

        // Dawn sky gradient
        const skyGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        skyGradient.addColorStop(0, '#ff8844');
        skyGradient.addColorStop(0.5, '#ffaa66');
        skyGradient.addColorStop(1, '#88cc88');
        ctx.fillStyle = skyGradient;
        ctx.globalAlpha = 0.3;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1;

        // Sunlight rays
        ctx.strokeStyle = '#ffff88';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.2;
        for (let i = 0; i < 6; i++) {
            ctx.beginPath();
            ctx.moveTo(canvas.width / 2, 0);
            ctx.lineTo(canvas.width / 2 + 200 * Math.cos(i * Math.PI / 3), 200 * Math.sin(i * Math.PI / 3));
            ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // Green vegetation layers
        ctx.fillStyle = '#00cc66';
        ctx.globalAlpha = 0.5;
        for (let i = 0; i < canvas.width; i += 40) {
            ctx.beginPath();
            ctx.moveTo(i, canvas.height - 80 - parallax);
            ctx.quadraticCurveTo(i + 15, canvas.height - 120 - parallax, i + 30, canvas.height - 80 - parallax);
            ctx.lineTo(i + 30, canvas.height - parallax);
            ctx.fill();
        }

        // Birds in sky
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.4;
        for (let i = 0; i < 5; i++) {
            const birdX = (i * 100 + cameraY * 0.05) % (canvas.width + 50);
            const birdY = 100 + i * 30 - parallax;
            // Simple bird shapes
            ctx.beginPath();
            ctx.moveTo(birdX - 5, birdY);
            ctx.lineTo(birdX, birdY - 5);
            ctx.lineTo(birdX + 5, birdY);
            ctx.stroke();
        }
    }

    // 수평 스캔 라인 효과 (캐시된 이미지로 최적화)
    if (scanlineCache) {
        ctx.globalAlpha = 0.03;
        ctx.drawImage(scanlineCache, 0, 0);
        ctx.globalAlpha = 1;
    }
}

function updateProgressBar() {
    const GOAL = 600;
    const pct = Math.min(100, (maxHeight / GOAL) * 100);
    const fill = document.getElementById('progress-fill');
    const dot  = document.getElementById('progress-player-dot');
    const lbl  = document.getElementById('progress-label');
    if (!fill || !dot || !lbl) return;
    fill.style.height = pct + '%';
    dot.style.bottom  = pct + '%';
    lbl.textContent   = maxHeight + 'm';
}

// 게임 렌더링
function render() {
    // 스크린 셰이크 적용
    const shakeX = screenShakeIntensity > 0 ? (Math.random() - 0.5) * screenShakeIntensity : 0;
    const shakeY = screenShakeIntensity > 0 ? (Math.random() - 0.5) * screenShakeIntensity : 0;

    ctx.save();
    ctx.translate(shakeX, shakeY);

    // 화면 클리어
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 배경
    drawBackground();

    // Background environment particles
    drawEnvParticles(false);

    // 포그
    drawFog();

    // 바닥
    drawFloor();

    // 블록
    drawBlocks();

    // 아이템
    drawItems();

    // Impact particles
    drawImpactParticles();

    // 착지 플래시
    drawLandingFlash();

    // Motion trail
    drawMotionTrail();

    // 플레이어
    drawPlayer();

    // Falling danger effect
    if (player.velocityY > 8 && !player.isOnGround) {
        const dangerIntensity = Math.min(1, (player.velocityY - 8) / 10);

        // Red screen tint
        ctx.fillStyle = `rgba(255, 0, 0, ${dangerIntensity * 0.15})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 향상된 스피드 라인 - 더 역동적
        ctx.lineWidth = 1;
        for (let i = 0; i < 12; i++) {
            const lx = Math.random() * canvas.width;
            const ly = Math.random() * canvas.height * 0.8;
            const lineLen = 30 + dangerIntensity * 50;
            ctx.strokeStyle = `rgba(255, 255, 255, ${dangerIntensity * (0.1 + Math.random() * 0.3)})`;
            ctx.beginPath();
            ctx.moveTo(lx, ly);
            ctx.lineTo(lx + (Math.random() - 0.5) * 8, ly - lineLen);
            ctx.stroke();
        }

        // 화면 가장자리 빨간 경고 효과
        const warningGrad = ctx.createRadialGradient(
            canvas.width / 2, canvas.height / 2, canvas.height * 0.3,
            canvas.width / 2, canvas.height / 2, canvas.height * 0.7
        );
        warningGrad.addColorStop(0, 'rgba(255, 0, 0, 0)');
        warningGrad.addColorStop(1, `rgba(255, 0, 0, ${dangerIntensity * 0.2})`);
        ctx.fillStyle = warningGrad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 가장자리 모션 블러
        const blurGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
        blurGrad.addColorStop(0, `rgba(0, 0, 0, ${dangerIntensity * 0.3})`);
        blurGrad.addColorStop(0.3, 'rgba(0, 0, 0, 0)');
        blurGrad.addColorStop(0.7, 'rgba(0, 0, 0, 0)');
        blurGrad.addColorStop(1, `rgba(0, 0, 0, ${dangerIntensity * 0.3})`);
        ctx.fillStyle = blurGrad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Wind rush screen shake
        screenShakeIntensity = Math.max(screenShakeIntensity, dangerIntensity * 2);
    }

    // 동적 조명 (lighting overlay)
    drawLighting();

    // 비네트
    drawVignette();

    // 글리치 효과
    drawGlitch();

    // Foreground environment particles
    drawEnvParticles(true);

    ctx.restore();

    // 최고 높이 표시 (네온 HUD) with Heartbeat
    const scale = getHeartbeatScale();
    ctx.save();
    ctx.translate(canvas.width - 10, 30);
    ctx.scale(scale, scale);
    ctx.translate(-(canvas.width - 10), -30);

    ctx.fillStyle = '#5a8888';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(`MAX: ${maxHeight}m`, canvas.width - 10, 30);

    ctx.restore();

    // 파워업 HUD
    drawPowerupHUD();

    // 업적 알림
    drawAchievementNotif();

    // 진행률 바 업데이트
    updateProgressBar();

    // WebGL 후처리 적용
    if (typeof postProcessor !== 'undefined' && postProcessor.initialized) {
        // captureFrame으로 현재 게임 캔버스를 텍스처로 전송 후 처리
        if (postProcessor.captureFrame(canvas)) {
            const zone = getCurrentZone();
            const zoneProgress = (maxHeight % 100) / 100;
            postProcessor.processFrame({
                zone: zone,
                zoneProgress: zoneProgress,
                velocityY: player.velocityY,
                time: performance.now() / 1000
            });
        }
    }
}

// 타이틀 화면 그리기 - Pixel Art Title Screen
function drawTitleScreen() {
    const titleCanvas = document.getElementById('titleScreenCanvas');
    if (!titleCanvas) return;

    const titleCtx = titleCanvas.getContext('2d');
    const width = titleCanvas.width;
    const height = titleCanvas.height;
    const pixelSize = 2;

    // Clear canvas
    titleCtx.fillStyle = '#0a0a12';
    titleCtx.fillRect(0, 0, width, height);

    // Background cyberpunk city
    titleCtx.fillStyle = '#0c1420';
    titleCtx.globalAlpha = 0.8;
    for (let i = 0; i < width; i += 60) {
        titleCtx.fillRect(i, height - 120, 50, 100);
    }

    // Dim lit windows - amber
    titleCtx.fillStyle = '#6a5a2a';
    titleCtx.globalAlpha = 0.5;
    for (let i = 0; i < width; i += 60) {
        for (let y = 0; y < 80; y += 15) {
            titleCtx.fillRect(i + 10, height - 110 + y, 8, 8);
            titleCtx.fillRect(i + 25, height - 110 + y, 8, 8);
        }
    }

    // Dim signs on buildings
    titleCtx.strokeStyle = '#3a5858';
    titleCtx.lineWidth = 2;
    titleCtx.globalAlpha = 0.4;
    for (let i = 20; i < width; i += 80) {
        titleCtx.strokeRect(i, height - 140, 30, 20);
    }

    // Title: "JUMP JUMP" in muted teal
    titleCtx.fillStyle = '#4a7878';
    titleCtx.globalAlpha = 1;
    titleCtx.font = 'bold 60px Arial, monospace';
    titleCtx.textAlign = 'center';
    titleCtx.shadowColor = '#2a4848';
    titleCtx.shadowBlur = 12;
    titleCtx.fillText('JUMP', width / 2 - 60, height / 2 - 30);
    titleCtx.fillText('JUMP', width / 2 + 60, height / 2 - 30);

    // Glitch effect on title - muted mauve
    titleCtx.fillStyle = '#5a3a4a';
    titleCtx.globalAlpha = 0.35;
    titleCtx.fillText('JUMP', width / 2 - 62, height / 2 - 28);

    // Animated pixel particles - muted colors
    const time = Date.now() * 0.001;
    for (let i = 0; i < 40; i++) {
        const x = (i * 73 + time * 50) % width;
        const y = (i * 131 + Math.sin(time + i) * 50) % height;
        const colors = ['#5a3a4a', '#3a5858', '#3a5a4a'];
        titleCtx.fillStyle = colors[i % colors.length];
        titleCtx.globalAlpha = 0.3 + Math.sin(time + i) * 0.15;
        titleCtx.fillRect(x, y, pixelSize * 2, pixelSize * 2);
    }

    // Border - dim teal
    titleCtx.strokeStyle = '#2a4848';
    titleCtx.lineWidth = 2;
    titleCtx.globalAlpha = 0.3;
    titleCtx.shadowBlur = 6;
    titleCtx.shadowColor = '#1a3838';
    titleCtx.strokeRect(10, 10, width - 20, height - 20);
    titleCtx.shadowBlur = 0;

    titleCtx.globalAlpha = 1;

    // Continuously redraw for animation (only if title screen is visible)
    const titleEl = document.getElementById('mode-select');
    if (titleEl && titleEl.style.display !== 'none') {
        requestAnimationFrame(drawTitleScreen);
    }
}

// 점프 카운트 UI 업데이트
function updateJumpCountDisplay() {
    const jumpsLeft = maxJumps - currentJumps;
    document.getElementById('jumps-left').textContent = jumpsLeft;
}

// 게임 종료 체크 (내기 모드)
function checkGameEnd() {
    if (!gameStarted) return; // 게임이 리셋된 경우 무시
    if (gameMode === 'bet' && currentJumps >= maxJumps && player.isOnGround && !gameEnded) {
        gameEnded = true;
        showResult();
    } else if (gameMode === 'bet' && currentJumps >= maxJumps && !gameEnded) {
        // 아직 공중이면 다시 체크
        setTimeout(checkGameEnd, 100);
    }
}

// 랭킹 데이터 저장
function saveToRanking(height, jumps) {
    let rankings = JSON.parse(localStorage.getItem('jumpJumpRankings')) || [];

    const record = {
        height: height,
        jumps: jumps,
        timestamp: new Date().toLocaleString('ko-KR'),
        mode: gameMode,
        character: selectedCharacter
    };

    rankings.push(record);
    // 높이 순으로 정렬
    rankings.sort((a, b) => b.height - a.height);
    // 상위 50개만 유지
    rankings = rankings.slice(0, 50);

    localStorage.setItem('jumpJumpRankings', JSON.stringify(rankings));
}

// 랭킹 UI 업데이트
function updateRankingUI() {
    let rankings = JSON.parse(localStorage.getItem('jumpJumpRankings')) || [];
    const rankingList = document.getElementById('ranking-list');

    if (!rankingList) return;

    rankingList.innerHTML = '';

    if (rankings.length === 0) {
        rankingList.innerHTML = '<p style="text-align: center; color: #888;">랭킹 기록이 없습니다.</p>';
        return;
    }

    rankings.slice(0, 10).forEach((record, index) => {
        const rankItem = document.createElement('div');
        rankItem.className = 'rank-item';
        rankItem.innerHTML = `
            <span class="rank-number">${index + 1}</span>
            <span class="rank-height">${record.height}m</span>
            <span class="rank-info">${record.character} | ${record.mode === 'bet' ? record.jumps + '회' : '무제한'}</span>
            <span class="rank-date">${record.timestamp}</span>
        `;
        rankingList.appendChild(rankItem);
    });
}

// 결과 화면 표시
function showResult() {
    // 600m 이상 도달 시 엔딩 컷씬 재생
    if (maxHeight >= 600) {
        showEndingCutscene();
        return;
    }

    document.getElementById('game-container').style.display = 'none';
    document.getElementById('result-screen').style.display = 'block';
    document.getElementById('final-height').textContent = maxHeight;
    document.getElementById('total-jumps').textContent = currentJumps;

    // 랭킹에 저장
    saveToRanking(maxHeight, currentJumps);

    // 랭킹 UI 업데이트
    updateRankingUI();
}

// 게임 리셋
function resetGame() {
    player.x = canvas.width / 2 - 15;
    player.y = WORLD_FLOOR_Y - 40;
    player.velocityX = 0;
    player.velocityY = 0;
    player.isOnGround = true;
    player.isCharging = false;
    player.jumpPower = 0;
    player.direction = 0;
    player.facingRight = true;
    player.currentBlock = null;
    // Reset physics animations
    player.squashStretch = 1.0;
    player.animTimer = 0;
    player.breathePhase = 0;
    player.landingImpact = 0;
    player.trailParticles = [];
    player.coyoteTimer = 0;
    player.jumpBufferTimer = 0;
    player.wasOnGround = false;
    player.walkCycle = 0;
    player.isMoving = false;
    player.lastGroundY = WORLD_FLOOR_Y - 40;

    cameraY = 0;
    maxHeight = 0;
    currentJumps = 0;
    gameEnded = false;
    gameStarted = false;
    shownStories = new Set();
    lastCheckpointHeight = 0;
    checkpointFlashTimer = 0;
    sessionStorage.removeItem('jj_checkpoint');
    screenShakeIntensity = 0;
    hitStopFrames = 0;
    glitchTimer = 0;
    heartbeatTime = 0;
    // Reset lazy block generation state
    _blockGenState = null;
    // Reset environment particles and effects
    envParticles = [];
    lightSources = [];
    impactParticles = [];
    player.blinkTimer = 0;
    player.isBlinking = false;
    player.blinkDuration = 0;

    // BGM 정리
    if (currentZoneMusic) {
        currentZoneMusic.forEach(osc => {
            try { osc.stop(); } catch(e) {}
        });
        currentZoneMusic = null;
    }
    lastMusicZone = -1;

    generateBlocks();
    generateItems();
    // 업적 통계 리셋
    achievementStats.totalJumps = 0;
    achievementStats.maxHeight = 0;
    achievementStats.bounceLandings = 0;
    achievementStats.itemsCollected = 0;
    achievementStats.doubleJumpsUsed = 0;
    achievementStats.timeElapsed = 0;
    achievementQueue = [];
    achievementDisplayTimer = 0;
    currentAchievementNotif = null;
    // 파워업 초기화
    powerups.doubleJump.active = false; powerups.doubleJump.hasExtraJump = false; powerups.doubleJump.timer = 0;
    powerups.speedBoost.active = false; powerups.speedBoost.timer = 0;
    powerups.shield.active = false; powerups.shield.timer = 0;
    powerups.slowMotion.active = false; powerups.slowMotion.timer = 0;
    initEnvParticles();
}

// ===== 업적 시스템 =====
const ACHIEVEMENTS = [
    { id: 'first_jump',    title: '첫 도약',         desc: '처음으로 점프하다',             icon: '🚀', condition: s => s.totalJumps >= 1 },
    { id: 'height_50',     title: '하늘을 향해',      desc: '50m 도달',                    icon: '☁️', condition: s => s.maxHeight >= 50 },
    { id: 'height_200',    title: '구름 위에서',      desc: '200m 도달',                   icon: '🌤', condition: s => s.maxHeight >= 200 },
    { id: 'height_400',    title: '성층권',           desc: '400m 도달',                   icon: '🌙', condition: s => s.maxHeight >= 400 },
    { id: 'height_600',    title: '끝의 시작',        desc: '600m 정상 도달',               icon: '⭐', condition: s => s.maxHeight >= 600 },
    { id: 'jumps_100',     title: '점프 달인',        desc: '점프 100회',                  icon: '💪', condition: s => s.totalJumps >= 100 },
    { id: 'bounce_land',   title: '슈퍼 바운스',      desc: '바운스 블록에 착지',            icon: '🟢', condition: s => s.bounceLandings >= 1 },
    { id: 'item_collect',  title: '수집가',           desc: '아이템 5개 수집',              icon: '💎', condition: s => s.itemsCollected >= 5 },
    { id: 'double_jump',   title: '두 번 날다',       desc: '이중 점프 사용',               icon: '✨', condition: s => s.doubleJumpsUsed >= 1 },
    { id: 'speedrun',      title: '스피드런',         desc: '200m를 200초 이내 도달',       icon: '⚡', condition: s => s.maxHeight >= 200 && s.timeElapsed < 200 * 60 },
];

const achievementStats = {
    totalJumps: 0,
    maxHeight: 0,
    bounceLandings: 0,
    itemsCollected: 0,
    doubleJumpsUsed: 0,
    timeElapsed: 0
};

let unlockedAchievements = new Set(JSON.parse(localStorage.getItem('jumpjump_achievements') || '[]'));
let achievementQueue = []; // 화면에 표시할 업적 알림 대기열
let achievementDisplayTimer = 0;
let currentAchievementNotif = null;

function checkAchievements() {
    for (const ach of ACHIEVEMENTS) {
        if (unlockedAchievements.has(ach.id)) continue;
        if (ach.condition(achievementStats)) {
            unlockedAchievements.add(ach.id);
            localStorage.setItem('jumpjump_achievements', JSON.stringify([...unlockedAchievements]));
            achievementQueue.push(ach);
        }
    }
    // 알림 표시 처리
    if (achievementDisplayTimer > 0) {
        achievementDisplayTimer--;
    } else if (achievementQueue.length > 0) {
        currentAchievementNotif = achievementQueue.shift();
        achievementDisplayTimer = 180; // 3초
        playSFX('achievement');
    } else {
        currentAchievementNotif = null;
    }
}

function drawAchievementNotif() {
    if (!currentAchievementNotif || achievementDisplayTimer <= 0) return;
    const ach = currentAchievementNotif;
    const alpha = achievementDisplayTimer < 30
        ? achievementDisplayTimer / 30
        : achievementDisplayTimer > 150 ? (180 - achievementDisplayTimer) / 30 : 1;

    const nw = 220, nh = 50;
    const nx = canvas.width / 2 - nw / 2;
    const ny = 20;

    ctx.globalAlpha = alpha;

    // roundRect 폴리필 헬퍼
    function drawRoundedRect(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.arcTo(x + w, y, x + w, y + r, r);
        ctx.lineTo(x + w, y + h - r);
        ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
        ctx.lineTo(x + r, y + h);
        ctx.arcTo(x, y + h, x, y + h - r, r);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
        ctx.closePath();
    }

    // 배경
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    drawRoundedRect(nx, ny, nw, nh, 8);
    ctx.fill();
    // 금색 테두리
    ctx.strokeStyle = '#ffcc00';
    ctx.lineWidth = 1.5;
    drawRoundedRect(nx, ny, nw, nh, 8);
    ctx.stroke();
    // 아이콘
    ctx.font = '20px serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(ach.icon, nx + 10, ny + 32);
    // 텍스트
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = '#ffcc00';
    ctx.fillText('업적 해제!', nx + 40, ny + 18);
    ctx.font = '10px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(ach.title + ' — ' + ach.desc, nx + 40, ny + 34);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
}

// 게임 루프
let gameLoopId = null;

// 히트스톱 시스템
let hitStopFrames = 0;

function triggerHitStop(frames) {
    hitStopFrames = Math.max(hitStopFrames, frames);
}

function gameLoop() {
    if (!gameEnded) {
        if (hitStopFrames > 0) {
            hitStopFrames--;
            // 히트스톱 중에는 update 건너뜀 → 화면만 그려서 "동결" 연출
        } else {
            update();
        }
    }
    render();
    gameLoopId = requestAnimationFrame(gameLoop);
}

// 키보드 이벤트
document.addEventListener('keydown', (e) => {
    // Initialize audio on first interaction
    if (!audioInitialized) {
        initAudio();
    }

    if (e.code === 'ArrowLeft') {
        keys.left = true;
    }
    if (e.code === 'ArrowRight') {
        keys.right = true;
    }
    if (e.code === 'Space' && !keys.space) {
        keys.space = true;
        player.jumpBufferTimer = JUMP_BUFFER_TIME;
        if (gameStarted && (player.isOnGround || player.coyoteTimer > 0)) {
            player.isCharging = true;
            player.jumpPower = 0;
            player.coyoteTimer = 0; // 코요테 타임 소진
            playSFX('jump_charge');
        } else if (gameStarted && !player.isOnGround && powerups.doubleJump.active && powerups.doubleJump.hasExtraJump) {
            // 이중 점프: 공중에서 즉시 점프 (충전 없이 고정 파워)
            powerups.doubleJump.hasExtraJump = false;
            achievementStats.doubleJumpsUsed++;
            achievementStats.totalJumps++;
            player.velocityY = -MAX_JUMP_POWER * 0.85;
            player.squashStretch = 1.4;
            playSFX('jump_release');
            // 이중 점프 파티클
            for (let i = 0; i < 8; i++) {
                const angle = Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
                impactParticles.push({
                    x: player.x + player.width / 2,
                    y: player.y + player.height,
                    vx: Math.cos(angle) * (1 + Math.random() * 2),
                    vy: Math.sin(angle) * 2 + 1,
                    life: 1.0, decay: 0.05,
                    color: '#ffdd00', size: 3
                });
            }
        }
    }
    // ESC 키로 게임 종료
    if (e.code === 'Escape' && gameStarted && !gameEnded) {
        gameEnded = true;
        showResult();
    }
    // 게임 진행 중일 때만 기본 동작 방지 (입력 필드에서는 허용)
    if (gameStarted && (e.code === 'Space' || e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'Escape')) {
        e.preventDefault();
    }
});

document.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft') {
        keys.left = false;
    }
    if (e.code === 'ArrowRight') {
        keys.right = false;
    }
    if (e.code === 'Space') {
        keys.space = false;
    }
});

// ===== 모바일 터치 컨트롤 =====
function setupTouchControls() {
    const btnLeft  = document.getElementById('touch-left');
    const btnRight = document.getElementById('touch-right');
    const btnJump  = document.getElementById('touch-jump');
    if (!btnLeft || !btnRight || !btnJump) return;

    function pressLeft(e)   { e.preventDefault(); keys.left = true;  btnLeft.classList.add('pressed'); }
    function releaseLeft(e) { e.preventDefault(); keys.left = false; btnLeft.classList.remove('pressed'); }
    function pressRight(e)  { e.preventDefault(); keys.right = true;  btnRight.classList.add('pressed'); }
    function releaseRight(e){ e.preventDefault(); keys.right = false; btnRight.classList.remove('pressed'); }

    function pressJump(e) {
        e.preventDefault();
        btnJump.classList.add('pressed');
        // 터치 시 오디오 컨텍스트 초기화 (브라우저 정책)
        initAudio();
        if (!keys.space) {
            const evDown = new KeyboardEvent('keydown', { code: 'Space', bubbles: true });
            document.dispatchEvent(evDown);
        }
    }
    function releaseJump(e) {
        e.preventDefault();
        btnJump.classList.remove('pressed');
        const evUp = new KeyboardEvent('keyup', { code: 'Space', bubbles: true });
        document.dispatchEvent(evUp);
    }

    btnLeft.addEventListener('touchstart',  pressLeft,    { passive: false });
    btnLeft.addEventListener('touchend',    releaseLeft,  { passive: false });
    btnLeft.addEventListener('touchcancel', releaseLeft,  { passive: false });
    btnRight.addEventListener('touchstart',  pressRight,   { passive: false });
    btnRight.addEventListener('touchend',    releaseRight, { passive: false });
    btnRight.addEventListener('touchcancel', releaseRight, { passive: false });
    btnJump.addEventListener('touchstart',  pressJump,    { passive: false });
    btnJump.addEventListener('touchend',    releaseJump,  { passive: false });
    btnJump.addEventListener('touchcancel', releaseJump,  { passive: false });

    // 마우스 클릭도 지원 (데스크톱 테스트용)
    btnLeft.addEventListener('mousedown',  pressLeft);    btnLeft.addEventListener('mouseup',   releaseLeft);
    btnRight.addEventListener('mousedown', pressRight);   btnRight.addEventListener('mouseup',  releaseRight);
    btnJump.addEventListener('mousedown',  pressJump);    btnJump.addEventListener('mouseup',   releaseJump);
}

// Initialize title screen and post-processing on page load
window.addEventListener('load', () => {
    const titleCanvas = document.getElementById('titleScreenCanvas');
    if (titleCanvas) {
        titleCanvas.width = 500;
        titleCanvas.height = 300;
        drawTitleScreen();
    }

    // WebGL 후처리 파이프라인 초기화
    if (typeof postProcessor !== 'undefined') {
        const gameCanvas = document.getElementById('gameCanvas');
        const ppCanvas = document.getElementById('postProcessCanvas');
        if (gameCanvas && ppCanvas) {
            ppCanvas.width = gameCanvas.width;
            ppCanvas.height = gameCanvas.height;
            postProcessor.init(gameCanvas, ppCanvas);
        }
    }

    // 모바일 터치 컨트롤 설정
    setupTouchControls();
});

// 게임 모드 선택 이벤트
document.querySelectorAll('.mode-card').forEach(card => {
    card.addEventListener('click', () => {
        // Initialize audio on first interaction
        if (!audioInitialized) {
            initAudio();
        }

        gameMode = card.dataset.mode;
        document.getElementById('mode-select').style.display = 'none';

        if (gameMode === 'bet') {
            // 내기 모드: 점프 횟수 설정 화면으로
            document.getElementById('bet-setup').style.display = 'block';
        } else {
            // 일반 모드: 캐릭터 선택으로
            document.getElementById('character-select').style.display = 'block';
        }
    });
});

// 점프 횟수 조절 버튼
document.getElementById('count-minus').addEventListener('click', () => {
    const input = document.getElementById('jump-count');
    const value = parseInt(input.value) || 10;
    input.value = Math.max(1, value - 1);
});

document.getElementById('count-plus').addEventListener('click', () => {
    const input = document.getElementById('jump-count');
    const value = parseInt(input.value) || 10;
    input.value = Math.min(100, value + 1);
});

// 프리셋 버튼
document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.getElementById('jump-count').value = btn.dataset.count;
    });
});

// 점프 횟수 확인 버튼
document.getElementById('confirm-jump-count').addEventListener('click', () => {
    maxJumps = parseInt(document.getElementById('jump-count').value) || 10;
    document.getElementById('bet-setup').style.display = 'none';
    document.getElementById('character-select').style.display = 'block';
});

// 캐릭터 선택 이벤트
document.querySelectorAll('.character-card').forEach(card => {
    card.addEventListener('click', () => {
        // Initialize audio on first interaction
        if (!audioInitialized) {
            initAudio();
        }

        selectedCharacter = card.dataset.character;
        document.getElementById('character-select').style.display = 'none';

        // 튜토리얼 표시 (스킵하지 않은 경우)
        showTutorial();
    });
});

// 다시하기 버튼
document.getElementById('restart-btn').addEventListener('click', () => {
    document.getElementById('result-screen').style.display = 'none';
    document.getElementById('mode-select').style.display = 'block';
    document.getElementById('jump-count-display').style.display = 'none';
    // 기존 게임 루프 정지
    if (gameLoopId) {
        cancelAnimationFrame(gameLoopId);
        gameLoopId = null;
    }
    resetGame();
    // 타이틀 화면 애니메이션 재시작
    drawTitleScreen();
});

// 랭킹 보기 버튼
document.getElementById('view-ranking-btn').addEventListener('click', () => {
    document.getElementById('mode-select').style.display = 'none';
    document.getElementById('ranking-view').style.display = 'block';
    showFullRanking();
});

// 랭킹 돌아가기 버튼
document.getElementById('ranking-back-btn').addEventListener('click', () => {
    document.getElementById('ranking-view').style.display = 'none';
    document.getElementById('mode-select').style.display = 'block';
});

// 종료 버튼
document.getElementById('quit-btn').addEventListener('click', () => {
    if (gameStarted && !gameEnded) {
        gameEnded = true;
        showResult();
    }
});

// 전체 랭킹 표시
function showFullRanking() {
    let rankings = JSON.parse(localStorage.getItem('jumpJumpRankings')) || [];
    const rankingViewList = document.getElementById('ranking-view-list');

    rankingViewList.innerHTML = '';

    if (rankings.length === 0) {
        rankingViewList.innerHTML = '<p style="text-align: center; color: #888; padding: 40px;">아직 기록이 없습니다.<br>게임을 플레이해보세요!</p>';
        return;
    }

    rankings.forEach((record, index) => {
        const rankItem = document.createElement('div');
        rankItem.className = 'rank-item';
        rankItem.innerHTML = `
            <span class="rank-number">${index + 1}</span>
            <span class="rank-height">${record.height}m</span>
            <span class="rank-info">${record.character} | ${record.mode === 'bet' ? record.jumps + '회' : '무제한'}</span>
            <span class="rank-date">${record.timestamp}</span>
        `;
        rankingViewList.appendChild(rankItem);
    });
}

// ===== 엔딩 컷씬 시스템 =====
const endingScenes = [
    { text: "길고 긴 여정이었다...", duration: 3000 },
    { text: "어둠 속에서 포기하지 않았기에\n이곳까지 올 수 있었다.", duration: 4000 },
    { text: "그리고 마침내...", duration: 2500 },
    { text: "아이를 찾았다.", duration: 3000 },
    { text: "\"아빠... 올 줄 알았어요.\"", duration: 3500 },
    { text: "이제 함께 돌아가자.\n다시는 놓지 않을게.", duration: 4000 }
];

const characterEndingText = {
    human: "아이를 품에 안았다. 따뜻하다.",
    skeleton: "뼈만 남은 손으로 아이를 감싸 안았다.\n잊고 있었던 온기가 돌아온다.",
    dog: "꼬리를 미친 듯이 흔들며 아이의 얼굴을 핥았다.\n아이의 웃음소리가 울려 퍼진다.",
    cat: "조용히 아이의 무릎 위에 올라갔다.\n그르렁거리는 소리가 모든 것을 말해준다."
};

let endingSceneIndex = 0;
let endingTimer = null;

function showEndingCutscene() {
    // 게임 루프 정지
    if (gameLoopId) {
        cancelAnimationFrame(gameLoopId);
        gameLoopId = null;
    }

    document.getElementById('game-container').style.display = 'none';
    document.getElementById('ending-screen').style.display = 'flex';

    endingSceneIndex = 0;
    playSFX('achievement');
    playEndingScene();
}

function playEndingScene() {
    const textEl = document.getElementById('ending-text');

    if (endingSceneIndex < endingScenes.length) {
        const scene = endingScenes[endingSceneIndex];
        textEl.style.animation = 'none';
        textEl.offsetHeight; // 리플로우 트리거
        textEl.style.animation = 'textReveal 2s ease-in';
        textEl.textContent = scene.text;

        endingSceneIndex++;
        endingTimer = setTimeout(playEndingScene, scene.duration);
    } else {
        // 캐릭터별 마지막 대사
        textEl.style.animation = 'none';
        textEl.offsetHeight;
        textEl.style.animation = 'textReveal 2s ease-in';
        textEl.textContent = characterEndingText[selectedCharacter] || characterEndingText.human;

        // 3초 후 크레딧 표시
        setTimeout(showEndingCredits, 4000);
    }
}

function showEndingCredits() {
    document.getElementById('ending-content').style.display = 'none';
    const credits = document.getElementById('ending-credits');
    credits.style.display = 'block';

    // 통계 채우기
    document.getElementById('ending-height').textContent = maxHeight;
    const charNames = { human: '인간', skeleton: '해골', dog: '강아지', cat: '고양이' };
    document.getElementById('ending-character').textContent = charNames[selectedCharacter] || selectedCharacter;
    document.getElementById('ending-jumps').textContent = currentJumps;

    // 랭킹 저장
    saveToRanking(maxHeight, currentJumps);

    playSFX('achievement');
}

// 엔딩 다시하기 버튼
document.getElementById('ending-restart-btn').addEventListener('click', () => {
    if (endingTimer) clearTimeout(endingTimer);
    document.getElementById('ending-screen').style.display = 'none';
    document.getElementById('ending-content').style.display = 'block';
    document.getElementById('ending-credits').style.display = 'none';
    document.getElementById('mode-select').style.display = 'block';
    document.getElementById('jump-count-display').style.display = 'none';
    resetGame();
    drawTitleScreen();
});

// ===== 튜토리얼 시스템 =====
let tutorialSkipped = false;

function showTutorial() {
    // 로컬스토리지에서 스킵 여부 확인
    if (localStorage.getItem('jumpJumpSkipTutorial') === 'true') {
        tutorialSkipped = true;
        document.getElementById('tutorial-screen').style.display = 'none';
        document.getElementById('game-container').style.display = 'flex';

        if (gameMode === 'bet') {
            document.getElementById('jump-count-display').style.display = 'block';
            updateJumpCountDisplay();
        }
        startGame();
        return;
    }

    document.getElementById('tutorial-screen').style.display = 'block';
}

// 튜토리얼 시작 버튼
document.getElementById('tutorial-start-btn').addEventListener('click', () => {
    document.getElementById('tutorial-screen').style.display = 'none';
    document.getElementById('game-container').style.display = 'flex';

    if (gameMode === 'bet') {
        document.getElementById('jump-count-display').style.display = 'block';
        updateJumpCountDisplay();
    }
    startGame();
});

// 튜토리얼 건너뛰기 버튼
document.getElementById('tutorial-skip-btn').addEventListener('click', () => {
    localStorage.setItem('jumpJumpSkipTutorial', 'true');
    document.getElementById('tutorial-screen').style.display = 'none';
    document.getElementById('game-container').style.display = 'flex';

    if (gameMode === 'bet') {
        document.getElementById('jump-count-display').style.display = 'block';
        updateJumpCountDisplay();
    }
    startGame();
});

// 게임 시작 함수
function startGame() {
    if (gameStarted) return;
    gameStarted = true;
    generateBlocks();
    generateItems();
    // 기존 게임 루프가 돌고 있으면 중지
    if (gameLoopId) {
        cancelAnimationFrame(gameLoopId);
        gameLoopId = null;
    }
    gameLoop();
}
