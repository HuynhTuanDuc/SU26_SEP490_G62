const express = require('express');
const router  = express.Router();

const { verifyToken, requireRole }  = require('../middleware/authMiddleware');
const { uploadCompanyQr }           = require('../middleware/uploadMiddleware');
const companyController             = require('../controllers/companyController');
const { handleUpload } = require('../middleware/handleUpload');

const managerOnly = [verifyToken, requireRole('manager', 'admin')];

// Mọi user đã đăng nhập đều đọc được (driver cần QR để show khách)
router.get('/info', verifyToken, companyController.getCompanyInfo);

// Chỉ manager cập nhật
router.put('/info', managerOnly, companyController.updateCompanyInfo);

// Chỉ manager upload ảnh QR ngân hàng
router.post('/bank-qr', managerOnly, handleUpload(uploadCompanyQr.single('qr')), companyController.uploadBankQr);

module.exports = router;
