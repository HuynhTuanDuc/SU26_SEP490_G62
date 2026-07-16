const attendanceRepository = require('../repositories/attendanceRepository');

class AttendanceError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.name = 'AttendanceError';
        this.status = status;
    }
}

const STATUS_LABEL = {
    present:           'Có mặt',
    leave_paid:        'Nghỉ phép (hưởng lương)',
    leave_unpaid:      'Nghỉ không lương',
    absent_unexcused:  'Vắng không phép',
};

// Gộp override + leave_request thành 1 danh sách theo tài xế, mỗi tài xế có mảng ngày
// với trạng thái hiệu lực đã tính sẵn — tiện cho FE vẽ lưới tháng.
const getMonthlyGrid = async ({ month, year, driverId, vehicleGroupId }) => {
    const m = Number(month);
    const y = Number(year);
    if (!m || m < 1 || m > 12) throw new AttendanceError('Tháng không hợp lệ (1-12)');
    if (!y || y < 2020 || y > 2100) throw new AttendanceError('Năm không hợp lệ');

    const rows = await attendanceRepository.getMonthlyGrid({
        month: m, year: y,
        driverId: driverId ? Number(driverId) : null,
        vehicleGroupId: vehicleGroupId ? Number(vehicleGroupId) : null,
    });

    const driversMap = new Map();
    for (const r of rows) {
        if (!driversMap.has(r.driver_id)) {
            driversMap.set(r.driver_id, {
                driver_id: r.driver_id,
                full_name: r.full_name,
                plate_number: r.plate_number,
                vehicle_group_name: r.vehicle_group_name,
                days: [],
                summary: { present: 0, leave_paid: 0, leave_unpaid: 0, absent_unexcused: 0 },
            });
        }
        const driver = driversMap.get(r.driver_id);

        let status;
        if (r.override_status) status = r.override_status;
        else if (r.leave_request_id) status = r.leave_type === 'paid' ? 'leave_paid' : 'leave_unpaid';
        else status = 'present';

        driver.days.push({
            work_date: r.work_date,
            status,
            status_label: STATUS_LABEL[status],
            override_id: r.override_id,
            override_notes: r.override_notes,
            leave_request_id: r.leave_request_id,
            editable: true,
        });
        driver.summary[status] += 1;
    }

    return { drivers: Array.from(driversMap.values()), status_labels: STATUS_LABEL };
};

const markAttendance = async ({ driverId, workDate, status, notes }, markedBy) => {
    if (!driverId) throw new AttendanceError('driver_id là bắt buộc');
    if (!workDate) throw new AttendanceError('work_date là bắt buộc');
    if (!['present', 'absent_unexcused'].includes(status)) {
        throw new AttendanceError('Trạng thái không hợp lệ (chỉ đánh dấu được: present, absent_unexcused)');
    }
    if (new Date(workDate) > new Date()) {
        throw new AttendanceError('Không thể chấm công cho ngày trong tương lai');
    }

    if (status === 'absent_unexcused') {
        const leave = await attendanceRepository.findApprovedLeave(Number(driverId), workDate);
        if (leave) {
            throw new AttendanceError('Ngày này tài xế đã có đơn nghỉ được duyệt — không thể đánh dấu vắng không phép. Nếu cần điều chỉnh, đánh dấu "Có mặt" để ghi đè.');
        }
    }

    return attendanceRepository.upsertOverride({
        driverId: Number(driverId),
        workDate,
        status,
        notes,
        markedBy,
    });
};

const clearAttendance = async (driverId, workDate) => {
    const deleted = await attendanceRepository.deleteOverride(Number(driverId), workDate);
    if (!deleted) throw new AttendanceError('Không tìm thấy đánh dấu chấm công để xoá', 404);
    return deleted;
};

module.exports = { AttendanceError, STATUS_LABEL, getMonthlyGrid, markAttendance, clearAttendance };
