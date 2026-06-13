const pool = require('../config/database');
const {
    SHIPMENT_STATUS,
    ASSIGNMENT_TYPE,
    ACTIVE_STATUSES,
    STATUS_TIMESTAMP_COL,
} = require('../constants/tripConstants');

// Địa chỉ pickup/delivery lưu trong trip_stops — dùng subquery để kéo ra
const PICKUP_SUBQ  = `(SELECT ts.address FROM trip_stops ts WHERE ts.shipment_id = os.id AND ts.stop_type = 'pickup'   ORDER BY ts.stop_index ASC  LIMIT 1)`;
const DELIVERY_SUBQ = `(SELECT ts.address FROM trip_stops ts WHERE ts.shipment_id = os.id AND ts.stop_type = 'delivery' ORDER BY ts.stop_index DESC LIMIT 1)`;

const getDriverVehicleGroupId = async (driverId) => {
    const result = await pool.query(
        `SELECT v.vehicle_group_id
         FROM drivers d
         JOIN vehicles v ON d.vehicle_id = v.id
         WHERE d.profile_id = $1`,
        [driverId],
    );
    return result.rows[0]?.vehicle_group_id ?? null;
};

const getAvailableShipments = async ({ page = 1, limit = 5, vehicleGroupId = null } = {}) => {
    const offset = (page - 1) * limit;

    // vehicle_group_id đã bị xoá khỏi order_shipments — lookup qua orders
    const rowsWhere  = vehicleGroupId
        ? `WHERE os.status = 'available' AND os.owner_driver_id IS NULL AND vg.id = $3`
        : `WHERE os.status = 'available' AND os.owner_driver_id IS NULL`;
    const countWhere = vehicleGroupId
        ? `WHERE os.status = 'available' AND os.owner_driver_id IS NULL AND vg.id = $1`
        : `WHERE os.status = 'available' AND os.owner_driver_id IS NULL`;

    const rowsParams  = vehicleGroupId ? [limit, offset, vehicleGroupId] : [limit, offset];
    const countParams = vehicleGroupId ? [vehicleGroupId] : [];

    const [rowsResult, countResult] = await Promise.all([
        pool.query(
            `SELECT
                os.id               AS shipment_id,
                os.order_id,
                os.shipment_index,
                ${PICKUP_SUBQ}      AS pickup_address,
                ${DELIVERY_SUBQ}    AS delivery_address,
                os.cargo_weight_kg::text,
                os.estimated_price::text,
                os.notes,
                os.created_at,
                o.cargo_name,
                o.notes             AS order_notes,
                o.payment_type,
                (SELECT COUNT(*)::int
                 FROM order_shipments os2
                 WHERE os2.order_id = os.order_id) AS total_order_legs,
                vg.id               AS vehicle_group_id,
                vg.name             AS vehicle_group_name,
                vg.max_load_weight_kg
             FROM order_shipments os
             JOIN orders o          ON o.id = os.order_id
             JOIN vehicle_groups vg ON vg.id = o.vehicle_group_id
             ${rowsWhere}
             ORDER BY os.created_at ASC
             LIMIT $1 OFFSET $2`,
            rowsParams,
        ),
        pool.query(
            `SELECT COUNT(*)::int AS total
             FROM order_shipments os
             JOIN orders o ON o.id = os.order_id
             JOIN vehicle_groups vg ON vg.id = o.vehicle_group_id
             ${countWhere}`,
            countParams,
        ),
    ]);

    const total      = Number(countResult.rows[0]?.total ?? 0);
    const totalPages = Math.ceil(total / limit);
    return { trips: rowsResult.rows, total, page, limit, totalPages };
};

const getActiveTrip = async (driverId) => {
    const result = await pool.query(
        `SELECT
            os.id,
            os.order_id,
            os.shipment_index,
            ${PICKUP_SUBQ}   AS pickup_address,
            ${DELIVERY_SUBQ} AS delivery_address,
            os.cargo_weight_kg,
            os.estimated_price,
            os.actual_price,
            os.status,
            os.notes,
            os.version,
            os.claimed_at,
            os.picking_at,
            os.transit_at,
            os.arrived_at,
            os.completed_at,
            o.cargo_name,
            o.notes AS order_notes,
            o.payment_type AS order_payment_type,
            (
                SELECT MAX(s2.shipment_index)
                FROM order_shipments s2
                WHERE s2.order_id = os.order_id
            ) AS max_shipment_index
         FROM order_shipments os
         JOIN orders o ON os.order_id = o.id
         WHERE os.owner_driver_id = $1
           AND os.status = ANY($2::text[])
         LIMIT 1`,
        [driverId, ACTIVE_STATUSES],
    );
    if (!result.rows[0]) return null;
    const row = result.rows[0];

    // Attach stops array (BR-011 — driver sees ordered stops for active trip)
    const stopsResult = await pool.query(
        `SELECT id, stop_index, stop_type, address, contact_name, contact_phone, arrived_at, completed_at, proof_url
         FROM trip_stops
         WHERE shipment_id = $1
         ORDER BY stop_index ASC`,
        [row.id],
    );

    return {
        ...row,
        is_final_shipment: Number(row.shipment_index) === Number(row.max_shipment_index),
        stops: stopsResult.rows,
    };
};

const getTripById = async (tripId) => {
    const result = await pool.query(
        `SELECT os.*, o.cargo_name, o.notes AS order_notes
         FROM order_shipments os
         JOIN orders o ON os.order_id = o.id
         WHERE os.id = $1`,
        [tripId],
    );
    return result.rows[0] ?? null;
};

const claimShipment = async (shipmentId, driverId, vehicleId) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const vehicleCheck = await client.query(
            `SELECT
                v.id,
                v.plate_number,
                v.status,
                v.assigned_driver_id,
                d.vehicle_id AS driver_vehicle_id
             FROM vehicles v
             JOIN drivers d ON d.profile_id = $2
             WHERE v.id = $1
             LIMIT 1`,
            [vehicleId, driverId],
        );
        const vehicle = vehicleCheck.rows[0];
        if (!vehicle || Number(vehicle.assigned_driver_id) !== Number(driverId) || Number(vehicle.driver_vehicle_id) !== Number(vehicleId)) {
            await client.query('ROLLBACK');
            throw new Error('DRIVER_VEHICLE_MISMATCH');
        }
        if (vehicle.status !== 'active') {
            await client.query('ROLLBACK');
            throw new Error('VEHICLE_UNAVAILABLE');
        }

        const vehicleMaintenanceCheck = await client.query(
            `SELECT id
             FROM maintenance_records
             WHERE vehicle_id = $1
               AND status IN ('open', 'pending_verification')
             LIMIT 1`,
            [vehicleId],
        );
        if (vehicleMaintenanceCheck.rows[0]) {
            await client.query('ROLLBACK');
            throw new Error('VEHICLE_MAINTENANCE');
        }

        const driverMaintenanceCheck = await client.query(
            `SELECT id
             FROM maintenance_records
             WHERE performed_by = $1
               AND vehicle_id <> $2
               AND status IN ('open', 'pending_verification')
             LIMIT 1`,
            [driverId, vehicleId],
        );
        if (driverMaintenanceCheck.rows[0]) {
            await client.query('ROLLBACK');
            throw new Error('DRIVER_MAINTENANCE');
        }

        const activeVehicleCheck = await client.query(
            `SELECT id FROM order_shipments
             WHERE vehicle_id = $1
               AND status = ANY($2::text[])
             LIMIT 1`,
            [vehicleId, ACTIVE_STATUSES],
        );
        if (activeVehicleCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            throw new Error('ACTIVE_VEHICLE_TRIP');
        }

        const activeCheck = await client.query(
            `SELECT id FROM order_shipments
             WHERE owner_driver_id = $1
               AND status = ANY($2::text[])
             LIMIT 1`,
            [driverId, ACTIVE_STATUSES],
        );
        if (activeCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            throw new Error('ACTIVE_TRIP');
        }

        const locked = await client.query(
            `SELECT id, order_id, status, owner_driver_id
             FROM order_shipments
             WHERE id = $1
             FOR UPDATE`,
            [shipmentId],
        );
        if (!locked.rows[0]) {
            await client.query('ROLLBACK');
            return null;
        }
        const { order_id, status, owner_driver_id } = locked.rows[0];

        if (status !== 'available' || owner_driver_id !== null) {
            await client.query('ROLLBACK');
            return null;
        }

        // Chặn nếu driver đang có active trip trong CÙNG order (không chặn nếu đã hoàn thành)
        const sameOrderCheck = await client.query(
            `SELECT id FROM order_shipments
             WHERE order_id = $1
               AND owner_driver_id = $2
               AND status = ANY($3::text[])
             LIMIT 1`,
            [order_id, driverId, ACTIVE_STATUSES],
        );
        if (sameOrderCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            throw new Error('SAME_ORDER');
        }

        const result = await client.query(
            `UPDATE order_shipments
             SET owner_driver_id = $1,
                 vehicle_id      = $2,
                 status          = $3,
                 claimed_at      = NOW(),
                 version         = version + 1,
                 updated_at      = NOW()
             WHERE id = $4
             RETURNING *`,
            [driverId, vehicleId, SHIPMENT_STATUS.CLAIMED, shipmentId],
        );
        const claimed = result.rows[0];

        await client.query(
            `INSERT INTO shipment_assignments
                 (shipment_id, driver_id, vehicle_id, assignment_type, assigned_at)
             VALUES ($1, $2, $3, $4, NOW())`,
            [claimed.id, driverId, vehicleId, ASSIGNMENT_TYPE.SELF_CLAIM],
        );

        await client.query('COMMIT');
        return claimed;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

const activateNextShipment = async (completedShipmentId, driverId, vehicleId) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const cur = await client.query(
            `SELECT order_id, shipment_index FROM order_shipments WHERE id = $1`,
            [completedShipmentId],
        );
        if (!cur.rows[0]) { await client.query('ROLLBACK'); return null; }

        const { order_id, shipment_index } = cur.rows[0];

        // Chỉ auto-activate nếu coordinator đã pre-assign chuyến tiếp cho driver này
        // (owner_driver_id = driverId AND status = 'available')
        // Pool trips (owner_driver_id = NULL) không auto-activate — driver tự claim từ pool
        const nextResult = await client.query(
            `UPDATE order_shipments
             SET status     = $1,
                 claimed_at = NOW(),
                 version    = version + 1,
                 updated_at = NOW()
             WHERE order_id        = $2
               AND owner_driver_id = $3
               AND status          = 'available'
               AND shipment_index  = (
                   SELECT MIN(shipment_index)
                   FROM order_shipments
                   WHERE order_id = $2
                     AND shipment_index > $4
                     AND owner_driver_id = $3
               )
             RETURNING *`,
            [SHIPMENT_STATUS.CLAIMED, order_id, driverId, shipment_index],
        );

        if (nextResult.rows[0]) {
            const next = nextResult.rows[0];
            await client.query(
                `INSERT INTO shipment_assignments
                     (shipment_id, driver_id, vehicle_id, assignment_type, assigned_at)
                 VALUES ($1, $2, $3, $4, NOW())`,
                [next.id, driverId, vehicleId, ASSIGNMENT_TYPE.SELF_CLAIM],
            );
            await client.query('COMMIT');
            return next;
        }

        // Leg cuối hoàn thành → cập nhật derived_status của order
        await client.query(
            `UPDATE orders SET derived_status = 'completed', updated_at = NOW() WHERE id = $1`,
            [order_id],
        );
        await client.query('COMMIT');
        return null;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

const updateTripStatus = async (tripId, newStatus, cancelReason = null) => {
    const tsCol = STATUS_TIMESTAMP_COL[newStatus];
    let query, params;
    if (cancelReason && tsCol) {
        query  = `UPDATE order_shipments SET status=$2, cancel_reason=$3, ${tsCol}=NOW(), updated_at=NOW() WHERE id=$1 RETURNING *`;
        params = [tripId, newStatus, cancelReason];
    } else if (cancelReason) {
        query  = `UPDATE order_shipments SET status=$2, cancel_reason=$3, updated_at=NOW() WHERE id=$1 RETURNING *`;
        params = [tripId, newStatus, cancelReason];
    } else if (tsCol) {
        query  = `UPDATE order_shipments SET status=$2, ${tsCol}=NOW(), updated_at=NOW() WHERE id=$1 RETURNING *`;
        params = [tripId, newStatus];
    } else {
        query  = `UPDATE order_shipments SET status=$2, updated_at=NOW() WHERE id=$1 RETURNING *`;
        params = [tripId, newStatus];
    }
    const result = await pool.query(query, params);
    const row = result.rows[0];

    // Auto-update trip_stops timestamps based on lifecycle transition
    // (driver may not manage stops explicitly in simple A→B trips)
    if (newStatus === 'picking') {
        // Driver đang đến điểm lấy → mark first pickup stop as arrived
        await pool.query(
            `UPDATE trip_stops SET arrived_at = NOW()
             WHERE shipment_id = $1 AND stop_type = 'pickup' AND arrived_at IS NULL
               AND stop_index = (SELECT MIN(stop_index) FROM trip_stops WHERE shipment_id = $1 AND stop_type = 'pickup')`,
            [tripId],
        );
    } else if (newStatus === 'transit') {
        // Driver bắt đầu vận chuyển → mark tất cả pickup stops là completed
        await pool.query(
            `UPDATE trip_stops SET arrived_at = COALESCE(arrived_at, NOW()), completed_at = NOW()
             WHERE shipment_id = $1 AND stop_type = 'pickup' AND completed_at IS NULL`,
            [tripId],
        );
    } else if (newStatus === 'arrived') {
        // Driver đến điểm giao → mark first unvisited delivery stop as arrived
        await pool.query(
            `UPDATE trip_stops SET arrived_at = NOW()
             WHERE shipment_id = $1 AND stop_type = 'delivery' AND arrived_at IS NULL
               AND stop_index = (SELECT MIN(stop_index) FROM trip_stops WHERE shipment_id = $1 AND stop_type = 'delivery' AND arrived_at IS NULL)`,
            [tripId],
        );
    } else if (newStatus === 'completed') {
        // Trip hoàn thành → mark tất cả delivery stops là completed
        await pool.query(
            `UPDATE trip_stops SET arrived_at = COALESCE(arrived_at, NOW()), completed_at = NOW()
             WHERE shipment_id = $1 AND stop_type = 'delivery' AND completed_at IS NULL`,
            [tripId],
        );
    }

    return row;
};

const releaseShipmentToPool = async (tripId, driverId, reason) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const cur = await client.query(
            `SELECT order_id, status, vehicle_id FROM order_shipments WHERE id = $1 FOR UPDATE`,
            [tripId],
        );
        if (!cur.rows[0]) throw new Error('Chuyến không tồn tại');

        // Trả trip về pool: xóa sạch thông tin driver/thời điểm claim trước đó
        await client.query(
            `UPDATE order_shipments
             SET status          = 'available',
                 owner_driver_id = NULL,
                 vehicle_id      = NULL,
                 claimed_at      = NULL,
                 notes           = CASE WHEN $1::text IS NOT NULL
                                       THEN COALESCE(notes || E'\n', '') || '[Released] ' || $1::text
                                       ELSE notes
                                   END,
                 updated_at      = NOW()
             WHERE id = $2`,
            [reason ?? null, tripId],
        );

        // Đóng shipment_assignments record của lần claim này
        await client.query(
            `UPDATE shipment_assignments
             SET completed_at = NOW()
             WHERE shipment_id = $1 AND driver_id = $2 AND completed_at IS NULL`,
            [tripId, driverId],
        );

        // Ghi audit vào shipment_assignment_history
        await client.query(
            `INSERT INTO shipment_assignment_history
                 (shipment_id, from_driver_id, from_vehicle_id,
                  to_driver_id, to_vehicle_id,
                  changed_by, change_reason, notes, changed_at)
             SELECT $1,
                    sa.driver_id, sa.vehicle_id,
                    sa.driver_id, sa.vehicle_id,
                    $2, 'driver_request',
                    $3,
                    NOW()
             FROM shipment_assignments sa
             WHERE sa.shipment_id = $1 AND sa.driver_id = $2
             ORDER BY sa.assigned_at DESC
             LIMIT 1`,
            [tripId, driverId, reason ? `Driver tự hủy: ${reason}` : 'Driver tự hủy chuyến'],
        );

        await client.query('COMMIT');
        return { order_id: cur.rows[0].order_id, released: true };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

const isFinalShipment = async (tripId) => {
    const result = await pool.query(
        `SELECT os.shipment_index,
                (SELECT MAX(s2.shipment_index)
                 FROM order_shipments s2
                 WHERE s2.order_id = os.order_id) AS max_index
         FROM order_shipments os
         WHERE os.id = $1`,
        [tripId],
    );
    if (!result.rows[0]) return false;
    const { shipment_index, max_index } = result.rows[0];
    return Number(shipment_index) === Number(max_index);
};

const saveDeliveryProof = async (shipmentId, driverId, fileUrl) => {
    const result = await pool.query(
        `INSERT INTO delivery_proofs (shipment_id, captured_by, file_url, is_realtime, captured_at)
         VALUES ($1, $2, $3, TRUE, NOW())
         RETURNING *`,
        [shipmentId, driverId, fileUrl],
    );
    return result.rows[0];
};

const saveLoadingProof = async (shipmentId, driverId, fileUrl) => {
    const result = await pool.query(
        `INSERT INTO delivery_proofs (shipment_id, captured_by, file_url, is_realtime, captured_at)
         VALUES ($1, $2, $3, TRUE, NOW())
         RETURNING *`,
        [shipmentId, driverId, fileUrl],
    );
    return result.rows[0];
};

const getDriverStats = async (driverId) => {
    const result = await pool.query(
        `SELECT
            COUNT(*) FILTER (
                WHERE claimed_at >= CURRENT_DATE
            )::int                                          AS today_total,
            COUNT(*) FILTER (
                WHERE status = $2
                  AND completed_at >= CURRENT_DATE
            )::int                                          AS today_completed,
            COUNT(*) FILTER (
                WHERE status = $2
                  AND DATE_TRUNC('month', completed_at) = DATE_TRUNC('month', NOW())
            )::int                                          AS month_completed
         FROM order_shipments
         WHERE owner_driver_id = $1`,
        [driverId, SHIPMENT_STATUS.COMPLETED],
    );
    return result.rows[0];
};

const getDriverVehicleId = async (driverId) => {
    const result = await pool.query(
        'SELECT vehicle_id FROM drivers WHERE profile_id = $1',
        [driverId],
    );
    return result.rows[0]?.vehicle_id ?? null;
};

const getDriverOrderHistory = async (driverId, { limit = 30, offset = 0 } = {}) => {
    const result = await pool.query(
        `SELECT
            o.id            AS order_id,
            o.cargo_name,
            o.notes         AS order_notes,
            o.payment_type,
            o.derived_status AS order_status,
            o.created_at,
            (SELECT ts.address
             FROM trip_stops ts
             JOIN order_shipments os1 ON os1.id = ts.shipment_id
             WHERE os1.order_id = o.id AND ts.stop_type = 'pickup'
             ORDER BY os1.shipment_index ASC, ts.stop_index ASC LIMIT 1)  AS pickup_address,
            (SELECT ts.address
             FROM trip_stops ts
             JOIN order_shipments os2 ON os2.id = ts.shipment_id
             WHERE os2.order_id = o.id AND ts.stop_type = 'delivery'
             ORDER BY os2.shipment_index DESC, ts.stop_index DESC LIMIT 1) AS delivery_address,
            COUNT(os.id)::int                                               AS total_legs,
            (COUNT(os.id) FILTER (WHERE os.status = 'completed'))::int      AS completed_legs,
            SUM(os.estimated_price)                                         AS total_estimated_price,
            MIN(os.claimed_at)                                              AS first_claimed_at,
            (MAX(os.completed_at) FILTER (WHERE os.status = 'completed'))   AS last_completed_at,
            COUNT(*) OVER()::int                                            AS total_count
         FROM orders o
         JOIN order_shipments os ON os.order_id = o.id AND os.owner_driver_id = $1
         GROUP BY o.id, o.cargo_name, o.notes, o.payment_type, o.derived_status, o.created_at
         ORDER BY MIN(os.claimed_at) DESC NULLS LAST, o.created_at DESC
         LIMIT $2 OFFSET $3`,
        [driverId, limit, offset],
    );
    const total = Number(result.rows[0]?.total_count ?? 0);
    const rows  = result.rows.map(({ total_count, ...rest }) => rest);
    return { rows, total };
};

const getAvailableShipmentDetail = async (shipmentId) => {
    const result = await pool.query(
        `SELECT
            os.id               AS shipment_id,
            os.order_id,
            os.shipment_index,
            ${PICKUP_SUBQ}      AS pickup_address,
            ${DELIVERY_SUBQ}    AS delivery_address,
            os.cargo_weight_kg::text,
            os.estimated_price::text,
            os.notes,
            os.created_at,
            o.cargo_name,
            o.notes             AS order_notes,
            o.payment_type,
            vg.name             AS vehicle_group_name,
            (SELECT COUNT(*)::int
             FROM order_shipments os2
             WHERE os2.order_id = os.order_id) AS total_order_legs
         FROM order_shipments os
         JOIN orders o          ON o.id = os.order_id
         JOIN vehicle_groups vg ON vg.id = o.vehicle_group_id
         WHERE os.id = $1
           AND os.status = 'available'
           AND os.owner_driver_id IS NULL`,
        [shipmentId],
    );
    return result.rows[0] ?? null;
};

const getAvailableOrderDetail = async (orderId) => {
    const orderRes = await pool.query(
        `SELECT
            o.id,
            o.cargo_name,
            o.notes,
            o.payment_type,
            o.derived_status    AS status,
            o.created_at,
            (SELECT SUM(os.estimated_price) FROM order_shipments os WHERE os.order_id = o.id)::text AS total_estimated_price,
            (SELECT SUM(os.cargo_weight_kg)  FROM order_shipments os WHERE os.order_id = o.id)::text AS total_cargo_weight_kg,
            (SELECT COUNT(*)::int            FROM order_shipments os WHERE os.order_id = o.id)        AS total_legs
         FROM orders o
         WHERE o.id = $1 AND o.derived_status = 'open'`,
        [orderId],
    );
    if (!orderRes.rows[0]) return null;

    const shipmentsRes = await pool.query(
        `SELECT
            os.id,
            os.shipment_index,
            ${PICKUP_SUBQ}      AS pickup_address,
            ${DELIVERY_SUBQ}    AS delivery_address,
            os.cargo_weight_kg::text,
            os.estimated_price::text,
            os.notes,
            vg.name AS vehicle_group_name
         FROM order_shipments os
         JOIN orders o2         ON o2.id = os.order_id
         JOIN vehicle_groups vg ON vg.id = o2.vehicle_group_id
         WHERE os.order_id = $1
           AND os.status = 'available'
           AND os.owner_driver_id IS NULL
         ORDER BY os.shipment_index ASC`,
        [orderId],
    );

    return {
        order:     orderRes.rows[0],
        shipments: shipmentsRes.rows,
    };
};

const getOrderWithShipments = async (orderId, driverId) => {
    const orderRes = await pool.query(
        `SELECT id, cargo_name, notes, payment_type, derived_status AS status, created_at
         FROM orders WHERE id = $1`,
        [orderId],
    );
    if (!orderRes.rows[0]) return null;

    const shipmentsRes = await pool.query(
        `SELECT
            os.id,
            os.order_id,
            os.shipment_index,
            ${PICKUP_SUBQ}   AS pickup_address,
            ${DELIVERY_SUBQ} AS delivery_address,
            os.cargo_weight_kg,
            os.estimated_price,
            os.actual_price,
            os.status,
            os.notes,
            os.cancel_reason,
            os.claimed_at,
            os.picking_at,
            os.transit_at,
            os.arrived_at,
            os.completed_at,
            os.cancelled_at,
            (SELECT COALESCE(json_agg(dp.file_url ORDER BY dp.captured_at), '[]'::json)
             FROM delivery_proofs dp
             WHERE dp.shipment_id = os.id) AS receipt_urls,
            (SELECT dp.file_url
             FROM delivery_proofs dp
             WHERE dp.shipment_id = os.id
             ORDER BY dp.captured_at DESC LIMIT 1) AS proof_url
         FROM order_shipments os
         WHERE os.order_id = $1 AND os.owner_driver_id = $2
         ORDER BY os.shipment_index ASC`,
        [orderId, driverId],
    );
    if (!shipmentsRes.rows.length) return null;

    return {
        order:     orderRes.rows[0],
        shipments: shipmentsRes.rows,
    };
};

const getAllVehicleGroups = async () => {
    const result = await pool.query(
        `SELECT id, name FROM vehicle_groups ORDER BY id ASC`,
    );
    return result.rows;
};

module.exports = {
    getDriverVehicleGroupId,
    getDriverVehicleId,
    getAvailableShipments,
    getAllVehicleGroups,
    getActiveTrip,
    getTripById,
    claimShipment,
    updateTripStatus,
    releaseShipmentToPool,
    isFinalShipment,
    saveDeliveryProof,
    saveLoadingProof,
    activateNextShipment,
    getDriverStats,
    getDriverOrderHistory,
    getAvailableShipmentDetail,
    getAvailableOrderDetail,
    getOrderWithShipments,
};
