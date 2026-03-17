/**
 * physics.js - Physics, collision, particles, animation, and lighting systems
 *
 * Dependencies:
 * - config.js (MAX_JUMP_POWER, maxHeight, etc.)
 * - entities.js (player, blocks, floor definitions)
 * - game.js globals (canvas, ctx, cameraY, player, blocks, floor)
 * - getCurrentZone(), playSFX(), triggerHitStop() from game.js
 */

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

// ===== FEATURE 2: HORROR ATMOSPHERE SYSTEM =====
let screenShakeIntensity = 0;
let glitchTimer = 0;
let heartbeatTime = 0;

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

// ===== COLLISION DETECTION =====
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

    // 이미 착지 상태 → 블록 가장자리에서 떨어지는지만 체크
    if (player.isOnGround) {
        // 바닥 위에 서 있으면 떨어질 곳 없음
        if (!player.currentBlock) return;
        // 현재 블록에서 벗어났는지 확인
        const cb = player.currentBlock;
        const actualBlockX = cb.type === 'moving' ? cb.x + cb.moveOffset : cb.x;
        const onBlock = player.x + player.width > actualBlockX && player.x < actualBlockX + cb.width;
        if (!onBlock || cb.disappeared) {
            player.isOnGround = false;
            player.currentBlock = null;
        }
        return;
    }

    // 바닥 체크 (실제 낙하 중일 때만 - velocityY > 0)
    if (playerBottom >= floor.y && player.velocityY > 0) {
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
