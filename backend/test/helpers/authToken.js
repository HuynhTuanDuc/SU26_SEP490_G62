const jwt = require('jsonwebtoken');

/**
 * Signs an access token matching authService.js's signAccessToken() payload shape, so
 * middleware/authMiddleware.js's verifyToken() accepts it. Call AFTER setupTestDb() so
 * process.env.JWT_SECRET (read once at authService require-time) is set consistently —
 * tests should set process.env.JWT_SECRET themselves before requiring authService/app routes.
 */
function signAccessToken({ userId, email = 'user@test.com', role = 'driver' }) {
    return jwt.sign(
        { userId, email, role, tokenType: 'access' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' },
    );
}

module.exports = { signAccessToken };
