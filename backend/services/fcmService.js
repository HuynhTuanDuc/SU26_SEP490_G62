
const pool = require('../config/database');

let firebaseAdmin = null;
let fbInitAttempted = false;

const getFirebaseAdmin = () => {
    if (fbInitAttempted) return firebaseAdmin;
    fbInitAttempted = true;

    try {
        const admin = require('firebase-admin');
        const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
        if (!serviceAccountJson) {
            console.warn('[FCM] FIREBASE_SERVICE_ACCOUNT_JSON env var not set — FCM push disabled');
            return null;
        }
        const serviceAccount = JSON.parse(serviceAccountJson);
        if (!admin.apps.length) {
            admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
        }
        firebaseAdmin = admin;
        console.info('[FCM] Firebase Admin initialised');
    } catch (err) {
        console.warn('[FCM] firebase-admin not available or invalid config — FCM push disabled:', err.message);
        firebaseAdmin = null;
    }
    return firebaseAdmin;
};

/**
 * Register a device FCM token for a user profile. Lưu ở DB (không phải Map trong RAM)
 * vì Cloud Run có thể chạy nhiều instance / tự restart bất kỳ lúc nào — giữ ở bộ nhớ
 * sẽ mất token ngay khi instance đó bị thu hồi. Một user có thể có nhiều thiết bị,
 * nên upsert theo token (không theo user_id) và cho phép nhiều dòng cùng user_id.
 * @param {number|string} profileId
 * @param {string} token  FCM registration token
 * @param {string} [platform]  'android' | 'ios' | 'web'
 */
const registerToken = async (profileId, token, platform = 'android') => {
    if (!profileId || !token) return;
    await pool.query(
        `INSERT INTO device_tokens (user_id, token, platform)
         VALUES ($1, $2, $3)
         ON CONFLICT (token) DO UPDATE
             SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, updated_at = NOW()`,
        [profileId, token, platform],
    );
};

/**
 * Remove all FCM tokens for a user (e.g. on logout).
 * @param {number|string} profileId
 */
const removeToken = async (profileId) => {
    if (!profileId) return;
    await pool.query('DELETE FROM device_tokens WHERE user_id = $1', [profileId]);
};

/**
 * Send a push notification to a single user.
 * Silently no-ops if: token not registered, firebase-admin not available, or FCM returns error.
 * @param {number|string} profileId
 * @param {{ title: string, body: string, data?: object }} payload
 */
const sendNotification = async (profileId, { title, body, data = {} }) => {
    const admin = getFirebaseAdmin();
    if (!admin) return;

    const { rows: tokens } = await pool.query(
        'SELECT token FROM device_tokens WHERE user_id = $1',
        [profileId],
    );
    if (tokens.length === 0) return;

    const fcmData = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)]),
    );

    await Promise.all(tokens.map(async ({ token }) => {
        try {
            await admin.messaging().send({
                token,
                notification: { title, body },
                data: fcmData,
                android: { priority: 'high' },
                apns:    { payload: { aps: { sound: 'default' } } },
            });
        } catch (err) {
            // Token stale/thu hồi → dọn khỏi DB, không throw (FCM lỗi không được làm sập luồng chính)
            if (err.code === 'messaging/registration-token-not-registered') {
                await pool.query('DELETE FROM device_tokens WHERE token = $1', [token]).catch(() => {});
            }
        }
    }));
};

/**
 * Send a push notification to multiple users.
 * @param {Array<number|string>} profileIds
 * @param {{ title: string, body: string, data?: object }} payload
 */
const sendToMany = (profileIds, payload) => {
    const ids = [...new Set((profileIds ?? []).filter(Boolean).map(String))];
    return Promise.all(ids.map((id) => sendNotification(id, payload)));
};

module.exports = { registerToken, removeToken, sendNotification, sendToMany };
