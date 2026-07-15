const pool = require('../config/database');

// Get all roles
const getAllRoles = async () => {
    const result = await pool.query('SELECT * FROM roles ORDER BY id');
    return result.rows;
};

// Get role by ID
const getRoleById = async (roleId) => {
    const result = await pool.query('SELECT * FROM roles WHERE id = $1', [roleId]);
    return result.rows[0];
};

// Get role by name
const getRoleByName = async (roleName) => {
    const result = await pool.query('SELECT * FROM roles WHERE name = $1', [roleName]);
    return result.rows[0];
};

// Lấy toàn bộ profile id của 1 role (vd. dùng để gửi notification hàng loạt)
const getUserIdsByRole = async (roleName) => {
    const { rows } = await pool.query(
        `SELECT p.id FROM profiles p JOIN roles r ON r.id = p.role_id WHERE r.name = $1`,
        [roleName],
    );
    return rows.map((r) => r.id);
};

module.exports = {
    getAllRoles,
    getRoleById,
    getRoleByName,
    getUserIdsByRole,
};
