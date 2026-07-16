const customerService = require('../services/customerService');

const sendError = (res, err) => {
    const code = err.message.includes('không tồn tại') ? 404
        : err.message.includes('đã được đăng ký') || err.message.includes('Không thể xóa') ? 409
        : err.message.includes('bắt buộc') || err.message.includes('không hợp lệ') ? 400
        : 500;
    res.status(code).json({ error: err.message });
};

const getAll = async (req, res) => {
    try {
        const { search, page, limit, type, sort } = req.query;
        const data = await customerService.listCustomers({ search, page, limit, type, sort });
        res.json(data);
    } catch (err) { sendError(res, err); }
};

const getOne = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!id) return res.status(400).json({ error: 'ID không hợp lệ' });
        const customer = await customerService.getCustomerById(id);
        res.json({ customer });
    } catch (err) { sendError(res, err); }
};

const create = async (req, res) => {
    try {
        const customer = await customerService.createCustomer(req.body);
        res.status(201).json({ message: 'Đã tạo khách hàng mới', customer });
    } catch (err) { sendError(res, err); }
};

const update = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!id) return res.status(400).json({ error: 'ID không hợp lệ' });
        const customer = await customerService.updateCustomer(id, req.body);
        res.json({ message: 'Đã cập nhật khách hàng', customer });
    } catch (err) { sendError(res, err); }
};

const remove = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!id) return res.status(400).json({ error: 'ID không hợp lệ' });
        await customerService.deleteCustomer(id);
        res.json({ message: 'Đã xóa khách hàng' });
    } catch (err) { sendError(res, err); }
};

module.exports = { getAll, getOne, create, update, remove };
