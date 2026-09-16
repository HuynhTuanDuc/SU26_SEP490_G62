const pool = require('../config/database');

const ALLOWED_UPDATE_FIELDS = ['full_name', 'phone', 'dob', 'gender', 'address', 'city', 'country', 'national_id', 'tax_code', 'emergency_contact_name', 'emergency_contact_phone', 'notes'];

// dob là cột DATE: để node-pg tự parse thì ra Date lúc 0h giờ máy chủ — TZ=Asia/Ho_Chi_Minh
// thành 17h hôm trước theo UTC, JSON trả "1990-05-14T17:00:00.000Z" và client cắt 10 ký tự
// là hụt 1 ngày (lưu lại thì ngày sinh lùi thêm 1 ngày mỗi lần). Luôn trả chuỗi YYYY-MM-DD.

const getAccountByEmail = async (email) => {
    // Từ khi email thành tuỳ chọn, có tài khoản mang email NULL. Chuỗi rỗng/không phải
    // chuỗi thì không tra gì cả — tránh việc một ô email bỏ trống vô tình khớp phải
    // nhóm tài khoản không có email.
    if (typeof email !== 'string' || !email.trim()) return undefined;
    const normalizedEmail = email.trim().toLowerCase();
    const result = await pool.query(
        `SELECT a.id, a.email, a.password_hash, a.role_id, r.name AS role, a.is_active, a.must_change_password, a.last_login_at, a.created_at, a.updated_at
         FROM accounts a
         JOIN roles r ON a.role_id = r.id
         WHERE LOWER(a.email) = $1`,
        [normalizedEmail],
    );
    return result.rows[0];
};

// Đăng nhập bằng số điện thoại. Số nằm ở profiles (UNIQUE), không nằm ở accounts,
// nên phải JOIN. So sánh trên phần CHỈ CÒN CHỮ SỐ của cả hai vế: cùng một thuê bao có
// thể được lưu là '0901000001', '0901 000 001' hay '+84901000001' tuỳ người nhập, và
// người đăng nhập cũng gõ mỗi lúc một kiểu. Bảng profiles chỉ chứa nhân sự công ty
// (vài chục dòng) nên việc không dùng được index ở đây không đáng kể.
// $1 = dạng nội địa chỉ số ('0901000001'), $2 = dạng quốc tế chỉ số ('84901000001').
const getAccountByPhone = async (localDigits, intlDigits) => {
    const result = await pool.query(
        `SELECT a.id, a.email, a.password_hash, a.role_id, r.name AS role, a.is_active, a.must_change_password, a.last_login_at, a.created_at, a.updated_at
         FROM accounts a
         JOIN profiles p ON p.id = a.id
         JOIN roles r ON a.role_id = r.id
         WHERE regexp_replace(COALESCE(p.phone, ''), '\\D', '', 'g') IN ($1, $2)`,
        [localDigits, intlDigits],
    );
    return result.rows[0];
};

const getAccountById = async (accountId) => {
    const result = await pool.query(
        `SELECT a.id, a.email, a.role_id, r.name AS role, a.is_active, a.must_change_password
         FROM accounts a
         JOIN roles r ON a.role_id = r.id
         WHERE a.id = $1`,
        [accountId],
    );
    return result.rows[0] ?? null;
};

const getProfileByAccountId = async (accountId) => {
    const result = await pool.query(
        `SELECT p.id, p.full_name, p.phone, p.role_id, r.name AS role, a.is_active, p.avatar_url, to_char(p.dob, 'YYYY-MM-DD') AS dob, p.gender, p.city, p.national_id, p.tax_code, p.emergency_contact_name, p.emergency_contact_phone, p.notes
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
        `SELECT p.id, a.email, p.full_name, p.phone, p.role_id, r.name AS role, a.is_active, a.must_change_password, p.avatar_url, to_char(p.dob, 'YYYY-MM-DD') AS dob, p.gender, p.city, p.national_id, p.tax_code, p.emergency_contact_name, p.emergency_contact_phone, p.notes
         FROM profiles p
         JOIN accounts a ON p.id = a.id
         JOIN roles r ON p.role_id = r.id
         WHERE p.id = $1`,
        [profileId],
    );
    return result.rows[0];
};

const getFullProfile = async (userId) => {
    const result = await pool.query(
        `SELECT
            p.id,
            a.email,
            p.full_name,
            p.phone,
            p.role_id,
            r.name AS role,
            p.avatar_url,
            to_char(p.dob, 'YYYY-MM-DD') AS dob,
            p.gender,
            p.national_id,
            p.tax_code,
            p.address,
            p.city,
            p.country,
            p.emergency_contact_name,
            p.emergency_contact_phone,
            p.notes,
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

const updateProfile = async (userId, data) => {
    const fields = Object.keys(data).filter((key) => ALLOWED_UPDATE_FIELDS.includes(key));
    if (fields.length === 0) return getFullProfile(userId);

    const setClauses = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
    const values = fields.map((field) => data[field]);

    const result = await pool.query(
        `UPDATE profiles
         SET ${setClauses}, updated_at = NOW()
         WHERE id = $1
         RETURNING id, full_name, phone, to_char(dob, 'YYYY-MM-DD') AS dob, gender, national_id, tax_code, address, city, country, emergency_contact_name, emergency_contact_phone, notes, avatar_url, updated_at`,
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
        `SELECT p.id, p.full_name, a.email, p.phone, p.role_id, r.name AS role, a.is_active, p.national_id, p.tax_code, p.address, p.city, p.country, p.emergency_contact_name, p.emergency_contact_phone, p.notes
         FROM profiles p
         JOIN accounts a ON a.id = p.id
         LEFT JOIN roles r ON r.id = a.role_id
         WHERE p.id = $1`,
        [profileId],
    );
    return result.rows[0] ?? null;
};

const getAllUsers = async () => {
    const result = await pool.query(
        `SELECT a.id, a.email, p.full_name, p.phone, to_char(p.dob, 'YYYY-MM-DD') AS dob, p.gender, p.national_id, p.tax_code, p.address, p.city, p.country, p.emergency_contact_name, p.emergency_contact_phone, p.notes, r.name AS role, a.is_active, a.last_login_at,
                to_char(d.hire_date, 'YYYY-MM-DD') AS hire_date,
                to_char(d.termination_date, 'YYYY-MM-DD') AS termination_date
         FROM accounts a
         JOIN profiles p ON a.id = p.id
         JOIN roles r ON a.role_id = r.id
         LEFT JOIN drivers d ON d.profile_id = a.id
         ORDER BY a.id ASC`,
    );
    return result.rows;
};

const getRoleIdByName = async (roleName) => {
    const result = await pool.query('SELECT id FROM roles WHERE name = $1', [roleName]);
    return result.rows[0]?.id;
};

const adminCreateUser = async (email, passwordHash, roleId, fullName, phone, dob, gender, city, address, country, nationalId, taxCode, emergencyContactName, emergencyContactPhone, notes, isDriver = false, hireDate = null) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // email có thể null (nhân viên không có email) — chỉ hạ chữ thường khi có chuỗi.
        // Chuỗi rỗng cũng quy về null: '' vẫn đụng UNIQUE nên tài khoản thứ hai để trống
        // sẽ lỗi trùng khoá, trong khi NULL thì Postgres coi mỗi cái là khác nhau.
        const normalizedEmail = typeof email === 'string' && email.trim()
            ? email.trim().toLowerCase()
            : null;

        const accountResult = await client.query(
            `INSERT INTO accounts (email, password_hash, role_id, is_active, must_change_password)
             VALUES ($1, $2, $3, true, true)
             RETURNING id`,
            [normalizedEmail, passwordHash, roleId],
        );
        const accountId = accountResult.rows[0].id;

        await client.query(
            `INSERT INTO profiles (id, full_name, phone, role_id, dob, gender, city, address, country, national_id, tax_code, emergency_contact_name, emergency_contact_phone, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, 'VN'), $10, $11, $12, $13, $14)`,
            [accountId, fullName, phone, roleId, dob, gender, city, address, country, nationalId, taxCode, emergencyContactName, emergencyContactPhone, notes],
        );

        // Vai trò driver PHẢI có dòng trong bảng drivers ngay khi tạo — nếu không,
        // các nơi tìm tài xế theo tên/ID (import Excel, gán xe...) đều JOIN drivers
        // nên sẽ không thấy tài khoản này, coi như "chưa tồn tại" dù đã có profile.
        // hire_date quyết định tháng đầu tiên được tính bao nhiêu công — không nhập thì
        // lấy ngày tạo tài khoản, sửa lại được ở màn sửa người dùng.
        if (isDriver) {
            await client.query(
                `INSERT INTO drivers (profile_id, license_number, hire_date)
                 VALUES ($1, $2, COALESCE($3::date, CURRENT_DATE))
                 ON CONFLICT (profile_id) DO NOTHING`,
                [accountId, `PENDING-${accountId}`, hireDate],
            );
        }

        await client.query('COMMIT');
        return accountId;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

// Đảm bảo tài khoản role=driver có dòng drivers — dùng khi đổi role sang driver
// ở luồng cập nhật (adminUpdateUser), hoặc vá cho tài khoản driver cũ thiếu dòng này.
const ensureDriverRow = async (profileId, hireDate = null) => {
    await pool.query(
        `INSERT INTO drivers (profile_id, license_number, hire_date)
         VALUES ($1, $2, COALESCE($3::date, CURRENT_DATE))
         ON CONFLICT (profile_id) DO NOTHING`,
        [profileId, `PENDING-${profileId}`, hireDate],
    );
};

const adminUpdateUser = async (userId, data, roleId) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const profileResult = await client.query(
            `UPDATE profiles
             SET full_name = $1, phone = $2, role_id = $3, dob = $4, gender = $5, city = $6, address = $7, country = COALESCE($8, 'VN'), national_id = $9, tax_code = $10, emergency_contact_name = $11, emergency_contact_phone = $12, notes = $13, updated_at = NOW()
             WHERE id = $14
             RETURNING id`,
            [data.full_name, data.phone, roleId, data.dob, data.gender, data.city, data.address, data.country, data.national_id, data.tax_code, data.emergency_contact_name, data.emergency_contact_phone, data.notes, userId],
        );

        if (profileResult.rowCount === 0) {
            throw new Error('Người dùng không tồn tại.');
        }

        const accountResult = await client.query(
            `UPDATE accounts
             SET role_id = $1, updated_at = NOW()
             WHERE id = $2
             RETURNING id`,
            [roleId, userId],
        );

        if (accountResult.rowCount === 0) {
            throw new Error('Người dùng không tồn tại.');
        }

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
    const result = await pool.query(
        `UPDATE accounts
         SET is_active = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING id, is_active`,
        [isActive, userId],
    );

    if (result.rowCount === 0) {
        throw new Error('Người dùng không tồn tại.');
    }

    return result.rows[0];
};

const updateAccountEmail = async (userId, email) => {
    const result = await pool.query(
        `UPDATE accounts
         SET email = $2, updated_at = NOW()
         WHERE id = $1
         RETURNING id, email`,
        [userId, email.trim().toLowerCase()],
    );

    return result.rows[0] ?? null;
};

const getPasswordHash = async (userId) => {
    const { rows } = await pool.query(
        `SELECT password_hash FROM accounts WHERE id = $1`,
        [userId],
    );
    return rows[0]?.password_hash ?? null;
};

const updatePasswordHash = async (userId, newHash) => {
    // Đổi mật khẩu thành công qua bất kỳ luồng tự phục vụ nào (đổi mk / quên mk) —
    // luôn xoá cờ bắt đổi mật khẩu vì yêu cầu đã được thoả.
    await pool.query(
        `UPDATE accounts SET password_hash = $1, must_change_password = FALSE, updated_at = NOW() WHERE id = $2`,
        [newHash, userId],
    );
};

// Manager reset mật khẩu cho nhân viên — đặt lại hash + bắt đổi mật khẩu ở lần đăng nhập kế tiếp.
const resetPassword = async (userId, newHash) => {
    const result = await pool.query(
        `UPDATE accounts
         SET password_hash = $1, must_change_password = TRUE, updated_at = NOW()
         WHERE id = $2
         RETURNING id, email`,
        [newHash, userId],
    );
    return result.rows[0] ?? null;
};

module.exports = {
    getAccountByEmail,
    getAccountByPhone,
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
    updateAccountEmail,
    getPasswordHash,
    updatePasswordHash,
    resetPassword,
    ensureDriverRow,
};
