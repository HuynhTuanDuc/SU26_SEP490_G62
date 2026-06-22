const express = require('express');
const router = express.Router();

const { verifyToken } = require('../middleware/authMiddleware');
const { uploadAvatar } = require('../middleware/uploadMiddleware');
const profileController = require('../controllers/profileController');

function handleUpload(middleware) {
    return (req, res, next) => {
        middleware(req, res, (err) => {
            if (err) return res.status(422).json({ error: err.message });
            next();
        });
    };
}

router.use(verifyToken);

router.get('/me',                profileController.getMyProfile);
router.patch('/me',              profileController.updateMyProfile);
router.post('/me/email/send-code', profileController.sendEmailChangeCode);
router.post('/me/email/verify',  profileController.verifyEmailChangeCode);
router.patch('/me/password',     profileController.changePassword);
router.post('/me/avatar',        handleUpload(uploadAvatar.single('avatar')), profileController.updateAvatar);
router.post('/me/device-token',  profileController.registerDeviceToken);

module.exports = router;
