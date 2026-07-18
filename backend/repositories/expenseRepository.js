const pool = require('../config/database');

const createExpense = async ({ shipmentId, vehicleId, driverId, expenseType, amount, description }) => {
    // Driver khai chi phí → pending, chờ coordinator duyệt (ghi sổ FT khi duyệt)
    const result = await pool.query(
        `INSERT INTO expenses (shipment_id, vehicle_id, created_by, expense_type, amount, description, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending')
         RETURNING *`,
        [shipmentId, vehicleId ?? null, driverId, expenseType, amount, description ?? null],
    );
    return result.rows[0];
};

const addExpenseAttachment = async (expenseId, fileUrl) => {
    const result = await pool.query(
        `INSERT INTO expense_attachments (expense_id, file_url)
         VALUES ($1, $2)
         RETURNING *`,
        [expenseId, fileUrl],
    );
    return result.rows[0];
};

const getShipmentExpenses = async (shipmentId) => {
    const result = await pool.query(
        `SELECT
            e.id,
            e.shipment_id,
            e.expense_type,
            e.amount::text,
            e.description,
            e.expense_date,
            e.status,
            e.reject_reason,
            e.created_at,
            COALESCE(
                json_agg(ea.file_url ORDER BY ea.uploaded_at)
                FILTER (WHERE ea.id IS NOT NULL),
                '[]'::json
            ) AS receipt_urls
         FROM expenses e
         LEFT JOIN expense_attachments ea ON ea.expense_id = e.id
         WHERE e.shipment_id = $1
         GROUP BY e.id
         ORDER BY e.created_at ASC`,
        [shipmentId],
    );
    return result.rows;
};

const updateExpense = async (expenseId, driverId, { expenseType, amount, description, fileUrl }) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Chỉ cho sửa khi yêu cầu phiếu thu liên quan đang ở trạng thái 'rejected'
        const check = await client.query(
            `SELECT e.id
             FROM expenses e
             JOIN order_receipt_requests orr ON orr.requesting_shipment_id = e.shipment_id
             WHERE e.id = $1
               AND e.created_by = $2
               AND orr.driver_id = $2
               AND orr.status = 'rejected'
               AND e.status != 'approved'`,
            [expenseId, driverId],
        );
        if (!check.rows[0]) throw new Error('Chỉ được sửa chi phí khi yêu cầu phiếu thu bị từ chối và chi phí chưa được duyệt');

        // Sửa xong quay về 'pending' để coordinator duyệt lại cùng phiếu thu
        // (nếu giữ 'rejected' thì khoản đã sửa sẽ không bao giờ được tính lại)
        await client.query(
            `UPDATE expenses
             SET expense_type  = COALESCE($1, expense_type),
                 amount        = COALESCE($2, amount),
                 description   = COALESCE($3, description),
                 status        = 'pending',
                 reject_reason = NULL,
                 reviewed_by   = NULL,
                 reviewed_at   = NULL,
                 updated_by    = $4,
                 updated_at    = NOW()
             WHERE id = $5`,
            [expenseType ?? null, amount ? Number(amount) : null, description ?? null, driverId, expenseId],
        );

        if (fileUrl) {
            await client.query(`DELETE FROM expense_attachments WHERE expense_id = $1`, [expenseId]);
            await client.query(
                `INSERT INTO expense_attachments (expense_id, file_url) VALUES ($1, $2)`,
                [expenseId, fileUrl],
            );
        }

        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

const wasDriverAssignedToShipment = async (shipmentId, driverId) => {
    const { rows: [row] } = await pool.query(
        `SELECT 1 FROM shipment_assignment_history
         WHERE shipment_id = $1 AND (to_driver_id = $2 OR from_driver_id = $2)
         LIMIT 1`,
        [shipmentId, driverId],
    );
    return !!row;
};

// Coordinator/Manager duyệt chi phí tài xế khai.
// KHÔNG ghi sổ tại đây nữa — tiền là tài ứng túi, duyệt chỉ xác nhận "công ty nợ tài"
// (reimbursement_status = 'pending'). Bút toán chi được ghi khi khoản này thực sự
// được hoàn: cấn trừ vào nợ thu hộ (TH2) hoặc hoàn qua kỳ lương (TH1).
const approveExpense = async (expenseId, reviewerId) => {
    const { rows: [expense] } = await pool.query(
        `UPDATE expenses
         SET status = 'approved', reviewed_by = $2, reviewed_at = NOW(),
             reimbursement_status = 'pending', updated_at = NOW()
         WHERE id = $1 AND status = 'pending'
         RETURNING id, shipment_id, expense_type, amount, created_by`,
        [expenseId, reviewerId],
    );
    if (!expense) throw new Error('Không tìm thấy chi phí hoặc chi phí đã được xử lý');
    return expense;
};

const rejectExpense = async (expenseId, reviewerId, reason) => {
    const { rows: [expense] } = await pool.query(
        `UPDATE expenses
         SET status = 'rejected', reviewed_by = $2, reviewed_at = NOW(),
             reject_reason = $3, updated_at = NOW()
         WHERE id = $1 AND status = 'pending'
         RETURNING id, shipment_id, expense_type, amount, created_by`,
        [expenseId, reviewerId, reason ?? null],
    );
    return expense;
};

// sort resolved via allowlist, never interpolated directly from user input
const EXPENSE_SORTS = {
    oldest:        'e.created_at ASC',
    'amount-desc': 'e.amount DESC',
    'amount-asc':  'e.amount ASC',
    status:        'e.status ASC, e.created_at DESC',
};

// Danh sách chi phí toàn hệ thống cho web Manager (duyệt) / Accountant (đối chiếu)
const listAllExpenses = async ({ status, expenseType, reimbursementStatus, month, year, search, sort, page, limit } = {}) => {
    const conds  = [];
    const params = [];
    let   i      = 1;

    if (status)      { conds.push(`e.status = $${i++}`);       params.push(status); }
    if (reimbursementStatus) { conds.push(`e.reimbursement_status = $${i++}`); params.push(reimbursementStatus); }
    if (expenseType) { conds.push(`e.expense_type = $${i++}`); params.push(expenseType); }
    if (month)       { conds.push(`EXTRACT(MONTH FROM e.expense_date) = $${i++}`); params.push(Number(month)); }
    if (year)        { conds.push(`EXTRACT(YEAR  FROM e.expense_date) = $${i++}`); params.push(Number(year)); }
    if (search) {
        conds.push(`(p.full_name ILIKE $${i} OR v.plate_number ILIKE $${i} OR e.description ILIKE $${i})`);
        params.push(`%${search}%`);
        i++;
    }

    const where       = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const orderClause = EXPENSE_SORTS[sort] ?? 'e.created_at DESC';
    const safeLimit   = Math.min(100, Math.max(1, Number(limit) || 20));
    const safePage    = Math.max(1, Number(page) || 1);
    const offset      = (safePage - 1) * safeLimit;

    const baseFrom = `
        FROM expenses e
        JOIN profiles p        ON p.id = e.created_by
        LEFT JOIN vehicles v   ON v.id = e.vehicle_id
        LEFT JOIN profiles rev ON rev.id = e.reviewed_by
    `;

    const [{ rows }, { rows: countRows }] = await Promise.all([
        pool.query(
            `SELECT
                e.id, e.shipment_id, e.expense_type, e.amount::text, e.description,
                e.expense_date, e.status, e.reject_reason, e.reviewed_at, e.created_at,
                e.reimbursement_status, e.reimbursed_at,
                p.full_name      AS driver_name,
                p.phone          AS driver_phone,
                v.plate_number   AS vehicle_plate,
                rev.full_name    AS reviewed_by_name,
                COALESCE(
                    (SELECT json_agg(ea.file_url ORDER BY ea.uploaded_at)
                     FROM expense_attachments ea WHERE ea.expense_id = e.id),
                    '[]'::json
                ) AS receipt_urls
             ${baseFrom} ${where}
             ORDER BY ${orderClause}
             LIMIT $${i} OFFSET $${i + 1}`,
            [...params, safeLimit, offset],
        ),
        pool.query(`SELECT COUNT(*)::int AS total ${baseFrom} ${where}`, params),
    ]);

    return {
        rows,
        total: countRows[0]?.total ?? 0,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.max(1, Math.ceil((countRows[0]?.total ?? 0) / safeLimit)),
    };
};

const getExpenseStats = async ({ month, year } = {}) => {
    const conds  = [];
    const params = [];
    let   i      = 1;
    if (month) { conds.push(`EXTRACT(MONTH FROM expense_date) = $${i++}`); params.push(Number(month)); }
    if (year)  { conds.push(`EXTRACT(YEAR  FROM expense_date) = $${i++}`); params.push(Number(year)); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const { rows: [row] } = await pool.query(
        `SELECT
             COUNT(*)::int                                                     AS total_count,
             COUNT(*) FILTER (WHERE status = 'pending')::int                   AS pending_count,
             COUNT(*) FILTER (WHERE status = 'approved')::int                  AS approved_count,
             COUNT(*) FILTER (WHERE status = 'rejected')::int                  AS rejected_count,
             COALESCE(SUM(amount) FILTER (WHERE status = 'approved'), 0)::text AS approved_total,
             COALESCE(SUM(amount) FILTER (WHERE status = 'approved' AND reimbursement_status = 'pending'), 0)::text AS reimbursable_total
         FROM expenses ${where}`,
        params,
    );
    return row;
};

module.exports = {
    createExpense, addExpenseAttachment, getShipmentExpenses, updateExpense,
    wasDriverAssignedToShipment, approveExpense, rejectExpense,
    listAllExpenses, getExpenseStats,
};
