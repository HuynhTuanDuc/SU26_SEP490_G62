const pool = require('../config/database');

const getAllDrivers = async () => {
    const result = await pool.query(
        `SELECT
            d.profile_id AS id,
            p.full_name,
            a.email,
            d.license_number,
            d.vehicle_id,
            v.plate_number,
            v.vehicle_group_id,
            vg.name AS vehicle_group_name,
            EXISTS (
                SELECT 1
                FROM order_shipments os
                WHERE os.owner_driver_id = d.profile_id
                  AND os.status IN ('claimed', 'picking', 'transit', 'arrived', 'returning')
            ) AS has_active_trip
         FROM drivers d
         JOIN profiles p ON p.id = d.profile_id
         JOIN accounts a ON a.id = d.profile_id
         LEFT JOIN vehicles v ON v.id = d.vehicle_id
         LEFT JOIN vehicle_groups vg ON vg.id = v.vehicle_group_id
         ORDER BY p.full_name ASC`,
    );
    return result.rows;
};

module.exports = { getAllDrivers };
