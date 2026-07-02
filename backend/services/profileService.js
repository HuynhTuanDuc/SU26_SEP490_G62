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
    normalizeNationalId,
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
    if ('national_id' in rest) normalized.national_id = normalizeNationalId(rest.national_id);
    if ('tax_code' in rest) normalized.tax_code = normalizeOptionalText(rest.tax_code);
    if ('emergency_contact_name' in rest) normalized.emergency_contact_name = normalizeOptionalText(rest.emergency_contact_name);
    if ('emergency_contact_phone' in rest) normalized.emergency_contact_phone = normalizePhone(rest.emergency_contact_phone);
    if ('notes' in rest) normalized.notes = normalizeOptionalText(rest.notes);

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
    if (!profile) throw new Error('Không tìm thấy hồ sơ');
    return profile;
};

const updateMyProfile = async (userId, data) => {
    const normalized = sanitizeProfileUpdate(data);
    return profileRepository.updateProfile(userId, normalized);
};

const updateAvatar = async (userId, avatarUrl) => {
    if (!avatarUrl) throw new Error('URL ảnh đại diện không hợp lệ');
    return profileRepository.updateAvatar(userId, avatarUrl);
};

const changePassword = async (userId, { currentPassword, newPassword } = {}) => {
    if (!currentPassword || !newPassword) {
        throw new Error('Mật khẩu hiện tại và mật khẩu mới là bắt buộc');
    }
    if (newPassword.length < 6) {
        throw new Error('Mật khẩu mới phải có ít nhất 6 ký tự');
    }

    const accountResult = await pool.query(
        `SELECT password_hash FROM accounts WHERE id = $1`,
        [userId],
    );
    if (!accountResult.rows[0]) throw new Error('Không tìm thấy tài khoản');

    const { password_hash } = accountResult.rows[0];
    const valid = await bcrypt.compare(currentPassword, password_hash);
    if (!valid) throw new Error('Mật khẩu hiện tại không đúng');

    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
        `UPDATE accounts SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
        [newHash, userId],
    );

    return { message: 'Đổi mật khẩu thành công' };
};

const sendEmailChangeCode = async (userId) => {
    const profile = await profileRepository.getFullProfile(userId);
    if (!profile?.email) {
        throw new Error('Không tìm thấy email hiện tại');
    }

    const existingVerification = emailVerificationStore.get(String(userId));
    if (existingVerification?.cooldownUntil && existingVerification.cooldownUntil > Date.now()) {
        const retryAfterSeconds = Math.ceil((existingVerification.cooldownUntil - Date.now()) / 1000);
        const cooldownError = new Error(`Vui lòng chờ ${retryAfterSeconds} giây trước khi yêu cầu mã mới`);
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
        message: 'Đã gửi mã xác nhận tới email hiện tại',
        expires_in_seconds: Math.floor(EMAIL_CODE_TTL_MS / 1000),
        retry_after_seconds: Math.floor(EMAIL_CODE_RESEND_COOLDOWN_MS / 1000),
    };
};

const verifyEmailChangeCode = async (userId, { code, newEmail } = {}) => {
    if (!code || typeof code !== 'string' || code.trim().length !== 6) {
        throw new Error('Mã xác nhận không hợp lệ');
    }

    const normalizedNewEmail = normalizeEmail(newEmail);
    const verification = emailVerificationStore.get(String(userId));
    if (!verification) {
        throw new Error('Không tìm thấy yêu cầu xác nhận. Vui lòng gửi lại mã');
    }

    if (verification.expiresAt < Date.now()) {
        emailVerificationStore.delete(String(userId));
        throw new Error('Mã xác nhận đã hết hạn');
    }

    const submittedHash = crypto.createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
    if (submittedHash !== verification.codeHash) {
        throw new Error('Mã xác nhận không đúng');
    }

    const currentProfile = await profileRepository.getFullProfile(userId);
    if (!currentProfile) {
        throw new Error('Không tìm thấy hồ sơ');
    }

    if (normalizedNewEmail === String(currentProfile.email).trim().toLowerCase()) {
        emailVerificationStore.delete(String(userId));
        return { message: 'Email không thay đổi', email: normalizedNewEmail };
    }

    const existingAccount = await profileRepository.getAccountByEmail(normalizedNewEmail);
    if (existingAccount && Number(existingAccount.id) !== Number(userId)) {
        throw new Error('Email đã tồn tại');
    }

    const updated = await profileRepository.updateAccountEmail(userId, normalizedNewEmail);
    emailVerificationStore.delete(String(userId));

    return {
        message: 'Cập nhật email thành công',
        email: updated?.email || normalizedNewEmail,
    };
};

const registerDeviceToken = async (userId, { fcmToken, platform } = {}) => {
    if (!fcmToken || !fcmToken.trim()) throw new Error('fcmToken là bắt buộc');
    const allowedPlatforms = ['android', 'ios', 'web'];
    const normalizedPlatform = platform && allowedPlatforms.includes(platform) ? platform : 'android';

    const fcmService = require('./fcmService');
    fcmService.registerToken(userId, fcmToken.trim(), normalizedPlatform);

    return { message: 'Đăng ký thiết bị thành công', platform: normalizedPlatform };
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
