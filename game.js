const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = 500;
canvas.height = 700;

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
    facingRight: true
};

// 카메라 오프셋 (스크롤용)
let cameraY = 0;
let maxHeight = 0;

// 블록 배열
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

// 블록 생성 함수 (월드 좌표계)
function generateBlocks() {
    blocks = [];

    // 시작 블록 (바닥 바로 위)
    blocks.push({
        x: canvas.width / 2 - BLOCK_WIDTH / 2,
        y: WORLD_FLOOR_Y - 100,
        width: BLOCK_WIDTH,
        height: BLOCK_HEIGHT
    });

    // 블록 생성 (위로 올라가면서) - 도달 가능한 위치에 배치
    let lastY = WORLD_FLOOR_Y - 100;
    let lastX = canvas.width / 2 - BLOCK_WIDTH / 2;

    // 최대 점프 높이 계산: v^2 / (2*g) = 18^2 / (2*0.5) = 324
    // 안전 마진을 두고 최대 높이 간격 설정
    const maxJumpHeight = (MAX_JUMP_POWER * MAX_JUMP_POWER) / (2 * GRAVITY);
    const safeVerticalGap = maxJumpHeight * 0.4; // 안전하게 40%만 사용 (약 130)

    // 최대 점프 거리 계산 (수평): 수평속도 * 체공시간
    // 체공시간 = 2 * v / g = 2 * 18 / 0.5 = 72 프레임
    // 수평거리 = 5 * (18/18) * 72 * 0.99^36 ≈ 250 (공기저항 고려)
    const maxJumpDistance = HORIZONTAL_SPEED * (2 * MAX_JUMP_POWER / GRAVITY) * 0.5;
    const safeHorizontalGap = maxJumpDistance * 0.6; // 안전하게 60%만 사용

    for (let i = 0; i < 100; i++) {
        // 수직 간격: 고정 범위 내에서 설정 (점프로 도달 가능한 범위)
        const minGap = 60;
        const maxGap = Math.min(120, safeVerticalGap); // 최대 120 또는 안전 높이
        const yGap = minGap + Math.random() * (maxGap - minGap);

        // 수평 위치: 이전 블록 기준으로 도달 가능한 범위 내에서만 배치
        // 수직 간격에 따라 수평 이동 거리 조절 (높이 올라갈수록 수평 거리 제한)
        const heightRatio = yGap / maxGap;
        const allowedHorizontalMove = safeHorizontalGap * (1 - heightRatio * 0.5);

        let newX = lastX + (Math.random() - 0.5) * allowedHorizontalMove * 2;

        // 화면 경계 체크
        newX = Math.max(20, Math.min(canvas.width - BLOCK_WIDTH - 20, newX));

        const newY = lastY - yGap;

        blocks.push({
            x: newX,
            y: newY,
            width: BLOCK_WIDTH,
            height: BLOCK_HEIGHT
        });

        lastY = newY;
        lastX = newX;
    }
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
        return;
    }

    // 블록 체크 (월드 좌표 기준)
    for (const block of blocks) {
        // 수평으로 블록과 겹치는지 확인
        const horizontalOverlap = player.x + player.width > block.x && player.x < block.x + block.width;

        if (!horizontalOverlap) continue;

        // 떨어지는 중 착지 체크 (이전 프레임에서 블록 위에 있었고, 현재 블록을 통과했거나 블록 위에 있는 경우)
        if (player.velocityY >= 0 &&
            prevPlayerBottom <= block.y &&
            playerBottom >= block.y) {
            player.y = block.y - player.height;
            player.velocityY = 0;
            player.isOnGround = true;
            return;
        }
    }

    player.isOnGround = false;
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
        const blockRect = {
            x: block.x,
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

        player.velocityY = -player.jumpPower;
        player.velocityX = player.direction * HORIZONTAL_SPEED * (player.jumpPower / MAX_JUMP_POWER);
        player.isOnGround = false;
        player.isCharging = false;
        player.jumpPower = 0;

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

    // 중력 적용
    if (!player.isOnGround) {
        player.velocityY += GRAVITY;
    }

    // 위치 업데이트
    player.x += player.velocityX;
    player.y += player.velocityY;

    // 공중에서 마찰
    if (!player.isOnGround) {
        player.velocityX *= 0.99;
    } else {
        player.velocityX = 0;
    }

    // 충돌 체크
    checkWallCollision();
    checkBlockSideCollision();
    checkLanding();

    // 카메라 업데이트 (플레이어를 화면 하단 1/3 지점에 유지)
    const targetScreenY = canvas.height * 0.6; // 화면 하단 60% 위치
    cameraY = targetScreenY - player.y;

    // 최대 높이 업데이트 (바닥 기준)
    const currentHeight = Math.floor((WORLD_FLOOR_Y - player.y - player.height) / 10);
    if (currentHeight > maxHeight) {
        maxHeight = currentHeight;
    }

    // UI 업데이트
    document.getElementById('height').textContent = Math.max(0, currentHeight);
    document.getElementById('power-bar').style.width = (player.jumpPower / MAX_JUMP_POWER * 100) + '%';
}

// 해골 캐릭터 그리기
function drawSkeleton(screenY) {
    // 몸체 (뼈)
    ctx.fillStyle = '#e0e0e0';
    ctx.fillRect(player.x + 8, screenY + 20, 14, 20);

    // 머리 (해골)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(player.x + player.width / 2, screenY + 12, 12, 0, Math.PI * 2);
    ctx.fill();

    // 눈구멍
    ctx.fillStyle = '#1a1a2e';
    const eyeX = player.facingRight ? player.x + 17 : player.x + 8;
    ctx.beginPath();
    ctx.arc(eyeX, screenY + 10, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(eyeX + 6, screenY + 10, 4, 0, Math.PI * 2);
    ctx.fill();

    // 코
    ctx.beginPath();
    ctx.moveTo(player.x + 15, screenY + 15);
    ctx.lineTo(player.x + 13, screenY + 18);
    ctx.lineTo(player.x + 17, screenY + 18);
    ctx.fill();

    // 다리 뼈
    ctx.fillStyle = '#e0e0e0';
    ctx.fillRect(player.x + 8, screenY + 38, 5, 12);
    ctx.fillRect(player.x + 17, screenY + 38, 5, 12);
}

// 인간 캐릭터 그리기
function drawHuman(screenY) {
    // 몸체
    ctx.fillStyle = '#ff6b6b';
    ctx.fillRect(player.x, screenY + 15, player.width, 25);

    // 얼굴
    ctx.fillStyle = '#ffe66d';
    ctx.beginPath();
    ctx.arc(player.x + player.width / 2, screenY + 10, 10, 0, Math.PI * 2);
    ctx.fill();

    // 머리카락
    ctx.fillStyle = '#5a3825';
    ctx.beginPath();
    ctx.arc(player.x + player.width / 2, screenY + 5, 10, Math.PI, 0);
    ctx.fill();

    // 눈
    ctx.fillStyle = '#333';
    if (player.facingRight) {
        ctx.fillRect(player.x + 17, screenY + 8, 4, 4);
    } else {
        ctx.fillRect(player.x + 9, screenY + 8, 4, 4);
    }

    // 다리
    ctx.fillStyle = '#4a69bd';
    ctx.fillRect(player.x + 5, screenY + 38, 8, 12);
    ctx.fillRect(player.x + 17, screenY + 38, 8, 12);
}

// 강아지 캐릭터 그리기
function drawDog(screenY) {
    // 몸체
    ctx.fillStyle = '#c4a574';
    ctx.fillRect(player.x + 2, screenY + 18, 26, 16);

    // 머리
    ctx.fillStyle = '#c4a574';
    ctx.beginPath();
    ctx.arc(player.x + player.width / 2, screenY + 12, 12, 0, Math.PI * 2);
    ctx.fill();

    // 귀
    ctx.fillStyle = '#8b6914';
    if (player.facingRight) {
        ctx.beginPath();
        ctx.ellipse(player.x + 22, screenY + 3, 6, 10, 0.3, 0, Math.PI * 2);
        ctx.fill();
    } else {
        ctx.beginPath();
        ctx.ellipse(player.x + 8, screenY + 3, 6, 10, -0.3, 0, Math.PI * 2);
        ctx.fill();
    }

    // 눈
    ctx.fillStyle = '#333';
    if (player.facingRight) {
        ctx.beginPath();
        ctx.arc(player.x + 19, screenY + 10, 3, 0, Math.PI * 2);
        ctx.fill();
    } else {
        ctx.beginPath();
        ctx.arc(player.x + 11, screenY + 10, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    // 코
    ctx.fillStyle = '#333';
    const noseX = player.facingRight ? player.x + 25 : player.x + 5;
    ctx.beginPath();
    ctx.arc(noseX, screenY + 14, 3, 0, Math.PI * 2);
    ctx.fill();

    // 다리
    ctx.fillStyle = '#c4a574';
    ctx.fillRect(player.x + 4, screenY + 32, 6, 12);
    ctx.fillRect(player.x + 20, screenY + 32, 6, 12);

    // 꼬리
    ctx.fillStyle = '#c4a574';
    const tailX = player.facingRight ? player.x : player.x + 26;
    ctx.beginPath();
    ctx.ellipse(tailX, screenY + 22, 4, 8, player.facingRight ? -0.5 : 0.5, 0, Math.PI * 2);
    ctx.fill();
}

// 고양이 캐릭터 그리기
function drawCat(screenY) {
    // 몸체
    ctx.fillStyle = '#ff9a56';
    ctx.fillRect(player.x + 3, screenY + 18, 24, 16);

    // 머리
    ctx.fillStyle = '#ff9a56';
    ctx.beginPath();
    ctx.arc(player.x + player.width / 2, screenY + 12, 11, 0, Math.PI * 2);
    ctx.fill();

    // 귀 (삼각형)
    ctx.fillStyle = '#ff9a56';
    ctx.beginPath();
    ctx.moveTo(player.x + 6, screenY + 5);
    ctx.lineTo(player.x + 3, screenY - 5);
    ctx.lineTo(player.x + 12, screenY + 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(player.x + 24, screenY + 5);
    ctx.lineTo(player.x + 27, screenY - 5);
    ctx.lineTo(player.x + 18, screenY + 2);
    ctx.fill();

    // 귀 안쪽 (핑크)
    ctx.fillStyle = '#ffb6c1';
    ctx.beginPath();
    ctx.moveTo(player.x + 7, screenY + 3);
    ctx.lineTo(player.x + 5, screenY - 2);
    ctx.lineTo(player.x + 10, screenY + 1);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(player.x + 23, screenY + 3);
    ctx.lineTo(player.x + 25, screenY - 2);
    ctx.lineTo(player.x + 20, screenY + 1);
    ctx.fill();

    // 눈
    ctx.fillStyle = '#2ecc71';
    if (player.facingRight) {
        ctx.beginPath();
        ctx.ellipse(player.x + 18, screenY + 10, 4, 5, 0, 0, Math.PI * 2);
        ctx.fill();
    } else {
        ctx.beginPath();
        ctx.ellipse(player.x + 12, screenY + 10, 4, 5, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    // 동공
    ctx.fillStyle = '#333';
    if (player.facingRight) {
        ctx.beginPath();
        ctx.ellipse(player.x + 19, screenY + 10, 2, 4, 0, 0, Math.PI * 2);
        ctx.fill();
    } else {
        ctx.beginPath();
        ctx.ellipse(player.x + 11, screenY + 10, 2, 4, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // 코
    ctx.fillStyle = '#ffb6c1';
    ctx.beginPath();
    ctx.moveTo(player.x + 15, screenY + 14);
    ctx.lineTo(player.x + 13, screenY + 17);
    ctx.lineTo(player.x + 17, screenY + 17);
    ctx.fill();

    // 수염
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    const whiskerX = player.facingRight ? player.x + 20 : player.x + 10;
    const whiskerDir = player.facingRight ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(whiskerX, screenY + 15);
    ctx.lineTo(whiskerX + whiskerDir * 10, screenY + 13);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(whiskerX, screenY + 17);
    ctx.lineTo(whiskerX + whiskerDir * 10, screenY + 17);
    ctx.stroke();

    // 다리
    ctx.fillStyle = '#ff9a56';
    ctx.fillRect(player.x + 5, screenY + 32, 6, 12);
    ctx.fillRect(player.x + 19, screenY + 32, 6, 12);

    // 꼬리
    ctx.strokeStyle = '#ff9a56';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    const tailStartX = player.facingRight ? player.x + 3 : player.x + 27;
    ctx.beginPath();
    ctx.moveTo(tailStartX, screenY + 25);
    ctx.quadraticCurveTo(
        tailStartX + (player.facingRight ? -15 : 15), screenY + 15,
        tailStartX + (player.facingRight ? -10 : 10), screenY + 5
    );
    ctx.stroke();
}

// 플레이어 그리기 (화면 좌표로 변환)
function drawPlayer() {
    ctx.save();

    // 화면 좌표로 변환
    const screenY = player.y + cameraY;

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

    // 충전 중 표시
    if (player.isCharging && player.isOnGround) {
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(player.x + player.width / 2, screenY - 10, 8 + player.jumpPower / 3, 0, Math.PI * 2);
        ctx.stroke();

        // 방향 화살표
        if (player.direction !== 0) {
            ctx.fillStyle = '#ffd700';
            ctx.beginPath();
            const arrowX = player.x + player.width / 2 + player.direction * 25;
            const arrowY = screenY + player.height / 2;
            ctx.moveTo(arrowX, arrowY - 10);
            ctx.lineTo(arrowX + player.direction * 15, arrowY);
            ctx.lineTo(arrowX, arrowY + 10);
            ctx.fill();
        }
    }

    ctx.restore();
}

// 블록 그리기
function drawBlocks() {
    for (const block of blocks) {
        const screenY = block.y + cameraY;

        // 화면에 보이는 블록만 그리기
        if (screenY > -50 && screenY < canvas.height + 50) {
            // 블록 그림자
            ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.fillRect(block.x + 3, screenY + 3, block.width, block.height);

            // 블록 본체
            const gradient = ctx.createLinearGradient(block.x, screenY, block.x, screenY + block.height);
            gradient.addColorStop(0, '#5a6e4a');
            gradient.addColorStop(1, '#3d4a32');
            ctx.fillStyle = gradient;
            ctx.fillRect(block.x, screenY, block.width, block.height);

            // 블록 테두리
            ctx.strokeStyle = '#7a8e6a';
            ctx.lineWidth = 2;
            ctx.strokeRect(block.x, screenY, block.width, block.height);

            // 풀 효과
            ctx.fillStyle = '#6a8e5a';
            for (let i = 0; i < 5; i++) {
                const grassX = block.x + 10 + i * 15;
                ctx.beginPath();
                ctx.moveTo(grassX, screenY);
                ctx.lineTo(grassX - 3, screenY - 8);
                ctx.lineTo(grassX + 3, screenY - 8);
                ctx.fill();
            }
        }
    }
}

// 바닥 그리기 (화면 좌표로 변환)
function drawFloor() {
    const floorScreenY = floor.y + cameraY;

    if (floorScreenY < canvas.height + floor.height && floorScreenY > -floor.height) {
        const gradient = ctx.createLinearGradient(0, floorScreenY, 0, floorScreenY + floor.height);
        gradient.addColorStop(0, '#4a5a3a');
        gradient.addColorStop(1, '#2a3a2a');
        ctx.fillStyle = gradient;
        ctx.fillRect(floor.x, floorScreenY, floor.width, floor.height);

        // 바닥 패턴
        ctx.fillStyle = '#5a6a4a';
        for (let i = 0; i < canvas.width; i += 30) {
            ctx.fillRect(i, floorScreenY, 15, 5);
        }
    }
}

// 배경 그리기
function drawBackground() {
    // 별 배경
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 50; i++) {
        const x = (i * 73) % canvas.width;
        const y = ((i * 137 + cameraY * 0.1) % (canvas.height + 200)) - 100;
        const size = (i % 3) + 1;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
    }
}

// 게임 렌더링
function render() {
    // 화면 클리어
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 배경
    drawBackground();

    // 바닥
    drawFloor();

    // 블록
    drawBlocks();

    // 플레이어
    drawPlayer();

    // 최고 높이 표시
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(`최고: ${maxHeight}m`, canvas.width - 10, 30);
}

// 점프 카운트 UI 업데이트
function updateJumpCountDisplay() {
    const jumpsLeft = maxJumps - currentJumps;
    document.getElementById('jumps-left').textContent = jumpsLeft;
}

// 게임 종료 체크 (내기 모드)
function checkGameEnd() {
    if (gameMode === 'bet' && currentJumps >= maxJumps && player.isOnGround && !gameEnded) {
        gameEnded = true;
        showResult();
    } else if (gameMode === 'bet' && currentJumps >= maxJumps && !gameEnded) {
        // 아직 공중이면 다시 체크
        setTimeout(checkGameEnd, 100);
    }
}

// 결과 화면 표시
function showResult() {
    document.getElementById('game-container').style.display = 'none';
    document.getElementById('result-screen').style.display = 'block';
    document.getElementById('final-height').textContent = maxHeight;
    document.getElementById('total-jumps').textContent = currentJumps;
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

    cameraY = 0;
    maxHeight = 0;
    currentJumps = 0;
    gameEnded = false;
    gameStarted = false;

    generateBlocks();
}

// 게임 루프
function gameLoop() {
    if (!gameEnded) {
        update();
    }
    render();
    requestAnimationFrame(gameLoop);
}

// 키보드 이벤트
document.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowLeft') {
        keys.left = true;
    }
    if (e.code === 'ArrowRight') {
        keys.right = true;
    }
    if (e.code === 'Space' && !keys.space) {
        keys.space = true;
        if (player.isOnGround) {
            player.isCharging = true;
            player.jumpPower = 0;
        }
    }
    e.preventDefault();
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

// 게임 모드 선택 이벤트
document.querySelectorAll('.mode-card').forEach(card => {
    card.addEventListener('click', () => {
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
        selectedCharacter = card.dataset.character;
        document.getElementById('character-select').style.display = 'none';
        document.getElementById('game-container').style.display = 'flex';

        // 내기 모드면 점프 카운트 표시
        if (gameMode === 'bet') {
            document.getElementById('jump-count-display').style.display = 'block';
            updateJumpCountDisplay();
        }

        startGame();
    });
});

// 다시하기 버튼
document.getElementById('restart-btn').addEventListener('click', () => {
    document.getElementById('result-screen').style.display = 'none';
    document.getElementById('mode-select').style.display = 'block';
    document.getElementById('jump-count-display').style.display = 'none';
    resetGame();
});

// 게임 시작 함수
function startGame() {
    if (gameStarted) return;
    gameStarted = true;
    generateBlocks();
    gameLoop();
}
