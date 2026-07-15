const accountantBankTransferService = require('../services/accountantBankTransferService');

const sendError = (res, err) => {
    const msg = err.message;
    const code = msg.includes('không tồn tại') || msg.includes('Không tìm thấy') ? 404
        : msg.includes('đã được xác nhận') ? 409
        : msg.includes('không hợp lệ') || msg.includes('không phải chuyển khoản') || msg.includes('Vui lòng nhập') ? 400
        : 500;
    res.status(code).json({ error: msg });
};

// GET /api/accountant/receipts/bank-transfer
const getPendingBankTransfers = async (req, res) => {
    try {
        const { page = 1, limit = 20, search = '' } = req.query;
        const data = await accountantBankTransferService.getPendingBankTransfers({ page, limit, search });
        res.json(data);
    } catch (err) {
        sendError(res, err);
    }
};

// POST /api/accountant/receipts/:receiptId/confirm-bank-transfer
const confirmBankTransfer = async (req, res) => {
    try {
        const receiptId = Number(req.params.receiptId);
        const { notes, actual_amount } = req.body;
        const result = await accountantBankTransferService.confirmBankTransfer(
            receiptId, req.user.userId, { notes, actual_amount },
        );
        res.json({ message: 'Đã xác nhận nhận tiền chuyển khoản thành công', ...result });
    } catch (err) {
        sendError(res, err);
    }
};

module.exports = { getPendingBankTransfers, confirmBankTransfer };
