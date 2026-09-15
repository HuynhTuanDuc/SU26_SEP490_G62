const accountantPayrollRepository = require('../repositories/accountantPayrollRepository');
const { posInt, enumVal, validMonth, validYear, sendError, err400 } = require('../utils/accountantValidate');
const notificationService = require('../services/notificationService');

const ADVANCE_STATUSES = ['pending', 'approved', 'rejected', 'paid'];
const PAYROLL_STATUSES = ['pending', 'reviewed', 'approved', 'paid'];

const currentPeriod = () => {
    const now = new Date();
    return { month: now.getMonth() + 1, year: now.getFullYear() };
};

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

const markPayrollPaid = async (req, res) => {
    try {
        const payrollId = posInt(req.params.id, 'Mã bảng lương');
        const row = await accountantPayrollRepository.markPayrollPaid(payrollId, req.user.userId);

        if (row.driver_id) {
            notificationService.createForUser(row.driver_id, {
                title: 'Lương đã được chi trả',
                message: `Lương tháng ${row.payroll_month}/${row.payroll_year} đã được kế toán chi trả.`,
                type: 'PAYROLL_PAID',
                entityType: 'payroll',
                entityId: row.id,
            }, { displayMode: 'alert' }).catch(() => {});
        }

        res.json({ message: 'Đã đánh dấu đã thanh toán lương.', payroll: row });
    } catch (err) {
        if (!err.status) err.status = err.message.includes('Không tìm thấy') ? 404 : 400;
        sendError(res, err);
    }
};

const revertPayroll = async (req, res) => {
    try {
        const payrollId = posInt(req.params.id, 'Mã bảng lương');
        const reason = req.body?.reason?.trim() || null;
        if (reason && reason.length > 500)
            throw err400('Lý do không được vượt quá 500 ký tự.');

        const row = await accountantPayrollRepository.revertPayrollToPending(payrollId, req.user.userId, reason, req.user.role);
        res.json({ message: 'Đã trả phiếu lương về để tính lại.', payroll: row });
    } catch (err) {
        if (!err.status) err.status = err.message.includes('không tồn tại') ? 404 : 400;
        sendError(res, err);
    }
};

const adjustPayroll = async (req, res) => {
    try {
        const payrollId = posInt(req.params.id, 'Mã bảng lương');
        const manualBonus = Number(req.body?.manual_bonus ?? 0);
        const manualDeduction = Number(req.body?.manual_deduction ?? 0);
        const note = req.body?.note?.trim() || null;

        if (!Number.isFinite(manualBonus) || manualBonus < 0)
            throw err400('Thưởng điều chỉnh phải là số không âm.');
        if (!Number.isFinite(manualDeduction) || manualDeduction < 0)
            throw err400('Khấu trừ điều chỉnh phải là số không âm.');
        if (note && note.length > 500)
            throw err400('Ghi chú không được vượt quá 500 ký tự.');

        const row = await accountantPayrollRepository.adjustPayroll(
            payrollId, { manualBonus, manualDeduction, note }, req.user.userId,
        );
        res.json({ message: 'Đã điều chỉnh và tính lại phiếu lương.', payroll: row });
    } catch (err) {
        if (!err.status) err.status = err.message.includes('không tồn tại') ? 404 : 400;
        sendError(res, err);
    }
};

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

const disburseAdvance = async (req, res) => {
    try {
        const advanceId = posInt(req.params.id, 'Mã ứng lương');
        const notes = req.body?.notes?.trim() || null;

        if (notes && notes.length > 500)
            throw err400('Ghi chú không được vượt quá 500 ký tự.');

        const row = await accountantPayrollRepository.disburseAdvance(
            advanceId, req.user.userId, { notes },
        );

        if (row.driver_id) {
            const { money } = require('../utils/formatNumber');
            notificationService.createForUser(row.driver_id, {
                title: 'Ứng lương đã được giải ngân',
                message: `Kế toán đã giải ngân ${money(row.amount)} ứng lương tháng ${row.request_month}/${row.request_year}.`,
                type: 'SALARY_ADVANCE_DISBURSED',
                entityType: 'salary_advance',
                entityId: row.id,
            }, { displayMode: 'alert' }).catch(() => {});
        }

        res.json({ message: 'Giải ngân ứng lương thành công.', advance: row });
    } catch (err) {
        if (!err.status) err.status = err.message.includes('Không tìm thấy') ? 404 : 400;
        sendError(res, err);
    }
};

// GET /accountant/payroll/settlements — tài xế đã chấm dứt hợp đồng và các khoản còn phải
// quyết toán: lương kỳ cuối, ứng lương/công nợ còn lại (thu), hoàn chi phí/thưởng chưa chi.
const getTerminationSettlements = async (req, res) => {
    try {
        const settlements = await accountantPayrollRepository.getTerminationSettlements();
        res.json({ settlements });
    } catch (err) {
        sendError(res, err);
    }
};

module.exports = {
    getPayrolls,
    generatePayrolls,
    getTerminationSettlements,
    confirmPayroll,
    markPayrollPaid,
    revertPayroll,
    adjustPayroll,
    getSalaryAdvances,
    disburseAdvance,
};
