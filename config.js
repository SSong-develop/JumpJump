// ===== JUMP JUMP CONFIG MODULE =====
// This file contains all constants, configuration, zone themes, story data, and environment clues
// Extracted from game.js for better code organization and maintainability
// All variables are plain declarations for browser JS loaded via script tags

// ===== CANVAS CONFIGURATION =====
const CANVAS_LOGICAL_W = 500;
const CANVAS_LOGICAL_H = 700;

// ===== GAME PHYSICS CONSTANTS =====
const GRAVITY = 0.5;
const MAX_JUMP_POWER = 18;
const CHARGE_SPEED = 0.4;
const HORIZONTAL_SPEED = 5;
const BLOCK_WIDTH = 80;
const BLOCK_HEIGHT = 20;
const FLOOR_HEIGHT = 30;

// Enhanced physics system
const COYOTE_TIME = 8; // Frames player can jump after leaving platform
const JUMP_BUFFER_TIME = 10; // Jump buffer frame count
const AIR_FRICTION = 0.985; // Air friction
const GROUND_FRICTION = 0.85; // Ground friction (sliding effect)
const AIR_CONTROL = 0.6; // Air control multiplier
const VARIABLE_JUMP_MULTIPLIER = 0.5; // Short jump gravity multiplier

// World coordinate system reference point (floor y coordinate)
const WORLD_FLOOR_Y = 1000;

// ===== CHECKPOINT SYSTEM =====
const CHECKPOINT_HEIGHTS = [100, 200, 300, 400, 500];

// ===== STORY SYSTEM =====
const storyMilestones = {
    // === Zone 0: Entry (0-50m) - 버려진 도시의 지하 시설 ===
    0: "여긴... 버려진 타워의 입구야. 아이를 찾으려면 올라가야 해.",
    10: "비상등이 깜빡인다. 이 시설은... 오래전에 폐쇄된 것 같다.",
    25: "바닥에 먼지가 두껍게 쌓여있다. 하지만 작은 발자국이... 최근 것이다.",
    40: "벽에 긁힌 자국. '출구는 위에'라고 적혀 있다.",

    // === Zone 1: Unease (50-100m) - 불안감의 시작 ===
    50: "벽에 누군가의 메시지가 있다... '올라가지 마라. 위에는 아무것도 없다.'",
    60: "환기구에서 차가운 바람이 불어온다. 뭔가... 살아있는 것 같다.",
    75: "깨진 유리 파편 사이에서 아이의 운동화 한 짝을 발견했다.",
    90: "보안 카메라가 아직 작동하고 있다. 누군가 지켜보고 있는 걸까?",

    // === Zone 2: Deeper (100-150m) - 과거 연구시설의 흔적 ===
    100: "점점 어두워진다. 하지만 아이의 인형이 여기 있었어... 맞는 방향이야.",
    110: "실험실 문이 열려있다. 안에는 깨진 시험관과... 이상한 액체가.",
    125: "벽에 붙은 연구 보고서. '프로젝트 바벨탑 - 3단계 승인'이라고 적혀있다.",
    140: "여기서 무슨 실험을 했던 거지? 벽의 스크래치 자국이 사람 것이 아니다.",

    // === Zone 3: Rust (150-200m) - 공포의 시작 ===
    150: "다른 생존자의 흔적... 이미 오래전 일이다. 마른 핏자국이 보인다.",
    165: "라디오에서 잡음이 들린다. 가끔... 아이의 목소리 같은 것이 섞여있다.",
    180: "여기 일기장이 있다. '7일째, 위에서 내려오는 소리가 점점 커진다...'",
    195: "복도가 갈라진다. 한쪽에는 '돌아가라'는 경고문. 다른 쪽에는 아이의 그림.",

    // === Zone 4: Danger (200-250m) - 위험 구역 ===
    200: "이상한 소리가 들린다. 위에서... 뭔가가 움직이고 있어.",
    215: "비상 방송 시스템이 갑자기 켜졌다. '모든 인원은 즉시 대피하십시오.'",
    230: "깨진 창문 너머로 도시가 보인다. 불빛이 하나도 없다... 모두 떠난 건가?",
    245: "누군가 남긴 무전기. '...아이들이... 꼭대기에서... 빛을...' 잡음에 끊긴다.",

    // === Zone 5: Deep Danger (250-300m) - 진실에 가까워짐 ===
    250: "아이가 쓴 편지를 찾았다. '아빠, 무서워요. 위에서 기다릴게요.'",
    265: "벽에 손톱자국이... 누군가 필사적으로 올라갔다.",
    280: "연구원의 마지막 기록. '바벨탑 프로젝트의 본질을 이해했다. 이것은 실험이 아니라...'",
    295: "공기가 차갑다. 숨을 쉴 때마다 하얀 김이 나온다.",

    // === Zone 6: Core (300-400m) - 핵심 구역, 진실이 드러남 ===
    300: "공기가 차갑다. 벽에 손톱자국이... 누군가 필사적으로 올라갔다.",
    320: "이곳의 구조가 바뀌기 시작했다. 계단이 있어야 할 곳에 벽이, 벽이 있어야 할 곳에 공허가.",
    340: "또 다른 일기장. '바벨탑은 물리적 구조물이 아니다. 이것은 의지의 시험이다.'",
    360: "거울이 있다. 내 모습이... 이상하다. 피로한 것 이상의 무언가.",
    380: "아이의 목소리가 들린다. 점점 선명해진다. '아빠, 거의 다 왔어요!'",

    // === Zone 7: Abyss (400-500m) - 심연, 정신적 한계 ===
    400: "시야가 흐려진다. 현실인지 환상인지... 아이의 목소리가 들리는 것 같다.",
    420: "벽이 숨을 쉬고 있다. 아니... 내가 숨을 쉬는 것에 맞춰 벽이 움직이는 것인가?",
    440: "과거의 기억이 스쳐 지나간다. 아이와 함께 공원에서 놀던 날...",
    460: "다리가 떨린다. 하지만 포기할 수 없어. 아이가 기다리고 있으니까.",
    480: "어둠 속에서 빛이 보인다. 환상인가... 아닌가.",

    // === Zone 8: Anomaly (500-600m) - 초자연적 공간 ===
    500: "거의 다 왔어... 빛이 보인다. 아이가... 거기 있는 거야?",
    520: "공간이 뒤틀린다. 위와 아래의 구분이 사라지고 있다.",
    540: "떠다니는 기억의 파편들. 아이의 웃음소리, 첫 걸음마, 생일 파티...",
    560: "이 탑은... 올라가는 사람의 의지를 시험하는 것이었구나.",
    580: "마지막 문이 보인다. 그 너머에서 따뜻한 빛이 새어 나온다.",

    // === Zone 9: Surface (600m+) - 구원, 엔딩 ===
    600: "정상에 도달했다. 아이는... 여기 있었구나. 이제 괜찮아.",
    620: "햇빛이 눈부시다. 이 탑 위에서 바라본 세상은... 아직 아름답다.",
    650: "아이가 웃고 있다. '아빠가 올 줄 알았어요.' 이 한마디에 모든 고통이 사라진다.",
    700: "함께 내려가자. 이제 더 이상 무섭지 않아. 아빠가 여기 있으니까."
};

// Character-specific dialogue system
const characterDialogues = {
    human: {
        50: "(주머니에서 아이의 사진을 꺼내본다...)",
        200: "군인 시절의 훈련이 도움이 되고 있어. 하지만 이건 전쟁이 아니야.",
        400: "다리가 후들거린다... 하지만 아빠니까. 아빠는 포기하면 안 돼.",
        600: "(눈물을 참으며) 드디어... 찾았다."
    },
    skeleton: {
        50: "...뼈만 남은 몸이지만, 기억은 아직 선명하다.",
        200: "살아있을 때 하지 못한 일... 이제라도 해야지.",
        400: "이 몸이 부서질 때까지... 올라간다.",
        600: "...이 따뜻함은 뭐지? 잊고 있었던 감정이다."
    },
    dog: {
        50: "(코를 킁킁거리며 아이의 냄새를 추적한다)",
        200: "(불안하게 꼬리를 내린다. 하지만 냄새는 확실히 위에서 온다.)",
        400: "(지치지만 충성스러운 눈빛으로 위를 바라본다)",
        600: "(꼬리를 미친 듯이 흔들며 아이에게 달려간다!)"
    },
    cat: {
        50: "(귀를 쫑긋 세우고 위를 향해 조용히 걷는다)",
        200: "(어둠 속에서도 눈이 빛난다. 고양이의 야간 시력이 도움이 된다.)",
        400: "(지쳐서 잠시 웅크린다... 하지만 이내 다시 일어선다.)",
        600: "(조용히 아이 옆에 앉아 그르렁거린다)"
    }
};

// Environmental storytelling - visual clues displayed on blocks
const environmentalClues = {
    30: { type: 'footprint', desc: '작은 발자국' },
    80: { type: 'toy', desc: '떨어진 인형 팔' },
    130: { type: 'note', desc: '찢어진 메모' },
    220: { type: 'photo', desc: '깨진 가족 사진' },
    350: { type: 'drawing', desc: '아이의 크레용 그림' },
    480: { type: 'light', desc: '희미한 빛' },
    550: { type: 'warmth', desc: '따뜻한 공기' }
};

// ===== ITEM TYPES =====
const ITEM_TYPES = [
    { type: 'doubleJump', color: '#ffdd00', glyph: '2x', duration: 0 },    // Immediate activation
    { type: 'speedBoost', color: '#ff6600', glyph: '▶▶', duration: 420 },  // 7 seconds
    { type: 'shield',     color: '#4488ff', glyph: '🛡', duration: 0 },     // 1 use
    { type: 'slowMotion', color: '#cc44ff', glyph: '⏳', duration: 300 }    // 5 seconds
];

// ===== 10 ZONES THEME SYSTEM =====
const zones = {
    0: { // 0-100m: Entry - Dark industrial, dim teal emergency lights
        blockColor1: '#1a2428',
        blockColor2: '#0f1820',
        blockBorder: '#3a6868',
        blockDot: '#5a8888',
        backgroundColor: '#2a4848',
        particleColors: ['#3a6868', '#2a5858', '#4a7878'],
        backgroundOpacity: 0.08,
        name: 'entry',
        vignette: 0.15,
        screenShake: 0,
        glitch: false,
        fogDensity: 0.08
    },
    1: { // 50-100m: Slight unease - Concrete and metal, dim teal accents
        blockColor1: '#1a2428',
        blockColor2: '#0f1820',
        blockBorder: '#3a6868',
        blockDot: '#5a8888',
        backgroundColor: '#2a4a52',
        particleColors: ['#3a6868', '#4a7878', '#2a5858'],
        backgroundOpacity: 0.1,
        name: 'unease',
        vignette: 0.18,
        screenShake: 0.2,
        glitch: false,
        fogDensity: 0.1
    },
    2: { // 100-150m: Deeper - Rust-tinged, amber warning lights
        blockColor1: '#2a1f20',
        blockColor2: '#1a1218',
        blockBorder: '#6a5a4a',
        blockDot: '#8a7a6a',
        backgroundColor: '#3a3028',
        particleColors: ['#8a7a3a', '#7a6a5a', '#6a5a4a'],
        backgroundOpacity: 0.12,
        name: 'deeper',
        vignette: 0.25,
        screenShake: 0.4,
        glitch: false,
        fogDensity: 0.15
    },
    3: { // 150-200m: More rust - Failing systems, amber accents
        blockColor1: '#2a1f20',
        blockColor2: '#1a1218',
        blockBorder: '#7a6a5a',
        blockDot: '#8a7a6a',
        backgroundColor: '#4a3a2a',
        particleColors: ['#8a7a3a', '#7a6a4a', '#6a5a3a'],
        backgroundOpacity: 0.14,
        name: 'rust',
        vignette: 0.3,
        screenShake: 0.6,
        glitch: true,
        fogDensity: 0.2
    },
    4: { // 200-250m: Danger - Dark red emergency lighting, corroded
        blockColor1: '#2a1a1a',
        blockColor2: '#1a0a0a',
        blockBorder: '#6a3030',
        blockDot: '#7a4a4a',
        backgroundColor: '#3a2020',
        particleColors: ['#6a3030', '#7a4040', '#5a2a2a'],
        backgroundOpacity: 0.16,
        name: 'danger',
        vignette: 0.4,
        screenShake: 1.2,
        glitch: true,
        fogDensity: 0.3
    },
    5: { // 250-300m: Deeper danger - Dark red, corrupted systems
        blockColor1: '#1a1010',
        blockColor2: '#0a0808',
        blockBorder: '#5a2828',
        blockDot: '#6a3a3a',
        backgroundColor: '#2a1515',
        particleColors: ['#5a2828', '#6a3030', '#4a2020'],
        backgroundOpacity: 0.18,
        name: 'deepdanger',
        vignette: 0.5,
        screenShake: 1.5,
        glitch: true,
        fogDensity: 0.4
    },
    6: { // 300-400m: Core - Almost total darkness, faint red glow
        blockColor1: '#0a0808',
        blockColor2: '#050404',
        blockBorder: '#4a2020',
        blockDot: '#5a3030',
        backgroundColor: '#1a0a0a',
        particleColors: ['#4a2020', '#5a2828', '#3a1818'],
        backgroundOpacity: 0.15,
        name: 'core',
        vignette: 0.6,
        screenShake: 1.8,
        glitch: true,
        fogDensity: 0.5
    },
    7: { // 400-500m: Total darkness - Faint red, barely visible
        blockColor1: '#050404',
        blockColor2: '#020202',
        blockBorder: '#3a1818',
        blockDot: '#4a2828',
        backgroundColor: '#0f0808',
        particleColors: ['#3a1818', '#4a2020', '#2a1010'],
        backgroundOpacity: 0.12,
        name: 'abyss',
        vignette: 0.7,
        screenShake: 2,
        glitch: true,
        fogDensity: 0.6
    },
    8: { // 500-600m: Anomaly - Dim amber/yellow, otherworldly but muted
        blockColor1: '#1a1810',
        blockColor2: '#0a0a08',
        blockBorder: '#6a5a3a',
        blockDot: '#7a6a4a',
        backgroundColor: '#2a2418',
        particleColors: ['#6a5a3a', '#7a6a4a', '#5a4a2a'],
        backgroundOpacity: 0.14,
        name: 'anomaly',
        vignette: 0.45,
        screenShake: 1.2,
        glitch: true,
        fogDensity: 0.35
    },
    9: { // 600m+: Surface - First hint of pale daylight, muted greens/grays
        blockColor1: '#1a2a20',
        blockColor2: '#0a1a10',
        blockBorder: '#4a6a5a',
        blockDot: '#5a7a6a',
        backgroundColor: '#3a5a4a',
        particleColors: ['#4a6a5a', '#5a7a6a', '#3a5a4a'],
        backgroundOpacity: 0.1,
        name: 'surface',
        vignette: 0.2,
        screenShake: 0.3,
        glitch: false,
        fogDensity: 0.1
    }
};

// ===== FLOOR AND KEYS OBJECTS =====
// Floor object (world coordinate system)
const floor = {
    x: 0,
    y: WORLD_FLOOR_Y,
    width: 500, // CANVAS_LOGICAL_W
    height: FLOOR_HEIGHT
};

// Key input states
const keys = {
    left: false,
    right: false,
    space: false
};

// ===== ACHIEVEMENTS SYSTEM =====
const ACHIEVEMENTS = [
    { id: 'first_jump',    title: '첫 도약',         desc: '처음으로 점프하다',             icon: '🚀', condition: s => s.totalJumps >= 1 },
    { id: 'height_50',     title: '하늘을 향해',      desc: '50m 도달',                    icon: '☁️', condition: s => s.maxHeight >= 50 },
    { id: 'height_200',    title: '구름 위에서',      desc: '200m 도달',                   icon: '🌤', condition: s => s.maxHeight >= 200 },
    { id: 'height_400',    title: '성층권',           desc: '400m 도달',                   icon: '🌙', condition: s => s.maxHeight >= 400 },
    { id: 'height_600',    title: '끝의 시작',        desc: '600m 정상 도달',               icon: '⭐', condition: s => s.maxHeight >= 600 },
    { id: 'jumps_100',     title: '점프 달인',        desc: '점프 100회',                  icon: '💪', condition: s => s.totalJumps >= 100 },
    { id: 'bounce_land',   title: '슈퍼 바운스',      desc: '바운스 블록에 착지',            icon: '🟢', condition: s => s.bounceLandings >= 1 },
    { id: 'item_collect',  title: '수집가',           desc: '아이템 5개 수집',              icon: '💎', condition: s => s.itemsCollected >= 5 },
    { id: 'double_jump',   title: '두 번 날다',       desc: '이중 점프 사용',               icon: '✨', condition: s => s.doubleJumpsUsed >= 1 },
    { id: 'speedrun',      title: '스피드런',         desc: '200m를 200초 이내 도달',       icon: '⚡', condition: s => s.maxHeight >= 200 && s.timeElapsed < 200 * 60 }
];

// ===== ENDING CUTSCENE SYSTEM =====
const endingScenes = [
    { text: "길고 긴 여정이었다...", duration: 3000 },
    { text: "어둠 속에서 포기하지 않았기에\n이곳까지 올 수 있었다.", duration: 4000 },
    { text: "그리고 마침내...", duration: 2500 },
    { text: "아이를 찾았다.", duration: 3000 },
    { text: "\"아빠... 올 줄 알았어요.\"", duration: 3500 },
    { text: "이제 함께 돌아가자.\n다시는 놓지 않을게.", duration: 4000 }
];

const characterEndingText = {
    human: "아이를 품에 안았다. 따뜻하다.",
    skeleton: "뼈만 남은 손으로 아이를 감싸 안았다.\n잊고 있었던 온기가 돌아온다.",
    dog: "꼬리를 미친 듯이 흔들며 아이의 얼굴을 핥았다.\n아이의 웃음소리가 울려 퍼진다.",
    cat: "조용히 아이의 무릎 위에 올라갔다.\n그르렁거리는 소리가 모든 것을 말해준다."
};
