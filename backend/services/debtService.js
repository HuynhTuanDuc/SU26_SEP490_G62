const debtRepository = require('../repositories/debtRepository');
const reversalService = require('./reversalService');
const profileRepository = require('../repositories/profileRepository');
const roleRepository = require('../repositories/roleRepository');
const notificationService = require('./notificationService');
const { broadcastToUser } = require('./notificationGateway');
const { money } = require('../utils/formatNumber');
const { requireMoney } = require('../utils/money');

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
    const amt = requireMoney(amount, { field: 'Số tiền nộp' });
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
        message: `${driver?.full_name ?? 'Tài xế'} báo đã nộp ${money(amt)} cho công nợ #${debtId} — chờ xác nhận.`,
        type: 'DEBT_REPAYMENT_SUBMITTED',
        entityType: 'debt_payments',
        entityId: payment.id,
    }, { displayMode: 'alert' }).catch(() => {});

    return payment;
};

const cancelRepayment = async (driverId, paymentId) => {
    const result = await debtRepository.cancelRepayment(driverId, paymentId);
    notificationService.createForUser(driverId, {
        title: 'Đã hủy báo nộp công nợ',
        message: `Bạn đã hủy báo nộp công nợ #${paymentId}.`,
        type: 'DEBT_REPAYMENT_CANCELLED',
        entityType: 'debt_payments',
        entityId: paymentId,
    }, { displayMode: 'toast' }).catch(() => {});
    return result;
};

const confirmRepayment = async (paymentId, confirmedBy) => {
    const result = await debtRepository.confirmRepayment(paymentId, confirmedBy);
    // Nợ khách hàng không có driver_id — chỉ broadcast khi là nợ tài xế
    if (result.driverId) broadcastToUser(result.driverId, { type: 'debt.updated', debtId: result.debtId });
    if (result.driverId) {
        notificationService.createForUser(result.driverId, {
            title: 'Khoản nộp công nợ đã được xác nhận',
            message: `Khoản nộp công nợ #${paymentId} đã được xác nhận.`,
            type: 'DEBT_REPAYMENT_CONFIRMED',
            entityType: 'debt_payments',
            entityId: paymentId,
        }, { displayMode: 'toast' }).catch(() => {});
    }
    return result;
};

const rejectRepayment = async (paymentId, rejectedBy, reason) => {
    const pay = await debtRepository.rejectRepayment(paymentId, rejectedBy, reason);
    if (pay?.driverId) broadcastToUser(pay.driverId, { type: 'debt.updated', debtId: pay.debtId });
    if (pay?.driverId) {
        notificationService.createForUser(pay.driverId, {
            title: 'Khoản nộp công nợ bị từ chối',
            message: reason ? `Khoản nộp công nợ #${paymentId} bị từ chối: ${reason}` : `Khoản nộp công nợ #${paymentId} bị từ chối.`,
            type: 'DEBT_REPAYMENT_REJECTED',
            entityType: 'debt_payments',
            entityId: paymentId,
        }, { displayMode: 'alert' }).catch(() => {});
    }
    return pay;
};

// Kế toán hủy xác nhận khoản đã confirmed (ghi nhầm) — nợ hồi phục + bút toán đảo tự sinh
const voidRepayment = async (paymentId, voidedBy, reason) => {
    if (!reason?.trim()) throw new Error('Cần ghi lý do hủy xác nhận');
    const result = await debtRepository.voidRepayment(paymentId, voidedBy, reason.trim());

    reversalService.recordReversal({
        kind: 'repayment.confirm',
        entityId: paymentId,
        actorId: voidedBy,
        reason: reason.trim(),
        oldData: { status: 'confirmed', debt_id: result?.debtId ?? null },
        // reversal_id = bút toán đảo do repository sinh ra. Ghi lại để từ dòng nhật ký
        // này lần thẳng sang sổ kế toán được, không phải dò theo số tiền và thời gian.
        newData: { status: 'voided', reversal_id: result?.reversalId ?? null },
    });

    if (result?.driverId) broadcastToUser(result.driverId, { type: 'debt.updated', debtId: result.debtId });
    if (result?.driverId) {
        notificationService.createForUser(result.driverId, {
            title: 'Khoản nộp công nợ đã bị hủy xác nhận',
            message: `Khoản nộp công nợ #${paymentId} bị hủy xác nhận: ${reason.trim()}`,
            type: 'DEBT_REPAYMENT_VOIDED',
            entityType: 'debt_payments',
            entityId: paymentId,
        }, { displayMode: 'alert' }).catch(() => {});
    }
    return result;
};

const getPendingRepayments = async () => debtRepository.getPendingRepayments();

// Nhắc nhở hàng ngày (cron) — công nợ khách hàng/tài xế đã quá hạn thu hồi
const notifyOverdueDebts = async () => {
    const rows = await debtRepository.getOverdueDebtsSummary();
    if (rows.length === 0) return { notified: false };

    const labelByType = { driver: 'công nợ tài xế', customer: 'công nợ khách hàng' };
    const lines = rows.map((r) =>
        `${r.debt_count} khoản ${labelByType[r.debt_type] ?? r.debt_type} quá hạn — tổng ${money(Number(r.total_remaining))}`);

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
