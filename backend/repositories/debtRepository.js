const pool = require('../config/database');

// ─── Driver: danh sách công nợ (chỉ xem, không tự tạo/nộp) ──────────────────

const getDriverDebts = async (driverId, { status = null } = {}) => {
    const params = [driverId];
    let havingClause = '';

    // Tính paid_amount động từ debt_payments.status='confirmed'
    // để phản ánh đúng khi kế toán xác nhận mà chưa cập nhật debts.paid_amount
    const baseQuery = `
        SELECT
            d.id,
            d.total_amount::text,
            COALESCE(SUM(dp.amount) FILTER (WHERE dp.status = 'confirmed'), 0)::text AS paid_amount,
            GREATEST(0, d.total_amount - COALESCE(SUM(dp.amount) FILTER (WHERE dp.status = 'confirmed'), 0))::text AS remaining,
            CASE
                WHEN COALESCE(SUM(dp.amount) FILTER (WHERE dp.status = 'confirmed'), 0) >= d.total_amount THEN 'paid'
                WHEN COALESCE(SUM(dp.amount) FILTER (WHERE dp.status = 'confirmed'), 0) > 0 THEN 'partial'
                WHEN d.due_date IS NOT NULL AND d.due_date < CURRENT_DATE THEN 'overdue'
                ELSE 'unpaid'
            END AS status,
            d.due_date,
            d.notes,
            d.created_at,
            d.updated_at,
            os.id        AS shipment_id,
            o.id         AS order_id,
            o.cargo_name
         FROM debts d
         LEFT JOIN debt_payments dp ON dp.debt_id = d.id
         LEFT JOIN order_shipments os ON os.id = d.shipment_id
         LEFT JOIN orders o            ON o.id  = d.order_id
         WHERE d.debt_type = 'driver' AND d.driver_id = $1
         GROUP BY d.id, os.id, o.id, o.cargo_name`;

    if (status) {
        params.push(status);
        havingClause = `HAVING CASE
            WHEN COALESCE(SUM(dp.amount) FILTER (WHERE dp.status = 'confirmed'), 0) >= d.total_amount THEN 'paid'
            WHEN COALESCE(SUM(dp.amount) FILTER (WHERE dp.status = 'confirmed'), 0) > 0 THEN 'partial'
            WHEN d.due_date IS NOT NULL AND d.due_date < CURRENT_DATE THEN 'overdue'
            ELSE 'unpaid'
        END = $${params.length}`;
    }

    const result = await pool.query(
        `${baseQuery} ${havingClause} ORDER BY d.created_at DESC`,
        params,
    );
    return result.rows;
};

// ─── Driver: lịch sử thanh toán của 1 khoản nợ ───────────────────────────────

const getDebtPayments = async (debtId, driverId) => {
    const result = await pool.query(
        `SELECT
            dp.id,
            dp.amount::text,
            dp.payment_method,
            dp.status,
            dp.receipt_url,
            dp.reject_reason,
            dp.paid_at,
            dp.confirmed_at,
            dp.notes
         FROM debt_payments dp
         JOIN debts d ON d.id = dp.debt_id
         WHERE dp.debt_id = $1
           AND d.driver_id = $2
           AND d.debt_type = 'driver'
         ORDER BY dp.paid_at DESC`,
        [debtId, driverId],
    );
    return result.rows;
};

// ─── Driver: gửi yêu cầu nộp tiền về công ty ─────────────────────────────────

const submitRepayment = async (driverId, debtId, { amount, paymentMethod, notes, receiptUrl }) => {
    // Dùng dynamic confirmed paid_amount để tránh stale data
    const debtRes = await pool.query(
        `SELECT d.id, d.driver_id, d.total_amount,
                COALESCE(SUM(dp.amount) FILTER (WHERE dp.status = 'confirmed'), 0) AS confirmed_paid
         FROM debts d
         LEFT JOIN debt_payments dp ON dp.debt_id = d.id
         WHERE d.id = $1 AND d.debt_type = 'driver'
         GROUP BY d.id`,
        [debtId],
    );
    const debt = debtRes.rows[0];
    if (!debt) throw new Error('Không tìm thấy khoản công nợ');
    if (Number(debt.driver_id) !== Number(driverId)) throw new Error('Bạn không có quyền thao tác khoản nợ này');

    const confirmedPaid = Number(debt.confirmed_paid);
    const totalAmount = Number(debt.total_amount);
    if (confirmedPaid >= totalAmount) throw new Error('Khoản nợ này đã được thanh toán đầy đủ');

    const remaining = totalAmount - confirmedPaid;
    if (Number(amount) > remaining) {
        throw new Error(`Số tiền nộp (${Number(amount).toLocaleString('vi-VN')}đ) vượt quá số nợ còn lại (${remaining.toLocaleString('vi-VN')}đ)`);
    }

    const result = await pool.query(
        `INSERT INTO debt_payments
             (debt_id, amount, payment_method, receipt_url, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [debtId, amount, paymentMethod ?? 'cash', receiptUrl ?? null, notes ?? null, driverId],
    );
    return result.rows[0];
};

// ─── Driver: huỷ yêu cầu đang pending ────────────────────────────────────────

const cancelRepayment = async (driverId, paymentId) => {
    const res = await pool.query(
        `SELECT dp.id, dp.status, d.driver_id
         FROM debt_payments dp
         JOIN debts d ON d.id = dp.debt_id
         WHERE dp.id = $1`,
        [paymentId],
    );
    const row = res.rows[0];
    if (!row) throw new Error('Không tìm thấy yêu cầu');
    if (Number(row.driver_id) !== Number(driverId)) throw new Error('Bạn không có quyền huỷ yêu cầu này');
    if (row.status !== 'pending') throw new Error('Chỉ có thể huỷ yêu cầu đang chờ xác nhận');

    await pool.query(`DELETE FROM debt_payments WHERE id = $1`, [paymentId]);
};

// ─── Driver: tổng quan công nợ (dashboard) ────────────────────────────────────

const getDriverDebtSummary = async (driverId) => {
    const result = await pool.query(
        `SELECT
            COUNT(*) FILTER (
                WHERE COALESCE(confirmed_paid.paid, 0) < d.total_amount
            ) AS open_count,
            COALESCE(SUM(GREATEST(0, d.total_amount - COALESCE(confirmed_paid.paid, 0))), 0)::text AS total_remaining,
            COALESCE(SUM(GREATEST(0, d.total_amount - COALESCE(confirmed_paid.paid, 0)))
                FILTER (
                    WHERE d.due_date IS NOT NULL
                      AND d.due_date < CURRENT_DATE
                      AND COALESCE(confirmed_paid.paid, 0) < d.total_amount
                ), 0)::text AS overdue_remaining
         FROM debts d
         LEFT JOIN (
             SELECT debt_id, SUM(amount) AS paid
             FROM debt_payments
             WHERE status = 'confirmed'
             GROUP BY debt_id
         ) confirmed_paid ON confirmed_paid.debt_id = d.id
         WHERE d.debt_type = 'driver' AND d.driver_id = $1`,
        [driverId],
    );
    return result.rows[0];
};

// ─── Accountant/Manager: xác nhận hoặc từ chối yêu cầu nộp tiền ──────────────

const confirmRepayment = async (paymentId, confirmedBy) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Lấy thông tin payment + debt
        const payRes = await client.query(
            `SELECT dp.id, dp.debt_id, dp.amount, dp.status, d.total_amount, d.driver_id,
                    COALESCE(SUM(dp2.amount) FILTER (WHERE dp2.status = 'confirmed'), 0) AS already_paid
             FROM debt_payments dp
             JOIN debts d ON d.id = dp.debt_id
             LEFT JOIN debt_payments dp2 ON dp2.debt_id = dp.debt_id
             WHERE dp.id = $1
             GROUP BY dp.id, dp.debt_id, dp.amount, dp.status, d.total_amount, d.driver_id`,
            [paymentId],
        );
        const pay = payRes.rows[0];
        if (!pay) throw new Error('Không tìm thấy yêu cầu nộp tiền');
        if (pay.status !== 'pending') throw new Error('Yêu cầu này đã được xử lý');

        // Xác nhận payment
        await client.query(
            `UPDATE debt_payments
             SET status = 'confirmed', confirmed_at = NOW(), confirmed_by = $1
             WHERE id = $2`,
            [confirmedBy, paymentId],
        );

        // Cập nhật debts.paid_amount và debts.status
        const newPaid = Number(pay.already_paid) + Number(pay.amount);
        const total = Number(pay.total_amount);
        const newStatus = newPaid >= total ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid';

        await client.query(
            `UPDATE debts SET paid_amount = $1, status = $2, updated_at = NOW() WHERE id = $3`,
            [newPaid, newStatus, pay.debt_id],
        );

        await client.query('COMMIT');
        return { paymentId, debtId: pay.debt_id, driverId: pay.driver_id, newPaid, newStatus };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

const rejectRepayment = async (paymentId, rejectedBy, reason) => {
    const res = await pool.query(
        `SELECT dp.id, dp.status, dp.debt_id, d.driver_id
         FROM debt_payments dp
         JOIN debts d ON d.id = dp.debt_id
         WHERE dp.id = $1`,
        [paymentId],
    );
    const pay = res.rows[0];
    if (!pay) throw new Error('Không tìm thấy yêu cầu nộp tiền');
    if (pay.status !== 'pending') throw new Error('Yêu cầu này đã được xử lý');

    await pool.query(
        `UPDATE debt_payments
         SET status = 'rejected', reject_reason = $1, confirmed_by = $2, confirmed_at = NOW()
         WHERE id = $3`,
        [reason ?? null, rejectedBy, paymentId],
    );
    return { debtId: pay.debt_id, driverId: pay.driver_id };
};

module.exports = {
    getDriverDebts, getDebtPayments, getDriverDebtSummary,
    submitRepayment, cancelRepayment,
    confirmRepayment, rejectRepayment,
};
