const managerService = require('../services/managerService');
const accountantPayrollRepository = require('../repositories/accountantPayrollRepository');
const notificationService = require('../services/notificationService');

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
        || (String(err.message || '').includes('không tồn tại') ? 404 : null)
        || (String(err.message || '').includes('đã được xử lý') ? 409 : null)
        || (String(err.message || '').includes('không hợp lệ') ? 400 : null)
        || defaultStatus;

    res.status(status).json({ error: err.message });
};

const getDashboard = async (_req, res) => {
    try {
        const dashboard = await managerService.getDashboard();
        res.json(dashboard);
    } catch (err) {
        sendError(res, err);
    }
};

const getSalaryAdvances = async (req, res) => {
    try {
        const advances = await managerService.listSalaryAdvances(req.query);
        res.json({ advances });
    } catch (err) {
        sendError(res, err);
    }
};

const approveSalaryAdvance = async (req, res) => {
    try {
        const advanceId = parseId(req.params.id, 'Advance ID');
        const advance = await managerService.approveSalaryAdvance(advanceId, req.user.userId);
        res.json({ message: 'Đã phê duyệt yêu cầu ứng lương', advance });
    } catch (err) {
        sendError(res, err);
    }
};

const rejectSalaryAdvance = async (req, res) => {
    try {
        const advanceId = parseId(req.params.id, 'Advance ID');
        const advance = await managerService.rejectSalaryAdvance(advanceId, req.user.userId, req.body?.reason);
        res.json({ message: 'Đã từ chối yêu cầu ứng lương', advance });
    } catch (err) {
        sendError(res, err);
    }
};

const getPendingDebtRepayments = async (_req, res) => {
    try {
        const repayments = await managerService.getPendingDebtRepayments();
        res.json({ repayments });
    } catch (err) {
        sendError(res, err);
    }
};

const confirmDebtRepayment = async (req, res) => {
    try {
        const paymentId = parseId(req.params.paymentId, 'Payment ID');
        const result = await managerService.confirmDebtRepayment(paymentId, req.user.userId);
        res.json({ message: 'Đã xác nhận nộp tiền', ...result });
    } catch (err) {
        sendError(res, err);
    }
};

const rejectDebtRepayment = async (req, res) => {
    try {
        const paymentId = parseId(req.params.paymentId, 'Payment ID');
        await managerService.rejectDebtRepayment(paymentId, req.user.userId, req.body?.reason);
        res.json({ message: 'Đã từ chối yêu cầu nộp tiền' });
    } catch (err) {
        sendError(res, err);
    }
};

const getReceiptRequests = async (req, res) => {
    try {
        const data = await managerService.getReceiptRequests(req.query);
        res.json(data);
    } catch (err) {
        sendError(res, err);
    }
};

const getPartners = async (req, res) => {
    try {
        const data = await managerService.listPartners(req.query);
        res.json(data);
    } catch (err) {
        sendError(res, err);
    }
};

const createPartner = async (req, res) => {
    try {
        const partner = await managerService.createPartner(req.body);
        res.status(201).json({ message: 'Đã tạo đối tác mới', partner });
    } catch (err) {
        sendError(res, err);
    }
};

const updatePartner = async (req, res) => {
    try {
        const partnerId = parseId(req.params.id, 'Partner ID');
        const partner = await managerService.updatePartner(partnerId, req.body);
        res.json({ message: 'Đã cập nhật đối tác', partner });
    } catch (err) {
        sendError(res, err);
    }
};

const getPartnerDebtDetails = async (req, res) => {
    try {
        const partnerId = parseId(req.params.id, 'Partner ID');
        const data = await managerService.getPartnerDebtDetails(partnerId);
        res.json(data);
    } catch (err) {
        sendError(res, err);
    }
};

const PAYROLL_STATUSES = ['pending', 'reviewed', 'approved', 'paid'];

const getPayrolls = async (req, res) => {
    try {
        const { status, search } = req.query;
        const now   = new Date();
        const month = Number(req.query.month) || now.getMonth() + 1;
        const year  = Number(req.query.year)  || now.getFullYear();

        if (status && !PAYROLL_STATUSES.includes(status))
            return res.status(400).json({ error: 'Trạng thái bảng lương không hợp lệ' });

        const [rows, stats] = await Promise.all([
            accountantPayrollRepository.getAllPayrolls({ month, year, status: status || null, search: search?.trim() || null }),
            accountantPayrollRepository.getPayrollStats({ month, year }),
        ]);
        res.json({ payrolls: rows, stats, month, year });
    } catch (err) {
        sendError(res, err);
    }
};

const reviewPayroll = async (req, res) => {
    try {
        const payrollId = parseId(req.params.id, 'Payroll ID');
        const row = await accountantPayrollRepository.reviewPayroll(payrollId, req.user.userId);

        notificationService.getUserIdsByRole('accountant').then((ids) =>
            notificationService.createForUsers(ids, {
                title: 'Bảng lương cần xác nhận',
                message: `Manager đã duyệt bảng lương tháng ${row.payroll_month}/${row.payroll_year}. Vui lòng xác nhận và chi trả.`,
                type: 'PAYROLL_REVIEWED',
                entityType: 'payroll',
                entityId: row.id,
            }, { displayMode: 'toast' })
        ).catch(() => {});

        res.json({ message: 'Đã xác nhận bảng lương (reviewed).', payroll: row });
    } catch (err) {
        sendError(res, err);
    }
};

module.exports = {
    getDashboard,
    getSalaryAdvances,
    approveSalaryAdvance,
    rejectSalaryAdvance,
    getPendingDebtRepayments,
    confirmDebtRepayment,
    rejectDebtRepayment,
    getReceiptRequests,
    getPartners,
    createPartner,
    updatePartner,
    getPartnerDebtDetails,
    getPayrolls,
    reviewPayroll,
};
