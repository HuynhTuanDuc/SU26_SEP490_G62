const orderService = require('../services/orderService');

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
        res.status(422).json({ error: err.message });
    }
};

const cancelOrder = async (req, res) => {
    try {
        const orderId = Number(req.params.id);
        if (!orderId) return res.status(400).json({ error: 'Order ID không hợp lệ' });

        const cancelledOrder = await orderService.cancelOrder(orderId, req.body?.reason);
        if (!cancelledOrder) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });

        res.json({ message: 'Hủy đơn hàng thành công', order: cancelledOrder });
    } catch (err) {
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
        res.status(422).json({ error: err.message });
    }
};

module.exports = { createOrder, listOrders, updateOrder, cancelOrder, importOrders };
