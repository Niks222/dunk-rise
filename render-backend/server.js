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
  res.json({
    ok: true,
    service: 'dunk-rise-backend',
  });
});

app.post('/telegram-auth', async (req, res) => {
  try {
    const {initDataRaw} = req.body || {};

    if (!initDataRaw || typeof initDataRaw !== 'string') {
      return res.status(400).json({error: 'initDataRaw is required'});
    }

    const initData = validateTelegramInitData(initDataRaw);

    if (!initData.user || !initData.user.id) {
      return res.status(401).json({error: 'Telegram user not found'});
    }

    const uid = getUidFromTelegramId(initData.user.id);

    const customToken = await admin.auth().createCustomToken(uid, {
      telegramId: String(initData.user.id),
    });

    return res.json({
      ok: true,
      uid,
      customToken,
    });
  } catch (error) {
    console.error('telegram-auth error:', error);
    return res.status(401).json({
      error: 'Invalid Telegram init data',
    });
  }
});

app.post('/activate-referral', async (req, res) => {
  try {
    const {initDataRaw} = req.body || {};

    if (!initDataRaw || typeof initDataRaw !== 'string') {
      return res.status(400).json({error: 'initDataRaw is required'});
    }

    const initData = validateTelegramInitData(initDataRaw);

    if (!initData.user || !initData.user.id) {
      return res.status(401).json({error: 'Telegram user not found'});
    }

    const startParam = initData.start_param || '';
    if (!startParam || !startParam.startsWith('ref_')) {
      return res.json({
        ok: true,
        applied: false,
        reason: 'No referral param',
      });
    }

    const invitedTelegramId = String(initData.user.id);
    const invitedUid = getUidFromTelegramId(invitedTelegramId);
    const inviterTelegramId = startParam.slice(4);

    if (!/^\d+$/.test(inviterTelegramId)) {
      return res.status(400).json({error: 'Invalid referral code'});
    }

    const inviterUid = getUidFromTelegramId(inviterTelegramId);

    if (inviterUid === invitedUid) {
      return res.json({
        ok: true,
        applied: false,
        reason: 'Self referral denied',
      });
    }

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

    const invitedProfile = invitedProfileSnap.exists()
      ? ensureProfileShape(invitedProfileSnap.val())
      : getDefaultProfile();

    const inviterProfile = inviterProfileSnap.exists()
      ? ensureProfileShape(inviterProfileSnap.val())
      : getDefaultProfile();

    if (invitedProfile.referredBy) {
      return res.json({
        ok: true,
        applied: false,
        reason: 'Referral already assigned',
      });
    }

    if (invitedProfile.referralRewardGiven || invitedByFlagSnap.exists()) {
      return res.json({
        ok: true,
        applied: false,
        reason: 'Reward already granted',
      });
    }

    const now = Date.now();
    const totalRewards = Number(inviterTotalRewardsSnap.val() || 0);

    const updatedInviterProfile = ensureProfileShape({
      ...inviterProfile,
      stars: inviterProfile.stars + 20,
      updatedAt: now,
    });

    const updates = {};
    updates[`profiles/${invitedUid}/referredBy`] = inviterUid;
    updates[`profiles/${invitedUid}/referralRewardGiven`] = true;
    updates[`profiles/${invitedUid}/updatedAt`] = now;

    updates[`profiles/${inviterUid}`] = updatedInviterProfile;
    updates[`referrals/${inviterUid}/invited/${invitedUid}`] = true;
    updates[`referrals/${inviterUid}/totalRewards`] = totalRewards + 20;

    await db.ref().update(updates);

    return res.json({
      ok: true,
      applied: true,
      reward: 20,
      inviterUid,
    });
  } catch (error) {
    console.error('activate-referral error:', error);
    return res.status(500).json({
      error: 'Referral activation failed',
    });
  }
});

app.listen(PORT, () => {
  console.log(`Backend started on port ${PORT}`);
});