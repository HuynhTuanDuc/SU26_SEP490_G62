const pool = require('../config/database');
const financialLedgerRepository = require('./financialLedgerRepository');

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
            `Sá»‘ tiá»n thanh toÃ¡n (${numericAmount.toLocaleString('vi-VN')}Ä‘) vÆ°á»£t quÃ¡ sá»‘ dÆ° (${remaining.toLocaleString('vi-VN')}Ä‘)`
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

    // Ghi sổ nhật ký tài chính theo loại công nợ
    const { rows: [debtInfo] } = await client.query(
        `SELECT debt_type FROM debts WHERE id = $1`, [debt.id],
    );
    const isDriverDebt = debtInfo?.debt_type === 'driver';
    await financialLedgerRepository.insertTransaction(client, {
        eventType: isDriverDebt ? 'driver_debt_paid' : 'customer_payment',
        debitAccount: method === 'bank_transfer' ? '1121' : '1111',
        creditAccount: isDriverDebt ? '1388' : '131',
        amount: numericAmount,
        description: isDriverDebt
            ? `Tài xế nộp quỹ — công nợ #${debt.id}`
            : `Khách hàng thanh toán — công nợ #${debt.id}`,
        refType: 'debt', refId: debt.id, actorId: createdBy,
    });

    return { payment, newPaidAmount, newStatus };
};

const _ensureCustomerDebt = async (client, orderId, createdBy) => {
    const { rows: [existing] } = await client.query(
        `SELECT id FROM debts WHERE order_id = $1 AND debt_type = 'customer' LIMIT 1`,
        [orderId]
    );
    if (existing) return existing.id;

    const { rows: [order] } = await client.query(
        `SELECT o.customer_id,
                COALESCE(SUM(os.actual_price), SUM(os.estimated_price), 0) AS order_total
         FROM orders o
         LEFT JOIN order_shipments os ON os.order_id = o.id
         WHERE o.id = $1
         GROUP BY o.customer_id`,
        [orderId]
    );
    if (!order) throw new Error(`KhÃ´ng tÃ¬m tháº¥y Ä‘Æ¡n hÃ ng #${orderId}`);

    const totalAmount = Number(order.order_total) || 0;
    const { rows: [created] } = await client.query(
        `INSERT INTO debts (debt_type, customer_id, order_id, total_amount, due_date, notes, updated_by, created_at, updated_at)
         VALUES ('customer', $1, $2, $3, CURRENT_DATE + INTERVAL '30 days', $4, $5, NOW(), NOW())
         RETURNING id`,
        [order.customer_id, orderId, totalAmount, `Tá»± Ä‘á»™ng táº¡o cÃ´ng ná»£ cho Ä‘Æ¡n #${orderId}`, createdBy]
    );
    return created.id;
};

const getPaymentsByOrderId = async (orderId) => {
    const { rows } = await pool.query(
        `SELECT
            dp.id, dp.debt_id, dp.amount, dp.payment_method,
            dp.status AS payment_status,
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
            d.total_amount::text,
            COALESCE(SUM(dp.amount) FILTER (WHERE dp.status = 'confirmed'), 0)::text AS paid_amount,
            GREATEST(0, d.total_amount - COALESCE(SUM(dp.amount) FILTER (WHERE dp.status = 'confirmed'), 0))::text AS remaining,
            o.cargo_name AS order_cargo_name, o.created_at AS order_date
         FROM debts d
         LEFT JOIN debt_payments dp ON dp.debt_id = d.id
         LEFT JOIN orders o ON o.id = d.order_id
         WHERE ${personField} = $1
           AND d.debt_type = $2
         GROUP BY d.id, d.shipment_id, d.total_amount, o.cargo_name, o.created_at
         HAVING GREATEST(0, d.total_amount - COALESCE(SUM(dp.amount) FILTER (WHERE dp.status = 'confirmed'), 0)) > 0.01
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

/**
 * Ghi nhận thanh toán từ khách với phân bổ ưu tiên:
 *   1. Trả đơn hiện tại (orderId) trước
 *   2. Phần thừa → các đơn khác cũ nhất → mới nhất
 *
 * Ví dụ: nợ cũ 10tr, đơn mới 500k, khách trả 5tr5
 *   → đơn mới cleared 500k → 5tr phân bổ vào nợ cũ → còn 5tr
 */
const recordPaymentWithOverflow = async (orderId, paymentData) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Validate order, lấy customer_id
        const { rows: [order] } = await client.query(
            `SELECT id, customer_id FROM orders WHERE id = $1`,
            [orderId]
        );
        if (!order) throw new Error(`Không tìm thấy đơn hàng #${orderId}`);
        if (!order.customer_id) throw new Error('Đơn hàng không gắn khách hàng');

        const customerId = order.customer_id;

        // 2. Đảm bảo đơn hiện tại có debt entry (tạo nếu chưa có)
        await _ensureCustomerDebt(client, orderId, paymentData.createdBy);

        // 3. Khoá và load TẤT CẢ công nợ chưa thanh toán của khách
        // Postgres cấm FOR UPDATE + GROUP BY — dùng LATERAL để vẫn lock được dòng debts
        const { rows: debts } = await client.query(
            `SELECT
                d.id             AS debt_id,
                d.order_id,
                d.total_amount,
                paid.paid        AS paid_amount,
                GREATEST(0, d.total_amount - paid.paid) AS remaining
             FROM debts d
             LEFT JOIN LATERAL (
                 SELECT COALESCE(SUM(dp.amount) FILTER (WHERE dp.status = 'confirmed'), 0) AS paid
                 FROM debt_payments dp
                 WHERE dp.debt_id = d.id
             ) paid ON TRUE
             WHERE d.customer_id = $1
               AND d.debt_type = 'customer'
               AND GREATEST(0, d.total_amount - paid.paid) > 0.01
             ORDER BY d.created_at ASC, d.id ASC
             FOR UPDATE OF d`,
            [customerId]
        );

        if (debts.length === 0) {
            throw new Error('Khách hàng không có công nợ nào cần thanh toán.');
        }

        const totalRemaining  = debts.reduce((s, d) => s + Number(d.remaining), 0);
        const requestedAmount = Number(paymentData.amount);

        if (requestedAmount > totalRemaining + 0.01) {
            throw new Error(
                `Số tiền thanh toán (${Math.round(requestedAmount).toLocaleString('vi-VN')}đ) vượt quá tổng công nợ khách hàng (${Math.round(totalRemaining).toLocaleString('vi-VN')}đ).`
            );
        }

        // 4. Sắp xếp ưu tiên: đơn hiện tại trước, các đơn khác cũ → mới
        const currentDebt = debts.filter((d) => d.order_id === orderId);
        const otherDebts  = debts.filter((d) => d.order_id !== orderId); // đã sorted ASC từ query
        const orderedDebts = [...currentDebt, ...otherDebts];

        // 5. Phân phối theo thứ tự ưu tiên
        let remaining   = requestedAmount;
        const debtIds   = [];
        const allocAmts = [];
        const allocations = [];

        for (const debt of orderedDebts) {
            if (remaining < 0.01) break;
            const alloc = Math.min(remaining, Number(debt.remaining));
            if (alloc < 0.01) continue;

            const newPaid = Number(debt.paid_amount) + alloc;
            debtIds.push(Number(debt.debt_id));
            allocAmts.push(alloc);
            allocations.push({
                debtId:          Number(debt.debt_id),
                orderId:         debt.order_id,
                isCurrentOrder:  debt.order_id === orderId,
                allocated:       alloc,
                newStatus:       _debtStatus(newPaid, Number(debt.total_amount)),
            });
            remaining -= alloc;
        }

        // 6. Bulk insert payment records (1 round-trip)
        const { rows: payments } = await client.query(
            `INSERT INTO debt_payments
                (debt_id, amount, payment_method, status,
                 paid_at, confirmed_at, confirmed_by, created_by, notes)
             SELECT unnest($1::int[]), unnest($2::numeric[]),
                    $3, 'confirmed', NOW(), NOW(), $4, $4, $5
             RETURNING id, debt_id, amount`,
            [
                debtIds, allocAmts,
                paymentData.paymentMethod || 'cash',
                paymentData.createdBy,
                paymentData.notes || null,
            ]
        );

        await financialLedgerRepository.insertTransaction(client, {
            eventType: 'customer_payment',
            debitAccount: paymentData.paymentMethod === 'bank_transfer' ? '1121' : '1111',
            creditAccount: '131',
            amount: requestedAmount,
            description: `Khách hàng thanh toán — đơn #${orderId}${allocations.length > 1 ? ` (phân bổ ${allocations.length} công nợ)` : ''}`,
            refType: 'order', refId: orderId, actorId: paymentData.createdBy,
        });

        await client.query('COMMIT');
        return {
            totalAllocated:      requestedAmount,
            totalRemainingAfter: Math.max(0, Math.round((totalRemaining - requestedAmount) * 100) / 100),
            payments,
            allocations,
            spreadAcrossOrders:  allocations.length > 1,
        };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

/**
 * Trả về tổng công nợ còn lại của khách hàng liên quan đến đơn orderId.
 * Dùng để frontend hiển thị context trước khi ghi nhận thanh toán.
 */
const getCustomerDebtSummary = async (orderId) => {
    const { rows: [order] } = await pool.query(
        `SELECT o.customer_id,
                COALESCE(c.company_name, c.full_name) AS customer_name
         FROM orders o
         LEFT JOIN customers c ON c.id = o.customer_id
         WHERE o.id = $1`,
        [orderId]
    );
    if (!order) throw new Error(`Không tìm thấy đơn hàng #${orderId}`);
    if (!order.customer_id) {
        return { customerId: null, customerName: null, totalOutstanding: 0, debts: [] };
    }

    const { rows } = await pool.query(
        `SELECT
            d.id                                                                       AS debt_id,
            d.order_id,
            d.total_amount,
            COALESCE(SUM(dp.amount) FILTER (WHERE dp.status = 'confirmed'), 0)         AS paid_amount,
            GREATEST(0,
                d.total_amount - COALESCE(SUM(dp.amount) FILTER (WHERE dp.status = 'confirmed'), 0)
            )                                                                          AS remaining
         FROM debts d
         LEFT JOIN debt_payments dp ON dp.debt_id = d.id
         WHERE d.customer_id = $1
           AND d.debt_type = 'customer'
         GROUP BY d.id, d.order_id, d.total_amount
         HAVING GREATEST(0,
            d.total_amount - COALESCE(SUM(dp.amount) FILTER (WHERE dp.status = 'confirmed'), 0)
         ) > 0.01
         ORDER BY d.created_at ASC, d.id ASC`,
        [order.customer_id]
    );

    const totalOutstanding = rows.reduce((s, d) => s + Number(d.remaining), 0);

    return {
        customerId:      order.customer_id,
        customerName:    order.customer_name,
        totalOutstanding,
        debts: rows.map((d) => ({
            debtId:      Number(d.debt_id),
            orderId:     d.order_id,
            totalAmount: Number(d.total_amount),
            paidAmount:  Number(d.paid_amount),
            remaining:   Number(d.remaining),
        })),
    };
};

const recordPaymentByDebt = async (debtId, paymentData) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows: [debt] } = await client.query(
            `SELECT d.id, d.total_amount, d.customer_id,
                    COALESCE(SUM(dp.amount) FILTER (WHERE dp.status = 'confirmed'), 0) AS paid_amount
             FROM debts d
             LEFT JOIN debt_payments dp ON dp.debt_id = d.id
             WHERE d.id = $1
             GROUP BY d.id, d.total_amount, d.customer_id`,
            [debtId]
        );
        if (!debt) throw new Error('KhÃ´ng tÃ¬m tháº¥y khoáº£n cÃ´ng ná»£');

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

        let { rows: [debtBase] } = await client.query(
            `SELECT id FROM debts WHERE shipment_id = $1 AND debt_type = 'customer' LIMIT 1`,
            [shipmentId]
        );

        if (!debtBase) {
            const { rows: [si] } = await client.query(
                `SELECT os.actual_price, os.estimated_price, sc.owner_driver_id, o.customer_id, o.id AS order_id
                 FROM order_shipments os
                 JOIN orders o ON o.id = os.order_id
                 LEFT JOIN v_shipment_current sc ON sc.shipment_id = os.id
                 WHERE os.id = $1`,
                [shipmentId]
            );
            if (!si) throw new Error('Không tìm thấy chuyến xe');

            const { rows: [created] } = await client.query(
                `INSERT INTO debts (debt_type, customer_id, driver_id, order_id, shipment_id, total_amount, created_at, updated_at)
                 VALUES ('customer', $1, $2, $3, $4, $5, NOW(), NOW())
                 RETURNING id`,
                [si.customer_id, si.owner_driver_id, si.order_id, shipmentId, Number(si.actual_price || si.estimated_price) || 0]
            );
            debtBase = created;
        }

        const { rows: [debt] } = await client.query(
            `SELECT d.id, d.total_amount, d.customer_id,
                    COALESCE(SUM(dp.amount) FILTER (WHERE dp.status = 'confirmed'), 0) AS paid_amount
             FROM debts d
             LEFT JOIN debt_payments dp ON dp.debt_id = d.id
             WHERE d.id = $1
             GROUP BY d.id, d.total_amount, d.customer_id`,
            [debtBase.id]
        );

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

        // Postgres cấm FOR UPDATE + GROUP BY — dùng LATERAL để vẫn lock được dòng debts
        const { rows: debts } = await client.query(
            `SELECT
                d.id AS debt_id, d.total_amount, d.driver_id, d.customer_id, d.shipment_id,
                paid.paid AS paid_amount,
                GREATEST(0, d.total_amount - paid.paid) AS remaining
             FROM debts d
             LEFT JOIN LATERAL (
                 SELECT COALESCE(SUM(dp.amount) FILTER (WHERE dp.status = 'confirmed'), 0) AS paid
                 FROM debt_payments dp
                 WHERE dp.debt_id = d.id
             ) paid ON TRUE
             WHERE ${personField} = $1
               AND d.debt_type = $2
               AND GREATEST(0, d.total_amount - paid.paid) > 0.01
             ORDER BY d.created_at ASC
             FOR UPDATE OF d`,
            [personId, debtType]
        );

        const totalRemaining  = debts.reduce((s, d) => s + Number(d.remaining), 0);
        const requestedAmount = Number(paymentData.amount);

        if (requestedAmount > totalRemaining + 0.01) {
            throw new Error(
                `Sá»‘ tiá»n thanh toÃ¡n (${requestedAmount.toLocaleString('vi-VN')}Ä‘) vÆ°á»£t quÃ¡ sá»‘ dÆ° cÃ´ng ná»£ (${totalRemaining.toLocaleString('vi-VN')}Ä‘)`
            );
        }

        let remaining   = requestedAmount;
        const debtIds   = [];
        const allocAmts = [];
        const details   = [];

        for (const debt of debts) {
            if (remaining <= 0) break;
            const alloc = Math.min(remaining, Number(debt.remaining));
            if (alloc <= 0) continue;

            const newPaid  = Number(debt.paid_amount) + alloc;
            const newState = _debtStatus(newPaid, Number(debt.total_amount));

            debtIds.push(Number(debt.debt_id));
            allocAmts.push(alloc);
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

        await financialLedgerRepository.insertTransaction(client, {
            eventType: personType === 'driver' ? 'driver_debt_paid' : 'customer_payment',
            debitAccount: paymentData.paymentMethod === 'bank_transfer' ? '1121' : '1111',
            creditAccount: personType === 'driver' ? '1388' : '131',
            amount: totalAllocated,
            description: personType === 'driver'
                ? `Tài xế nộp quỹ (phân bổ ${debtIds.length} công nợ)`
                : `Khách hàng thanh toán (phân bổ ${debtIds.length} công nợ)`,
            refType: 'debt', refId: debtIds[0], actorId: paymentData.createdBy,
        });

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
            `SELECT id, total_amount FROM debts WHERE shipment_id = $1 AND debt_type = 'driver' LIMIT 1`,
            [shipmentId]
        );

        if (!existing) {
            const { rows: [s] } = await client.query(
                `SELECT os.actual_price, os.estimated_price, sc.owner_driver_id, o.id AS order_id,
                        COALESCE((
                            SELECT SUM(e.amount) FROM expenses e
                            WHERE e.shipment_id = os.id
                              AND e.status != 'rejected'
                              AND e.expense_type IN ('toll', 'parking', 'etc')
                        ), 0) AS pass_through_total
                 FROM order_shipments os
                 JOIN orders o ON o.id = os.order_id
                 LEFT JOIN v_shipment_current sc ON sc.shipment_id = os.id
                 WHERE os.id = $1`,
                [shipmentId]
            );
            if (!s) throw new Error('KhÃ´ng tÃ¬m tháº¥y chuyáº¿n xe');

            // Nợ tài xế = số tiền tài xế đang cầm = cước + chi hộ khách
            const shipmentPrice = (Number(s.actual_price || s.estimated_price) || 0) + Number(s.pass_through_total || 0);
            const { rows: [newDebt] } = await client.query(
                `INSERT INTO debts (debt_type, driver_id, customer_id, partner_id, order_id, shipment_id, total_amount, updated_by, created_at, updated_at)
                 VALUES ('driver', $1, NULL, NULL, $2, $3, $4, $5, NOW(), NOW())
                 RETURNING id`,
                [s.owner_driver_id, s.order_id, shipmentId, shipmentPrice, confirmedBy]
            );
            await financialLedgerRepository.insertTransaction(client, {
                eventType: 'driver_debt_created',
                debitAccount: '1388', creditAccount: '131',
                amount: shipmentPrice,
                description: `Ghi nhận công nợ tài xế — đơn ngoài, chuyến #${shipmentId}`,
                refType: 'debt', refId: newDebt.id, actorId: confirmedBy,
            });
        }

        if (Number(amount) > 0) {
            await client.query(
                `INSERT INTO debt_payments (debt_id, amount, payment_method, status, paid_at, confirmed_at, confirmed_by, created_by, notes)
                 SELECT d.id, $1, $2, 'confirmed', NOW(), NOW(), $3, $3, 'Káº¿ toÃ¡n xÃ¡c nháº­n thu tiá»n tÃ i xáº¿'
                 FROM debts d WHERE d.shipment_id = $4 AND d.debt_type = 'driver'
                 RETURNING debt_id`,
                [amount, paymentMethod || 'cash', confirmedBy, shipmentId]
            );
            await financialLedgerRepository.insertTransaction(client, {
                eventType: 'driver_debt_paid',
                debitAccount: paymentMethod === 'bank_transfer' ? '1121' : '1111',
                creditAccount: '1388',
                amount: Number(amount),
                description: `Kế toán xác nhận tài xế nộp tiền — chuyến #${shipmentId}`,
                refType: 'shipment', refId: shipmentId, actorId: confirmedBy,
            });
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
    recordPaymentWithOverflow,
    getCustomerDebtSummary,
    confirmDriverPayment,
    previewAllocation,
    allocatePayment,
    recordPaymentByShipment,
    recordPaymentByDebt,
    getPaymentHistoryByPerson,
};

