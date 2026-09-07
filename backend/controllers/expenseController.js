const expenseService = require('../services/expenseService');
const { deleteUploadedFile } = require('../services/uploadCleanup');

// POST /api/expenses
// Driver tạo chi phí: lưu thẳng (status = pending), KHÔNG chạy AI đọc bill ở bước này.
// AI đọc bill chỉ chạy trên web coordinator khi duyệt phiếu thu (scanReceiptExpenses).
const createExpense = async (req, res) => {
    const receiptUrl  = req.file?.path     ?? null;
    const filePublicId = req.file?.filename ?? null;

    try {
        const { shipmentId, expenseType, amount, description, clientRequestId } = req.body;

        if (!shipmentId) return res.status(400).json({ error: 'shipmentId là bắt buộc' });

        const expenses = await expenseService.createExpense(req.user.userId, {
            shipmentId: Number(shipmentId),
            expenseType,
            amount,
            description,
            receiptUrl,
            clientRequestId,
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
        // Lỗi đã mang sẵn statusCode từ tầng dưới (vd requireMoney kiểm số tiền) thì
        // dùng thẳng. Suy mã HTTP từ nội dung câu tiếng Việt chỉ đúng với những câu
        // đã biết trước — thêm một câu mới là nó lặng lẽ rơi vào nhánh 500, và người
        // gõ thừa một số 0 sẽ tưởng hệ thống hỏng thay vì sửa lại con số.
        if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
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
            // KHÔNG Number() ở đây: service đã có requireMoney, mà `Number("500.000")`
            // ra 500 thì requireMoney nhận 500 và thấy hoàn toàn hợp lệ. Chuyển đổi
            // sớm ở controller làm vô hiệu chính lớp kiểm đặt ở dưới — đưa nguyên
            // chuỗi người dùng gõ xuống, chỉ dịch "không gửi trường này" thành undefined.
            amount: (amount === undefined || amount === null || amount === '') ? undefined : amount,
            description: description ?? null,
            fileUrl,
        });
        res.json({ message: 'Đã cập nhật chi phí' });
    } catch (err) {
        // Lỗi đã mang sẵn statusCode từ tầng dưới (vd requireMoney kiểm số tiền) thì
        // dùng thẳng. Suy mã HTTP từ nội dung câu tiếng Việt chỉ đúng với những câu
        // đã biết trước — thêm một câu mới là nó lặng lẽ rơi vào nhánh 500, và người
        // gõ thừa một số 0 sẽ tưởng hệ thống hỏng thay vì sửa lại con số.
        if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
        // 409: trạng thái chi phí/phiếu thu không cho sửa (không phải thiếu quyền)
        const status = err.message.includes('Không sửa/xoá được') ? 409
            : err.message.includes('quyền') ? 403
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
        // Lỗi đã mang sẵn statusCode từ tầng dưới (vd requireMoney kiểm số tiền) thì
        // dùng thẳng. Suy mã HTTP từ nội dung câu tiếng Việt chỉ đúng với những câu
        // đã biết trước — thêm một câu mới là nó lặng lẽ rơi vào nhánh 500, và người
        // gõ thừa một số 0 sẽ tưởng hệ thống hỏng thay vì sửa lại con số.
        if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
        const status = err.message.includes('Không sửa/xoá được') ? 409 : 500;
        res.status(status).json({ error: err.message });
    }
};

module.exports = { createExpense, getShipmentExpenses, updateExpense, deleteExpense };
