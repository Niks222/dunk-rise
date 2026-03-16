const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const admin = require('firebase-admin');
const {validate, parse} = require('@tma.js/init-data-node');

dotenv.config();

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT || 3000);
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

if (!BOT_TOKEN) {
  throw new Error('BOT_TOKEN is missing');
}

app.use(cors({
  origin: ALLOWED_ORIGIN === '*' ? true : ALLOWED_ORIGIN,
  methods: ['GET', 'POST', 'OPTIONS'],
}));

function buildServiceAccountFromEnv() {
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  return {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey,
  };
}

function initFirebaseAdmin() {
  if (admin.apps.length > 0) {
    return;
  }

  const serviceAccount = buildServiceAccountFromEnv();

  if (!serviceAccount.projectId || !serviceAccount.clientEmail || !serviceAccount.privateKey) {
    throw new Error('Firebase service account env vars are missing');
  }

  if (!process.env.FIREBASE_DATABASE_URL) {
    throw new Error('FIREBASE_DATABASE_URL is missing');
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
}

initFirebaseAdmin();

console.log('\n🔥 Firebase Admin initialized');
console.log('🔐 Firebase Project ID:', process.env.FIREBASE_PROJECT_ID);
console.log('📍 Firebase Database URL:', process.env.FIREBASE_DATABASE_URL);
console.log('🤖 Bot Token loaded:', !!process.env.BOT_TOKEN);
console.log('📡 CORS Origin:', ALLOWED_ORIGIN);

const db = admin.database();

function getDefaultProfile() {
  return {
    bestScore: 0,
    stars: 0,
    combo: 0,
    ownedSkins: [0],
    currentSkin: 0,
    updatedAt: 0,
    referredBy: null,
    referralRewardGiven: false,
  };
}

function getUidFromTelegramId(telegramId) {
  return `telegram_${telegramId}`;
}

function ensureProfileShape(profile) {
  const safeOwnedSkins =
    Array.isArray(profile?.ownedSkins) && profile.ownedSkins.length > 0
      ? [...new Set(profile.ownedSkins.map(Number))]
      : [0];

  if (!safeOwnedSkins.includes(0)) {
    safeOwnedSkins.unshift(0);
  }

  let currentSkin = Number(profile?.currentSkin || 0);
  if (!safeOwnedSkins.includes(currentSkin)) {
    currentSkin = 0;
  }

  return {
    bestScore: Number(profile?.bestScore || 0),
    stars: Number(profile?.stars || 0),
    combo: Number(profile?.combo || 0),
    ownedSkins: safeOwnedSkins,
    currentSkin,
    updatedAt: Number(profile?.updatedAt || 0),
    referredBy: profile?.referredBy || null,
    referralRewardGiven: Boolean(profile?.referralRewardGiven),
  };
}

function validateTelegramInitData(initDataRaw) {
  validate(initDataRaw, BOT_TOKEN);
  return parse(initDataRaw);
}

app.get('/', (req, res) => {
  console.log('📡 [GET /] Health check received');
  res.json({
    ok: true,
    service: 'dunk-rise-backend',
  });
});

app.post('/telegram-auth', async (req, res) => {
  try {
    console.log('\n📨 [telegram-auth] REQUEST RECEIVED');
    const {initDataRaw} = req.body || {};

    console.log('📨 [telegram-auth] initDataRaw received:', !!initDataRaw);

    if (!initDataRaw || typeof initDataRaw !== 'string') {
      console.error('❌ [telegram-auth] initDataRaw is missing or invalid');
      return res.status(400).json({error: 'initDataRaw is required'});
    }

    const initData = validateTelegramInitData(initDataRaw);

    if (!initData.user || !initData.user.id) {
      console.error('❌ [telegram-auth] Telegram user not found in initData');
      return res.status(401).json({error: 'Telegram user not found'});
    }

    console.log('✅ [telegram-auth] Telegram user validated:', initData.user.id);

    const uid = getUidFromTelegramId(initData.user.id);
    console.log('🔑 [telegram-auth] Generated UID:', uid);

    const customToken = await admin.auth().createCustomToken(uid, {
      telegramId: String(initData.user.id),
    });

    console.log('🔐 [telegram-auth] Custom token created successfully');
    console.log('✅ [telegram-auth] RESPONSE SENT:', {uid, tokenLength: customToken.length});

    return res.json({
      ok: true,
      uid,
      customToken,
    });
  } catch (error) {
    console.error('❌ [telegram-auth] ERROR:', error.message);
    return res.status(401).json({
      error: 'Invalid Telegram init data',
    });
  }
});

app.post('/activate-referral', async (req, res) => {
  try {
    console.log('\n📨 [activate-referral] REQUEST RECEIVED');
    const {initDataRaw} = req.body || {};

    console.log('📨 [activate-referral] initDataRaw received:', !!initDataRaw);

    if (!initDataRaw || typeof initDataRaw !== 'string') {
      console.error('❌ [activate-referral] initDataRaw is missing');
      return res.status(400).json({error: 'initDataRaw is required'});
    }

    const initData = validateTelegramInitData(initDataRaw);

    if (!initData.user || !initData.user.id) {
      console.error('❌ [activate-referral] Telegram user not found');
      return res.status(401).json({error: 'Telegram user not found'});
    }

    const startParam = initData.start_param || '';
    console.log('📋 [activate-referral] Start param:', startParam || 'EMPTY');

    if (!startParam || !startParam.startsWith('ref_')) {
      console.log('⚠️ [activate-referral] No valid referral param, skipping');
      return res.json({
        ok: true,
        applied: false,
        reason: 'No referral param',
      });
    }

    const invitedTelegramId = String(initData.user.id);
    const invitedUid = getUidFromTelegramId(invitedTelegramId);
    const inviterTelegramId = startParam.slice(4);

    console.log('👤 [activate-referral] Invited UID:', invitedUid);
    console.log('👔 [activate-referral] Inviter Telegram ID from param:', inviterTelegramId);

    if (!/^\d+$/.test(inviterTelegramId)) {
      console.error('❌ [activate-referral] Invalid referral code format');
      return res.status(400).json({error: 'Invalid referral code'});
    }

    const inviterUid = getUidFromTelegramId(inviterTelegramId);
    console.log('👔 [activate-referral] Inviter UID:', inviterUid);

    if (inviterUid === invitedUid) {
      console.log('⚠️ [activate-referral] Self-referral detected, denying');
      return res.json({
        ok: true,
        applied: false,
        reason: 'Self referral denied',
      });
    }

    console.log('🔍 [activate-referral] Fetching Firebase data...');

    const invitedProfileRef = db.ref(`profiles/${invitedUid}`);
    const inviterProfileRef = db.ref(`profiles/${inviterUid}`);
    const invitedByFlagRef = db.ref(`referrals/${inviterUid}/invited/${invitedUid}`);
    const inviterTotalRewardsRef = db.ref(`referrals/${inviterUid}/totalRewards`);

    const [
      invitedProfileSnap,
      inviterProfileSnap,
      invitedByFlagSnap,
      inviterTotalRewardsSnap,
    ] = await Promise.all([
      invitedProfileRef.get(),
      inviterProfileRef.get(),
      invitedByFlagRef.get(),
      inviterTotalRewardsRef.get(),
    ]);

    console.log('✅ [activate-referral] Firebase data fetched');
    console.log('📊 [activate-referral] Invited profile exists:', invitedProfileSnap.exists());
    console.log('📊 [activate-referral] Inviter profile exists:', inviterProfileSnap.exists());

    const invitedProfile = invitedProfileSnap.exists()
      ? ensureProfileShape(invitedProfileSnap.val())
      : getDefaultProfile();

    const inviterProfile = inviterProfileSnap.exists()
      ? ensureProfileShape(inviterProfileSnap.val())
      : getDefaultProfile();

    console.log('📈 [activate-referral] Invited profile stars:', invitedProfile.stars);
    console.log('📈 [activate-referral] Inviter profile stars (before):', inviterProfile.stars);

    if (invitedProfile.referredBy) {
      console.log('⚠️ [activate-referral] Invited user already has referrer:', invitedProfile.referredBy);
      return res.json({
        ok: true,
        applied: false,
        reason: 'Referral already assigned',
      });
    }

    if (invitedProfile.referralRewardGiven || invitedByFlagSnap.exists()) {
      console.log('⚠️ [activate-referral] Reward already granted for this user');
      return res.json({
        ok: true,
        applied: false,
        reason: 'Reward already granted',
      });
    }

    const now = Date.now();
    const totalRewards = Number(inviterTotalRewardsSnap.val() || 0);

    console.log('💰 [activate-referral] Inviter total rewards (before):', totalRewards);
    console.log('⏰ [activate-referral] Update timestamp:', now);

    const updatedInviterProfile = ensureProfileShape({
      ...inviterProfile,
      stars: inviterProfile.stars + 20,
      updatedAt: now,
    });

    console.log('📈 [activate-referral] Inviter profile stars (after):', updatedInviterProfile.stars);

    const updates = {};
    updates[`profiles/${invitedUid}/referredBy`] = inviterUid;
    updates[`profiles/${invitedUid}/referralRewardGiven`] = true;
    updates[`profiles/${invitedUid}/updatedAt`] = now;

    updates[`profiles/${inviterUid}`] = updatedInviterProfile;
    updates[`referrals/${inviterUid}/invited/${invitedUid}`] = true;
    updates[`referrals/${inviterUid}/totalRewards`] = totalRewards + 20;

    console.log('📤 [activate-referral] Sending updates to Firebase...');
    console.log('📍 [activate-referral] Update paths:', Object.keys(updates));

    await db.ref().update(updates);

    console.log('✅ [activate-referral] Firebase update SUCCESS');
    console.log('✅ [activate-referral] RESPONSE SENT:', {applied: true, reward: 20, inviterUid});

    return res.json({
      ok: true,
      applied: true,
      reward: 20,
      inviterUid,
    });
  } catch (error) {
    console.error('❌ [activate-referral] ERROR:', error.message);
    console.error('❌ [activate-referral] Stack:', error.stack);
    return res.status(500).json({
      error: 'Referral activation failed',
    });
  }
});

app.post('/save-game-state', async (req, res) => {
  try {
    console.log('\n📨 [save-game-state] REQUEST RECEIVED');
    const {initDataRaw, gameState} = req.body || {};

    console.log('📨 [save-game-state] Payload received:', !!gameState);

    if (!initDataRaw || typeof initDataRaw !== 'string') {
      console.error('❌ [save-game-state] initDataRaw is missing');
      return res.status(400).json({error: 'initDataRaw is required'});
    }

    if (!gameState || typeof gameState !== 'object') {
      console.error('❌ [save-game-state] gameState is missing or invalid');
      return res.status(400).json({error: 'gameState is required'});
    }

    const initData = validateTelegramInitData(initDataRaw);

    if (!initData.user || !initData.user.id) {
      console.error('❌ [save-game-state] Telegram user not found');
      return res.status(401).json({error: 'Telegram user not found'});
    }

    const uid = getUidFromTelegramId(initData.user.id);
    console.log('👤 [save-game-state] User UID:', uid);

    const payload = {
      bestScore: Number(gameState.bestScore || 0),
      stars: Number(gameState.stars || 0),
      combo: Number(gameState.combo || 0),
      score: Number(gameState.score || 0),
      ownedSkins: Array.isArray(gameState.ownedSkins) ? gameState.ownedSkins : [0],
      currentSkin: Number(gameState.currentSkin || 0),
      updatedAt: Date.now(),
      referredBy: gameState.referredBy || null,
      referralRewardGiven: Boolean(gameState.referralRewardGiven),
    };

    console.log('📊 [save-game-state] Game state:', {
      score: payload.score,
      bestScore: payload.bestScore,
      stars: payload.stars,
      combo: payload.combo,
      currentSkin: payload.currentSkin,
    });

    const profileRef = db.ref(`profiles/${uid}`);
    
    console.log('📤 [save-game-state] Updating Firebase profile...');
    await profileRef.update(payload);

    console.log('✅ [save-game-state] Firebase update SUCCESS');
    console.log('✅ [save-game-state] RESPONSE SENT:', {ok: true, updated: true, uid});

    return res.json({
      ok: true,
      updated: true,
      uid,
    });
  } catch (error) {
    console.error('❌ [save-game-state] ERROR:', error.message);
    console.error('❌ [save-game-state] Stack:', error.stack);
    return res.status(500).json({
      error: 'Game state save failed',
    });
  }
});

app.listen(PORT, () => {
  console.log('\n' + '='.repeat(50));
  console.log('🚀 Backend started on port', PORT);
  console.log('🎮 Service: dunk-rise-backend');
  console.log('📡 Ready to accept requests!');
  console.log('='.repeat(50) + '\n');
});