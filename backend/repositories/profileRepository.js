const pool = require('../config/database');

const ALLOWED_UPDATE_FIELDS = ['full_name', 'phone', 'dob', 'gender', 'address', 'city', 'country'];

const getAccountByEmail = async (email) => {
    const normalizedEmail = email.trim().toLowerCase();
    const result = await pool.query(
        `SELECT a.id, a.email, a.password_hash, a.role_id, r.name AS role, a.is_active, a.last_login_at, a.created_at, a.updated_at
         FROM accounts a
         JOIN roles r ON a.role_id = r.id
         WHERE LOWER(a.email) = $1`,
        [normalizedEmail],
    );
    return result.rows[0];
};

const getAccountById = async (accountId) => {
    const result = await pool.query(
        `SELECT a.id, a.email, a.role_id, r.name AS role, a.is_active
         FROM accounts a
         JOIN roles r ON a.role_id = r.id
         WHERE a.id = $1`,
        [accountId],
    );
    return result.rows[0] ?? null;
};

const getProfileByAccountId = async (accountId) => {
    const result = await pool.query(
        `SELECT p.id, p.full_name, p.phone, p.role_id, r.name AS role, a.is_active
         FROM profiles p
         JOIN accounts a ON p.id = a.id
         LEFT JOIN roles r ON p.role_id = r.id
         WHERE p.id = $1`,
        [accountId],
    );
    return result.rows[0] ?? null;
};

const getProfileWithRole = async (profileId) => {
    const result = await pool.query(
        `SELECT p.id, a.email, p.full_name, p.phone, p.role_id, r.name as role, a.is_active
         FROM profiles p
         JOIN accounts a ON p.id = a.id
         JOIN roles r ON p.role_id = r.id
         WHERE p.id = $1`,
        [profileId],
    );
    return result.rows[0];
};

// Full profile including new columns
const getFullProfile = async (userId) => {
    const result = await pool.query(
        `SELECT
            p.id,
            a.email,
            p.full_name,
            p.phone,
            p.role_id,
            r.name        AS role,
            p.avatar_url,
            p.dob,
            p.gender,
            p.address,
            p.city,
            p.country,
            a.is_active,
            p.created_at,
            p.updated_at
         FROM profiles p
         JOIN accounts a ON p.id = a.id
         JOIN roles r ON p.role_id = r.id
         WHERE p.id = $1`,
        [userId],
    );
    return result.rows[0] ?? null;
};

// Only allow updating whitelisted columns
const updateProfile = async (userId, data) => {
    const fields = Object.keys(data).filter((k) => ALLOWED_UPDATE_FIELDS.includes(k));
    if (fields.length === 0) return getFullProfile(userId);

    const setClauses = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
    const values = fields.map((f) => data[f]);

    const result = await pool.query(
        `UPDATE profiles
         SET ${setClauses}, updated_at = NOW()
         WHERE id = $1
         RETURNING id, full_name, phone, dob, gender, address, city, country, avatar_url, updated_at`,
        [userId, ...values],
    );
    return result.rows[0];
};

const updateAvatar = async (userId, avatarUrl) => {
    const result = await pool.query(
        `UPDATE profiles
         SET avatar_url = $2, updated_at = NOW()
         WHERE id = $1
         RETURNING avatar_url`,
        [userId, avatarUrl],
    );
    return result.rows[0];
};

const updateLastLogin = async (accountId) => {
    const result = await pool.query(
        'UPDATE accounts SET last_login_at = NOW() WHERE id = $1 RETURNING id',
        [accountId],
    );
    return result.rows[0];
};

const getProfileById = async (profileId) => {
    const result = await pool.query(
        `SELECT p.id, p.full_name, a.email, p.phone, p.role_id, a.is_active
         FROM profiles p
         JOIN accounts a ON a.id = p.id
         WHERE p.id = $1`,
        [profileId],
    );
    return result.rows[0];
};

const USER_SORT_COLUMNS = Object.freeze({
    id: 'a.id',
    email: 'a.email',
    full_name: 'p.full_name',
    phone: 'p.phone',
    role: 'r.name',
    is_active: 'a.is_active',
    last_login_at: 'a.last_login_at',
});

const getAllUsers = async ({ limit = 15, offset = 0, search = '', sortField = 'id', sortDir = 'asc' } = {}) => {
    const values = [];
    const filters = [];

    if (search) {
        values.push(`%${search}%`);
        const searchParam = `$${values.length}`;
        filters.push(`(
            CAST(a.id AS TEXT) ILIKE ${searchParam}
            OR a.email ILIKE ${searchParam}
            OR p.full_name ILIKE ${searchParam}
            OR p.phone ILIKE ${searchParam}
            OR r.name ILIKE ${searchParam}
        )`);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const sortColumn = USER_SORT_COLUMNS[sortField] || USER_SORT_COLUMNS.id;
    const direction = String(sortDir).toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    const baseFrom = `
         FROM accounts a
         JOIN profiles p ON a.id = p.id
         JOIN roles r ON a.role_id = r.id
         ${whereClause}`;

    const countResult = await pool.query(`SELECT COUNT(*)::int AS total ${baseFrom}`, values);

    const pageValues = [...values, limit, offset];
    const limitParam = `$${pageValues.length - 1}`;
    const offsetParam = `$${pageValues.length}`;
    const result = await pool.query(
        `SELECT a.id, a.email, p.full_name, p.phone, r.name AS role, a.is_active, a.last_login_at
         ${baseFrom}
         ORDER BY ${sortColumn} ${direction}, a.id ASC
         LIMIT ${limitParam} OFFSET ${offsetParam}`,
        pageValues,
    );

    return { rows: result.rows, total: countResult.rows[0]?.total ?? 0 };
};

const getRoleIdByName = async (roleName) => {
    const result = await pool.query('SELECT id FROM roles WHERE name = $1', [roleName]);
    return result.rows[0]?.id;
};

const adminCreateUser = async (email, passwordHash, roleId, fullName, phone) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const accountResult = await client.query(
            `INSERT INTO accounts (email, password_hash, role_id, is_active) 
             VALUES ($1, $2, $3, true) RETURNING id`,
            [email.toLowerCase(), passwordHash, roleId]
        );
        const accountId = accountResult.rows[0].id;
        
        await client.query(
            `INSERT INTO profiles (id, full_name, phone, role_id) 
             VALUES ($1, $2, $3, $4)`,
            [accountId, fullName, phone, roleId]
        );
        


        await client.query('COMMIT');
        return accountId;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

const adminUpdateUser = async (userId, data, roleId) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        await client.query(
            `UPDATE profiles SET full_name = $1, phone = $2, role_id = $3, updated_at = NOW() WHERE id = $4`,
            [data.full_name, data.phone, roleId, userId]
        );
        
        await client.query(
            `UPDATE accounts SET role_id = $1, updated_at = NOW() WHERE id = $2`,
            [roleId, userId]
        );
        
        await client.query('COMMIT');
        return true;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

const adminToggleUserStatus = async (userId, isActive) => {
    await pool.query(
        `UPDATE accounts SET is_active = $1, updated_at = NOW() WHERE id = $2`,
        [isActive, userId]
    );
};

module.exports = {
    getAccountByEmail,
    getAccountById,
    getProfileByAccountId,
    getProfileWithRole,
    getFullProfile,
    updateProfile,
    updateAvatar,
    updateLastLogin,
    getProfileById,
    getAllUsers,
    getRoleIdByName,
    adminCreateUser,
    adminUpdateUser,
    adminToggleUserStatus,
};
