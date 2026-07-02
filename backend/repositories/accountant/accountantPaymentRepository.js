const pool = require('../../config/database');

const _debtStatus = (paid, total) => {
    if (paid >= total - 0.01) return 'paid';
    if (paid > 0)             return 'partial';
    return 'unpaid';
};

const _applyPaymentToDebt = async (client, { debt, amount, method, createdBy, notes }) => {
    const numericAmount = Number(amount);
    const currentPaid   = Number(debt.paid_amount);
    const totalAmount   = Number(debt.total_amount);
    const remaining     = totalAmount - currentPaid;

    if (numericAmount > remaining + 0.01) {
        throw new Error(
            `Số tiền thanh toán (${numericAmount.toLocaleString('vi-VN')}đ) vượt quá số dư (${remaining.toLocaleString('vi-VN')}đ)`
        );
    }

    const newPaidAmount = currentPaid + numericAmount;
    const newStatus     = _debtStatus(newPaidAmount, totalAmount);

    const { rows: [payment] } = await client.query(
        `INSERT INTO debt_payments (debt_id, amount, payment_method, status, paid_at, confirmed_at, confirmed_by, created_by, notes)
         VALUES ($1, $2, $3, 'confirmed', NOW(), NOW(), $4, $4, $5)
         RETURNING id, debt_id, amount`,
        [debt.id, numericAmount, method || 'cash', createdBy, notes || null]
    );

    await client.query(
        `UPDATE debts SET paid_amount = $1, status = $2, updated_by = $3, updated_at = NOW() WHERE id = $4`,
        [newPaidAmount, newStatus, createdBy, debt.id]
    );

    if (debt.customer_id && numericAmount > 0) {
        await client.query(
            `UPDATE customers SET current_debt = GREATEST(0, current_debt - $1), updated_at = NOW() WHERE id = $2`,
            [numericAmount, debt.customer_id]
        );
    }

    return { payment, newPaidAmount, newStatus };
};

const _ensureCustomerDebt = async (client, orderId, createdBy) => {
    const { rows: [existing] } = await client.query(
        `SELECT id FROM debts WHERE order_id = $1 AND debt_type = 'customer' LIMIT 1`,
        [orderId]
    );
    if (existing) return existing.id;

    const { rows: [order] } = await client.query(
        `SELECT o.customer_id, o.total_estimated_price, SUM(os.actual_price) AS total_actual_price
         FROM orders o
         LEFT JOIN order_shipments os ON os.order_id = o.id
         WHERE o.id = $1
         GROUP BY o.id`,
        [orderId]
    );
    if (!order) throw new Error(`Không tìm thấy đơn hàng #${orderId}`);

    const totalAmount = Number(order.total_actual_price || order.total_estimated_price) || 0;
    const { rows: [created] } = await client.query(
        `INSERT INTO debts (debt_type, customer_id, order_id, total_amount, paid_amount, due_date, status, notes, updated_by, created_at, updated_at)
         VALUES ('customer', $1, $2, $3, 0, CURRENT_DATE + INTERVAL '30 days', 'unpaid', $4, $5, NOW(), NOW())
         RETURNING id`,
        [order.customer_id, orderId, totalAmount, `Tự động tạo công nợ cho đơn #${orderId}`, createdBy]
    );
    return created.id;
};

const getPaymentsByOrderId = async (orderId) => {
    const { rows } = await pool.query(
        `SELECT
            dp.id, dp.debt_id, dp.amount, dp.payment_method,
            d.status,
            dp.paid_at, dp.confirmed_at, dp.confirmed_by,
            dp.created_by, dp.notes,
            pr.full_name AS creator_name
         FROM debt_payments dp
         LEFT JOIN debts    d  ON d.id  = dp.debt_id
         LEFT JOIN profiles pr ON pr.id = dp.created_by
         WHERE d.order_id = $1
         ORDER BY dp.paid_at DESC`,
        [orderId]
    );
    return rows;
};

const previewAllocation = async (personType, personId, amount) => {
    const personField = personType === 'driver' ? 'd.driver_id' : 'd.customer_id';
    const debtType    = personType === 'driver'  ? 'driver'    : 'customer';

    const { rows } = await pool.query(
        `SELECT
            d.id AS debt_id, d.shipment_id,
            d.total_amount::text, d.paid_amount::text,
            (d.total_amount - d.paid_amount)::text AS remaining,
            o.cargo_name AS order_cargo_name, o.created_at AS order_date
         FROM debts d
         LEFT JOIN orders o ON o.id = d.order_id
         WHERE ${personField} = $1
           AND d.debt_type = $2
           AND d.status != 'paid'
           AND (d.total_amount - d.paid_amount) > 0.01
         ORDER BY d.created_at ASC`,
        [personId, debtType]
    );

    const totalRemaining = rows.reduce((s, r) => s + Number(r.remaining), 0);
    let remainingPayment = Number(amount);
    let totalAllocated   = 0;
    const preview        = [];

    for (const row of rows) {
        if (remainingPayment <= 0) break;
        const debtRemaining  = Number(row.remaining);
        const allocateAmount = Math.min(remainingPayment, debtRemaining);
        if (allocateAmount <= 0) continue;

        const newPaid = Number(row.paid_amount) + allocateAmount;
        preview.push({
            debtId:         row.debt_id,
            shipmentId:     row.shipment_id,
            orderCargoName: row.order_cargo_name,
            totalAmount:    Number(row.total_amount),
            paidAmount:     Number(row.paid_amount),
            remaining:      debtRemaining,
            allocateAmount,
            newStatus:      _debtStatus(newPaid, Number(row.total_amount)),
        });

        totalAllocated   += allocateAmount;
        remainingPayment -= allocateAmount;
    }

    return {
        preview,
        totalDebt:       totalRemaining + totalAllocated,
        totalRemaining,
        requestedAmount: Number(amount),
        totalAllocated,
        overpayment:     Math.max(0, remainingPayment),
    };
};

const recordPayment = async (orderId, paymentData) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const debtId = await _ensureCustomerDebt(client, orderId, paymentData.createdBy);

        const { rows: [debt] } = await client.query(
            `SELECT id, total_amount, paid_amount, customer_id FROM debts WHERE id = $1`,
            [debtId]
        );

        const result = await _applyPaymentToDebt(client, {
            debt,
            amount:    paymentData.amount,
            method:    paymentData.paymentMethod,
            createdBy: paymentData.createdBy,
            notes:     paymentData.notes,
        });

        await client.query('COMMIT');
        return { ...result, debtId };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

const recordPaymentByDebt = async (debtId, paymentData) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows: [debt] } = await client.query(
            `SELECT id, total_amount, paid_amount, customer_id FROM debts WHERE id = $1`,
            [debtId]
        );
        if (!debt) throw new Error('Không tìm thấy khoản công nợ');

        const result = await _applyPaymentToDebt(client, {
            debt,
            amount:    paymentData.amount,
            method:    paymentData.paymentMethod,
            createdBy: paymentData.createdBy,
            notes:     paymentData.notes,
        });

        await client.query('COMMIT');
        return { success: true, ...result, debtId: debt.id };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

const recordPaymentByShipment = async (shipmentId, paymentData) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        let { rows: [debt] } = await client.query(
            `SELECT id, total_amount, paid_amount, customer_id
             FROM debts WHERE shipment_id = $1 AND debt_type = 'customer' LIMIT 1`,
            [shipmentId]
        );

        if (!debt) {
            const { rows: [si] } = await client.query(
                `SELECT os.estimated_price, sc.owner_driver_id, o.customer_id, o.id AS order_id
                 FROM order_shipments os
                 JOIN orders o ON o.id = os.order_id
                 LEFT JOIN v_shipment_current sc ON sc.shipment_id = os.id
                 WHERE os.id = $1`,
                [shipmentId]
            );
            if (!si) throw new Error('Không tìm thấy chuyến xe');

            const { rows: [created] } = await client.query(
                `INSERT INTO debts (debt_type, customer_id, driver_id, order_id, shipment_id, total_amount, paid_amount, status, created_at, updated_at)
                 VALUES ('customer', $1, $2, $3, $4, $5, 0, 'unpaid', NOW(), NOW())
                 RETURNING id, total_amount, paid_amount, customer_id`,
                [si.customer_id, si.owner_driver_id, si.order_id, shipmentId, Number(si.estimated_price) || 0]
            );
            debt = created;
        }

        const result = await _applyPaymentToDebt(client, {
            debt,
            amount:    paymentData.amount,
            method:    paymentData.paymentMethod,
            createdBy: paymentData.createdBy,
            notes:     paymentData.notes,
        });

        await client.query('COMMIT');
        return { success: true, ...result, debtId: debt.id };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

const allocatePayment = async (personType, personId, paymentData) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const personField = personType === 'driver' ? 'd.driver_id' : 'd.customer_id';
        const debtType    = personType === 'driver'  ? 'driver'    : 'customer';

        const { rows: debts } = await client.query(
            `SELECT
                d.id AS debt_id, d.total_amount, d.paid_amount,
                d.driver_id, d.customer_id, d.shipment_id,
                (d.total_amount - d.paid_amount) AS remaining
             FROM debts d
             WHERE ${personField} = $1
               AND d.debt_type = $2
               AND d.status != 'paid'
               AND (d.total_amount - d.paid_amount) > 0.01
             ORDER BY d.created_at ASC
             FOR UPDATE`,
            [personId, debtType]
        );

        const totalRemaining  = debts.reduce((s, d) => s + Number(d.remaining), 0);
        const requestedAmount = Number(paymentData.amount);

        if (requestedAmount > totalRemaining + 0.01) {
            throw new Error(
                `Số tiền thanh toán (${requestedAmount.toLocaleString('vi-VN')}đ) vượt quá số dư công nợ (${totalRemaining.toLocaleString('vi-VN')}đ)`
            );
        }

        let remaining   = requestedAmount;
        const debtIds   = [];
        const allocAmts = [];
        const newPaids  = [];
        const newStats  = [];
        const details   = [];

        for (const debt of debts) {
            if (remaining <= 0) break;
            const alloc = Math.min(remaining, Number(debt.remaining));
            if (alloc <= 0) continue;

            const newPaid  = Number(debt.paid_amount) + alloc;
            const newState = _debtStatus(newPaid, Number(debt.total_amount));

            debtIds.push(Number(debt.debt_id));
            allocAmts.push(alloc);
            newPaids.push(newPaid);
            newStats.push(newState);
            details.push({
                debtId:       debt.debt_id,
                shipmentId:   debt.shipment_id,
                amount:       alloc,
                previousPaid: Number(debt.paid_amount),
                newPaid,
                newStatus:    newState,
            });
            remaining -= alloc;
        }

        const totalAllocated = requestedAmount - remaining;

        if (debtIds.length === 0) {
            await client.query('ROLLBACK');
            return { success: true, totalAllocated: 0, overpayment: remaining, allocations: [], payments: [] };
        }

        const { rows: payments } = await client.query(
            `INSERT INTO debt_payments (debt_id, amount, payment_method, status, paid_at, confirmed_at, confirmed_by, created_by, notes)
             SELECT unnest($1::int[]), unnest($2::numeric[]), $3, 'confirmed', NOW(), NOW(), $4, $4, $5
             RETURNING id, debt_id, amount`,
            [
                debtIds, allocAmts,
                paymentData.paymentMethod || 'cash',
                paymentData.createdBy,
                paymentData.notes || 'Phân bổ thanh toán tự động',
            ]
        );

        await client.query(
            `UPDATE debts AS d
             SET paid_amount = v.new_paid,
                 status      = v.new_status,
                 updated_by  = $3,
                 updated_at  = NOW()
             FROM UNNEST($1::int[], $2::numeric[], $4::text[]) AS v(debt_id, new_paid, new_status)
             WHERE d.id = v.debt_id`,
            [debtIds, newPaids, paymentData.createdBy, newStats]
        );

        if (totalAllocated > 0 && personType === 'customer') {
            await client.query(
                `UPDATE customers SET current_debt = GREATEST(0, current_debt - $1), updated_at = NOW() WHERE id = $2`,
                [totalAllocated, personId]
            );
        }

        await client.query('COMMIT');
        return { success: true, totalAllocated, overpayment: remaining, allocations: details, payments };
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

        const { rows: [existing] } = await client.query(
            `SELECT id, total_amount, paid_amount
             FROM debts WHERE shipment_id = $1 AND debt_type = 'driver' LIMIT 1`,
            [shipmentId]
        );

        if (!existing) {
            const { rows: [s] } = await client.query(
                `SELECT os.actual_price, os.estimated_price, sc.owner_driver_id, o.id AS order_id
                 FROM order_shipments os
                 JOIN orders o ON o.id = os.order_id
                 LEFT JOIN v_shipment_current sc ON sc.shipment_id = os.id
                 WHERE os.id = $1`,
                [shipmentId]
            );
            if (!s) throw new Error('Không tìm thấy chuyến xe');

            const shipmentPrice = Number(s.actual_price || s.estimated_price) || 0;
            const paidNow       = Number(amount) || 0;
            await client.query(
                `INSERT INTO debts (debt_type, driver_id, customer_id, partner_id, order_id, shipment_id, total_amount, paid_amount, status, updated_by, created_at, updated_at)
                 VALUES ('driver', $1, NULL, NULL, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
                [s.owner_driver_id, s.order_id, shipmentId, shipmentPrice, paidNow, _debtStatus(paidNow, shipmentPrice), confirmedBy]
            );
        } else {
            const newPaid = Number(existing.paid_amount) + Number(amount || 0);
            await client.query(
                `UPDATE debts SET paid_amount = $1, status = $2, updated_by = $3, updated_at = NOW() WHERE id = $4`,
                [newPaid, _debtStatus(newPaid, Number(existing.total_amount)), confirmedBy, existing.id]
            );
        }

        if (Number(amount) > 0) {
            await client.query(
                `INSERT INTO debt_payments (debt_id, amount, payment_method, status, paid_at, confirmed_at, confirmed_by, created_by, notes)
                 SELECT d.id, $1, $2, 'confirmed', NOW(), NOW(), $3, $3, 'Kế toán xác nhận thu tiền tài xế'
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

const getPaymentHistoryByPerson = async (personType, personId) => {
    const personField = personType === 'driver' ? 'd.driver_id' : 'd.customer_id';
    const debtType    = personType === 'driver'  ? 'driver'    : 'customer';

    const { rows } = await pool.query(
        `SELECT
            dp.id,
            dp.amount,
            dp.payment_method,
            dp.paid_at,
            dp.notes,
            pr.full_name  AS confirmed_by_name,
            d.order_id,
            d.shipment_id,
            JSON_AGG(
                JSON_BUILD_OBJECT('debtId', dp2.debt_id, 'amount', dp2.amount)
                ORDER BY dp2.debt_id
            ) FILTER (WHERE dp2.id IS NOT NULL) AS items
         FROM debt_payments dp
         JOIN debts d ON d.id = dp.debt_id
            AND d.debt_type = $2
            AND ${personField} = $1
         LEFT JOIN profiles pr ON pr.id = dp.confirmed_by
         LEFT JOIN debt_payments dp2 ON dp2.paid_at = dp.paid_at
            AND dp2.created_by = dp.created_by
            AND dp2.debt_id IN (
                SELECT id FROM debts
                WHERE debt_type = $2 AND ${personField} = $1
            )
         GROUP BY dp.id, dp.amount, dp.payment_method, dp.paid_at, dp.notes,
                  pr.full_name, d.order_id, d.shipment_id
         ORDER BY dp.paid_at DESC
         LIMIT 100`,
        [personId, debtType]
    );

    const seen = new Set();
    const unique = [];
    for (const row of rows) {
        const key = `${row.paid_at?.toISOString()}_${row.confirmed_by_name}`;
        if (!seen.has(key)) {
            seen.add(key);
            unique.push({
                id:                row.id,
                totalAmount:       Number(row.amount),
                payment_method:    row.payment_method,
                paid_at:           row.paid_at,
                notes:             row.notes,
                confirmed_by_name: row.confirmed_by_name,
                items:             row.items || [],
            });
        }
    }
    return unique;
};

module.exports = {
    getPaymentsByOrderId,
    recordPayment,
    confirmDriverPayment,
    previewAllocation,
    allocatePayment,
    recordPaymentByShipment,
    recordPaymentByDebt,
    getPaymentHistoryByPerson,
};
