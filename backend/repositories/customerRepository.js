const pool = require('../config/database');

const SORT_OPTIONS = {
    newest: 'c.created_at DESC',
    name_asc: 'COALESCE(c.company_name, c.full_name) ASC',
    orders_desc: 'total_orders DESC',
};

const listCustomers = async ({ search = '', page = 1, limit = 20, type = '', sort = 'newest' } = {}) => {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const params = [];
    const conditions = [];
    if (search?.trim()) {
        const keyword = `%${search.trim()}%`;
        params.push(keyword);
        conditions.push(`(c.full_name ILIKE $${params.length}
            OR c.company_name ILIKE $${params.length}
            OR c.phone ILIKE $${params.length}
            OR c.tax_code ILIKE $${params.length})`);
    }
    if (type?.trim()) {
        params.push(type.trim());
        conditions.push(`c.customer_type = $${params.length}`);
    }
    const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderBySql = SORT_OPTIONS[sort] || SORT_OPTIONS.newest;

    const countResult = await pool.query(
        `SELECT COUNT(*)::int AS total FROM customers c ${whereSql}`,
        params,
    );

    const rowsResult = await pool.query(
        `SELECT
            c.*,
            COUNT(o.id)::int AS total_orders
         FROM customers c
         LEFT JOIN orders o ON o.customer_id = c.id
         ${whereSql}
         GROUP BY c.id
         ORDER BY ${orderBySql}
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limitNum, offset],
    );

    return {
        customers: rowsResult.rows,
        pagination: {
            page: pageNum,
            limit: limitNum,
            total: countResult.rows[0].total,
            totalPages: Math.max(1, Math.ceil(countResult.rows[0].total / limitNum)),
        },
    };
};

const getCustomerById = async (id) => {
    const result = await pool.query(`SELECT * FROM customers WHERE id = $1`, [id]);
    return result.rows[0] ?? null;
};

const findByPhone = async (phone) => {
    const result = await pool.query(`SELECT * FROM customers WHERE phone = $1 LIMIT 1`, [phone]);
    return result.rows[0] ?? null;
};

const createCustomer = async ({ customerType, fullName, companyName, contactPerson, phone, email, address, taxCode, notes }) => {
    const result = await pool.query(
        `INSERT INTO customers
            (customer_type, full_name, company_name, contact_person, phone, email, address, tax_code, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [customerType, fullName ?? null, companyName ?? null, contactPerson ?? null, phone, email ?? null, address ?? null, taxCode ?? null, notes ?? null],
    );
    return result.rows[0];
};

const updateCustomer = async (id, { customerType, fullName, companyName, contactPerson, phone, email, address, taxCode, notes }) => {
    const result = await pool.query(
        `UPDATE customers
         SET customer_type  = COALESCE($2, customer_type),
             full_name      = $3,
             company_name   = $4,
             contact_person = $5,
             phone          = COALESCE($6, phone),
             email          = $7,
             address        = $8,
             tax_code       = $9,
             notes          = $10,
             updated_at     = NOW()
         WHERE id = $1
         RETURNING *`,
        [id, customerType ?? null, fullName ?? null, companyName ?? null, contactPerson ?? null, phone ?? null, email ?? null, address ?? null, taxCode ?? null, notes ?? null],
    );
    return result.rows[0] ?? null;
};

const countOrdersForCustomer = async (id) => {
    const result = await pool.query(`SELECT COUNT(*)::int AS total FROM orders WHERE customer_id = $1`, [id]);
    return result.rows[0].total;
};

const deleteCustomer = async (id) => {
    const result = await pool.query(`DELETE FROM customers WHERE id = $1 RETURNING id`, [id]);
    return result.rows[0] ?? null;
};

module.exports = {
    listCustomers,
    getCustomerById,
    findByPhone,
    createCustomer,
    updateCustomer,
    countOrdersForCustomer,
    deleteCustomer,
};
