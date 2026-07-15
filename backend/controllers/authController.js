const authService = require('../services/authService');
const logger = require('../config/logger');

// Cookie phải sống đúng bằng thời hạn thực của JWT/DB refresh token,
// nếu không cookie sẽ tự rụng trước (hoặc sau) khi token còn hạn,
// khiến client mất token mà không kịp gọi refresh.
const ACCESS_COOKIE_MAX_AGE_MS = authService.ACCESS_TOKEN_EXPIRES_IN_MS;
const REFRESH_COOKIE_MAX_AGE_MS = authService.REFRESH_TOKEN_TTL_MS;

const shouldUseSecureCookies = () => process.env.NODE_ENV === 'production';

const getCookieOptions = (maxAge) => ({
    httpOnly: true,
    sameSite: shouldUseSecureCookies() ? 'none' : 'lax',
    secure: shouldUseSecureCookies(),
    maxAge,
    path: '/',
});

const setSessionCookies = (res, accessToken, refreshToken) => {
    res.cookie(authService.AUTH_COOKIE_NAME, accessToken, getCookieOptions(ACCESS_COOKIE_MAX_AGE_MS));
    res.cookie(authService.REFRESH_COOKIE_NAME, refreshToken, getCookieOptions(REFRESH_COOKIE_MAX_AGE_MS));
};

const clearSessionCookies = (res) => {
    res.clearCookie(authService.AUTH_COOKIE_NAME, {
        ...getCookieOptions(ACCESS_COOKIE_MAX_AGE_MS),
        maxAge: undefined,
    });
    res.clearCookie(authService.REFRESH_COOKIE_NAME, {
        ...getCookieOptions(REFRESH_COOKIE_MAX_AGE_MS),
        maxAge: undefined,
    });
};

const readCookieValue = (cookieHeader, cookieName) => {
    if (!cookieHeader) return null;

    const cookie = String(cookieHeader)
        .split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${cookieName}=`));

    if (!cookie) return null;
    return decodeURIComponent(cookie.slice(cookieName.length + 1));
};

// POST /auth/login
const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await authService.login(email, password);
        setSessionCookies(res, result.token, result.refreshToken);

        res.json({
            message: 'Login successful',
            // Keep bearer token in the JSON response for mobile clients.
            token: result.token,
            user: result.user,
        });
    } catch (err) {
        logger.error('Login error', { message: err.message });
        const status = Number.isInteger(err.status) ? err.status : 500;
        const message = status === 500 ? 'Internal server error' : err.message;
        res.status(status).json({ error: message });
    }
};

// POST /auth/google
const googleLogin = async (req, res) => {
    try {
        const { credential } = req.body;
        const result = await authService.loginWithGoogle(credential);
        setSessionCookies(res, result.token, result.refreshToken);

        res.json({
            message: 'Google login successful',
            // Keep bearer token in the JSON response for mobile clients.
            token: result.token,
            user: result.user,
        });
    } catch (err) {
        logger.error('Google login error', { message: err.message });
        const status = Number.isInteger(err.status) ? err.status : 500;
        const message = status === 500 ? 'Internal server error' : err.message;
        res.status(status).json({ error: message });
    }
};

const requestPasswordReset = async (req, res) => {
    try {
        const { email } = req.body;
        const result = await authService.requestPasswordReset(email);
        res.json(result);
    } catch (err) {
        logger.error('Request password reset error', { message: err.message });
        const status = Number.isInteger(err.status) ? err.status : 500;
        res.status(status).json({
            error: status === 500 ? 'Internal server error' : err.message,
            retry_after_seconds: err.retry_after_seconds || 0,
        });
    }
};

const verifyPasswordResetCode = async (req, res) => {
    try {
        const { email, code } = req.body;
        const result = await authService.verifyPasswordResetCode(email, code);
        res.json(result);
    } catch (err) {
        logger.error('Verify password reset code error', { message: err.message });
        const status = Number.isInteger(err.status) ? err.status : 500;
        res.status(status).json({ error: status === 500 ? 'Internal server error' : err.message });
    }
};

const resetPassword = async (req, res) => {
    try {
        const { email, code, newPassword, confirmPassword } = req.body;
        const result = await authService.resetPassword(email, code, newPassword, confirmPassword);
        res.json(result);
    } catch (err) {
        logger.error('Reset password error', { message: err.message });
        const status = Number.isInteger(err.status) ? err.status : 500;
        res.status(status).json({ error: status === 500 ? 'Internal server error' : err.message });
    }
};

// GET /auth/me (protected endpoint)
const getCurrentUser = async (req, res) => {
    try {
        const user = await authService.getUserFromToken(req.user.userId);
        res.json(user);
    } catch (err) {
        logger.error('Get user error', { message: err.message });
        res.status(404).json({ error: err.message });
    }
};

const refresh = async (req, res) => {
    try {
        // Web: cookie HttpOnly; Mobile: gửi refreshToken trong body JSON
        const refreshToken =
            readCookieValue(req.headers.cookie, authService.REFRESH_COOKIE_NAME)
            ?? req.body?.refreshToken
            ?? null;
        const result = await authService.refreshSession(refreshToken);
        setSessionCookies(res, result.accessToken, result.refreshToken);

        res.json({
            message: 'Session refreshed',
            token: result.accessToken ?? result.token,
            refreshToken: result.refreshToken,   // mobile cần để lưu lại
            user: result.user,
        });
    } catch (err) {
        clearSessionCookies(res);
        const status = Number.isInteger(err.status) ? err.status : 401;
        res.status(status).json({ error: err.message || 'Unable to refresh session' });
    }
};

const logout = async (req, res) => {
    const refreshToken = readCookieValue(req.headers.cookie, authService.REFRESH_COOKIE_NAME);
    await authService.revokeRefreshToken(refreshToken);
    clearSessionCookies(res);
    res.json({ message: 'Logout successful' });
};

module.exports = {
    login,
    googleLogin,
    requestPasswordReset,
    verifyPasswordResetCode,
    resetPassword,
    getCurrentUser,
    refresh,
    logout,
};
