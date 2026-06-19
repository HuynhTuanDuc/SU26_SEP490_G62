const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const profileRepository = require('../repositories/profileRepository');
const emailService = require('./emailService');
const pool = require('../config/database');
const {
    normalizeOptionalText,
    normalizePhone,
    normalizeDob,
    normalizeGender,
    normalizeEmail,
} = require('../utils/userValidation');
const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
const EMAIL_CODE_RESEND_COOLDOWN_MS = 60 * 1000;
const emailVerificationStore = new Map();

const sanitizeProfileUpdate = (data = {}) => {
    const { email, role_id, role, is_active, id, created_at, updated_at, ...rest } = data;

    const normalized = {};
    if ('full_name' in rest) normalized.full_name = normalizeOptionalText(rest.full_name);
    if ('phone' in rest) normalized.phone = normalizePhone(rest.phone);
    if ('dob' in rest) normalized.dob = normalizeDob(rest.dob);
    if ('gender' in rest) normalized.gender = normalizeGender(rest.gender, { includeHint: true });
    if ('address' in rest) normalized.address = normalizeOptionalText(rest.address);
    if ('city' in rest) normalized.city = normalizeOptionalText(rest.city);
    if ('country' in rest) normalized.country = normalizeOptionalText(rest.country);

    return normalized;
};

const generateVerificationCode = () => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let index = 0; index < 6; index += 1) {
        code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return code;
};

const getMyProfile = async (userId) => {
    const profile = await profileRepository.getFullProfile(userId);
    if (!profile) throw new Error('Khong tim thay ho so');
    return profile;
};

const updateMyProfile = async (userId, data) => {
    const normalized = sanitizeProfileUpdate(data);
    return profileRepository.updateProfile(userId, normalized);
};

const updateAvatar = async (userId, avatarUrl) => {
    if (!avatarUrl) throw new Error('URL anh dai dien khong hop le');
    return profileRepository.updateAvatar(userId, avatarUrl);
};

const changePassword = async (userId, { currentPassword, newPassword } = {}) => {
    if (!currentPassword || !newPassword) {
        throw new Error('Mat khau hien tai va mat khau moi la bat buoc');
    }
    if (newPassword.length < 6) {
        throw new Error('Mat khau moi phai co it nhat 6 ky tu');
    }

    const accountResult = await pool.query(
        `SELECT password_hash FROM accounts WHERE id = $1`,
        [userId],
    );
    if (!accountResult.rows[0]) throw new Error('Khong tim thay tai khoan');

    const { password_hash } = accountResult.rows[0];
    const valid = await bcrypt.compare(currentPassword, password_hash);
    if (!valid) throw new Error('Mat khau hien tai khong dung');

    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
        `UPDATE accounts SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
        [newHash, userId],
    );

    return { message: 'Doi mat khau thanh cong' };
};

const sendEmailChangeCode = async (userId) => {
    const profile = await profileRepository.getFullProfile(userId);
    if (!profile?.email) {
        throw new Error('Khong tim thay email hien tai');
    }

    const existingVerification = emailVerificationStore.get(String(userId));
    if (existingVerification?.cooldownUntil && existingVerification.cooldownUntil > Date.now()) {
        const retryAfterSeconds = Math.ceil((existingVerification.cooldownUntil - Date.now()) / 1000);
        const cooldownError = new Error(`Vui long cho ${retryAfterSeconds} giay truoc khi yeu cau ma moi`);
        cooldownError.retry_after_seconds = retryAfterSeconds;
        throw cooldownError;
    }

    const code = generateVerificationCode();
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');

    emailVerificationStore.set(String(userId), {
        codeHash,
        expiresAt: Date.now() + EMAIL_CODE_TTL_MS,
        cooldownUntil: Date.now() + EMAIL_CODE_RESEND_COOLDOWN_MS,
        verified: false,
    });

    await emailService.sendEmailChangeVerificationCode(profile.email, profile.full_name, code);
    return {
        message: 'Da gui ma xac nhan toi email hien tai',
        expires_in_seconds: Math.floor(EMAIL_CODE_TTL_MS / 1000),
        retry_after_seconds: Math.floor(EMAIL_CODE_RESEND_COOLDOWN_MS / 1000),
    };
};

const verifyEmailChangeCode = async (userId, { code, newEmail } = {}) => {
    if (!code || typeof code !== 'string' || code.trim().length !== 6) {
        throw new Error('Ma xac nhan khong hop le');
    }

    const normalizedNewEmail = normalizeEmail(newEmail);
    const verification = emailVerificationStore.get(String(userId));
    if (!verification) {
        throw new Error('Khong tim thay yeu cau xac nhan. Vui long gui lai ma');
    }

    if (verification.expiresAt < Date.now()) {
        emailVerificationStore.delete(String(userId));
        throw new Error('Ma xac nhan da het han');
    }

    const submittedHash = crypto.createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
    if (submittedHash !== verification.codeHash) {
        throw new Error('Ma xac nhan khong dung');
    }

    const currentProfile = await profileRepository.getFullProfile(userId);
    if (!currentProfile) {
        throw new Error('Khong tim thay ho so');
    }

    if (normalizedNewEmail === String(currentProfile.email).trim().toLowerCase()) {
        emailVerificationStore.delete(String(userId));
        return { message: 'Email khong thay doi', email: normalizedNewEmail };
    }

    const existingAccount = await profileRepository.getAccountByEmail(normalizedNewEmail);
    if (existingAccount && Number(existingAccount.id) !== Number(userId)) {
        throw new Error('Email da ton tai');
    }

    const updated = await profileRepository.updateAccountEmail(userId, normalizedNewEmail);
    emailVerificationStore.delete(String(userId));

    return {
        message: 'Cap nhat email thanh cong',
        email: updated?.email || normalizedNewEmail,
    };
};

const registerDeviceToken = async (userId, { fcmToken, platform } = {}) => {
    if (!fcmToken || !fcmToken.trim()) throw new Error('fcmToken la bat buoc');
    const allowedPlatforms = ['android', 'ios', 'web'];
    const normalizedPlatform = platform && allowedPlatforms.includes(platform) ? platform : 'android';

    const fcmService = require('./fcmService');
    fcmService.registerToken(userId, fcmToken.trim(), normalizedPlatform);

    return { message: 'Dang ky thiet bi thanh cong', platform: normalizedPlatform };
};

module.exports = {
    getMyProfile,
    updateMyProfile,
    updateAvatar,
    changePassword,
    sendEmailChangeCode,
    verifyEmailChangeCode,
    registerDeviceToken,
};
