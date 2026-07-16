const pool = require('../config/database');

const getOrderShipments = async (db, orderId) => {
    const shipmentResult = await db.query(
        `SELECT
            os.id,
            os.order_id,
            os.shipment_index,
            sc.owner_driver_id,
            sc.vehicle_id,
            os.status,
            os.cargo_name,
            os.cargo_weight_kg,
            os.estimated_distance_km,
            os.actual_distance_km,
            os.estimated_price,
            os.actual_price,
            os.notes,
            v.plate_number,
            p.full_name AS driver_name,
            COALESCE(vg_vehicle.id, vg_order.id) AS vehicle_group_id,
            COALESCE(vg_vehicle.name, vg_order.name) AS vehicle_group_name,
            COALESCE(vg_vehicle.price_per_km, vg_order.price_per_km, 0) AS price_per_km
         FROM order_shipments os
         LEFT JOIN v_shipment_current sc ON sc.shipment_id = os.id
         LEFT JOIN vehicles v ON v.id = sc.vehicle_id
         LEFT JOIN profiles p ON p.id = sc.owner_driver_id
         LEFT JOIN vehicle_groups vg_vehicle ON vg_vehicle.id = v.vehicle_group_id
         LEFT JOIN vehicle_groups vg_order ON vg_order.id = os.vehicle_group_id
         WHERE os.order_id = $1
         ORDER BY os.shipment_index ASC`,
        [orderId],
    );

    const shipments = [];
    for (const shipment of shipmentResult.rows) {
        const stopsResult = await db.query(
            `SELECT stop_type, stop_index, address, contact_name, contact_phone
             FROM trip_stops
             WHERE shipment_id = $1
             ORDER BY stop_index ASC`,
            [shipment.id],
        );
        shipments.push({ ...shipment, stops: stopsResult.rows });
    }
    return shipments;
};

const getReceiptRequestPricingHeader = async (db, requestId) => {
    const result = await db.query(
        `SELECT
            rr.id,
            rr.order_id,
            rr.driver_id,
            COALESCE(o.prepaid_amount, 0) AS prepaid_amount
         FROM order_receipt_requests rr
         JOIN orders o ON o.id = rr.order_id
         WHERE rr.id = $1`,
        [requestId],
    );
    return result.rows[0] ?? null;
};

// sort resolved via allowlist, never interpolated directly from user input
const RECEIPT_REQUEST_SORTS = {
    'amount-desc': 'receipt_amount DESC',
    'amount-asc':  'receipt_amount ASC',
};

const listReceiptRequests = async ({ where, params, limit, offset, sort = null }) => {
    const orderClause = RECEIPT_REQUEST_SORTS[sort] ?? 'rr.requested_at DESC';
    const result = await pool.query(
        `SELECT
            rr.id,
            rr.order_id,
            rr.driver_id,
            rr.status,
            rr.requested_at,
            rr.processed_at,
            rr.coordinator_notes,
            p.full_name          AS driver_name,
            processor.full_name  AS processed_by_name,
            o.cargo_name,
            o.id                 AS order_id,
            c.full_name          AS customer_name,
            c.phone              AS customer_phone,
            c.company_name       AS customer_company,
            CASE
                WHEN rr.status = 'approved' THEN 'receipt'
                ELSE 'request'
            END AS record_kind,
            COALESCE(sr.id, rr.id) AS receipt_id,
            COALESCE(sr.amount, GREATEST(
                COALESCE(revenue_summary.total_actual_price, 0) - COALESCE(o.prepaid_amount, 0),
                0
            )) AS receipt_amount,
            COALESCE(revenue_summary.total_actual_price, 0) AS gross_amount,
            COALESCE(o.prepaid_amount, 0) AS prepaid_amount,
            COALESCE(sr.collected_at, rr.processed_at) AS receipt_created_at,
            COALESCE(sr.notes, rr.coordinator_notes) AS receipt_notes,
            COALESCE(shipments.shipment_count, 0) AS shipment_count,
            primary_shipment.id  AS shipment_id,
            primary_shipment.shipment_index,
            primary_shipment.status AS shipment_status,
            primary_shipment.actual_distance_km,
            COALESCE(distance_summary.total_actual_distance_km, 0) AS total_actual_distance_km,
            COALESCE(revenue_summary.total_actual_price, 0) AS actual_price,
            COALESCE(revenue_summary.total_estimated_price, primary_shipment.estimated_price, 0) AS estimated_price,
            COALESCE(revenue_summary.total_actual_price, 0) + COALESCE(exp.pass_through_expenses, 0) AS final_price,
            primary_vehicle.plate_number,
            COALESCE(exp.total_expenses, 0) AS total_expenses
         FROM order_receipt_requests rr
         JOIN profiles p       ON p.id  = rr.driver_id
         JOIN orders o         ON o.id  = rr.order_id
         LEFT JOIN customers c  ON c.id  = o.customer_id
         LEFT JOIN shipment_receipts sr ON sr.order_receipt_request_id = rr.id
         LEFT JOIN profiles processor ON processor.id = rr.processed_by
         LEFT JOIN LATERAL (
            SELECT COUNT(*) AS shipment_count
            FROM order_shipments os_count
            WHERE os_count.order_id = rr.order_id
         ) shipments ON TRUE
         LEFT JOIN LATERAL (
            SELECT SUM(COALESCE(os_distance.actual_distance_km, os_distance.estimated_distance_km, 0)) AS total_actual_distance_km
            FROM order_shipments os_distance
            WHERE os_distance.order_id = rr.order_id
         ) distance_summary ON TRUE
         LEFT JOIN LATERAL (
            SELECT
                SUM(
                    COALESCE(
                        NULLIF(os_revenue.actual_price, 0),
                        COALESCE(os_revenue.actual_distance_km, os_revenue.estimated_distance_km, 0)
                        * COALESCE(vg_vehicle_revenue.price_per_km, vg_order_revenue.price_per_km, 0)
                    )
                ) AS total_actual_price,
                SUM(COALESCE(os_revenue.estimated_price, 0)) AS total_estimated_price
            FROM order_shipments os_revenue
            LEFT JOIN v_shipment_current sc_revenue ON sc_revenue.shipment_id = os_revenue.id
            LEFT JOIN vehicles v_revenue ON v_revenue.id = sc_revenue.vehicle_id
            LEFT JOIN vehicle_groups vg_vehicle_revenue ON vg_vehicle_revenue.id = v_revenue.vehicle_group_id
            LEFT JOIN vehicle_groups vg_order_revenue ON vg_order_revenue.id = os_revenue.vehicle_group_id
            WHERE os_revenue.order_id = rr.order_id
         ) revenue_summary ON TRUE
         LEFT JOIN LATERAL (
            SELECT os_primary.*, sc_primary.owner_driver_id, sc_primary.vehicle_id
            FROM order_shipments os_primary
            LEFT JOIN v_shipment_current sc_primary ON sc_primary.shipment_id = os_primary.id
            WHERE os_primary.order_id = rr.order_id
            ORDER BY CASE WHEN sc_primary.owner_driver_id = rr.driver_id THEN 0 ELSE 1 END, os_primary.shipment_index ASC
            LIMIT 1
         ) primary_shipment ON TRUE
         LEFT JOIN vehicles primary_vehicle ON primary_vehicle.id = primary_shipment.vehicle_id
         LEFT JOIN LATERAL (
            SELECT
                SUM(e.amount) AS total_expenses,
                SUM(
                    CASE
                        WHEN e.expense_type IN ('parking', 'toll', 'etc') THEN e.amount
                        ELSE 0
                    END
                ) AS pass_through_expenses
            FROM expenses e
            JOIN order_shipments os_exp ON os_exp.id = e.shipment_id
            WHERE os_exp.order_id = rr.order_id
              AND e.status != 'rejected'
         ) exp ON TRUE
         ${where}
         ORDER BY ${orderClause}
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
    );

    const countResult = await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM order_receipt_requests rr
         JOIN profiles p       ON p.id  = rr.driver_id
         JOIN orders o         ON o.id  = rr.order_id
         LEFT JOIN customers c  ON c.id  = o.customer_id
         LEFT JOIN shipment_receipts sr ON sr.order_receipt_request_id = rr.id
         LEFT JOIN LATERAL (
            SELECT os_primary.*, sc_primary.owner_driver_id, sc_primary.vehicle_id
            FROM order_shipments os_primary
            LEFT JOIN v_shipment_current sc_primary ON sc_primary.shipment_id = os_primary.id
            WHERE os_primary.order_id = rr.order_id
            ORDER BY CASE WHEN sc_primary.owner_driver_id = rr.driver_id THEN 0 ELSE 1 END, os_primary.shipment_index ASC
            LIMIT 1
         ) primary_shipment ON TRUE
         LEFT JOIN vehicles primary_vehicle ON primary_vehicle.id = primary_shipment.vehicle_id
         ${where}`,
        params,
    );

    return { rows: result.rows, total: Number(countResult.rows[0]?.total ?? 0) };
};

const getReceiptRequestHeader = async (requestId) => {
    const result = await pool.query(
        `SELECT
            rr.id,
            rr.order_id,
            rr.driver_id,
            rr.status,
            rr.requested_at,
            rr.processed_at,
            rr.coordinator_notes,
            rr.processed_by,
            o.cargo_name,
            o.cargo_weight_kg,
            o.notes                    AS order_notes,
            COALESCE(o.prepaid_amount, 0) AS order_prepaid_amount,
            c.id                       AS customer_id,
            c.full_name                AS customer_name,
            c.phone                    AS customer_phone,
            c.company_name             AS customer_company,
            c.address                  AS customer_address,
            d.full_name                AS driver_name
         FROM order_receipt_requests rr
         JOIN orders o ON o.id = rr.order_id
         LEFT JOIN customers c ON c.id = o.customer_id
         LEFT JOIN profiles d ON d.id = rr.driver_id
         WHERE rr.id = $1`,
        [requestId],
    );
    return result.rows[0] ?? null;
};

const getReceiptRequestForApproval = async (requestId) => {
    const result = await pool.query(
        `SELECT rr.*, o.customer_id, o.payment_type AS order_payment_type
         FROM order_receipt_requests rr
         JOIN orders o ON o.id = rr.order_id
         WHERE rr.id = $1`,
        [requestId],
    );
    return result.rows[0] ?? null;
};

const updateShipmentActualDistance = async (client, shipmentId, actualKm) => {
    await client.query(
        `UPDATE order_shipments
         SET actual_distance_km = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [actualKm, shipmentId],
    );
};

const insertApprovedExpense = async (client, { shipmentId, vehicleId, coordinatorId, expenseType, amount, description }) => {
    const { rows: [expense] } = await client.query(
        `INSERT INTO expenses
            (shipment_id, vehicle_id, created_by, updated_by, expense_type, amount, description, expense_date,
             status, reviewed_by, reviewed_at, created_at, updated_at)
         VALUES ($1, $2, $3, $3, $4, $5, $6, CURRENT_DATE, 'approved', $3, NOW(), NOW(), NOW())
         RETURNING id`,
        [shipmentId, vehicleId, coordinatorId, expenseType, amount, description],
    );
    return expense;
};

const updateShipmentActualPrice = async (client, shipmentId, actualIncome) => {
    await client.query(
        `UPDATE order_shipments
         SET actual_price = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [actualIncome, shipmentId],
    );
};

const autoApproveOrderExpenses = async (client, coordinatorId, orderId) => {
    const { rows } = await client.query(
        `UPDATE expenses e
         SET status = 'approved', reviewed_by = $1, reviewed_at = NOW(), updated_at = NOW()
         FROM order_shipments os
         WHERE os.id = e.shipment_id
           AND os.order_id = $2
           AND e.status = 'pending'
         RETURNING e.id, e.shipment_id, e.expense_type, e.amount`,
        [coordinatorId, orderId],
    );
    return rows;
};

const markReceiptRequestApproved = async (client, { coordinatorId, requestId, notes }) => {
    await client.query(
        `UPDATE order_receipt_requests
         SET status = 'approved', processed_by = $1, processed_at = NOW(), coordinator_notes = $3
         WHERE id = $2`,
        [coordinatorId, requestId, notes ?? null],
    );
};

const insertShipmentReceipt = async (client, { shipmentId, amount, driverId, notes, requestId, coordinatorId }) => {
    await client.query(
        `INSERT INTO shipment_receipts
             (shipment_id, amount, collected_by, notes, order_receipt_request_id, created_by, collected_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [shipmentId, amount, driverId, notes ?? null, requestId, coordinatorId],
    );
};

// Best-effort, fire-and-forget lookup dùng để recalculate KPI sau khi duyệt phiếu thu
const getShipmentOwnersForKpi = async (shipmentIds) => {
    const { rows } = await pool.query(
        `SELECT DISTINCT sc.owner_driver_id, os.completed_at
         FROM order_shipments os
         JOIN v_shipment_current sc ON sc.shipment_id = os.id
         WHERE os.id = ANY($1) AND sc.owner_driver_id IS NOT NULL`,
        [shipmentIds],
    );
    return rows;
};

const getReceiptRequestById = async (requestId) => {
    const result = await pool.query(`SELECT * FROM order_receipt_requests WHERE id = $1`, [requestId]);
    return result.rows[0] ?? null;
};

const rejectReceiptRequestRow = async (coordinatorId, notes, requestId) => {
    await pool.query(
        `UPDATE order_receipt_requests
         SET status = 'rejected', processed_by = $1, processed_at = NOW(), coordinator_notes = $2
         WHERE id = $3`,
        [coordinatorId, notes ?? null, requestId],
    );
};

const getDashboardStats = async () => {
    const result = await pool.query(`
        SELECT
            (SELECT COUNT(*)::int FROM orders WHERE derived_status NOT IN ('completed', 'cancelled')) AS active_orders,
            (SELECT COUNT(*)::int FROM order_shipments WHERE status = 'available') AS pool_trips,
            (SELECT COUNT(*)::int FROM order_shipments
                WHERE status IN ('claimed','picking','transit','arrived','returning')) AS active_trips,
            (SELECT COUNT(*)::int FROM incidents WHERE status IN ('open','investigating')) AS open_incidents,
            (SELECT COUNT(*)::int FROM order_receipt_requests WHERE status = 'pending') AS pending_receipts,
            (SELECT COUNT(*)::int FROM expenses WHERE status = 'pending') AS pending_expenses
    `);
    return result.rows[0];
};

module.exports = {
    getOrderShipments,
    getReceiptRequestPricingHeader,
    listReceiptRequests,
    getReceiptRequestHeader,
    getReceiptRequestForApproval,
    updateShipmentActualDistance,
    insertApprovedExpense,
    updateShipmentActualPrice,
    autoApproveOrderExpenses,
    markReceiptRequestApproved,
    insertShipmentReceipt,
    getShipmentOwnersForKpi,
    getReceiptRequestById,
    rejectReceiptRequestRow,
    getDashboardStats,
};
