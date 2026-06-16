const express = require('express');
const router  = express.Router();

const { verifyToken, requireRole }  = require('../middleware/authMiddleware');
const { uploadCompanyQr }           = require('../middleware/uploadMiddleware');
const companyController             = require('../controllers/companyController');

const managerOnly = [verifyToken, requireRole('manager', 'admin')];

function handleUpload(middleware) {
    return (req, res, next) => {
        middleware(req, res, (err) => {
            if (err) return res.status(422).json({ error: err.message });
            next();
        });
    };
}

// Mọi user đã đăng nhập đều đọc được (driver cần QR để show khách)
router.get('/info', verifyToken, companyController.getCompanyInfo);

// Chỉ manager cập nhật
router.put('/info', managerOnly, companyController.updateCompanyInfo);

// Upload ảnh QR ngân hàng
router.post(
    '/bank-qr',
    managerOnly,
    handleUpload(uploadCompanyQr.single('qr')),
    companyController.uploadBankQr,
);

module.exports = router;
