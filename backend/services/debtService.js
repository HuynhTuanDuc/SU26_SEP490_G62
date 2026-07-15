const debtRepository = require('../repositories/debtRepository');
const profileRepository = require('../repositories/profileRepository');
const roleRepository = require('../repositories/roleRepository');
const notificationService = require('./notificationService');
const { broadcastToUser } = require('./notificationGateway');

const VALID_METHODS = ['cash', 'bank_transfer'];

const getMyDebts = async (driverId, { status } = {}) => {
    return debtRepository.getDriverDebts(driverId, { status });
};

const getMyDebtSummary = async (driverId) => {
    return debtRepository.getDriverDebtSummary(driverId);
};

const getDebtPayments = async (driverId, debtId) => {
    return debtRepository.getDebtPayments(debtId, driverId);
};

const submitRepayment = async (driverId, debtId, { amount, paymentMethod, notes }, receiptUrl) => {
    const amt = Number(amount);
    if (!amt || amt <= 0) throw new Error('Số tiền phải lớn hơn 0');
    if (!receiptUrl) throw new Error('Ảnh chứng từ là bắt buộc');
    if (paymentMethod && !VALID_METHODS.includes(paymentMethod)) throw new Error('Hình thức thanh toán không hợp lệ');
    const payment = await debtRepository.submitRepayment(driverId, debtId, { amount: amt, paymentMethod, notes, receiptUrl });

    const driver = await profileRepository.getProfileById(driverId);
    const [managerIds, accountantIds] = await Promise.all([
        roleRepository.getUserIdsByRole('manager'),
        roleRepository.getUserIdsByRole('accountant'),
    ]);
    notificationService.createForUsers([...managerIds, ...accountantIds], {
        title: 'Báo nộp tiền công nợ mới',
        message: `${driver?.full_name ?? 'Tài xế'} báo đã nộp ${amt.toLocaleString('vi-VN')}đ cho công nợ #${debtId} — chờ xác nhận.`,
        type: 'DEBT_REPAYMENT_SUBMITTED',
        entityType: 'debt_payments',
        entityId: payment.id,
    }, { displayMode: 'alert' }).catch(() => {});

    return payment;
};

const cancelRepayment = async (driverId, paymentId) => {
    return debtRepository.cancelRepayment(driverId, paymentId);
};

const confirmRepayment = async (paymentId, confirmedBy) => {
    const result = await debtRepository.confirmRepayment(paymentId, confirmedBy);
    // Nợ khách hàng không có driver_id — chỉ broadcast khi là nợ tài xế
    if (result.driverId) broadcastToUser(result.driverId, { type: 'debt.updated', debtId: result.debtId });
    return result;
};

const rejectRepayment = async (paymentId, rejectedBy, reason) => {
    const pay = await debtRepository.rejectRepayment(paymentId, rejectedBy, reason);
    if (pay?.driverId) broadcastToUser(pay.driverId, { type: 'debt.updated', debtId: pay.debtId });
    return pay;
};

// Kế toán hủy xác nhận khoản đã confirmed (ghi nhầm) — nợ hồi phục + bút toán đảo tự sinh
const voidRepayment = async (paymentId, voidedBy, reason) => {
    if (!reason?.trim()) throw new Error('Cần ghi lý do hủy xác nhận');
    const result = await debtRepository.voidRepayment(paymentId, voidedBy, reason.trim());
    if (result?.driverId) broadcastToUser(result.driverId, { type: 'debt.updated', debtId: result.debtId });
    return result;
};

const getPendingRepayments = async () => debtRepository.getPendingRepayments();

// Nhắc nhở hàng ngày (cron) — công nợ khách hàng/tài xế đã quá hạn thu hồi
const notifyOverdueDebts = async () => {
    const rows = await debtRepository.getOverdueDebtsSummary();
    if (rows.length === 0) return { notified: false };

    const labelByType = { driver: 'công nợ tài xế', customer: 'công nợ khách hàng' };
    const lines = rows.map((r) =>
        `${r.debt_count} khoản ${labelByType[r.debt_type] ?? r.debt_type} quá hạn — tổng ${Number(r.total_remaining).toLocaleString('vi-VN')}đ`);

    const [managerIds, accountantIds] = await Promise.all([
        roleRepository.getUserIdsByRole('manager'),
        roleRepository.getUserIdsByRole('accountant'),
    ]);
    await notificationService.createForUsers([...managerIds, ...accountantIds], {
        title: 'Công nợ quá hạn cần xử lý',
        message: lines.join('. '),
        type: 'DEBT_OVERDUE',
        entityType: 'debts',
    }, { displayMode: 'alert' });

    return { notified: true, rows };
};

module.exports = {
    getMyDebts, getMyDebtSummary, getDebtPayments,
    submitRepayment, cancelRepayment,
    confirmRepayment, rejectRepayment, voidRepayment, getPendingRepayments,
    notifyOverdueDebts,
};
