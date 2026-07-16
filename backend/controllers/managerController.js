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

const getReportsOverview = async (req, res) => {
    try {
        const months = parseInt(req.query.months, 10) || 6;
        if (Number.isNaN(months) || months < 1 || months > 24) {
            const error = new Error('Số tháng thống kê không hợp lệ (1–24)');
            error.statusCode = 400;
            throw error;
        }
        const granularity = req.query.granularity || 'month';
        if (!['day', 'week', 'month'].includes(granularity)) {
            const error = new Error('Mức thời gian không hợp lệ (day/week/month)');
            error.statusCode = 400;
            throw error;
        }
        const data = await managerService.getReportsOverview({ months, granularity });
        res.json(data);
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
        const { status, search, sort } = req.query;
        const now   = new Date();
        const month = Number(req.query.month) || now.getMonth() + 1;
        const year  = Number(req.query.year)  || now.getFullYear();

        if (status && !PAYROLL_STATUSES.includes(status))
            return res.status(400).json({ error: 'Trạng thái bảng lương không hợp lệ' });

        const [rows, stats] = await Promise.all([
            accountantPayrollRepository.getAllPayrolls({ month, year, status: status || null, search: search?.trim() || null, sort: sort || null }),
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

const approveExpense = async (req, res) => {
    try {
        const expenseId = parseId(req.params.id, 'Expense ID');
        const expenseService = require('../services/expenseService');
        const expense = await expenseService.approveExpense(expenseId, req.user.userId);
        res.json({ message: 'Đã duyệt chi phí', expense });
    } catch (err) {
        sendError(res, err);
    }
};

const rejectExpense = async (req, res) => {
    try {
        const expenseId = parseId(req.params.id, 'Expense ID');
        const expenseService = require('../services/expenseService');
        const expense = await expenseService.rejectExpense(expenseId, req.user.userId, req.body?.reason);
        res.json({ message: 'Đã từ chối chi phí', expense });
    } catch (err) {
        sendError(res, err);
    }
};

const getIncidents = async (req, res) => {
    try {
        const { status, severity_level, search, sort, page, limit } = req.query;
        const coordinatorService = require('../services/coordinatorService');
        const result = await coordinatorService.getIncidents({
            status: status || null,
            severityLevel: severity_level || null,
            search: search || '',
            sort: sort || 'newest',
            page,
            limit,
        });
        res.json(result);
    } catch (err) {
        sendError(res, err);
    }
};

const cancelShipment = async (req, res) => {
    try {
        const shipmentId = parseId(req.params.id, 'Shipment ID');
        const coordinatorService = require('../services/coordinatorService');
        const updated = await coordinatorService.cancelShipment(shipmentId, req.body?.reason, req.user.userId);
        res.json({ message: 'Đã hủy chuyến', shipment: updated });
    } catch (err) {
        sendError(res, err);
    }
};

const reassignShipment = async (req, res) => {
    try {
        const shipmentId = parseId(req.params.id, 'Shipment ID');
        const coordinatorService = require('../services/coordinatorService');
        const updated = await coordinatorService.reassignShipment(shipmentId, { toDriverId: req.body?.toDriverId }, req.user.userId);
        res.json({ message: 'Đã điều chuyển chuyến', shipment: updated });
    } catch (err) {
        sendError(res, err);
    }
};

module.exports = {
    getDashboard,
    getReportsOverview,
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
    approveExpense,
    rejectExpense,
    cancelShipment,
    reassignShipment,
    getIncidents,
};
