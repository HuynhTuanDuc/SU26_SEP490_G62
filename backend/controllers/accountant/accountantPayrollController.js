const accountantPayrollRepository = require('../../repositories/accountant/accountantPayrollRepository');
const { posInt, enumVal, validMonth, validYear, sendError, err400 } = require('./_validate');

const ADVANCE_STATUSES = ['pending', 'approved', 'disbursed', 'rejected'];
const PAYROLL_STATUSES = ['draft', 'confirmed', 'paid'];

const currentPeriod = () => {
    const now = new Date();
    return { month: now.getMonth() + 1, year: now.getFullYear() };
};

// ── GET /accountant/payroll ──────────────────────────────────────────────────
const getPayrolls = async (req, res) => {
    try {
        const { status, search } = req.query;
        enumVal(status, PAYROLL_STATUSES, 'Trạng thái bảng lương');

        const cp    = currentPeriod();
        const month = req.query.month ? validMonth(req.query.month) : cp.month;
        const year  = req.query.year  ? validYear(req.query.year)   : cp.year;

        const [rows, stats] = await Promise.all([
            accountantPayrollRepository.getAllPayrolls({
                month, year,
                status: status || null,
                search: search?.trim() || null,
            }),
            accountantPayrollRepository.getPayrollStats({ month, year }),
        ]);

        res.json({ payrolls: rows, stats, month, year });
    } catch (err) {
        sendError(res, err);
    }
};

// ── POST /accountant/payroll/generate ────────────────────────────────────────
const generatePayrolls = async (req, res) => {
    try {
        const cp    = currentPeriod();
        const month = req.body.month ? validMonth(req.body.month) : cp.month;
        const year  = req.body.year  ? validYear(req.body.year)   : cp.year;

        const future = new Date(year, month - 1, 1);
        if (future > new Date())
            throw err400('Không thể tạo bảng lương cho tháng trong tương lai.');

        const result = await accountantPayrollRepository.calculateAndUpsertPayrolls(month, year);
        res.json({
            message: `Đã tạo/cập nhật bảng lương tháng ${month}/${year}.`,
            ...result,
        });
    } catch (err) {
        sendError(res, err);
    }
};

// ── PATCH /accountant/payroll/:id/confirm ────────────────────────────────────
const confirmPayroll = async (req, res) => {
    try {
        const payrollId = posInt(req.params.id, 'Mã bảng lương');
        const row = await accountantPayrollRepository.confirmPayroll(payrollId, req.user.userId);
        res.json({ message: 'Xác nhận bảng lương thành công.', payroll: row });
    } catch (err) {
        if (!err.status) err.status = err.message.includes('Không tìm thấy') ? 404 : 400;
        sendError(res, err);
    }
};

// ── PATCH /accountant/payroll/:id/pay ────────────────────────────────────────
const markPayrollPaid = async (req, res) => {
    try {
        const payrollId = posInt(req.params.id, 'Mã bảng lương');
        const row = await accountantPayrollRepository.markPayrollPaid(payrollId, req.user.userId);
        res.json({ message: 'Đã đánh dấu đã thanh toán lương.', payroll: row });
    } catch (err) {
        if (!err.status) err.status = err.message.includes('Không tìm thấy') ? 404 : 400;
        sendError(res, err);
    }
};

// ── GET /accountant/payroll/advances ─────────────────────────────────────────
const getSalaryAdvances = async (req, res) => {
    try {
        const { status, search } = req.query;
        enumVal(status, ADVANCE_STATUSES, 'Trạng thái ứng lương');

        const month = req.query.month ? validMonth(req.query.month) : null;
        const year  = req.query.year  ? validYear(req.query.year)   : null;

        if (month && !year)
            throw err400('Vui lòng cung cấp năm khi lọc theo tháng.');

        const rows = await accountantPayrollRepository.getSalaryAdvances({
            status: status || null,
            month,
            year,
            search: search?.trim() || null,
        });

        res.json({ advances: rows });
    } catch (err) {
        sendError(res, err);
    }
};

// ── PATCH /accountant/payroll/advances/:id/disburse ──────────────────────────
const disburseAdvance = async (req, res) => {
    try {
        const advanceId = posInt(req.params.id, 'Mã ứng lương');
        const notes = req.body?.notes?.trim() || null;

        if (notes && notes.length > 500)
            throw err400('Ghi chú không được vượt quá 500 ký tự.');

        const row = await accountantPayrollRepository.disburseAdvance(
            advanceId, req.user.userId, { notes },
        );

        res.json({ message: 'Giải ngân ứng lương thành công.', advance: row });
    } catch (err) {
        if (!err.status) err.status = err.message.includes('Không tìm thấy') ? 404 : 400;
        sendError(res, err);
    }
};

module.exports = {
    getPayrolls,
    generatePayrolls,
    confirmPayroll,
    markPayrollPaid,
    getSalaryAdvances,
    disburseAdvance,
};
