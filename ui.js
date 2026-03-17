// ui.js - UI, Story, Achievements, Endings, Touch Controls

// State variables
let shownStories = new Set();

let unlockedAchievements = new Set(JSON.parse(localStorage.getItem('jumpjump_achievements') || '[]'));
let achievementQueue = []; // 화면에 표시할 업적 알림 대기열
let achievementDisplayTimer = 0;
let currentAchievementNotif = null;

let endingSceneIndex = 0;
let endingTimer = null;

let tutorialSkipped = false;

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

function updateJumpCountDisplay() {
    const jumpsLeft = maxJumps - currentJumps;
    document.getElementById('jumps-left').textContent = jumpsLeft;
}

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

