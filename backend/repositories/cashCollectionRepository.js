const pool = require('../config/database');

const getDriverCollections = async (driverId, { status = null, shipmentId = null, month = null, year = null } = {}) => {
    const params = [driverId];
    const conditions = ['cc.driver_id = $1'];

    if (status)     { params.push(status);     conditions.push(`cc.status = $${params.length}`); }
    if (shipmentId) { params.push(shipmentId); conditions.push(`cc.shipment_id = $${params.length}`); }
    if (month)      { params.push(month);      conditions.push(`EXTRACT(MONTH FROM cc.collected_at) = $${params.length}`); }
    if (year)       { params.push(year);       conditions.push(`EXTRACT(YEAR  FROM cc.collected_at) = $${params.length}`); }

    const result = await pool.query(
        `SELECT
            cc.id,
            cc.amount::text,
            cc.payment_method,
            cc.status,
            cc.notes,
            cc.receipt_url,
            cc.collected_at,
            cc.confirmed_at,
            cc.reject_reason,
            cc.debt_id,
            cc.shipment_id,
            o.cargo_name
         FROM cash_collections cc
         LEFT JOIN order_shipments os ON os.id = cc.shipment_id
         LEFT JOIN orders o            ON o.id  = os.order_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY cc.collected_at DESC`,
        params,
    );
    return result.rows;
};

const getCollectionById = async (id, driverId) => {
    const result = await pool.query(
        `SELECT
            cc.id,
            cc.amount::text,
            cc.payment_method,
            cc.status,
            cc.notes,
            cc.receipt_url,
            cc.collected_at,
            cc.confirmed_at,
            cc.reject_reason,
            cc.debt_id,
            cc.shipment_id,
            o.cargo_name
         FROM cash_collections cc
         LEFT JOIN order_shipments os ON os.id = cc.shipment_id
         LEFT JOIN orders o            ON o.id  = os.order_id
         WHERE cc.id = $1 AND cc.driver_id = $2`,
        [id, driverId],
    );
    return result.rows[0] ?? null;
};

const createCollection = async (driverId, { shipmentId, amount, paymentMethod, notes, receiptUrl }) => {
    const result = await pool.query(
        `INSERT INTO cash_collections
            (driver_id, shipment_id, amount, payment_method, notes, receipt_url)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [driverId, shipmentId ?? null, amount, paymentMethod, notes ?? null, receiptUrl ?? null],
    );
    return result.rows[0];
};

const getCollectionSummary = async (driverId) => {
    const result = await pool.query(
        `SELECT
            COUNT(*) FILTER (WHERE status = 'pending')                          AS pending_count,
            COALESCE(SUM(amount) FILTER (WHERE status = 'pending'),   0)::text  AS pending_amount,
            COUNT(*) FILTER (WHERE status = 'confirmed')                        AS confirmed_count,
            COALESCE(SUM(amount) FILTER (WHERE status = 'confirmed'), 0)::text  AS confirmed_amount,
            COUNT(*) FILTER (WHERE status = 'rejected')                         AS rejected_count,
            COUNT(*) FILTER (WHERE status = 'converted')                        AS converted_count
         FROM cash_collections
         WHERE driver_id = $1`,
        [driverId],
    );
    return result.rows[0];
};

module.exports = {
    getDriverCollections,
    getCollectionById,
    createCollection,
    getCollectionSummary,
};
