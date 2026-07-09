const pool = require('../config/database');
const { insertAssignmentHistory } = require('./tripRepository');

const trimToNull = (value) => {
    const text = String(value || '').trim();
    return text || null;
};

const buildOrderNotes = (orderData) => {
    const segments = [];
    if (orderData.order_date) segments.push(`NgÃ y Ä‘Æ¡n: ${orderData.order_date}`);
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
        `INSERT INTO customers (customer_type, full_name, company_name, phone, address, created_at, updated_at)
         VALUES ('individual', $1, $2, $3, '', NOW(), NOW()) RETURNING id`,
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
            estimated_price, actual_price,
            cargo_name, cargo_weight_kg,
            status, notes, completed_at, created_at, updated_at
        )
         VALUES ($1, $2, $3, $4, $5, $6, 'completed', $7, NOW(), NOW(), NOW())
         RETURNING id`,
        [
            orderId, shipmentIndex,
            estimatedPrice, actualPrice || null,
            cargoName || null, cargoWeight || 0,
            shipmentNotes,
        ]
    );
    const shipmentId = shipmentResult.rows[0].id;

    if (vehicleId || driverId) {
        await insertAssignmentHistory(client, {
            shipmentId,
            toDriverId: driverId || null,
            toVehicleId: vehicleId || null,
            changedBy: createdByUserId,
            changeReason: 'initial_assign',
        });
    }

    const stopAddresses = [...pickupAddresses, deliveryAddress];
    const stopTypes     = [...pickupAddresses.map(() => 'pickup'), 'delivery'];
    const stopIndices   = stopAddresses.map((_, i) => i + 1);
    await client.query(
        `INSERT INTO trip_stops (shipment_id, stop_index, stop_type, address, contact_name, contact_phone, notes, completed_at, created_at)
         SELECT $1, idx, typ, addr, $2, $3, $4, NOW(), NOW()
         FROM UNNEST($5::int[], $6::text[], $7::text[]) AS u(idx, typ, addr)`,
        [shipmentId, contactName, contactPhone, shipmentNotes, stopIndices, stopTypes, stopAddresses]
    );

    const expList = expenses || [];
    if (expList.length > 0) {
        await client.query(
            `INSERT INTO expenses (shipment_id, vehicle_id, created_by, updated_by, expense_type, amount, description, expense_date, created_at, updated_at)
             SELECT $1, $2, $3, $3, typ, amt, dsc, CURRENT_DATE, NOW(), NOW()
             FROM UNNEST($4::text[], $5::numeric[], $6::text[]) AS u(typ, amt, dsc)`,
            [
                shipmentId, vehicleId, createdByUserId,
                expList.map((e) => e.expense_type),
                expList.map((e) => Number(e.amount)),
                expList.map((e) => e.description || null),
            ]
        );
    }

    return shipmentId;
};

const PASS_THROUGH_EXPENSE_TYPES = new Set(['toll', 'parking', 'ferry']);

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

    if (
        driverPaymentState === 'driver_holding'
        && ['cash', 'bank_transfer'].includes(normalizedPaymentType)
    ) {
        if (!driverId) {
            throw new Error('KhÃ´ng thá»ƒ táº¡o cÃ´ng ná»£ tÃ i xáº¿ khi chuyáº¿n chÆ°a cÃ³ tÃ i xáº¿.');
        }
        await client.query(
            `INSERT INTO debts (
                debt_type, driver_id, customer_id, partner_id, order_id, shipment_id,
                total_amount, due_date, notes,
                updated_by, created_at, updated_at
            )
             VALUES ('driver', $1, NULL, NULL, $2, $3, $4,
                CURRENT_DATE + INTERVAL '30 days',
                'TÃ i xáº¿ Ä‘Ã£ thu nhÆ°ng chÆ°a mang tiá»n vá» cÃ´ng ty',
                $5, NOW(), NOW())`,
            [driverId, orderId, shipmentId, actualPrice, createdByUserId]
        );
    } else if (normalizedPaymentType === 'client_credit') {

        await client.query(
            `INSERT INTO debts (
                debt_type, driver_id, customer_id, partner_id, order_id, shipment_id,
                total_amount, due_date, notes,
                updated_by, created_at, updated_at
            )
             VALUES ('customer', NULL, $1, NULL, $2, $3, $4,
                CURRENT_DATE + INTERVAL '30 days',
                'KhÃ¡ch chÆ°a thanh toÃ¡n', $5, NOW(), NOW())`,
            [customerId, orderId, shipmentId, actualPrice, createdByUserId]
        );
    } else if (partnerId && normalizedPaymentType === 'partner') {

        await client.query(
            `INSERT INTO debts (
                debt_type, driver_id, customer_id, partner_id, order_id, shipment_id,
                total_amount, due_date, notes,
                updated_by, created_at, updated_at
            )
             VALUES ('partner', NULL, NULL, $1, $2, $3, $4,
                CURRENT_DATE + INTERVAL '30 days',
                'Äá»‘i tÃ¡c chÆ°a thanh toÃ¡n', $5, NOW(), NOW())`,
            [partnerId, orderId, shipmentId, actualPrice, createdByUserId]
        );
    }

};

const createOrderWithShipments = async (orderData) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

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
            total_estimated_price, prepaid_amount,
            derived_status, notes, created_at, updated_at
        )
         VALUES ($1, $2, $2, $3, $4, $5, $6, 'completed', $7, NOW(), NOW())
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

    // debt_status filter is applied as a compound condition across customer + driver debts
    if (filters.debt_status) {
        const outstanding = `(GREATEST(d_agg.debt_total - d_agg.debt_paid, 0) + dd_agg.driver_debt_remaining + pending_agg.pending_receipt_amount)`;
        const received    = `(ship_agg.actual_price - GREATEST(d_agg.debt_total - d_agg.debt_paid, 0) - dd_agg.driver_debt_remaining - pending_agg.pending_receipt_amount)`;
        if (filters.debt_status === 'paid') {
            conditions.push(`${outstanding} <= 0.01`);
        } else if (filters.debt_status === 'unpaid') {
            conditions.push(`${outstanding} > 0.01 AND ${received} <= 0.01`);
        } else if (filters.debt_status === 'partial') {
            conditions.push(`${outstanding} > 0.01 AND ${received} > 0.01`);
        }
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const lateralJoins = `
        LEFT JOIN LATERAL (
            SELECT
                COALESCE(SUM(d.total_amount), 0)          AS debt_total,
                COALESCE(SUM(COALESCE(dp_c.paid, 0)), 0)  AS debt_paid
            FROM debts d
            LEFT JOIN (
                SELECT debt_id, COALESCE(SUM(amount) FILTER (WHERE status = 'confirmed'), 0) AS paid
                FROM debt_payments GROUP BY debt_id
            ) dp_c ON dp_c.debt_id = d.id
            WHERE d.order_id = o.id AND d.debt_type = 'customer'
        ) d_agg ON TRUE
        LEFT JOIN LATERAL (
            SELECT GREATEST(COALESCE(SUM(d.total_amount - COALESCE(dp_d.paid, 0)), 0), 0) AS driver_debt_remaining
            FROM debts d
            LEFT JOIN (
                SELECT debt_id, COALESCE(SUM(amount) FILTER (WHERE status = 'confirmed'), 0) AS paid
                FROM debt_payments GROUP BY debt_id
            ) dp_d ON dp_d.debt_id = d.id
            WHERE d.order_id = o.id AND d.debt_type = 'driver'
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
        LEFT JOIN LATERAL (
            SELECT COALESCE(SUM(sr.amount), 0) AS pending_receipt_amount
            FROM shipment_receipts sr
            JOIN order_receipt_requests rr ON rr.id = sr.order_receipt_request_id
            WHERE rr.order_id = o.id
              AND (
                  -- chưa được driver xác nhận hình thức thanh toán
                  sr.payment_type IS NULL
                  OR
                  -- driver chọn bank_transfer nhưng kế toán chưa xác nhận tiền về
                  (sr.payment_type = 'bank_transfer' AND NOT EXISTS (
                      SELECT 1 FROM financial_transactions ft
                      WHERE ft.ref_type = 'shipment'
                        AND ft.ref_id   = rr.requesting_shipment_id
                        AND ft.event_type = 'bank_receipt'
                  ))
              )
        ) pending_agg ON TRUE
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
            -- debt_status: 'paid' only when company received ALL money (customer paid + driver paid to company)
            CASE
                WHEN GREATEST(d_agg.debt_total - d_agg.debt_paid, 0)
                     + dd_agg.driver_debt_remaining
                     + pending_agg.pending_receipt_amount <= 0.01
                    THEN 'paid'
                WHEN ship_agg.actual_price
                     - GREATEST(d_agg.debt_total - d_agg.debt_paid, 0)
                     - dd_agg.driver_debt_remaining
                     - pending_agg.pending_receipt_amount > 0.01
                    THEN 'partial'
                ELSE 'unpaid'
            END AS debt_status,
            ship_agg.shipment_count,
            dd_agg.driver_debt_remaining,
            pending_agg.pending_receipt_amount,
            exp_agg.total_expenses,
            GREATEST(
                ship_agg.actual_price
                - dd_agg.driver_debt_remaining
                - GREATEST(d_agg.debt_total - d_agg.debt_paid, 0)
                - pending_agg.pending_receipt_amount,
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
    const { rows } = await pool.query(
        `WITH
        exp_agg AS (
            SELECT
                e.shipment_id,
                COALESCE(SUM(e.amount), 0)                                                            AS total_expenses,
                COALESCE(SUM(CASE WHEN e.expense_type = 'fuel'        THEN e.amount END), 0)          AS fuel,
                COALESCE(SUM(CASE WHEN e.expense_type = 'toll'        THEN e.amount END), 0)          AS toll,
                COALESCE(SUM(CASE WHEN e.expense_type = 'parking'     THEN e.amount END), 0)          AS parking,
                COALESCE(SUM(CASE WHEN e.expense_type = 'ferry'       THEN e.amount END), 0)          AS ferry,
                COALESCE(SUM(CASE WHEN e.expense_type = 'minor_repair' THEN e.amount END), 0)         AS minor_repair,
                COALESCE(SUM(CASE WHEN e.expense_type = 'other'       THEN e.amount END), 0)          AS other,
                COALESCE(SUM(CASE WHEN e.expense_type IN ('toll','parking','ferry') THEN e.amount END), 0) AS pass_through_total
            FROM expenses e
            WHERE e.shipment_id IN (SELECT id FROM order_shipments WHERE order_id = $1)
            GROUP BY e.shipment_id
        ),
        stop_agg AS (
            SELECT
                ts.shipment_id,
                JSON_AGG(
                    JSON_BUILD_OBJECT('address', ts.address, 'contact_name', ts.contact_name, 'contact_phone', ts.contact_phone)
                    ORDER BY ts.stop_index
                ) FILTER (WHERE ts.stop_type = 'pickup')                                              AS pickups,
                MAX(ts.address) FILTER (WHERE ts.stop_type = 'delivery')                              AS delivery_address
            FROM trip_stops ts
            WHERE ts.shipment_id IN (SELECT id FROM order_shipments WHERE order_id = $1)
            GROUP BY ts.shipment_id
        ),
        debt_agg AS (
            SELECT
                d.shipment_id,
                d.total_amount,
                COALESCE(SUM(dp.amount) FILTER (WHERE dp.status = 'confirmed'), 0) AS driver_paid,
                CASE
                    WHEN COALESCE(SUM(dp.amount) FILTER (WHERE dp.status = 'confirmed'), 0) >= d.total_amount - 0.01 THEN 'paid'
                    WHEN COALESCE(SUM(dp.amount) FILTER (WHERE dp.status = 'confirmed'), 0) > 0 THEN 'partial'
                    ELSE 'unpaid'
                END AS driver_payment_state
            FROM debts d
            LEFT JOIN debt_payments dp ON dp.debt_id = d.id
            WHERE d.shipment_id IN (SELECT id FROM order_shipments WHERE order_id = $1)
              AND d.debt_type = 'driver'
            GROUP BY d.id, d.shipment_id, d.total_amount
        ),
        pay_agg AS (
            SELECT DISTINCT ON (d.shipment_id)
                d.shipment_id, dp.payment_method AS payment_type
            FROM debt_payments dp
            JOIN debts d ON d.id = dp.debt_id
            WHERE d.shipment_id IN (SELECT id FROM order_shipments WHERE order_id = $1)
            ORDER BY d.shipment_id, dp.paid_at DESC
        ),
        receipt_agg AS (
            SELECT
                orr.requesting_shipment_id          AS shipment_id,
                sr.id                               AS receipt_id,
                sr.payment_type                     AS receipt_payment_type,
                sr.amount                           AS receipt_amount,
                COALESCE(
                    json_agg(pr.file_url ORDER BY pr.uploaded_at) FILTER (WHERE pr.file_url IS NOT NULL),
                    '[]'
                )                                   AS proof_urls
            FROM order_receipt_requests orr
            JOIN shipment_receipts sr ON sr.order_receipt_request_id = orr.id
            LEFT JOIN payment_receipts pr ON pr.payment_id = sr.id
            WHERE orr.requesting_shipment_id IN (SELECT id FROM order_shipments WHERE order_id = $1)
            GROUP BY orr.requesting_shipment_id, sr.id, sr.payment_type, sr.amount
        )
        SELECT
            os.id, os.shipment_index, sc.vehicle_id, sc.owner_driver_id,
            os.estimated_price, os.actual_price, os.cargo_name, os.cargo_weight_kg,
            os.status, os.notes, os.completed_at, os.created_at,
            v.plate_number                         AS vehicle_plate,
            p.full_name                            AS driver_name,
            COALESCE(ea.total_expenses, 0)         AS total_expenses,
            COALESCE(ea.fuel, 0)                   AS fuel,
            COALESCE(ea.toll, 0)                   AS toll,
            COALESCE(ea.parking, 0)                AS parking,
            COALESCE(ea.ferry, 0)                  AS ferry,
            COALESCE(ea.minor_repair, 0)           AS minor_repair,
            COALESCE(ea.other, 0)                  AS other,
            COALESCE(ea.pass_through_total, 0)     AS pass_through_total,
            sa.pickups,
            sa.delivery_address,
            da.driver_payment_state,
            da.total_amount                        AS driver_total,
            da.driver_paid,
            pa.payment_type,
            ra.receipt_id,
            ra.receipt_payment_type,
            ra.receipt_amount,
            COALESCE(ra.proof_urls, '[]')          AS proof_urls,
            EXISTS(
                SELECT 1 FROM financial_transactions ft
                WHERE ft.ref_type = 'shipment' AND ft.ref_id = os.id AND ft.event_type = 'bank_receipt'
            )                                      AS bank_confirmed
        FROM order_shipments os
        LEFT JOIN v_shipment_current sc ON sc.shipment_id = os.id
        LEFT JOIN vehicles  v  ON v.id  = sc.vehicle_id
        LEFT JOIN profiles  p  ON p.id  = sc.owner_driver_id
        LEFT JOIN exp_agg     ea ON ea.shipment_id = os.id
        LEFT JOIN stop_agg    sa ON sa.shipment_id = os.id
        LEFT JOIN debt_agg    da ON da.shipment_id = os.id
        LEFT JOIN pay_agg     pa ON pa.shipment_id = os.id
        LEFT JOIN receipt_agg ra ON ra.shipment_id = os.id
        WHERE os.order_id = $1
        ORDER BY os.shipment_index ASC`,
        [orderId]
    );

    return rows.map((row) => ({
        id: row.id,
        shipment_index: row.shipment_index,
        order_id: orderId,
        vehicle_plate: row.vehicle_plate || null,
        driver_name: row.driver_name || null,
        cargo_name: row.cargo_name,
        cargo_weight: row.cargo_weight_kg,
        cargo_fee: row.estimated_price,
        actual_price: Number(row.actual_price) || 0,
        total_expenses: Number(row.total_expenses) || 0,
        expenses: {
            fuel:         Number(row.fuel)         || 0,
            toll:         Number(row.toll)         || 0,
            parking:      Number(row.parking)      || 0,
            ferry:        Number(row.ferry)        || 0,
            minor_repair: Number(row.minor_repair) || 0,
            other:        Number(row.other)        || 0,
        },
        pass_through_total:  Number(row.pass_through_total) || 0,
        // total_customer_due = doanh thu (actual_price) + chi phí khách chịu (toll/parking/ferry)
        total_customer_due:  (Number(row.actual_price) || 0) + (Number(row.pass_through_total) || 0),
        status: row.status,
        notes: row.notes,
        pickup_addresses:  row.pickups || [],
        delivery_address:  row.delivery_address || null,
        payment_type:         row.payment_type || null,
        driver_payment_state: row.driver_payment_state || null,
        driver_total:         row.driver_total ? Number(row.driver_total) : null,
        driver_paid:          row.driver_paid  ? Number(row.driver_paid)  : 0,
        receipt_id:           row.receipt_id   || null,
        receipt_payment_type: row.receipt_payment_type || null,
        receipt_amount:       row.receipt_amount ? Number(row.receipt_amount) : null,
        proof_urls:           row.proof_urls || [],
        bank_confirmed:       row.bank_confirmed || false,
    }));
};

const updateOrder = async (orderId, orderData) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

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

        const orderNotes = [
            orderData.order_date ? `NgÃ y Ä‘Æ¡n: ${orderData.order_date}` : null,
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

