const pool = require('../config/database');
const { WORK_DAYS_SQL, WORKING_DAYS_PER_MONTH } = require('../constants/payrollConstants');

const getDriverLeaves = async (driverId, { month = null, year = null } = {}) => {
    const conditions = ['driver_id = $1'];
    const params = [driverId];
    if (year)  { params.push(year);  conditions.push(`EXTRACT(YEAR  FROM leave_date) = $${params.length}`); }
    if (month) { params.push(month); conditions.push(`EXTRACT(MONTH FROM leave_date) = $${params.length}`); }

    const result = await pool.query(
        `SELECT id, leave_date, leave_type, reason, status, created_at
         FROM leave_requests
         WHERE ${conditions.join(' AND ')}
         ORDER BY leave_date DESC`,
        params,
    );
    return result.rows;
};

// Tổng hợp nghỉ/công trong tháng cho màn hình tài xế.
// Số công (working_days) lấy từ CHÍNH câu WORK_DAYS_SQL của bảng lương — tài xế nhìn số
// công một đằng, lương tính một nẻo là thứ phải tránh. Trước đây đếm lại riêng ở đây và
// lệch bảng lương ở hai chỗ: không xét ngày vào làm (tài vào làm ngày 25 vẫn thấy đủ công)
// và một ngày vừa có đơn nghỉ vừa bị chấm vắng thì bị trừ hai lần.
// Các cột đếm còn lại chỉ để liệt kê LÝ DO trên màn hình, cũng chỉ đếm từ ngày vào làm:
//   1. leave_requests 'unpaid' đã duyệt (trừ khi kế toán ghi đè 'present')
//   2. attendance_overrides 'absent_unexcused'  — trừ 1 công
//   3. attendance_overrides 'half_day'          — trừ 0.5 công
// Ngày rơi đúng ngày lễ được loại khỏi cả ba (Điều V.1 — nghỉ lễ hưởng nguyên lương).
const getAttendanceSummary = async (driverId, { month, year }) => {
    const result = await pool.query(
        `WITH emp AS (
            SELECT GREATEST(make_date($3::int, $2::int, 1), d.hire_date) AS from_d,
                   COALESCE(d.termination_date, 'infinity'::date)          AS to_d
            FROM drivers d WHERE d.profile_id = $1
        ),
        leaves AS (
            SELECT lr.leave_type, lr.status,
                   EXISTS (SELECT 1 FROM company_holidays h WHERE h.holiday_date = lr.leave_date) AS on_holiday,
                   COALESCE(ao.status, 'leave_unpaid') AS override_status
            FROM leave_requests lr
            LEFT JOIN attendance_overrides ao
                   ON ao.driver_id = lr.driver_id AND ao.work_date = lr.leave_date
            WHERE lr.driver_id = $1
              AND EXTRACT(MONTH FROM lr.leave_date) = $2
              AND EXTRACT(YEAR  FROM lr.leave_date) = $3
              AND lr.leave_date BETWEEN (SELECT from_d FROM emp) AND (SELECT to_d FROM emp)
        ),
        overrides AS (
            SELECT
                COUNT(*) FILTER (WHERE ao.status = 'absent_unexcused')::numeric AS unexcused_days,
                COUNT(*) FILTER (WHERE ao.status = 'half_day')::numeric         AS half_days
            FROM attendance_overrides ao
            WHERE ao.driver_id = $1
              AND EXTRACT(MONTH FROM ao.work_date) = $2
              AND EXTRACT(YEAR  FROM ao.work_date) = $3
              AND ao.work_date BETWEEN (SELECT from_d FROM emp) AND (SELECT to_d FROM emp)
              AND NOT EXISTS (SELECT 1 FROM company_holidays h WHERE h.holiday_date = ao.work_date)
        ),
        counted AS (
            SELECT
                COUNT(*)                                                                   AS total_leaves,
                COUNT(*) FILTER (WHERE leave_type = 'unpaid' AND status = 'approved'
                                   AND NOT on_holiday AND override_status <> 'present')    AS unpaid_days,
                COUNT(*) FILTER (WHERE leave_type = 'paid'   AND status = 'approved')      AS paid_days
            FROM leaves
        )
        SELECT
            total_leaves, unpaid_days, paid_days,
            o.unexcused_days::int AS unexcused_days,
            o.half_days::int      AS half_days,
            (SELECT COUNT(*)::int FROM company_holidays h
             WHERE EXTRACT(MONTH FROM h.holiday_date) = $2
               AND EXTRACT(YEAR  FROM h.holiday_date) = $3) AS holiday_days,
            (SELECT COUNT(DISTINCT h.holiday_date)::int
             FROM company_holidays h
             WHERE EXTRACT(MONTH FROM h.holiday_date) = $2
               AND EXTRACT(YEAR  FROM h.holiday_date) = $3
               AND (
                   EXISTS (SELECT 1 FROM order_shipments os
                           JOIN v_shipment_current sc ON sc.shipment_id = os.id
                           WHERE sc.owner_driver_id = $1 AND os.status = 'completed'
                             AND os.completed_at::date = h.holiday_date)
                   OR EXISTS (SELECT 1 FROM attendance_overrides ao
                              WHERE ao.driver_id = $1 AND ao.work_date = h.holiday_date
                                AND ao.status = 'holiday_worked')
               )) AS holiday_days_worked
        FROM counted, overrides o`,
        [driverId, month, year],
    );

    const { rows: [days] } = await pool.query(WORK_DAYS_SQL, [driverId, month, year]);
    const employedDays = Number(days?.employed_days ?? 0);
    const workingDays  = Math.max(0, employedDays - Number(days?.unpaid_days ?? 0));
    return {
        ...result.rows[0],
        // Giữ trần 28 vì màn hình hiển thị "x / 28" — lương thì vẫn trả cả phần dư (flow15)
        working_days:  Math.min(WORKING_DAYS_PER_MONTH, workingDays),
        employed_days: employedDays,
        days_in_month: Number(days?.days_in_month ?? 0),
        hire_date:     days?.hire_date ?? null,
    };
};

// Bảng lương kỳ đó đã chốt chưa — dùng để chặn đăng ký nghỉ lùi vào kỳ đã trả tiền
const getPayrollStatus = async (driverId, month, year) => {
    const result = await pool.query(
        `SELECT status FROM payrolls
         WHERE driver_id = $1 AND payroll_month = $2 AND payroll_year = $3`,
        [driverId, month, year],
    );
    return result.rows[0]?.status ?? null;
};

// Chấm công đang trừ lương của đúng ngày đó (nếu có) — dùng để chặn tạo đơn nghỉ chồng lên.
// Đối xứng với attendanceService: bên kia chặn chấm vắng/nửa công cho ngày đã có đơn nghỉ.
// 'present'/'holiday_worked' KHÔNG chặn: hai thứ đó không trừ công nên không mâu thuẫn.
const findBlockingAttendance = async (driverId, workDate) => {
    const result = await pool.query(
        `SELECT status FROM attendance_overrides
         WHERE driver_id = $1 AND work_date = $2
           AND status IN ('absent_unexcused', 'half_day')`,
        [driverId, workDate],
    );
    return result.rows[0] ?? null;
};

// Driver tự đăng ký nghỉ — auto-approved
const createLeave = async (driverId, { leaveDate, leaveType, reason }) => {
    const result = await pool.query(
        `INSERT INTO leave_requests (driver_id, leave_date, leave_type, reason, status)
         VALUES ($1, $2, $3, $4, 'approved')
         RETURNING *`,
        [driverId, leaveDate, leaveType, reason ?? null],
    );
    return result.rows[0];
};

// Huỷ đăng ký nghỉ — chỉ được huỷ ngày tương lai
const deleteLeave = async (leaveId, driverId) => {
    const result = await pool.query(
        `DELETE FROM leave_requests
         WHERE id = $1 AND driver_id = $2 AND leave_date >= CURRENT_DATE
         RETURNING id`,
        [leaveId, driverId],
    );
    if (!result.rows[0]) throw new Error('Không thể huỷ đăng ký nghỉ đã qua hoặc không thuộc về bạn');
    return result.rows[0];
};

// Cron: tự động reject các đơn nghỉ còn "pending" nhưng đã qua ngày nghỉ
const rejectExpiredLeaveRequests = async () => {
    const result = await pool.query(
        `UPDATE leave_requests
         SET status = 'rejected'
         WHERE status    = 'pending'
           AND leave_date < CURRENT_DATE
         RETURNING id`,
    );
    return result.rowCount;
};

module.exports = { getDriverLeaves, getAttendanceSummary, getPayrollStatus, findBlockingAttendance, createLeave, deleteLeave, rejectExpiredLeaveRequests };
