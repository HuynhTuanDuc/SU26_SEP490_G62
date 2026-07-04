const payrollRepository = require('../repositories/payrollRepository');
const { MAX_ADVANCE_AMOUNT } = payrollRepository;

// ─── Payroll ─────────────────────────────────────────────────────────────────

const getMyPayrolls = async (driverId, { month, year } = {}) => {
    const m = month ? Number(month) : null;
    const y = year  ? Number(year)  : null;
    if (m && (m < 1 || m > 12)) throw new Error('Tháng không hợp lệ (1-12)');
    return payrollRepository.getDriverPayrolls(driverId, { month: m, year: y });
};

// ─── Salary Advance ───────────────────────────────────────────────────────────

// BR-029: Driver request → Manager approve → Accountant disburse
const requestSalaryAdvance = async (driverId, { amount, reason, requestMonth, requestYear }) => {
    if (!amount || Number(amount) <= 0) throw new Error('Số tiền phải lớn hơn 0');
    if (Number(amount) > MAX_ADVANCE_AMOUNT) throw new Error(`Số tiền ứng lương tối đa là ${MAX_ADVANCE_AMOUNT.toLocaleString('vi-VN')}₫`);
    const m = Number(requestMonth);
    const y = Number(requestYear);
    if (!m || m < 1 || m > 12) throw new Error('Tháng không hợp lệ (1-12)');
    if (!y || y < 2020)        throw new Error('Năm không hợp lệ');

    // Chỉ cho phép ứng vào ngày 25 hàng tháng (Điều IV)
    const today = new Date();
    if (today.getDate() !== 25) {
        throw new Error('Ứng lương chỉ được thực hiện vào ngày 25 hàng tháng');
    }
    if (m !== today.getMonth() + 1 || y !== today.getFullYear()) {
        throw new Error('Chi duoc ung luong cho thang hien tai');
    }

    return payrollRepository.createSalaryAdvance({
        driverId,
        amount: Number(amount),
        reason: reason?.trim() ?? null,
        requestMonth: m,
        requestYear:  y,
    });
};

const getMyAdvances = async (driverId, { status } = {}) => {
    return payrollRepository.getDriverAdvances(driverId, { status });
};

const getPayrollEstimate = async (driverId, { month, year }) => {
    const m = month ? Number(month) : new Date().getMonth() + 1;
    const y = year  ? Number(year)  : new Date().getFullYear();
    if (m < 1 || m > 12) throw new Error('Tháng không hợp lệ');
    return payrollRepository.getPayrollEstimate(driverId, { month: m, year: y });
};

module.exports = { getMyPayrolls, requestSalaryAdvance, getMyAdvances, getPayrollEstimate };
