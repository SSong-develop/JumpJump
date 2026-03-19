// battle.js - 1v1 Battle Mode with Split Screen
// Dependencies: config.js, network.js, game.js, renderer.js, entities.js, physics.js

const Battle = (() => {
    // Battle state
    let active = false;
    let targetHeight = 300; // Default target height (m)
    let battleSeed = 0;
    let winner = null;
    let battleStarted = false;
    let countdown = 0;
    let countdownTimer = null;

    // Remote player state (received from peer)
    let remotePlayer = {
        x: 250 - 15,
        y: WORLD_FLOOR_Y - 40,
        width: 30,
        height: 40,
        velocityX: 0,
        velocityY: 0,
        isOnGround: true,
        isCharging: false,
        jumpPower: 0,
        facingRight: true,
        squashStretch: 1.0,
        walkCycle: 0,
        isMoving: false,
        breathePhase: 0,
        character: 'human',
        maxHeight: 0,
        currentHeight: 0,
        isBlinking: false,
        blinkDuration: 0,
        landingImpact: 0,
        trailParticles: []
    };

    let remoteMaxHeight = 0;
    let remoteCharacter = 'human';
    let remoteCameraY = 0;

    // Split screen canvases
    let localCanvas = null;
    let localCtx = null;
    let remoteCanvas = null;
    let remoteCtx = null;

    // Sync interval
    let syncInterval = null;
    const SYNC_RATE = 50; // ms (20fps sync)

    // Seeded random number generator
    function seededRandom(seed) {
        let s = seed;
        return function() {
            s = (s * 1664525 + 1013904223) & 0xFFFFFFFF;
            return (s >>> 0) / 0xFFFFFFFF;
        };
    }

    function initBattle(seed, target) {
        battleSeed = seed;
        targetHeight = target;
        active = true;
        winner = null;
        battleStarted = false;
        remoteMaxHeight = 0;
        countdown = 3;

        // Reset remote player
        remotePlayer.x = 250 - 15;
        remotePlayer.y = WORLD_FLOOR_Y - 40;
        remotePlayer.velocityX = 0;
        remotePlayer.velocityY = 0;
        remotePlayer.isOnGround = true;
        remotePlayer.isCharging = false;
        remotePlayer.jumpPower = 0;
        remotePlayer.facingRight = true;
        remotePlayer.squashStretch = 1.0;
        remotePlayer.maxHeight = 0;
        remotePlayer.currentHeight = 0;
        remotePlayer.trailParticles = [];
        remoteCameraY = 0;
    }

    function setupSplitScreen() {
        const container = document.getElementById('battle-game-container');
        if (!container) return;

        // Local canvas (left side)
        localCanvas = document.getElementById('battleCanvasLocal');
        localCtx = localCanvas.getContext('2d');
        localCanvas.width = CANVAS_LOGICAL_W;
        localCanvas.height = CANVAS_LOGICAL_H;

        // Remote canvas (right side)
        remoteCanvas = document.getElementById('battleCanvasRemote');
        remoteCtx = remoteCanvas.getContext('2d');
        remoteCanvas.width = CANVAS_LOGICAL_W;
        remoteCanvas.height = CANVAS_LOGICAL_H;
    }

    function startCountdown() {
        countdown = 3;
        updateCountdownDisplay();

        countdownTimer = setInterval(() => {
            countdown--;
            updateCountdownDisplay();
            if (countdown <= 0) {
                clearInterval(countdownTimer);
                countdownTimer = null;
                battleStarted = true;
                // Notify peer
                Network.sendMessage('battleStart', {});
                startBattleGame();
            }
        }, 1000);
    }

    function updateCountdownDisplay() {
        const el = document.getElementById('battle-countdown');
        if (!el) return;
        if (countdown > 0) {
            el.style.display = 'flex';
            el.textContent = countdown;
        } else {
            el.textContent = 'GO!';
            setTimeout(() => {
                el.style.display = 'none';
            }, 500);
        }
    }

    function startBattleGame() {
        // Start the actual game
        gameMode = 'battle';
        resolveCanvas();
        resetGame();

        // Use seeded blocks for both players (overrides the random ones from resetGame)
        generateBlocksWithSeed(battleSeed);

        // Start game loop directly (startGame also generates blocks, so we bypass it)
        if (gameStarted) return;
        gameStarted = true;
        if (gameLoopId) {
            cancelAnimationFrame(gameLoopId);
            gameLoopId = null;
        }
        gameLoop();
        startSync();
    }

    function generateBlocksWithSeed(seed) {
        // Override Math.random temporarily with seeded version
        const originalRandom = Math.random;
        Math.random = seededRandom(seed);

        generateBlocks();
        generateItems();

        Math.random = originalRandom;
    }

    function startSync() {
        if (syncInterval) clearInterval(syncInterval);
        syncInterval = setInterval(() => {
            if (!active || !Network.isConnected()) return;

            const currentHeight = Math.max(0, Math.floor((WORLD_FLOOR_Y - player.y - player.height) / 10));

            Network.sendGameState({
                x: player.x,
                y: player.y,
                vx: player.velocityX,
                vy: player.velocityY,
                onGround: player.isOnGround,
                charging: player.isCharging,
                power: player.jumpPower,
                facing: player.facingRight,
                ss: player.squashStretch,
                wc: player.walkCycle,
                moving: player.isMoving,
                height: currentHeight,
                maxH: maxHeight,
                camY: cameraY,
                char: selectedCharacter
            });

            // Check win condition
            if (!winner && maxHeight >= targetHeight) {
                winner = 'local';
                Network.sendMessage('win', { height: maxHeight });
                showBattleResult('win');
            }
        }, SYNC_RATE);
    }

    function stopSync() {
        if (syncInterval) {
            clearInterval(syncInterval);
            syncInterval = null;
        }
    }

    function handleNetworkMessage(data) {
        switch (data.type) {
            case 'gameState':
                updateRemotePlayer(data);
                break;
            case 'win':
                if (!winner) {
                    winner = 'remote';
                    showBattleResult('lose');
                }
                break;
            case 'battleStart':
                if (!battleStarted) {
                    battleStarted = true;
                    startBattleGame();
                }
                break;
            case 'battleConfig':
                // Received battle config from host
                battleSeed = data.seed;
                targetHeight = data.target;
                remoteCharacter = data.character;
                break;
            case 'ready':
                // Peer is ready
                if (Network.isHostPlayer()) {
                    startCountdown();
                }
                break;
            case 'disconnect':
                if (!winner) {
                    winner = 'local';
                    showBattleResult('disconnect');
                }
                break;
        }
    }

    function updateRemotePlayer(data) {
        remotePlayer.x = data.x;
        remotePlayer.y = data.y;
        remotePlayer.velocityX = data.vx;
        remotePlayer.velocityY = data.vy;
        remotePlayer.isOnGround = data.onGround;
        remotePlayer.isCharging = data.charging;
        remotePlayer.jumpPower = data.power;
        remotePlayer.facingRight = data.facing;
        remotePlayer.squashStretch = data.ss;
        remotePlayer.walkCycle = data.wc;
        remotePlayer.isMoving = data.moving;
        remotePlayer.currentHeight = data.height;
        remotePlayer.maxHeight = data.maxH;
        remotePlayer.character = data.char;
        remoteCameraY = data.camY;
        remoteMaxHeight = data.maxH;
    }

    // ===== SPLIT SCREEN RENDERING =====
    function renderBattle() {
        if (!active) return;

        // Render local game on left canvas
        renderLocalSide();

        // Render remote player on right canvas
        renderRemoteSide();

        // Render battle HUD overlay
        renderBattleHUD();
    }

    function renderLocalSide() {
        if (!localCtx) return;

        // The main game already renders to the main canvas
        // We just need to copy it to the local side
        const mainCanvas = document.getElementById('gameCanvas');
        if (mainCanvas) {
            localCtx.clearRect(0, 0, localCanvas.width, localCanvas.height);
            localCtx.drawImage(mainCanvas, 0, 0);

            // Draw "YOU" label
            localCtx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            localCtx.fillRect(0, 0, localCanvas.width, 28);
            localCtx.fillStyle = '#4af078';
            localCtx.font = 'bold 14px Arial';
            localCtx.textAlign = 'center';
            localCtx.fillText(`나 - ${maxHeight}m`, localCanvas.width / 2, 19);

            // Draw height progress bar at bottom
            drawHeightProgress(localCtx, maxHeight, localCanvas.width);
        }
    }

    function renderRemoteSide() {
        if (!remoteCtx) return;

        remoteCtx.clearRect(0, 0, remoteCanvas.width, remoteCanvas.height);

        // Draw background
        const zone = Math.min(9, Math.floor(remoteMaxHeight / 100));
        const zoneTheme = zones[zone];
        remoteCtx.fillStyle = zoneTheme ? zoneTheme.backgroundColor : '#2a4848';
        remoteCtx.fillRect(0, 0, remoteCanvas.width, remoteCanvas.height);

        // Draw blocks (using same seed, same positions)
        remoteCtx.save();
        for (const block of blocks) {
            if (block.disappeared) continue;
            const blockScreenY = block.y + remoteCameraY;
            if (blockScreenY < -50 || blockScreenY > remoteCanvas.height + 50) continue;

            const actualX = block.type === 'moving' ? block.x + (block.moveOffset || 0) : block.x;

            remoteCtx.fillStyle = zoneTheme ? zoneTheme.blockColor1 : '#1a2428';
            remoteCtx.fillRect(actualX, blockScreenY, block.width, block.height);
            remoteCtx.strokeStyle = zoneTheme ? zoneTheme.blockBorder : '#3a6868';
            remoteCtx.lineWidth = 1;
            remoteCtx.strokeRect(actualX, blockScreenY, block.width, block.height);
        }

        // Draw floor
        const floorScreenY = WORLD_FLOOR_Y + remoteCameraY;
        if (floorScreenY > -50 && floorScreenY < remoteCanvas.height + 50) {
            remoteCtx.fillStyle = '#1a2428';
            remoteCtx.fillRect(0, floorScreenY, remoteCanvas.width, FLOOR_HEIGHT);
            remoteCtx.strokeStyle = '#3a6868';
            remoteCtx.lineWidth = 2;
            remoteCtx.strokeRect(0, floorScreenY, remoteCanvas.width, FLOOR_HEIGHT);
        }
        remoteCtx.restore();

        // Draw remote player
        drawRemotePlayer(remoteCtx);

        // Draw "OPPONENT" label
        remoteCtx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        remoteCtx.fillRect(0, 0, remoteCanvas.width, 28);
        remoteCtx.fillStyle = '#f04a4a';
        remoteCtx.font = 'bold 14px Arial';
        remoteCtx.textAlign = 'center';
        remoteCtx.fillText(`상대 - ${remoteMaxHeight}m`, remoteCanvas.width / 2, 19);

        // Draw height progress bar at bottom
        drawHeightProgress(remoteCtx, remoteMaxHeight, remoteCanvas.width);

        // Vignette
        const vigGrad = remoteCtx.createRadialGradient(
            remoteCanvas.width / 2, remoteCanvas.height / 2, remoteCanvas.height * 0.3,
            remoteCanvas.width / 2, remoteCanvas.height / 2, remoteCanvas.height * 0.7
        );
        vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
        vigGrad.addColorStop(1, 'rgba(0,0,0,0.4)');
        remoteCtx.fillStyle = vigGrad;
        remoteCtx.fillRect(0, 0, remoteCanvas.width, remoteCanvas.height);
    }

    function drawRemotePlayer(ctx) {
        const screenX = remotePlayer.x;
        const screenY = remotePlayer.y + remoteCameraY;

        if (screenY < -100 || screenY > CANVAS_LOGICAL_H + 100) return;

        ctx.save();
        const centerX = screenX + remotePlayer.width / 2;
        const centerY = screenY + remotePlayer.height / 2;
        ctx.translate(centerX, centerY);

        // Flip if facing left
        if (!remotePlayer.facingRight) {
            ctx.scale(-1, 1);
        }

        // Squash/stretch
        const ss = remotePlayer.squashStretch || 1.0;
        ctx.scale(1 / ss, ss);

        const w = remotePlayer.width;
        const h = remotePlayer.height;

        // Draw based on character type
        const char = remotePlayer.character || 'human';
        drawCharacterSimple(ctx, char, w, h);

        ctx.restore();
    }

    function drawCharacterSimple(ctx, charType, w, h) {
        switch (charType) {
            case 'human':
                // Body
                ctx.fillStyle = '#5a3a4a';
                ctx.fillRect(-w/2 + 4, -h/2 + 12, w - 8, h - 16);
                // Head
                ctx.fillStyle = '#d4a373';
                ctx.fillRect(-w/2 + 6, -h/2, w - 12, 14);
                // Eyes
                ctx.fillStyle = '#4a7878';
                ctx.fillRect(-w/2 + 9, -h/2 + 4, 4, 4);
                ctx.fillRect(-w/2 + 17, -h/2 + 4, 4, 4);
                // Legs
                ctx.fillStyle = '#3a2a3a';
                ctx.fillRect(-w/2 + 6, h/2 - 8, 7, 8);
                ctx.fillRect(-w/2 + 17, h/2 - 8, 7, 8);
                break;
            case 'skeleton':
                // Body
                ctx.fillStyle = '#e8e8e0';
                ctx.fillRect(-w/2 + 6, -h/2 + 12, w - 12, h - 16);
                // Head (skull)
                ctx.fillStyle = '#f0f0e8';
                ctx.fillRect(-w/2 + 4, -h/2, w - 8, 14);
                // Eye sockets
                ctx.fillStyle = '#000';
                ctx.fillRect(-w/2 + 8, -h/2 + 3, 5, 5);
                ctx.fillRect(-w/2 + 17, -h/2 + 3, 5, 5);
                // Glow
                ctx.fillStyle = '#4a7878';
                ctx.fillRect(-w/2 + 9, -h/2 + 4, 3, 3);
                ctx.fillRect(-w/2 + 18, -h/2 + 4, 3, 3);
                break;
            case 'dog':
                // Body
                ctx.fillStyle = '#c4935a';
                ctx.fillRect(-w/2 + 2, -h/2 + 10, w - 4, h - 14);
                // Head
                ctx.fillStyle = '#d4a36a';
                ctx.fillRect(-w/2 + 4, -h/2, w - 8, 14);
                // Eyes
                ctx.fillStyle = '#222';
                ctx.fillRect(-w/2 + 8, -h/2 + 4, 4, 4);
                ctx.fillRect(-w/2 + 18, -h/2 + 4, 4, 4);
                // Ears
                ctx.fillStyle = '#a07848';
                ctx.fillRect(-w/2 + 2, -h/2 - 4, 6, 8);
                ctx.fillRect(-w/2 + w - 8, -h/2 - 4, 6, 8);
                // Tail
                ctx.fillStyle = '#c4935a';
                ctx.fillRect(w/2 - 2, -h/2 + 12, 6, 4);
                break;
            case 'cat':
                // Body
                ctx.fillStyle = '#8a8a8a';
                ctx.fillRect(-w/2 + 4, -h/2 + 10, w - 8, h - 14);
                // Head
                ctx.fillStyle = '#9a9a9a';
                ctx.fillRect(-w/2 + 4, -h/2, w - 8, 14);
                // Eyes
                ctx.fillStyle = '#ffaa00';
                ctx.fillRect(-w/2 + 8, -h/2 + 4, 4, 4);
                ctx.fillRect(-w/2 + 18, -h/2 + 4, 4, 4);
                // Ears (triangles)
                ctx.fillStyle = '#7a7a7a';
                ctx.beginPath();
                ctx.moveTo(-w/2 + 4, -h/2);
                ctx.lineTo(-w/2 + 1, -h/2 - 6);
                ctx.lineTo(-w/2 + 10, -h/2);
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(w/2 - 4, -h/2);
                ctx.lineTo(w/2 - 1, -h/2 - 6);
                ctx.lineTo(w/2 - 10, -h/2);
                ctx.fill();
                break;
        }
    }

    function drawHeightProgress(ctx, currentHeight, canvasWidth) {
        const barHeight = 6;
        const barY = CANVAS_LOGICAL_H - barHeight;
        const progress = Math.min(1, currentHeight / targetHeight);

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, barY, canvasWidth, barHeight);

        // Progress fill
        const gradient = ctx.createLinearGradient(0, barY, canvasWidth * progress, barY);
        gradient.addColorStop(0, '#4a7878');
        gradient.addColorStop(1, '#6a4a5a');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, barY, canvasWidth * progress, barHeight);

        // Target marker
        ctx.fillStyle = '#ffcc00';
        ctx.fillRect(canvasWidth - 2, barY, 2, barHeight);
    }

    function renderBattleHUD() {
        const hudEl = document.getElementById('battle-hud');
        if (!hudEl) return;

        const localHeight = Math.max(0, Math.floor((WORLD_FLOOR_Y - player.y - player.height) / 10));
        const localProgress = Math.min(100, (maxHeight / targetHeight) * 100);
        const remoteProgress = Math.min(100, (remoteMaxHeight / targetHeight) * 100);

        hudEl.innerHTML = `
            <div class="battle-target">목표: ${targetHeight}m</div>
            <div class="battle-scores">
                <div class="battle-score local">
                    <span class="score-label">나</span>
                    <div class="score-bar-bg"><div class="score-bar-fill local-fill" style="width:${localProgress}%"></div></div>
                    <span class="score-value">${maxHeight}m</span>
                </div>
                <div class="battle-score remote">
                    <span class="score-label">상대</span>
                    <div class="score-bar-bg"><div class="score-bar-fill remote-fill" style="width:${remoteProgress}%"></div></div>
                    <span class="score-value">${remoteMaxHeight}m</span>
                </div>
            </div>
        `;
    }

    function showBattleResult(result) {
        stopSync();
        gameEnded = true;

        const resultScreen = document.getElementById('battle-result');
        if (!resultScreen) return;

        document.getElementById('battle-game-container').style.display = 'none';
        resultScreen.style.display = 'block';

        const titleEl = document.getElementById('battle-result-title');
        const detailEl = document.getElementById('battle-result-detail');

        if (result === 'win') {
            titleEl.textContent = '승리!';
            titleEl.style.color = '#4af078';
            detailEl.innerHTML = `
                <p>목표 높이 ${targetHeight}m에 먼저 도달했습니다!</p>
                <p class="result-compare">나: ${maxHeight}m vs 상대: ${remoteMaxHeight}m</p>
            `;
        } else if (result === 'lose') {
            titleEl.textContent = '패배...';
            titleEl.style.color = '#f04a4a';
            detailEl.innerHTML = `
                <p>상대가 먼저 ${targetHeight}m에 도달했습니다.</p>
                <p class="result-compare">나: ${maxHeight}m vs 상대: ${remoteMaxHeight}m</p>
            `;
        } else if (result === 'disconnect') {
            titleEl.textContent = '승리! (상대 연결 끊김)';
            titleEl.style.color = '#ffcc00';
            detailEl.innerHTML = `
                <p>상대방의 연결이 끊어졌습니다.</p>
                <p>나의 최종 높이: ${maxHeight}m</p>
            `;
        }
    }

    function cleanup() {
        active = false;
        battleStarted = false;
        winner = null;
        stopSync();
        if (countdownTimer) {
            clearInterval(countdownTimer);
            countdownTimer = null;
        }
        Network.disconnect();
    }

    function isActive() {
        return active;
    }

    function isBattleStarted() {
        return battleStarted;
    }

    function getTargetHeight() {
        return targetHeight;
    }

    function getRemoteMaxHeight() {
        return remoteMaxHeight;
    }

    function getWinner() {
        return winner;
    }

    return {
        initBattle,
        setupSplitScreen,
        startCountdown,
        startBattleGame,
        generateBlocksWithSeed,
        handleNetworkMessage,
        renderBattle,
        renderLocalSide,
        renderRemoteSide,
        showBattleResult,
        cleanup,
        isActive,
        isBattleStarted,
        getTargetHeight,
        getRemoteMaxHeight,
        getWinner,
        remotePlayer,
        drawCharacterSimple,
        setTargetHeight: (h) => { targetHeight = h; },
        setSeed: (s) => { battleSeed = s; },
        getSeed: () => battleSeed
    };
})();
