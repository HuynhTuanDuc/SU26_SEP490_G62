const authService = require('../services/authService');
const profileRepository = require('../repositories/profileRepository');

const readCookieValue = (cookieHeader, cookieName) => {
    if (!cookieHeader) return null;

    const cookie = String(cookieHeader)
        .split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${cookieName}=`));

    if (!cookie) return null;

    return decodeURIComponent(cookie.slice(cookieName.length + 1));
};

// Middleware: Verify JWT token
const verifyToken = async (req, res, next) => {
    try {
        // Dual-mode HTTP auth:
        // - mobile sends Authorization: Bearer <token>
        // - web uses the HttpOnly access-token cookie
        const bearerToken = req.headers['authorization']?.split(' ')[1];
        const cookieToken = readCookieValue(req.headers.cookie, authService.AUTH_COOKIE_NAME);
        const token = bearerToken || cookieToken;
        // code: 'NO_TOKEN' báo cho client biết access-token cookie đã hết hạn/bị xoá
        // (khác với tài khoản bị khoá) để apiClient biết khi nào nên thử refresh.
        if (!token) return res.status(403).json({ error: 'Bạn cần đăng nhập lại', code: 'NO_TOKEN' });

        const decoded = authService.verifyToken(token);

        const account = await profileRepository.getAccountById(decoded.userId);
        if (!account) return res.status(401).json({ error: 'Không thấy người dùng' });
        if (account.is_active === false) {
            return res.status(403).json({ error: 'Tài khoản của bạn đã bị khoá.', code: 'ACCOUNT_LOCKED' });
        }

        req.user = { ...decoded, role: account.role, roleId: account.role_id };
        next();
    } catch (err) {
        return res.status(401).json({ error: err.message });
    }
};

// Middleware: Check user role(s)
const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: 'Chưa xác thực' });
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Quyền hạn không đủ' });
        }
        next();
    };
};

module.exports = {
    verifyToken,
    requireRole,
};
