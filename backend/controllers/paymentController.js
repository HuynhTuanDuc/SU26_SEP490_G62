const paymentService = require('../services/paymentService');

// POST /api/trips/:id/payment  (multipart/form-data: receipt file + body: amount, notes)
const recordCashPayment = async (req, res) => {
    try {
        const shipmentId = Number(req.params.id);
        if (!shipmentId) return res.status(400).json({ error: 'Trip ID không hợp lệ' });

        const receiptUrl =
            req.files?.receipt?.[0]?.path ??
            req.files?.image?.[0]?.path   ??
            req.files?.photo?.[0]?.path   ??
            req.file?.path ??
            null;
        const { amount, notes } = req.body;

        if (!amount) return res.status(400).json({ error: 'Số tiền là bắt buộc' });

        const result = await paymentService.recordDriverCashPayment(
            req.user.userId, shipmentId, { amount, notes }, receiptUrl,
        );
        res.status(201).json({ message: 'Ghi nhận thanh toán thành công', ...result });
    } catch (err) {
        const code = err.message.includes('không có quyền') ? 403
            : err.message.includes('bắt buộc') ? 422
            : err.message.includes('không tồn tại') ? 404
            : 400;
        res.status(code).json({ error: err.message });
    }
};

// GET /api/trips/:id/payments
const getShipmentPayments = async (req, res) => {
    try {
        const shipmentId = Number(req.params.id);
        if (!shipmentId) return res.status(400).json({ error: 'Trip ID không hợp lệ' });

        const payments = await paymentService.getShipmentPayments(shipmentId, req.user.userId);
        res.json({ payments });
    } catch (err) {
        // Lỗi đã mang sẵn statusCode từ tầng dưới (vd requireMoney kiểm số tiền) thì
        // dùng thẳng. Suy mã HTTP từ nội dung câu tiếng Việt chỉ đúng với những câu
        // đã biết trước — thêm một câu mới là nó lặng lẽ rơi vào nhánh 500, và người
        // gõ thừa một số 0 sẽ tưởng hệ thống hỏng thay vì sửa lại con số.
        if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
        const code = err.message.includes('không có quyền') ? 403 : 500;
        res.status(code).json({ error: err.message });
    }
};

// GET /api/trips/:id/payment-summary
const getPaymentSummary = async (req, res) => {
    try {
        const shipmentId = Number(req.params.id);
        if (!shipmentId) return res.status(400).json({ error: 'ID không hợp lệ' });
        const data = await paymentService.getShipmentPaymentSummary(shipmentId, req.user.userId);
        if (!data) return res.status(404).json({ error: 'Chuyến không tồn tại' });
        res.json(data);
    } catch (err) {
        // Lỗi đã mang sẵn statusCode từ tầng dưới (vd requireMoney kiểm số tiền) thì
        // dùng thẳng. Suy mã HTTP từ nội dung câu tiếng Việt chỉ đúng với những câu
        // đã biết trước — thêm một câu mới là nó lặng lẽ rơi vào nhánh 500, và người
        // gõ thừa một số 0 sẽ tưởng hệ thống hỏng thay vì sửa lại con số.
        if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
        const code = err.message.includes('quyền') ? 403 : 500;
        res.status(code).json({ error: err.message });
    }
};

// PATCH /api/trips/:id/payments/:paymentId — sửa số tiền và/hoặc thay ảnh biên lai
const updatePayment = async (req, res) => {
    try {
        const shipmentId = Number(req.params.id);
        const paymentId  = Number(req.params.paymentId);
        if (!shipmentId || !paymentId) return res.status(400).json({ error: 'ID không hợp lệ' });

        const newReceiptUrl =
            req.files?.receipt?.[0]?.path ??
            req.files?.image?.[0]?.path   ??
            req.files?.photo?.[0]?.path   ??
            req.file?.path ??
            null;

        const { amount } = req.body;
        if (!amount) return res.status(400).json({ error: 'Số tiền là bắt buộc' });

        const result = await paymentService.updateCashPayment(
            req.user.userId, shipmentId, paymentId, { newAmount: amount, newReceiptUrl },
        );
        res.json({ message: 'Cập nhật ghi nhận thành công', ...result });
    } catch (err) {
        const code = err.message.includes('không có quyền') ? 403
            : err.message.includes('không tồn tại') ? 404
            : 400;
        res.status(code).json({ error: err.message });
    }
};

module.exports = { recordCashPayment, getShipmentPayments, getPaymentSummary, updatePayment };
