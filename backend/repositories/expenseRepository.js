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

// Coordinator/Manager duyệt chi phí — ghi sổ nhật ký tài chính trong cùng transaction
const approveExpense = async (expenseId, reviewerId) => {
    const financialLedgerRepository = require('./financialLedgerRepository');
    const { PASS_THROUGH_EXPENSE_TYPES } = require('../constants/expenseConstants');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { rows: [expense] } = await client.query(
            `UPDATE expenses
             SET status = 'approved', reviewed_by = $2, reviewed_at = NOW(), updated_at = NOW()
             WHERE id = $1 AND status = 'pending'
             RETURNING id, shipment_id, expense_type, amount, created_by`,
            [expenseId, reviewerId],
        );
        if (!expense) throw new Error('Không tìm thấy chi phí hoặc chi phí đã được xử lý');

        const isPassThrough = PASS_THROUGH_EXPENSE_TYPES.has(expense.expense_type);
        await financialLedgerRepository.insertTransaction(client, {
            eventType: isPassThrough ? 'pass_through_cost' : 'expense_recorded',
            debitAccount: isPassThrough ? '3388' : '642',
            creditAccount: '1111',
            amount: Number(expense.amount),
            description: `${isPassThrough ? 'Chi hộ khách' : 'Chi phí vận hành'} (${expense.expense_type}) — chuyến #${expense.shipment_id}, duyệt chi phí tài xế khai`,
            refType: 'expense', refId: expense.id, actorId: reviewerId,
        });

        await client.query('COMMIT');
        return expense;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
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

module.exports = {
    createExpense, addExpenseAttachment, getShipmentExpenses, updateExpense,
    wasDriverAssignedToShipment, approveExpense, rejectExpense,
};
