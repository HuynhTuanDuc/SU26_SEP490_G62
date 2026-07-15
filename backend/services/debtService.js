const debtRepository = require('../repositories/debtRepository');
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
    return debtRepository.submitRepayment(driverId, debtId, { amount: amt, paymentMethod, notes, receiptUrl });
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

module.exports = {
    getMyDebts, getMyDebtSummary, getDebtPayments,
    submitRepayment, cancelRepayment,
    confirmRepayment, rejectRepayment, voidRepayment, getPendingRepayments,
};
