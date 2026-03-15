const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const centerScoreEl = document.getElementById("centerScore");
const starsEl = document.getElementById("stars");
const bestScoreEl = document.getElementById("bestScore");
const comboTextEl = document.getElementById("comboText");

const restartBtn = document.getElementById("restartBtn");
const homeBtn = document.getElementById("homeBtn");
const shopBtn = document.getElementById("shopBtn");
const closeShopBtn = document.getElementById("closeShopBtn");
const shopModal = document.getElementById("shopModal");
const skinsList = document.getElementById("skinsList");

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

let score = 0;
let bestScore = Number(localStorage.getItem("bestScore") || 244);
let stars = Number(localStorage.getItem("stars") || 930);
let combo = 0;

const skins = [
    { id: 0, name: "Classic", price: 0, color: "#ffae00", glow: "#ff9a00" },
    { id: 1, name: "Fire", price: 50, color: "#ff5b1f", glow: "#ff6f3c" },
    { id: 2, name: "Neon", price: 120, color: "#31eaff", glow: "#64f6ff" },
    { id: 3, name: "Pink", price: 200, color: "#ff57c7", glow: "#ff85da" }
];

let ownedSkins = JSON.parse(localStorage.getItem("ownedSkins") || "[0]");
let currentSkin = Number(localStorage.getItem("currentSkin") || 0);

const ball = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    radius: 18,
    rotation: 0
};

const hoop = {
    x: 0,
    y: 0,
    width: 110,
    rimHeight: 12,
    moveDir: 1,
    speed: 1.55
};

let trail = [];
let particles = [];
let scoreFlash = 0;
let shotActive = false;
let scoreLock = false;
let cameraOffsetY = 0;

function currentSkinData() {
    return skins.find(s => s.id === currentSkin) || skins[0];
}

function updateUI() {
    centerScoreEl.textContent = score;
    starsEl.textContent = stars;
    bestScoreEl.textContent = bestScore;
    comboTextEl.textContent = combo > 1 ? `COMBO x${combo}` : "";

    localStorage.setItem("stars", String(stars));
    localStorage.setItem("bestScore", String(bestScore));
    localStorage.setItem("currentSkin", String(currentSkin));
    localStorage.setItem("ownedSkins", JSON.stringify(ownedSkins));
}

function resetBall() {
    ball.x = canvas.width * 0.52;
    ball.y = canvas.height - 135 + cameraOffsetY;
    ball.vx = 0;
    ball.vy = 0;
    ball.rotation = 0;
    trail = [];
    shotActive = false;
    scoreLock = false;
}

function resetHoop() {
    hoop.x = canvas.width * 0.17;
    hoop.y = canvas.height * 0.36 + cameraOffsetY;
    hoop.moveDir = 1;
}

function resetGame() {
    score = 0;
    combo = 0;
    cameraOffsetY = 0;
    particles = [];
    scoreFlash = 0;
    updateUI();
    resetBall();
    resetHoop();
}

function renderBackgroundGlow() {
    const glow = ctx.createRadialGradient(
        canvas.width / 2,
        canvas.height * 0.2,
        20,
        canvas.width / 2,
        canvas.height * 0.2,
        canvas.height * 0.7
    );
    glow.addColorStop(0, "rgba(255,255,255,0.07)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawHoop() {
    const y = hoop.y - cameraOffsetY;

    ctx.save();

    ctx.beginPath();
    ctx.ellipse(hoop.x, y, hoop.width / 2, hoop.rimHeight, 0, 0, Math.PI * 2);
    ctx.strokeStyle = "#ff7a1b";
    ctx.lineWidth = 6;
    ctx.shadowColor = "#ff7a1b";
    ctx.shadowBlur = 18;
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(220,220,220,0.28)";
    ctx.lineWidth = 2.8;

    for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(hoop.x + i * 18, y + 3);
        ctx.lineTo(hoop.x + i * 12, y + 44);
        ctx.stroke();
    }

    ctx.beginPath();
    ctx.moveTo(hoop.x - 44, y + 42);
    ctx.lineTo(hoop.x + 44, y + 42);
    ctx.stroke();

    ctx.restore();
}

function drawBall() {
    const skin = currentSkinData();

    ctx.save();
    ctx.translate(ball.x, ball.y - cameraOffsetY);
    ctx.rotate(ball.rotation);

    const grad = ctx.createRadialGradient(-6, -6, 2, 0, 0, ball.radius + 7);
    grad.addColorStop(0, "#fff7cf");
    grad.addColorStop(0.18, skin.color);
    grad.addColorStop(1, "#8a4c00");

    ctx.beginPath();
    ctx.arc(0, 0, ball.radius, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.shadowColor = skin.glow;
    ctx.shadowBlur = 18;
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(120,50,0,0.5)";
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.arc(0, 0, ball.radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
}

function drawTrail() {
    for (let i = 0; i < trail.length; i++) {
        const p = trail[i];
        const alpha = i / trail.length;

        ctx.beginPath();
        ctx.arc(p.x, p.y - cameraOffsetY, 4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,110,70,${alpha})`;
        ctx.shadowColor = "rgba(255,120,80,0.45)";
        ctx.shadowBlur = 10;
        ctx.fill();
    }
}

function spawnParticles(x, y) {
    for (let i = 0; i < 18; i++) {
        particles.push({
            x,
            y,
            vx: (Math.random() - 0.5) * 4.6,
            vy: (Math.random() - 0.5) * 4.6,
            life: 26 + Math.random() * 18,
            size: 2 + Math.random() * 3
        });
    }
}

function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.03;
        p.life -= 1;

        if (p.life <= 0) {
            particles.splice(i, 1);
        }
    }
}

function drawParticles() {
    for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y - cameraOffsetY, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,185,60,${p.life / 44})`;
        ctx.shadowColor = "#ffb347";
        ctx.shadowBlur = 12;
        ctx.fill();
    }
}

function updateHoop() {
    hoop.x += hoop.speed * hoop.moveDir;

    if (hoop.x > canvas.width - 70 || hoop.x < 70) {
        hoop.moveDir *= -1;
    }
}

function updateBall() {
    if (!shotActive) return;

    ball.vy += 0.34;
    ball.x += ball.vx;
    ball.y += ball.vy;

    ball.vx *= 0.995;
    ball.vy *= 0.995;
    ball.rotation += ball.vx * 0.02;

    trail.push({ x: ball.x, y: ball.y });
    if (trail.length > 15) {
        trail.shift();
    }

    if (ball.y - cameraOffsetY > canvas.height + 70) {
        combo = 0;
        updateUI();
        resetBall();
    }
}

function checkScore() {
    if (scoreLock) return;

    const hoopTop = hoop.y;
    const withinX = ball.x > hoop.x - hoop.width / 2 && ball.x < hoop.x + hoop.width / 2;
    const enteringHoop = ball.vy < 0 && ball.y < hoopTop + 10 && ball.y > hoopTop - 26;

    if (withinX && enteringHoop) {
        scoreLock = true;
        combo += 1;
        score += combo;
        stars += 5;
        scoreFlash = 12;

        if (score > bestScore) {
            bestScore = score;
        }

        spawnParticles(hoop.x, hoop.y + 4);

        hoop.y -= 135;
        cameraOffsetY += 110;

        updateUI();

        setTimeout(() => {
            scoreLock = false;
        }, 250);
    }
}

function drawAimDots() {
    if (shotActive || trail.length > 0) return;

    const dots = 6;
    for (let i = 0; i < dots; i++) {
        const t = i / dots;
        const x = ball.x - 60 - i * 6;
        const y = ball.y - cameraOffsetY - 30 - i * 22;

        ctx.beginPath();
        ctx.arc(x, y, 2 + (1 - t) * 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,120,80,${0.2 + (1 - t) * 0.5})`;
        ctx.shadowColor = "rgba(255,120,80,0.5)";
        ctx.shadowBlur = 8;
        ctx.fill();
    }
}

function updateCenterScoreEffect() {
    if (scoreFlash > 0) {
        scoreFlash -= 1;
        centerScoreEl.style.transform = "translateX(-50%) scale(1.08)";
        centerScoreEl.style.color = "rgba(255,255,255,1)";
    } else {
        centerScoreEl.style.transform = "translateX(-50%) scale(1)";
        centerScoreEl.style.color = "rgba(255,255,255,0.94)";
    }
}

function shootTo(targetX, targetY) {
    const dx = targetX - ball.x;
    const dy = targetY - ball.y;

    ball.vx = dx * 0.032;
    ball.vy = dy * 0.032;
    shotActive = true;
}

function renderShop() {
    skinsList.innerHTML = "";

    for (const skin of skins) {
        const item = document.createElement("div");
        item.className = "skin-item";

        const owned = ownedSkins.includes(skin.id);
        const active = currentSkin === skin.id;

        item.innerHTML = `
            <div class="skin-left">
                <div class="skin-preview" style="background:${skin.color};"></div>
                <div>
                    <div>${skin.name}</div>
                    <div style="opacity:.7; font-size:14px;">${owned ? "Owned" : "⭐ " + skin.price}</div>
                </div>
            </div>
        `;

        const btn = document.createElement("button");
        btn.className = "skin-buy-btn";
        btn.textContent = active ? "Using" : (owned ? "Use" : "Buy");
        btn.addEventListener("click", () => buySkin(skin.id));

        item.appendChild(btn);
        skinsList.appendChild(item);
    }
}

function buySkin(id) {
    if (ownedSkins.includes(id)) {
        currentSkin = id;
        updateUI();
        renderShop();
        return;
    }

    const skin = skins.find(s => s.id === id);
    if (!skin) return;

    if (stars >= skin.price) {
        stars -= skin.price;
        ownedSkins.push(id);
        currentSkin = id;
        updateUI();
        renderShop();
    }
}

function loop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    renderBackgroundGlow();

    updateHoop();
    updateBall();
    checkScore();
    updateParticles();
    updateCenterScoreEffect();

    drawAimDots();
    drawTrail();
    drawHoop();
    drawParticles();
    drawBall();

    requestAnimationFrame(loop);
}

canvas.addEventListener("click", (e) => {
    shootTo(e.clientX, e.clientY + cameraOffsetY);
});

canvas.addEventListener("touchstart", (e) => {
    const touch = e.touches[0];
    shootTo(touch.clientX, touch.clientY + cameraOffsetY);
}, { passive: true });

restartBtn.addEventListener("click", resetGame);

homeBtn.addEventListener("click", () => {
    resetGame();
});

shopBtn.addEventListener("click", () => {
    renderShop();
    shopModal.classList.remove("hidden");
});

closeShopBtn.addEventListener("click", () => {
    shopModal.classList.add("hidden");
});

updateUI();
resetGame();
renderShop();
loop();
