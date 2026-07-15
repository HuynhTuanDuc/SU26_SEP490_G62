const pool = require('../config/database');

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

// Attendance summary: working_days = 28 − unpaid leaves tháng đó
const getAttendanceSummary = async (driverId, { month, year }) => {
    const result = await pool.query(
        `SELECT
            COUNT(*)                                                         AS total_leaves,
            COUNT(*) FILTER (WHERE leave_type = 'unpaid' AND status = 'approved') AS unpaid_days,
            COUNT(*) FILTER (WHERE leave_type = 'paid'   AND status = 'approved') AS paid_days,
            (28 - COUNT(*) FILTER (WHERE leave_type = 'unpaid' AND status = 'approved'))::int AS working_days
         FROM leave_requests
         WHERE driver_id = $1
           AND EXTRACT(MONTH FROM leave_date) = $2
           AND EXTRACT(YEAR  FROM leave_date) = $3`,
        [driverId, month, year],
    );
    return result.rows[0];
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

module.exports = { getDriverLeaves, getAttendanceSummary, createLeave, deleteLeave, rejectExpiredLeaveRequests };
