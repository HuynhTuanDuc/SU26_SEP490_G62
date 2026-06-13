const pool = require('../../config/database');

const buildDebtStatus = (paidAmount, totalAmount) => {
    if (!totalAmount || totalAmount === 0) return 'paid';
    if (paidAmount >= totalAmount - 0.01) return 'paid';
    if (paidAmount > 0) return 'partial';
    return 'unpaid';
};

const getAllDebts = async ({
    debtType = null,    // 'customer' | 'driver' | null (all)
    status = null,      // 'paid' | 'partial' | 'unpaid' | null (all)
    customerSearch = null,
    driverSearch = null,
    page = 1,
    limit = 20,
} = {}) => {
    const params = [];
    const conditions = [];

    // Join tables
    let from = `
        FROM debts d
        LEFT JOIN customers c ON c.id = d.customer_id
        LEFT JOIN profiles dr ON dr.id = d.driver_id
        LEFT JOIN orders o ON o.id = d.order_id
        LEFT JOIN order_shipments os ON os.id = d.shipment_id
    `;

    // Debt type filter
    if (debtType) {
        params.push(debtType);
        conditions.push(`d.debt_type = $${params.length}`);
    }

    // Customer search
    if (customerSearch && customerSearch.trim()) {
        params.push(`%${customerSearch.trim()}%`);
        conditions.push(`(
            c.full_name ILIKE $${params.length}
            OR c.company_name ILIKE $${params.length}
            OR c.phone ILIKE $${params.length}
        )`);
    }

    // Driver search
    if (driverSearch && driverSearch.trim()) {
        params.push(`%${driverSearch.trim()}%`);
        conditions.push(`dr.full_name ILIKE $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Status subquery (computed column)
    // Applied in JS below after fetching rows

    // Count total
    const countQuery = `
        SELECT COUNT(*)::int AS total
        ${from}
        ${where}
    `;
    const countResult = await pool.query(countQuery, params);
    const totalItems = countResult.rows[0]?.total || 0;

    // Main query
    const offset = (page - 1) * limit;
    const queryParams = [...params, limit, offset];

    const result = await pool.query(
        `SELECT
            d.id,
            d.debt_type,
            d.total_amount::text,
            d.paid_amount::text,
            (COALESCE(d.total_amount, 0) - COALESCE(d.paid_amount, 0))::text AS remaining,
            d.status          AS raw_status,
            d.due_date,
            d.notes,
            d.created_at,
            d.updated_at,
            d.order_id,
            d.shipment_id,
            c.id              AS customer_id,
            c.full_name       AS customer_name,
            c.company_name    AS customer_company,
            c.phone           AS customer_phone,
            dr.id             AS driver_id,
            dr.full_name      AS driver_name,
            o.id              AS order_id,
            o.cargo_name      AS order_cargo_name,
            o.created_at      AS order_date
        ${from}
        ${where}
        ORDER BY d.created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        queryParams,
    );

    // Compute computed_status for each row
    const debts = result.rows.map((row) => ({
        ...row,
        computed_status: buildDebtStatus(
            Number(row.paid_amount || 0),
            Number(row.total_amount || 0),
        ),
    }));

    // Apply status filter in JS (since it's a computed column)
    const filteredDebts = status
        ? debts.filter((d) => d.computed_status === status)
        : debts;

    return {
        debts: filteredDebts,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
        limit,
    };
};

const getDebtStats = async () => {
    const result = await pool.query(`
        SELECT
            debt_type,
            COUNT(*)::int                                  AS count,
            COALESCE(SUM(total_amount), 0)::text          AS total_amount,
            COALESCE(SUM(paid_amount), 0)::text            AS total_paid,
            COALESCE(SUM(total_amount - paid_amount), 0)::text AS total_remaining
        FROM debts
        WHERE status <> 'paid'
        GROUP BY debt_type
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

// Nhóm công nợ theo người (customer hoặc driver)
const getDebtsGroupedByPerson = async ({
    debtType = null,    // 'customer' | 'driver' | null (all)
    status = null,      // 'paid' | 'partial' | 'unpaid' | null (all)
    customerSearch = null,
    driverSearch = null,
    page = 1,
    limit = 20,
} = {}) => {
    const params = [];
    const conditions = [];

    // Filter theo loại nợ
    if (debtType) {
        params.push(debtType);
        conditions.push(`d.debt_type = $${params.length}`);
    }

    // Filter theo status (áp dụng cho từng person sau khi tính tổng)
    // Status filter sẽ áp dụng ở bước cuối trong JS

    // Search khách hàng
    if (customerSearch && customerSearch.trim()) {
        params.push(`%${customerSearch.trim()}%`);
        conditions.push(`(
            c.full_name ILIKE $${params.length}
            OR c.company_name ILIKE $${params.length}
            OR c.phone ILIKE $${params.length}
        )`);
    }

    // Search tài xế
    if (driverSearch && driverSearch.trim()) {
        params.push(`%${driverSearch.trim()}%`);
        conditions.push(`dr.full_name ILIKE $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count unique persons (group by normalized phone / driver_id)
    const countGroupBy = debtType === 'driver' ? 'd.driver_id' :
                         debtType === 'customer' ? 'd.customer_id' :
                         'd.customer_id, d.driver_id';

    const countQuery = `
        SELECT COUNT(*)::int AS total FROM (
            SELECT 1 FROM debts d
            LEFT JOIN customers c ON c.id = d.customer_id
            LEFT JOIN profiles dr ON dr.id = d.driver_id
            ${where}
            GROUP BY ${countGroupBy}
        ) t
    `;
    const countResult = await pool.query(countQuery, params);
    const totalPersons = countResult.rows[0]?.total || 0;

    const offset = (page - 1) * limit;
    const queryParams = [...params, limit, offset];

    const groupByCol = debtType === 'driver' ? 'sub.driver_id' :
                       debtType === 'customer' ? 'sub.customer_id' :
                       'sub.customer_id, sub.driver_id';

    const mainQuery = `
        SELECT
            MAX(sub.debt_type)        AS debt_type,
            MAX(sub.driver_id)        AS driver_id,
            MAX(sub.customer_name)    AS customer_name,
            MAX(sub.customer_company) AS customer_company,
            sub.normalized_phone,
            MAX(sub.driver_name)      AS driver_name,
            COUNT(*)::int                                 AS debt_count,
            SUM(sub.total_amount)::text                   AS total_amount,
            SUM(sub.paid_amount)::text                    AS total_paid,
            (SUM(sub.total_amount) - SUM(sub.paid_amount))::text AS total_remaining,
            MIN(sub.due_date)                             AS earliest_due_date,
            MAX(sub.created_at)                           AS latest_created_at,
            ARRAY_AGG(DISTINCT sub.customer_id)           AS customer_ids,
            ARRAY_AGG(sub.debt_id ORDER BY sub.created_at)  AS debt_ids,
            ARRAY_AGG(sub.shipment_id ORDER BY sub.created_at) AS shipment_ids,
            ARRAY_AGG(sub.order_id ORDER BY sub.created_at)   AS order_ids
        FROM (
            SELECT
                d.debt_type,
                d.driver_id,
                c.full_name    AS customer_name,
                c.company_name AS customer_company,
                REGEXP_REPLACE(LOWER(TRIM(c.phone)), '\\s+', '', 'g') AS normalized_phone,
                dr.full_name   AS driver_name,
                d.total_amount,
                d.paid_amount,
                d.due_date,
                d.created_at,
                d.id            AS debt_id,
                d.customer_id,
                d.shipment_id,
                d.order_id
            FROM debts d
            LEFT JOIN customers c ON c.id = d.customer_id
            LEFT JOIN profiles dr ON dr.id = d.driver_id
            ${where}
        ) sub
        GROUP BY ${groupByCol}
        ORDER BY (SUM(sub.total_amount) - SUM(sub.paid_amount)) DESC NULLS LAST
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const result = await pool.query(mainQuery, queryParams);

    // Tính computed_status cho từng person
    let groupedDebts = result.rows.map((row) => {
        const totalAmount = Number(row.total_amount || 0);
        const totalPaid = Number(row.total_paid || 0);
        const totalRemaining = Number(row.total_remaining || 0);

        let computedStatus;
        if (totalRemaining <= 0.01) {
            computedStatus = 'paid';
        } else if (totalPaid > 0) {
            computedStatus = 'partial';
        } else {
            computedStatus = 'unpaid';
        }

        return {
            debt_type: row.debt_type,
            driver_id: row.driver_id,
            customer_name: row.customer_name,
            customer_company: row.customer_company,
            normalized_phone: row.normalized_phone,
            driver_name: row.driver_name,
            debt_count: Number(row.debt_count),
            total_amount: totalAmount,
            total_paid: totalPaid,
            total_remaining: totalRemaining,
            earliest_due_date: row.earliest_due_date,
            latest_created_at: row.latest_created_at,
            customer_ids: row.customer_ids,
            debt_ids: row.debt_ids,
            shipment_ids: row.shipment_ids,
            order_ids: row.order_ids,
            computed_status: computedStatus,
        };
    });

    // Apply status filter
    if (status) {
        groupedDebts = groupedDebts.filter((d) => d.computed_status === status);
    }

    return {
        debts: groupedDebts,
        totalPersons,
        totalPages: Math.ceil(totalPersons / limit),
        currentPage: page,
        limit,
    };
};

// Lấy chi tiết các khoản nợ của một person
const getDebtsByPerson = async (personType, personId) => {
    const whereField = personType === 'driver' ? 'd.driver_id' : 'd.customer_id';
    const result = await pool.query(`
        SELECT
            d.id,
            d.debt_type,
            d.total_amount::text,
            d.paid_amount::text,
            (d.total_amount - d.paid_amount)::text AS remaining,
            d.due_date,
            d.status          AS raw_status,
            d.notes,
            d.created_at,
            d.updated_at,
            d.order_id,
            d.shipment_id,
            d.driver_id,
            o.cargo_name      AS order_cargo_name,
            o.created_at      AS order_date,
            os.estimated_price AS shipment_price
        FROM debts d
        LEFT JOIN orders o ON o.id = d.order_id
        LEFT JOIN order_shipments os ON os.id = d.shipment_id
        WHERE ${whereField} = $1 AND d.debt_type = $2
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

// Lấy chi tiết công nợ của nhiều customer (gộp từ normalized phone)
const getDebtsByCustomerIds = async (customerIds) => {
    const result = await pool.query(`
        SELECT
            d.id,
            d.debt_type,
            d.customer_id,
            d.order_id,
            d.shipment_id,
            d.total_amount,
            d.paid_amount,
            (d.total_amount - d.paid_amount) AS remaining,
            d.due_date,
            d.status,
            d.notes,
            d.created_at,
            o.cargo_name AS order_cargo_name,
            os.estimated_price AS shipment_price
        FROM debts d
        LEFT JOIN orders o ON o.id = d.order_id
        LEFT JOIN order_shipments os ON os.id = d.shipment_id
        WHERE d.customer_id = ANY($1::int[])
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
