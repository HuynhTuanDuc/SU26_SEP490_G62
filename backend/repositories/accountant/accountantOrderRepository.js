const pool = require('../../config/database');

const buildDebtStatus = (paidAmount, totalAmount) => {
    if (paidAmount >= totalAmount - 0.01) return 'paid';
    if (paidAmount > 0) return 'partial';
    return 'unpaid';
};

const trimToNull = (value) => {
    const text = String(value || '').trim();
    return text || null;
};

const buildOrderNotes = (orderData) => {
    const segments = [];
    if (orderData.order_date) segments.push(`Ngày đơn: ${orderData.order_date}`);
    if (trimToNull(orderData.notes)) segments.push(trimToNull(orderData.notes));
    return segments.filter(Boolean).join(' | ') || null;
};

const buildShipmentNotes = (s) => {
    return trimToNull(s.notes);
};

const buildOrderCargoName = (shipments = []) => {
    const cargoNames = shipments
        .map((s) => trimToNull(s.cargo_name))
        .filter(Boolean);
    const uniqueNames = [...new Set(cargoNames)];
    if (uniqueNames.length === 0) return null;
    return uniqueNames.join(', ');
};

const buildOrderPaymentType = (shipments = []) => {
    const paymentTypes = shipments
        .map((s) => normalizeCustomerDebtPaymentType(s.payment_type))
        .filter(Boolean);
    const uniqueTypes = [...new Set(paymentTypes)];
    return uniqueTypes.length === 1 ? uniqueTypes[0] : null;
};

const findOrCreateCustomer = async (client, { phone, name, companyName }) => {
    const cleanPhone = trimToNull(phone);
    const cleanName = trimToNull(name);
    const cleanCompanyName = trimToNull(companyName);

    // Nếu SĐT đã tồn tại → luôn giữ nguyên tên gốc trong DB, KHÔNG cập nhật
    const lookup = await client.query(
        `SELECT id, full_name, company_name
         FROM customers
         WHERE phone = $1
         ORDER BY id ASC LIMIT 1`,
        [cleanPhone]
    );
    if (lookup.rows.length > 0) {
        return lookup.rows[0].id;
    }
    const insert = await client.query(
        `INSERT INTO customers (customer_type, full_name, company_name, phone, address, current_debt, created_at, updated_at)
         VALUES ('individual', $1, $2, $3, '', 0, NOW(), NOW()) RETURNING id`,
        [cleanName, cleanCompanyName, cleanPhone]
    );
    return insert.rows[0].id;
};

const findVehicleById = async (client, id) => {
    if (!id) return null;
    const result = await client.query(
        `SELECT id FROM vehicles WHERE id = $1 LIMIT 1`,
        [Number(id)]
    );
    return result.rows.length > 0 ? result.rows[0].id : null;
};

const findVehicleByPlate = async (client, plate) => {
    if (!plate) return null;
    const result = await client.query(
        `SELECT id FROM vehicles WHERE plate_number = $1 LIMIT 1`,
        [plate.trim()]
    );
    return result.rows.length > 0 ? result.rows[0].id : null;
};

const findDriverById = async (client, id) => {
    if (!id) return null;
    const result = await client.query(
        `SELECT p.id
         FROM profiles p
         JOIN drivers d ON d.profile_id = p.id
         WHERE p.id = $1
         LIMIT 1`,
        [Number(id)]
    );
    return result.rows.length > 0 ? result.rows[0].id : null;
};

const findDriverByName = async (client, name) => {
    if (!name) return null;
    const result = await client.query(
        `SELECT p.id
         FROM profiles p
         JOIN drivers d ON d.profile_id = p.id
         WHERE LOWER(p.full_name) = LOWER($1)
         LIMIT 1`,
        [name.trim()]
    );
    return result.rows.length > 0 ? result.rows[0].id : null;
};

const insertShipmentWithStopsAndExpenses = async (client, {
    orderId, shipmentIndex,
    vehicleId, driverId, estimatedPrice, actualPrice,
    cargoName, cargoWeight, shipmentNotes,
    pickupAddresses, deliveryAddress, contactName, contactPhone,
    expenses, createdByUserId,
}) => {
    const shipmentResult = await client.query(
        `INSERT INTO order_shipments (
            order_id, shipment_index,
            vehicle_id, owner_driver_id,
            estimated_price, actual_price,
            cargo_name, cargo_weight_kg,
            status, notes, completed_at, created_at, updated_at
        )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'completed', $9, NOW(), NOW(), NOW())
         RETURNING id`,
        [
            orderId, shipmentIndex,
            vehicleId, driverId,
            estimatedPrice, actualPrice || null,
            cargoName || null, cargoWeight || 0,
            shipmentNotes,
        ]
    );
    const shipmentId = shipmentResult.rows[0].id;

    for (let i = 0; i < pickupAddresses.length; i += 1) {
        await client.query(
            `INSERT INTO trip_stops (
                shipment_id, stop_index, stop_type,
                address, contact_name, contact_phone, notes, completed_at, created_at
            )
             VALUES ($1, $2, 'pickup', $3, $4, $5, $6, NOW(), NOW())`,
            [shipmentId, i + 1, pickupAddresses[i], contactName, contactPhone, shipmentNotes]
        );
    }

    await client.query(
        `INSERT INTO trip_stops (
            shipment_id, stop_index, stop_type,
            address, contact_name, contact_phone, notes, completed_at, created_at
        )
         VALUES ($1, $2, 'delivery', $3, $4, $5, $6, NOW(), NOW())`,
        [shipmentId, pickupAddresses.length + 1, deliveryAddress, contactName, contactPhone, shipmentNotes]
    );

    for (const expense of (expenses || [])) {
        await client.query(
            `INSERT INTO expenses (
                shipment_id, vehicle_id, created_by, updated_by,
                expense_type, amount, description, expense_date,
                created_at, updated_at
            )
             VALUES ($1, $2, $3, $3, $4, $5, $6, CURRENT_DATE, NOW(), NOW())`,
            [
                shipmentId,
                vehicleId,
                createdByUserId,
                expense.expense_type,
                expense.amount,
                expense.description || null,
            ]
        );
    }

    return shipmentId;
};

const PASS_THROUGH_EXPENSE_TYPES = new Set(['toll', 'parking']);

const normalizeCustomerDebtPaymentType = (paymentType) => {
    if (!paymentType) return null;
    if (paymentType === 'debt') return 'client_credit';
    return paymentType;
};

const insertDebtForShipment = async (client, {
    shipmentId, orderId, driverId, customerId, partnerId,
    actualPrice,
    driverPaymentState, paymentType,
    createdByUserId,
}) => {
    const normalizedPaymentType = normalizeCustomerDebtPaymentType(paymentType);
    if (Number(actualPrice || 0) <= 0) return;

    // Tài xế giữ tiền chỉ áp dụng khi khách đã thanh toán tiền mặt/chuyển khoản.
    if (
        driverPaymentState === 'driver_holding'
        && ['cash', 'bank_transfer', 'qr_transfer'].includes(normalizedPaymentType)
    ) {
        if (!driverId) {
            throw new Error('Không thể tạo công nợ tài xế khi chuyến chưa có tài xế.');
        }
        const debtStatus = buildDebtStatus(0, actualPrice);
        await client.query(
            `INSERT INTO debts (
                debt_type, driver_id, customer_id, partner_id, order_id, shipment_id,
                total_amount, paid_amount, due_date, status, notes,
                updated_by, created_at, updated_at
            )
             VALUES ('driver', $1, NULL, NULL, $2, $3, $4, 0,
                CURRENT_DATE + INTERVAL '30 days', $5,
                'Tai xe da thu nhung chua mang tien ve cong ty',
                $6, NOW(), NOW())`,
            [driverId, orderId, shipmentId, actualPrice, debtStatus, createdByUserId]
        );
    } else if (normalizedPaymentType === 'client_credit') {
        // Khách nợ → tạo công nợ khách (chỉ set customer_id, các FK khác = NULL)
        const debtStatus = buildDebtStatus(0, actualPrice);
        await client.query(
            `INSERT INTO debts (
                debt_type, driver_id, customer_id, partner_id, order_id, shipment_id,
                total_amount, paid_amount, due_date, status, notes,
                updated_by, created_at, updated_at
            )
             VALUES ('customer', NULL, $1, NULL, $2, $3, $4, 0,
                CURRENT_DATE + INTERVAL '30 days', $5,
                'Khach chua thanh toan', $6, NOW(), NOW())`,
            [customerId, orderId, shipmentId, actualPrice, debtStatus, createdByUserId]
        );
        await client.query(
            `UPDATE customers
             SET current_debt = current_debt + $1, updated_at = NOW()
             WHERE id = $2`,
            [actualPrice, customerId]
        );
    } else if (partnerId && normalizedPaymentType === 'partner') {
        // Đối tác nợ (chưa dùng — để cấu trúc sẵn cho sau)
        const debtStatus = buildDebtStatus(0, actualPrice);
        await client.query(
            `INSERT INTO debts (
                debt_type, driver_id, customer_id, partner_id, order_id, shipment_id,
                total_amount, paid_amount, due_date, status, notes,
                updated_by, created_at, updated_at
            )
             VALUES ('partner', NULL, NULL, $1, $2, $3, $4, 0,
                CURRENT_DATE + INTERVAL '30 days', $5,
                'Doi tac chua thanh toan', $6, NOW(), NOW())`,
            [partnerId, orderId, shipmentId, actualPrice, debtStatus, createdByUserId]
        );
    }
    // Nếu đã thu đủ (cash/bank_transfer + company_received) → không tạo công nợ, không ghi payment
};

const createOrderWithShipments = async (orderData) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Nếu đã có customer_id (chọn từ danh sách) → dùng trực tiếp, không tìm theo SĐT
    const customerId = orderData.customer_id
        ? Number(orderData.customer_id)
        : await findOrCreateCustomer(client, {
              phone: orderData.customer_phone,
              name: orderData.customer_name,
              companyName: orderData.customer_company,
          });

    const computeActualPrice = (shipment) => {
        const passThrough = (shipment.expenses || []).reduce(
            (sum, e) => sum + (PASS_THROUGH_EXPENSE_TYPES.has(e.expense_type) ? Number(e.amount || 0) : 0),
            0
        );
        return Number(shipment.cargo_fee || 0) + passThrough;
    };

    const totalActualPrice = (orderData.shipments || []).reduce((sum, s) => sum + computeActualPrice(s), 0);
    const orderNotes = buildOrderNotes(orderData);
    const orderCargoName = buildOrderCargoName(orderData.shipments || []);
    const orderPaymentType = buildOrderPaymentType(orderData.shipments || []);

    const orderResult = await client.query(
        `INSERT INTO orders (
            customer_id, created_by, updated_by,
            cargo_name, payment_type,
            total_estimated_price, total_actual_price, prepaid_amount,
            derived_status, notes, created_at, updated_at
        )
         VALUES ($1, $2, $2, $3, $4, $5, $5, $6, 'completed', $7, NOW(), NOW())
         RETURNING *`,
        [
            customerId,
            orderData.created_by,
            orderCargoName,
            orderPaymentType,
            totalActualPrice,
            Number(orderData.prepaid_amount || 0),
            orderNotes,
        ]
    );
        const newOrder = orderResult.rows[0];

        const shipmentIds = [];
        for (let i = 0; i < (orderData.shipments || []).length; i += 1) {
            const s = orderData.shipments[i];
            const vehicleId = await findVehicleById(client, s.vehicle_id) || await findVehicleByPlate(client, s.vehicle_plate);
            const driverId = await findDriverById(client, s.driver_id) || await findDriverByName(client, s.driver_name);
            const actualPrice = computeActualPrice(s);
            const shipmentNotes = buildShipmentNotes(s);
            const pickupAddresses = (s.pickup_addresses || []).filter((p) => String(p || '').trim() !== '');

            const shipmentId = await insertShipmentWithStopsAndExpenses(client, {
                orderId: newOrder.id,
                shipmentIndex: i + 1,
                vehicleId,
                driverId,
                estimatedPrice: actualPrice,
                actualPrice,
                cargoName: trimToNull(s.cargo_name),
                cargoWeight: s.cargo_weight,
                shipmentNotes,
                pickupAddresses,
                deliveryAddress: trimToNull(s.delivery_address),
                contactName: trimToNull(orderData.customer_name),
                contactPhone: trimToNull(orderData.customer_phone),
                expenses: s.expenses || [],
                createdByUserId: orderData.created_by,
            });

            await insertDebtForShipment(client, {
                shipmentId,
                orderId: newOrder.id,
                driverId,
                customerId,
                partnerId: s.partner_id || orderData.partner_id || null,
                actualPrice,
                driverPaymentState: s.driver_payment_state || 'company_received',
                paymentType: s.payment_type || null,
                createdByUserId: orderData.created_by,
            });

            shipmentIds.push(shipmentId);
        }

        await client.query('COMMIT');

        const result = await pool.query(
            `SELECT
                o.id, o.cargo_name, o.payment_type, o.prepaid_amount,
                o.total_estimated_price, o.derived_status, o.notes,
                o.created_at,
                COALESCE(c.full_name, c.company_name) AS customer_name, c.company_name AS customer_company, c.phone AS customer_phone,
                COUNT(DISTINCT os.id) AS shipment_count,
                SUM(os.estimated_price) AS total_shipment_price,
                (SELECT SUM(e.amount) FROM expenses e WHERE e.shipment_id = ANY($1::int[])) AS total_expenses
             FROM orders o
             LEFT JOIN customers c ON c.id = o.customer_id
             LEFT JOIN order_shipments os ON os.order_id = o.id
             WHERE o.id = $2
             GROUP BY o.id, c.full_name, c.company_name, c.phone`,
            [shipmentIds, newOrder.id]
        );
        return result.rows[0];
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

const getAllOrders = async (filters = {}, page = null, limit = null) => {
    const params = [];
    const conditions = [`o.derived_status = 'completed'`];

    if (filters.search) {
        params.push(`%${filters.search}%`);
        conditions.push(`(
            o.cargo_name ILIKE $${params.length}
            OR CAST(o.id AS TEXT) LIKE $${params.length}
            OR c.full_name ILIKE $${params.length}
            OR c.company_name ILIKE $${params.length}
            OR c.phone ILIKE $${params.length}
            OR o.notes ILIKE $${params.length}
        )`);
    }

    if (filters.debt_status) {
        params.push(filters.debt_status);
        conditions.push(`d_agg.debt_status = $${params.length}`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // Lateral joins — each returns exactly 1 row per order, no GROUP BY needed
    const lateralJoins = `
        LEFT JOIN LATERAL (
            SELECT
                CASE
                    WHEN COUNT(*) = 0 THEN 'paid'
                    WHEN SUM(paid_amount) >= SUM(total_amount) - 0.01 THEN 'paid'
                    WHEN SUM(paid_amount) > 0 THEN 'partial'
                    ELSE 'unpaid'
                END AS debt_status,
                COALESCE(SUM(total_amount), 0) AS debt_total,
                COALESCE(SUM(paid_amount), 0)  AS debt_paid
            FROM debts
            WHERE order_id = o.id AND debt_type = 'customer'
        ) d_agg ON TRUE
        LEFT JOIN LATERAL (
            SELECT GREATEST(COALESCE(SUM(total_amount - paid_amount), 0), 0) AS driver_debt_remaining
            FROM debts
            WHERE order_id = o.id AND debt_type = 'driver'
        ) dd_agg ON TRUE
        LEFT JOIN LATERAL (
            SELECT
                COALESCE(SUM(estimated_price), 0) AS estimated_price,
                COALESCE(SUM(actual_price), 0)    AS actual_price,
                COUNT(*)                           AS shipment_count
            FROM order_shipments
            WHERE order_id = o.id
        ) ship_agg ON TRUE
        LEFT JOIN LATERAL (
            SELECT COALESCE(SUM(e.amount), 0) AS total_expenses
            FROM expenses e
            JOIN order_shipments os ON os.id = e.shipment_id
            WHERE os.order_id = o.id
        ) exp_agg ON TRUE
    `;

    const baseFrom = `
        FROM orders o
        LEFT JOIN customers c ON o.customer_id = c.id
        ${lateralJoins}
    `;

    const countQuery = `SELECT COUNT(DISTINCT o.id) ${baseFrom} ${whereClause}`;
    const countResult = await pool.query(countQuery, params);
    const totalItems = Number.parseInt(countResult.rows[0].count, 10);

    let selectQuery = `
        SELECT
            o.id,
            o.cargo_name,
            o.payment_type,
            ship_agg.estimated_price,
            ship_agg.actual_price,
            o.derived_status AS status,
            o.notes,
            o.created_at,
            COALESCE(c.full_name, c.company_name) AS customer_name,
            c.company_name   AS customer_company,
            c.phone          AS customer_phone,
            d_agg.debt_total,
            d_agg.debt_paid,
            GREATEST(d_agg.debt_total - d_agg.debt_paid, 0) AS debt_remaining,
            d_agg.debt_status,
            ship_agg.shipment_count,
            dd_agg.driver_debt_remaining,
            exp_agg.total_expenses,
            GREATEST(
                ship_agg.actual_price
                - dd_agg.driver_debt_remaining
                - GREATEST(d_agg.debt_total - d_agg.debt_paid, 0),
                0
            ) AS company_received
        ${baseFrom}
        ${whereClause}
        ORDER BY o.created_at DESC
    `;

    const queryParams = [...params];
    if (page !== null && limit !== null) {
        queryParams.push(limit, (page - 1) * limit);
        selectQuery += ` LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}`;
    }

    const result = await pool.query(selectQuery, queryParams);
    return {
        orders: result.rows,
        totalItems,
        totalPages: limit ? Math.ceil(totalItems / limit) : 1,
        currentPage: page || 1,
        limit: limit || totalItems,
    };
};

const getOrderShipments = async (orderId) => {
    const shipmentResult = await pool.query(
        `SELECT
            os.id,
            os.shipment_index,
            os.vehicle_id,
            os.owner_driver_id,
            os.estimated_price,
            os.actual_price,
            os.cargo_name,
            os.cargo_weight_kg,
            os.status,
            os.notes,
            os.completed_at,
            os.created_at,
            v.plate_number AS vehicle_plate,
            p.full_name AS driver_name,
            COALESCE(e_agg.total_expenses, 0) AS total_expenses,
            COALESCE(e_detail.fuel, 0)         AS fuel,
            COALESCE(e_detail.toll, 0)         AS toll,
            COALESCE(e_detail.parking, 0)      AS parking,
            COALESCE(e_detail.repair, 0)       AS repair,
            COALESCE(e_detail.maintenance, 0)  AS maintenance,
            COALESCE(e_detail.other, 0)        AS other
        FROM order_shipments os
        LEFT JOIN vehicles v ON v.id = os.vehicle_id
        LEFT JOIN profiles p ON p.id = os.owner_driver_id
        LEFT JOIN LATERAL (
            SELECT SUM(amount) AS total_expenses
            FROM expenses
            WHERE shipment_id = os.id
        ) e_agg ON TRUE
        LEFT JOIN LATERAL (
            SELECT
                COALESCE(SUM(CASE WHEN expense_type = 'fuel' THEN amount ELSE 0 END), 0)        AS fuel,
                COALESCE(SUM(CASE WHEN expense_type = 'toll' THEN amount ELSE 0 END), 0)        AS toll,
                COALESCE(SUM(CASE WHEN expense_type = 'parking' THEN amount ELSE 0 END), 0)     AS parking,
                COALESCE(SUM(CASE WHEN expense_type = 'repair' THEN amount ELSE 0 END), 0)      AS repair,
                COALESCE(SUM(CASE WHEN expense_type = 'maintenance' THEN amount ELSE 0 END), 0) AS maintenance,
                COALESCE(SUM(CASE WHEN expense_type = 'other' THEN amount ELSE 0 END), 0)       AS other
            FROM expenses
            WHERE shipment_id = os.id
        ) e_detail ON TRUE
        WHERE os.order_id = $1
        ORDER BY os.shipment_index ASC`,
        [orderId]
    );

    const shipments = [];
    for (const row of shipmentResult.rows) {
        const stopsResult = await pool.query(
            `SELECT stop_type, address, contact_name, contact_phone
             FROM trip_stops
             WHERE shipment_id = $1
             ORDER BY stop_index ASC`,
            [row.id]
        );

        const pickup_addresses = stopsResult.rows
            .filter((s) => s.stop_type === 'pickup')
            .map((s) => ({
                address: s.address,
                contact_name: s.contact_name,
                contact_phone: s.contact_phone,
            }));

        const deliveryRow = stopsResult.rows.find((s) => s.stop_type === 'delivery');
        const debtResult = await pool.query(
            `SELECT status AS driver_payment_state, total_amount, paid_amount
             FROM debts
             WHERE shipment_id = $1 AND debt_type = 'driver'
             LIMIT 1`,
            [row.id]
        );
        const debtRow = debtResult.rows[0] || {};
        const paymentResult = await pool.query(
            `SELECT dp.payment_method AS payment_type, dp.amount
             FROM debt_payments dp
             JOIN debts d ON d.id = dp.debt_id
             WHERE d.shipment_id = $1
             ORDER BY dp.paid_at DESC
             LIMIT 1`,
            [row.id]
        );
        const paymentRow = paymentResult.rows[0] || {};

        shipments.push({
            id: row.id,
            shipment_index: row.shipment_index,
            order_id: orderId,
            vehicle_plate: row.vehicle_plate || row.notes?.match(/BKS:\s*([^\s|]+)/)?.[1] || null,
            driver_name: row.driver_name || row.notes?.match(/Tài xế:\s*([^\s|]+)/)?.[1] || null,
            cargo_name: row.cargo_name,
            cargo_weight: row.cargo_weight_kg,
            cargo_fee: row.estimated_price,
            actual_price: Number(row.actual_price) || 0,
            total_expenses: Number(row.total_expenses) || 0,
            expenses: {
                fuel: Number(row.fuel) || 0,
                toll: Number(row.toll) || 0,
                parking: Number(row.parking) || 0,
                repair: Number(row.repair) || 0,
                maintenance: Number(row.maintenance) || 0,
                other: Number(row.other) || 0,
            },
            status: row.status,
            notes: row.notes,
            pickup_addresses,
            delivery_address: deliveryRow?.address || null,
            payment_type: paymentRow.payment_type || null,
            driver_payment_state: debtRow.driver_payment_state || null,
            driver_total: debtRow.total_amount ? Number(debtRow.total_amount) : null,
            driver_paid: debtRow.paid_amount ? Number(debtRow.paid_amount) : 0,
        });
    }

    return shipments;
};

const updateOrder = async (orderId, orderData) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Update customers table
        if (orderData.customer_phone) {
            const customerResult = await client.query(
                `SELECT id FROM customers WHERE phone = $1 LIMIT 1`,
                [orderData.customer_phone]
            );
            if (customerResult.rows.length > 0) {
                await client.query(
                    `UPDATE customers SET
                        full_name = COALESCE($1, full_name),
                        company_name = COALESCE($2, company_name),
                        updated_at = NOW()
                     WHERE id = $3`,
                    [
                        orderData.customer_name || null,
                        orderData.customer_company || null,
                        customerResult.rows[0].id,
                    ]
                );
            }
        }

        // Update orders table
        const orderNotes = [
            orderData.order_date ? `Ngày đơn: ${orderData.order_date}` : null,
            orderData.notes,
        ].filter(Boolean).join(' | ') || null;

        const shouldUpdateCargoName = Object.prototype.hasOwnProperty.call(orderData, 'cargo_name');
        await client.query(
            `UPDATE orders SET
                cargo_name = CASE WHEN $4 THEN $1 ELSE cargo_name END,
                notes = $2,
                updated_at = NOW()
             WHERE id = $3`,
            [trimToNull(orderData.cargo_name), orderNotes, orderId, shouldUpdateCargoName]
        );

        await client.query('COMMIT');

        const result = await pool.query(
            `SELECT
                o.id, o.cargo_name, o.notes, o.derived_status, o.created_at,
                c.full_name AS customer_name, c.company_name AS customer_company, c.phone AS customer_phone
             FROM orders o
             LEFT JOIN customers c ON c.id = o.customer_id
             WHERE o.id = $1`,
            [orderId]
        );
        return result.rows[0] || { id: orderId };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

module.exports = {
    getAllOrders,
    getOrderShipments,
    createOrderWithShipments,
    updateOrder,
};
