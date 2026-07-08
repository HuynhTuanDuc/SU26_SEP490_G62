const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const profileRepository = require('../repositories/profileRepository');
const { OAuth2Client } = require('google-auth-library');
const emailService = require('./emailService');
const pool = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'MY_SECRET_KEY';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || `${JWT_SECRET}_refresh`;
const GOOGLE_CLIENT_ID = process.env.GG_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
const client = new OAuth2Client(GOOGLE_CLIENT_ID);
const PASSWORD_RESET_CODE_TTL_MS = 10 * 60 * 1000;
const PASSWORD_RESET_RESEND_COOLDOWN_MS = 60 * 1000;
const passwordResetStore = new Map();
const AUTH_COOKIE_NAME = 'auth_token';
const REFRESH_COOKIE_NAME = 'refresh_token';
// Chuyển chuỗi kiểu jsonwebtoken ("15m", "8h", "7d", "30s"...) sang mili-giây,
// dùng chung để cookie/DB TTL luôn khớp với thời hạn thực của JWT.
const parseDurationToMs = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const match = String(value).trim().match(/^(\d+)\s*(ms|s|m|h|d)?$/i);
    if (!match) return null;
    const amount = Number(match[1]);
    const unitMs = { ms: 1, s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 }[
        (match[2] || 'ms').toLowerCase()
    ];
    return amount * unitMs;
};

// Dev/test: 8h để tiện dùng Swagger; production giữ 15m hoặc override qua env
const ACCESS_TOKEN_EXPIRES_IN  = process.env.JWT_ACCESS_EXPIRES_IN
    || (process.env.NODE_ENV === 'production' ? '15m' : '8h');
const REFRESH_TOKEN_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
// Cookie/DB TTL bám theo đúng thời hạn của JWT, tránh lệch pha khiến cookie
// hết hạn trước (hoặc sau) khi token vẫn còn hiệu lực.
const ACCESS_TOKEN_EXPIRES_IN_MS = parseDurationToMs(ACCESS_TOKEN_EXPIRES_IN) || 15 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = Number(process.env.JWT_REFRESH_TTL_MS)
    || parseDurationToMs(REFRESH_TOKEN_EXPIRES_IN)
    || (7 * 24 * 60 * 60 * 1000);

let refreshTokenTableReadyPromise = null;

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
        throw new AuthError('Email là bắt buộc.', 400);
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        throw new AuthError('Email không hợp lệ.', 400);
    }

    return normalizedEmail;
};

const ensureRefreshTokenTable = async () => {
    if (!refreshTokenTableReadyPromise) {
        refreshTokenTableReadyPromise = pool.query(
            `CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
                token_id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                token_hash TEXT NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL,
                revoked_at TIMESTAMPTZ NULL,
                replaced_by_token_id TEXT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )`,
        ).catch((error) => {
            refreshTokenTableReadyPromise = null;
            throw error;
        });
    }

    await refreshTokenTableReadyPromise;
};

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const getRefreshTokenExpiryDate = () => new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

const buildUserPayload = (account, profile) => ({
    id: account.id,
    email: account.email,
    full_name: profile?.full_name ?? null,
    phone: profile?.phone ?? null,
    avatar_url: profile?.avatar_url ?? null,
    role_id: profile?.role_id ?? account.role_id ?? null,
    role: account.role,
});

const signAccessToken = (account) => jwt.sign(
    {
        userId: account.id,
        email: account.email,
        role: account.role,
        tokenType: 'access',
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRES_IN },
);

const verifyRefreshToken = (token) => {
    try {
        const decoded = jwt.verify(token, JWT_REFRESH_SECRET);
        if (decoded?.tokenType !== 'refresh') {
            throw new Error('Invalid refresh token');
        }
        return decoded;
    } catch {
        throw new AuthError('Invalid refresh token', 401);
    }
};

const createRefreshTokenRecord = async (account) => {
    await ensureRefreshTokenTable();

    const tokenId = crypto.randomUUID();
    const refreshToken = jwt.sign(
        {
            userId: account.id,
            email: account.email,
            role: account.role,
            tokenType: 'refresh',
            tokenId,
        },
        JWT_REFRESH_SECRET,
        { expiresIn: REFRESH_TOKEN_EXPIRES_IN },
    );
    const expiresAt = getRefreshTokenExpiryDate();

    await pool.query(
        `INSERT INTO auth_refresh_tokens (token_id, user_id, token_hash, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [tokenId, account.id, hashToken(refreshToken), expiresAt],
    );

    return { refreshToken, tokenId, expiresAt };
};

const revokeStoredRefreshToken = async (tokenId, replacedByTokenId = null) => {
    if (!tokenId) return;

    await ensureRefreshTokenTable();
    await pool.query(
        `UPDATE auth_refresh_tokens
         SET revoked_at = COALESCE(revoked_at, NOW()),
             replaced_by_token_id = COALESCE($2, replaced_by_token_id)
         WHERE token_id = $1`,
        [tokenId, replacedByTokenId],
    );
};

const issueSession = async (account) => {
    const profile = await profileRepository.getProfileByAccountId(account.id);
    const accessToken = signAccessToken(account);
    const { refreshToken } = await createRefreshTokenRecord(account);

    return {
        accessToken,
        refreshToken,
        user: buildUserPayload(account, profile),
    };
};

const validateActiveAccount = async (account) => {
    if (!account) {
        throw new AuthError('Email không tồn tại.', 404);
    }
    if (!account.role) {
        throw new AuthError('Tài khoản chưa được gán vai trò.', 403);
    }
    if (account.is_active === false) {
        throw new AuthError('Tài khoản của bạn đã bị khóa.', 403);
    }
};

const login = async (email, password) => {
    if (!email || !password) {
        throw new AuthError('Email và mật khẩu là bắt buộc.', 400);
    }

    const normalizedEmail = email.trim().toLowerCase();
    const account = await profileRepository.getAccountByEmail(normalizedEmail);
    await validateActiveAccount(account);

    const validPassword = await bcrypt.compare(password, account.password_hash);
    if (!validPassword) {
        throw new AuthError('Mật khẩu không đúng.', 401);
    }

    await profileRepository.updateLastLogin(account.id);
    const session = await issueSession(account);

    return {
        token: session.accessToken,
        refreshToken: session.refreshToken,
        user: session.user,
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

    if (!account.role) {
        throw new AuthError('Account role is not assigned.', 403);
    }

    if (account.is_active === false) {
        throw new AuthError('Your account has been deactivated.', 403);
    }

    await profileRepository.updateLastLogin(account.id);
    const session = await issueSession(account);

    return {
        token: session.accessToken,
        refreshToken: session.refreshToken,
        user: session.user,
    };
};

const requestPasswordReset = async (email) => {
    const normalizedEmail = normalizeEmail(email);
    const account = await profileRepository.getAccountByEmail(normalizedEmail);
    if (!account) {
        throw new AuthError('Email không tồn tại.', 404);
    }

    const existingReset = passwordResetStore.get(normalizedEmail);
    if (existingReset?.cooldownUntil && existingReset.cooldownUntil > Date.now()) {
        const retryAfterSeconds = Math.ceil((existingReset.cooldownUntil - Date.now()) / 1000);
        const error = new AuthError(`Vui lòng chờ ${retryAfterSeconds} giây trước khi yêu cầu mã mới.`, 429);
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
        message: 'Đã gửi mã xác nhận tới email của bạn.',
        expires_in_seconds: Math.floor(PASSWORD_RESET_CODE_TTL_MS / 1000),
        retry_after_seconds: Math.floor(PASSWORD_RESET_RESEND_COOLDOWN_MS / 1000),
    };
};

const verifyPasswordResetCode = async (email, code) => {
    const normalizedEmail = normalizeEmail(email);
    if (!code || typeof code !== 'string' || code.trim().length !== 6) {
        throw new AuthError('Mã xác nhận không hợp lệ.', 400);
    }

    const resetRequest = passwordResetStore.get(normalizedEmail);
    if (!resetRequest) {
        throw new AuthError('Không tìm thấy yêu cầu đặt lại mật khẩu. Vui lòng gửi lại mã.', 400);
    }

    if (resetRequest.expiresAt < Date.now()) {
        passwordResetStore.delete(normalizedEmail);
        throw new AuthError('Mã xác nhận đã hết hạn.', 400);
    }

    const submittedHash = crypto.createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
    if (submittedHash !== resetRequest.codeHash) {
        throw new AuthError('Mã xác nhận không đúng.', 400);
    }

    passwordResetStore.set(normalizedEmail, {
        ...resetRequest,
        verified: true,
    });

    return { message: 'Xác nhận mã thành công.' };
};

const resetPassword = async (email, code, newPassword, confirmPassword) => {
    const normalizedEmail = normalizeEmail(email);
    if (!code || typeof code !== 'string' || code.trim().length !== 6) {
        throw new AuthError('Mã xác nhận không hợp lệ.', 400);
    }
    if (!newPassword || !confirmPassword) {
        throw new AuthError('Mật khẩu mới và xác nhận mật khẩu là bắt buộc.', 400);
    }
    if (newPassword.length < 6) {
        throw new AuthError('Mật khẩu mới phải có ít nhất 6 ký tự.', 400);
    }
    if (newPassword !== confirmPassword) {
        throw new AuthError('Xác nhận mật khẩu không khớp.', 400);
    }

    const resetRequest = passwordResetStore.get(normalizedEmail);
    if (!resetRequest) {
        throw new AuthError('Không tìm thấy yêu cầu đặt lại mật khẩu. Vui lòng gửi lại mã.', 400);
    }
    if (resetRequest.expiresAt < Date.now()) {
        passwordResetStore.delete(normalizedEmail);
        throw new AuthError('Mã xác nhận đã hết hạn.', 400);
    }

    const submittedHash = crypto.createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
    if (submittedHash !== resetRequest.codeHash) {
        throw new AuthError('Mã xác nhận không đúng.', 400);
    }
    if (!resetRequest.verified) {
        throw new AuthError('Vui lòng xác nhận mã trước khi đặt lại mật khẩu.', 400);
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
        `UPDATE accounts
         SET password_hash = $1, updated_at = NOW()
         WHERE id = $2`,
        [passwordHash, resetRequest.userId],
    );

    passwordResetStore.delete(normalizedEmail);
    return { message: 'Đặt lại mật khẩu thành công.' };
};

const getUserFromToken = async (userId) => {
    const profile = await profileRepository.getProfileWithRole(userId);
    if (!profile) {
        throw new Error('User not found');
    }
    return profile;
};

const refreshSession = async (refreshToken) => {
    if (!refreshToken) {
        throw new AuthError('Refresh token is required', 401);
    }

    await ensureRefreshTokenTable();
    const decoded = verifyRefreshToken(refreshToken);

    const storedTokenResult = await pool.query(
        `SELECT token_id, user_id, token_hash, expires_at, revoked_at
         FROM auth_refresh_tokens
         WHERE token_id = $1`,
        [decoded.tokenId],
    );
    const storedToken = storedTokenResult.rows[0] ?? null;

    if (!storedToken || Number(storedToken.user_id) !== Number(decoded.userId)) {
        throw new AuthError('Refresh token is invalid', 401);
    }
    if (storedToken.revoked_at) {
        throw new AuthError('Refresh token has been revoked', 401);
    }
    if (new Date(storedToken.expires_at).getTime() <= Date.now()) {
        await revokeStoredRefreshToken(decoded.tokenId);
        throw new AuthError('Refresh token has expired', 401);
    }
    if (storedToken.token_hash !== hashToken(refreshToken)) {
        await revokeStoredRefreshToken(decoded.tokenId);
        throw new AuthError('Refresh token mismatch', 401);
    }

    const account = await profileRepository.getAccountById(decoded.userId);
    if (!account) {
        await revokeStoredRefreshToken(decoded.tokenId);
        throw new AuthError('User not found', 401);
    }
    if (account.is_active === false) {
        await revokeStoredRefreshToken(decoded.tokenId);
        throw new AuthError('Tài khoản của bạn đã bị khóa.', 403);
    }

    const session = await issueSession(account);
    const nextRefreshPayload = verifyRefreshToken(session.refreshToken);
    await revokeStoredRefreshToken(decoded.tokenId, nextRefreshPayload.tokenId);

    return {
        token: session.accessToken,
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        user: session.user,
    };
};

const revokeRefreshToken = async (refreshToken) => {
    if (!refreshToken) return;

    try {
        const decoded = verifyRefreshToken(refreshToken);
        await revokeStoredRefreshToken(decoded.tokenId);
    } catch {
        // Ignore invalid refresh token during logout.
    }
};

const verifyToken = (token) => {
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded?.tokenType && decoded.tokenType !== 'access') {
            throw new Error('Invalid token');
        }
        return decoded;
    } catch {
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
    refreshSession,
    revokeRefreshToken,
    ACCESS_TOKEN_EXPIRES_IN,
    REFRESH_TOKEN_EXPIRES_IN,
    ACCESS_TOKEN_EXPIRES_IN_MS,
    REFRESH_TOKEN_TTL_MS,
    AuthError,
    AUTH_COOKIE_NAME,
    REFRESH_COOKIE_NAME,
};
