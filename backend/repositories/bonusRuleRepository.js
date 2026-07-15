const pool = require('../config/database');

const BONUS_RULE_TYPES = ['kpi', 'top_revenue', 'top_trips', 'zero_incident', 'overtime', 'holiday', 'custom'];

const listRules = async ({ vehicleGroupId = null, bonusType = null, isActive = null } = {}) => {
    const conditions = [];
    const params = [];
    if (vehicleGroupId) { params.push(vehicleGroupId); conditions.push(`br.vehicle_group_id = $${params.length}`); }
    if (bonusType)      { params.push(bonusType);      conditions.push(`br.bonus_type = $${params.length}`); }
    if (isActive !== null) { params.push(isActive);    conditions.push(`br.is_active = $${params.length}`); }
    const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
        `SELECT br.*, vg.name AS vehicle_group_name
         FROM bonus_rules br
         LEFT JOIN vehicle_groups vg ON vg.id = br.vehicle_group_id
         ${whereSql}
         ORDER BY br.is_active DESC, br.id DESC`,
        params,
    );
    return result.rows;
};

const getRuleById = async (id) => {
    const result = await pool.query(`SELECT * FROM bonus_rules WHERE id = $1`, [id]);
    return result.rows[0] ?? null;
};

const createRule = async ({ vehicleGroupId, title, bonusType, rewardAmount, rewardMultiplier, conditionsJson, isActive }) => {
    const result = await pool.query(
        `INSERT INTO bonus_rules
            (vehicle_group_id, title, bonus_type, reward_amount, reward_multiplier, conditions_json, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [vehicleGroupId ?? null, title, bonusType, rewardAmount ?? null, rewardMultiplier ?? null, conditionsJson ?? null, isActive ?? true],
    );
    return result.rows[0];
};

const updateRule = async (id, { vehicleGroupId, title, bonusType, rewardAmount, rewardMultiplier, conditionsJson, isActive }) => {
    const result = await pool.query(
        `UPDATE bonus_rules
         SET vehicle_group_id  = $2,
             title             = COALESCE($3, title),
             bonus_type        = COALESCE($4, bonus_type),
             reward_amount     = $5,
             reward_multiplier = $6,
             conditions_json   = $7,
             is_active         = COALESCE($8, is_active)
         WHERE id = $1
         RETURNING *`,
        [id, vehicleGroupId ?? null, title ?? null, bonusType ?? null, rewardAmount ?? null, rewardMultiplier ?? null, conditionsJson ?? null, isActive ?? null],
    );
    return result.rows[0] ?? null;
};

const deleteRule = async (id) => {
    const result = await pool.query(`DELETE FROM bonus_rules WHERE id = $1 RETURNING id`, [id]);
    return result.rows[0] ?? null;
};

module.exports = { BONUS_RULE_TYPES, listRules, getRuleById, createRule, updateRule, deleteRule };
