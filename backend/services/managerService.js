const managerRepository = require('../repositories/managerRepository');
const debtService = require('./debtService');
const companyService = require('./companyService');
const coordinatorService = require('./coordinatorService');
const accountantFinanceService = require('./accountant/accountantFinanceService');
const notificationGateway = require('./notificationGateway');
const notificationService = require('./notificationService');

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
            receipt_requests: receiptRequests.slice(0, 6),
        },
        company: companyInfo ?? {},
    };
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

const listPartners = async ({ search } = {}) => {
    const [partners, summary] = await Promise.all([
        managerRepository.listPartners({ search }),
        managerRepository.getPartnerSummary(),
    ]);

    return { partners, summary };
};

const createPartner = async (payload) => {
    const partner = await managerRepository.createPartner(normalizePartnerPayload(payload));
    broadcastPartnerChange('created', { partnerId: partner.id });
    return partner;
};

const updatePartner = async (partnerId, payload) => {
    const existing = await managerRepository.getPartnerById(partnerId);
    if (!existing) throw new Error('Đối tác không tồn tại');

    const partner = await managerRepository.updatePartner(partnerId, normalizePartnerPayload(payload));
    if (!partner) throw new Error('Không thể cập nhật đối tác');

    broadcastPartnerChange('updated', { partnerId: partner.id });
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

module.exports = {
    getDashboard,
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
};
