const express = require('express');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifyToken } = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');

// Chống brute-force mật khẩu / dò mã OTP — riêng cho các endpoint xác thực nhạy cảm
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Quá nhiều lần thử, vui lòng thử lại sau ít phút.' },
});

// Chặn sớm các giá trị sai kiểu (object, array...) trước khi rơi xuống service —
// tránh lỗi 500 khó hiểu khi ví dụ email là object thay vì string.
const loginRules = [
    body('email').isString().withMessage('Email là bắt buộc').bail().trim().notEmpty().withMessage('Email là bắt buộc'),
    body('password').isString().withMessage('Mật khẩu là bắt buộc').bail().notEmpty().withMessage('Mật khẩu là bắt buộc'),
];
const googleLoginRules = [
    body('credential').isString().withMessage('Google credential là bắt buộc').bail().notEmpty().withMessage('Google credential là bắt buộc'),
];
const emailOnlyRules = [
    body('email').isString().withMessage('Email là bắt buộc').bail().trim().notEmpty().withMessage('Email là bắt buộc'),
];
const verifyCodeRules = [
    body('email').isString().withMessage('Email là bắt buộc').bail().trim().notEmpty().withMessage('Email là bắt buộc'),
    body('code').isString().withMessage('Mã xác nhận phải có 6 ký tự').bail().trim().isLength({ min: 6, max: 6 }).withMessage('Mã xác nhận phải có 6 ký tự'),
];
const resetPasswordRules = [
    body('email').isString().withMessage('Email là bắt buộc').bail().trim().notEmpty().withMessage('Email là bắt buộc'),
    body('code').isString().withMessage('Mã xác nhận phải có 6 ký tự').bail().trim().isLength({ min: 6, max: 6 }).withMessage('Mã xác nhận phải có 6 ký tự'),
    body('newPassword').isString().withMessage('Mật khẩu mới phải có ít nhất 6 ký tự').bail().isLength({ min: 6 }).withMessage('Mật khẩu mới phải có ít nhất 6 ký tự'),
    body('confirmPassword').isString().withMessage('Xác nhận mật khẩu là bắt buộc').bail().notEmpty().withMessage('Xác nhận mật khẩu là bắt buộc'),
];

router.post('/login',  authLimiter, loginRules, validate, authController.login);
router.post('/google', authLimiter, googleLoginRules, validate, authController.googleLogin);
router.post('/forgot-password/request', authLimiter, emailOnlyRules, validate, authController.requestPasswordReset);
router.post('/forgot-password/verify', authLimiter, verifyCodeRules, validate, authController.verifyPasswordResetCode);
router.post('/forgot-password/reset', authLimiter, resetPasswordRules, validate, authController.resetPassword);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.get('/me',      verifyToken, authController.getCurrentUser);

module.exports = router;
