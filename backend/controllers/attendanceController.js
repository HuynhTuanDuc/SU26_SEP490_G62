const attendanceService = require('../services/attendanceService');

const _send = (res, err) => {
    const status = err.status || 500;
    res.status(status).json({ error: status === 500 ? 'Lỗi máy chủ.' : err.message });
};

const getMonthlyGrid = async (req, res) => {
    try {
        const { month, year, driver_id, vehicle_group_id } = req.query;
        const data = await attendanceService.getMonthlyGrid({
            month, year,
            driverId: driver_id || null,
            vehicleGroupId: vehicle_group_id || null,
        });
        res.json(data);
    } catch (err) { _send(res, err); }
};

const markAttendance = async (req, res) => {
    try {
        const { driver_id, work_date, status, notes } = req.body;
        const record = await attendanceService.markAttendance(
            { driverId: driver_id, workDate: work_date, status, notes },
            req.user.userId,
        );
        res.json({ message: 'Đã chấm công.', record });
    } catch (err) { _send(res, err); }
};

const clearAttendance = async (req, res) => {
    try {
        const { driverId, workDate } = req.params;
        await attendanceService.clearAttendance(driverId, workDate);
        res.json({ message: 'Đã xoá đánh dấu — quay lại trạng thái mặc định.' });
    } catch (err) { _send(res, err); }
};

module.exports = { getMonthlyGrid, markAttendance, clearAttendance };
