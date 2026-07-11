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
               AND orr.status = 'rejected'`,
            [expenseId, driverId],
        );
        if (!check.rows[0]) throw new Error('Chỉ được sửa chi phí khi yêu cầu phiếu thu bị từ chối');

        await client.query(
            `UPDATE expenses
             SET expense_type = COALESCE($1, expense_type),
                 amount       = COALESCE($2, amount),
                 description  = COALESCE($3, description),
                 updated_by   = $4,
                 updated_at   = NOW()
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

module.exports = { createExpense, addExpenseAttachment, getShipmentExpenses, updateExpense };
