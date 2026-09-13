const collectOnBehalfService = require('../services/collectOnBehalfService');
const { sendError } = require('../utils/accountantValidate');

// GET /accountant/collect-on-behalf?search=
// Các đơn công ty còn đang giữ tiền thu hộ của người bán.
const list = async (req, res) => {
    try {
        const data = await collectOnBehalfService.listOutstanding({ search: req.query.search });
        res.json(data);
    } catch (err) { sendError(res, err); }
};

// GET /accountant/collect-on-behalf/:orderId
const detail = async (req, res) => {
    try {
        const orderId = Number(req.params.orderId);
        if (!orderId) return res.status(400).json({ error: 'Mã đơn hàng không hợp lệ' });
        res.json(await collectOnBehalfService.getOrderDetail(orderId));
    } catch (err) { sendError(res, err); }
};

// POST /accountant/collect-on-behalf/:orderId/return
// Body: { amount?, payee?, notes?, paymentMethod? } — bỏ trống amount là trả hết.
const createReturn = async (req, res) => {
    try {
        const result = await collectOnBehalfService.createReturnVoucher(
            req.params.orderId, req.body || {}, req.user.userId,
        );
        res.status(201).json({
            message: `Đã lập phiếu chi #${result.voucher.id} trả tiền thu hộ. `
                + 'Vào Quản lý chi để xác nhận đã chi và đính chứng từ.',
            ...result,
        });
    } catch (err) { sendError(res, err); }
};

module.exports = { list, detail, createReturn };
