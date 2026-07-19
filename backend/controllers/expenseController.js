const expenseService = require('../services/expenseService');
const { deleteUploadedFile } = require('../services/expenseAiValidator');

// POST /api/expenses
// Driver tạo chi phí: lưu thẳng (status = pending), KHÔNG chạy AI đọc bill ở bước này.
// AI đọc bill chỉ chạy trên web coordinator khi duyệt phiếu thu (scanReceiptExpenses).
const createExpense = async (req, res) => {
    const receiptUrl  = req.file?.path     ?? null;
    const filePublicId = req.file?.filename ?? null;

    try {
        const { shipmentId, expenseType, amount, description } = req.body;

        if (!shipmentId) return res.status(400).json({ error: 'shipmentId là bắt buộc' });

        const expenses = await expenseService.createExpense(req.user.userId, {
            shipmentId: Number(shipmentId),
            expenseType,
            amount,
            description,
            receiptUrl,
        });

        res.status(201).json({ expenses });
    } catch (err) {
        // Lưu DB lỗi → xóa ảnh đã upload tránh orphan trên Cloudinary
        deleteUploadedFile(filePublicId);

        const status = err.message.includes('không tồn tại') ? 404
            : err.message.includes('quyền') ? 403
            : err.message.includes('bắt buộc') || err.message.includes('không hợp lệ') || err.message.includes('lớn hơn') ? 400
            : err.message.includes('đã kết thúc') ? 422
            : 500;
        res.status(status).json({ error: err.message });
    }
};

// GET /api/expenses/shipment/:shipmentId
const getShipmentExpenses = async (req, res) => {
    try {
        const shipmentId = Number(req.params.shipmentId);
        if (!shipmentId) return res.status(400).json({ error: 'shipmentId không hợp lệ' });

        const expenses = await expenseService.getShipmentExpenses(shipmentId, req.user.userId);
        res.json({ expenses });
    } catch (err) {
        const status = err.message.includes('không tồn tại') ? 404
            : err.message.includes('quyền') ? 403
            : 500;
        res.status(status).json({ error: err.message });
    }
};

// PATCH /api/expenses/:id
const updateExpense = async (req, res) => {
    try {
        const expenseId = Number(req.params.id);
        if (!expenseId) return res.status(400).json({ error: 'ID chi phí không hợp lệ' });
        const { expense_type, amount, description } = req.body;
        const fileUrl = req.file?.path ?? null;
        await expenseService.updateExpense(req.user.userId, expenseId, {
            expenseType: expense_type ?? null,
            amount: amount ? Number(amount) : undefined,
            description: description ?? null,
            fileUrl,
        });
        res.json({ message: 'Đã cập nhật chi phí' });
    } catch (err) {
        const status = err.message.includes('quyền') || err.message.includes('từ chối') ? 403
            : err.message.includes('không hợp lệ') || err.message.includes('lớn hơn') ? 400
            : 500;
        res.status(status).json({ error: err.message });
    }
};

// DELETE /api/expenses/:id
const deleteExpense = async (req, res) => {
    try {
        const expenseId = Number(req.params.id);
        if (!expenseId) return res.status(400).json({ error: 'ID chi phí không hợp lệ' });
        await expenseService.deleteExpense(req.user.userId, expenseId);
        res.json({ message: 'Đã xoá chi phí' });
    } catch (err) {
        const status = err.message.includes('từ chối') ? 403 : 500;
        res.status(status).json({ error: err.message });
    }
};

module.exports = { createExpense, getShipmentExpenses, updateExpense, deleteExpense };
