// Получаем доступ к нашему холсту (canvas)
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- НАСТРОЙКИ ИГРЫ ---
let score = 0;
let gameOver = false;

// Оптимизации для мобильных устройств
const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const performanceSettings = {
    maxParticles: isMobileDevice ? 30 : 50,
    particleLifeMultiplier: isMobileDevice ? 0.7 : 1,
    shadowBlurReduction: isMobileDevice ? 0.5 : 1,
    maxEnemiesOnScreen: isMobileDevice ? 1 : 2
};

// --- ИГРОК ---
const player = {
    x: canvas.width / 2 - 36, // Центрируем по новому размеру (72x72)
    y: canvas.height - 72,
    width: 60,
    height: 60,
    dx: 10, // Скорость по горизонтали
    dy: 0, // Скорость по вертикали
    gravity: 0.4, // gravity уменьшена для более медленной анимации прыжка
    jumpPower: -15, // прыжок остался высоким
    speed: 5,
    canJump: true // Флаг для контроля прыжка
};

// --- УПРАВЛЕНИЕ ---
const keys = {
    ArrowLeft: false,
    ArrowRight: false,
    ArrowUp: false,
    Space: false
};
// --- ЗВУКИ ---
const sounds = {
    jump: new Audio('jump.mp3'),
    shoot: new Audio('shoot.mp3'),
    hit: new Audio('hit.mp3'),
    gameOver: new Audio('gameOver.mp3'),
    'platform-break': new Audio('hit.mp3'), // Используем hit.mp3 для разрушения платформ
    'enemy-kill': new Audio('hit.mp3') // Используем hit.mp3 для убийства врагов
};

// Мобильное управление
let isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
let mobileControls = {
    left: false,
    right: false,
    shoot: false
};

document.addEventListener('keydown', (e) => {
    if (e.code in keys) {
        keys[e.code] = true;
    }    // Стреляем автонаводкой по пробелу или стрелке вверх
    if ((e.code === 'Space' || e.code === 'ArrowUp') && !gameOver) {
        shootAutoAim();
        playSound('shoot');
    }
});

document.addEventListener('keyup', (e) => {
    if (e.code in keys) {
        keys[e.code] = false;
    }
    // Перезапуск игры по нажатию Enter после проигрыша
    if (gameOver && e.code === 'Enter') {
        document.location.reload();
    }
});

// Инициализация мобильного управления
function initMobileControls() {
    if (!isMobile) return;
    
    const leftBtn = document.getElementById('leftBtn');
    const rightBtn = document.getElementById('rightBtn');
    const shootBtn = document.getElementById('shootBtn');
    
    // Функции для обработки нажатий
    function handleTouchStart(e) {
        e.preventDefault();
        this.classList.add('pressed');
    }
    
    function handleTouchEnd(e) {
        e.preventDefault();
        this.classList.remove('pressed');
    }
    
    // Левая кнопка
    leftBtn.addEventListener('touchstart', (e) => {
        handleTouchStart.call(leftBtn, e);
        mobileControls.left = true;
    });
    
    leftBtn.addEventListener('touchend', (e) => {
        handleTouchEnd.call(leftBtn, e);
        mobileControls.left = false;
    });
    
    leftBtn.addEventListener('touchcancel', (e) => {
        handleTouchEnd.call(leftBtn, e);
        mobileControls.left = false;
    });
    
    // Правая кнопка
    rightBtn.addEventListener('touchstart', (e) => {
        handleTouchStart.call(rightBtn, e);
        mobileControls.right = true;
    });
    
    rightBtn.addEventListener('touchend', (e) => {
        handleTouchEnd.call(rightBtn, e);
        mobileControls.right = false;
    });
    
    rightBtn.addEventListener('touchcancel', (e) => {
        handleTouchEnd.call(rightBtn, e);
        mobileControls.right = false;
    });
    
    // Кнопка стрельбы
    shootBtn.addEventListener('touchstart', (e) => {
        handleTouchStart.call(shootBtn, e);
        if (!gameOver) {
            shootAutoAim();
            playSound('shoot');
        }
    });
    
    shootBtn.addEventListener('touchend', (e) => {
        handleTouchEnd.call(shootBtn, e);
    });
    
    shootBtn.addEventListener('touchcancel', (e) => {
        handleTouchEnd.call(shootBtn, e);
    });
    
    // Добавляем поддержку мыши для тестирования на десктопе
    [leftBtn, rightBtn, shootBtn].forEach(btn => {
        btn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            btn.dispatchEvent(new TouchEvent('touchstart', { bubbles: true }));
        });
        
        btn.addEventListener('mouseup', (e) => {
            e.preventDefault();
            btn.dispatchEvent(new TouchEvent('touchend', { bubbles: true }));
        });
        
        btn.addEventListener('mouseleave', (e) => {
            e.preventDefault();
            btn.dispatchEvent(new TouchEvent('touchcancel', { bubbles: true }));
        });
    });
}

// --- ПЛАТФОРМЫ ---
const platforms = [];
let platformCount = 7; // стартовое количество платформ
let platformStep = 130; // стартовое расстояние между платформами
const platformWidth = 80;
const platformHeight = 15;

const PLATFORM_TYPES = [
    { type: 'normal', color: '#228B22' },
    { type: 'breakable', color: '#e53935' },
    { type: 'multi-break', color: '#ff9800' }
];

function randomPlatformType(i) {
    // Стартовая платформа всегда обычная
    if (i === 0) return 'normal';
    
    // Каждая третья платформа должна быть обычной для гарантии проходимости
    if (i % 3 === 0) return 'normal';
    
    const r = Math.random();
    if (r < 0.6) return 'normal';  // Увеличиваем шанс обычных платформ
    if (r < 0.8) return 'breakable';
    return 'multi-break';
}

function regeneratePlatforms() {
    platforms.length = 0;
    platforms.push({
        x: canvas.width / 2 - platformWidth / 2,
        y: canvas.height - 50,
        width: platformWidth,
        height: platformHeight,
        type: 'normal',
        breaking: false,
        hitsLeft: 0,
        breakAnim: 0
    });
    let prev = platforms[0];
    const maxY = getMaxJumpHeight() * 0.6; // Безопасное расстояние
    const minStep = platformHeight + 20; // Минимальное расстояние
    for (let i = 1; i < platformCount; i++) {
        let y, x;
        // Гарантируем безопасное расстояние для прыжка
        y = prev.y - (Math.random() * (maxY - minStep) + minStep);
        y = Math.max(y, -platformHeight - 100);
        const maxX = getMaxJumpWidth() * 0.5; // Безопасное горизонтальное расстояние
        let minX = Math.max(0, prev.x - maxX);
        let maxXPos = Math.min(canvas.width - platformWidth, prev.x + maxX);
        x = Math.random() * (maxXPos - minX) + minX;
        const type = randomPlatformType(i);
        platforms.push({
            x,
            y,
            width: platformWidth,
            height: platformHeight,
            type,
            breaking: false,
            hitsLeft: type === 'multi-break' ? 2 : 0,
            breakAnim: 0
        });
        prev = platforms[platforms.length - 1];
    }
}

function generatePlatforms() {
    platforms.length = 0;
    platforms.push({
        x: canvas.width / 2 - platformWidth / 2,
        y: canvas.height - 50,
        width: platformWidth,
        height: platformHeight,
        type: 'normal',
        breaking: false,
        hitsLeft: 0,
        breakAnim: 0
    });
    
    let prev = platforms[0];
    const maxY = getMaxJumpHeight() * 0.6; // Уменьшаем максимальное расстояние
    const minStep = platformHeight + 20; // Увеличиваем минимальное расстояние
    
    for (let i = 1; i < platformCount; i++) {
        let y, x;
        let attempts = 0;
        let validPlatform = false;
        
        // Пытаемся создать платформу с валидным расположением
        while (!validPlatform && attempts < 10) {
            // Гарантируем, что расстояние не превышает возможности прыжка
            y = prev.y - (Math.random() * (maxY - minStep) + minStep);
            y = Math.max(y, -platformHeight - 100);
            const maxX = getMaxJumpWidth() * 0.5; // Уменьшаем горизонтальное расстояние
            let minX = Math.max(0, prev.x - maxX);
            let maxXPos = Math.min(canvas.width - platformWidth, prev.x + maxX);
            x = Math.random() * (maxXPos - minX) + minX;
            
            // Создаем временную платформу для проверки
            const tempPlatform = { x, y, width: platformWidth, height: platformHeight };
            
            // Проверяем, можно ли достичь эту платформу
            if (canReachPlatform(prev, tempPlatform)) {
                validPlatform = true;
            }
            attempts++;
        }
        
        // Если не удалось создать валидную платформу, используем безопасные значения
        if (!validPlatform) {
            y = prev.y - minStep - Math.random() * 20;
            x = prev.x + (Math.random() - 0.5) * (getMaxJumpWidth() * 0.3);
            x = Math.max(0, Math.min(canvas.width - platformWidth, x));
        }
        
        const type = randomPlatformType(i);
        platforms.push({
            x,
            y,
            width: platformWidth,
            height: platformHeight,
            type,
            breaking: false,
            hitsLeft: type === 'multi-break' ? 2 : 0,
            breakAnim: 0
        });
        prev = platforms[platforms.length - 1];
    }
}

function getMaxJumpHeight() {
    // Формула максимальной высоты прыжка: (V^2) / (2g)
    return Math.pow(Math.abs(player.jumpPower), 2) / (2 * player.gravity);
}

function getMaxJumpWidth() {
    // Примерная максимальная ширина прыжка: скорость * время в воздухе
    // Время в воздухе: t = 2 * V / g
    return player.speed * (2 * Math.abs(player.jumpPower) / player.gravity);
}

// Проверяем, может ли игрок достичь платформу from с платформы to
function canReachPlatform(from, to) {
    const dx = Math.abs(to.x + to.width/2 - (from.x + from.width/2));
    const dy = from.y - to.y;
    
    // Проверяем вертикальное расстояние
    if (dy > getMaxJumpHeight() * 0.6) return false;
    
    // Проверяем горизонтальное расстояние
    if (dx > getMaxJumpWidth() * 0.5) return false;
    
    return true;
}

function drawPlatforms() {
    platforms.forEach(platform => {
        let color = PLATFORM_TYPES.find(t => t.type === platform.type)?.color || '#228B22';
        if (platform.type === 'breakable' && platform.breaking) {
            // Анимация разрушения: мигает и трясётся
            color = platform.breakAnim % 4 < 2 ? '#e53935' : '#fff';
        }
        if (platform.type === 'multi-break' && platform.breaking) {
            // Анимация разрушения: мигает и трясётся
            color = platform.breakAnim % 4 < 2 ? '#ff9800' : '#fff';
        }
        ctx.save();
        if (platform.breaking) {
            ctx.translate(platform.x + platform.width/2, platform.y + platform.height/2);
            ctx.rotate((Math.random()-0.5)*0.1);
            ctx.translate(-platform.x - platform.width/2, -platform.y - platform.height/2);
        }
        ctx.fillStyle = color;
        ctx.fillRect(platform.x, platform.y, platform.width, platform.height);
        // Для multi-break рисуем индикатор оставшихся жизней
        if (platform.type === 'multi-break' && platform.hitsLeft === 1) {
            ctx.fillStyle = '#fff';
            ctx.fillRect(platform.x + platform.width/4, platform.y + 4, platform.width/2, 4);
        }
        ctx.restore();
        // Осколки при финальном разрушении
        if (platform.breaking && platform.breakAnim > 6) {
            for (let i = 0; i < 6; i++) {
                ctx.save();
                ctx.fillStyle = color;
                ctx.globalAlpha = 1 - (platform.breakAnim-6)/6;
                ctx.translate(platform.x + platform.width/2, platform.y + platform.height/2);
                ctx.rotate((i/6)*Math.PI*2 + platform.breakAnim*0.2);
                ctx.fillRect(10, 0, 8, 4);
                ctx.restore();
            }
        }
    });
}

function updateBreakingPlatforms() {
    for (let i = platforms.length - 1; i >= 0; i--) {
        const p = platforms[i];
        if (p.breaking) {
            p.breakAnim++;
            if (p.breakAnim > 12) {
                platforms.splice(i, 1);
            }
        }
    }
}

// --- ФУНКЦИИ РИСОВАНИЯ ---
let alienImg = new Image();
alienImg.src = 'alien.svg';

function drawPlayer() {
    ctx.save();
    
    // Эффект свечения игрока
    ctx.shadowBlur = 25;
    ctx.shadowColor = '#7ed957';
    
    // Добавляем пульсирующий эффект при движении
    const time = Date.now() * 0.01;
    const pulse = 1 + Math.sin(time) * 0.05;
    const glowIntensity = 0.8 + Math.sin(time * 2) * 0.2;
    
    // Эффект движения - след
    if (Math.abs(player.dx) > 0) {
        ctx.globalAlpha = 0.3;
        for (let i = 1; i <= 3; i++) {
            const trailX = player.x - player.dx * i * 2;
            ctx.shadowBlur = 15 * (1 - i * 0.3);
            if (alienImg.complete && alienImg.naturalWidth > 0) {
                ctx.drawImage(alienImg, trailX, player.y, player.width * (1 - i * 0.1), player.height * (1 - i * 0.1));
            } else {
                ctx.fillStyle = `rgba(126, 217, 87, ${0.3 - i * 0.1})`;
                ctx.fillRect(trailX, player.y, player.width * (1 - i * 0.1), player.height * (1 - i * 0.1));
            }
        }
        ctx.globalAlpha = 1;
    }
    
    // Основной игрок с улучшенными эффектами
    ctx.shadowBlur = 30 * glowIntensity;
    ctx.shadowColor = '#7ed957';
    
    if (alienImg.complete && alienImg.naturalWidth > 0) {
        // Добавляем легкое масштабирование
        const scaledWidth = player.width * pulse;
        const scaledHeight = player.height * pulse;
        const offsetX = (scaledWidth - player.width) / 2;
        const offsetY = (scaledHeight - player.height) / 2;
        
        ctx.drawImage(alienImg, player.x - offsetX, player.y - offsetY, scaledWidth, scaledHeight);
    } else {
        // Резервный прямоугольник с градиентом
        const gradient = ctx.createRadialGradient(
            player.x + player.width/2, player.y + player.height/2, 0,
            player.x + player.width/2, player.y + player.height/2, player.width/2
        );
        gradient.addColorStop(0, '#a4ed71');
        gradient.addColorStop(0.7, '#7ed957');
        gradient.addColorStop(1, '#5cb043');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(player.x, player.y, player.width * pulse, player.height * pulse);
          // Добавляем блик
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.fillRect(player.x + 5, player.y + 5, player.width * 0.3, player.height * 0.2);
    }
    
    ctx.restore();
}

function drawPlatforms() {
    platforms.forEach(platform => {
        ctx.save();
        
        // Определяем цвет платформы
        let color = PLATFORM_TYPES.find(t => t.type === platform.type)?.color || '#228B22';
        let glowColor = color;
        
        // Анимация разрушения для ломающихся платформ
        if (platform.type === 'breakable' && platform.breaking) {
            color = platform.breakAnim % 4 < 2 ? '#ff6b6b' : '#fff';
            glowColor = '#ff6b6b';
        }
        if (platform.type === 'multi-break' && platform.breaking) {
            color = platform.breakAnim % 4 < 2 ? '#ffa726' : '#fff';
            glowColor = '#ffa726';
        }
        
        // Эффект тряски при разрушении
        if (platform.breaking) {
            ctx.translate(platform.x + platform.width/2, platform.y + platform.height/2);
            ctx.rotate((Math.random()-0.5)*0.15);
            ctx.translate(-platform.x - platform.width/2, -platform.y - platform.height/2);
        }
        
        // Добавляем свечение к платформам
        ctx.shadowBlur = 15;
        ctx.shadowColor = glowColor;
        
        // Рисуем основную платформу с градиентом
        const gradient = ctx.createLinearGradient(platform.x, platform.y, platform.x, platform.y + platform.height);
        
        if (platform.type === 'normal') {
            gradient.addColorStop(0, '#4caf50');
            gradient.addColorStop(1, '#2e7d32');
        } else if (platform.type === 'breakable') {
            gradient.addColorStop(0, '#ff5722');
            gradient.addColorStop(1, '#d32f2f');
        } else if (platform.type === 'multi-break') {
            gradient.addColorStop(0, '#ff9800');
            gradient.addColorStop(1, '#f57c00');
        }
        
        ctx.fillStyle = gradient;
        
        // Рисуем платформу со скругленными углами
        const radius = 8;
        ctx.beginPath();
        ctx.roundRect(platform.x, platform.y, platform.width, platform.height, radius);
        ctx.fill();
        
        // Добавляем блик на платформу
        const highlight = ctx.createLinearGradient(platform.x, platform.y, platform.x, platform.y + platform.height * 0.3);
        highlight.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
        highlight.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = highlight;
        ctx.beginPath();
        ctx.roundRect(platform.x, platform.y, platform.width, platform.height * 0.3, radius);
        ctx.fill();
        
        // Для multi-break рисуем индикатор оставшихся жизней
        if (platform.type === 'multi-break' && platform.hitsLeft === 1) {
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#fff';
            ctx.fillStyle = '#fff';
            ctx.fillRect(platform.x + platform.width/4, platform.y + 5, platform.width/2, 3);
        }
        
        ctx.shadowBlur = 0;
        ctx.restore();
        
        // Эффект частиц при финальном разрушении
        if (platform.breaking && platform.breakAnim > 6) {
            for (let i = 0; i < 8; i++) {
                ctx.save();
                ctx.fillStyle = color;
                ctx.globalAlpha = Math.max(0, 1 - (platform.breakAnim-6)/6);
                ctx.translate(platform.x + platform.width/2, platform.y + platform.height/2);
                ctx.rotate((i/8)*Math.PI*2 + platform.breakAnim*0.3);
                ctx.fillRect(15 + Math.random() * 10, 0, 6, 3);
                ctx.restore();
            }
        }
    });
}

function drawScore() {
    // Фон для счетчика
    ctx.save();
    
    // Создаем градиентный фон для панели счета
    const gradient = ctx.createLinearGradient(0, 0, 200, 0);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.8)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.4)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(5, 5, 200, 40);
    
    // Добавляем рамку
    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(5, 5, 200, 40);
    
    // Текст счета с эффектом свечения
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#00d4ff';
    ctx.fillStyle = '#00d4ff';
    ctx.font = 'bold 18px Orbitron, monospace';
    ctx.fillText('СЧЕТ: ' + score.toLocaleString(), 15, 28);
    
    ctx.shadowBlur = 0;
    ctx.restore();
}

// --- ВРАГИ ---
const enemies = [];
let enemyImg = new Image();
enemyImg.src = 'alien2.svg';
let enemySpawnTimer = 0;
let enemySpawnInterval = 180; // Уменьшаем стартовую частоту (3 секунды при 60fps)
let minEnemySpawnInterval = 120; // минимальный интервал (2 секунды)
let enemySpawnAcceleration = 0.98; // ускорение спавна
let lastKilledPlatforms = [];
const maxEnemiesOnScreen = performanceSettings.maxEnemiesOnScreen;

function spawnEnemy() {
    // Не спавним, если врагов уже максимум
    const visibleEnemies = enemies.filter(e => e.y + e.height > 0 && e.y < canvas.height);
    if (visibleEnemies.length >= maxEnemiesOnScreen) return;
      // Фильтруем платформы: только обычные, подходящие для спавна врагов
    const availablePlatforms = platforms.filter((p, idx, arr) => {
        // Только обычные платформы
        if (p.type !== 'normal') return false;
        // Платформа должна быть достаточно высоко над игроком
        const distanceFromPlayer = player.y - p.y;
        if (distanceFromPlayer < 200) return false; // Минимум 200 пикселей выше игрока
        if (distanceFromPlayer > 400) return false; // Максимум 400 пикселей выше игрока
        // Не занята врагами
        if (enemies.some(e => e.platform === p)) return false;
        // Не была недавно освобождена от врага
        if (lastKilledPlatforms.includes(p)) return false;
        return true;
    });
    
    // Отладочная информация
    console.log(`Доступных платформ для врагов: ${availablePlatforms.length} из ${platforms.length}`);
    if (availablePlatforms.length === 0) return;
    const platform = availablePlatforms[Math.floor(Math.random() * availablePlatforms.length)];
    const size = 48;
    const targetX = platform.x + platform.width / 2 - size / 2;
    const targetY = platform.y - size + 5;
    enemies.push({
        x: targetX,
        y: -size - 40,
        width: size,
        height: size,
        platform: platform,
        targetY: targetY,
        spawnLerp: 0
    });
    lastKilledPlatforms = lastKilledPlatforms.filter(p => p !== platform);
}

function drawEnemies() {
    enemies.forEach(enemy => {
        ctx.save();
        
        // Следим за позицией платформы (если платформа двигается)
        if (enemy.platform) {
            enemy.x = enemy.platform.x + enemy.platform.width / 2 - enemy.width / 2;
            enemy.y = enemy.platform.y - enemy.height + 5;
        }
        
        // Эффект свечения для врагов
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#8e24aa';
        
        // Пульсирующий эффект
        const time = Date.now() * 0.008;
        const pulse = 1 + Math.sin(time + enemy.x * 0.01) * 0.08;
        const glowIntensity = 0.7 + Math.sin(time * 1.5 + enemy.y * 0.01) * 0.3;
        
        // Эффект ауры вокруг врага
        ctx.globalAlpha = 0.4;
        ctx.shadowBlur = 30 * glowIntensity;
        for (let i = 0; i < 3; i++) {
            const auraSize = enemy.width * (1 + i * 0.2) * pulse;
            const auraX = enemy.x + enemy.width/2 - auraSize/2;
            const auraY = enemy.y + enemy.height/2 - auraSize/2;
            
            if (enemyImg.complete && enemyImg.naturalWidth > 0) {
                ctx.drawImage(enemyImg, auraX, auraY, auraSize, auraSize);
            } else {
                ctx.fillStyle = `rgba(142, 36, 170, ${0.3 - i * 0.1})`;
                ctx.fillRect(auraX, auraY, auraSize, auraSize);
            }
        }
        ctx.globalAlpha = 1;
        
        // Основной враг
        ctx.shadowBlur = 25 * glowIntensity;
        const scaledWidth = enemy.width * pulse;
        const scaledHeight = enemy.height * pulse;
        const offsetX = (scaledWidth - enemy.width) / 2;
        const offsetY = (scaledHeight - enemy.height) / 2;
        
        if (enemyImg.complete && enemyImg.naturalWidth > 0) {
            ctx.drawImage(enemyImg, enemy.x - offsetX, enemy.y - offsetY, scaledWidth, scaledHeight);
        } else {
            // Градиентный прямоугольник
            const gradient = ctx.createRadialGradient(
                enemy.x + enemy.width/2, enemy.y + enemy.height/2, 0,
                enemy.x + enemy.width/2, enemy.y + enemy.height/2, enemy.width/2
            );
            gradient.addColorStop(0, '#ba68c8');
            gradient.addColorStop(0.7, '#8e24aa');
            gradient.addColorStop(1, '#6a1b9a');
            
            ctx.fillStyle = gradient;
            ctx.fillRect(enemy.x - offsetX, enemy.y - offsetY, scaledWidth, scaledHeight);
            
            // Блик
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.fillRect(enemy.x + 3, enemy.y + 3, enemy.width * 0.4, enemy.height * 0.3);
        }
        
        // Энергетическое поле
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = '#8e24aa';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.lineDashOffset = time * 2;
        ctx.beginPath();
        ctx.arc(enemy.x + enemy.width/2, enemy.y + enemy.height/2, enemy.width * 0.7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        
        ctx.restore();
    });
}

function updateEnemies() {
    for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        // Анимация появления: плавно опускаем к платформе
        if (enemy.y < enemy.targetY) {
            enemy.spawnLerp = Math.min(enemy.spawnLerp + 0.05, 1);
            enemy.y = enemy.y * (1 - enemy.spawnLerp) + enemy.targetY * enemy.spawnLerp;
            // x всегда синхронизируем с платформой
            enemy.x = enemy.platform.x + enemy.platform.width / 2 - enemy.width / 2;
        } else {
            // После появления враг всегда следует за платформой
            enemy.x = enemy.platform.x + enemy.platform.width / 2 - enemy.width / 2;
            enemy.y = enemy.platform.y - enemy.height + 5;
        }
        // Если платформа исчезла — удаляем врага
        if (!platforms.includes(enemy.platform)) {
            enemies.splice(i, 1);
        }
    }
}

// --- СНАРЯДЫ ---
const bullets = [];
const bulletSpeed = 8;

// --- ДОБАВЛЯЕМ ВРАГОВ ---
function shoot() {
    const bulletWidth = 8;
    const bulletHeight = 18;
    bullets.push({
        x: player.x + player.width / 2 - bulletWidth / 2,
        y: player.y,
        width: bulletWidth,
        height: bulletHeight,
        dy: -bulletSpeed
    });
}

function shootAutoAim() {
    if (enemies.length === 0) {
        // Если врагов нет — обычный вертикальный выстрел вверх
        const bulletWidth = 8;
        const bulletHeight = 18;
        bullets.push({
            x: player.x + player.width / 2 - bulletWidth / 2,
            y: player.y,
            width: bulletWidth,
            height: bulletHeight,
            dx: 0,
            dy: -bulletSpeed
        });
        return;
    }
    // Находим ближайшего врага по вертикали выше игрока (или любого ближайшего)
    let closest = null;
    let minDist = Infinity;
    for (let enemy of enemies) {
        // Только враги выше игрока (или все, если хотите)
        const dy = (enemy.y + enemy.height / 2) - (player.y + player.height / 2);
        const dx = (enemy.x + enemy.width / 2) - (player.x + player.width / 2);
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) {
            minDist = dist;
            closest = enemy;
        }
    }
    if (!closest) return;
    // Вычисляем направление
    const px = player.x + player.width / 2;
    const py = player.y;
    const ex = closest.x + closest.width / 2;
    const ey = closest.y + closest.height / 2;
    const dx = ex - px;
    const dy = ey - py;
    const len = Math.sqrt(dx * dx + dy * dy);
    const speed = bulletSpeed;
    const vx = dx / len * speed;
    const vy = dy / len * speed;
    const bulletWidth = 8;
    const bulletHeight = 18;
    bullets.push({
        x: px - bulletWidth / 2,
        y: py,
        width: bulletWidth,
        height: bulletHeight,
        dx: vx,
        dy: vy
    });
}

function drawBullets() {
    bullets.forEach(bullet => {
        ctx.save();
        
        // Эффект свечения для снарядов
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#ff5252';
        
        // Создаем градиент для снаряда
        const gradient = ctx.createLinearGradient(
            bullet.x, bullet.y, 
            bullet.x, bullet.y + bullet.height
        );
        gradient.addColorStop(0, '#ffeb3b');
        gradient.addColorStop(0.5, '#ff5722');
        gradient.addColorStop(1, '#d32f2f');
        
        ctx.fillStyle = gradient;
        
        // Рисуем снаряд со скругленными углами
        const radius = Math.min(bullet.width, bullet.height) / 2;
        ctx.beginPath();
        ctx.roundRect(bullet.x, bullet.y, bullet.width, bullet.height, radius);
        ctx.fill();
        
        // Добавляем блик
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.beginPath();
        ctx.roundRect(bullet.x + 1, bullet.y + 1, bullet.width - 2, bullet.height * 0.3, radius);
        ctx.fill();
        
        // Эффект следа
        if (bullet.dy < 0 || bullet.vy < 0) { // летит вверх
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = '#ff5252';
            for (let i = 1; i <= 3; i++) {
                ctx.beginPath();
                ctx.roundRect(
                    bullet.x + bullet.width * 0.25, 
                    bullet.y + bullet.height + i * 5, 
                    bullet.width * 0.5, 
                    bullet.height * 0.3, 
                    radius
                );
                ctx.fill();
            }
        }
        
        ctx.restore();
    });
}

function updateBullets() {
    for (let i = bullets.length - 1; i >= 0; i--) {
        if (typeof bullets[i].dx === 'number') {
            bullets[i].x += bullets[i].dx;
            bullets[i].y += bullets[i].dy;
        } else {
            bullets[i].y += bullets[i].dy;
        }
        if (bullets[i].y + bullets[i].height < 0 || bullets[i].x < -50 || bullets[i].x > canvas.width + 50 || bullets[i].y > canvas.height + 50) {
            bullets.splice(i, 1);
        }
    }
}

// --- СТОЛКНОВЕНИЯ СНАРЯДОВ И ВРАГОВ ---
function checkBulletEnemyCollisions() {
    for (let i = bullets.length - 1; i >= 0; i--) {
        for (let j = enemies.length - 1; j >= 0; j--) {
            if (
                bullets[i].x < enemies[j].x + enemies[j].width &&
                bullets[i].x + bullets[i].width > enemies[j].x &&
                bullets[i].y < enemies[j].y + enemies[j].height &&
                bullets[i].y + bullets[i].height > enemies[j].y
            ) {                // Создаем эффект взрыва при уничтожении врага
                createExplosionParticles(
                    enemies[j].x + enemies[j].width / 2, 
                    enemies[j].y + enemies[j].height / 2, 
                    '#8e24aa', 
                    15
                );
                playSound('hit'); // Используем звук hit для убийства врагов
                
                if (enemies[j].platform) {
                    lastKilledPlatforms.push(enemies[j].platform);
                    if (lastKilledPlatforms.length > 3) lastKilledPlatforms.shift();
                }
                enemies.splice(j, 1);
                bullets.splice(i, 1);
                score += 100;
                break;
            }
        }
    }
}

function checkPlayerEnemyCollision() {
    for (let i = 0; i < enemies.length; i++) {
        // Проверка прыжка сверху: игрок падает, его низ касается врага сверху
        const isJumpKill =
            player.dy > 0 &&
            player.x + player.width * 0.7 > enemies[i].x + enemies[i].width * 0.2 &&
            player.x + player.width * 0.3 < enemies[i].x + enemies[i].width * 0.8 &&
            player.y + player.height > enemies[i].y &&
            player.y + player.height < enemies[i].y + enemies[i].height * 0.5;        if (isJumpKill) {
            // Создаем эффект частиц при уничтожении врага прыжком
            createExplosionParticles(
                enemies[i].x + enemies[i].width / 2, 
                enemies[i].y + enemies[i].height / 2, 
                '#8e24aa', 
                12
            );
            
            if (enemies[i].platform) {
                lastKilledPlatforms.push(enemies[i].platform);
                if (lastKilledPlatforms.length > 3) lastKilledPlatforms.shift();
            }
            enemies.splice(i, 1);
            player.dy = player.jumpPower * 0.7;
            score += 100;
            return;
        }
        // Мягкая коллизия: только если пересечение по центру спрайтов
        const playerCenterX = player.x + player.width / 2;
        const playerCenterY = player.y + player.height / 2;
        const enemyCenterX = enemies[i].x + enemies[i].width / 2;
        const enemyCenterY = enemies[i].y + enemies[i].height / 2;
        const dx = Math.abs(playerCenterX - enemyCenterX);
        const dy = Math.abs(playerCenterY - enemyCenterY);
        const maxDistX = (player.width + enemies[i].width) * 0.4;        const maxDistY = (player.height + enemies[i].height) * 0.4;
        if (dx < maxDistX && dy < maxDistY) {
            gameOver = true;
            playSound('gameOver'); // Добавляем звук проигрыша
        }
    }
}

// --- ФОН ---
const bgImages = [
    Object.assign(new Image(), {src: 'background1.png'}),
    Object.assign(new Image(), {src: 'background2.png'}),
    Object.assign(new Image(), {src: 'background3.png'}),
    Object.assign(new Image(), {src: 'background4.png'}),
    Object.assign(new Image(), {src: 'background5.png'})
];

function drawBackground(scrollY) {
    // scrollY — сколько всего игрок "поднялся" (score + смещение)
    let y = 0;
    let bgIdx = 0;
    let localY = scrollY;
    // Высота одного фона
    const bgH = canvas.height;
    // Первый фон
    ctx.drawImage(bgImages[0], 0, y, canvas.width, bgH);
    y -= bgH;
    localY -= bgH;
    // Второй фон
    if (localY > -bgH) {
        ctx.drawImage(bgImages[1], 0, y, canvas.width, bgH);
        y -= bgH;
        localY -= bgH;
    }
    // Далее чередуем 3 и 4
    let altIdx = 0;
    while (localY > -bgH * 2) {
        const idx = 2 + (altIdx % 2); // 2 или 3
        ctx.drawImage(bgImages[idx], 0, y, canvas.width, bgH);
        y -= bgH;
        localY -= bgH;
        altIdx++;
        // На большой высоте — вставляем 5-й фон
        if (score > 5000 && localY > -bgH * 2 && altIdx === 2) {
            ctx.drawImage(bgImages[4], 0, y, canvas.width, bgH);
            y -= bgH;
            localY -= bgH;
        }
    }
}

// --- СИСТЕМА ЧАСТИЦ ---
const particles = [];

class Particle {
    constructor(x, y, vx, vy, color, life, size) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.color = color;
        this.life = life;
        this.maxLife = life;
        this.size = size;
    }
    
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.1; // гравитация для частиц
        this.life--;
    }
    
    draw() {
        if (this.life <= 0) return;
        
        ctx.save();
        const alpha = this.life / this.maxLife;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * alpha, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

function createParticles(x, y, count, color) {
    for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count;
        const speed = 2 + Math.random() * 3;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed - 2;
        const life = 30 + Math.random() * 20;
        const size = 2 + Math.random() * 3;
        
        particles.push(new Particle(x, y, vx, vy, color, life, size));
    }
}

// --- УЛУЧШЕННАЯ СИСТЕМА ЧАСТИЦ ---
function createExplosionParticles(x, y, color, count = 12) {
    for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
        const speed = 3 + Math.random() * 5;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed - 1;
        const life = 40 + Math.random() * 30;
        const size = 3 + Math.random() * 4;
        
        particles.push(new Particle(x, y, vx, vy, color, life, size));
    }
}

function createPlatformBreakParticles(platform) {
    const centerX = platform.x + platform.width / 2;
    const centerY = platform.y + platform.height / 2;
    const colors = ['#ff6b6b', '#ffa726', '#ffeb3b', '#fff'];
    
    for (let i = 0; i < 15; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 4;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed - Math.random() * 2;
        const life = 35 + Math.random() * 25;
        const size = 2 + Math.random() * 3;
        const color = colors[Math.floor(Math.random() * colors.length)];
        
        particles.push(new Particle(centerX, centerY, vx, vy, color, life, size));
    }
}

function createJumpParticles(x, y) {
    for (let i = 0; i < 8; i++) {
        const angle = Math.PI + Math.random() * Math.PI; // Направлены вниз
        const speed = 1 + Math.random() * 3;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        const life = 20 + Math.random() * 15;
        const size = 1 + Math.random() * 2;
        
        particles.push(new Particle(x, y, vx, vy, '#7ed957', life, size));
    }
}

// --- ВИЗУАЛЬНЫЕ ЭФФЕКТЫ ---
let screenShake = 0;
let cameraOffset = { x: 0, y: 0 };

function addScreenShake(intensity = 10, duration = 300) {
    if (screenShake < intensity) {
        screenShake = intensity;
        setTimeout(() => {
            screenShake = Math.max(0, screenShake - 1);
        }, duration / 10);
    }
}

function updateCamera() {
    if (screenShake > 0) {
        cameraOffset.x = (Math.random() - 0.5) * screenShake;
        cameraOffset.y = (Math.random() - 0.5) * screenShake;
        screenShake *= 0.9; // Постепенно уменьшаем тряску
        if (screenShake < 0.1) screenShake = 0;
    } else {
        cameraOffset.x = 0;
        cameraOffset.y = 0;
    }
}

function applyCamera() {
    ctx.save();
    ctx.translate(cameraOffset.x, cameraOffset.y);
}

function resetCamera() {
    ctx.restore();
}

// --- ЗВУКОВЫЕ ЭФФЕКТЫ ---
function playSound(type) {
    const sound = sounds[type];
    if (sound) {
        sound.currentTime = 0; // Перематываем на начало для повторного воспроизведения
        sound.play().catch(err => console.log('Не удалось воспроизвести звук:', err));
    }
    
    switch(type) {
        case 'jump':
            console.log('🎵 Jump sound');
            break;
        case 'shoot':
            console.log('🎵 Shoot sound');
            break;
        case 'hit':
            console.log('🎵 Hit sound');
            break;
        case 'gameOver':
            console.log('🎵 Game Over sound');
            break;
        case 'platform-break':
            console.log('🎵 Platform break sound');
            addScreenShake(5, 150);
            break;
        case 'enemy-kill':
            console.log('🎵 Enemy kill sound');
            addScreenShake(6, 180);
            break;
    }
}

// --- ЛОГИКА ОБНОВЛЕНИЯ ---
function update() {
    if (gameOver) {
        // Анимированный фон при окончании игры
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Добавляем эффект мерцания
        const time = Date.now() * 0.005;
        const alpha = 0.3 + Math.sin(time) * 0.2;
        ctx.fillStyle = `rgba(255, 0, 0, ${alpha})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Эффект статических помех
        for (let i = 0; i < 100; i++) {
            ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.1})`;
            ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 2, 2);
        }
        
        ctx.save();
        
        // Заголовок "ИГРА ОКОНЧЕНА" с дополнительными эффектами
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#ff4444';
        ctx.fillStyle = '#ff4444';
        ctx.font = 'bold 28px Orbitron, monospace';
        ctx.textAlign = 'center';
        
        // Добавляем эффект дрожания текста
        const shakeX = (Math.random() - 0.5) * 4;
        const shakeY = (Math.random() - 0.5) * 4;
        ctx.fillText('ИГРА ОКОНЧЕНА', canvas.width / 2 + shakeX, canvas.height / 2 - 40 + shakeY);
        
        // Счет игрока с улучшенными эффектами
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#00d4ff';
        ctx.fillStyle = '#00d4ff';
        ctx.font = 'bold 20px Orbitron, monospace';
        const pulse = 1 + Math.sin(time * 3) * 0.1;
        ctx.scale(pulse, pulse);
        ctx.fillText('ВАШ СЧЕТ: ' + score.toLocaleString(), canvas.width / 2 / pulse, canvas.height / 2 / pulse);
        ctx.scale(1/pulse, 1/pulse);
        
        // Инструкция по рестарту с мигающим эффектом
        const blinkAlpha = 0.5 + Math.sin(time * 4) * 0.5;
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ffffff';
        ctx.fillStyle = `rgba(255, 255, 255, ${blinkAlpha})`;
        ctx.font = '16px Orbitron, monospace';
        ctx.fillText('НАЖМИТЕ ENTER ДЛЯ РЕСТАРТА', canvas.width / 2, canvas.height / 2 + 40);
        
        ctx.restore();
        return;
    }    // --- ДВИЖЕНИЕ ИГРОКА ---
    // Горизонтальное движение (клавиатура + мобильные элементы)
    if (keys.ArrowLeft || mobileControls.left) {
        player.dx = -player.speed;
    } else if (keys.ArrowRight || mobileControls.right) {
        player.dx = player.speed;
    } else {
        player.dx = 0;
    }
    player.x += player.dx;

    // Телепортация по краям экрана
    if (player.x + player.width < 0) {
        player.x = canvas.width;
    } else if (player.x > canvas.width) {
        player.x = -player.width;
    }

    // Вертикальное движение (гравитация)
    player.dy += player.gravity;
    player.y += player.dy;

    // --- ПРОВЕРКА СТОЛКНОВЕНИЙ С ПЛАТФОРМАМИ (ПРЫЖКИ) ---
    let onPlatform = false;
    platforms.forEach(platform => {
        if (
            player.dy > 0 &&
            player.x < platform.x + platform.width &&
            player.x + player.width > platform.x &&
            player.y + player.height > platform.y &&
            player.y + player.height < platform.y + platform.height + 5
        ) {            // --- Разрушаемые платформы ---
            if (platform.type === 'breakable') {
                if (!platform.breaking) {
                    platform.breaking = true;
                    platform.breakAnim = 0;                    // Создаем частицы при разрушении платформы
                    createPlatformBreakParticles(platform);
                    playSound('hit'); // Используем звук hit для разрушения платформы
                }
                player.dy = player.jumpPower; // Подпрыгиваем всегда
                // Создаем частицы при прыжке
                createJumpParticles(player.x + player.width / 2, player.y + player.height);
            } else if (platform.type === 'multi-break') {
                if (!platform.breaking) {
                    if (platform.hitsLeft > 1) {
                        platform.hitsLeft--;
                        platform.breaking = true;
                        platform.breakAnim = 0;
                        // Создаем частицы при повреждении
                        createPlatformBreakParticles(platform);
                        setTimeout(() => { platform.breaking = false; }, 200);
                    } else {
                        platform.breaking = true;
                        platform.breakAnim = 0;
                        // Создаем больше частиц при финальном разрушении
                        createPlatformBreakParticles(platform);
                        createPlatformBreakParticles(platform);
                    }
                }
                player.dy = player.jumpPower; // Подпрыгиваем всегда
                // Создаем частицы при прыжке
                createJumpParticles(player.x + player.width / 2, player.y + player.height);            } else if (platform.type === 'normal') {
                player.dy = player.jumpPower; // Подпрыгиваем
                // Создаем частицы при прыжке
                createJumpParticles(player.x + player.width / 2, player.y + player.height);
                playSound('jump');
            }
        }
    });
    // Прыжок только по нажатию клавиши и если стоим на платформе
    if (onPlatform && player.canJump && (keys.ArrowUp || keys.Space)) {
        player.dy = player.jumpPower;
        player.canJump = false;
    }
    if (!onPlatform) {
        player.canJump = true;
    }

    // --- БЕСКОНЕЧНЫЙ СКРОЛЛИНГ ---
    // Если игрок поднимается выше середины экрана, двигаем все вниз
    if (player.y < canvas.height / 2) {
        const deltaY = canvas.height / 2 - player.y;
        player.y = canvas.height / 2; // Возвращаем игрока на место
        score += Math.round(deltaY); // Увеличиваем счет

        platforms.forEach(platform => {
            platform.y += deltaY; // Двигаем платформы вниз            // Если платформа ушла за нижний край, пересоздаем ее наверху
            if (platform.y > canvas.height) {
                if (platforms.length <= platformCount) {
                    let top = platforms.reduce((p, c) => c.y < p.y ? c : p, platforms[0]);
                    const maxY = getMaxJumpHeight() * 0.6; // Используем безопасное расстояние
                    const minStep = platformHeight + 20; // Минимальное расстояние
                    const maxX = getMaxJumpWidth() * 0.5; // Уменьшаем горизонтальное расстояние
                    // y гарантированно выше экрана и в пределах возможности прыжка
                    let y = top.y - (Math.random() * (maxY - minStep) + minStep);
                    y = Math.min(y, -platformHeight - 1); // всегда выше экрана
                    let minX = Math.max(0, top.x - maxX);
                    let maxXPos = Math.min(canvas.width - platformWidth, top.x + maxX);
                    let x = Math.random() * (maxXPos - minX) + minX;
                    platform.y = y;
                    platform.x = x;
                } else {
                    platforms.splice(platforms.indexOf(platform), 1);
                }
            }
        });
        increaseDifficulty(); // Проверяем усложнение
    }    // --- ОТСКОК ОТ ДНА ---
    // Если игрок касается или пересекает нижнюю границу
    if (player.y + player.height > canvas.height) {
        player.y = canvas.height - player.height;
        player.dy = player.jumpPower; // Отскакиваем вверх
    }

    // --- ВРАГИ ---
    enemySpawnTimer++;
    if (enemySpawnTimer >= enemySpawnInterval) {
        spawnEnemy();
        enemySpawnTimer = 0;
        // Постепенно ускоряем спавн, но не ниже минимума
        enemySpawnInterval = Math.max(minEnemySpawnInterval, Math.floor(enemySpawnInterval * enemySpawnAcceleration));
    }    updateEnemies();
    updateBreakingPlatforms();
    updateBullets();
    checkBulletEnemyCollisions();
    checkPlayerEnemyCollision();
    updateParticles();
    updateCamera();

    // --- ОЧИСТКА И РИСОВКА ---
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    applyCamera();
    // Рисуем фон с учётом текущего "подъёма"
    drawBackground(score + (canvas.height / 2 - player.y));
    drawPlatforms();
    drawPlayer();
    drawScore();
    drawEnemies();
    drawBullets();
    drawParticles();
    resetCamera();

    // Запускаем следующий кадр
    requestAnimationFrame(update);
}

// --- ЗАПУСК ИГРЫ ---
generatePlatforms();
initMobileControls(); // Инициализируем мобильное управление
update();

function increaseDifficulty() {
    // Каждые 1000 очков уменьшаем количество платформ и увеличиваем расстояние между ними
    if (score > 0 && score % 1000 === 0) {
        if (platformCount > 3) platformCount--;
        if (platformStep < 200) platformStep += 10;
        // regeneratePlatforms(); // не вызываем, чтобы не было резкого пересоздания
    }
}

function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        if (particles[i].life <= 0) {
            particles.splice(i, 1);
        }
    }
}

function drawParticles() {
    particles.forEach(particle => particle.draw());
}