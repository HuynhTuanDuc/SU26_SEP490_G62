const accountantPayrollRepository = require('../../repositories/accountant/accountantPayrollRepository');

const parseIntParam = (val, name) => {
    const n = Number(val);
    if (!val || !Number.isInteger(n) || n <= 0) throw new Error(`${name} không hợp lệ`);
    return n;
};

const currentPeriod = () => {
    const now = new Date();
    return { month: now.getMonth() + 1, year: now.getFullYear() };
};

// GET /accountant/payroll?month=&year=&status=&search=
const getPayrolls = async (req, res) => {
    try {
        const { status, search } = req.query;
        const month = req.query.month ? Number(req.query.month) : currentPeriod().month;
        const year  = req.query.year  ? Number(req.query.year)  : currentPeriod().year;

        const [rows, stats] = await Promise.all([
            accountantPayrollRepository.getAllPayrolls({ month, year, status: status || null, search: search || null }),
            accountantPayrollRepository.getPayrollStats({ month, year }),
        ]);

        res.json({ payrolls: rows, stats, month, year });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// POST /accountant/payroll/generate  body: { month, year }
const generatePayrolls = async (req, res) => {
    try {
        const month = req.body.month ? Number(req.body.month) : currentPeriod().month;
        const year  = req.body.year  ? Number(req.body.year)  : currentPeriod().year;

        if (month < 1 || month > 12) return res.status(400).json({ error: 'Tháng không hợp lệ (1-12)' });
        if (year < 2020)             return res.status(400).json({ error: 'Năm không hợp lệ' });

        const result = await accountantPayrollRepository.calculateAndUpsertPayrolls(month, year);
        res.json({ message: `Đã tạo/cập nhật bảng lương tháng ${month}/${year}`, ...result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// PATCH /accountant/payroll/:id/confirm
const confirmPayroll = async (req, res) => {
    try {
        const payrollId = parseIntParam(req.params.id, 'Payroll ID');
        const row = await accountantPayrollRepository.confirmPayroll(payrollId, req.user.userId);
        res.json({ message: 'Đã xác nhận phiếu lương', payroll: row });
    } catch (err) {
        const code = err.message.includes('Không tìm thấy') ? 404 : 400;
        res.status(code).json({ error: err.message });
    }
};

// PATCH /accountant/payroll/:id/pay
const markPayrollPaid = async (req, res) => {
    try {
        const payrollId = parseIntParam(req.params.id, 'Payroll ID');
        const row = await accountantPayrollRepository.markPayrollPaid(payrollId, req.user.userId);
        res.json({ message: 'Đã đánh dấu đã trả lương', payroll: row });
    } catch (err) {
        const code = err.message.includes('Không tìm thấy') ? 404 : 400;
        res.status(code).json({ error: err.message });
    }
};

// GET /accountant/salary-advances?status=&month=&year=&search=
const getSalaryAdvances = async (req, res) => {
    try {
        const { status, search } = req.query;
        const month = req.query.month ? Number(req.query.month) : null;
        const year  = req.query.year  ? Number(req.query.year)  : null;

        const rows = await accountantPayrollRepository.getSalaryAdvances({
            status: status || null,
            month,
            year,
            search: search || null,
        });

        res.json({ advances: rows });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// PATCH /accountant/salary-advances/:id/disburse  body: { notes }
const disburseAdvance = async (req, res) => {
    try {
        const advanceId = parseIntParam(req.params.id, 'Advance ID');
        const { notes } = req.body ?? {};

        const row = await accountantPayrollRepository.disburseAdvance(
            advanceId,
            req.user.userId,
            { notes: notes?.trim() || null },
        );

        res.json({ message: 'Đã giải ngân ứng lương', advance: row });
    } catch (err) {
        const code = err.message.includes('Không tìm thấy') ? 404 : 400;
        res.status(code).json({ error: err.message });
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
