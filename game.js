// game.js - Main entry point (lean orchestrator)
// Dependencies: config.js, audio.js, entities.js, physics.js, renderer.js, ui.js, postprocess.js

// ===== CANVAS SETUP =====
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width  = CANVAS_LOGICAL_W;
canvas.height = CANVAS_LOGICAL_H;

function resizeCanvas() {
    const container = document.getElementById('game-container');
    if (!container) return;
    const vpW = window.innerWidth;
    const vpH = window.innerHeight;
    const scaleX = vpW / CANVAS_LOGICAL_W;
    const scaleY = vpH / CANVAS_LOGICAL_H;
    const scale  = Math.min(scaleX, scaleY, 1.4);
    canvas.style.width  = Math.floor(CANVAS_LOGICAL_W * scale) + 'px';
    canvas.style.height = Math.floor(CANVAS_LOGICAL_H * scale) + 'px';
    const ppCanvas = document.getElementById('postProcessCanvas');
    if (ppCanvas) {
        ppCanvas.style.width  = canvas.style.width;
        ppCanvas.style.height = canvas.style.height;
    }
}
window.addEventListener('resize', resizeCanvas);
document.addEventListener('DOMContentLoaded', () => {
    const observer = new MutationObserver(() => {
        const gc = document.getElementById('game-container');
        if (gc && gc.style.display !== 'none') resizeCanvas();
    });
    observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['style'] });
});

// ===== GAME STATE =====
let selectedCharacter = 'human';
let gameStarted = false;
let gameMode = 'normal';
let maxJumps = 10;
let currentJumps = 0;
let gameEnded = false;
let cameraY = 0;
let maxHeight = 0;
let lastCheckpointHeight = 0;
let checkpointFlashTimer = 0;
let gameLoopId = null;
let hitStopFrames = 0;

// ===== PLAYER =====
const player = {
    x: canvas.width / 2 - 15,
    y: WORLD_FLOOR_Y - 40,
    width: 30,
    height: 40,
    velocityX: 0,
    velocityY: 0,
    isOnGround: true,
    isCharging: false,
    jumpPower: 0,
    direction: 0,
    facingRight: true,
    currentBlock: null,
    squashStretch: 1.0,
    animTimer: 0,
    breathePhase: 0,
    landingImpact: 0,
    trailParticles: [],
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

// ===== ACHIEVEMENT STATS =====
const achievementStats = {
    totalJumps: 0,
    maxHeight: 0,
    bounceLandings: 0,
    itemsCollected: 0,
    doubleJumpsUsed: 0,
    timeElapsed: 0
};

// ===== ZONE HELPERS =====
function getCurrentZone() {
    return Math.min(9, Math.floor(maxHeight / 100));
}

function getCurrentZoneTheme() {
    return zones[getCurrentZone()];
}

// Initialize scanline cache now that canvas is ready
scanlineCache = createScanlineCache();

// ===== HIT STOP =====
function triggerHitStop(frames) {
    hitStopFrames = Math.max(hitStopFrames, frames);
}

// ===== UPDATE =====
function update() {
    // Lazy block generation
    generateMoreBlocks();

    // Items & powerups
    updateItems();
    updatePowerups();

    // Achievement stats
    achievementStats.maxHeight = maxHeight;
    achievementStats.timeElapsed++;
    checkAchievements();

    // Environment & impact particles
    updateEnvParticles();
    updateImpactParticles();

    // Physics animations & lighting
    updatePhysicsAnimation();
    updateLighting();

    // Fog particles
    for (let fog of fogParticles) {
        fog.y += fog.speed;
        if (fog.y > canvas.height) {
            fog.y = -10;
            fog.x = Math.random() * canvas.width;
        }
    }

    // Block updates (only animate near-screen blocks)
    for (let block of blocks) {
        const blockScreenY = block.y + cameraY;
        const isNearScreen = blockScreenY > -300 && blockScreenY < canvas.height + 300;

        if (block.type === 'moving') {
            block.moveOffset += block.moveSpeed * block.moveDirection;
            if (block.moveOffset > block.moveRange || block.moveOffset < -block.moveRange) {
                block.moveDirection *= -1;
            }
        }

        if (block.type === 'crumbling' && block.isCrumbling) {
            block.crumbleTimer += 1;
            if (block.crumbleTimer > 60) {
                block.opacity = Math.max(0, 1 - (block.crumbleTimer - 60) / 30);
                if (block.crumbleTimer > 90) {
                    block.disappeared = true;
                }
            }
        }

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

        if (block.wobble > 0 && isNearScreen) {
            block.wobble *= 0.9;
            if (block.wobble < 0.01) block.wobble = 0;
        }
    }

    // Glitch & screen shake
    glitchTimer += 1;
    screenShakeIntensity = Math.max(0, screenShakeIntensity - 0.15);

    // Coyote time
    if (player.isOnGround) {
        player.coyoteTimer = COYOTE_TIME;
        player.wasOnGround = true;
        player.lastGroundY = player.y;
    } else {
        if (player.coyoteTimer > 0) player.coyoteTimer--;
    }

    // Jump buffer
    if (player.jumpBufferTimer > 0) player.jumpBufferTimer--;

    // Standing block state check
    if (player.isOnGround && player.currentBlock) {
        const cb = player.currentBlock;
        if (cb.disappeared) {
            player.isOnGround = false;
            player.currentBlock = null;
        }
        if (cb.type === 'moving' && !cb.disappeared) {
            player.x += cb.moveSpeed * cb.moveDirection;
            if (player.x < 0) player.x = 0;
            if (player.x + player.width > canvas.width) player.x = canvas.width - player.width;
        }
        if (cb.type === 'conveyor') {
            player.x += cb.conveyorDirection * cb.conveyorSpeed;
            if (player.x < 0) { player.x = 0; player.velocityX = 0; }
            if (player.x + player.width > canvas.width) { player.x = canvas.width - player.width; player.velocityX = 0; }
        }
    }

    // Jump buffer check - auto-execute buffered jump on landing
    if (player.isOnGround && player.jumpBufferTimer > 0 && !player.isCharging && keys.space) {
        player.isCharging = true;
        player.jumpPower = 0;
        player.jumpBufferTimer = 0;
        playSFX('jump_charge');
    }

    // Jump charge
    if (player.isCharging && player.isOnGround) {
        player.jumpPower = Math.min(player.jumpPower + CHARGE_SPEED, MAX_JUMP_POWER);
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

    // Jump execute (on space release)
    if (!keys.space && player.isCharging && player.isOnGround && !gameEnded) {
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
        player.squashStretch = 1.3;
        achievementStats.totalJumps++;

        if (gameMode === 'bet') {
            currentJumps++;
            updateJumpCountDisplay();
            if (currentJumps >= maxJumps) {
                setTimeout(checkGameEnd, 100);
            }
        }
    }

    // Slow motion factor
    const slowFactor = powerups.slowMotion.active ? 0.45 : 1.0;

    // Gravity
    if (!player.isOnGround) {
        player.velocityY += GRAVITY * slowFactor;
        if (!keys.space && player.velocityY < 0) {
            player.velocityY += GRAVITY * VARIABLE_JUMP_MULTIPLIER * slowFactor;
        }
    }

    // Air control
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

    // Speed boost
    if (powerups.speedBoost.active) {
        const boostedSpeed = HORIZONTAL_SPEED * 1.7;
        if (keys.left && player.velocityX > -boostedSpeed) {
            player.velocityX = -boostedSpeed;
        }
        if (keys.right && player.velocityX < boostedSpeed) {
            player.velocityX = boostedSpeed;
        }
    }

    // Position update
    player.x += player.velocityX * slowFactor;
    player.y += player.velocityY * slowFactor;

    // Walk cycle
    if (player.isOnGround && Math.abs(player.velocityX) > 0.5) {
        player.isMoving = true;
        player.walkCycle += 0.15;
    } else {
        player.isMoving = false;
    }

    // Footstep sounds
    if (player.isOnGround && Math.abs(player.velocityX) > 1 && Math.random() < 0.1) {
        playSFX('footstep');
    }

    // Wind rush sound
    if (player.velocityY > 10 && !player.isOnGround && Math.random() < 0.1) {
        playSFX('wind_rush');
    }

    // Friction
    if (!player.isOnGround) {
        player.velocityX *= AIR_FRICTION;
    } else {
        const isOnIce = player.currentBlock && player.currentBlock.type === 'ice';
        const friction = isOnIce ? 0.998 : GROUND_FRICTION;
        player.velocityX *= friction;
        if (!isOnIce && Math.abs(player.velocityX) < 0.1) player.velocityX = 0;
    }

    // Collision checks
    checkWallCollision();
    checkBlockSideCollision();
    checkLanding();

    // Checkpoint respawn on fall
    if (player.isOnGround && (WORLD_FLOOR_Y - player.y - player.height) / 10 < 5) {
        if (powerups.shield.active) {
            powerups.shield.active = false;
            screenShakeIntensity = 5;
            showStoryDialog('✦ 실드가 추락을 막았습니다!', false);
            if (lastCheckpointHeight > 0) respawnAtCheckpoint();
            else {
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

    // Camera system - dead zone + look-ahead
    const CAMERA_DEAD_ZONE_TOP = canvas.height * 0.35;
    const CAMERA_DEAD_ZONE_BOTTOM = canvas.height * 0.65;
    const LOOK_AHEAD_AMOUNT = 80;

    const playerScreenY = player.y + cameraY;
    let targetCameraY = cameraY;

    if (playerScreenY < CAMERA_DEAD_ZONE_TOP) {
        targetCameraY = CAMERA_DEAD_ZONE_TOP - player.y;
    } else if (playerScreenY > CAMERA_DEAD_ZONE_BOTTOM) {
        targetCameraY = CAMERA_DEAD_ZONE_BOTTOM - player.y;
    }

    if (player.velocityY < -5) {
        targetCameraY += LOOK_AHEAD_AMOUNT;
    } else if (player.velocityY > 8) {
        targetCameraY -= LOOK_AHEAD_AMOUNT * 0.5;
    }

    const cameraSmoothness = player.velocityY < 0 ? 0.12 : 0.08;
    cameraY += (targetCameraY - cameraY) * cameraSmoothness;

    if (player.landingImpact > 0.5) {
        cameraY -= player.landingImpact * 6;
    }

    // Max height update
    const currentHeight = Math.floor((WORLD_FLOOR_Y - player.y - player.height) / 10);
    if (currentHeight > maxHeight) {
        maxHeight = currentHeight;
        checkStoryMilestone(currentHeight);
        checkCheckpoint(currentHeight);
    }

    // UI update
    document.getElementById('height').textContent = Math.max(0, currentHeight);
    document.getElementById('power-bar').style.width = (player.jumpPower / MAX_JUMP_POWER * 100) + '%';

    // BGM
    updateBGM();
    updateAmbientSounds();
}

// ===== RENDER =====
function render() {
    const shakeX = screenShakeIntensity > 0 ? (Math.random() - 0.5) * screenShakeIntensity : 0;
    const shakeY = screenShakeIntensity > 0 ? (Math.random() - 0.5) * screenShakeIntensity : 0;

    ctx.save();
    ctx.translate(shakeX, shakeY);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawBackground();
    drawEnvParticles(false);
    drawFog();
    drawFloor();
    drawBlocks();
    drawItems();
    drawImpactParticles();
    drawLandingFlash();
    drawMotionTrail();
    drawPlayer();

    // Falling danger effect
    if (player.velocityY > 8 && !player.isOnGround) {
        const dangerIntensity = Math.min(1, (player.velocityY - 8) / 10);

        ctx.fillStyle = `rgba(255, 0, 0, ${dangerIntensity * 0.15})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

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

        const warningGrad = ctx.createRadialGradient(
            canvas.width / 2, canvas.height / 2, canvas.height * 0.3,
            canvas.width / 2, canvas.height / 2, canvas.height * 0.7
        );
        warningGrad.addColorStop(0, 'rgba(255, 0, 0, 0)');
        warningGrad.addColorStop(1, `rgba(255, 0, 0, ${dangerIntensity * 0.2})`);
        ctx.fillStyle = warningGrad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const blurGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
        blurGrad.addColorStop(0, `rgba(0, 0, 0, ${dangerIntensity * 0.3})`);
        blurGrad.addColorStop(0.3, 'rgba(0, 0, 0, 0)');
        blurGrad.addColorStop(0.7, 'rgba(0, 0, 0, 0)');
        blurGrad.addColorStop(1, `rgba(0, 0, 0, ${dangerIntensity * 0.3})`);
        ctx.fillStyle = blurGrad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        screenShakeIntensity = Math.max(screenShakeIntensity, dangerIntensity * 2);
    }

    drawLighting();
    drawVignette();
    drawGlitch();
    drawEnvParticles(true);

    ctx.restore();

    // MAX height HUD with heartbeat
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

    drawPowerupHUD();
    drawAchievementNotif();
    updateProgressBar();

    // WebGL post-processing
    if (typeof postProcessor !== 'undefined' && postProcessor.initialized) {
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

// ===== GAME LOOP =====
function gameLoop() {
    if (!gameEnded) {
        if (hitStopFrames > 0) {
            hitStopFrames--;
        } else {
            update();
        }
    }
    render();
    gameLoopId = requestAnimationFrame(gameLoop);
}

// ===== START / RESET =====
function startGame() {
    if (gameStarted) return;
    gameStarted = true;
    generateBlocks();
    generateItems();
    if (gameLoopId) {
        cancelAnimationFrame(gameLoopId);
        gameLoopId = null;
    }
    gameLoop();
}

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
    _blockGenState = null;
    envParticles = [];
    lightSources = [];
    impactParticles = [];
    player.blinkTimer = 0;
    player.isBlinking = false;
    player.blinkDuration = 0;

    // BGM cleanup
    if (currentZoneMusic) {
        currentZoneMusic.forEach(osc => {
            try { osc.stop(); } catch(e) {}
        });
        currentZoneMusic = null;
    }
    lastMusicZone = -1;

    generateBlocks();
    generateItems();

    // Reset achievement stats
    achievementStats.totalJumps = 0;
    achievementStats.maxHeight = 0;
    achievementStats.bounceLandings = 0;
    achievementStats.itemsCollected = 0;
    achievementStats.doubleJumpsUsed = 0;
    achievementStats.timeElapsed = 0;
    achievementQueue = [];
    achievementDisplayTimer = 0;
    currentAchievementNotif = null;

    // Reset powerups
    powerups.doubleJump.active = false; powerups.doubleJump.hasExtraJump = false; powerups.doubleJump.timer = 0;
    powerups.speedBoost.active = false; powerups.speedBoost.timer = 0;
    powerups.shield.active = false; powerups.shield.timer = 0;
    powerups.slowMotion.active = false; powerups.slowMotion.timer = 0;
    initEnvParticles();
}

// ===== KEYBOARD EVENTS =====
document.addEventListener('keydown', (e) => {
    if (!audioInitialized) initAudio();

    if (e.code === 'ArrowLeft') keys.left = true;
    if (e.code === 'ArrowRight') keys.right = true;

    if (e.code === 'Space' && !keys.space) {
        keys.space = true;
        player.jumpBufferTimer = JUMP_BUFFER_TIME;
        if (gameStarted && (player.isOnGround || player.coyoteTimer > 0)) {
            player.isCharging = true;
            player.jumpPower = 0;
            player.coyoteTimer = 0;
            playSFX('jump_charge');
        } else if (gameStarted && !player.isOnGround && powerups.doubleJump.active && powerups.doubleJump.hasExtraJump) {
            powerups.doubleJump.hasExtraJump = false;
            achievementStats.doubleJumpsUsed++;
            achievementStats.totalJumps++;
            player.velocityY = -MAX_JUMP_POWER * 0.85;
            player.squashStretch = 1.4;
            playSFX('jump_release');
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

    if (e.code === 'Escape' && gameStarted && !gameEnded) {
        gameEnded = true;
        showResult();
    }

    if (gameStarted && (e.code === 'Space' || e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'Escape')) {
        e.preventDefault();
    }
});

document.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft') keys.left = false;
    if (e.code === 'ArrowRight') keys.right = false;
    if (e.code === 'Space') keys.space = false;
});

// ===== PAGE LOAD INITIALIZATION =====
window.addEventListener('load', () => {
    const titleCanvas = document.getElementById('titleScreenCanvas');
    if (titleCanvas) {
        titleCanvas.width = 500;
        titleCanvas.height = 300;
        drawTitleScreen();
    }

    // WebGL post-processing pipeline init
    if (typeof postProcessor !== 'undefined') {
        const gameCanvas = document.getElementById('gameCanvas');
        const ppCanvas = document.getElementById('postProcessCanvas');
        if (gameCanvas && ppCanvas) {
            ppCanvas.width = gameCanvas.width;
            ppCanvas.height = gameCanvas.height;
            postProcessor.init(gameCanvas, ppCanvas);
        }
    }

    setupTouchControls();
});

// ===== UI EVENT LISTENERS =====

// Mode selection
document.querySelectorAll('.mode-card').forEach(card => {
    card.addEventListener('click', () => {
        if (!audioInitialized) initAudio();
        gameMode = card.dataset.mode;
        document.getElementById('mode-select').style.display = 'none';
        if (gameMode === 'bet') {
            document.getElementById('bet-setup').style.display = 'block';
        } else {
            document.getElementById('character-select').style.display = 'block';
        }
    });
});

// Jump count controls
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

document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.getElementById('jump-count').value = btn.dataset.count;
    });
});

document.getElementById('confirm-jump-count').addEventListener('click', () => {
    maxJumps = parseInt(document.getElementById('jump-count').value) || 10;
    document.getElementById('bet-setup').style.display = 'none';
    document.getElementById('character-select').style.display = 'block';
});

// Character selection
document.querySelectorAll('.character-card').forEach(card => {
    card.addEventListener('click', () => {
        if (!audioInitialized) initAudio();
        selectedCharacter = card.dataset.character;
        document.getElementById('character-select').style.display = 'none';
        showTutorial();
    });
});

// Restart button
document.getElementById('restart-btn').addEventListener('click', () => {
    document.getElementById('result-screen').style.display = 'none';
    document.getElementById('mode-select').style.display = 'block';
    document.getElementById('jump-count-display').style.display = 'none';
    if (gameLoopId) {
        cancelAnimationFrame(gameLoopId);
        gameLoopId = null;
    }
    resetGame();
    drawTitleScreen();
});

// Ranking buttons
document.getElementById('view-ranking-btn').addEventListener('click', () => {
    document.getElementById('mode-select').style.display = 'none';
    document.getElementById('ranking-view').style.display = 'block';
    showFullRanking();
});

document.getElementById('ranking-back-btn').addEventListener('click', () => {
    document.getElementById('ranking-view').style.display = 'none';
    document.getElementById('mode-select').style.display = 'block';
});

// Quit button
document.getElementById('quit-btn').addEventListener('click', () => {
    if (gameStarted && !gameEnded) {
        gameEnded = true;
        showResult();
    }
});

// Ending restart button
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

// Tutorial buttons
document.getElementById('tutorial-start-btn').addEventListener('click', () => {
    document.getElementById('tutorial-screen').style.display = 'none';
    document.getElementById('game-container').style.display = 'flex';
    if (gameMode === 'bet') {
        document.getElementById('jump-count-display').style.display = 'block';
        updateJumpCountDisplay();
    }
    startGame();
});

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
