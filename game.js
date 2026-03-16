import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js';
import {
    getAuth,
    signInWithCustomToken
} from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js';
import {
    getDatabase,
    ref,
    get,
    set
} from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js';

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

if (typeof Telegram !== "undefined" && Telegram.WebApp) {
    Telegram.WebApp.ready();
    Telegram.WebApp.expand();
}

const firebaseConfig = {
    apiKey: 'AIzaSyDfhiqpjbKjTYR2QXsTLRvCd4L_UCl3EeI',
    authDomain: 'dunk-rise-5c1f2.firebaseapp.com',
    databaseURL: 'https://dunk-rise-5c1f2-default-rtdb.firebaseio.com',
    projectId: 'dunk-rise-5c1f2',
    appId: '1:19536474240:web:e20f78ca71f28a78123665'
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getDatabase(firebaseApp);

const BACKEND_BASE_URL = 'https://dunk-rise.onrender.com';
const TELEGRAM_AUTH_URL = `${BACKEND_BASE_URL}/telegram-auth`;
const ACTIVATE_REFERRAL_URL = `${BACKEND_BASE_URL}/activate-referral`;
const LOCAL_CACHE_KEY = "dunkrise_profile_cache";

function getTelegramInitDataRaw() {
    try {
        if (typeof Telegram !== "undefined" && Telegram.WebApp) {
            return Telegram.WebApp.initData || "";
        }
    } catch (error) {
        console.error("Telegram initData read error:", error);
    }

    return "";
}

function loadLocalCache() {
    try {
        const raw = localStorage.getItem(LOCAL_CACHE_KEY);
        if (!raw) {
            return null;
        }

        const parsed = JSON.parse(raw);

        return {
            bestScore: Number(parsed.bestScore || 0),
            stars: Number(parsed.stars || 0),
            ownedSkins: Array.isArray(parsed.ownedSkins) && parsed.ownedSkins.length > 0
                ? parsed.ownedSkins
                : [0],
            currentSkin: Number(parsed.currentSkin || 0),
            updatedAt: Number(parsed.updatedAt || 0),
            referredBy: parsed.referredBy || null,
            referralRewardGiven: Boolean(parsed.referralRewardGiven)
        };
    } catch (error) {
        console.error("Local cache load error:", error);
        return null;
    }
}

function saveLocalCache(profile) {
    try {
        // Use server timestamp, not local time, to avoid clock sync issues
        const cacheData = {
            ...profile,
            syncedFromServer: firebaseUid ? true : false, // Mark if from server
        };
        localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(cacheData));
    } catch (error) {
        console.error("Local cache save error:", error);
    }
}

async function loginWithTelegram() {
    const initDataRaw = getTelegramInitDataRaw();

    if (!initDataRaw) {
        console.error("❌ Telegram initData is missing");
        throw new Error("Telegram initData is missing");
    }

    console.log("🔐 Authenticating with Telegram...");

    try {
        const response = await fetch(TELEGRAM_AUTH_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ initDataRaw })
        });

        if (!response.ok) {
            console.error("❌ Telegram auth HTTP error:", response.status, response.statusText);
            throw new Error(`Telegram auth failed: ${response.status}`);
        }

        const data = await response.json();
        console.log("📩 Auth response received:", { uid: data.uid, hasToken: !!data.customToken });

        if (!data.customToken || !data.uid) {
            console.error("❌ Invalid auth response:", data);
            throw new Error("Invalid auth response");
        }

        await signInWithCustomToken(auth, data.customToken);
        console.log("✅ Signed in to Firebase with custom token");
        return data.uid;
    } catch (error) {
        console.error("❌ loginWithTelegram error:", error);
        throw error;
    }
}

async function activateReferralIfNeeded() {
    const initDataRaw = getTelegramInitDataRaw();

    if (!initDataRaw) {
        return;
    }

    try {
        const response = await fetch(ACTIVATE_REFERRAL_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ initDataRaw })
        });

        if (!response.ok) {
            throw new Error(`Referral activation failed: ${response.status}`);
        }

        const data = await response.json();
        console.log("Referral activation result:", data);
    } catch (error) {
        console.error("Referral activation error:", error);
    }
}

async function fetchProfileFromFirebase(uid) {
    console.log("Fetching profile from Firebase:", uid);
    
    try {
        const snapshot = await get(ref(db, `profiles/${uid}`));

        if (!snapshot.exists()) {
            console.log("⚠️  No profile found in Firebase for:", uid);
            return null;
        }

        const profile = snapshot.val();
        console.log("✅ Fetched profile from Firebase:", profile);
        return profile;
    } catch (error) {
        console.error("❌ Firebase fetch error:", error);
        console.error("Error code:", error.code);
        console.error("Error message:", error.message);
        throw error;
    }
}

async function saveProfileToFirebase(uid, profile) {
    const safeOwnedSkins =
        Array.isArray(profile.ownedSkins) && profile.ownedSkins.length > 0
            ? [...new Set(profile.ownedSkins.map(Number))]
            : [0];

    if (!safeOwnedSkins.includes(0)) {
        safeOwnedSkins.unshift(0);
    }

    let safeCurrentSkin = Number(profile.currentSkin || 0);
    if (!safeOwnedSkins.includes(safeCurrentSkin)) {
        safeCurrentSkin = 0;
    }

    const payload = {
        bestScore: Number(profile.bestScore || 0),
        stars: Number(profile.stars || 0),
        combo: Number(profile.combo || 0),
        ownedSkins: safeOwnedSkins,
        currentSkin: safeCurrentSkin,
        updatedAt: Date.now(),
        referredBy: profile.referredBy || null,
        referralRewardGiven: Boolean(profile.referralRewardGiven)
    };

    console.log("Saving to Firebase:", { uid, payload });
    
    try {
        await set(ref(db, `profiles/${uid}`), payload);
        console.log("✅ Successfully saved to Firebase");
        return payload;
    } catch (error) {
        console.error("❌ Firebase save error:", error);
        console.error("Error code:", error.code);
        console.error("Error message:", error.message);
        throw error;
    }
}

const skins = [
    { id: 0, name: "Classic", price: 0, color: "#ffae00", glow: "#ff9a00" },
    { id: 1, name: "Fire", price: 50, color: "#ff5b1f", glow: "#ff6f3c" },
    { id: 2, name: "Neon", price: 120, color: "#31eaff", glow: "#64f6ff" },
    { id: 3, name: "Pink", price: 200, color: "#ff57c7", glow: "#ff85da" }
];

function getDefaultProfile() {
    return {
        bestScore: 0,
        stars: 0,
        ownedSkins: [0],
        currentSkin: 0,
        updatedAt: 0,
        referredBy: null,
        referralRewardGiven: false
    };
}

let profile = getDefaultProfile();
let firebaseUid = null;

// Game state - synced to Firebase
let score = 0;
let stars = 0;
let bestScore = 0;
let combo = 0; // 🔄 NOTE: Now synced to Firebase for cross-device compatibility
let ownedSkins = [0];
let currentSkin = 0;

function applyProfile(newProfile) {
    profile = {
        bestScore: Number(newProfile.bestScore || 0),
        stars: Number(newProfile.stars || 0),
        combo: Number(newProfile.combo || 0), // Load combo from profile
        ownedSkins: Array.isArray(newProfile.ownedSkins) && newProfile.ownedSkins.length > 0
            ? [...new Set(newProfile.ownedSkins.map(Number))]
            : [0],
        currentSkin: Number(newProfile.currentSkin || 0),
        updatedAt: Number(newProfile.updatedAt || 0),
        referredBy: newProfile.referredBy || null,
        referralRewardGiven: Boolean(newProfile.referralRewardGiven)
    };

    if (!profile.ownedSkins.includes(0)) {
        profile.ownedSkins.unshift(0);
    }

    if (!profile.ownedSkins.includes(profile.currentSkin)) {
        profile.currentSkin = 0;
    }

    stars = profile.stars;
    bestScore = profile.bestScore;
    combo = profile.combo; // Apply combo from profile
    ownedSkins = profile.ownedSkins;
    currentSkin = profile.currentSkin;
}

function collectCurrentProfile() {
    return {
        bestScore,
        stars,
        combo, // Include combo in profile
        ownedSkins,
        currentSkin,
        updatedAt: Date.now(),
        referredBy: profile.referredBy || null,
        referralRewardGiven: Boolean(profile.referralRewardGiven)
    };
}

let saveTimer = null;
let profileLoaded = false;

async function syncProfileSave() {
    const currentProfile = collectCurrentProfile();
    
    console.log("🔄 Sync profile save requested", { firebaseUid, profileLoaded, currentProfile });
    
    // Всегда сохранять в локальный кеш
    saveLocalCache(currentProfile);

    if (!firebaseUid) {
        console.warn("⚠️  Firebase UID not available - profile saved locally only");
        return;
    }

    try {
        console.log("📤 Sending to Firebase...");
        const saved = await saveProfileToFirebase(firebaseUid, currentProfile);
        profile = saved;
        saveLocalCache(saved);
        console.log("✅ Profile synced successfully to Firebase and local cache");
    } catch (error) {
        console.error("❌ Firebase save error:", error);
        console.warn("⚠️  Could not save to Firebase - profile saved locally only");
    }
}

function queueProfileSave() {
    if (!profileLoaded) {
        console.warn("Profile not yet loaded, save queued");
        return;
    }

    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        syncProfileSave();
    }, 250);
}

async function initProfile() {
    console.log("📋 ===== PROFILE INITIALIZATION STARTED =====");
    
    const localProfile = loadLocalCache();
    console.log("💾 Local cache status:", localProfile ? "FOUND" : "EMPTY");
    
    let authSuccess = false;

    try {
        console.log("🔑 Step 1: Authenticating with Telegram backend...");
        firebaseUid = await loginWithTelegram();
        authSuccess = true;
        console.log("✅ Step 1 DONE: firebaseUid =", firebaseUid);

        console.log("🎁 Step 2: Checking referral rewards...");
        await activateReferralIfNeeded();
        console.log("✅ Step 2 DONE");

        console.log("📥 Step 3: Fetching profile from Firebase...");
        const remoteProfile = await fetchProfileFromFirebase(firebaseUid);

        if (remoteProfile) {
            console.log("✅ Step 3: Remote profile FOUND");
            console.log("🔄 Using SERVER profile (newest data wins for sync)");
            applyProfile(remoteProfile);
            saveLocalCache(remoteProfile);
        } else if (localProfile) {
            console.log("⚠️  Step 3: Remote profile NOT FOUND");
            console.log("📤 Syncing LOCAL profile UP to Firebase...");
            applyProfile(localProfile);
            await saveProfileToFirebase(firebaseUid, localProfile);
        } else {
            console.log("⚠️  Step 3: No remote, no local => NEW USER");
            const freshProfile = getDefaultProfile();
            applyProfile(freshProfile);
            console.log("📤 Saving fresh profile to Firebase...");
            await saveProfileToFirebase(firebaseUid, freshProfile);
            saveLocalCache(freshProfile);
        }
        
        console.log("✅ ===== PROFILE INIT SUCCESS =====");
    } catch (error) {
        console.error("❌ PROFILE INIT FAILED:", error);
        console.error("Error code:", error.code);
        console.error("Error message:", error.message);
        
        if (!authSuccess) {
            console.warn("⚠️  Auth failed - falling back to local only");
            firebaseUid = null; // Explicitly set to null on auth failure
        }

        if (localProfile) {
            console.log("💾 Applying local cache");
            applyProfile(localProfile);
        } else {
            console.log("🆕 Using default profile");
            applyProfile(getDefaultProfile());
        }
    }

    profileLoaded = true;
    console.log("✅ Profile loaded into memory");
    updateUI();
    renderShop();
}


function updateUI() {
    centerScoreEl.textContent = score;
    starsEl.textContent = stars;
    bestScoreEl.textContent = bestScore;
    comboTextEl.textContent = combo > 1 ? `COMBO x${combo}` : "";

    queueProfileSave();
}

const gravity = 0.34;
const air = 0.997;

let dragPower = 0.20;
let maxDrag = 190;
let wallBounce = 0.82;

function updatePhysicsForScreen() {
    if (window.innerHeight < 760) {
        dragPower = 0.12;
        maxDrag = 170;
        wallBounce = 0.84;
    } else {
        dragPower = 0.10;
        maxDrag = 150;
        wallBounce = 0.82;
    }
}

const assist = {
    enabled: true,
    radiusX: 38,
    radiusY: 48,
    strengthX: 0.085,
    strengthY: 0.03,
    minDownSpeed: 0.8
};

const layout = {
    width: 0,
    height: 0,
    safeLeft: 18,
    safeRight: 18,
    safeTop: 140,
    safeBottom: 170,
    hoopMinY: 0,
    hoopMaxY: 0,
    ballStartY: 0
};

function getViewportSize() {
    let width = window.innerWidth;
    let height = window.innerHeight;

    if (typeof Telegram !== "undefined" && Telegram.WebApp) {
        if (Telegram.WebApp.viewportHeight) {
            height = Math.round(Telegram.WebApp.viewportHeight);
        }
        if (Telegram.WebApp.viewportStableHeight) {
            height = Math.round(Telegram.WebApp.viewportStableHeight);
        }
    }

    return { width, height };
}

function updateLayout() {
    const vp = getViewportSize();

    canvas.width = vp.width;
    canvas.height = vp.height;

    layout.width = vp.width;
    layout.height = vp.height;

    const isSmallPhone = vp.height < 760;

    layout.safeLeft = Math.max(16, vp.width * 0.04);
    layout.safeRight = Math.max(16, vp.width * 0.04);

    layout.safeTop = isSmallPhone ? 165 : 150;
    layout.safeBottom = isSmallPhone ? 190 : 175;

    layout.hoopMinY = layout.safeTop + 40;
    layout.hoopMaxY = Math.max(layout.hoopMinY + 20, vp.height * 0.46);

    layout.ballStartY = vp.height - layout.safeBottom;

    centerScoreEl.style.top = isSmallPhone ? "96px" : "110px";
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function distance(ax, ay, bx, by) {
    const dx = ax - bx;
    const dy = ay - by;
    return Math.hypot(dx, dy);
}

function clampVector(dx, dy, maxLen) {
    const len = Math.hypot(dx, dy);
    if (len <= maxLen || len === 0) {
        return { dx, dy };
    }
    const scale = maxLen / len;
    return {
        dx: dx * scale,
        dy: dy * scale
    };
}

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
    speed: 1.35
};

let trail = [];
let particles = [];
let scoreFlash = 0;

let isFlying = false;
let canShoot = true;
let scoredThisShot = false;

let isDragging = false;
let dragPoint = { x: 0, y: 0 };

function currentSkinData() {
    return skins.find((s) => s.id === currentSkin) || skins[0];
}

function resetBall() {
    ball.x = layout.width * 0.5;
    ball.y = layout.ballStartY;
    ball.vx = 0;
    ball.vy = 0;
    ball.rotation = 0;

    trail = [];
    scoredThisShot = false;
    isFlying = false;
    canShoot = true;
    isDragging = false;

    dragPoint.x = ball.x;
    dragPoint.y = ball.y;
}

function placeHoopForLevel() {
    hoop.x = clamp(
        hoop.x,
        layout.safeLeft + 60,
        layout.width - layout.safeRight - 60
    );

    hoop.y = clamp(
        layout.height * 0.33,
        layout.hoopMinY,
        layout.hoopMaxY
    );
}

function resetHoop() {
    hoop.x = layout.width * 0.22;
    hoop.moveDir = 1;
    placeHoopForLevel();
}

function getRandomHoopX() {
    const minX = layout.safeLeft + 60;
    const maxX = layout.width - layout.safeRight - 60;
    return Math.random() * (maxX - minX) + minX;
}

function resetGame() {
    score = 0;
    combo = 0;
    particles = [];
    scoreFlash = 0;

    resetHoop();
    resetBall();
    updateUI();
}

function failRun() {
    score = 0;
    combo = 0;
    particles = [];
    scoreFlash = 0;

    resetHoop();
    resetBall();
    updateUI();
}

function nextLevel() {
    hoop.x = getRandomHoopX();
    hoop.y = clamp(layout.height * 0.30, layout.hoopMinY, layout.hoopMaxY);
    resetBall();
}

function renderBackgroundGlow() {
    const glow = ctx.createRadialGradient(
        layout.width / 2,
        layout.height * 0.2,
        20,
        layout.width / 2,
        layout.height * 0.55,
        layout.height * 0.75
    );
    glow.addColorStop(0, "rgba(255,255,255,0.07)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, layout.width, layout.height);
}

function drawHoop() {
    const y = hoop.y;

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
    ctx.translate(ball.x, ball.y);
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
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
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
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,185,60,${p.life / 44})`;
        ctx.shadowColor = "#ffb347";
        ctx.shadowBlur = 12;
        ctx.fill();
    }
}

function updateHoop() {
    hoop.x += hoop.speed * hoop.moveDir;

    const minX = layout.safeLeft + 70;
    const maxX = layout.width - layout.safeRight - 70;

    if (hoop.x > maxX || hoop.x < minX) {
        hoop.moveDir *= -1;
        hoop.x = clamp(hoop.x, minX, maxX);
    }
}

function applyAimAssist() {
    if (!assist.enabled || !isFlying || scoredThisShot) return;
    if (ball.vy < assist.minDownSpeed) return;

    const rimX = hoop.x;
    const rimY = hoop.y + 6;

    const dx = rimX - ball.x;
    const dy = rimY - ball.y;

    if (Math.abs(dx) > assist.radiusX) return;
    if (Math.abs(dy) > assist.radiusY) return;
    if (ball.y < hoop.y - 40) return;
    if (ball.y > hoop.y + 55) return;

    const factorX = 1 - Math.abs(dx) / assist.radiusX;
    const factorY = 1 - Math.abs(dy) / assist.radiusY;

    ball.vx += dx * assist.strengthX * factorX;
    ball.vy += dy * assist.strengthY * factorY;
}

function updateBall() {
    if (!isFlying) return;

    ball.vy += gravity;
    applyAimAssist();

    ball.x += ball.vx;
    ball.y += ball.vy;

    ball.vx *= air;
    ball.vy *= air;
    ball.rotation += ball.vx * 0.02;

    if (ball.x - ball.radius <= 0) {
        ball.x = ball.radius;
        ball.vx = Math.abs(ball.vx) * wallBounce;
    }

    if (ball.x + ball.radius >= layout.width) {
        ball.x = layout.width - ball.radius;
        ball.vx = -Math.abs(ball.vx) * wallBounce;
    }

    trail.push({ x: ball.x, y: ball.y });
    if (trail.length > 16) {
        trail.shift();
    }

    if (ball.y > layout.height + 80) {
        failRun();
    }
}

function checkScore() {
    if (scoredThisShot) return;

    const rimY = hoop.y;
    const withinX = ball.x > hoop.x - hoop.width / 2 && ball.x < hoop.x + hoop.width / 2;
    const crossingDown = ball.vy > 0 && ball.y > rimY - 8 && ball.y < rimY + 22;

    if (withinX && crossingDown) {
        scoredThisShot = true;
        isFlying = false;
        canShoot = false;

        combo += 1;
        score += 1;
        stars += 1;
        scoreFlash = 12;

        if (score > bestScore) {
            bestScore = score;
        }

        spawnParticles(hoop.x, hoop.y + 4);
        updateUI();

        setTimeout(() => {
            nextLevel();
        }, 260);
    }
}

function drawDragGuide() {
    if (!isDragging || !canShoot || isFlying) return;

    const dx = dragPoint.x - ball.x;
    const dy = dragPoint.y - ball.y;
    const clamped = clampVector(dx, dy, maxDrag);

    const guideX = ball.x + clamped.dx;
    const guideY = ball.y + clamped.dy;

    ctx.save();

    ctx.beginPath();
    ctx.moveTo(ball.x, ball.y);
    ctx.lineTo(guideX, guideY);
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 4;
    ctx.stroke();

    let simX = ball.x;
    let simY = ball.y;
    let simVx = clamped.dx * dragPower;
    let simVy = clamped.dy * dragPower;

    for (let i = 0; i < 7; i++) {
        simVy += gravity;
        simX += simVx * 5;
        simY += simVy * 5;

        ctx.beginPath();
        ctx.arc(simX, simY, Math.max(2, 5 - i * 0.45), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,120,80,${0.75 - i * 0.09})`;
        ctx.shadowColor = "rgba(255,120,80,0.45)";
        ctx.shadowBlur = 8;
        ctx.fill();
    }

    ctx.restore();
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

function startDrag(clientX, clientY) {
    if (!canShoot || isFlying) return;

    if (distance(clientX, clientY, ball.x, ball.y) <= ball.radius + 28) {
        isDragging = true;
        dragPoint.x = clientX;
        dragPoint.y = clientY;
    }
}

function moveDrag(clientX, clientY) {
    if (!isDragging || !canShoot || isFlying) return;
    dragPoint.x = clientX;
    dragPoint.y = clientY;
}

function endDrag() {
    if (!isDragging || !canShoot || isFlying) return;

    const dx = dragPoint.x - ball.x;
    const dy = dragPoint.y - ball.y;
    const clamped = clampVector(dx, dy, maxDrag);

    isDragging = false;

    if (clamped.dy > -10) return;

    ball.vx = clamped.dx * dragPower;
    ball.vy = clamped.dy * dragPower;

    isFlying = true;
    canShoot = false;
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

    const skin = skins.find((s) => s.id === id);
    if (!skin) return;

    if (stars >= skin.price) {
        stars -= skin.price;
        ownedSkins.push(id);
        currentSkin = id;
        
        // Ensure immediate save to both local and Firebase
        updateUI();
        
        // Force immediate Firebase save if available
        if (firebaseUid) {
            const currentProfile = collectCurrentProfile();
            syncProfileSave();
        }
        
        renderShop();
    }
}

canvas.addEventListener("mousedown", (e) => {
    startDrag(e.clientX, e.clientY);
});

canvas.addEventListener("mousemove", (e) => {
    moveDrag(e.clientX, e.clientY);
});

window.addEventListener("mouseup", () => {
    endDrag();
});

canvas.addEventListener("touchstart", (e) => {
    const t = e.touches[0];
    startDrag(t.clientX, t.clientY);
}, { passive: true });

canvas.addEventListener("touchmove", (e) => {
    const t = e.touches[0];
    moveDrag(t.clientX, t.clientY);
}, { passive: true });

window.addEventListener("touchend", () => {
    endDrag();
}, { passive: true });

restartBtn.addEventListener("click", async () => {
    const freshProfile = getDefaultProfile();

    applyProfile(freshProfile);
    score = 0;
    combo = 0;

    saveLocalCache(freshProfile);

    try {
        if (firebaseUid) {
            await saveProfileToFirebase(firebaseUid, freshProfile);
        }
    } catch (error) {
        console.error("Profile reset sync error:", error);
    }

    resetGame();
    renderShop();
    updateUI();
});

function getReferralLink(uid) {
    const telegramId = uid.replace("telegram_", "");
    return `https://t.me/basketebalbot?startapp=ref_${telegramId}`;
}

async function copyReferralLink() {
    if (!firebaseUid) {
        return;
    }

    const link = getReferralLink(firebaseUid);

    try {
        await navigator.clipboard.writeText(link);
        console.log("Referral link copied:", link);
    } catch (error) {
        console.error("Clipboard error:", error);
    }
}

homeBtn.addEventListener("click", resetGame);

shopBtn.addEventListener("click", () => {
    renderShop();
    shopModal.classList.remove("hidden");
});

closeShopBtn.addEventListener("click", () => {
    shopModal.classList.add("hidden");
});

function handleResize() {
    updateLayout();
    updatePhysicsForScreen();
    resetGame();
    renderShop();
}

function loop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#0a0e27";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    renderBackgroundGlow();

    updateHoop();
    updateBall();
    checkScore();
    updateParticles();
    updateCenterScoreEffect();

    drawDragGuide();
    drawTrail();
    drawHoop();
    drawParticles();
    drawBall();

    requestAnimationFrame(loop);
}

// Initialize game - wait for profile to load before starting
(async () => {
    updateLayout();
    updatePhysicsForScreen();
    resetGame();
    
    console.log("Initializing game profile...");
    await initProfile();
    console.log("Profile initialization complete");
    
    // Start game loop after profile is loaded
    requestAnimationFrame(loop);
    
    // Add event listeners after profile is loaded
    window.addEventListener("resize", handleResize);
    if (typeof Telegram !== "undefined" && Telegram.WebApp) {
        Telegram.WebApp.onEvent("viewportChanged", handleResize);
    }
})();
