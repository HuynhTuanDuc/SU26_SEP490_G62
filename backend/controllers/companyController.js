const companyService = require('../services/companyService');

// GET /api/company/info — tất cả user đã đăng nhập (driver cần lấy QR)
const getCompanyInfo = async (req, res) => {
    try {
        const info = await companyService.getCompanyInfo();
        res.json({ info: info ?? {} });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// PUT /api/company/info — manager only
const updateCompanyInfo = async (req, res) => {
    try {
        const { company_name, hotline, bank_name, bank_account_number, bank_account_name } = req.body;
        const info = await companyService.updateCompanyInfo(
            { companyName: company_name, hotline, bankName: bank_name, bankAccountNumber: bank_account_number, bankAccountName: bank_account_name },
            req.user.userId,
        );
        res.json({ info });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// POST /api/company/bank-qr — manager only
const uploadBankQr = async (req, res) => {
    try {
        const fileUrl = req.file?.path ?? null;
        if (!fileUrl) return res.status(422).json({ error: 'Vui lòng chọn ảnh QR' });
        const info = await companyService.uploadBankQr(fileUrl, req.user.userId);
        res.json({ info });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

module.exports = { getCompanyInfo, updateCompanyInfo, uploadBankQr };
