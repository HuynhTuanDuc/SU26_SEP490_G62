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
    broadcastToUser(result.driverId, { type: 'debt.updated', debtId: result.debtId });
    return result;
};

const rejectRepayment = async (paymentId, rejectedBy, reason) => {
    const pay = await debtRepository.rejectRepayment(paymentId, rejectedBy, reason);
    if (pay?.driverId) broadcastToUser(pay.driverId, { type: 'debt.updated', debtId: pay.debtId });
    return pay;
};

const getPendingRepayments = async () => {
    const pool = require('../config/database');
    const result = await pool.query(
        `SELECT
            dp.id,
            dp.debt_id,
            dp.amount::text,
            dp.payment_method,
            dp.receipt_url,
            dp.notes,
            dp.paid_at,
            dp.created_at,
            d.total_amount::text,
            d.driver_id,
            u.full_name  AS driver_name,
            o.cargo_name
         FROM debt_payments dp
         JOIN debts d ON d.id = dp.debt_id
         JOIN users u ON u.id = d.driver_id
         LEFT JOIN order_shipments os ON os.id = d.shipment_id
         LEFT JOIN orders o ON o.id = d.order_id
         WHERE dp.status = 'pending' AND d.debt_type = 'driver'
         ORDER BY dp.created_at DESC`,
    );
    return result.rows;
};

module.exports = {
    getMyDebts, getMyDebtSummary, getDebtPayments,
    submitRepayment, cancelRepayment,
    confirmRepayment, rejectRepayment, getPendingRepayments,
};
