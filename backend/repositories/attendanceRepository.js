const pool = require('../config/database');

// Lưới chấm công tháng cho toàn bộ tài xế đang hoạt động — trạng thái hiệu lực của
// mỗi ngày được tính theo thứ tự ưu tiên: attendance_overrides (nếu Manager/Coordinator
// đã đánh dấu) > leave_requests đã duyệt (tài xế tự báo nghỉ) > mặc định 'present'.
// Ngày ngoài thời gian làm việc mang cờ before_hire / after_termination — bảng lương
// không tính công những ngày này.
const getMonthlyGrid = async ({ month, year, driverId = null, vehicleGroupId = null }) => {
    const params = [year, month];
    // Ai có mặt trong lưới tháng: đã vào làm trước khi tháng kết thúc và chưa nghỉ việc
    // trước khi tháng bắt đầu. Tài đã khoá tài khoản vẫn hiện nếu nghỉ việc trong tháng này
    // — các ngày trước đó vẫn là công phải trả lương; khoá mà không ghi ngày nghỉ việc thì
    // không xác định được còn làm tới đâu, bỏ ra như trước.
    const driverConds = [
        "d.hire_date <= (make_date($1::int, $2::int, 1) + INTERVAL '1 month - 1 day')::date",
        '(d.termination_date IS NULL OR d.termination_date >= make_date($1::int, $2::int, 1))',
        '(a.is_active = TRUE OR d.termination_date IS NOT NULL)',
    ];
    if (driverId)       { params.push(driverId);       driverConds.push(`d.profile_id = $${params.length}`); }
    // Lọc theo NHÓM CỐ ĐỊNH của tài (biên chế), KHÔNG theo nhóm của xe đang cầm.
    // Tài nhóm 4m2 mượn xe cắt nóc vẫn phải nằm trong danh sách chấm công 4m2 —
    // nếu lọc theo xe thì kế toán chọn nhóm 4m2 sẽ không thấy tài đó và chấm sót.
    if (vehicleGroupId) { params.push(vehicleGroupId); driverConds.push(`d.default_vehicle_group_id = $${params.length}`); }

    const result = await pool.query(
        `WITH days AS (
            SELECT generate_series(
                make_date($1::int, $2::int, 1),
                (make_date($1::int, $2::int, 1) + INTERVAL '1 month - 1 day')::date,
                INTERVAL '1 day'
            )::date AS work_date
        ),
        drv AS (
            -- Biển số lấy theo xe ĐANG CẦM (thông tin vận hành), còn tên nhóm lấy
            -- theo nhóm CỐ ĐỊNH để khớp với KPI, xếp hạng và bảng lương.
            SELECT d.profile_id AS driver_id, p.full_name, v.plate_number, vg.name AS vehicle_group_name,
                   d.hire_date, d.termination_date
            FROM drivers d
            JOIN profiles p ON p.id = d.profile_id
            JOIN accounts a ON a.id = p.id
            LEFT JOIN vehicles v ON v.id = d.vehicle_id
            LEFT JOIN vehicle_groups vg ON vg.id = d.default_vehicle_group_id
            WHERE ${driverConds.join(' AND ')}
        )
        SELECT
            drv.driver_id, drv.full_name, drv.plate_number, drv.vehicle_group_name,
            to_char(drv.hire_date, 'YYYY-MM-DD')                AS hire_date,
            to_char(drv.termination_date, 'YYYY-MM-DD')         AS termination_date,
            dd.work_date,
            dd.work_date < drv.hire_date                        AS before_hire,
            COALESCE(dd.work_date > drv.termination_date, FALSE) AS after_termination,
            ao.id     AS override_id,
            ao.status AS override_status,
            ao.notes  AS override_notes,
            lr.id         AS leave_request_id,
            lr.leave_type AS leave_type,
            h.name    AS holiday_name,
            -- Bằng chứng tài có đi làm hôm đó: hoàn thành ít nhất 1 chuyến trong ngày.
            -- Ngày lễ mà có chuyến hoàn thành thì tính 200% lương (Điều V.1) — hệ thống
            -- tự nhận, kế toán không phải chấm tay.
            EXISTS (
                SELECT 1
                FROM order_shipments os
                JOIN v_shipment_current sc ON sc.shipment_id = os.id
                WHERE sc.owner_driver_id = drv.driver_id
                  AND os.status = 'completed'
                  AND os.completed_at::date = dd.work_date
            ) AS has_completed_trip
        FROM drv
        CROSS JOIN days dd
        LEFT JOIN attendance_overrides ao ON ao.driver_id = drv.driver_id AND ao.work_date = dd.work_date
        LEFT JOIN leave_requests lr ON lr.driver_id = drv.driver_id AND lr.leave_date = dd.work_date AND lr.status = 'approved'
        LEFT JOIN company_holidays h ON h.holiday_date = dd.work_date
        ORDER BY drv.full_name ASC, dd.work_date ASC`,
        params,
    );
    return result.rows;
};

const isHoliday = async (workDate) => {
    const result = await pool.query(
        `SELECT name FROM company_holidays WHERE holiday_date = $1`,
        [workDate],
    );
    return result.rows[0]?.name ?? null;
};

// Thời gian làm việc của tài xế: { hire_date, termination_date } dạng 'YYYY-MM-DD' (chuỗi,
// không qua Date để khỏi lệch múi giờ; termination_date NULL = đang làm) — null nếu
// driverId không phải tài xế.
const getEmploymentDates = async (driverId) => {
    const result = await pool.query(
        `SELECT to_char(hire_date, 'YYYY-MM-DD')        AS hire_date,
                to_char(termination_date, 'YYYY-MM-DD') AS termination_date
         FROM drivers WHERE profile_id = $1`,
        [driverId],
    );
    return result.rows[0] ?? null;
};

// Bảng lương kỳ đó đã chốt chưa — chặn sửa chấm công của kỳ đã trả tiền
const getPayrollStatus = async (driverId, month, year) => {
    const result = await pool.query(
        `SELECT status FROM payrolls
         WHERE driver_id = $1 AND payroll_month = $2 AND payroll_year = $3`,
        [driverId, month, year],
    );
    return result.rows[0]?.status ?? null;
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

module.exports = { getMonthlyGrid, upsertOverride, deleteOverride, getUnexcusedAbsenceDays, findApprovedLeave, isHoliday, getEmploymentDates, getPayrollStatus };
