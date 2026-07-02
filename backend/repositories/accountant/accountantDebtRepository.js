const pool = require('../../config/database');

const buildDebtStatus = (paidAmount, totalAmount) => {
    if (!totalAmount || totalAmount === 0) return 'paid';
    if (paidAmount >= totalAmount - 0.01) return 'paid';
    if (paidAmount > 0) return 'partial';
    return 'unpaid';
};

const getAllDebts = async ({
    debtType = null,
    status = null,
    customerSearch = null,
    driverSearch = null,
    page = 1,
    limit = 20,
} = {}) => {
    const params = [];
    const baseConditions = [];

    if (debtType) {
        params.push(debtType);
        baseConditions.push(`d.debt_type = $${params.length}`);
    }
    if (customerSearch && customerSearch.trim()) {
        params.push(`%${customerSearch.trim()}%`);
        baseConditions.push(`(
            c.full_name ILIKE $${params.length}
            OR c.company_name ILIKE $${params.length}
            OR c.phone ILIKE $${params.length}
        )`);
    }
    if (driverSearch && driverSearch.trim()) {
        params.push(`%${driverSearch.trim()}%`);
        baseConditions.push(`dr.full_name ILIKE $${params.length}`);
    }

    const baseWhere = baseConditions.length > 0 ? `WHERE ${baseConditions.join(' AND ')}` : '';

    let statusFilter = '';
    if (status) {
        params.push(status);
        statusFilter = `AND computed_status = $${params.length}`;
    }

    const cteSql = `
        WITH base_debts AS (
            SELECT
                d.id,
                d.debt_type,
                d.total_amount,
                COALESCE(SUM(dp.amount) FILTER (WHERE dp.status = 'confirmed'), 0) AS paid_amount,
                COALESCE(d.total_amount, 0) - COALESCE(SUM(dp.amount) FILTER (WHERE dp.status = 'confirmed'), 0) AS remaining,
                CASE
                    WHEN COALESCE(d.total_amount, 0) <= 0 THEN 'paid'
                    WHEN COALESCE(SUM(dp.amount) FILTER (WHERE dp.status = 'confirmed'), 0) >= d.total_amount - 0.01 THEN 'paid'
                    WHEN COALESCE(SUM(dp.amount) FILTER (WHERE dp.status = 'confirmed'), 0) > 0 THEN 'partial'
                    ELSE 'unpaid'
                END AS computed_status,
                d.due_date, d.notes, d.created_at, d.updated_at,
                d.order_id, d.shipment_id,
                c.id              AS customer_id,
                c.full_name       AS customer_name,
                c.company_name    AS customer_company,
                c.phone           AS customer_phone,
                dr.id             AS driver_id,
                dr.full_name      AS driver_name,
                dr.phone          AS driver_phone,
                o.cargo_name      AS order_cargo_name,
                o.created_at      AS order_date
            FROM debts d
            LEFT JOIN debt_payments dp ON dp.debt_id = d.id
            LEFT JOIN customers c ON c.id = d.customer_id
            LEFT JOIN profiles dr ON dr.id = d.driver_id
            LEFT JOIN orders o ON o.id = d.order_id
            ${baseWhere}
            GROUP BY
                d.id, d.debt_type, d.total_amount, d.due_date, d.notes, d.created_at, d.updated_at,
                d.order_id, d.shipment_id,
                c.id, c.full_name, c.company_name, c.phone,
                dr.id, dr.full_name, dr.phone,
                o.cargo_name, o.created_at
        )
    `;

    const countResult = await pool.query(
        `${cteSql} SELECT COUNT(*)::int AS total FROM base_debts WHERE TRUE ${statusFilter}`,
        params,
    );
    const totalItems = countResult.rows[0]?.total || 0;

    const offset = (page - 1) * limit;
    const mainParams = [...params, limit, offset];

    const mainResult = await pool.query(
        `${cteSql}
         SELECT * FROM base_debts WHERE TRUE ${statusFilter}
         ORDER BY created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        mainParams,
    );

    return {
        debts: mainResult.rows,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
        limit,
    };
};

const getDebtStats = async () => {
    const result = await pool.query(`
        SELECT
            d.debt_type,
            COUNT(*)::int                                  AS count,
            COALESCE(SUM(d.total_amount), 0)::text        AS total_amount,
            COALESCE(SUM(COALESCE(dp_agg.paid_amount, 0)), 0)::text AS total_paid,
            COALESCE(SUM(GREATEST(d.total_amount - COALESCE(dp_agg.paid_amount, 0), 0)), 0)::text AS total_remaining
        FROM debts d
        LEFT JOIN (
            SELECT debt_id, SUM(amount) FILTER (WHERE status = 'confirmed') AS paid_amount
            FROM debt_payments
            GROUP BY debt_id
        ) dp_agg ON dp_agg.debt_id = d.id
        WHERE GREATEST(d.total_amount - COALESCE(dp_agg.paid_amount, 0), 0) > 0.01
        GROUP BY d.debt_type
    `);

    const byType = {};
    let overallRemaining = 0;

    for (const row of result.rows) {
        byType[row.debt_type] = {
            count: row.count,
            total_amount: Number(row.total_amount),
            total_paid: Number(row.total_paid),
            total_remaining: Number(row.total_remaining),
        };
        overallRemaining += Number(row.total_remaining);
    }

    return {
        byType,
        totalRemaining: overallRemaining,
    };
};

const getDebtsGroupedByPerson = async ({
    debtType = null,
    status = null,
    customerSearch = null,
    driverSearch = null,
    page = 1,
    limit = 20,
} = {}) => {
    const params = [];
    const conditions = [];

    if (debtType) {
        params.push(debtType);
        conditions.push(`d.debt_type = $${params.length}`);
    }
    if (customerSearch && customerSearch.trim()) {
        params.push(`%${customerSearch.trim()}%`);
        conditions.push(`(
            c.full_name ILIKE $${params.length}
            OR c.company_name ILIKE $${params.length}
            OR c.phone ILIKE $${params.length}
        )`);
    }
    if (driverSearch && driverSearch.trim()) {
        params.push(`%${driverSearch.trim()}%`);
        conditions.push(`dr.full_name ILIKE $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    let havingClause = '';
    if (status) {
        params.push(status);
        havingClause = `
            HAVING CASE
                WHEN SUM(sub.total_amount) - SUM(sub.paid_amount) <= 0.01 THEN 'paid'
                WHEN SUM(sub.paid_amount) > 0 THEN 'partial'
                ELSE 'unpaid'
            END = $${params.length}
        `;
    }

    const groupByCol = debtType === 'driver' ? 'sub.driver_id' :
                       debtType === 'customer' ? 'sub.customer_id' :
                       'sub.customer_id, sub.driver_id';

    const innerSql = `
        SELECT
            d.debt_type, d.driver_id,
            c.full_name AS customer_name, c.company_name AS customer_company, c.phone AS customer_phone,
            dr.full_name AS driver_name, dr.phone AS driver_phone,
            d.total_amount,
            COALESCE(SUM(dp.amount) FILTER (WHERE dp.status = 'confirmed'), 0) AS paid_amount,
            d.due_date, d.created_at,
            d.id AS debt_id, d.customer_id, d.shipment_id, d.order_id
        FROM debts d
        LEFT JOIN debt_payments dp ON dp.debt_id = d.id
        LEFT JOIN customers c ON c.id = d.customer_id
        LEFT JOIN profiles dr ON dr.id = d.driver_id
        ${where}
        GROUP BY
            d.id, d.debt_type, d.driver_id, d.total_amount, d.due_date, d.created_at,
            d.customer_id, d.shipment_id, d.order_id,
            c.full_name, c.company_name, c.phone,
            dr.full_name, dr.phone
    `;

    const countQuery = `
        SELECT COUNT(*)::int AS total FROM (
            SELECT 1 FROM (${innerSql}) sub
            GROUP BY ${groupByCol}
            ${havingClause}
        ) t
    `;
    const countResult = await pool.query(countQuery, params);
    const totalPersons = countResult.rows[0]?.total || 0;

    const offset = (page - 1) * limit;
    const queryParams = [...params, limit, offset];

    const mainQuery = `
        SELECT
            MAX(sub.debt_type)        AS debt_type,
            MAX(sub.driver_id)        AS driver_id,
            MAX(sub.customer_name)    AS customer_name,
            MAX(sub.customer_company) AS customer_company,
            MAX(sub.customer_phone)   AS customer_phone,
            MAX(sub.driver_name)      AS driver_name,
            MAX(sub.driver_phone)     AS driver_phone,
            COUNT(*)::int                                        AS debt_count,
            SUM(sub.total_amount)::text                          AS total_amount,
            SUM(sub.paid_amount)::text                           AS total_paid,
            (SUM(sub.total_amount) - SUM(sub.paid_amount))::text AS total_remaining,
            CASE
                WHEN SUM(sub.total_amount) - SUM(sub.paid_amount) <= 0.01 THEN 'paid'
                WHEN SUM(sub.paid_amount) > 0 THEN 'partial'
                ELSE 'unpaid'
            END AS computed_status,
            MIN(sub.due_date)                                     AS earliest_due_date,
            MAX(sub.created_at)                                   AS latest_created_at,
            ARRAY_AGG(DISTINCT sub.customer_id)                   AS customer_ids,
            ARRAY_AGG(sub.debt_id ORDER BY sub.created_at)        AS debt_ids,
            ARRAY_AGG(sub.shipment_id ORDER BY sub.created_at)    AS shipment_ids,
            ARRAY_AGG(sub.order_id ORDER BY sub.created_at)       AS order_ids
        FROM (${innerSql}) sub
        GROUP BY ${groupByCol}
        ${havingClause}
        ORDER BY (SUM(sub.total_amount) - SUM(sub.paid_amount)) DESC NULLS LAST
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const result = await pool.query(mainQuery, queryParams);

    const groupedDebts = result.rows.map((row) => ({
        debt_type: row.debt_type,
        driver_id: row.driver_id,
        customer_name: row.customer_name,
        customer_company: row.customer_company,
        customer_phone: row.customer_phone,
        driver_name: row.driver_name,
        driver_phone: row.driver_phone,
        debt_count: Number(row.debt_count),
        total_amount: Number(row.total_amount || 0),
        total_paid: Number(row.total_paid || 0),
        total_remaining: Number(row.total_remaining || 0),
        computed_status: row.computed_status,
        earliest_due_date: row.earliest_due_date,
        latest_created_at: row.latest_created_at,
        customer_ids: row.customer_ids,
        debt_ids: row.debt_ids,
        shipment_ids: row.shipment_ids,
        order_ids: row.order_ids,
    }));

    return {
        debts: groupedDebts,
        totalPersons,
        totalPages: Math.ceil(totalPersons / limit),
        currentPage: page,
        limit,
    };
};

const getDebtsByPerson = async (personType, personId) => {
    const whereField = personType === 'driver' ? 'd.driver_id' : 'd.customer_id';
    const result = await pool.query(`
        SELECT
            d.id,
            d.debt_type,
            d.total_amount::text,
            COALESCE(SUM(dp.amount) FILTER (WHERE dp.status = 'confirmed'), 0)::text AS paid_amount,
            (d.total_amount - COALESCE(SUM(dp.amount) FILTER (WHERE dp.status = 'confirmed'), 0))::text AS remaining,
            d.due_date,
            d.notes,
            d.created_at,
            d.updated_at,
            d.order_id,
            d.shipment_id,
            d.driver_id,
            o.cargo_name      AS order_cargo_name,
            o.created_at      AS order_date,
            os.estimated_price AS shipment_price,
            c.full_name    AS customer_name,
            c.company_name AS customer_company,
            c.phone        AS customer_phone,
            dr.full_name   AS driver_name,
            dr.phone       AS driver_phone
        FROM debts d
        LEFT JOIN debt_payments dp ON dp.debt_id = d.id
        LEFT JOIN orders o ON o.id = d.order_id
        LEFT JOIN order_shipments os ON os.id = d.shipment_id
        LEFT JOIN customers c ON c.id = d.customer_id
        LEFT JOIN profiles dr ON dr.id = d.driver_id
        WHERE ${whereField} = $1 AND d.debt_type = $2
        GROUP BY
            d.id, d.debt_type, d.total_amount, d.due_date, d.notes, d.created_at, d.updated_at,
            d.order_id, d.shipment_id, d.driver_id,
            o.cargo_name, o.created_at,
            os.estimated_price,
            c.full_name, c.company_name, c.phone,
            dr.full_name, dr.phone
        ORDER BY d.created_at DESC
    `, [personId, personType]);

    return result.rows.map((row) => ({
        ...row,
        total_amount: Number(row.total_amount),
        paid_amount: Number(row.paid_amount),
        remaining: Number(row.remaining),
        shipment_price: Number(row.shipment_price),
        computed_status: buildDebtStatus(Number(row.paid_amount), Number(row.total_amount)),
    }));
};

const getDebtsByCustomerIds = async (customerIds) => {
    const result = await pool.query(`
        SELECT
            d.id,
            d.debt_type,
            d.customer_id,
            d.order_id,
            d.shipment_id,
            d.total_amount,
            COALESCE(SUM(dp.amount) FILTER (WHERE dp.status = 'confirmed'), 0) AS paid_amount,
            (d.total_amount - COALESCE(SUM(dp.amount) FILTER (WHERE dp.status = 'confirmed'), 0)) AS remaining,
            d.due_date,
            d.notes,
            d.created_at,
            o.cargo_name AS order_cargo_name,
            os.estimated_price AS shipment_price,
            c.full_name    AS customer_name,
            c.company_name AS customer_company,
            c.phone        AS customer_phone,
            dr.full_name   AS driver_name,
            dr.phone       AS driver_phone
        FROM debts d
        LEFT JOIN debt_payments dp ON dp.debt_id = d.id
        LEFT JOIN orders o ON o.id = d.order_id
        LEFT JOIN order_shipments os ON os.id = d.shipment_id
        LEFT JOIN customers c ON c.id = d.customer_id
        LEFT JOIN profiles dr ON dr.id = d.driver_id
        WHERE d.customer_id = ANY($1::int[])
        GROUP BY
            d.id, d.debt_type, d.customer_id, d.order_id, d.shipment_id,
            d.total_amount, d.due_date, d.notes, d.created_at,
            o.cargo_name,
            os.estimated_price,
            c.full_name, c.company_name, c.phone,
            dr.full_name, dr.phone
        ORDER BY d.created_at DESC
    `, [customerIds]);

    return result.rows.map((row) => ({
        ...row,
        total_amount: Number(row.total_amount),
        paid_amount: Number(row.paid_amount),
        remaining: Number(row.remaining),
        shipment_price: Number(row.shipment_price),
        computed_status: buildDebtStatus(Number(row.paid_amount), Number(row.total_amount)),
    }));
};

module.exports = { getAllDebts, getDebtStats, getDebtsGroupedByPerson, getDebtsByPerson, getDebtsByCustomerIds };
