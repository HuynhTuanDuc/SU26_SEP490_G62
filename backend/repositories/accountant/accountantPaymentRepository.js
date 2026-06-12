const pool = require('../../config/database');

const getPaymentsByOrderId = async (orderId) => {
    const query = `
        SELECT
            dp.id,
            dp.debt_id,
            dp.amount,
            dp.payment_method,
            dp.status,
            dp.receipt_url,
            dp.reject_reason,
            dp.paid_at,
            dp.confirmed_at,
            dp.confirmed_by,
            dp.created_by,
            dp.notes,
            pr.full_name AS creator_name
        FROM debt_payments dp
        LEFT JOIN debts d ON dp.debt_id = d.id
        LEFT JOIN profiles pr ON dp.created_by = pr.id
        WHERE d.order_id = $1
        ORDER BY dp.paid_at DESC
    `;
    const result = await pool.query(query, [orderId]);
    return result.rows;
};

const getOrderDebtInfo = async (client, orderId) => {
    const debtRes = await client.query(
        `SELECT
            debt.id,
            debt.total_amount,
            debt.paid_amount,
            debt.status AS debt_status,
            debt.customer_id,
            o.payment_type,
            o.total_estimated_price
         FROM debts debt
         JOIN orders o ON o.id = debt.order_id
         WHERE debt.order_id = $1 AND debt.debt_type = 'customer'
         LIMIT 1`,
        [orderId]
    );
    return debtRes.rows[0] || null;
};

const createDebtIfNotExists = async (client, orderId, createdBy) => {
    const orderRes = await client.query(
        `SELECT customer_id, total_estimated_price
         FROM orders WHERE id = $1`,
        [orderId]
    );
    if (orderRes.rows.length === 0) {
        throw new Error(`Khong tim thay don hang #${orderId}`);
    }

    const order = orderRes.rows[0];

    const existingDebtRes = await client.query(
        `SELECT id FROM debts
         WHERE order_id = $1 AND debt_type = 'customer'
         LIMIT 1`,
        [orderId]
    );

    if (existingDebtRes.rows.length > 0) {
        return existingDebtRes.rows[0].id;
    }

    const insertRes = await client.query(
        `INSERT INTO debts (
            debt_type, customer_id, order_id, total_amount,
            paid_amount, due_date, status, notes,
            updated_by, created_at, updated_at
        )
         VALUES (
            'customer', $1, $2, $3,
            0, CURRENT_DATE + INTERVAL '30 days', 'unpaid', $4,
            $5, NOW(), NOW()
        )
         RETURNING id`,
        [
            order.customer_id,
            orderId,
            Number(order.total_estimated_price) || 0,
            `Tu dong tao cong no cho don #${orderId}`,
            createdBy,
        ]
    );
    return insertRes.rows[0].id;
};

const recordPayment = async (orderId, paymentData) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const debtId = await createDebtIfNotExists(client, orderId, paymentData.createdBy);

        const debtRes = await client.query(
            `SELECT total_amount, paid_amount
             FROM debts WHERE id = $1`,
            [debtId]
        );
        const debt = debtRes.rows[0];

        const numericAmount = Number(paymentData.amount);
        const newPaidAmount = Number(debt.paid_amount) + numericAmount;
        const totalAmount = Number(debt.total_amount);
        const remainingDebt = totalAmount - Number(debt.paid_amount);

        if (numericAmount > remainingDebt + 0.01) {
            throw new Error(
                `So tien thanh toan (${numericAmount.toLocaleString('vi-VN')}d) vuot qua du no con lai (${remainingDebt.toLocaleString('vi-VN')}d)`
            );
        }

        let newStatus;
        if (newPaidAmount >= totalAmount - 0.01) {
            newStatus = 'paid';
        } else if (newPaidAmount > 0) {
            newStatus = 'partial';
        } else {
            newStatus = 'unpaid';
        }

        const paymentInsert = await client.query(
            `INSERT INTO debt_payments (
                debt_id, amount, payment_method,
                status, paid_at, confirmed_at, confirmed_by,
                created_by, notes
            )
             VALUES ($1, $2, $3, 'confirmed', NOW(), NOW(), $4, $4, $5)
             RETURNING *`,
            [
                debtId,
                numericAmount,
                paymentData.paymentMethod || 'cash',
                paymentData.createdBy,
                paymentData.notes || null,
            ]
        );

        await client.query(
            `UPDATE debts
             SET paid_amount = $1,
                 status = $2,
                 updated_by = $3,
                 updated_at = NOW()
             WHERE id = $4`,
            [newPaidAmount, newStatus, paymentData.createdBy, debtId]
        );

        const orderDebtInfo = await getOrderDebtInfo(client, orderId);
        if (orderDebtInfo && numericAmount > 0) {
            await client.query(
                `UPDATE customers
                 SET current_debt = GREATEST(0, current_debt - $1),
                     updated_at = NOW()
                 WHERE id = $2`,
                [numericAmount, orderDebtInfo.customer_id]
            );
        }

        await client.query('COMMIT');
        return {
            payment: paymentInsert.rows[0],
            newPaidAmount,
            newStatus,
            debtId,
        };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

const confirmDriverPayment = async (shipmentId, driverPaymentState, amount, paymentMethod, confirmedBy) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const debtRes = await client.query(
            `SELECT id, total_amount FROM debts WHERE shipment_id = $1 AND debt_type = 'driver' LIMIT 1`,
            [shipmentId]
        );

        if (debtRes.rows.length === 0) {
            // Tạo debt driver nếu chưa có
            const shipmentRes = await client.query(
                `SELECT os.estimated_price, os.owner_driver_id, o.customer_id, o.id AS order_id
                 FROM order_shipments os
                 JOIN orders o ON o.id = os.order_id
                 WHERE os.id = $1`,
                [shipmentId]
            );
            if (shipmentRes.rows.length === 0) throw new Error('Shipment not found');
            const s = shipmentRes.rows[0];
            await client.query(
                `INSERT INTO debts (debt_type, driver_id, customer_id, order_id, shipment_id, total_amount, paid_amount, status, updated_by, created_at, updated_at)
                 VALUES ('driver', $1, $2, $3, $4, $5, 0, 'unpaid', $6, NOW(), NOW())`,
                [s.owner_driver_id, s.customer_id, s.order_id, shipmentId, amount, confirmedBy]
            );
        } else {
            // Cập nhật status debt
            const newDebtStatus = driverPaymentState === 'settled' ? 'paid' : 'unpaid';
            await client.query(
                `UPDATE debts SET status = $1, updated_by = $2, updated_at = NOW() WHERE id = $3`,
                [newDebtStatus, confirmedBy, debtRes.rows[0].id]
            );
        }

        // Ghi payment cho driver
        if (amount > 0) {
            await client.query(
                `INSERT INTO debt_payments (debt_id, amount, payment_method, status, paid_at, confirmed_at, confirmed_by, created_by, notes)
                 SELECT d.id, $1, $2, 'confirmed', NOW(), NOW(), $3, $3, 'Ketoan xac nhan thu tien tai xe'
                 FROM debts d WHERE d.shipment_id = $4 AND d.debt_type = 'driver'`,
                [amount, paymentMethod || 'cash', confirmedBy, shipmentId]
            );
        }

        await client.query('COMMIT');
        return { ok: true };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

module.exports = {
    getPaymentsByOrderId,
    recordPayment,
    confirmDriverPayment,
};
