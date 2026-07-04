const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifyToken } = require('../middleware/authMiddleware');

router.post('/login',  authController.login);
router.post('/google', authController.googleLogin);
router.post('/forgot-password/request', authController.requestPasswordReset);
router.post('/forgot-password/verify', authController.verifyPasswordResetCode);
router.post('/forgot-password/reset', authController.resetPassword);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.get('/me',      verifyToken, authController.getCurrentUser);

module.exports = router;
