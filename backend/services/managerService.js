const managerRepository = require('../repositories/managerRepository');
const accountantReportRepository = require('../repositories/accountantReportRepository');
const managerReportRepository = require('../repositories/managerReportRepository');
const activityLogRepository = require('../repositories/activityLogRepository');
const debtService = require('./debtService');
const companyService = require('./companyService');
const coordinatorService = require('./coordinatorService');
const accountantFinanceService = require('./accountantFinanceService');
const notificationGateway = require('./notificationGateway');
const notificationService = require('./notificationService');
const { money } = require('../utils/formatNumber');

const createManagerRealtimePayload = (section, action, extra = {}) => ({
    type: 'manager.workflow.changed',
    section,
    action,
    occurredAt: new Date().toISOString(),
    ...extra,
});

const broadcastWorkflowChange = (section, action, extra = {}) => {
    notificationGateway.broadcastToRole('manager', createManagerRealtimePayload(section, action, extra));
};

const notifyManagerWorkflow = (section, action, payload, actorId = null) => {
    notificationService.getUserIdsByRole('manager').then((ids) =>
        notificationService.createForUsers(ids.filter((id) => Number(id) !== Number(actorId)), {
            title: payload.title,
            message: payload.message,
            type: `MANAGER_${section}_${action}`.toUpperCase(),
            entityType: payload.entityType || section,
            entityId: payload.entityId ?? null,
        }, { displayMode: payload.displayMode || 'toast' })
    ).catch(() => {});
};

const getDashboard = async () => {
    const [overview, finance, pendingAdvances, pendingRepayments, receiptRequests, companyInfo] = await Promise.all([
        managerRepository.getOverviewMetrics(),
        accountantFinanceService.getFinanceStats(),
        managerRepository.getSalaryAdvances({ status: 'pending', limit: 6 }),
        debtService.getPendingRepayments(),
        coordinatorService.getReceiptRequests({ kind: 'requests', status: 'pending' }),
        companyService.getCompanyInfo(),
    ]);

    return {
        overview,
        finance,
        queues: {
            salary_advances: pendingAdvances,
            debt_repayments: pendingRepayments.slice(0, 6),
            receipt_requests: (receiptRequests.requests || []).slice(0, 6),
        },
        company: companyInfo ?? {},
    };
};

// Báo cáo tổng quan (revenue chart, top customers, debt aging, payroll summary,
// revenue by vehicle, driver holdings) — Manager xem cùng dữ liệu với Accountant's ReportView.
const getReportsOverview = async ({ months, granularity } = {}) => {
    return accountantReportRepository.getReportOverview({ months, granularity });
};

// Báo cáo kinh doanh theo kỳ (tháng) cho Manager: P&L (doanh thu − chi phí − lương),
// dòng tiền/công nợ, năng suất tài xế, khách hàng — kèm so kỳ trước.
//
// Nếu kỳ ĐÃ KÝ DUYỆT → trả nguyên bản snapshot đã đóng băng (số không đổi). Nếu chưa
// ký → tính động thời gian thực. Trường `meta` cho biết trạng thái để UI hiển thị.
const getBusinessReport = async ({ year, month } = {}) => {
    const signed = await managerReportRepository.getSignedOffPeriod(year, month);
    if (signed) {
        return {
            ...signed.snapshot,
            meta: {
                status: signed.status, // luôn là 'signed_off'
                signed_off_by_name: signed.signed_off_by_name,
                signed_off_at: signed.signed_off_at,
                note: signed.note,
            },
        };
    }
    const live = await managerReportRepository.getBusinessReport({ year, month });
    return { ...live, meta: { status: 'open' } };
};

// Số liệu để cảnh báo TRƯỚC khi ký duyệt. Ký là một chiều, nên người bấm cần biết
// mình đang bỏ lại cái gì: những chuyến đã chạy trong kỳ mà chưa chốt giá sẽ không
// nằm trong snapshot, doanh thu của chúng rơi sang kỳ mở kế tiếp.
const getReportPeriodPreflight = async ({ year, month } = {}) => {
    const signed = await managerReportRepository.getSignedOffPeriod(year, month);
    if (signed) {
        return { already_signed_off: true, unpriced_trips: 0, unpriced_estimated_total: 0 };
    }
    const unpriced = await managerReportRepository.getUnpricedShipmentsInPeriod(year, month);
    return {
        already_signed_off: false,
        unpriced_trips: Number(unpriced?.trip_count ?? 0),
        unpriced_estimated_total: Number(unpriced?.estimated_total ?? 0),
    };
};

// Manager ký duyệt kỳ báo cáo: tính báo cáo tại thời điểm này, đóng băng vào snapshot
// và khoá cứng. Một bước duy nhất — không còn "chốt kỳ" trung gian, và không mở lại
// được. Cảnh báo xác nhận nằm ở UI trước khi gọi tới đây.
const signOffReportPeriod = async ({ year, month, actorId, note } = {}) => {
    const snapshot = await managerReportRepository.getBusinessReport({ year, month });
    const done = await managerReportRepository.signOffPeriod({ year, month, snapshot, actorId, note });
    if (!done) {
        const err = new Error('Kỳ đã được ký duyệt trước đó, không thể ký lại');
        err.statusCode = 409;
        throw err;
    }
    broadcastWorkflowChange('reports', 'period_signed_off', { year, month });
    notifyManagerWorkflow('reports', 'period_signed_off', {
        title: 'Kỳ báo cáo đã được ký duyệt',
        message: `Báo cáo tháng ${month}/${year} vừa được ký duyệt.`,
        entityType: 'reports',
        entityId: null,
        displayMode: 'alert',
    }, actorId);
    return getBusinessReport({ year, month });
};

const listReportPeriods = async ({ limit } = {}) => {
    return managerReportRepository.listSignedOffPeriods(limit);
};

const listSalaryAdvances = async ({ status, limit } = {}) => {
    return managerRepository.getSalaryAdvances({ status, limit });
};

const approveSalaryAdvance = async (advanceId, managerId) => {
    const advance = await managerRepository.getSalaryAdvanceById(advanceId);
    if (!advance) throw new Error('Yêu cầu ứng lương không tồn tại');
    if (advance.status !== 'pending') throw new Error('Yêu cầu ứng lương này đã được xử lý');

    const updated = await managerRepository.approveSalaryAdvance(advanceId, managerId);
    if (!updated) throw new Error('Không thể cập nhật yêu cầu ứng lương');

    broadcastWorkflowChange('salary_advances', 'approved', {
        requestId: updated.id,
        driverId: updated.driver_id,
    });

    notificationService.createForUser(updated.driver_id, {
        title: 'Yêu cầu ứng lương đã được duyệt',
        message: `Yêu cầu ứng lương tháng ${updated.request_month}/${updated.request_year} đã được manager phê duyệt.`,
        type: 'SALARY_ADVANCE_APPROVED',
        entityType: 'salary_advance',
        entityId: updated.id,
    }, { displayMode: 'alert' }).catch(() => {});

    notificationService.getUserIdsByRole('accountant').then((ids) =>
        notificationService.createForUsers(ids, {
            title: 'Có yêu cầu ứng lương cần giải ngân',
            message: `Manager đã duyệt ứng lương tháng ${updated.request_month}/${updated.request_year}. Vui lòng giải ngân.`,
            type: 'SALARY_ADVANCE_DISBURSE_NEEDED',
            entityType: 'salary_advance',
            entityId: updated.id,
        }, { displayMode: 'toast' })
    ).catch(() => {});

    return updated;
};

const rejectSalaryAdvance = async (advanceId, managerId, reason) => {
    const advance = await managerRepository.getSalaryAdvanceById(advanceId);
    if (!advance) throw new Error('Yêu cầu ứng lương không tồn tại');
    if (advance.status !== 'pending') throw new Error('Yêu cầu ứng lương này đã được xử lý');

    const updated = await managerRepository.rejectSalaryAdvance(advanceId, managerId, reason?.trim() || null);
    if (!updated) throw new Error('Không thể cập nhật yêu cầu ứng lương');

    broadcastWorkflowChange('salary_advances', 'rejected', {
        requestId: updated.id,
        driverId: updated.driver_id,
    });

    notificationService.createForUser(updated.driver_id, {
        title: 'Yêu cầu ứng lương bị từ chối',
        message: updated.reject_reason
            ? `Manager đã từ chối yêu cầu ứng lương: ${updated.reject_reason}`
            : 'Manager đã từ chối yêu cầu ứng lương của bạn.',
        type: 'SALARY_ADVANCE_REJECTED',
        entityType: 'salary_advance',
        entityId: updated.id,
    }, { displayMode: 'alert' }).catch(() => {});

    return updated;
};

const getPendingDebtRepayments = async () => {
    return debtService.getPendingRepayments();
};

const confirmDebtRepayment = async (paymentId, managerId) => {
    const result = await debtService.confirmRepayment(paymentId, managerId);
    broadcastWorkflowChange('debt_repayments', 'confirmed', {
        paymentId,
        driverId: result.driverId,
        debtId: result.debtId,
    });
    return result;
};

const rejectDebtRepayment = async (paymentId, managerId, reason) => {
    const result = await debtService.rejectRepayment(paymentId, managerId, reason);
    broadcastWorkflowChange('debt_repayments', 'rejected', {
        paymentId,
        driverId: result.driverId,
        debtId: result.debtId,
    });
    return result;
};

const getReceiptRequests = async (query = {}) => {
    return coordinatorService.getReceiptRequests({
        ...query,
        kind: query.kind || 'requests',
    });
};

const normalizePartnerPayload = (payload = {}) => {
    const companyName = String(payload.company_name || '').trim();
    if (!companyName) throw new Error('Tên đối tác là bắt buộc');

    const rawPaymentTermDays = payload.payment_term_days;
    let paymentTermDays = null;
    if (!(rawPaymentTermDays === undefined || rawPaymentTermDays === null || rawPaymentTermDays === '')) {
        paymentTermDays = Number(rawPaymentTermDays);
        if (!Number.isInteger(paymentTermDays) || paymentTermDays < 0 || paymentTermDays > 365) {
            throw new Error('Hạn thanh toán không hợp lệ');
        }
    }

    return {
        companyName,
        shortName: String(payload.short_name || '').trim() || null,
        contactPerson: String(payload.contact_person || '').trim() || null,
        phone: String(payload.phone || '').trim() || null,
        email: String(payload.email || '').trim() || null,
        address: String(payload.address || '').trim() || null,
        taxCode: String(payload.tax_code || '').trim() || null,
        businessRegistrationNumber: String(payload.business_registration_number || '').trim() || null,
        paymentTermDays,
        bankName: String(payload.bank_name || '').trim() || null,
        bankAccountNumber: String(payload.bank_account_number || '').trim() || null,
        bankAccountName: String(payload.bank_account_name || '').trim() || null,
        notes: String(payload.notes || '').trim() || null,
    };
};

const broadcastPartnerChange = (action, extra = {}) => {
    notificationGateway.broadcastToRole('manager', {
        type: 'manager.partners.changed',
        action,
        occurredAt: new Date().toISOString(),
        ...extra,
    });
};

const listPartners = async ({ search, page, limit, hasDebt, sort } = {}) => {
    const normalizedHasDebt = hasDebt === 'true' ? true : hasDebt === 'false' ? false : null;
    const [result, summary] = await Promise.all([
        managerRepository.listPartners({ search, page, limit, hasDebt: normalizedHasDebt, sort }),
        managerRepository.getPartnerSummary(),
    ]);

    if (Array.isArray(result)) return { partners: result, summary };
    return {
        partners: result.rows,
        summary,
        pagination: { total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages },
    };
};

const createPartner = async (payload, actorId = null) => {
    const partner = await managerRepository.createPartner(normalizePartnerPayload(payload));
    activityLogRepository.logSafe({
        userId: actorId, action: 'partner_create', entityType: 'partner', entityId: partner.id,
        oldData: null, newData: { company_name: partner.company_name, tax_code: partner.tax_code },
    });
    broadcastPartnerChange('created', { partnerId: partner.id });
    notifyManagerWorkflow('partners', 'created', {
        title: 'Đối tác mới đã được tạo',
        message: `Đối tác "${partner.company_name}" vừa được tạo.`,
        entityType: 'partner',
        entityId: partner.id,
    }, actorId);
    return partner;
};

const updatePartner = async (partnerId, payload, actorId = null) => {
    const existing = await managerRepository.getPartnerById(partnerId);
    if (!existing) throw new Error('Đối tác không tồn tại');

    const partner = await managerRepository.updatePartner(partnerId, normalizePartnerPayload(payload));
    if (!partner) throw new Error('Không thể cập nhật đối tác');

    activityLogRepository.logSafe({
        userId: actorId, action: 'partner_update', entityType: 'partner', entityId: partnerId,
        oldData: { company_name: existing.company_name, phone: existing.phone, tax_code: existing.tax_code,
                   payment_term_days: existing.payment_term_days },
        newData: { company_name: partner.company_name, phone: partner.phone, tax_code: partner.tax_code,
                   payment_term_days: partner.payment_term_days },
    });
    broadcastPartnerChange('updated', { partnerId: partner.id });
    notifyManagerWorkflow('partners', 'updated', {
        title: 'Đối tác đã được cập nhật',
        message: `Thông tin đối tác "${partner.company_name}" vừa được cập nhật.`,
        entityType: 'partner',
        entityId: partner.id,
    }, actorId);
    return partner;
};

const getPartnerDebtDetails = async (partnerId) => {
    const existing = await managerRepository.getPartnerById(partnerId);
    if (!existing) throw new Error('Đối tác không tồn tại');

    const debts = await managerRepository.getPartnerDebtDetails(partnerId);
    return {
        partner: existing,
        debts,
    };
};

// Việc ghi nhận đối tác thanh toán công nợ thuộc về Kế toán (POST
// /accountant/debts/payment/allocate với personType='partner'). Manager chỉ theo
// dõi, nên sau khi kế toán thu tiền ta bắn realtime + thông báo để màn Đối tác của
// Manager tự làm mới thay vì phải F5.
const notifyPartnerPaymentRecorded = async (partnerId, amount, actorId = null) => {
    const existing = await managerRepository.getPartnerById(partnerId);
    const label = existing?.company_name ?? `#${partnerId}`;

    broadcastPartnerChange('payment', { partnerId });
    notifyManagerWorkflow('partners', 'payment', {
        title: 'Đối tác đã thanh toán công nợ',
        message: `Kế toán đã ghi nhận thanh toán ${money(Number(amount))} cho đối tác "${label}".`,
        entityType: 'partner',
        entityId: partnerId,
    }, actorId);
};

module.exports = {
    getDashboard,
    getReportsOverview,
    getBusinessReport,
    getReportPeriodPreflight,
    signOffReportPeriod,
    listReportPeriods,
    listSalaryAdvances,
    approveSalaryAdvance,
    rejectSalaryAdvance,
    getPendingDebtRepayments,
    confirmDebtRepayment,
    rejectDebtRepayment,
    getReceiptRequests,
    listPartners,
    createPartner,
    updatePartner,
    getPartnerDebtDetails,
    notifyPartnerPaymentRecorded,
};
