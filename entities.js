// ===== ENTITY/BLOCK/ITEM/POWERUP MANAGEMENT =====
// Dependencies: canvas, WORLD_FLOOR_Y, BLOCK_WIDTH, BLOCK_HEIGHT, FLOOR_HEIGHT, ITEM_TYPES,
//               floor, player, blocks, items, powerups, environmentalClues, achievementStats,
//               screenShakeIntensity, playSFX, showStoryDialog, impactParticles
// All dependencies are globals from other files loaded before this one

// ===== FOG PARTICLES =====
let fogParticles = [];

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

// ===== ITEMS/POWERUPS SYSTEM =====
// Items array (items floating in world)
let items = [];

// Player powerup state
const powerups = {
    doubleJump:  { active: false, timer: 0, hasExtraJump: false },   // Double jump (adds 1 extra mid-air jump)
    speedBoost:  { active: false, timer: 0 },                         // Speed boost (1.6x horizontal speed)
    shield:      { active: false, timer: 0, flicker: 0 },            // Shield (prevents 1 fall)
    slowMotion:  { active: false, timer: 0 }                          // Slow motion (half gravity/speed)
};

// ===== BLOCKS SYSTEM =====
let blocks = [];

// Block creation function (world coordinates)
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

    // Determine block type by zone
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
        // Fake blocks (bug fix: 700 → 500)
        block.type = 'fake';
        block.opacity = 0.5;
    } else if (zone >= 150 && Math.random() < 0.2) {
        // Bounce blocks: spring up when landed on
        block.type = 'bounce';
        block.bounceMultiplier = 1.35 + Math.random() * 0.2; // 1.35~1.55
        block.bouncePhase = 0; // animation
    } else if (zone >= 200 && Math.random() < 0.22) {
        // Ice blocks: very slippery
        block.type = 'ice';
        block.icePhase = Math.random() * Math.PI * 2; // sparkle phase
    } else if (zone >= 250 && Math.random() < 0.22) {
        // Conveyor blocks: push in one direction
        block.type = 'conveyor';
        block.conveyorDirection = Math.random() < 0.5 ? 1 : -1;
        block.conveyorSpeed = 2.0 + Math.random() * 1.5;
        block.conveyorPhase = 0; // arrow animation
    }

    return block;
}

// ===== BLOCK PLACEMENT HELPER =====
// Minimum clear horizontal gap between consecutive blocks so the player
// can always jump through. Player width = 30, so we add comfortable margin.
const MIN_PASSABLE_GAP = 35; // px of clear space between block edges

// Zone-based block width lookup
function _getBlockWidth(zone) {
    if (zone >= 500) return 40;
    if (zone >= 400) return 50;
    if (zone >= 300) return 60;
    if (zone >= 200) return 70;
    if (zone >= 100) return 70;
    return 80;
}

// Zone-based vertical gap range
function _getVerticalGapRange(zone) {
    if (zone >= 500) return { min: 50, max: 90 };
    if (zone >= 400) return { min: 55, max: 100 };
    if (zone >= 300) return { min: 60, max: 110 };
    return { min: 60, max: 120 };
}

// Generate a single block position relative to the previous block.
// Guarantees a minimum horizontal gap so the player can always pass through.
function _placeNextBlock(lastX, lastY, lastBlockWidth, safeHorizontalGap) {
    const currentHeight = WORLD_FLOOR_Y - lastY;
    const zone = Math.floor(currentHeight / 1000 * 100);
    const blockWidth = _getBlockWidth(zone);
    const { min: minGap, max: maxGap } = _getVerticalGapRange(zone);

    // Vertical gap
    const yGap = minGap + Math.random() * (maxGap - minGap);
    const newY = lastY - yGap;

    // Horizontal placement
    const heightRatio = yGap / maxGap;
    let allowedHorizontalMove = safeHorizontalGap * (1 - heightRatio * 0.5);
    if (zone >= 300) {
        allowedHorizontalMove *= (1 - (zone - 300) / 300 * 0.3);
    }

    let newX = lastX + (Math.random() - 0.5) * allowedHorizontalMove * 2;

    // ── Enforce minimum horizontal gap ──
    // Calculate how much the two blocks overlap horizontally.
    // If the gap between edges is less than MIN_PASSABLE_GAP, push newX apart.
    const lastLeft  = lastX;
    const lastRight = lastX + lastBlockWidth;
    let newLeft  = newX;
    let newRight = newX + blockWidth;

    // Gap between edges (negative = overlapping)
    const gapLeft  = lastLeft - newRight;  // clear space when new block is left of last
    const gapRight = newLeft - lastRight;  // clear space when new block is right of last

    // If neither gap meets the minimum, the blocks are too close
    if (gapLeft < MIN_PASSABLE_GAP && gapRight < MIN_PASSABLE_GAP) {
        // Decide direction: push away from previous block center
        const lastCenter = lastX + lastBlockWidth / 2;
        const newCenter  = newX + blockWidth / 2;

        if (newCenter >= lastCenter) {
            // Push right: place new block's left edge at lastRight + MIN_PASSABLE_GAP
            newX = lastRight + MIN_PASSABLE_GAP;
        } else {
            // Push left: place new block's right edge at lastLeft - MIN_PASSABLE_GAP
            newX = lastLeft - MIN_PASSABLE_GAP - blockWidth;
        }

        // If pushed out of bounds, try the opposite direction
        if (newX + blockWidth > canvas.width - 20) {
            newX = lastLeft - MIN_PASSABLE_GAP - blockWidth;
        }
        if (newX < 20) {
            newX = lastRight + MIN_PASSABLE_GAP;
        }
    }

    // Final clamp to canvas bounds
    newX = Math.max(20, Math.min(canvas.width - blockWidth - 20, newX));

    // Create the block
    const block = createBlock(newX, newY, blockWidth);

    // Attach environmental clues
    const blockHeight = Math.floor((WORLD_FLOOR_Y - newY) / 10);
    for (const [clueHeight, clue] of Object.entries(environmentalClues)) {
        if (Math.abs(blockHeight - parseInt(clueHeight)) < 5) {
            block.envClue = clue;
            break;
        }
    }

    return { block, newX, newY, blockWidth };
}

// ===== BLOCK GENERATION =====

// Block generation function (world coordinates) - 500 blocks
function generateBlocks() {
    blocks = [];

    const startBlockWidth = 80;
    // Starting block (just above floor)
    blocks.push({
        x: canvas.width / 2 - startBlockWidth / 2,
        y: WORLD_FLOOR_Y - 100,
        width: startBlockWidth,
        height: BLOCK_HEIGHT,
        type: 'normal',
        wobble: 0
    });

    let lastY = WORLD_FLOOR_Y - 100;
    let lastX = canvas.width / 2 - startBlockWidth / 2;
    let lastBlockWidth = startBlockWidth;

    // Max jump height calculation: v^2 / (2*g) = 18^2 / (2*0.5) = 324
    const maxJumpHeight = (MAX_JUMP_POWER * MAX_JUMP_POWER) / (2 * GRAVITY);
    const safeVerticalGap = maxJumpHeight * 0.4;

    // Max jump distance calculation (horizontal)
    const maxJumpDistance = HORIZONTAL_SPEED * (2 * MAX_JUMP_POWER / GRAVITY) * 0.5;
    const safeHorizontalGap = maxJumpDistance * 0.6;

    const initialBlockCount = 40;
    _blockGenState = {
        lastY: lastY,
        lastX: lastX,
        lastBlockWidth: lastBlockWidth,
        generated: 0,
        totalTarget: 500,
        maxJumpHeight: maxJumpHeight,
        safeVerticalGap: safeVerticalGap,
        safeHorizontalGap: safeHorizontalGap
    };

    for (let i = 0; i < initialBlockCount; i++) {
        const result = _placeNextBlock(lastX, lastY, lastBlockWidth, safeHorizontalGap);
        blocks.push(result.block);
        lastY = result.newY;
        lastX = result.newX;
        lastBlockWidth = result.blockWidth;
    }

    _blockGenState.lastY = lastY;
    _blockGenState.lastX = lastX;
    _blockGenState.lastBlockWidth = lastBlockWidth;
    _blockGenState.generated = initialBlockCount;

    initializeFogParticles();
}

// Lazy block generation state
let _blockGenState = null;

// Generate more blocks incrementally as player climbs
function generateMoreBlocks() {
    if (!_blockGenState) return;
    if (_blockGenState.generated >= _blockGenState.totalTarget) return;

    const topBlockY = blocks.length > 0 ? blocks[blocks.length - 1].y : WORLD_FLOOR_Y;
    const playerDistToTop = topBlockY - player.y;
    if (playerDistToTop > 2000) return;

    const batchSize = 30;
    let lastY = _blockGenState.lastY;
    let lastX = _blockGenState.lastX;
    let lastBlockWidth = _blockGenState.lastBlockWidth;
    const safeHorizontalGap = _blockGenState.safeHorizontalGap;

    for (let i = 0; i < batchSize && _blockGenState.generated < _blockGenState.totalTarget; i++) {
        const result = _placeNextBlock(lastX, lastY, lastBlockWidth, safeHorizontalGap);
        blocks.push(result.block);
        lastY = result.newY;
        lastX = result.newX;
        lastBlockWidth = result.blockWidth;
        _blockGenState.generated++;
    }

    _blockGenState.lastY = lastY;
    _blockGenState.lastX = lastX;
    _blockGenState.lastBlockWidth = lastBlockWidth;

    if (_blockGenState.generated > 40) {
        generateItems();
    }
}

// ─── Item generation ───
function generateItems() {
    items = [];
    // Place items on some blocks (zone >= 50 and above)
    const eligibleBlocks = blocks.filter(b => {
        const h = (WORLD_FLOOR_Y - b.y) / 10;
        return h >= 50 && b.type !== 'fake' && b.type !== 'crumbling';
    });

    // Ratio: about 1 item per 50 blocks
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

// ─── Item update ───
function updateItems() {
    for (const item of items) {
        if (item.collected) continue;
        item.bobPhase  = (item.bobPhase  + 0.05) % (Math.PI * 2);
        item.glowPhase = (item.glowPhase + 0.03) % (Math.PI * 2);

        // Collision check with player (compare in world coordinates)
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

// ─── Item collection ───
function collectItem(item) {
    item.collected = true;
    achievementStats.itemsCollected++;
    playSFX('achievement');
    screenShakeIntensity = 2;

    // Collection particles (world coordinates — drawImpactParticles applies +cameraY)
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

// ─── Powerup timer update ───
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
    // shield is consumed when preventing 1 fall
}
