const pool = require('../../config/database');

const CACHE_TTL_MS = 30_000;
let _cache       = null;
let _cacheExpiry = 0;

const getVehicleDriverLookup = async (bustCache = false) => {
    const now = Date.now();
    if (!bustCache && _cache && now < _cacheExpiry) return _cache;

    const [vehiclesRes, driversRes, customersRes, groupsRes] = await Promise.all([
        pool.query(
            `SELECT
                v.id, v.plate_number, v.status,
                v.vehicle_group_id, v.assigned_driver_id,
                vg.name AS vehicle_group_name,
                p.full_name AS assigned_driver_name
             FROM vehicles v
             LEFT JOIN vehicle_groups vg ON vg.id = v.vehicle_group_id
             LEFT JOIN profiles p ON p.id = v.assigned_driver_id
             ORDER BY v.plate_number ASC`
        ),
        pool.query(
            `SELECT
                d.profile_id AS id, p.full_name,
                d.vehicle_id, v.vehicle_group_id,
                v.plate_number, v.status AS vehicle_status,
                vg.name AS vehicle_group_name
             FROM drivers d
             JOIN profiles p ON p.id = d.profile_id
             LEFT JOIN vehicles v ON v.id = d.vehicle_id
             LEFT JOIN vehicle_groups vg ON vg.id = v.vehicle_group_id
             ORDER BY p.full_name ASC`
        ),
        pool.query(
            `SELECT id, full_name, phone, company_name, customer_type
             FROM customers
             ORDER BY full_name ASC
             LIMIT 300`
        ),
        pool.query(
            `SELECT id, name, description, max_load_weight_kg, price_per_km, status
             FROM vehicle_groups
             WHERE status = 'active'
             ORDER BY name ASC`
        ),
    ]);

    _cache = {
        vehicles:       vehiclesRes.rows,
        drivers:        driversRes.rows,
        customers:      customersRes.rows,
        vehicle_groups: groupsRes.rows,
    };
    _cacheExpiry = now + CACHE_TTL_MS;
    return _cache;
};

const invalidateLookupCache = () => { _cache = null; };

module.exports = { getVehicleDriverLookup, invalidateLookupCache };
