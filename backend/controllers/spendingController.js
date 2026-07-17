const spendingService = require('../services/spendingService');

const parseId = (value, label) => {
    const parsed = Number(value);
    if (!parsed) {
        const error = new Error(`${label} không hợp lệ`);
        error.statusCode = 400;
        throw error;
    }
    return parsed;
};

const sendError = (res, err, defaultStatus = 500) => {
    const status = err.statusCode
        || (String(err.message || '').includes('Không tìm thấy') ? 404 : null)
        || (String(err.message || '').includes('đã được xử lý') ? 409 : null)
        || (String(err.message || '').includes('không hợp lệ') ? 400 : null)
        || (String(err.message || '').includes('Cần ghi rõ') ? 400 : null)
        || (String(err.message || '').includes('phải lớn hơn') ? 400 : null)
        || defaultStatus;
    res.status(status).json({ error: err.message });
};

// ─── Chi phí tài xế ───────────────────────────────────────────────────────────

const listExpenses = async (req, res) => {
    try {
        const { status, expense_type, month, year, search, sort, page, limit } = req.query;
        const [result, stats] = await Promise.all([
            spendingService.listExpenses({
                status: status || null,
                expenseType: expense_type || null,
                month: month || null,
                year: year || null,
                search: search || '',
                sort: sort || null,
                page, limit,
            }),
            spendingService.getExpenseStats({ month: month || null, year: year || null }),
        ]);
        res.json({ ...result, stats });
    } catch (err) {
        sendError(res, err);
    }
};

// ─── Phiếu chi ────────────────────────────────────────────────────────────────

const listVouchers = async (req, res) => {
    try {
        const { status, voucher_type, month, year, search, sort, page, limit } = req.query;
        const [result, stats] = await Promise.all([
            spendingService.listVouchers({
                status: status || null,
                voucherType: voucher_type || null,
                month: month || null,
                year: year || null,
                search: search || '',
                sort: sort || null,
                page, limit,
            }),
            spendingService.getVoucherStats({ month: month || null, year: year || null }),
        ]);
        res.json({ ...result, stats });
    } catch (err) {
        sendError(res, err);
    }
};

const createVoucher = async (req, res) => {
    try {
        const voucher = await spendingService.createVoucher({
            ...req.body,
            proof_url: req.file?.path ?? null,
        }, req.user.userId);
        res.status(201).json({ message: 'Đã tạo phiếu chi, chờ Manager duyệt', voucher });
    } catch (err) {
        sendError(res, err);
    }
};

const approveVoucher = async (req, res) => {
    try {
        const id = parseId(req.params.id, 'Voucher ID');
        const voucher = await spendingService.approveVoucher(id, req.user.userId);
        res.json({ message: 'Đã duyệt phiếu chi', voucher });
    } catch (err) {
        sendError(res, err);
    }
};

const rejectVoucher = async (req, res) => {
    try {
        const id = parseId(req.params.id, 'Voucher ID');
        const voucher = await spendingService.rejectVoucher(id, req.user.userId, req.body?.reason);
        res.json({ message: 'Đã từ chối phiếu chi', voucher });
    } catch (err) {
        sendError(res, err);
    }
};

const payVoucher = async (req, res) => {
    try {
        const id = parseId(req.params.id, 'Voucher ID');
        const voucher = await spendingService.payVoucher(id, req.user.userId);
        res.json({ message: 'Đã xác nhận chi tiền và ghi sổ tài chính', voucher });
    } catch (err) {
        sendError(res, err);
    }
};

// ─── Tổng hợp chi ─────────────────────────────────────────────────────────────

const getSpendingSummary = async (req, res) => {
    try {
        const summary = await spendingService.getSpendingSummary({
            month: req.query.month,
            year: req.query.year,
        });
        res.json(summary);
    } catch (err) {
        sendError(res, err);
    }
};

module.exports = {
    listExpenses,
    listVouchers,
    createVoucher,
    approveVoucher,
    rejectVoucher,
    payVoucher,
    getSpendingSummary,
};
