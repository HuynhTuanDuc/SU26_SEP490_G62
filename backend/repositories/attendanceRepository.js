const pool = require('../config/database');

// Lưới chấm công tháng cho toàn bộ tài xế đang hoạt động — trạng thái hiệu lực của
// mỗi ngày được tính theo thứ tự ưu tiên: attendance_overrides (nếu Manager/Coordinator
// đã đánh dấu) > leave_requests đã duyệt (tài xế tự báo nghỉ) > mặc định 'present'.
const getMonthlyGrid = async ({ month, year, driverId = null, vehicleGroupId = null }) => {
    const params = [year, month];
    const driverConds = ['a.is_active = TRUE'];
    if (driverId)       { params.push(driverId);       driverConds.push(`d.profile_id = $${params.length}`); }
    if (vehicleGroupId) { params.push(vehicleGroupId); driverConds.push(`v.vehicle_group_id = $${params.length}`); }

    const result = await pool.query(
        `WITH days AS (
            SELECT generate_series(
                make_date($1::int, $2::int, 1),
                (make_date($1::int, $2::int, 1) + INTERVAL '1 month - 1 day')::date,
                INTERVAL '1 day'
            )::date AS work_date
        ),
        drv AS (
            SELECT d.profile_id AS driver_id, p.full_name, v.plate_number, vg.name AS vehicle_group_name
            FROM drivers d
            JOIN profiles p ON p.id = d.profile_id
            JOIN accounts a ON a.id = p.id
            LEFT JOIN vehicles v ON v.id = d.vehicle_id
            LEFT JOIN vehicle_groups vg ON vg.id = v.vehicle_group_id
            WHERE ${driverConds.join(' AND ')}
        )
        SELECT
            drv.driver_id, drv.full_name, drv.plate_number, drv.vehicle_group_name,
            dd.work_date,
            ao.id     AS override_id,
            ao.status AS override_status,
            ao.notes  AS override_notes,
            lr.id         AS leave_request_id,
            lr.leave_type AS leave_type
        FROM drv
        CROSS JOIN days dd
        LEFT JOIN attendance_overrides ao ON ao.driver_id = drv.driver_id AND ao.work_date = dd.work_date
        LEFT JOIN leave_requests lr ON lr.driver_id = drv.driver_id AND lr.leave_date = dd.work_date AND lr.status = 'approved'
        ORDER BY drv.full_name ASC, dd.work_date ASC`,
        params,
    );
    return result.rows;
};

const findApprovedLeave = async (driverId, workDate) => {
    const result = await pool.query(
        `SELECT id, leave_type FROM leave_requests WHERE driver_id = $1 AND leave_date = $2 AND status = 'approved'`,
        [driverId, workDate],
    );
    return result.rows[0] ?? null;
};

const upsertOverride = async ({ driverId, workDate, status, notes, markedBy }) => {
    const result = await pool.query(
        `INSERT INTO attendance_overrides (driver_id, work_date, status, notes, marked_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (driver_id, work_date) DO UPDATE
         SET status = $3, notes = $4, marked_by = $5, updated_at = NOW()
         RETURNING *`,
        [driverId, workDate, status, notes ?? null, markedBy],
    );
    return result.rows[0];
};

// Xoá đánh dấu thủ công — quay lại trạng thái suy ra mặc định (leave_requests hoặc 'present')
const deleteOverride = async (driverId, workDate) => {
    const result = await pool.query(
        `DELETE FROM attendance_overrides WHERE driver_id = $1 AND work_date = $2 RETURNING id`,
        [driverId, workDate],
    );
    return result.rows[0] ?? null;
};

// Dùng cho tính lương: số ngày "vắng không phép" đã đánh dấu trong tháng — cộng thêm
// vào số ngày nghỉ không lương khi tính pro-rate lương cơ bản.
const getUnexcusedAbsenceDays = async (driverId, month, year) => {
    const result = await pool.query(
        `SELECT COUNT(*)::int AS days
         FROM attendance_overrides
         WHERE driver_id = $1
           AND status = 'absent_unexcused'
           AND EXTRACT(MONTH FROM work_date) = $2
           AND EXTRACT(YEAR  FROM work_date) = $3`,
        [driverId, month, year],
    );
    return Number(result.rows[0]?.days ?? 0);
};

module.exports = { getMonthlyGrid, upsertOverride, deleteOverride, getUnexcusedAbsenceDays, findApprovedLeave };
