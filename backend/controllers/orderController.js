const orderService = require('../services/orderService');
const { money } = require('../utils/formatNumber');

const listOrders = async (req, res) => {
    try {
        const result = await orderService.listOrders(req.query);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

const createOrder = async (req, res) => {
    try {
        const result = await orderService.createOrder(req.user.userId, req.body);
        res.status(201).json({
            message: 'Tạo đơn hàng thành công',
            ...result,
        });
    } catch (err) {
        // Lỗi đã mang sẵn mã HTTP từ tầng dưới (vd requireMoney kiểm số tiền) thì dùng
        // thẳng — đoán mã bằng cách dò chữ trong câu tiếng Việt chỉ đúng với câu đã biết.
        const known = err.statusCode || err.status;
        if (known) return res.status(known).json({ error: err.message });
        const status = err.message.includes('Thiếu') ? 400 : 422;
        res.status(status).json({ error: err.message });
    }
};

const updateOrder = async (req, res) => {
    try {
        const orderId = Number(req.params.id);
        if (!orderId) return res.status(400).json({ error: 'Order ID không hợp lệ' });

        const updatedOrder = await orderService.updateOrder(orderId, {
            ...req.body,
            updated_by: req.user?.userId ?? null,
        });
        if (!updatedOrder) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });

        res.json({ message: 'Cập nhật đơn hàng thành công', order: updatedOrder });
    } catch (err) {
        // Lỗi đã mang sẵn mã HTTP từ tầng dưới (vd requireMoney kiểm số tiền) thì dùng
        // thẳng — đoán mã bằng cách dò chữ trong câu tiếng Việt chỉ đúng với câu đã biết.
        const known = err.statusCode || err.status;
        if (known) return res.status(known).json({ error: err.message });
        res.status(422).json({ error: err.message });
    }
};

const cancelOrder = async (req, res) => {
    try {
        const orderId = Number(req.params.id);
        if (!orderId) return res.status(400).json({ error: 'Order ID không hợp lệ' });

        const cancelledOrder = await orderService.cancelOrder(orderId, req.body?.reason, req.user?.userId ?? null);
        if (!cancelledOrder) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });

        const message = cancelledOrder.refund
            ? `Đã hủy đơn. Tạo phiếu hoàn ${money(Number(cancelledOrder.refund.amount))} cho khách, chờ Kế toán chi.`
            : 'Hủy đơn hàng thành công';
        res.json({ message, order: cancelledOrder });
    } catch (err) {
        // Lỗi đã mang sẵn mã HTTP từ tầng dưới (vd requireMoney kiểm số tiền) thì dùng
        // thẳng — đoán mã bằng cách dò chữ trong câu tiếng Việt chỉ đúng với câu đã biết.
        const known = err.statusCode || err.status;
        if (known) return res.status(known).json({ error: err.message });
        res.status(422).json({ error: err.message });
    }
};

// POST /orders/import — coordinator/manager import đơn hàng loạt từ file Excel chấm công
const importOrders = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Thiếu file Excel (field "file")' });
        const orders = await orderService.importOrdersFromExcel(req.user.userId, req.file.buffer);
        res.status(201).json({ message: `Import thành công ${orders.length} đơn hàng`, orders });
    } catch (err) {
        // Lỗi đã mang sẵn mã HTTP từ tầng dưới (vd requireMoney kiểm số tiền) thì dùng
        // thẳng — đoán mã bằng cách dò chữ trong câu tiếng Việt chỉ đúng với câu đã biết.
        const known = err.statusCode || err.status;
        if (known) return res.status(known).json({ error: err.message });
        res.status(422).json({ error: err.message });
    }
};

// Gợi ý "khách cũ" theo phần đầu SĐT (gõ nửa chừng) ở form tạo đơn.
const customerByPhone = async (req, res) => {
    try {
        const phone = req.query.phone?.trim();
        if (!phone) return res.json({ customers: [] });
        const customers = await orderService.searchCustomersByPhone(phone);
        res.json({ customers });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// GET /orders/prepaid/pending — danh sách đơn có tiền trả trước đang chờ xác nhận
const listPendingPrepaid = async (req, res) => {
    try {
        const orders = await orderService.listPendingPrepaid();
        res.json({ orders });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// PATCH /orders/:id/prepaid/confirm — xác nhận tiền trả trước đã thực về (chọn kênh + chứng từ)
const confirmPrepaid = async (req, res) => {
    try {
        const orderId = Number(req.params.id);
        if (!orderId) return res.status(400).json({ error: 'Order ID không hợp lệ' });

        const paymentMethod = ['cash', 'bank_transfer'].includes(req.body?.payment_method)
            ? req.body.payment_method : null;
        if (!paymentMethod) return res.status(400).json({ error: 'Thiếu hình thức nhận tiền (payment_method)' });
        if (!req.file) return res.status(400).json({ error: 'Thiếu ảnh chứng từ (field "proof")' });

        const order = await orderService.confirmPrepaid(orderId, req.user.userId, {
            paymentMethod,
            proofUrl: req.file.path,
        });
        if (!order) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
        res.json({ message: 'Đã xác nhận tiền trả trước', order });
    } catch (err) {
        // Lỗi đã mang sẵn mã HTTP từ tầng dưới (vd requireMoney kiểm số tiền) thì dùng
        // thẳng — đoán mã bằng cách dò chữ trong câu tiếng Việt chỉ đúng với câu đã biết.
        const known = err.statusCode || err.status;
        if (known) return res.status(known).json({ error: err.message });
        res.status(422).json({ error: err.message });
    }
};

// PATCH /orders/:id/prepaid/reject — tiền trả trước KHÔNG về, hủy khoản chờ (không ghi sổ)
const rejectPrepaid = async (req, res) => {
    try {
        const orderId = Number(req.params.id);
        if (!orderId) return res.status(400).json({ error: 'Order ID không hợp lệ' });

        const order = await orderService.rejectPrepaid(orderId, req.user?.userId ?? null);
        if (!order) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
        res.json({ message: 'Đã hủy khoản trả trước (chưa ghi sổ)', order });
    } catch (err) {
        // Lỗi đã mang sẵn mã HTTP từ tầng dưới (vd requireMoney kiểm số tiền) thì dùng
        // thẳng — đoán mã bằng cách dò chữ trong câu tiếng Việt chỉ đúng với câu đã biết.
        const known = err.statusCode || err.status;
        if (known) return res.status(known).json({ error: err.message });
        res.status(422).json({ error: err.message });
    }
};

module.exports = {
    createOrder, listOrders, updateOrder, cancelOrder, importOrders, customerByPhone,
    listPendingPrepaid, confirmPrepaid, rejectPrepaid,
};
