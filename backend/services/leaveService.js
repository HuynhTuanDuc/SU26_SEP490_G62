const leaveRepository = require('../repositories/leaveRepository');

const VALID_TYPES = ['paid', 'unpaid'];

const getMyLeaves = async (driverId, { month, year } = {}) => {
    const m = month ? Number(month) : null;
    const y = year  ? Number(year)  : null;
    return leaveRepository.getDriverLeaves(driverId, { month: m, year: y });
};

const getSummary = async (driverId, { month, year }) => {
    const m = Number(month) || new Date().getMonth() + 1;
    const y = Number(year)  || new Date().getFullYear();
    return leaveRepository.getAttendanceSummary(driverId, { month: m, year: y });
};

const createLeave = async (driverId, { leaveDate, leaveType, reason }) => {
    if (!leaveDate) throw new Error('Ngày nghỉ là bắt buộc');
    if (!VALID_TYPES.includes(leaveType)) throw new Error('Loại nghỉ không hợp lệ (paid / unpaid)');
    return leaveRepository.createLeave(driverId, { leaveDate, leaveType, reason });
};

const deleteLeave = async (driverId, leaveId) => {
    return leaveRepository.deleteLeave(leaveId, driverId);
};

// Cron: tự động reject các đơn nghỉ còn "pending" nhưng đã qua ngày nghỉ
const rejectExpiredLeaveRequests = async () => leaveRepository.rejectExpiredLeaveRequests();

module.exports = { getMyLeaves, getSummary, createLeave, deleteLeave, rejectExpiredLeaveRequests };
