const orderService = require('../services/orderService');
const { parsePaginationQuery } = require('../utils/pagination');

const listOrders = async (req, res) => {
    try {
        const { page, limit } = parsePaginationQuery(req.query, { defaultLimit: 10, maxLimit: 100 });
        const result = await orderService.listOrders({
            page,
            limit,
            search: req.query.search || '',
            status: req.query.status || '',
        });
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

const importOrders = async (req, res) => {
    try {
        if (!req.file?.buffer) {
            return res.status(400).json({ error: 'Vui lòng upload file Excel' });
        }

        const result = await orderService.importOrdersFromExcel(req.user.userId, req.file.buffer);
        res.status(201).json({
            message: `Đã import ${result.length} đơn hàng từ Excel`,
            imported: result.length,
            orders: result,
        });
    } catch (err) {
        res.status(422).json({ error: err.message });
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

        const updatedOrder = await orderService.updateOrder(orderId, req.body);
        if (!updatedOrder) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });

        res.json({ message: 'Cập nhật đơn hàng thành công', order: updatedOrder });
    } catch (err) {
        res.status(422).json({ error: err.message });
    }
};

module.exports = { createOrder, listOrders, importOrders, updateOrder };
