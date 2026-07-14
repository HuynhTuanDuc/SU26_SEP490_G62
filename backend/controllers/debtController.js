const debtService = require('../services/debtService');

// GET /api/debts/me?status=unpaid
const getMyDebts = async (req, res) => {
    try {
        const { status } = req.query;
        const data = await debtService.getMyDebts(req.user.userId, { status });
        res.json({ debts: data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// GET /api/debts/summary
const getMyDebtSummary = async (req, res) => {
    try {
        const data = await debtService.getMyDebtSummary(req.user.userId);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// GET /api/debts/:id/payments
const getDebtPayments = async (req, res) => {
    try {
        const debtId = Number(req.params.id);
        if (!debtId) return res.status(400).json({ error: 'Debt ID không hợp lệ' });
        const data = await debtService.getDebtPayments(req.user.userId, debtId);
        res.json({ payments: data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// POST /api/debts/:id/repayments  (multipart: receipt file)
const submitRepayment = async (req, res) => {
    try {
        const debtId = Number(req.params.id);
        if (!debtId) return res.status(400).json({ error: 'Debt ID không hợp lệ' });
        const receiptUrl = req.file?.path ?? null;
        const { amount, paymentMethod, notes } = req.body;
        if (!amount) return res.status(400).json({ error: 'Số tiền là bắt buộc' });
        const data = await debtService.submitRepayment(
            req.user.userId, debtId, { amount, paymentMethod, notes }, receiptUrl,
        );
        res.status(201).json({ message: 'Đã gửi yêu cầu nộp tiền. Đang chờ kế toán xác nhận.', payment: data });
    } catch (err) {
        const code = err.message.includes('quyền') ? 403
            : err.message.includes('bắt buộc') ? 422
            : err.message.includes('không tìm') ? 404
            : 400;
        res.status(code).json({ error: err.message });
    }
};

// DELETE /api/debts/repayments/:paymentId
const cancelRepayment = async (req, res) => {
    try {
        const paymentId = Number(req.params.paymentId);
        if (!paymentId) return res.status(400).json({ error: 'Payment ID không hợp lệ' });
        await debtService.cancelRepayment(req.user.userId, paymentId);
        res.json({ message: 'Đã huỷ yêu cầu nộp tiền' });
    } catch (err) {
        const code = err.message.includes('quyền') ? 403
            : err.message.includes('Không tìm') ? 404
            : 400;
        res.status(code).json({ error: err.message });
    }
};

// PATCH /api/debts/repayments/:paymentId/confirm  (accountant/manager)
const confirmRepayment = async (req, res) => {
    try {
        const paymentId = Number(req.params.paymentId);
        if (!paymentId) return res.status(400).json({ error: 'Payment ID không hợp lệ' });
        const result = await debtService.confirmRepayment(paymentId, req.user.userId);
        res.json({ message: 'Đã xác nhận thanh toán', ...result });
    } catch (err) {
        const code = err.message.includes('không tìm') || err.message.includes('Không tìm') ? 404
            : err.message.includes('đã được xử lý') ? 409
            : 400;
        res.status(code).json({ error: err.message });
    }
};

// PATCH /api/debts/repayments/:paymentId/reject  (accountant/manager)
const rejectRepayment = async (req, res) => {
    try {
        const paymentId = Number(req.params.paymentId);
        if (!paymentId) return res.status(400).json({ error: 'Payment ID không hợp lệ' });
        const { reason } = req.body;
        await debtService.rejectRepayment(paymentId, req.user.userId, reason);
        res.json({ message: 'Đã từ chối yêu cầu nộp tiền' });
    } catch (err) {
        const code = err.message.includes('Không tìm') ? 404
            : err.message.includes('đã được xử lý') ? 409
            : 400;
        res.status(code).json({ error: err.message });
    }
};

// PATCH /api/debts/repayments/:paymentId/void  (accountant/manager — hủy xác nhận khoản đã confirmed)
const voidRepayment = async (req, res) => {
    try {
        const paymentId = Number(req.params.paymentId);
        if (!paymentId) return res.status(400).json({ error: 'Payment ID không hợp lệ' });
        const { reason } = req.body;
        const result = await debtService.voidRepayment(paymentId, req.user.userId, reason);
        res.json({ message: 'Đã hủy xác nhận khoản thanh toán — công nợ hồi phục, bút toán đảo đã ghi sổ', ...result });
    } catch (err) {
        const code = err.message.includes('Không tìm thấy') ? 404
            : err.message.includes('Chỉ hủy') || err.message.includes('đã được xử lý') ? 409
            : 400;
        res.status(code).json({ error: err.message });
    }
};

// GET /api/debts/repayments/pending  (accountant/manager — xem tất cả yêu cầu pending)
const getPendingRepayments = async (req, res) => {
    try {
        const data = await debtService.getPendingRepayments();
        res.json({ repayments: data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

module.exports = {
    getMyDebts, getMyDebtSummary, getDebtPayments,
    submitRepayment, cancelRepayment,
    confirmRepayment, rejectRepayment, voidRepayment, getPendingRepayments,
};
