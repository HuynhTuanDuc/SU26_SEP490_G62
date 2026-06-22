const profileService = require('../services/profileService');

const getMyProfile = async (req, res) => {
    try {
        const profile = await profileService.getMyProfile(req.user.userId);
        res.json({ profile });
    } catch (err) {
        res.status(404).json({ error: err.message });
    }
};

const updateMyProfile = async (req, res) => {
    try {
        const updated = await profileService.updateMyProfile(req.user.userId, req.body);
        res.json({ message: 'Cap nhat ho so thanh cong', profile: updated });
    } catch (err) {
        const status = err.message.includes('khong hop le') ? 422
            : err.code === '23505' ? 409
            : 400;
        const message = err.code === '23505'
            ? 'So dien thoai da duoc su dung boi tai khoan khac'
            : err.message;
        res.status(status).json({ error: message });
    }
};

const sendEmailChangeCode = async (req, res) => {
    try {
        const result = await profileService.sendEmailChangeCode(req.user.userId);
        res.json(result);
    } catch (err) {
        const status = err.retry_after_seconds ? 429 : 400;
        res.status(status).json({
            error: err.message,
            retry_after_seconds: err.retry_after_seconds || 0,
        });
    }
};

const verifyEmailChangeCode = async (req, res) => {
    try {
        const { code, newEmail } = req.body;
        const result = await profileService.verifyEmailChangeCode(req.user.userId, { code, newEmail });
        res.json(result);
    } catch (err) {
        const status = err.message.includes('ton tai') ? 409 : 400;
        res.status(status).json({ error: err.message });
    }
};

const updateAvatar = async (req, res) => {
    try {
        const avatarUrl = req.file?.path;
        if (!avatarUrl) return res.status(422).json({ error: 'Vui long chon anh dai dien' });

        const result = await profileService.updateAvatar(req.user.userId, avatarUrl);
        res.json({ message: 'Cap nhat anh dai dien thanh cong', avatar_url: result.avatar_url });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const result = await profileService.changePassword(req.user.userId, { currentPassword, newPassword });
        res.json(result);
    } catch (err) {
        const code = err.message.includes('khong dung') ? 401
            : err.message.includes('bat buoc') || err.message.includes('it nhat') ? 422
            : 400;
        res.status(code).json({ error: err.message });
    }
};

const registerDeviceToken = async (req, res) => {
    try {
        const { fcmToken, platform } = req.body;
        const result = await profileService.registerDeviceToken(req.user.userId, { fcmToken, platform });
        res.json(result);
    } catch (err) {
        res.status(422).json({ error: err.message });
    }
};

module.exports = {
    getMyProfile,
    updateMyProfile,
    sendEmailChangeCode,
    verifyEmailChangeCode,
    updateAvatar,
    changePassword,
    registerDeviceToken,
};
