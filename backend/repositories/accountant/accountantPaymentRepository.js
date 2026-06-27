const pool = require('../../config/database');

const getPaymentsByOrderId = async (orderId) => {
    const query = `
        SELECT
            dp.id,
            dp.debt_id,
            dp.amount,
            dp.payment_method,
            d.status,
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
        `SELECT customer_id, total_actual_price, total_estimated_price
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

    const totalAmount = Number(order.total_actual_price || order.total_estimated_price) || 0;
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
            totalAmount,
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
            `SELECT id, total_amount, paid_amount FROM debts WHERE shipment_id = $1 AND debt_type = 'driver' LIMIT 1`,
            [shipmentId]
        );

        if (debtRes.rows.length === 0) {
            // Tạo debt driver nếu chưa có — total_amount = giá trị shipment, không phải amount nộp
            const shipmentRes = await client.query(
                `SELECT os.actual_price, os.estimated_price, os.owner_driver_id, o.id AS order_id
                 FROM order_shipments os
                 JOIN orders o ON o.id = os.order_id
                 WHERE os.id = $1`,
                [shipmentId]
            );
            if (shipmentRes.rows.length === 0) throw new Error('Shipment not found');
            const s = shipmentRes.rows[0];
            const shipmentPrice = Number(s.actual_price || s.estimated_price) || 0;
            const paidNow = Number(amount) || 0;
            const initialStatus = paidNow >= shipmentPrice - 0.01 ? 'paid'
                                : paidNow > 0 ? 'partial'
                                : 'unpaid';
            await client.query(
                `INSERT INTO debts (debt_type, driver_id, customer_id, partner_id, order_id, shipment_id, total_amount, paid_amount, status, updated_by, created_at, updated_at)
                 VALUES ('driver', $1, NULL, NULL, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
                [s.owner_driver_id, s.order_id, shipmentId, shipmentPrice, paidNow, initialStatus, confirmedBy]
            );
        } else {
            // Cập nhật paid_amount + status dựa trên số tiền thực tế
            const existing = debtRes.rows[0];
            const newPaidAmount = Number(existing.paid_amount) + Number(amount || 0);
            const totalAmount = Number(existing.total_amount);
            const newStatus = newPaidAmount >= totalAmount - 0.01 ? 'paid'
                            : newPaidAmount > 0 ? 'partial'
                            : 'unpaid';
            await client.query(
                `UPDATE debts SET paid_amount = $1, status = $2, updated_by = $3, updated_at = NOW() WHERE id = $4`,
                [newPaidAmount, newStatus, confirmedBy, existing.id]
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

// ==================== PHÂN BỔ THANH TOÁN ====================

/**
 * Preview phân bổ thanh toán - xem trước sẽ chia tiền vào đâu
 */
const previewAllocation = async (personType, personId, amount) => {
    const personField = personType === 'driver' ? 'd.driver_id' : 'd.customer_id';
    const debtType = personType === 'driver' ? 'driver' : 'customer';

    // Lấy tất cả khoản nợ chưa trả hết của person này, sắp xếp theo thời gian (cũ trước)
    const result = await pool.query(`
        SELECT
            d.id AS debt_id,
            d.shipment_id,
            d.total_amount::text,
            d.paid_amount::text,
            (d.total_amount - d.paid_amount)::text AS remaining,
            o.cargo_name AS order_cargo_name,
            o.created_at AS order_date
        FROM debts d
        LEFT JOIN orders o ON o.id = d.order_id
        WHERE ${personField} = $1
          AND d.debt_type = $2
          AND d.status != 'paid'
          AND (d.total_amount - d.paid_amount) > 0.01
        ORDER BY d.created_at ASC
    `, [personId, debtType]);

    // Tính tổng nợ còn lại
    let totalRemaining = 0;
    result.rows.forEach(row => {
        totalRemaining += Number(row.remaining);
    });

    // Phân bổ số tiền
    let remainingPayment = Number(amount);
    const preview = [];
    let totalAllocated = 0;

    for (const row of result.rows) {
        if (remainingPayment <= 0) break;

        const debtRemaining = Number(row.remaining);
        const allocateAmount = Math.min(remainingPayment, debtRemaining);

        if (allocateAmount > 0) {
            const newPaid = Number(row.paid_amount) + allocateAmount;
            const newStatus = newPaid >= Number(row.total_amount) - 0.01 ? 'paid' : 'partial';

            preview.push({
                debtId: row.debt_id,
                shipmentId: row.shipment_id,
                orderCargoName: row.order_cargo_name,
                totalAmount: Number(row.total_amount),
                paidAmount: Number(row.paid_amount),
                remaining: debtRemaining,
                allocateAmount: allocateAmount,
                newStatus: newStatus
            });

            totalAllocated += allocateAmount;
            remainingPayment -= allocateAmount;
        }
    }

    return {
        preview,
        totalDebt: totalRemaining + totalAllocated,
        totalRemaining,
        requestedAmount: Number(amount),
        totalAllocated,
        overpayment: Math.max(0, remainingPayment)
    };
};

/**
 * Phân bổ thanh toán - ghi thu tiền và tự động chia vào các khoản nợ
 */
const allocatePayment = async (personType, personId, paymentData) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const personField = personType === 'driver' ? 'd.driver_id' : 'd.customer_id';
        const debtType = personType === 'driver' ? 'driver' : 'customer';

        // Lấy tất cả khoản nợ chưa trả hết
        const debtsRes = await client.query(`
            SELECT
                d.id AS debt_id,
                d.total_amount,
                d.paid_amount,
                d.driver_id,
                d.customer_id,
                d.shipment_id,
                (d.total_amount - d.paid_amount) AS remaining
            FROM debts d
            WHERE ${personField} = $1
              AND d.debt_type = $2
              AND d.status != 'paid'
              AND (d.total_amount - d.paid_amount) > 0.01
            ORDER BY d.created_at ASC
            FOR UPDATE
        `, [personId, debtType]);

        // Validate: không thu quá số dư
        let totalRemaining = 0;
        debtsRes.rows.forEach(row => {
            totalRemaining += Number(row.remaining);
        });

        const requestedAmount = Number(paymentData.amount);
        if (requestedAmount > totalRemaining + 0.01) {
            throw new Error(
                `Số tiền thanh toán (${requestedAmount.toLocaleString('vi-VN')}đ) vượt quá số dư công nợ (${totalRemaining.toLocaleString('vi-VN')}đ)`
            );
        }

        // Phân bổ và tạo payments
        let remainingPayment = requestedAmount;
        const allocations = [];
        const payments = [];

        for (const debt of debtsRes.rows) {
            if (remainingPayment <= 0) break;

            const debtRemaining = Number(debt.remaining);
            const paymentForThisDebt = Math.min(remainingPayment, debtRemaining);

            if (paymentForThisDebt > 0) {
                // INSERT debt_payment
                const paymentRes = await client.query(`
                    INSERT INTO debt_payments (
                        debt_id, amount, payment_method,
                        status, paid_at, confirmed_at, confirmed_by,
                        created_by, notes
                    )
                    VALUES ($1, $2, $3, 'confirmed', NOW(), NOW(), $4, $4, $5)
                    RETURNING id, debt_id, amount
                `, [
                    debt.debt_id,
                    paymentForThisDebt,
                    paymentData.paymentMethod || 'cash',
                    paymentData.createdBy,
                    paymentData.notes || 'Phan bo thanh toan tu dong'
                ]);

                // UPDATE debt
                const newPaid = Number(debt.paid_amount) + paymentForThisDebt;
                const newStatus = newPaid >= Number(debt.total_amount) - 0.01 ? 'paid' : 'partial';

                await client.query(`
                    UPDATE debts SET
                        paid_amount = $1,
                        status = $2,
                        updated_by = $3,
                        updated_at = NOW()
                    WHERE id = $4
                `, [newPaid, newStatus, paymentData.createdBy, debt.debt_id]);

                allocations.push({
                    debtId: debt.debt_id,
                    shipmentId: debt.shipment_id,
                    amount: paymentForThisDebt,
                    previousPaid: Number(debt.paid_amount),
                    newPaid: newPaid,
                    newStatus: newStatus
                });

                payments.push(paymentRes.rows[0]);
                remainingPayment -= paymentForThisDebt;
            }
        }

        // UPDATE customer/driver current_debt
        const totalAllocated = requestedAmount - remainingPayment;
        if (totalAllocated > 0) {
            if (personType === 'customer') {
                await client.query(`
                    UPDATE customers
                    SET current_debt = GREATEST(0, current_debt - $1),
                        updated_at = NOW()
                    WHERE id = $2
                `, [totalAllocated, personId]);
            }
            // driver không có current_debt trong schema hiện tại
        }

        await client.query('COMMIT');

        return {
            success: true,
            totalAllocated,
            overpayment: remainingPayment,
            allocations,
            payments
        };

    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

/**
 * Ghi thu cho 1 shipment cụ thể
 */
const recordPaymentByShipment = async (shipmentId, paymentData) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Tìm debt của shipment
        let debtRes = await client.query(
            `SELECT id, total_amount, paid_amount, customer_id, driver_id
             FROM debts WHERE shipment_id = $1 AND debt_type = 'customer' LIMIT 1`,
            [shipmentId]
        );

        // Nếu chưa có debt, tạo mới từ shipment
        if (debtRes.rows.length === 0) {
            const shipmentInfo = await client.query(`
                SELECT os.estimated_price, os.owner_driver_id, o.customer_id, o.id AS order_id
                FROM order_shipments os
                JOIN orders o ON o.id = os.order_id
                WHERE os.id = $1
            `, [shipmentId]);

            if (shipmentInfo.rows.length === 0) {
                throw new Error('Shipment not found');
            }

            const si = shipmentInfo.rows[0];
            const debtInsert = await client.query(`
                INSERT INTO debts (
                    debt_type, customer_id, driver_id, order_id, shipment_id,
                    total_amount, paid_amount, status, created_at, updated_at
                )
                VALUES ('customer', $1, $2, $3, $4, $5, 0, 'unpaid', NOW(), NOW())
                RETURNING id, total_amount, paid_amount, customer_id
            `, [si.customer_id, si.owner_driver_id, si.order_id, shipmentId, Number(si.estimated_price) || 0]);

            debtRes = debtInsert;
        }

        const debt = debtRes.rows[0];
        const numericAmount = Number(paymentData.amount);
        const newPaidAmount = Number(debt.paid_amount) + numericAmount;
        const totalAmount = Number(debt.total_amount);
        const remainingDebt = totalAmount - Number(debt.paid_amount);

        if (numericAmount > remainingDebt + 0.01) {
            throw new Error(
                `Số tiền thanh toán (${numericAmount.toLocaleString('vi-VN')}đ) vượt quá số dư (${remainingDebt.toLocaleString('vi-VN')}đ)`
            );
        }

        const newStatus = newPaidAmount >= totalAmount - 0.01 ? 'paid' : 'partial';

        // INSERT payment
        const paymentRes = await client.query(`
            INSERT INTO debt_payments (
                debt_id, amount, payment_method,
                status, paid_at, confirmed_at, confirmed_by,
                created_by, notes
            )
            VALUES ($1, $2, $3, 'confirmed', NOW(), NOW(), $4, $4, $5)
            RETURNING id, debt_id, amount
        `, [
            debt.id,
            numericAmount,
            paymentData.paymentMethod || 'cash',
            paymentData.createdBy,
            paymentData.notes || null
        ]);

        // UPDATE debt
        await client.query(`
            UPDATE debts SET
                paid_amount = $1,
                status = $2,
                updated_by = $3,
                updated_at = NOW()
            WHERE id = $4
        `, [newPaidAmount, newStatus, paymentData.createdBy, debt.id]);

        // UPDATE customer current_debt
        if (debt.customer_id && numericAmount > 0) {
            await client.query(`
                UPDATE customers
                SET current_debt = GREATEST(0, current_debt - $1),
                    updated_at = NOW()
                WHERE id = $2
            `, [numericAmount, debt.customer_id]);
        }

        await client.query('COMMIT');

        return {
            success: true,
            payment: paymentRes.rows[0],
            newPaidAmount,
            newStatus,
            debtId: debt.id
        };

    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

/**
 * Ghi thu cho 1 debt cụ thể
 */
const recordPaymentByDebt = async (debtId, paymentData) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const debtRes = await client.query(
            `SELECT id, total_amount, paid_amount, customer_id, driver_id
             FROM debts WHERE id = $1`,
            [debtId]
        );

        if (debtRes.rows.length === 0) {
            throw new Error('Debt not found');
        }

        const debt = debtRes.rows[0];
        const numericAmount = Number(paymentData.amount);
        const newPaidAmount = Number(debt.paid_amount) + numericAmount;
        const totalAmount = Number(debt.total_amount);
        const remainingDebt = totalAmount - Number(debt.paid_amount);

        if (numericAmount > remainingDebt + 0.01) {
            throw new Error(
                `Số tiền thanh toán (${numericAmount.toLocaleString('vi-VN')}đ) vượt quá số dư (${remainingDebt.toLocaleString('vi-VN')}đ)`
            );
        }

        const newStatus = newPaidAmount >= totalAmount - 0.01 ? 'paid' : 'partial';

        // INSERT payment
        const paymentRes = await client.query(`
            INSERT INTO debt_payments (
                debt_id, amount, payment_method,
                status, paid_at, confirmed_at, confirmed_by,
                created_by, notes
            )
            VALUES ($1, $2, $3, 'confirmed', NOW(), NOW(), $4, $4, $5)
            RETURNING id, debt_id, amount
        `, [
            debtId,
            numericAmount,
            paymentData.paymentMethod || 'cash',
            paymentData.createdBy,
            paymentData.notes || null
        ]);

        // UPDATE debt
        await client.query(`
            UPDATE debts SET
                paid_amount = $1,
                status = $2,
                updated_by = $3,
                updated_at = NOW()
            WHERE id = $4
        `, [newPaidAmount, newStatus, paymentData.createdBy, debtId]);

        // UPDATE customer current_debt
        if (debt.customer_id && numericAmount > 0) {
            await client.query(`
                UPDATE customers
                SET current_debt = GREATEST(0, current_debt - $1),
                    updated_at = NOW()
                WHERE id = $2
            `, [numericAmount, debt.customer_id]);
        }

        await client.query('COMMIT');

        return {
            success: true,
            payment: paymentRes.rows[0],
            newPaidAmount,
            newStatus,
            debtId: debt.id
        };

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
    // Phân bổ thanh toán
    previewAllocation,
    allocatePayment,
    recordPaymentByShipment,
    recordPaymentByDebt,
};
