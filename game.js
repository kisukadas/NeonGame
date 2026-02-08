const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const multiplierEl = document.getElementById('multiplier');
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const finalScoreEl = document.getElementById('final-score');
const highScoreEl = document.getElementById('high-score');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');

// Game State
let animationId;
let lastTime = 0;
let score = 0;
let multiplier = 1;
let speed = 300; // Pixels per second
let isActive = false;
let isDead = false;
let highScore = localStorage.getItem('neonAscentHighScore') || 0;
let obstaclesCleared = 0;

// Timers
let obstacleTimer = 0;
let collectableTimer = 0;
let gridLineTimer = 0;

// Grid & Visuals
let gridHue = 180; // Cyan default (HSL)
let isRainbowMode = false;
let gridColorStr = `hsla(${gridHue}, 100%, 50%, 0.2)`;

// Level Colors (Hue values)
const LEVEL_COLORS = [
    180, // Cyan (0-25)
    300, // Magenta (25-50)
    60,  // Yellow (50-75)
    120, // Green (75-100)
    0    // Red (Warmup for Rainbow?)
];

// Set canvas dimensions
function resizeCanvas() {
    const container = document.getElementById('game-container');
    if (container) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
    }
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Game Entities
class Player {
    constructor() {
        this.width = 30;
        this.height = 30;
        this.x = canvas.width / 2 - this.width / 2;
        this.y = canvas.height - 100;
        this.y = canvas.height - 100;
        this.color = '#0ff';
        this.trail = [];
        this.trailTimer = 0;
        this.velocity = { x: 0, y: 0 };
        this.visible = true;
    }

    draw() {
        if (!this.visible) return;

        // Draw Trail
        this.trail.forEach((point, index) => {
            const alpha = index / this.trail.length;
            ctx.globalAlpha = alpha * 0.5;
            ctx.fillStyle = this.color;
            ctx.fillRect(point.x, point.y, this.width, this.height);
        });
        ctx.globalAlpha = 1;

        // Draw Player with glow
        ctx.shadowBlur = 20;
        ctx.shadowColor = this.color;
        ctx.fillStyle = this.color;

        // Triangle shape
        ctx.beginPath();
        ctx.moveTo(this.x + this.width / 2, this.y);
        ctx.lineTo(this.x + this.width, this.y + this.height);
        ctx.lineTo(this.x, this.y + this.height);
        ctx.closePath();
        ctx.fill();

        ctx.shadowBlur = 0;
    }

    update(dt) {
        if (!this.visible) return;

        if (keys.ArrowLeft) this.velocity.x = -420;
        else if (keys.ArrowRight) this.velocity.x = 420;
        else this.velocity.x = 0;

        this.x += this.velocity.x * dt;

        if (this.x < 0) this.x = 0;
        if (this.x + this.width > canvas.width) this.x = canvas.width - this.width;

        this.trailTimer += dt;
        if (this.trailTimer > 0.03) { // ~30fps trail
            this.trail.push({ x: this.x, y: this.y });
            this.trailTimer = 0;
            if (this.trail.length > 10) this.trail.shift();
        }
    }
}

class Collectable {
    constructor() {
        this.radius = 12;
        this.x = Math.random() * (canvas.width - this.radius * 2) + this.radius;
        this.y = -this.radius;
        this.color = '#ffd700'; // Gold
        this.markedForDeletion = false;
        this.wobbleAngle = Math.random() * Math.PI * 2;
    }

    draw() {
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.color;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.closePath();

        // Shine
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(this.x - 4, this.y - 4, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.closePath();
        ctx.shadowBlur = 0;
    }

    update(dt) {
        this.y += speed * dt;
        // Gentle sway
        this.x += Math.sin(this.wobbleAngle) * 0.5; // Keep small sway in px? No multiply by dt? Wait, sin is mostly position.
        // Actually to make sway speed consistent, wobbleAngle must increment by dt.
        // And the offset should be consistent. Offset is just position.
        this.wobbleAngle += 3 * dt;

        if (this.y > canvas.height + this.radius) {
            this.markedForDeletion = true;
        }
    }
}

class FloatingText {
    constructor(text, x, y, color = '#fff') {
        this.text = text;
        this.x = x;
        this.y = y;
        this.alpha = 1;
        this.velocity = -120;
        this.color = color;
        this.markedForDeletion = false;
    }

    update(dt) {
        this.y += this.velocity * dt;
        this.alpha -= 1.2 * dt;
        if (this.alpha <= 0) this.markedForDeletion = true;
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = this.color;
        ctx.font = 'bold 20px "Orbitron"';
        ctx.textAlign = 'center';
        ctx.shadowBlur = 5;
        ctx.shadowColor = this.color;
        ctx.fillText(this.text, this.x, this.y);
        ctx.restore();
    }
}

class Obstacle {
    constructor() {
        this.width = Math.random() * 50 + 20;
        this.height = 20;
        this.x = Math.random() * (canvas.width - this.width);
        this.y = -this.height;
        this.color = '#f0f';
        this.markedForDeletion = false;
    }

    draw() {
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.color;
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
        ctx.shadowBlur = 0;
    }

    update(dt) {
        this.y += speed * dt;

        if (this.y > canvas.height) {
            this.markedForDeletion = true;
            if (!isDead) { // Check dead state
                // Score logic moved or kept here?
                // If I keep it here, it effectively runs once when it passes bottom.
                // This is safe.
                score += 10 * multiplier;
                scoreEl.innerText = score;
                handleObstacleCleared();
            }
        }
    }
}

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.radius = Math.random() * 3 + 1;
        this.color = color;
        this.velocity = {
            x: (Math.random() - 0.5) * 900,
            y: (Math.random() - 0.5) * 900
        };
        this.alpha = 1;
        this.decay = Math.random() * 1.2 + 0.6;
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    update(dt) {
        this.x += this.velocity.x * dt;
        this.y += this.velocity.y * dt;
        this.alpha -= this.decay * dt;
    }
}

class GridLine {
    constructor() {
        this.y = -10;
        this.speed = speed;
    }

    draw() {
        ctx.strokeStyle = gridColorStr; // Use global dynamic color
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, this.y);
        ctx.lineTo(canvas.width, this.y);
        ctx.stroke();
    }

    update(dt) {
        this.y += speed * dt;
    }
}

// Global Variables
let player;
let obstacles = [];
let collectables = [];
let particles = [];
let floatingTexts = [];
let gridLines = [];
let keys = {
    ArrowLeft: false,
    ArrowRight: false
};

// Input Handling
window.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.ArrowLeft = true;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.ArrowRight = true;
});

window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.ArrowLeft = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.ArrowRight = false;
});

// Touch/Mouse Support
canvas.addEventListener('touchmove', (e) => {
    if (!isActive || isDead) return;
    e.preventDefault();
    const touchX = e.touches[0].clientX;
    const rect = canvas.getBoundingClientRect();
    const relativeX = touchX - rect.left;
    player.x = relativeX - player.width / 2;
}, { passive: false });

canvas.addEventListener('mousemove', (e) => {
    if (isActive && !isDead) {
        const rect = canvas.getBoundingClientRect();
        const relativeX = e.clientX - rect.left;
        player.x = relativeX - player.width / 2;
    }
});


function init() {
    resizeCanvas();
    player = new Player();
    obstacles = [];
    collectables = [];
    particles = [];
    floatingTexts = [];
    gridLines = [];
    score = 0;
    speed = 300;
    multiplier = 1;
    // frames = 0; // Removed
    obstacleTimer = 0;
    collectableTimer = 0;
    gridLineTimer = 0;

    obstaclesCleared = 0;
    isRainbowMode = false;
    gridHue = LEVEL_COLORS[0];
    updateGridColor();

    scoreEl.innerText = score;
    multiplierEl.innerText = multiplier;
    isActive = true;
    isDead = false;
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');

    // Audio Start
    audioManager.startMusic();
    audioManager.bpm = 140;

    lastTime = 0;
    requestAnimationFrame(animate);
}

function handleObstacleCleared() {
    obstaclesCleared++;

    if (speed < 1500) {
        speed += 3;
        if (obstaclesCleared % 5 === 0) audioManager.increaseTempo();
    }

    if (obstaclesCleared % 25 === 0) {
        const levelIndex = Math.floor(obstaclesCleared / 25);

        if (obstaclesCleared >= 100) {
            isRainbowMode = true;
        } else if (levelIndex < LEVEL_COLORS.length) {
            gridHue = LEVEL_COLORS[levelIndex];
            updateGridColor();
            multiplier++;
            multiplierEl.innerText = multiplier;
            createExplosion(canvas.width / 2, canvas.height / 2, gridColorStr);
            floatingTexts.push(new FloatingText("LEVEL UP!", canvas.width / 2, canvas.height / 2, '#fff'));
        }
    }
}

function updateGridColor() {
    gridColorStr = `hsla(${gridHue}, 100%, 50%, 0.2)`;
}

function spawnObstacles(dt) {
    const timeToSpawn = 300 / speed; // Distance (300px) / Speed (px/s) = Time (s)
    obstacleTimer += dt;
    if (obstacleTimer > timeToSpawn) {
        obstacles.push(new Obstacle());
        obstacleTimer = 0;
    }
}

function spawnCollectables(dt) {
    collectableTimer += dt;
    if (collectableTimer > 3) { // Approx 3 seconds
        collectables.push(new Collectable());
        collectableTimer = 0;
    }
}

function spawnGridLines(dt) {
    const timeToSpawn = 100 / speed;
    gridLineTimer += dt;
    if (gridLineTimer > timeToSpawn) {
        gridLines.push(new GridLine());
        gridLineTimer = 0;
    }
}

function createExplosion(x, y, color) {
    for (let i = 0; i < 20; i++) {
        particles.push(new Particle(x, y, color));
    }
}

function checkCollisions() {
    if (isDead) return;

    // Obstacles
    for (let i = 0; i < obstacles.length; i++) {
        const obstacle = obstacles[i];
        if (
            player.x < obstacle.x + obstacle.width &&
            player.x + player.width > obstacle.x &&
            player.y < obstacle.y + obstacle.height &&
            player.y + player.height > obstacle.y
        ) {
            triggerDeath();
            return; // Exit early
        }
    }

    // Collectables
    for (let i = 0; i < collectables.length; i++) {
        const c = collectables[i];
        // Simple AABB for now since player is rect-ish in logic
        // Or distance based
        const playerCenter = { x: player.x + player.width / 2, y: player.y + player.height / 2 };
        const dist = Math.hypot(c.x - playerCenter.x, c.y - playerCenter.y);

        if (dist < c.radius + player.width / 2) {
            // Collected!
            collectables.splice(i, 1);
            i--;

            const bonus = 100 * multiplier;
            score += bonus;
            scoreEl.innerText = score;

            // Visual feedback
            audioManager.playCollect();
            createExplosion(c.x, c.y, '#ffd700');
            floatingTexts.push(new FloatingText(`+${bonus}`, c.x, c.y, '#ffd700'));
        }
    }
}

function triggerDeath() {
    isDead = true;
    player.visible = false;
    audioManager.stopMusic();
    audioManager.playCrash();
    createExplosion(player.x + player.width / 2, player.y + player.height / 2, player.color);

    if (score > highScore) {
        highScore = score;
        localStorage.setItem('neonAscentHighScore', highScore);
    }

    setTimeout(() => {
        showGameOver();
    }, 1500);
}

function showGameOver() {
    isActive = false;
    finalScoreEl.innerText = score;
    highScoreEl.innerText = highScore;
    gameOverScreen.classList.remove('hidden');
}

function animate(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const deltaTime = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    // Cap delta time to prevent huge jumps (e.g. if tab was inactive)
    const dt = Math.min(deltaTime, 0.1);

    // Clear
    ctx.fillStyle = 'rgba(5, 5, 16, 0.4)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Update visuals
    if (isRainbowMode) {
        gridHue = (gridHue + 120 * dt) % 360; // 120 degrees per second
        updateGridColor();
    }

    // Grid 
    ctx.strokeStyle = gridColorStr;
    ctx.beginPath();
    const centerX = canvas.width / 2;
    const lineCount = 10;
    const step = canvas.width / lineCount;
    for (let i = 0; i <= canvas.width; i += step) {
        ctx.moveTo(i, 0);
        const offset = (i - centerX) * 3;
        ctx.lineTo(centerX + offset, canvas.height);
    }
    ctx.stroke();

    gridLines.forEach((line, index) => {
        if (!isDead) line.update(dt);
        line.draw();
        if (line.y > canvas.height) gridLines.splice(index, 1);
    });
    if (!isDead) spawnGridLines(dt);

    // Collectables (Behind player? Or same layer. Let's do before player)
    collectables.forEach((c, index) => {
        if (!isDead) c.update(dt);
        c.draw();
        if (c.markedForDeletion) collectables.splice(index, 1);
    });

    // Player
    player.update(dt);
    player.draw();

    // Obstacles
    obstacles = obstacles.filter(obstacle => !obstacle.markedForDeletion);
    obstacles.forEach(obstacle => {
        if (!isDead) obstacle.update(dt);
        obstacle.draw();
    });

    // Particles
    particles = particles.filter(particle => particle.alpha > 0);
    particles.forEach(particle => {
        particle.update(dt);
        particle.draw();
    });

    // Floating Text
    floatingTexts = floatingTexts.filter(t => !t.markedForDeletion);
    floatingTexts.forEach(t => {
        t.update(dt);
        t.draw();
    });

    if (isActive) {
        if (!isDead) { // Alive logic
            spawnObstacles(dt);
            spawnCollectables(dt);
            checkCollisions();
            // frames++; // Removed
        }
        animationId = requestAnimationFrame(animate);
    }
}

startBtn.addEventListener('click', init);
restartBtn.addEventListener('click', init);
