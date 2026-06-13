const pool = require('../../config/database');

const buildDebtStatus = (paidAmount, totalAmount) => {
    if (paidAmount >= totalAmount - 0.01) return 'paid';
    if (paidAmount > 0) return 'partial';
    return 'unpaid';
};

const buildOrderNotes = (orderData) => {
    const segments = [];
    if (orderData.order_date) segments.push(`Ngày đơn: ${orderData.order_date}`);
    if (orderData.notes) segments.push(orderData.notes);
    return segments.filter(Boolean).join(' | ') || null;
};

const buildShipmentNotes = (s) => {
    const segments = [];
    if (s.vehicle_plate) segments.push(`BKS: ${s.vehicle_plate}`);
    if (s.driver_name) segments.push(`Tài xế: ${s.driver_name}`);
    if (s.cargo_fee !== undefined) segments.push(`Cước: ${s.cargo_fee}`);
    if (s.ticket_fee !== undefined) segments.push(`Vé: ${s.ticket_fee}`);
    if (s.revenue !== undefined) segments.push(`Doanh thu: ${s.revenue}`);
    if (s.payment_type) segments.push(`TT: ${s.payment_type}`);
    if (s.notes) segments.push(s.notes);
    return segments.filter(Boolean).join(' | ') || null;
};

const findOrCreateCustomer = async (client, { phone, name, companyName }) => {
    // Nếu SĐT đã tồn tại → luôn giữ nguyên tên gốc trong DB, KHÔNG cập nhật
    const lookup = await client.query(
        `SELECT id, full_name, company_name
         FROM customers
         WHERE phone = $1
         ORDER BY id ASC LIMIT 1`,
        [phone]
    );
    if (lookup.rows.length > 0) {
        return lookup.rows[0].id;
    }
    const insert = await client.query(
        `INSERT INTO customers (customer_type, full_name, company_name, phone, address, current_debt, created_at, updated_at)
         VALUES ('individual', $1, $2, $3, '', 0, NOW(), NOW()) RETURNING id`,
        [name || null, companyName || null, phone]
    );
    return insert.rows[0].id;
};

const findVehicleByPlate = async (client, plate) => {
    if (!plate) return null;
    const result = await client.query(
        `SELECT id FROM vehicles WHERE plate_number = $1 LIMIT 1`,
        [plate.trim()]
    );
    return result.rows.length > 0 ? result.rows[0].id : null;
};

const findDriverByName = async (client, name) => {
    if (!name) return null;
    const result = await client.query(
        `SELECT id FROM profiles WHERE full_name ILIKE $1 LIMIT 1`,
        [`%${name.trim()}%`]
    );
    return result.rows.length > 0 ? result.rows[0].id : null;
};

const getDefaultVehicleGroupId = async (client) => {
    const fallback = await client.query(
        `SELECT id FROM vehicle_groups ORDER BY id ASC LIMIT 1`
    );
    if (fallback.rows.length === 0) {
        throw new Error('Không tìm thấy nhóm xe mặc định');
    }
    return fallback.rows[0].id;
};

const insertShipmentWithStopsAndExpenses = async (client, {
    orderId, shipmentIndex, vehicleGroupId,
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

const insertDebtForShipment = async (client, {
    shipmentId, orderId, driverId, customerId,
    estimatedPrice, revenue,
    driverPaymentState, paymentType,
    createdByUserId,
}) => {
    if (driverPaymentState === 'driver_holding') {
        const debtStatus = buildDebtStatus(0, estimatedPrice);
        await client.query(
            `INSERT INTO debts (
                debt_type, driver_id, customer_id, order_id, shipment_id,
                total_amount, paid_amount, due_date, status, notes,
                updated_by, created_at, updated_at
            )
             VALUES ('driver', $1, $2, $3, $4, $5, 0,
                CURRENT_DATE + INTERVAL '30 days', $6,
                'Tai xe da thu nhung chua mang tien ve cong ty',
                $7, NOW(), NOW())`,
            [driverId, customerId, orderId, shipmentId, estimatedPrice, debtStatus, createdByUserId]
        );
    } else if (paymentType === 'debt') {
        const debtStatus = buildDebtStatus(0, estimatedPrice);
        await client.query(
            `INSERT INTO debts (
                debt_type, customer_id, order_id, shipment_id,
                total_amount, paid_amount, due_date, status, notes,
                updated_by, created_at, updated_at
            )
             VALUES ('customer', $1, $2, $3, $4, 0,
                CURRENT_DATE + INTERVAL '30 days', $5,
                'Khach chua thanh toan', $6, NOW(), NOW())`,
            [customerId, orderId, shipmentId, estimatedPrice, debtStatus, createdByUserId]
        );
        await client.query(
            `UPDATE customers
             SET current_debt = current_debt + $1, updated_at = NOW()
             WHERE id = $2`,
            [estimatedPrice, customerId]
        );
    } else if (estimatedPrice > 0) {
        const debtStatus = buildDebtStatus(revenue, estimatedPrice);
        await client.query(
            `INSERT INTO debts (
                debt_type, customer_id, order_id, shipment_id,
                total_amount, paid_amount, due_date, status, notes,
                updated_by, created_at, updated_at
            )
             VALUES ('customer', $1, $2, $3, $4, $5,
                CURRENT_DATE + INTERVAL '30 days', $6,
                'Don da hoan thanh, tien da thu', $7, NOW(), NOW())`,
            [customerId, orderId, shipmentId, estimatedPrice, revenue, debtStatus, createdByUserId]
        );

        if (revenue > 0) {
            const paymentMethod = paymentType === 'bank_transfer' ? 'bank_transfer' : 'cash';
            await client.query(
                `INSERT INTO debt_payments (
                    debt_id, amount, payment_method, status,
                    paid_at, confirmed_at, confirmed_by, created_by, notes
                )
                 VALUES (
                    (SELECT id FROM debts WHERE order_id = $1 AND debt_type = 'customer' AND shipment_id = $2 LIMIT 1),
                    $3, $4, 'confirmed', NOW(), NOW(), $5, $5,
                    'Da thu luc nhap don boi ke toan'
                )`,
                [orderId, shipmentId, revenue, paymentMethod, createdByUserId]
            );
        }
    }
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

        const vehicleGroupId = await getDefaultVehicleGroupId(client);
        const totalEstimatedPrice = (orderData.shipments || []).reduce(
            (sum, s) => sum + (Number(s.cargo_fee) || 0) + (Number(s.ticket_fee) || 0),
            0
        );
        const orderNotes = buildOrderNotes(orderData);

        const orderResult = await client.query(
            `INSERT INTO orders (
                customer_id, created_by, updated_by,
                cargo_name, payment_type, vehicle_group_id,
                total_estimated_price, total_actual_price,
                derived_status, notes, created_at, updated_at
            )
             VALUES ($1, $2, $2, $3, 'cash', $4, $5, 0, 'completed', $6, NOW(), NOW())
             RETURNING *`,
            [
                customerId,
                orderData.created_by,
                orderData.customer_name || null,
                vehicleGroupId,
                totalEstimatedPrice,
                orderNotes,
            ]
        );
        const newOrder = orderResult.rows[0];

        const shipmentIds = [];
        for (let i = 0; i < (orderData.shipments || []).length; i += 1) {
            const s = orderData.shipments[i];
            const vehicleId = await findVehicleByPlate(client, s.vehicle_plate);
            const driverId = await findDriverByName(client, s.driver_name);
            const estimatedPrice = (Number(s.cargo_fee) || 0) + (Number(s.ticket_fee) || 0);
            const revenue = Number(s.revenue || s.cargo_fee || 0);
            const shipmentNotes = buildShipmentNotes(s);
            const pickupAddresses = (s.pickup_addresses || []).filter((p) => String(p || '').trim() !== '');

            const shipmentId = await insertShipmentWithStopsAndExpenses(client, {
                orderId: newOrder.id,
                shipmentIndex: i + 1,
                vehicleGroupId,
                vehicleId,
                driverId,
                estimatedPrice,
                actualPrice: revenue,
                cargoName: s.cargo_name,
                cargoWeight: s.cargo_weight,
                shipmentNotes,
                pickupAddresses,
                deliveryAddress: s.delivery_address,
                contactName: orderData.customer_name,
                contactPhone: orderData.customer_phone,
                expenses: s.expenses || [],
                createdByUserId: orderData.created_by,
            });

            await insertDebtForShipment(client, {
                shipmentId,
                orderId: newOrder.id,
                driverId,
                customerId,
                estimatedPrice,
                revenue,
                driverPaymentState: s.driver_payment_state || 'company_received',
                paymentType: s.payment_type || 'cash',
                createdByUserId: orderData.created_by,
            });

            shipmentIds.push(shipmentId);
        }

        await client.query('COMMIT');

        const result = await pool.query(
            `SELECT
                o.id, o.cargo_name, o.payment_type,
                o.total_estimated_price, o.derived_status, o.notes,
                o.created_at,
                c.full_name AS customer_name, c.company_name AS customer_company, c.phone AS customer_phone,
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
    let baseQuery = `
        FROM orders o
        LEFT JOIN customers c ON o.customer_id = c.id
        LEFT JOIN debts d ON o.id = d.order_id
        LEFT JOIN order_shipments os ON os.order_id = o.id AND os.shipment_index = 1
    `;
    const params = [];
    const conditions = [];

    if (filters.status && filters.status !== 'all') {
        params.push(filters.status);
        conditions.push(`o.derived_status = $${params.length}`);
    }

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

    if (conditions.length > 0) {
        baseQuery += ` WHERE ${conditions.join(' AND ')}`;
    }

    const countQuery = `SELECT COUNT(DISTINCT o.id) ${baseQuery}`;
    const countResult = await pool.query(countQuery, params);
    const totalItems = Number.parseInt(countResult.rows[0].count, 10);

    let query = `
        SELECT
            o.id,
            o.cargo_name,
            o.payment_type,
            o.total_estimated_price AS estimated_price,
            o.total_actual_price AS actual_price,
            o.derived_status AS status,
            o.notes,
            o.created_at,
            c.full_name AS customer_name,
            c.company_name AS customer_company,
            c.phone AS customer_phone,
            COALESCE(d_agg.debt_total, 0) AS debt_total,
            COALESCE(d_agg.debt_paid, 0) AS debt_paid,
            GREATEST(COALESCE(d_agg.debt_total, 0) - COALESCE(d_agg.debt_paid, 0), 0) AS debt_remaining,
            d_agg.debt_status AS debt_status,
            COALESCE(os_agg.shipment_count, 0) AS shipment_count
        ${baseQuery}
        LEFT JOIN LATERAL (
            SELECT
                SUM(total_amount) AS debt_total,
                SUM(paid_amount) AS debt_paid,
                CASE
                    WHEN SUM(paid_amount) >= SUM(total_amount) - 0.01 THEN 'paid'
                    WHEN SUM(paid_amount) > 0 THEN 'partial'
                    ELSE 'unpaid'
                END AS debt_status
            FROM debts
            WHERE order_id = o.id AND debt_type = 'customer'
        ) d_agg ON TRUE
        LEFT JOIN LATERAL (
            SELECT COUNT(*) AS shipment_count
            FROM order_shipments
            WHERE order_id = o.id
        ) os_agg ON TRUE
        GROUP BY o.id, c.full_name, c.company_name, c.phone,
                 d_agg.debt_total, d_agg.debt_paid, d_agg.debt_status,
                 os_agg.shipment_count
        ORDER BY o.created_at DESC
    `;

    const queryParams = [...params];
    if (page !== null && limit !== null) {
        queryParams.push(limit, (page - 1) * limit);
        query += ` LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}`;
    }

    const result = await pool.query(query, queryParams);
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
            COALESCE(e_agg.total_expenses, 0) AS total_expenses
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
                COALESCE(SUM(CASE WHEN expense_type = 'fuel' THEN amount ELSE 0 END), 0) AS fuel,
                COALESCE(SUM(CASE WHEN expense_type = 'toll' THEN amount ELSE 0 END), 0) AS toll,
                COALESCE(SUM(CASE WHEN expense_type = 'parking' THEN amount ELSE 0 END), 0) AS parking,
                COALESCE(SUM(CASE WHEN expense_type = 'repair' THEN amount ELSE 0 END), 0) AS repair,
                COALESCE(SUM(CASE WHEN expense_type = 'maintenance' THEN amount ELSE 0 END), 0) AS maintenance,
                COALESCE(SUM(CASE WHEN expense_type = 'depreciation' THEN amount ELSE 0 END), 0) AS depreciation,
                COALESCE(SUM(CASE WHEN expense_type = 'other' THEN amount ELSE 0 END), 0) AS other
            FROM expenses
            WHERE shipment_id = os.id
        ) e_detail ON TRUE
        WHERE os.order_id = $1
        ORDER BY os.shipment_index ASC`,
        [orderId]
    );
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
            revenue: row.actual_price,
            total_expenses: Number(row.total_expenses) || 0,
            expenses: {
                fuel: Number(row.fuel) || 0,
                toll: Number(row.toll) || 0,
                parking: Number(row.parking) || 0,
                repair: Number(row.repair) || 0,
                maintenance: Number(row.maintenance) || 0,
                depreciation: Number(row.depreciation) || 0,
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

        const orderResult = await client.query(
            `UPDATE orders SET
                cargo_name = COALESCE($1, cargo_name),
                notes = $2,
                updated_at = NOW()
             WHERE id = $3
             RETURNING *`,
            [orderData.customer_name || null, orderNotes, orderId]
        );

        await client.query('COMMIT');

        // Fetch updated data
        const result = await pool.query(
            `SELECT
                o.id, o.cargo_name, o.payment_type,
                o.total_estimated_price, o.derived_status, o.notes,
                o.created_at,
                c.full_name AS customer_name, c.company_name AS customer_company, c.phone AS customer_phone,
                COUNT(DISTINCT os.id) AS shipment_count,
                SUM(os.estimated_price) AS total_shipment_price,
                (SELECT SUM(e.amount) FROM expenses e WHERE e.shipment_id IN (SELECT id FROM order_shipments WHERE order_id = o.id)) AS total_expenses
             FROM orders o
             LEFT JOIN customers c ON c.id = o.customer_id
             LEFT JOIN order_shipments os ON os.order_id = o.id
             WHERE o.id = $1
             GROUP BY o.id, c.full_name, c.company_name, c.phone`,
            [orderId]
        );

        return result.rows[0];
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
