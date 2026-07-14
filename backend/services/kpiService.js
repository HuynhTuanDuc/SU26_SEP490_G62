const kpiRepository = require('../repositories/kpiRepository');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const parseMonth = (month) => {
    if (!month) return null;
    const m = Number(month);
    if (m < 1 || m > 12) throw new Error('Tháng không hợp lệ (1-12)');
    return m;
};

const parseYear = (year) => {
    if (!year) return null;
    const y = Number(year);
    if (y < 2020) throw new Error('Năm không hợp lệ (tối thiểu 2020)');
    return y;
};

const currentMonth = () => new Date().getMonth() + 1;
const currentYear  = () => new Date().getFullYear();

// ─── Driver: xem KPI cá nhân ─────────────────────────────────────────────────

const getMyKPI = async (driverId, { month, year } = {}) => {
    const m = parseMonth(month);
    const y = parseYear(year);
    return kpiRepository.getDriverKPI(driverId, { month: m, year: y });
};

// ─── Driver: xem leaderboard nhóm xe của mình (BR-028) ───────────────────────

const getLeaderboard = async (driverId, { month, year } = {}) => {
    const m = month ? Number(month) : currentMonth();
    const y = year  ? Number(year)  : currentYear();
    if (m < 1 || m > 12) throw new Error('Tháng không hợp lệ (1-12)');

    const vehicleGroupInfo = await kpiRepository.getDriverVehicleGroupId(driverId);
    if (!vehicleGroupInfo) throw new Error('Driver chưa được gán xe — không thể xem bảng xếp hạng');

    const rows = await kpiRepository.getLeaderboard(driverId, vehicleGroupInfo.vehicle_group_id, { month: m, year: y });
    return {
        vehicle_group_name: vehicleGroupInfo.vehicle_group_name,
        month: m,
        year:  y,
        total_in_group: Number(rows[0]?.total_in_group ?? 0),
        leaderboard: rows,
    };
};

// ─── Coordinator / Manager: xem KPI tất cả driver ────────────────────────────

const getAllDriversKPI = async ({ month, year, vehicleGroupId } = {}) => {
    const m = month ? Number(month) : currentMonth();
    const y = year  ? Number(year)  : currentYear();
    if (m < 1 || m > 12) throw new Error('Tháng không hợp lệ (1-12)');
    const gid = vehicleGroupId ? Number(vehicleGroupId) : null;
    return kpiRepository.getAllDriversKPI({ month: m, year: y, vehicleGroupId: gid });
};

// ─── Coordinator / Manager / Accountant: xem KPI của 1 driver cụ thể ─────────

const getDriverKPIById = async (driverId, { month, year } = {}) => {
    if (!driverId) throw new Error('Driver ID là bắt buộc');
    const m = parseMonth(month);
    const y = parseYear(year);
    return kpiRepository.getDriverKPIById(driverId, { month: m, year: y });
};

// ─── Coordinator / Manager: leaderboard của 1 nhóm xe bất kỳ (không cần là driver) ─

const getLeaderboardByGroup = async (vehicleGroupId, { month, year } = {}) => {
    const m = month ? Number(month) : currentMonth();
    const y = year  ? Number(year)  : currentYear();
    if (m < 1 || m > 12) throw new Error('Tháng không hợp lệ (1-12)');

    const rows = await kpiRepository.getLeaderboard(0, vehicleGroupId, { month: m, year: y });
    return {
        vehicle_group_id: vehicleGroupId,
        month: m,
        year:  y,
        total_in_group: Number(rows[0]?.total_in_group ?? 0),
        leaderboard: rows,
    };
};

// Trigger tự động sau khi trip hoàn thành — gọi fire-and-forget (không await)
const recalculateAfterCompletion = (driverIds, completedAt = new Date()) => {
    const month = completedAt.getMonth() + 1;
    const year  = completedAt.getFullYear();
    const ids = Array.isArray(driverIds) ? driverIds : [driverIds];
    [...new Set(ids.map(Number).filter(Boolean))].forEach((driverId) => {
        kpiRepository.recalculateDriverKPI(driverId, month, year).catch((err) => {
            console.error(`[KPI] Recalculate failed for driver ${driverId} ${month}/${year}:`, err.message);
        });
    });
};

module.exports = {
    getMyKPI,
    getLeaderboard,
    getAllDriversKPI,
    getDriverKPIById,
    getLeaderboardByGroup,
    recalculateAfterCompletion,
};
