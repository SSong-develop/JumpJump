// ===== AUDIO SYSTEM (Howler.js + Procedural Synthesis) =====
// Uses OfflineAudioContext to pre-render procedural sounds into buffers,
// then wraps them with Howler.js for cross-browser playback, mobile auto-unlock,
// volume management, pooling, and spatial audio support.
// Depends on: config.js (for getCurrentZone()), howler.js (CDN)

let audioCtx = null;
let bgmGainNode = null;
let currentZoneMusic = null;
let lastMusicZone = -1;
let audioInitialized = false;

// Howler instances
const sfxHowls = {};
let bgmHowls = {};
let currentBgmHowl = null;
let masterVolume = 1.0;
let sfxVolume = 0.8;
let bgmVolume = 0.3;

// ===== WAV Encoding Utility =====
function audioBufferToWavDataURI(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitsPerSample = 16;
    const blockAlign = numChannels * bitsPerSample / 8;
    const byteRate = sampleRate * blockAlign;
    const dataLength = buffer.length * blockAlign;
    const headerLength = 44;
    const totalLength = headerLength + dataLength;
    const arrayBuffer = new ArrayBuffer(totalLength);
    const view = new DataView(arrayBuffer);

    function writeString(offset, str) {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    }

    writeString(0, 'RIFF');
    view.setUint32(4, totalLength - 8, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataLength, true);

    // Interleave channels and convert to 16-bit PCM
    const channels = [];
    for (let ch = 0; ch < numChannels; ch++) {
        channels.push(buffer.getChannelData(ch));
    }

    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
        for (let ch = 0; ch < numChannels; ch++) {
            let sample = channels[ch][i];
            sample = Math.max(-1, Math.min(1, sample));
            sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
            view.setInt16(offset, sample | 0, true);
            offset += 2;
        }
    }

    // Convert to base64 data URI
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return 'data:audio/wav;base64,' + btoa(binary);
}

// ===== Procedural Sound Rendering =====
// Renders a sound effect using OfflineAudioContext
function renderSFX(synthFn, duration, sampleRate) {
    sampleRate = sampleRate || 44100;
    const offCtx = new OfflineAudioContext(1, Math.ceil(sampleRate * duration), sampleRate);
    synthFn(offCtx);
    return offCtx.startRendering();
}

// ===== SFX Synthesis Definitions =====
const SFX_DEFS = {
    jump_charge: {
        duration: 0.3,
        synth: (ctx) => {
            const now = 0;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.setValueAtTime(200, now);
            osc.frequency.exponentialRampToValueAtTime(400, now + 0.3);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
            osc.start(now);
            osc.stop(now + 0.3);
        }
    },
    jump_release: {
        duration: 0.15,
        synth: (ctx) => {
            const now = 0;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.setValueAtTime(600, now);
            osc.frequency.exponentialRampToValueAtTime(300, now + 0.15);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.15);
        }
    },
    landing: {
        duration: 0.1,
        synth: (ctx) => {
            const now = 0;
            const osc = ctx.createOscillator();
            const filter = ctx.createBiquadFilter();
            const gain = ctx.createGain();
            osc.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);
            filter.type = 'lowpass';
            filter.frequency.value = 200;
            osc.frequency.setValueAtTime(150, now);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
        }
    },
    footstep: {
        duration: 0.05,
        variants: 3,
        synth: (ctx, variant) => {
            const now = 0;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.setValueAtTime(100 + variant * 8, now);
            gain.gain.setValueAtTime(0.08, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
            osc.start(now);
            osc.stop(now + 0.05);
        }
    },
    rain: {
        duration: 0.08,
        variants: 4,
        synth: (ctx, variant) => {
            const now = 0;
            const osc = ctx.createOscillator();
            const filter = ctx.createBiquadFilter();
            const gain = ctx.createGain();
            osc.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);
            filter.type = 'highpass';
            filter.frequency.value = 3000 + variant * 500;
            osc.frequency.setValueAtTime(5000 + variant * 750, now);
            gain.gain.setValueAtTime(0.05, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
            osc.start(now);
            osc.stop(now + 0.08);
        }
    },
    crumble: {
        duration: 0.2,
        synth: (ctx) => {
            const now = 0;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.setValueAtTime(80, now);
            osc.frequency.exponentialRampToValueAtTime(30, now + 0.2);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
            osc.start(now);
            osc.stop(now + 0.2);
        }
    },
    bounce_block: {
        duration: 0.25,
        synth: (ctx) => {
            const now = 0;
            const osc1 = ctx.createOscillator();
            const osc2 = ctx.createOscillator();
            const merge = ctx.createGain();
            const gain = ctx.createGain();
            osc1.type = 'sine';
            osc2.type = 'sine';
            osc1.frequency.setValueAtTime(300, now);
            osc1.frequency.exponentialRampToValueAtTime(900, now + 0.08);
            osc2.frequency.setValueAtTime(200, now);
            osc2.frequency.exponentialRampToValueAtTime(600, now + 0.08);
            osc1.connect(merge);
            osc2.connect(merge);
            merge.connect(gain);
            gain.connect(ctx.destination);
            gain.gain.setValueAtTime(0.18, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
            osc1.start(now); osc1.stop(now + 0.25);
            osc2.start(now); osc2.stop(now + 0.25);
        }
    },
    ice_slide: {
        duration: 0.15,
        synth: (ctx) => {
            const now = 0;
            const osc = ctx.createOscillator();
            const filter = ctx.createBiquadFilter();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1200, now);
            osc.frequency.linearRampToValueAtTime(800, now + 0.15);
            filter.type = 'highpass';
            filter.frequency.value = 600;
            osc.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);
            gain.gain.setValueAtTime(0.06, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            osc.start(now); osc.stop(now + 0.15);
        }
    },
    ember: {
        duration: 0.15,
        variants: 3,
        synth: (ctx, variant) => {
            const now = 0;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.setValueAtTime(200 + variant * 100, now);
            gain.gain.setValueAtTime(0.06, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.15);
        }
    },
    heartbeat: {
        duration: 0.12,
        synth: (ctx) => {
            const now = 0;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.setValueAtTime(60, now);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
            osc.start(now);
            osc.stop(now + 0.12);
        }
    },
    wind_rush: {
        duration: 0.3,
        variants: 3,
        synth: (ctx, variant) => {
            const now = 0;
            const osc = ctx.createOscillator();
            const filter = ctx.createBiquadFilter();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.value = 100 + variant * 15;
            filter.type = 'bandpass';
            filter.frequency.value = 800;
            filter.Q.value = 0.5;
            osc.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);
            gain.gain.setValueAtTime(0.05, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
            osc.start(now);
            osc.stop(now + 0.3);
        }
    },
    story_appear: {
        duration: 0.6,
        synth: (ctx) => {
            const now = 0;
            const osc1 = ctx.createOscillator();
            const osc2 = ctx.createOscillator();
            const gain = ctx.createGain();
            const filter = ctx.createBiquadFilter();
            osc1.type = 'sine';
            osc2.type = 'sine';
            filter.type = 'lowpass';
            filter.frequency.value = 2000;
            osc1.connect(filter);
            osc2.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);
            osc1.frequency.setValueAtTime(523.25, now);
            osc1.frequency.exponentialRampToValueAtTime(783.99, now + 0.3);
            osc2.frequency.setValueAtTime(659.25, now + 0.1);
            osc2.frequency.exponentialRampToValueAtTime(1046.5, now + 0.4);
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.12, now + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
            osc1.start(now); osc1.stop(now + 0.5);
            osc2.start(now + 0.1); osc2.stop(now + 0.6);
        }
    },
    danger_ambient: {
        duration: 0.5,
        synth: (ctx) => {
            const now = 0;
            const osc1 = ctx.createOscillator();
            const osc2 = ctx.createOscillator();
            const gain = ctx.createGain();
            osc1.type = 'sawtooth';
            osc2.type = 'sine';
            osc1.frequency.setValueAtTime(40, now);
            osc1.frequency.exponentialRampToValueAtTime(30, now + 0.5);
            osc2.frequency.setValueAtTime(55, now);
            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(ctx.destination);
            gain.gain.setValueAtTime(0.08, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
            osc1.start(now); osc1.stop(now + 0.5);
            osc2.start(now); osc2.stop(now + 0.5);
        }
    },
    achievement: {
        duration: 0.72,
        synth: (ctx) => {
            const now = 0;
            const notes = [523.25, 659.25, 783.99, 1046.5];
            notes.forEach((freq, idx) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.value = freq;
                osc.connect(gain);
                gain.connect(ctx.destination);
                const startTime = now + idx * 0.08;
                gain.gain.setValueAtTime(0, startTime);
                gain.gain.linearRampToValueAtTime(0.1, startTime + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.4);
                osc.start(startTime);
                osc.stop(startTime + 0.4);
            });
        }
    },
    charge_loop: {
        duration: 0.2,
        synth: (ctx) => {
            const now = 0;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const filter = ctx.createBiquadFilter();
            osc.type = 'triangle';
            filter.type = 'lowpass';
            filter.frequency.value = 500;
            osc.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.setValueAtTime(100, now);
            osc.frequency.linearRampToValueAtTime(600, now + 1.5);
            gain.gain.setValueAtTime(0.06, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
            osc.start(now);
            osc.stop(now + 0.2);
        }
    },
    // === New interference mode SFX ===
    stomp_hit: {
        duration: 0.2,
        synth: (ctx) => {
            const now = 0;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.setValueAtTime(200, now);
            osc.frequency.exponentialRampToValueAtTime(60, now + 0.15);
            gain.gain.setValueAtTime(0.25, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
            osc.start(now); osc.stop(now + 0.2);
        }
    },
    push_hit: {
        duration: 0.15,
        synth: (ctx) => {
            const now = 0;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(300, now);
            osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            osc.start(now); osc.stop(now + 0.15);
        }
    }
};

// ===== BGM Zone Definitions =====
const BGM_DEFS = {
    zone_calm: {
        duration: 4.0,
        synth: (ctx) => {
            const notes = [130.81, 155.56, 196];
            notes.forEach(freq => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.value = freq;
                osc.connect(gain);
                gain.connect(ctx.destination);
                gain.gain.setValueAtTime(0.04, 0);
                // Gentle fade at loop boundary
                gain.gain.setValueAtTime(0.04, 3.5);
                gain.gain.linearRampToValueAtTime(0.04, 4.0);
                osc.start(0);
                osc.stop(4.0);
            });
        }
    },
    zone_unsettling: {
        duration: 4.0,
        synth: (ctx) => {
            const notes = [110, 130.81, 148];
            notes.forEach(freq => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.value = freq;
                osc.connect(gain);
                gain.connect(ctx.destination);
                gain.gain.setValueAtTime(0.03, 0);
                osc.start(0);
                osc.stop(4.0);
            });
        }
    },
    zone_tense: {
        duration: 4.0,
        synth: (ctx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = 55;
            osc.connect(gain);
            gain.connect(ctx.destination);
            gain.gain.setValueAtTime(0.04, 0);
            osc.start(0);
            osc.stop(4.0);

            const whisper = ctx.createOscillator();
            const wGain = ctx.createGain();
            whisper.type = 'sawtooth';
            whisper.frequency.value = 880;
            whisper.connect(wGain);
            wGain.connect(ctx.destination);
            wGain.gain.setValueAtTime(0.01, 0);
            whisper.start(0);
            whisper.stop(4.0);
        }
    },
    zone_horror: {
        duration: 4.0,
        synth: (ctx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = 27.5;
            osc.connect(gain);
            gain.connect(ctx.destination);
            gain.gain.setValueAtTime(0.05, 0);
            osc.start(0);
            osc.stop(4.0);
        }
    },
    zone_surreal: {
        duration: 4.0,
        synth: (ctx) => {
            const notes = [261.63, 277.18, 329.63];
            notes.forEach(freq => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.value = freq * 0.5;
                osc.connect(gain);
                gain.connect(ctx.destination);
                gain.gain.setValueAtTime(0.04, 0);
                osc.start(0);
                osc.stop(4.0);
            });
        }
    },
    zone_hopeful: {
        duration: 4.0,
        synth: (ctx) => {
            const notes = [261.63, 329.63, 392];
            notes.forEach(freq => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.value = freq;
                osc.connect(gain);
                gain.connect(ctx.destination);
                gain.gain.setValueAtTime(0.06, 0);
                osc.start(0);
                osc.stop(4.0);
            });
        }
    }
};

// Zone to BGM key mapping
function getZoneBgmKey(zone) {
    if (zone <= 1) return 'zone_calm';
    if (zone <= 3) return 'zone_unsettling';
    if (zone <= 5) return 'zone_tense';
    if (zone <= 7) return 'zone_horror';
    if (zone === 8) return 'zone_surreal';
    return 'zone_hopeful';
}

// ===== Initialization =====
let initPromise = null;

function initAudio() {
    if (audioInitialized) return;

    // Legacy audioCtx for any code that checks it
    audioCtx = Howler.ctx || new (window.AudioContext || window.webkitAudioContext)();
    bgmGainNode = audioCtx.createGain();
    bgmGainNode.gain.value = 0.08;
    bgmGainNode.connect(audioCtx.destination);
    audioInitialized = true;

    // Set Howler global volume
    Howler.volume(masterVolume);

    // Start async pre-rendering (non-blocking)
    initPromise = preRenderAllSounds();
}

async function preRenderAllSounds() {
    // Pre-render SFX
    const sfxPromises = [];
    for (const [name, def] of Object.entries(SFX_DEFS)) {
        if (def.variants) {
            for (let v = 0; v < def.variants; v++) {
                const variantName = `${name}_v${v}`;
                sfxPromises.push(
                    renderSFX((ctx) => def.synth(ctx, v), def.duration)
                        .then(buffer => {
                            const uri = audioBufferToWavDataURI(buffer);
                            if (!sfxHowls[name]) sfxHowls[name] = [];
                            sfxHowls[name].push(new Howl({
                                src: [uri],
                                format: ['wav'],
                                volume: sfxVolume,
                                preload: true
                            }));
                        })
                );
            }
        } else {
            sfxPromises.push(
                renderSFX(def.synth, def.duration)
                    .then(buffer => {
                        const uri = audioBufferToWavDataURI(buffer);
                        sfxHowls[name] = new Howl({
                            src: [uri],
                            format: ['wav'],
                            volume: sfxVolume,
                            preload: true
                        });
                    })
            );
        }
    }

    // Pre-render BGM loops
    const bgmPromises = [];
    for (const [name, def] of Object.entries(BGM_DEFS)) {
        bgmPromises.push(
            renderSFX(def.synth, def.duration)
                .then(buffer => {
                    const uri = audioBufferToWavDataURI(buffer);
                    bgmHowls[name] = new Howl({
                        src: [uri],
                        format: ['wav'],
                        volume: bgmVolume,
                        loop: true,
                        preload: true
                    });
                })
        );
    }

    await Promise.all([...sfxPromises, ...bgmPromises]);
    console.log('[Audio] All sounds pre-rendered with Howler.js');
}

// ===== Play SFX =====
function playSFX(type) {
    if (!audioInitialized) return;

    const howl = sfxHowls[type];
    if (!howl) return; // Not yet loaded or unknown type

    if (Array.isArray(howl)) {
        // Has variants — pick random
        const variant = howl[Math.floor(Math.random() * howl.length)];
        if (variant) variant.play();
    } else {
        howl.play();
    }
}

// ===== BGM =====
function updateBGM() {
    if (!audioInitialized) return;

    const zone = getCurrentZone();
    if (zone === lastMusicZone) return;
    lastMusicZone = zone;

    const bgmKey = getZoneBgmKey(zone);
    const newBgm = bgmHowls[bgmKey];

    if (!newBgm) return; // Not yet loaded

    // Crossfade from old BGM to new
    if (currentBgmHowl && currentBgmHowl !== newBgm) {
        const oldBgm = currentBgmHowl;
        oldBgm.fade(bgmVolume, 0, 1000);
        setTimeout(() => { oldBgm.stop(); }, 1100);
    }

    if (!newBgm.playing()) {
        newBgm.volume(0);
        newBgm.play();
        newBgm.fade(0, bgmVolume, 1000);
    }

    currentBgmHowl = newBgm;
}

// ===== Ambient Sounds =====
let lastAmbientTime = 0;
function updateAmbientSounds() {
    if (!audioInitialized) return;
    const now = Date.now();
    if (now - lastAmbientTime < 3000) return;
    lastAmbientTime = now;

    const zone = getCurrentZone();

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

// ===== Volume Control API =====
function setMasterVolume(vol) {
    masterVolume = Math.max(0, Math.min(1, vol));
    Howler.volume(masterVolume);
}

function setSFXVolume(vol) {
    sfxVolume = Math.max(0, Math.min(1, vol));
    for (const [, howl] of Object.entries(sfxHowls)) {
        if (Array.isArray(howl)) {
            howl.forEach(h => h.volume(sfxVolume));
        } else {
            howl.volume(sfxVolume);
        }
    }
}

function setBGMVolume(vol) {
    bgmVolume = Math.max(0, Math.min(1, vol));
    if (currentBgmHowl) currentBgmHowl.volume(bgmVolume);
}

function stopAllAudio() {
    Howler.stop();
    currentBgmHowl = null;
    lastMusicZone = -1;
}

function pauseAllAudio() {
    Howler.stop();
}

function resumeAudio() {
    if (currentBgmHowl) {
        currentBgmHowl.play();
    }
}
