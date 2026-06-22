const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const profileRepository = require('../repositories/profileRepository');
const { OAuth2Client } = require('google-auth-library');
const emailService = require('./emailService');
const pool = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'MY_SECRET_KEY';
const GOOGLE_CLIENT_ID = process.env.GG_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
const client = new OAuth2Client(GOOGLE_CLIENT_ID);
const PASSWORD_RESET_CODE_TTL_MS = 10 * 60 * 1000;
const PASSWORD_RESET_RESEND_COOLDOWN_MS = 60 * 1000;
const passwordResetStore = new Map();

class AuthError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.name = 'AuthError';
        this.status = status;
    }
}

const generateVerificationCode = () => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let index = 0; index < 6; index += 1) {
        code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return code;
};

const normalizeEmail = (email) => {
    if (typeof email !== 'string' || !email.trim()) {
        throw new AuthError('Email la bat buoc.', 400);
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        throw new AuthError('Email khong hop le.', 400);
    }

    return normalizedEmail;
};

// Login user - return token and user info
const login = async (email, password) => {
    if (!email || !password) {
        throw new AuthError('Email và mật khẩu là bắt buộc.', 400);
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Find account by normalized email
    const account = await profileRepository.getAccountByEmail(normalizedEmail);
    if (!account) {
        throw new AuthError('Email không tồn tại.', 404);
    }

    // Compare passwords
    const validPassword = await bcrypt.compare(password, account.password_hash);
    if (!validPassword) {
        throw new AuthError('Mật khẩu không đúng.', 401);
    }

    const profile = await profileRepository.getProfileByAccountId(account.id);
    const role = account.role;

    if (!role) {
        throw new AuthError('Tài khoản chưa được gán vai trò.', 403);
    }

    
    if (account.is_active === false) {
        throw new AuthError('Tài khoản của bạn đã bị khoá.', 403);
    }

 
    await profileRepository.updateLastLogin(account.id);

    // Generate JWT token
    const token = jwt.sign(
        { userId: account.id, email: account.email, role },
        JWT_SECRET,
        { expiresIn: '1h' }
    );

    return {
        token,
        user: {
            id: account.id,
            email: account.email,
            full_name: profile?.full_name ?? null,
            phone: profile?.phone ?? null,
            avatar_url: profile?.avatar_url ?? null,
            role_id: profile?.role_id ?? account.role_id ?? null,
            role,
        }
    };
};

const fetchGoogleTokenInfo = async (credential) => {
    if (!credential) {
        throw new AuthError('Google credential is required.', 400);
    }

    if (typeof fetch !== 'function') {
        throw new Error('Global fetch is not available in this runtime.');
    }

    const ticket = await client.verifyIdToken({
        idToken: credential,
        audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload) {
        throw new AuthError('Invalid Google credential.', 401);
    }

    return payload;
};

const loginWithGoogle = async (credential) => {
    const tokenInfo = await fetchGoogleTokenInfo(credential);

    if (GOOGLE_CLIENT_ID && tokenInfo.aud !== GOOGLE_CLIENT_ID) {
        throw new AuthError('Google account is not authorized for this application.', 403);
    }

    if (!tokenInfo.email || String(tokenInfo.email_verified).toLowerCase() !== 'true') {
        throw new AuthError('Google email is not verified.', 403);
    }

    const normalizedEmail = tokenInfo.email.trim().toLowerCase();
    const account = await profileRepository.getAccountByEmail(normalizedEmail);

    if (!account) {
        throw new AuthError('This Google account is not provisioned for internal access.', 403);
    }

    const profile = await profileRepository.getProfileByAccountId(account.id);
    const role = account.role;

    if (!role) {
        throw new AuthError('Account role is not assigned.', 403);
    }

    if (account.is_active === false) {
        throw new AuthError('Your account has been deactivated.', 403);
    }

    await profileRepository.updateLastLogin(account.id);

    const token = jwt.sign(
        { userId: account.id, email: account.email, role },
        JWT_SECRET,
        { expiresIn: '1h' }
    );

    return {
        token,
        user: {
            id: account.id,
            email: account.email,
            full_name: profile?.full_name ?? null,
            phone: profile?.phone ?? null,
            avatar_url: profile?.avatar_url ?? null,
            role_id: profile?.role_id ?? account.role_id ?? null,
            role,
        }
    };
};

const requestPasswordReset = async (email) => {
    const normalizedEmail = normalizeEmail(email);
    const account = await profileRepository.getAccountByEmail(normalizedEmail);
    if (!account) {
        throw new AuthError('Email khong ton tai.', 404);
    }

    const existingReset = passwordResetStore.get(normalizedEmail);
    if (existingReset?.cooldownUntil && existingReset.cooldownUntil > Date.now()) {
        const retryAfterSeconds = Math.ceil((existingReset.cooldownUntil - Date.now()) / 1000);
        const error = new AuthError(`Vui long cho ${retryAfterSeconds} giay truoc khi yeu cau ma moi.`, 429);
        error.retry_after_seconds = retryAfterSeconds;
        throw error;
    }

    const profile = await profileRepository.getProfileByAccountId(account.id);
    const code = generateVerificationCode();
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');

    passwordResetStore.set(normalizedEmail, {
        codeHash,
        userId: account.id,
        expiresAt: Date.now() + PASSWORD_RESET_CODE_TTL_MS,
        cooldownUntil: Date.now() + PASSWORD_RESET_RESEND_COOLDOWN_MS,
        verified: false,
    });

    await emailService.sendPasswordResetCodeEmail(account.email, profile?.full_name, code);

    return {
        message: 'Da gui ma xac nhan toi email cua ban.',
        expires_in_seconds: Math.floor(PASSWORD_RESET_CODE_TTL_MS / 1000),
        retry_after_seconds: Math.floor(PASSWORD_RESET_RESEND_COOLDOWN_MS / 1000),
    };
};

const verifyPasswordResetCode = async (email, code) => {
    const normalizedEmail = normalizeEmail(email);
    if (!code || typeof code !== 'string' || code.trim().length !== 6) {
        throw new AuthError('Ma xac nhan khong hop le.', 400);
    }

    const resetRequest = passwordResetStore.get(normalizedEmail);
    if (!resetRequest) {
        throw new AuthError('Khong tim thay yeu cau dat lai mat khau. Vui long gui lai ma.', 400);
    }

    if (resetRequest.expiresAt < Date.now()) {
        passwordResetStore.delete(normalizedEmail);
        throw new AuthError('Ma xac nhan da het han.', 400);
    }

    const submittedHash = crypto.createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
    if (submittedHash !== resetRequest.codeHash) {
        throw new AuthError('Ma xac nhan khong dung.', 400);
    }

    passwordResetStore.set(normalizedEmail, {
        ...resetRequest,
        verified: true,
    });

    return { message: 'Xac nhan ma thanh cong.' };
};

const resetPassword = async (email, code, newPassword, confirmPassword) => {
    const normalizedEmail = normalizeEmail(email);
    if (!code || typeof code !== 'string' || code.trim().length !== 6) {
        throw new AuthError('Ma xac nhan khong hop le.', 400);
    }
    if (!newPassword || !confirmPassword) {
        throw new AuthError('Mat khau moi va xac nhan mat khau la bat buoc.', 400);
    }
    if (newPassword.length < 6) {
        throw new AuthError('Mat khau moi phai co it nhat 6 ky tu.', 400);
    }
    if (newPassword !== confirmPassword) {
        throw new AuthError('Xac nhan mat khau khong khop.', 400);
    }

    const resetRequest = passwordResetStore.get(normalizedEmail);
    if (!resetRequest) {
        throw new AuthError('Khong tim thay yeu cau dat lai mat khau. Vui long gui lai ma.', 400);
    }
    if (resetRequest.expiresAt < Date.now()) {
        passwordResetStore.delete(normalizedEmail);
        throw new AuthError('Ma xac nhan da het han.', 400);
    }

    const submittedHash = crypto.createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
    if (submittedHash !== resetRequest.codeHash) {
        throw new AuthError('Ma xac nhan khong dung.', 400);
    }
    if (!resetRequest.verified) {
        throw new AuthError('Vui long xac nhan ma truoc khi dat lai mat khau.', 400);
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
        `UPDATE accounts
         SET password_hash = $1, updated_at = NOW()
         WHERE id = $2`,
        [passwordHash, resetRequest.userId],
    );

    passwordResetStore.delete(normalizedEmail);
    return { message: 'Dat lai mat khau thanh cong.' };
};

// Get user from token
const getUserFromToken = async (userId) => {
    const profile = await profileRepository.getProfileWithRole(userId);
    if (!profile) {
        throw new Error('User not found');
    }
    return profile;
};

// Verify JWT token
const verifyToken = (token) => {
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        return decoded;
    } catch (err) {
        throw new Error('Invalid token');
    }
};

module.exports = {
    login,
    loginWithGoogle,
    requestPasswordReset,
    verifyPasswordResetCode,
    resetPassword,
    getUserFromToken,
    verifyToken,
    AuthError,
};
