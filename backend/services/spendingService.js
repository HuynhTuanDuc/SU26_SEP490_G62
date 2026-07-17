const paymentVoucherRepository = require('../repositories/paymentVoucherRepository');
const expenseRepository = require('../repositories/expenseRepository');
const financialLedgerRepository = require('../repositories/financialLedgerRepository');

// ─── Phiếu chi thủ công ───────────────────────────────────────────────────────
// Quy trình 2 cấp: Accountant tạo → Manager duyệt → Accountant xác nhận đã chi
// (ghi sổ tài chính khi chi, không phải khi duyệt).

const createVoucher = async (data, createdBy) => {
    const { voucher_type, amount, payee, reason, payment_method, proof_url } = data;

    if (!paymentVoucherRepository.VOUCHER_TYPES.includes(voucher_type)) {
        throw new Error('Loại phiếu chi không hợp lệ');
    }
    if (!amount || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
        throw new Error('Số tiền phải lớn hơn 0');
    }
    if (!payee || !String(payee).trim()) throw new Error('Cần ghi rõ người/đơn vị nhận tiền');
    if (!reason || !String(reason).trim()) throw new Error('Cần ghi rõ lý do chi');
    if (payment_method && !paymentVoucherRepository.PAYMENT_METHODS.includes(payment_method)) {
        throw new Error('Hình thức thanh toán không hợp lệ');
    }

    return paymentVoucherRepository.create({
        voucher_type,
        amount: Number(amount),
        payee: String(payee).trim(),
        reason: String(reason).trim(),
        payment_method: payment_method || 'cash',
        proof_url: proof_url ?? null,
    }, createdBy);
};

const listVouchers = (filters) => paymentVoucherRepository.list(filters);
const getVoucherStats = (filters) => paymentVoucherRepository.getStats(filters);

const approveVoucher = (id, approvedBy) => paymentVoucherRepository.approve(id, approvedBy);

const rejectVoucher = (id, rejectedBy, reason) => {
    if (!reason || !String(reason).trim()) throw new Error('Cần ghi rõ lý do từ chối');
    return paymentVoucherRepository.reject(id, rejectedBy, String(reason).trim());
};

const payVoucher = (id, paidBy) => paymentVoucherRepository.markPaid(id, paidBy);

// ─── Chi phí tài xế (danh sách toàn hệ thống cho web) ─────────────────────────
const listExpenses = (filters) => expenseRepository.listAllExpenses(filters);
const getExpenseStats = (filters) => expenseRepository.getExpenseStats(filters);

// ─── Tổng hợp chi từ sổ tài chính ─────────────────────────────────────────────
const getSpendingSummary = ({ month, year }) => {
    const m = Number(month);
    const y = Number(year);
    if (!m || m < 1 || m > 12) throw new Error('Tháng không hợp lệ (1-12)');
    if (!y || y < 2020) throw new Error('Năm không hợp lệ');
    return financialLedgerRepository.getSpendingSummary({ month: m, year: y });
};

module.exports = {
    createVoucher,
    listVouchers,
    getVoucherStats,
    approveVoucher,
    rejectVoucher,
    payVoucher,
    listExpenses,
    getExpenseStats,
    getSpendingSummary,
};
