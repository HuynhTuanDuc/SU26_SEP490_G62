const pool = require('../config/database');

const getDriverVehicle = async (profileId) => {
    const { rows: [row] } = await pool.query(`
        SELECT
            v.id,
            v.plate_number,
            v.brand,
            v.model,
            v.load_capacity_kg,
            v.manufacture_year,
            v.purchase_date,
            v.status,
            vg.id   AS vehicle_group_id,
            vg.name AS vehicle_group_name
        FROM drivers d
        JOIN   vehicles      v  ON v.id  = d.vehicle_id
        LEFT JOIN vehicle_groups vg ON vg.id = v.vehicle_group_id
        WHERE d.profile_id = $1
    `, [profileId]);
    return row ?? null;
};

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
                JOIN v_shipment_current sc ON sc.shipment_id = os.id
                WHERE sc.owner_driver_id = d.profile_id
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

const driverExists = async (driverId) => {
    const { rows } = await pool.query(
        `SELECT profile_id FROM drivers WHERE profile_id = $1`, [driverId],
    );
    return !!rows[0];
};

// Tra ĐÚNG MỘT tài xế cho luồng điều phối, kèm xe biên chế (có thể NULL).
//
// Thay cho `getAllDrivers().find(...)` mà coordinatorService dùng trước đây: hàm đó kéo
// cả bảng rồi lọc trong JS, và quan trọng hơn là KHÔNG lọc tài khoản đã khoá — tài nghỉ
// việc vẫn gán được chuyến. `is_active = TRUE` ở đây là điều kiện "tài xế sẵn sàng" ở
// mức cơ bản nhất; các điều kiện còn lại (đang chạy chuyến khác, đang phụ trách bảo trì)
// nằm trong transaction của assignOrderShipmentsToDriver vì chúng cần khoá.
//
// default_vehicle_group_id trả kèm để tầng trên biết nhóm biên chế của tài — dùng cho
// KPI/xếp hạng, KHÔNG dùng để chặn gán xe khác nhóm.
const getDriverForAssignment = async (driverId) => {
    const { rows: [row] } = await pool.query(
        `SELECT
            d.profile_id            AS id,
            p.full_name,
            d.vehicle_id            AS default_vehicle_id,
            d.default_vehicle_group_id,
            v.plate_number          AS default_plate_number
         FROM drivers d
         JOIN profiles p ON p.id = d.profile_id
         JOIN accounts a ON a.id = d.profile_id AND a.is_active = TRUE
         LEFT JOIN vehicles v ON v.id = d.vehicle_id
         WHERE d.profile_id = $1
           -- Đã qua ngày làm việc cuối cùng thì không gán chuyến mới, dù quản lý chưa kịp
           -- khoá tài khoản — chuyến đó sẽ không có ai chạy và cũng không có lương để trả
           AND (d.termination_date IS NULL OR d.termination_date >= CURRENT_DATE)`,
        [driverId],
    );
    return row ?? null;
};

module.exports = { getAllDrivers, getDriverVehicle, driverExists, getDriverForAssignment };
