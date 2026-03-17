// ════════════════════════════════════════════════════════════════════════════════
// Rendering Module - All canvas drawing functions
// Extracted from game.js to separate rendering logic
// Uses global objects: ctx, canvas, cameraY, player, blocks, zone themes, etc.
// ════════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// SCANLINE CACHE (Performance Optimization)
// ═══════════════════════════════════════════════════════════════════════════════

let scanlineCache = null;
function createScanlineCache() {
    const scanlineCanvas = document.createElement('canvas');
    scanlineCanvas.width = CANVAS_LOGICAL_W;
    scanlineCanvas.height = CANVAS_LOGICAL_H;
    const scanlineCtx = scanlineCanvas.getContext('2d');

    // Pre-render scanlines to offscreen canvas
    scanlineCtx.strokeStyle = 'rgba(0, 0, 0, 0.03)';
    scanlineCtx.lineWidth = 1;
    for (let i = 0; i < CANVAS_LOGICAL_H; i += 4) {
        scanlineCtx.beginPath();
        scanlineCtx.moveTo(0, i);
        scanlineCtx.lineTo(CANVAS_LOGICAL_W, i);
        scanlineCtx.stroke();
    }
    return scanlineCanvas;
}
// Deferred: scanlineCache is created after canvas is ready (called from game.js init)

// ═══════════════════════════════════════════════════════════════════════════════
// ITEM RENDERING
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// PIXEL ART HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// CHARACTER DRAWING FUNCTIONS (PIXEL ART)
// ═══════════════════════════════════════════════════════════════════════════════

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
    }

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

// ═══════════════════════════════════════════════════════════════════════════════
// PLAYER DRAWING
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCK DRAWING
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// ENVIRONMENTAL EFFECTS
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// FLOOR DRAWING
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// BACKGROUND DRAWING
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// UI UPDATES
// ═══════════════════════════════════════════════════════════════════════════════

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
