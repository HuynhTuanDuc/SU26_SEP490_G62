const pool = require('../config/database');

const getOverviewMetrics = async () => {
    const [workforceResult, fleetResult, workflowResult] = await Promise.all([
        pool.query(
            `SELECT
                COUNT(*)::int AS total_users,
                COUNT(*) FILTER (WHERE a.is_active)::int AS active_users,
                COUNT(*) FILTER (WHERE NOT a.is_active)::int AS inactive_users,
                COUNT(*) FILTER (WHERE r.name = 'manager')::int AS manager_count,
                COUNT(*) FILTER (WHERE r.name = 'coordinator')::int AS coordinator_count,
                COUNT(*) FILTER (WHERE r.name = 'accountant')::int AS accountant_count,
                COUNT(*) FILTER (WHERE r.name = 'driver')::int AS driver_count,
                COUNT(*) FILTER (WHERE a.is_active AND r.name <> 'driver')::int AS active_staff
             FROM accounts a
             JOIN roles r ON r.id = a.role_id`,
        ),
        pool.query(
            `SELECT
                COUNT(*) FILTER (WHERE status = 'active')::int AS active,
                COUNT(*) FILTER (WHERE status = 'maintenance')::int AS maintenance,
                COUNT(*) FILTER (WHERE status = 'broken')::int AS broken,
                COUNT(*) FILTER (WHERE status = 'retired')::int AS retired
             FROM vehicles`,
        ),
        pool.query(
            `SELECT
                (SELECT COUNT(*)::int FROM salary_advances WHERE status = 'pending') AS pending_advances,
                COALESCE((SELECT SUM(amount) FROM salary_advances WHERE status = 'pending'), 0)::text AS pending_advances_amount,
                (SELECT COUNT(*)::int FROM debt_payments WHERE status = 'pending') AS pending_repayments,
                COALESCE((SELECT SUM(amount) FROM debt_payments WHERE status = 'pending'), 0)::text AS pending_repayments_amount,
                (SELECT COUNT(*)::int FROM order_receipt_requests WHERE status = 'pending') AS pending_receipts,
                (SELECT COUNT(*)::int FROM order_receipt_requests WHERE status = 'processing') AS processing_receipts`,
        ),
    ]);

    return {
        workforce: workforceResult.rows[0],
        fleet: fleetResult.rows[0],
        workflow: workflowResult.rows[0],
    };
};

const getSalaryAdvances = async ({ status = 'pending', limit = 20 } = {}) => {
    const params = [];
    const clauses = [];
    const normalizedStatus = String(status || '').trim().toLowerCase();

    if (normalizedStatus && normalizedStatus !== 'all') {
        params.push(normalizedStatus);
        clauses.push(`sa.status = $${params.length}`);
    }

    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
    params.push(safeLimit);

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const result = await pool.query(
        `SELECT
            sa.id,
            sa.driver_id,
            sa.amount::text,
            sa.reason,
            sa.request_month,
            sa.request_year,
            sa.status,
            sa.reject_reason,
            sa.created_at,
            sa.reviewed_at,
            sa.approved_at,
            p.full_name AS driver_name,
            p.phone AS driver_phone,
            a.email AS driver_email
         FROM salary_advances sa
         JOIN profiles p ON p.id = sa.driver_id
         JOIN accounts a ON a.id = sa.driver_id
         ${whereClause}
         ORDER BY
            CASE sa.status
                WHEN 'pending' THEN 0
                WHEN 'approved' THEN 1
                WHEN 'paid' THEN 2
                ELSE 3
            END,
            sa.created_at DESC
         LIMIT $${params.length}`,
        params,
    );

    return result.rows;
};

const getSalaryAdvanceById = async (advanceId) => {
    const result = await pool.query(
        `SELECT
            sa.*,
            p.full_name AS driver_name,
            a.email AS driver_email
         FROM salary_advances sa
         JOIN profiles p ON p.id = sa.driver_id
         JOIN accounts a ON a.id = sa.driver_id
         WHERE sa.id = $1`,
        [advanceId],
    );

    return result.rows[0] ?? null;
};

const approveSalaryAdvance = async (advanceId, managerId) => {
    const result = await pool.query(
        `UPDATE salary_advances
         SET
            status = 'approved',
            reviewed_by = $2,
            reviewed_at = NOW(),
            approved_by = $2,
            approved_at = NOW(),
            reject_reason = NULL,
            updated_at = NOW()
         WHERE id = $1
         RETURNING id, driver_id, amount::text, request_month, request_year, status, approved_at`,
        [advanceId, managerId],
    );

    return result.rows[0] ?? null;
};

const rejectSalaryAdvance = async (advanceId, managerId, reason = null) => {
    const result = await pool.query(
        `UPDATE salary_advances
         SET
            status = 'rejected',
            reviewed_by = $2,
            reviewed_at = NOW(),
            approved_by = NULL,
            approved_at = NULL,
            reject_reason = $3,
            updated_at = NOW()
         WHERE id = $1
         RETURNING id, driver_id, amount::text, request_month, request_year, status, reject_reason, reviewed_at`,
        [advanceId, managerId, reason],
    );

    return result.rows[0] ?? null;
};

const getPartnerSummary = async () => {
    const result = await pool.query(
        `SELECT
            COUNT(*)::int AS total_partners,
            COUNT(*) FILTER (
                WHERE EXISTS (
                    SELECT 1
                    FROM debts d
                    LEFT JOIN (
                        SELECT debt_id,
                               COALESCE(SUM(amount) FILTER (WHERE status = 'confirmed'), 0) AS paid
                        FROM debt_payments GROUP BY debt_id
                    ) dp ON dp.debt_id = d.id
                    WHERE d.partner_id = p.id
                      AND d.debt_type = 'partner'
                      AND d.total_amount - COALESCE(dp.paid, 0) > 0.01
                )
            )::int AS partners_with_debt,
            COALESCE((
                SELECT SUM(GREATEST(d.total_amount - COALESCE(dp_agg.paid, 0), 0))
                FROM debts d
                LEFT JOIN (
                    SELECT debt_id,
                           COALESCE(SUM(amount) FILTER (WHERE status = 'confirmed'), 0) AS paid
                    FROM debt_payments GROUP BY debt_id
                ) dp_agg ON dp_agg.debt_id = d.id
                WHERE d.debt_type = 'partner'
            ), 0)::text AS total_remaining
         FROM partners p`,
    );

    return result.rows[0];
};

const PARTNER_REMAINING_EXPR = `COALESCE(SUM(GREATEST(d.total_amount - COALESCE(dp_agg.paid, 0), 0)), 0)`;

const PARTNER_SORTS = {
    name: 'p.company_name ASC',
    'debt-desc': `${PARTNER_REMAINING_EXPR} DESC`,
    'debt-asc': `${PARTNER_REMAINING_EXPR} ASC`,
};

const listPartners = async ({ search = '', page, limit, hasDebt = null, sort = null } = {}) => {
    const params = [];
    const conditions = [];
    const normalizedSearch = String(search || '').trim();

    if (normalizedSearch) {
        params.push(`%${normalizedSearch}%`);
        conditions.push(`(
            p.company_name ILIKE $${params.length}
            OR COALESCE(p.short_name, '') ILIKE $${params.length}
            OR COALESCE(p.contact_person, '') ILIKE $${params.length}
            OR COALESCE(p.phone, '') ILIKE $${params.length}
            OR COALESCE(p.email, '') ILIKE $${params.length}
            OR COALESCE(p.tax_code, '') ILIKE $${params.length}
        )`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // hasDebt filters on the aggregated remaining amount, applied via HAVING since it depends on the GROUP BY
    let havingClause = '';
    if (hasDebt === true) havingClause = `HAVING ${PARTNER_REMAINING_EXPR} > 0`;
    else if (hasDebt === false) havingClause = `HAVING ${PARTNER_REMAINING_EXPR} = 0`;

    // sort is resolved via allowlist, never interpolated directly from user input
    const orderClause = PARTNER_SORTS[sort] ?? `${PARTNER_REMAINING_EXPR} DESC, p.company_name ASC`;

    let limitClause = '';
    if (limit) {
        const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
        const safePage  = Math.max(1, Number(page) || 1);
        params.push(safeLimit, (safePage - 1) * safeLimit);
        limitClause = `LIMIT $${params.length - 1} OFFSET $${params.length}`;
    }

    const result = await pool.query(
        `SELECT
            p.id,
            p.company_name,
            p.short_name,
            p.contact_person,
            p.phone,
            p.email,
            p.address,
            p.tax_code,
            p.business_registration_number,
            p.payment_term_days,
            p.bank_name,
            p.bank_account_number,
            p.bank_account_name,
            p.notes,
            p.created_at,
            COUNT(d.id)::int AS debt_count,
            COALESCE(SUM(d.total_amount), 0)::text AS total_amount,
            COALESCE(SUM(COALESCE(dp_agg.paid, 0)), 0)::text AS total_paid,
            COALESCE(SUM(GREATEST(d.total_amount - COALESCE(dp_agg.paid, 0), 0)), 0)::text AS total_remaining,
            MIN(d.due_date) AS earliest_due_date,
            MAX(d.created_at) AS latest_debt_at
         FROM partners p
         LEFT JOIN debts d
            ON d.partner_id = p.id
           AND d.debt_type = 'partner'
         LEFT JOIN (
             SELECT debt_id,
                    COALESCE(SUM(amount) FILTER (WHERE status = 'confirmed'), 0) AS paid
             FROM debt_payments GROUP BY debt_id
         ) dp_agg ON dp_agg.debt_id = d.id
         ${whereClause}
         GROUP BY p.id
         ${havingClause}
         ORDER BY ${orderClause}
         ${limitClause}`,
        params,
    );

    if (!limit) return result.rows;

    const countParams = normalizedSearch ? [params[0]] : [];
    const { rows: countRows } = await pool.query(
        `SELECT COUNT(*)::int AS total FROM (
            SELECT p.id
            FROM partners p
            LEFT JOIN debts d
               ON d.partner_id = p.id
              AND d.debt_type = 'partner'
            LEFT JOIN (
                SELECT debt_id,
                       COALESCE(SUM(amount) FILTER (WHERE status = 'confirmed'), 0) AS paid
                FROM debt_payments GROUP BY debt_id
            ) dp_agg ON dp_agg.debt_id = d.id
            ${whereClause}
            GROUP BY p.id
            ${havingClause}
         ) counted`,
        countParams,
    );
    const total = countRows[0]?.total ?? 0;
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
    return {
        rows: result.rows,
        total,
        page: Math.max(1, Number(page) || 1),
        limit: safeLimit,
        totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    };
};

const getPartnerById = async (partnerId) => {
    const result = await pool.query(
        `SELECT
            id,
            company_name,
            short_name,
            contact_person,
            phone,
            email,
            address,
            tax_code,
            business_registration_number,
            payment_term_days,
            bank_name,
            bank_account_number,
            bank_account_name,
            notes,
            created_at
         FROM partners
         WHERE id = $1`,
        [partnerId],
    );

    return result.rows[0] ?? null;
};

const createPartner = async ({ companyName, shortName, contactPerson, phone, email, address, taxCode, businessRegistrationNumber, paymentTermDays, bankName, bankAccountNumber, bankAccountName, notes }) => {
    const result = await pool.query(
        `INSERT INTO partners (company_name, short_name, contact_person, phone, email, address, tax_code, business_registration_number, payment_term_days, bank_name, bank_account_number, bank_account_name, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING id, company_name, short_name, contact_person, phone, email, address, tax_code, business_registration_number, payment_term_days, bank_name, bank_account_number, bank_account_name, notes, created_at`,
        [companyName, shortName, contactPerson, phone, email, address, taxCode, businessRegistrationNumber, paymentTermDays, bankName, bankAccountNumber, bankAccountName, notes],
    );

    return result.rows[0];
};

const updatePartner = async (partnerId, { companyName, shortName, contactPerson, phone, email, address, taxCode, businessRegistrationNumber, paymentTermDays, bankName, bankAccountNumber, bankAccountName, notes }) => {
    const result = await pool.query(
        `UPDATE partners
         SET
            company_name = $2,
            short_name = $3,
            contact_person = $4,
            phone = $5,
            email = $6,
            address = $7,
            tax_code = $8,
            business_registration_number = $9,
            payment_term_days = $10,
            bank_name = $11,
            bank_account_number = $12,
            bank_account_name = $13,
            notes = $14
         WHERE id = $1
         RETURNING id, company_name, short_name, contact_person, phone, email, address, tax_code, business_registration_number, payment_term_days, bank_name, bank_account_number, bank_account_name, notes, created_at`,
        [partnerId, companyName, shortName, contactPerson, phone, email, address, taxCode, businessRegistrationNumber, paymentTermDays, bankName, bankAccountNumber, bankAccountName, notes],
    );

    return result.rows[0] ?? null;
};

const getPartnerDebtDetails = async (partnerId) => {
    const result = await pool.query(
        `SELECT
            d.id,
            d.order_id,
            d.shipment_id,
            d.total_amount::text,
            COALESCE(dp_agg.paid, 0)::text AS paid_amount,
            GREATEST(d.total_amount - COALESCE(dp_agg.paid, 0), 0)::text AS remaining,
            CASE
                WHEN d.total_amount - COALESCE(dp_agg.paid, 0) <= 0.01 THEN 'paid'
                WHEN COALESCE(dp_agg.paid, 0) > 0 THEN 'partial'
                ELSE 'unpaid'
            END AS status,
            d.due_date,
            d.notes,
            d.created_at,
            o.cargo_name,
            c.full_name AS customer_name,
            c.company_name AS customer_company
         FROM debts d
         LEFT JOIN (
             SELECT debt_id,
                    COALESCE(SUM(amount) FILTER (WHERE status = 'confirmed'), 0) AS paid
             FROM debt_payments GROUP BY debt_id
         ) dp_agg ON dp_agg.debt_id = d.id
         LEFT JOIN orders o ON o.id = d.order_id
         LEFT JOIN customers c ON c.id = d.customer_id
         WHERE d.partner_id = $1
           AND d.debt_type = 'partner'
         ORDER BY d.created_at DESC`,
        [partnerId],
    );

    return result.rows;
};

module.exports = {
    getOverviewMetrics,
    getSalaryAdvances,
    getSalaryAdvanceById,
    approveSalaryAdvance,
    rejectSalaryAdvance,
    getPartnerSummary,
    listPartners,
    getPartnerById,
    createPartner,
    updatePartner,
    getPartnerDebtDetails,
};
