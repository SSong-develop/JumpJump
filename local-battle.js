// local-battle.js - Local 2-player battle on the same keyboard
// P1: Arrow keys + Space | P2: A/D + W (charge) release W (jump)
// Dependencies: config.js, battle.js, renderer.js, entities.js, physics.js

const LocalBattle = (() => {
    let active = false;
    let targetHeight = 300;
    let battleSeed = 0;
    let winner = null;
    let countdown = 0;
    let countdownTimer = null;
    let gameLoopRunning = false;
    let interferenceMode = false;

    // Interference state
    const interference = {
        p1Stun: 0,          // P1 stun frames (can't move)
        p2Stun: 0,          // P2 stun frames
        p1Invincible: 0,    // P1 invincibility frames after being hit
        p2Invincible: 0,    // P2 invincibility frames after being hit
        collisionCooldown: 0,
        particles: [],       // Collision effect particles
        p1FlashTimer: 0,     // P1 hit flash
        p2FlashTimer: 0,     // P2 hit flash
    };

    // P2 keys state
    const p2Keys = { left: false, right: false, jump: false };

    // P2 player object (independent from global `player` which is P1)
    const p2 = {
        x: 250 - 15,
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

    let p2CameraY = 0;
    let p2MaxHeight = 0;
    let p2Character = 'skeleton';

    // Canvases
    let localCanvas = null;
    let localCtx = null;
    let remoteCanvas = null;
    let remoteCtx = null;

    // ===== KEYBOARD HANDLING =====
    function handleKeyDown(e) {
        if (e.code === 'KeyA') { p2Keys.left = true; e.preventDefault(); }
        if (e.code === 'KeyD') { p2Keys.right = true; e.preventDefault(); }
        if (e.code === 'KeyW' && !p2Keys.jump) {
            p2Keys.jump = true;
            e.preventDefault();
            p2.jumpBufferTimer = JUMP_BUFFER_TIME;
            if (p2.isOnGround || p2.coyoteTimer > 0) {
                p2.isCharging = true;
                p2.jumpPower = 0;
                p2.coyoteTimer = 0;
            }
        }
    }

    function handleKeyUp(e) {
        if (e.code === 'KeyA') { p2Keys.left = false; }
        if (e.code === 'KeyD') { p2Keys.right = false; }
        if (e.code === 'KeyW') { p2Keys.jump = false; }
    }

    // ===== P2 PHYSICS UPDATE =====
    function updateP2() {
        if (!active || winner) return;

        // Interference: if stunned, only apply gravity and collision, skip input
        const p2Stunned = interferenceMode && interference.p2Stun > 0;

        // Coyote time
        if (p2.isOnGround) {
            p2.coyoteTimer = COYOTE_TIME;
            p2.wasOnGround = true;
            p2.lastGroundY = p2.y;
        } else {
            if (p2.coyoteTimer > 0) p2.coyoteTimer--;
        }

        if (p2.jumpBufferTimer > 0) p2.jumpBufferTimer--;

        // Standing block check
        if (p2.isOnGround && p2.currentBlock) {
            const cb = p2.currentBlock;
            if (cb.disappeared) {
                p2.isOnGround = false;
                p2.currentBlock = null;
            }
            if (cb.type === 'moving' && !cb.disappeared) {
                p2.x += cb.moveSpeed * cb.moveDirection;
                p2.x = Math.max(0, Math.min(CANVAS_LOGICAL_W - p2.width, p2.x));
            }
            if (cb.type === 'conveyor') {
                p2.x += cb.conveyorDirection * cb.conveyorSpeed;
                if (p2.x < 0) { p2.x = 0; p2.velocityX = 0; }
                if (p2.x + p2.width > CANVAS_LOGICAL_W) { p2.x = CANVAS_LOGICAL_W - p2.width; p2.velocityX = 0; }
            }
        }

        // Jump buffer auto-execute (blocked when stunned)
        if (!p2Stunned && p2.isOnGround && p2.jumpBufferTimer > 0 && !p2.isCharging && p2Keys.jump) {
            p2.isCharging = true;
            p2.jumpPower = 0;
            p2.jumpBufferTimer = 0;
        }

        // Charge (blocked when stunned)
        if (!p2Stunned && p2.isCharging && p2.isOnGround) {
            p2.jumpPower = Math.min(p2.jumpPower + CHARGE_SPEED, MAX_JUMP_POWER);
            if (p2Keys.left) { p2.direction = -1; p2.facingRight = false; }
            else if (p2Keys.right) { p2.direction = 1; p2.facingRight = true; }
            else { p2.direction = 0; }
        }

        // Cancel charge if stunned
        if (p2Stunned && p2.isCharging) {
            p2.isCharging = false;
            p2.jumpPower = 0;
        }

        // Jump execute on W release (blocked when stunned)
        if (!p2Stunned && !p2Keys.jump && p2.isCharging && p2.isOnGround) {
            p2.velocityY = -p2.jumpPower;
            p2.velocityX = p2.direction * HORIZONTAL_SPEED * (p2.jumpPower / MAX_JUMP_POWER);
            p2.isOnGround = false;
            p2.isCharging = false;
            p2.jumpPower = 0;
            p2.squashStretch = 1.3;
        }

        // Gravity
        if (!p2.isOnGround) {
            p2.velocityY += GRAVITY;
            if (!p2Keys.jump && p2.velocityY < 0) {
                p2.velocityY += GRAVITY * VARIABLE_JUMP_MULTIPLIER;
            }
        }

        // Air control (blocked when stunned)
        if (!p2.isOnGround && !p2Stunned) {
            if (p2Keys.left) {
                p2.velocityX = Math.max(p2.velocityX - AIR_CONTROL, -HORIZONTAL_SPEED * 1.2);
                p2.facingRight = false;
            }
            if (p2Keys.right) {
                p2.velocityX = Math.min(p2.velocityX + AIR_CONTROL, HORIZONTAL_SPEED * 1.2);
                p2.facingRight = true;
            }
        }

        // Position
        p2.x += p2.velocityX;
        p2.y += p2.velocityY;

        // Walk cycle
        if (p2.isOnGround && Math.abs(p2.velocityX) > 0.5) {
            p2.isMoving = true;
            p2.walkCycle += 0.15;
        } else {
            p2.isMoving = false;
        }

        // Friction
        if (!p2.isOnGround) {
            p2.velocityX *= AIR_FRICTION;
        } else {
            const isOnIce = p2.currentBlock && p2.currentBlock.type === 'ice';
            const friction = isOnIce ? 0.998 : GROUND_FRICTION;
            p2.velocityX *= friction;
            if (!isOnIce && Math.abs(p2.velocityX) < 0.1) p2.velocityX = 0;
        }

        // Wall collision
        if (p2.x < 0) { p2.x = 0; p2.velocityX = 0; }
        if (p2.x + p2.width > CANVAS_LOGICAL_W) { p2.x = CANVAS_LOGICAL_W - p2.width; p2.velocityX = 0; }

        // Block side collision (head bump from below)
        p2CheckBlockSideCollision();

        // Block collision (landing)
        p2CheckLanding();

        // Squash/stretch decay
        if (p2.squashStretch !== 1.0) {
            p2.squashStretch += (1.0 - p2.squashStretch) * 0.15;
            if (Math.abs(p2.squashStretch - 1.0) < 0.01) p2.squashStretch = 1.0;
        }

        // Landing impact decay
        if (p2.landingImpact > 0) {
            p2.landingImpact *= 0.85;
            if (p2.landingImpact < 0.01) p2.landingImpact = 0;
        }

        // P2 Camera
        const CAMERA_DEAD_ZONE_TOP = CANVAS_LOGICAL_H * 0.35;
        const CAMERA_DEAD_ZONE_BOTTOM = CANVAS_LOGICAL_H * 0.65;
        const playerScreenY = p2.y + p2CameraY;
        let targetCameraY = p2CameraY;

        if (playerScreenY < CAMERA_DEAD_ZONE_TOP) {
            targetCameraY = CAMERA_DEAD_ZONE_TOP - p2.y;
        } else if (playerScreenY > CAMERA_DEAD_ZONE_BOTTOM) {
            targetCameraY = CAMERA_DEAD_ZONE_BOTTOM - p2.y;
        }

        if (p2.velocityY < -5) targetCameraY += 80;
        else if (p2.velocityY > 8) targetCameraY -= 40;

        const smooth = p2.velocityY < 0 ? 0.12 : 0.08;
        p2CameraY += (targetCameraY - p2CameraY) * smooth;

        if (p2.landingImpact > 0.5) {
            p2CameraY -= p2.landingImpact * 6;
        }

        // Max height
        const h = Math.floor((WORLD_FLOOR_Y - p2.y - p2.height) / 10);
        if (h > p2MaxHeight) p2MaxHeight = h;

        // Win check
        if (!winner && p2MaxHeight >= targetHeight) {
            winner = 'p2';
            showLocalBattleResult('p2');
        }
    }

    function p2CheckLanding() {
        const playerBottom = p2.y + p2.height;
        const prevPlayerBottom = p2.y + p2.height - p2.velocityY;

        // Already on ground → only check if walked off block edge
        if (p2.isOnGround) {
            if (!p2.currentBlock) return; // on floor, can't fall off
            const cb = p2.currentBlock;
            const actualBlockX = cb.type === 'moving' ? cb.x + (cb.moveOffset || 0) : cb.x;
            const onBlock = p2.x + p2.width > actualBlockX && p2.x < actualBlockX + cb.width;
            if (!onBlock || cb.disappeared) {
                p2.isOnGround = false;
                p2.currentBlock = null;
            }
            return;
        }

        // Floor check (only when falling)
        if (playerBottom >= WORLD_FLOOR_Y && p2.velocityY > 0) {
            const impactSpeed = p2.velocityY;
            p2.y = WORLD_FLOOR_Y - p2.height;
            p2.velocityY = 0;
            p2.isOnGround = true;
            p2.currentBlock = null;
            p2.landingImpact = Math.min(1, impactSpeed / 15);
            p2.squashStretch = 0.7;
            return;
        }

        // Block landing check (world coordinates)
        for (const block of blocks) {
            if (block.disappeared) continue;
            if (block.y < p2.y - 400 || block.y > p2.y + 200) continue;

            const actualBlockX = block.type === 'moving' ? block.x + (block.moveOffset || 0) : block.x;

            // Fake blocks - skip if close
            if (block.type === 'fake') {
                const distToPlayer = Math.sqrt(
                    Math.pow(p2.x + p2.width / 2 - (actualBlockX + block.width / 2), 2) +
                    Math.pow(p2.y + p2.height / 2 - (block.y + block.height / 2), 2)
                );
                if (distToPlayer < 80) continue;
            }

            // Horizontal overlap (same as P1 - no inset)
            const horizontalOverlap = p2.x + p2.width > actualBlockX && p2.x < actualBlockX + block.width;
            if (!horizontalOverlap) continue;

            // Landing check - falling down and crossing block top
            if (p2.velocityY >= 0 &&
                prevPlayerBottom <= block.y &&
                playerBottom >= block.y) {

                p2.y = block.y - p2.height;
                const impactSpeed = p2.velocityY;
                p2.velocityY = 0;
                p2.isOnGround = true;
                p2.currentBlock = block;

                p2.landingImpact = Math.min(1, impactSpeed / 15);
                p2.squashStretch = 0.7;
                block.wobble = 1.0;

                // Crumbling block
                if (block.type === 'crumbling' && !block.isCrumbling) {
                    block.isCrumbling = true;
                    block.crumbleTimer = 0;
                }

                // Bounce block
                if (block.type === 'bounce') {
                    const bounceForce = MAX_JUMP_POWER * (block.bounceMultiplier || 1.2);
                    p2.velocityY = -bounceForce;
                    p2.isOnGround = false;
                    p2.currentBlock = null;
                    p2.squashStretch = 1.6;
                    p2.landingImpact = 1.0;
                    return;
                }

                return;
            }
        }

        p2.isOnGround = false;
        p2.currentBlock = null;
    }

    // Block side collision - prevents P2 from jumping through blocks from below
    function p2CheckBlockSideCollision() {
        for (const block of blocks) {
            if (block.disappeared) continue;
            if (block.type === 'fake') continue;
            if (block.y < p2.y - 200 || block.y > p2.y + 200) continue;

            const actualBlockX = block.type === 'moving' ? block.x + (block.moveOffset || 0) : block.x;

            // AABB collision check
            const overlaps = p2.x < actualBlockX + block.width &&
                             p2.x + p2.width > actualBlockX &&
                             p2.y < block.y + block.height &&
                             p2.y + p2.height > block.y;

            if (overlaps) {
                // Going up → head collision with block bottom
                if (p2.velocityY < 0) {
                    if (p2.y < block.y + block.height &&
                        p2.y + p2.height > block.y + block.height) {
                        p2.velocityY = 0;
                    }
                }
            }
        }
    }

    // ===== INTERFERENCE MODE: Player-to-player collision =====
    function updateInterference() {
        if (!interferenceMode) return;

        // Decrement timers
        if (interference.p1Stun > 0) interference.p1Stun--;
        if (interference.p2Stun > 0) interference.p2Stun--;
        if (interference.p1Invincible > 0) interference.p1Invincible--;
        if (interference.p2Invincible > 0) interference.p2Invincible--;
        if (interference.collisionCooldown > 0) interference.collisionCooldown--;
        if (interference.p1FlashTimer > 0) interference.p1FlashTimer--;
        if (interference.p2FlashTimer > 0) interference.p2FlashTimer--;

        // Update particles
        for (let i = interference.particles.length - 1; i >= 0; i--) {
            const p = interference.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.15;
            p.life -= p.decay;
            if (p.life <= 0) interference.particles.splice(i, 1);
        }

        // Skip collision check during cooldown
        if (interference.collisionCooldown > 0) return;

        // Player AABB
        const p1 = player;
        const overlap = p1.x < p2.x + p2.width &&
                        p1.x + p1.width > p2.x &&
                        p1.y < p2.y + p2.height &&
                        p1.y + p1.height > p2.y;

        if (!overlap) return;

        // Calculate overlap depths
        const overlapLeft = (p1.x + p1.width) - p2.x;
        const overlapRight = (p2.x + p2.width) - p1.x;
        const overlapTop = (p1.y + p1.height) - p2.y;
        const overlapBottom = (p2.y + p2.height) - p1.y;

        const minOverlapX = Math.min(overlapLeft, overlapRight);
        const minOverlapY = Math.min(overlapTop, overlapBottom);

        // Determine collision type: vertical (stomp) vs horizontal (push)
        if (minOverlapY < minOverlapX) {
            // --- VERTICAL COLLISION (Stomp) ---
            if (overlapTop < overlapBottom) {
                // P1 is above P2 → P1 stomps P2
                if (p1.velocityY > 0 && !p2.isOnGround) {
                    handleStomp('p1', 'p2');
                } else if (p1.velocityY >= 0) {
                    handleStomp('p1', 'p2');
                }
            } else {
                // P2 is above P1 → P2 stomps P1
                if (p2.velocityY > 0 && !p1.isOnGround) {
                    handleStomp('p2', 'p1');
                } else if (p2.velocityY >= 0) {
                    handleStomp('p2', 'p1');
                }
            }
        } else {
            // --- HORIZONTAL COLLISION (Push/Body Slam) ---
            handlePush(overlapLeft < overlapRight ? 1 : -1);
        }
    }

    function handleStomp(attackerTag, victimTag) {
        const attacker = attackerTag === 'p1' ? player : p2;
        const victim = victimTag === 'p1' ? player : p2;

        // Skip if victim is invincible
        if (victimTag === 'p1' && interference.p1Invincible > 0) return;
        if (victimTag === 'p2' && interference.p2Invincible > 0) return;

        const stompPower = Math.max(3, Math.abs(attacker.velocityY) * 0.8);

        // Attacker bounces up
        attacker.velocityY = -Math.max(8, stompPower * 1.2);
        attacker.isOnGround = false;
        attacker.currentBlock = null;
        attacker.squashStretch = 1.4;

        // Victim gets pushed down and stunned
        victim.velocityY = Math.max(5, stompPower);
        victim.isOnGround = false;
        victim.currentBlock = null;
        victim.squashStretch = 0.6;

        // Stun and invincibility
        if (victimTag === 'p1') {
            interference.p1Stun = 20;
            interference.p1Invincible = 45;
            interference.p1FlashTimer = 30;
        } else {
            interference.p2Stun = 20;
            interference.p2Invincible = 45;
            interference.p2FlashTimer = 30;
        }

        interference.collisionCooldown = 15;

        // Spawn stomp particles
        const cx = (attacker.x + attacker.width / 2 + victim.x + victim.width / 2) / 2;
        const cy = victim.y;
        spawnCollisionParticles(cx, cy, 'stomp');
    }

    function handlePush(direction) {
        // direction: 1 = P1 is to the left pushing right, -1 = opposite
        const p1 = player;

        // Skip if either is invincible
        if (interference.p1Invincible > 0 || interference.p2Invincible > 0) return;

        // Calculate push force based on velocities
        const p1Momentum = Math.abs(p1.velocityX) + (p1.isCharging ? 2 : 0);
        const p2Momentum = Math.abs(p2.velocityX) + (p2.isCharging ? 2 : 0);

        // Charging player is heavier
        const p1Weight = p1.isCharging ? 2.0 : 1.0;
        const p2Weight = p2.isCharging ? 2.0 : 1.0;

        const totalWeight = p1Weight + p2Weight;
        const pushForce = 4 + Math.max(p1Momentum, p2Momentum) * 0.5;

        // Separate players
        const separationDist = (p1.width + p2.width) / 2 + 2;
        const cx = (p1.x + p1.width / 2 + p2.x + p2.width / 2) / 2;

        // Push based on weight ratio
        const p1Push = pushForce * (p2Weight / totalWeight);
        const p2Push = pushForce * (p1Weight / totalWeight);

        p1.velocityX = -direction * p1Push;
        p2.velocityX = direction * p2Push;

        // Separate positions to prevent overlap
        if (direction > 0) {
            // P1 left, P2 right
            p1.x = cx - separationDist / 2 - p1.width / 2;
            p2.x = cx + separationDist / 2 - p2.width / 2;
        } else {
            p1.x = cx + separationDist / 2 - p1.width / 2;
            p2.x = cx - separationDist / 2 - p2.width / 2;
        }

        // Clamp to screen
        p1.x = Math.max(0, Math.min(CANVAS_LOGICAL_W - p1.width, p1.x));
        p2.x = Math.max(0, Math.min(CANVAS_LOGICAL_W - p2.width, p2.x));

        // Light stun for both
        interference.p1Stun = 5;
        interference.p2Stun = 5;
        interference.p1FlashTimer = 10;
        interference.p2FlashTimer = 10;
        interference.p1Invincible = 20;
        interference.p2Invincible = 20;
        interference.collisionCooldown = 10;

        // Particles
        const py = (p1.y + p2.y) / 2 + p1.height / 2;
        spawnCollisionParticles(cx, py, 'push');
    }

    function spawnCollisionParticles(cx, cy, type) {
        const count = type === 'stomp' ? 12 : 8;
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 / count) * i + Math.random() * 0.5;
            const speed = type === 'stomp' ? 2 + Math.random() * 4 : 1.5 + Math.random() * 3;
            interference.particles.push({
                x: cx + (Math.random() - 0.5) * 10,
                y: cy + (Math.random() - 0.5) * 10,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - (type === 'stomp' ? 3 : 1),
                life: 1.0,
                decay: 0.03 + Math.random() * 0.02,
                color: type === 'stomp' ? '#ffaa00' : '#ff6666',
                size: type === 'stomp' ? 3 + Math.random() * 3 : 2 + Math.random() * 2
            });
        }
        // Star burst for stomp
        if (type === 'stomp') {
            for (let i = 0; i < 4; i++) {
                interference.particles.push({
                    x: cx + (Math.random() - 0.5) * 20,
                    y: cy + (Math.random() - 0.5) * 15,
                    vx: (Math.random() - 0.5) * 2,
                    vy: -2 - Math.random() * 2,
                    life: 1.0,
                    decay: 0.02,
                    color: '#ffffff',
                    size: 5 + Math.random() * 3,
                    star: true
                });
            }
        }
    }

    // Offscreen canvas for ghost rendering (reused each frame)
    let ghostCanvas = null;
    let ghostCtx = null;

    function ensureGhostCanvas() {
        if (!ghostCanvas) {
            ghostCanvas = document.createElement('canvas');
            ghostCanvas.width = CANVAS_LOGICAL_W;
            ghostCanvas.height = CANVAS_LOGICAL_H;
            ghostCtx = ghostCanvas.getContext('2d');
        }
    }

    // Render ghost of opponent using the FULL drawPlayer() pipeline,
    // then composite onto targetCtx with transparency.
    // opponentState: { props, char, camY } - explicit opponent data to avoid global-swap confusion
    function drawGhostOpponent(targetCtx, whichPlayer, viewCamY, opponentState) {
        if (!interferenceMode) return;

        const { props, char: opponentChar, camY: opponentWorldCamY } = opponentState;
        const opponentInvincible = whichPlayer === 'p1' ? interference.p2Invincible : interference.p1Invincible;

        // Check if opponent is visible from THIS player's camera
        const screenY = props.y + viewCamY;

        if (screenY < -100 || screenY > CANVAS_LOGICAL_H + 100) {
            drawOffScreenIndicator(targetCtx, props, viewCamY, whichPlayer);
            return;
        }

        // Render opponent character at full quality onto ghostCanvas
        ensureGhostCanvas();
        ghostCtx.clearRect(0, 0, CANVAS_LOGICAL_W, CANVAS_LOGICAL_H);

        // Save ALL globals
        const savedPlayerProps = {};
        for (const key in player) savedPlayerProps[key] = player[key];
        const savedCameraY = cameraY;
        const savedChar = selectedCharacter;
        const savedCanvas = canvas;
        const savedCtx = ctx;

        // Swap globals to opponent state, but using THIS player's camera
        for (const key in props) player[key] = props[key];
        cameraY = viewCamY;   // Use viewer's camera so position is correct on their screen
        selectedCharacter = opponentChar;
        canvas = ghostCanvas;
        ctx = ghostCtx;

        // Draw just the player character using the full renderer
        drawPlayer();

        // Restore all globals
        for (const key in savedPlayerProps) player[key] = savedPlayerProps[key];
        cameraY = savedCameraY;
        selectedCharacter = savedChar;
        canvas = savedCanvas;
        ctx = savedCtx;

        // Composite ghost onto target canvas with transparency
        let ghostAlpha = 0.35;
        if (opponentInvincible > 0) {
            ghostAlpha = 0.15 + Math.sin(Date.now() / 50) * 0.1;
        }

        targetCtx.save();
        targetCtx.globalAlpha = ghostAlpha;
        targetCtx.drawImage(ghostCanvas, 0, 0);
        targetCtx.restore();

        // Ghost outline glow
        const screenX = props.x;
        const centerX = screenX + props.width / 2;
        targetCtx.save();
        targetCtx.globalAlpha = ghostAlpha * 0.5;
        const glowColor = whichPlayer === 'p1' ? 'rgba(240, 74, 74, 0.5)' : 'rgba(74, 240, 120, 0.5)';
        targetCtx.shadowColor = glowColor;
        targetCtx.shadowBlur = 10;
        targetCtx.strokeStyle = glowColor;
        targetCtx.lineWidth = 1.5;
        targetCtx.strokeRect(screenX - 1, screenY - 1, props.width + 2, props.height + 2);
        targetCtx.restore();

        // Label above ghost
        targetCtx.save();
        targetCtx.globalAlpha = ghostAlpha + 0.15;
        const labelColor = whichPlayer === 'p1' ? '#f04a4a' : '#4af078';
        targetCtx.fillStyle = labelColor;
        targetCtx.font = 'bold 9px Arial';
        targetCtx.textAlign = 'center';
        const opponentLabel = whichPlayer === 'p1' ? 'P2' : 'P1';
        targetCtx.fillText(opponentLabel, centerX, screenY - 5);
        targetCtx.restore();
    }

    // Arrow indicator when opponent is off-screen
    function drawOffScreenIndicator(targetCtx, opponent, camY, whichPlayer) {
        const screenY = opponent.y + camY;
        const arrowColor = whichPlayer === 'p1' ? '#f04a4a' : '#4af078';
        const opponentLabel = whichPlayer === 'p1' ? 'P2' : 'P1';
        const arrowX = Math.max(20, Math.min(CANVAS_LOGICAL_W - 20, opponent.x + opponent.width / 2));

        targetCtx.save();
        targetCtx.globalAlpha = 0.5 + Math.sin(Date.now() / 300) * 0.2;
        targetCtx.fillStyle = arrowColor;
        targetCtx.font = 'bold 10px Arial';
        targetCtx.textAlign = 'center';

        if (screenY < -50) {
            // Opponent is above
            const y = 38;
            targetCtx.beginPath();
            targetCtx.moveTo(arrowX, y);
            targetCtx.lineTo(arrowX - 6, y + 8);
            targetCtx.lineTo(arrowX + 6, y + 8);
            targetCtx.closePath();
            targetCtx.fill();
            targetCtx.fillText(opponentLabel, arrowX, y + 20);
        } else {
            // Opponent is below
            const y = CANVAS_LOGICAL_H - 20;
            targetCtx.beginPath();
            targetCtx.moveTo(arrowX, y);
            targetCtx.lineTo(arrowX - 6, y - 8);
            targetCtx.lineTo(arrowX + 6, y - 8);
            targetCtx.closePath();
            targetCtx.fill();
            targetCtx.fillText(opponentLabel, arrowX, y - 12);
        }

        targetCtx.restore();
    }

    function drawInterferenceEffects(targetCtx, whichPlayer, camY, opponentState) {
        if (!interferenceMode) return;

        // Draw ghost opponent first (behind particles)
        if (opponentState) {
            drawGhostOpponent(targetCtx, whichPlayer, camY, opponentState);
        }

        // Draw collision particles (in world coords)
        for (const p of interference.particles) {
            const screenY = p.y + camY;
            if (screenY < -20 || screenY > CANVAS_LOGICAL_H + 20) continue;

            targetCtx.globalAlpha = p.life;
            if (p.star) {
                // Draw star shape
                targetCtx.fillStyle = p.color;
                targetCtx.save();
                targetCtx.translate(p.x, screenY);
                targetCtx.rotate(p.life * Math.PI * 2);
                const s = p.size * p.life;
                targetCtx.beginPath();
                for (let i = 0; i < 5; i++) {
                    const a = (i * 4 * Math.PI) / 5 - Math.PI / 2;
                    const r = i === 0 ? s : s;
                    if (i === 0) targetCtx.moveTo(Math.cos(a) * s, Math.sin(a) * s);
                    else targetCtx.lineTo(Math.cos(a) * s, Math.sin(a) * s);
                }
                targetCtx.closePath();
                targetCtx.fill();
                targetCtx.restore();
            } else {
                targetCtx.fillStyle = p.color;
                targetCtx.beginPath();
                targetCtx.arc(p.x, screenY, p.size * p.life, 0, Math.PI * 2);
                targetCtx.fill();
            }
        }
        targetCtx.globalAlpha = 1;

        // Draw stun indicator (stars above head)
        const flashTimer = whichPlayer === 'p1' ? interference.p1FlashTimer : interference.p2FlashTimer;
        const stunTimer = whichPlayer === 'p1' ? interference.p1Stun : interference.p2Stun;
        const targetPlayer = whichPlayer === 'p1' ? player : p2;

        if (stunTimer > 0) {
            const px = targetPlayer.x + targetPlayer.width / 2;
            const py = targetPlayer.y + camY - 15;
            const time = Date.now() / 150;

            for (let i = 0; i < 3; i++) {
                const angle = time + (i * Math.PI * 2) / 3;
                const sx = px + Math.cos(angle) * 12;
                const sy = py + Math.sin(angle) * 5;
                targetCtx.fillStyle = '#ffcc00';
                targetCtx.font = '10px Arial';
                targetCtx.textAlign = 'center';
                targetCtx.fillText('★', sx, sy);
            }
        }

        // Hit flash overlay
        if (flashTimer > 0) {
            const alpha = (flashTimer / 30) * 0.2;
            targetCtx.fillStyle = `rgba(255, 50, 50, ${alpha})`;
            targetCtx.fillRect(0, 0, CANVAS_LOGICAL_W, CANVAS_LOGICAL_H);
        }
    }

    // ===== P2 RENDERING (Full pipeline - swaps global state) =====
    function renderP2Side() {
        if (!remoteCtx) return;

        const mainCanvas = document.getElementById('gameCanvas');
        if (!mainCanvas) return;
        const mainCtx = mainCanvas.getContext('2d');

        // Save P1 global state
        const savedPlayer = player;
        const savedCameraY = cameraY;
        const savedMaxHeight = maxHeight;
        const savedSelectedChar = selectedCharacter;
        const savedScreenShake = screenShakeIntensity;

        // Swap globals to P2 state
        // player is const (object ref), so we copy properties in/out
        const p1Snapshot = {};
        for (const key in player) {
            p1Snapshot[key] = player[key];
        }
        for (const key in p2) {
            player[key] = p2[key];
        }
        cameraY = p2CameraY;
        maxHeight = p2MaxHeight;
        selectedCharacter = p2Character;
        screenShakeIntensity = 0; // No screen shake for P2 side

        // Run the full render pipeline on the hidden canvas (same as P1 uses)
        mainCtx.save();
        mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);

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

        // Falling danger effect (same as in render())
        if (player.velocityY > 8 && !player.isOnGround) {
            const dangerIntensity = Math.min(1, (player.velocityY - 8) / 10);
            ctx.fillStyle = `rgba(255, 0, 0, ${dangerIntensity * 0.15})`;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        drawLighting();
        drawVignette();
        drawGlitch();
        drawEnvParticles(true);

        mainCtx.restore();

        // Copy the fully rendered hidden canvas to P2's visible canvas
        remoteCtx.clearRect(0, 0, remoteCanvas.width, remoteCanvas.height);
        remoteCtx.drawImage(mainCanvas, 0, 0);

        // Restore P1 global state FIRST
        for (const key in p1Snapshot) {
            player[key] = p1Snapshot[key];
        }
        cameraY = savedCameraY;
        maxHeight = savedMaxHeight;
        selectedCharacter = savedSelectedChar;
        screenShakeIntensity = savedScreenShake;

        // Interference effects on P2 side (ghost = P1, shown from P2's camera)
        // Use p1Snapshot which has P1's real position
        const p1State = {
            props: { ...p1Snapshot },
            char: savedSelectedChar,
            camY: p2CameraY
        };
        drawInterferenceEffects(remoteCtx, 'p2', p2CameraY, p1State);

        // P2 overlay: Label
        const modeTag = interferenceMode ? ' ⚔️' : '';
        remoteCtx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        remoteCtx.fillRect(0, 0, remoteCanvas.width, 28);
        remoteCtx.fillStyle = '#f04a4a';
        remoteCtx.font = 'bold 14px Arial';
        remoteCtx.textAlign = 'center';
        remoteCtx.fillText(`P2 [WASD] - ${p2MaxHeight}m${modeTag}`, remoteCanvas.width / 2, 19);

        // Power bar for P2
        if (p2.isCharging) {
            const barW = 100;
            const barH = 8;
            const barX = (remoteCanvas.width - barW) / 2;
            const barY = remoteCanvas.height - 30;
            const fillW = (p2.jumpPower / MAX_JUMP_POWER) * barW;

            remoteCtx.fillStyle = 'rgba(0, 20, 30, 0.8)';
            remoteCtx.fillRect(barX, barY, barW, barH);
            const grad = remoteCtx.createLinearGradient(barX, barY, barX + fillW, barY);
            grad.addColorStop(0, '#4a7878');
            grad.addColorStop(1, '#7a3030');
            remoteCtx.fillStyle = grad;
            remoteCtx.fillRect(barX, barY, fillW, barH);
            remoteCtx.strokeStyle = '#4a7878';
            remoteCtx.lineWidth = 1;
            remoteCtx.strokeRect(barX, barY, barW, barH);
        }

        // Progress bar at bottom
        drawP2HeightProgress(remoteCtx);
    }

    function drawP2HeightProgress(ctx) {
        const barHeight = 6;
        const barY = CANVAS_LOGICAL_H - barHeight;
        const progress = Math.min(1, p2MaxHeight / targetHeight);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, barY, remoteCanvas.width, barHeight);

        const gradient = ctx.createLinearGradient(0, barY, remoteCanvas.width * progress, barY);
        gradient.addColorStop(0, '#f04a4a');
        gradient.addColorStop(1, '#aa3030');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, barY, remoteCanvas.width * progress, barHeight);

        ctx.fillStyle = '#ffcc00';
        ctx.fillRect(remoteCanvas.width - 2, barY, 2, barHeight);
    }

    // ===== P1 Side (copy from main canvas + label) =====
    function renderP1Side() {
        if (!localCtx) return;

        const mainCanvas = document.getElementById('gameCanvas');
        if (!mainCanvas) return;

        localCtx.clearRect(0, 0, localCanvas.width, localCanvas.height);
        localCtx.drawImage(mainCanvas, 0, 0);

        // Interference effects on P1 side (ghost = P2, shown from P1's camera)
        const p2State = {
            props: { ...p2 },
            char: p2Character,
            camY: cameraY
        };
        drawInterferenceEffects(localCtx, 'p1', cameraY, p2State);

        // Label
        const modeTag = interferenceMode ? ' ⚔️' : '';
        localCtx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        localCtx.fillRect(0, 0, localCanvas.width, 28);
        localCtx.fillStyle = '#4af078';
        localCtx.font = 'bold 14px Arial';
        localCtx.textAlign = 'center';
        localCtx.fillText(`P1 [방향키+Space] - ${maxHeight}m${modeTag}`, localCanvas.width / 2, 19);

        // Progress bar at bottom
        const barHeight = 6;
        const barY = CANVAS_LOGICAL_H - barHeight;
        const progress = Math.min(1, maxHeight / targetHeight);

        localCtx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        localCtx.fillRect(0, barY, localCanvas.width, barHeight);

        const gradient = localCtx.createLinearGradient(0, barY, localCanvas.width * progress, barY);
        gradient.addColorStop(0, '#4af078');
        gradient.addColorStop(1, '#4a7878');
        localCtx.fillStyle = gradient;
        localCtx.fillRect(0, barY, localCanvas.width * progress, barHeight);

        localCtx.fillStyle = '#ffcc00';
        localCtx.fillRect(localCanvas.width - 2, barY, 2, barHeight);
    }

    // ===== HUD =====
    function renderHUD() {
        const hudEl = document.getElementById('battle-hud');
        if (!hudEl) return;

        const p1Progress = Math.min(100, (maxHeight / targetHeight) * 100);
        const p2Progress = Math.min(100, (p2MaxHeight / targetHeight) * 100);

        const modeLabel = interferenceMode ? '<div class="battle-mode-indicator">⚔️ 방해모드</div>' : '';
        hudEl.innerHTML = `
            <div class="battle-target">목표: ${targetHeight}m ${modeLabel}</div>
            <div class="battle-scores">
                <div class="battle-score local">
                    <span class="score-label">P1${interference.p1Stun > 0 ? ' 💫' : ''}</span>
                    <div class="score-bar-bg"><div class="score-bar-fill local-fill" style="width:${p1Progress}%"></div></div>
                    <span class="score-value">${maxHeight}m</span>
                </div>
                <div class="battle-score remote">
                    <span class="score-label">P2${interference.p2Stun > 0 ? ' 💫' : ''}</span>
                    <div class="score-bar-bg"><div class="score-bar-fill remote-fill" style="width:${p2Progress}%"></div></div>
                    <span class="score-value">${p2MaxHeight}m</span>
                </div>
            </div>
        `;
    }

    // ===== MAIN RENDER (called from game loop) =====
    function renderLocalBattle() {
        if (!active) return;
        updateP2();
        updateInterference();
        renderP1Side();
        renderP2Side();
        renderHUD();

        // P1 win check
        if (!winner && maxHeight >= targetHeight) {
            winner = 'p1';
            showLocalBattleResult('p1');
        }
    }

    function showLocalBattleResult(winnerPlayer) {
        gameEnded = true;

        const resultScreen = document.getElementById('battle-result');
        if (!resultScreen) return;

        document.getElementById('battle-game-container').style.display = 'none';
        resultScreen.style.display = 'block';

        const titleEl = document.getElementById('battle-result-title');
        const detailEl = document.getElementById('battle-result-detail');

        if (winnerPlayer === 'p1') {
            titleEl.textContent = 'P1 승리!';
            titleEl.style.color = '#4af078';
        } else {
            titleEl.textContent = 'P2 승리!';
            titleEl.style.color = '#f04a4a';
        }
        detailEl.innerHTML = `
            <p>목표: ${targetHeight}m</p>
            <p class="result-compare">P1: ${maxHeight}m vs P2: ${p2MaxHeight}m</p>
        `;
    }

    // ===== INIT / CLEANUP =====
    function start(seed, target, p1Char, p2Char) {
        battleSeed = seed;
        targetHeight = target;
        p2Character = p2Char;
        active = true;
        winner = null;
        p2MaxHeight = 0;
        p2CameraY = 0;

        // Reset interference state
        interference.p1Stun = 0;
        interference.p2Stun = 0;
        interference.p1Invincible = 0;
        interference.p2Invincible = 0;
        interference.collisionCooldown = 0;
        interference.particles = [];
        interference.p1FlashTimer = 0;
        interference.p2FlashTimer = 0;

        // Reset P2
        p2.x = 250 - 15;
        p2.y = WORLD_FLOOR_Y - 40;
        p2.velocityX = 0;
        p2.velocityY = 0;
        p2.isOnGround = true;
        p2.isCharging = false;
        p2.jumpPower = 0;
        p2.direction = 0;
        p2.facingRight = true;
        p2.currentBlock = null;
        p2.squashStretch = 1.0;
        p2.landingImpact = 0;
        p2.coyoteTimer = 0;
        p2.jumpBufferTimer = 0;
        p2.walkCycle = 0;
        p2.isMoving = false;
        p2.trailParticles = [];

        // Setup canvases
        localCanvas = document.getElementById('battleCanvasLocal');
        localCtx = localCanvas.getContext('2d');
        localCanvas.width = CANVAS_LOGICAL_W;
        localCanvas.height = CANVAS_LOGICAL_H;

        remoteCanvas = document.getElementById('battleCanvasRemote');
        remoteCtx = remoteCanvas.getContext('2d');
        remoteCanvas.width = CANVAS_LOGICAL_W;
        remoteCanvas.height = CANVAS_LOGICAL_H;

        // Add keyboard listeners
        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('keyup', handleKeyUp);

        // Start game
        gameMode = 'battle';
        resolveCanvas();
        resetGame();

        // Generate seeded blocks
        Battle.generateBlocksWithSeed(seed);

        // Start game loop
        gameStarted = true;
        if (gameLoopId) {
            cancelAnimationFrame(gameLoopId);
            gameLoopId = null;
        }
        gameLoopRunning = true;
        gameLoop();
    }

    function startWithCountdown(seed, target, p1Char, p2Char) {
        // Setup canvases first
        localCanvas = document.getElementById('battleCanvasLocal');
        localCtx = localCanvas.getContext('2d');
        localCanvas.width = CANVAS_LOGICAL_W;
        localCanvas.height = CANVAS_LOGICAL_H;

        remoteCanvas = document.getElementById('battleCanvasRemote');
        remoteCtx = remoteCanvas.getContext('2d');
        remoteCanvas.width = CANVAS_LOGICAL_W;
        remoteCanvas.height = CANVAS_LOGICAL_H;

        countdown = 3;
        updateLocalCountdown();

        countdownTimer = setInterval(() => {
            countdown--;
            updateLocalCountdown();
            if (countdown <= 0) {
                clearInterval(countdownTimer);
                countdownTimer = null;
                start(seed, target, p1Char, p2Char);
            }
        }, 1000);
    }

    function updateLocalCountdown() {
        const el = document.getElementById('battle-countdown');
        if (!el) return;
        if (countdown > 0) {
            el.style.display = 'flex';
            el.textContent = countdown;
        } else {
            el.textContent = 'GO!';
            setTimeout(() => { el.style.display = 'none'; }, 500);
        }
    }

    function cleanup() {
        active = false;
        winner = null;
        gameLoopRunning = false;
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('keyup', handleKeyUp);
        p2Keys.left = false;
        p2Keys.right = false;
        p2Keys.jump = false;
        if (countdownTimer) {
            clearInterval(countdownTimer);
            countdownTimer = null;
        }
    }

    function isActive() { return active; }
    function getWinner() { return winner; }

    function isP1Stunned() {
        return interferenceMode && interference.p1Stun > 0;
    }

    function setInterferenceMode(enabled) {
        interferenceMode = enabled;
    }

    function isInterferenceMode() {
        return interferenceMode;
    }

    return {
        start,
        startWithCountdown,
        renderLocalBattle,
        cleanup,
        isActive,
        getWinner,
        isP1Stunned,
        setInterferenceMode,
        isInterferenceMode,
        p2
    };
})();
