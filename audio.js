// ===== AUDIO SYSTEM =====
// Procedural audio synthesis system for game effects and background music
// Depends on: config.js (for getCurrentZone())

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

// Zone-based ambient sound system
let lastAmbientTime = 0;
function updateAmbientSounds() {
    if (!audioCtx) return;
    const now = Date.now();
    if (now - lastAmbientTime < 3000) return; // Every 3 seconds
    lastAmbientTime = now;

    const zone = getCurrentZone();

    // Zone-specific ambient sounds
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
