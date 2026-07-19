const pool = require('../config/database');

const VEHICLE_GROUP_DETAIL_SELECT = `
    SELECT
        vg.id,
        vg.name,
        vg.description,
        vg.max_load_weight_kg,
        vg.price_per_km,
        vg.status,
        vg.upgrade_allowed,
        vg.created_at,
        COUNT(v.id)::int AS vehicle_count,
        COUNT(*) FILTER (WHERE v.status = 'active')::int AS active_vehicle_count,
        COUNT(*) FILTER (WHERE v.status = 'maintenance')::int AS maintenance_vehicle_count,
        COUNT(*) FILTER (WHERE v.status = 'broken')::int AS broken_vehicle_count,
        COUNT(*) FILTER (WHERE v.status = 'retired')::int AS retired_vehicle_count
    FROM vehicle_groups vg
    LEFT JOIN vehicles v ON v.vehicle_group_id = vg.id
`;

const ACTIVE_SHIPMENT_STATUS_CONDITION = `
    os.status IN ('claimed', 'picking', 'transit', 'arrived', 'returning')
`;

const VEHICLE_DETAIL_SELECT = `
    SELECT
        v.id,
        v.plate_number,
        v.vehicle_group_id,
        vg.name AS vehicle_group_name,
        vg.status AS vehicle_group_status,
        vg.price_per_km,
        vg.upgrade_allowed,
        v.brand,
        v.model,
        v.load_capacity_kg,
        v.manufacture_year,
        v.purchase_date,
        v.assigned_driver_id,
        p.full_name AS assigned_driver_name,
        a.email AS assigned_driver_email,
        d.license_number AS assigned_driver_license_number,
        v.status,
        v.created_at,
        v.updated_at,
        lm.id AS active_maintenance_id,
        lm.maintenance_type AS active_maintenance_type,
        lm.description AS active_maintenance_description,
        lm.maintenance_date AS active_maintenance_date,
        lm.bill_pics AS active_maintenance_bill_pics,
        lm.completed_at AS active_maintenance_completed_at,
        lm.performed_by AS active_maintenance_performed_by,
        mp.full_name AS active_maintenance_performed_by_name,
        lm.status AS active_maintenance_status,
        li.id AS active_failure_id,
        li.incident_type AS active_failure_type,
        li.description AS active_failure_description,
        li.severity_level AS active_failure_severity
    FROM vehicles v
    JOIN vehicle_groups vg ON vg.id = v.vehicle_group_id
    LEFT JOIN profiles p ON p.id = v.assigned_driver_id
    LEFT JOIN accounts a ON a.id = v.assigned_driver_id
    LEFT JOIN drivers d ON d.profile_id = v.assigned_driver_id
    LEFT JOIN LATERAL (
        SELECT
            mr.id,
            mr.maintenance_type,
            mr.description,
            mr.maintenance_date,
            mr.bill_pics,
            mr.completed_at,
            mr.status,
            mr.performed_by
        FROM maintenance_records mr
        WHERE mr.vehicle_id = v.id
          AND mr.status IN ('open', 'pending_verification')
        ORDER BY mr.started_at DESC, mr.id DESC
        LIMIT 1
    ) lm ON TRUE
    LEFT JOIN profiles mp ON mp.id = lm.performed_by
    LEFT JOIN LATERAL (
        SELECT
            i.id,
            i.incident_type,
            i.description,
            i.severity_level
        FROM incidents i
        WHERE i.vehicle_id = v.id
          AND i.incident_type = 'vehicle_breakdown'
          AND i.shipment_id IS NULL
          AND i.status IN ('open', 'investigating')
        ORDER BY i.occurred_at DESC, i.id DESC
        LIMIT 1
    ) li ON TRUE
`;

const listVehicleGroups = async () => {
    const result = await pool.query(
        `${VEHICLE_GROUP_DETAIL_SELECT}
         WHERE vg.status = 'active'
         GROUP BY vg.id
         ORDER BY vg.name ASC, vg.id ASC`,
    );
    return result.rows;
};

const getVehicleGroupById = async (vehicleGroupId) => {
    const result = await pool.query(
        `${VEHICLE_GROUP_DETAIL_SELECT}
         WHERE vg.id = $1
         GROUP BY vg.id`,
        [vehicleGroupId],
    );
    return result.rows[0] ?? null;
};

const getVehicleGroupByName = async (name, excludeId = null) => {
    const params = [name.trim().toLowerCase()];
    let whereClause = 'WHERE LOWER(name) = $1';

    if (excludeId !== null) {
        params.push(excludeId);
        whereClause += ` AND id <> $${params.length}`;
    }

    const result = await pool.query(
        `SELECT id, name
         FROM vehicle_groups
         ${whereClause}
         LIMIT 1`,
        params,
    );
    return result.rows[0] ?? null;
};

const createVehicleGroup = async ({
    name,
    description,
    max_load_weight_kg,
    price_per_km,
    upgrade_allowed,
}) => {
    const result = await pool.query(
        `INSERT INTO vehicle_groups (
            name,
            description,
            max_load_weight_kg,
            price_per_km,
            upgrade_allowed
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id`,
        [
            name,
            description,
            max_load_weight_kg,
            price_per_km,
            upgrade_allowed,
        ],
    );
    return result.rows[0]?.id ?? null;
};

const updateVehicleGroup = async (
    vehicleGroupId,
    {
        name,
        description,
        max_load_weight_kg,
        price_per_km,
        upgrade_allowed,
    },
) => {
    const result = await pool.query(
        `UPDATE vehicle_groups
         SET
            name = $2,
            description = $3,
            max_load_weight_kg = $4,
            price_per_km = $5,
            upgrade_allowed = $6
         WHERE id = $1
         RETURNING id`,
        [
            vehicleGroupId,
            name,
            description,
            max_load_weight_kg,
            price_per_km,
            upgrade_allowed,
        ],
    );
    return result.rows[0] ?? null;
};

const deleteVehicleGroup = async (vehicleGroupId) => {
    const result = await pool.query(
        `UPDATE vehicle_groups
         SET status = 'hidden'
         WHERE id = $1
         RETURNING id`,
        [vehicleGroupId],
    );
    return result.rows[0] ?? null;
};

// sort resolved via allowlist, never interpolated directly from user input
const VEHICLE_SORTS = {
    plate:  'v.plate_number ASC',
    status: 'v.status ASC, v.plate_number ASC',
};

const listVehicles = async ({
    page = 1,
    limit = 10,
    search = null,
    status = null,
    vehicleGroupId = null,
    sort = null,
} = {}) => {
    const offset = (page - 1) * limit;
    const conditions = [];
    const params = [];

    if (search) {
        params.push(`%${search.trim().toLowerCase()}%`);
        conditions.push(`LOWER(v.plate_number) LIKE $${params.length}`);
    }

    if (status) {
        params.push(status);
        conditions.push(`v.status = $${params.length}`);
    }

    if (vehicleGroupId) {
        params.push(vehicleGroupId);
        conditions.push(`v.vehicle_group_id = $${params.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const countParams = [...params];
    const rowsParams = [...params, limit, offset];

    const [countResult, rowsResult] = await Promise.all([
        pool.query(
            `SELECT COUNT(*)::int AS total
             FROM vehicles v
             ${whereClause}`,
            countParams,
        ),
        pool.query(
            `${VEHICLE_DETAIL_SELECT}
             ${whereClause}
             ORDER BY ${VEHICLE_SORTS[sort] ?? 'v.updated_at DESC, v.id DESC'}
             LIMIT $${rowsParams.length - 1} OFFSET $${rowsParams.length}`,
            rowsParams,
        ),
    ]);

    return {
        rows: rowsResult.rows,
        total: Number(countResult.rows[0]?.total ?? 0),
    };
};

const getVehicleById = async (vehicleId, db = pool) => {
    const result = await db.query(
        `${VEHICLE_DETAIL_SELECT}
         WHERE v.id = $1`,
        [vehicleId],
    );
    return result.rows[0] ?? null;
};

const getVehicleByPlateNumber = async (plateNumber, excludeId = null, db = pool) => {
    const params = [plateNumber.trim().toLowerCase()];
    let whereClause = 'WHERE LOWER(v.plate_number) = $1';

    if (excludeId !== null) {
        params.push(excludeId);
        whereClause += ` AND v.id <> $${params.length}`;
    }

    const result = await db.query(
        `SELECT v.id, v.plate_number
         FROM vehicles v
         ${whereClause}
         LIMIT 1`,
        params,
    );
    return result.rows[0] ?? null;
};

const getVehicleGroupReferenceById = async (vehicleGroupId, db = pool) => {
    const result = await db.query(
        `SELECT id, name
         FROM vehicle_groups
         WHERE status = 'active'
           AND id = $1`,
        [vehicleGroupId],
    );
    return result.rows[0] ?? null;
};

const getDriverById = async (driverId, db = pool) => {
    const result = await db.query(
        `SELECT
            d.profile_id AS id,
            d.vehicle_id,
            p.full_name,
            a.email,
            d.license_number,
            COALESCE(active_shipments.active_shipment_count, 0)::int AS active_shipment_count,
            COALESCE(unverified_maintenance.unverified_maintenance_count, 0)::int AS unverified_maintenance_count
         FROM drivers d
         JOIN profiles p ON p.id = d.profile_id
         JOIN accounts a ON a.id = d.profile_id
         LEFT JOIN LATERAL (
             SELECT COUNT(*)::int AS active_shipment_count
             FROM order_shipments os
             JOIN v_shipment_current sc ON sc.shipment_id = os.id
             WHERE sc.owner_driver_id = d.profile_id
               AND ${ACTIVE_SHIPMENT_STATUS_CONDITION}
         ) active_shipments ON TRUE
         LEFT JOIN LATERAL (
             SELECT COUNT(*)::int AS unverified_maintenance_count
             FROM maintenance_records mr
             WHERE mr.performed_by = d.profile_id
               AND mr.status IN ('open', 'pending_verification')
         ) unverified_maintenance ON TRUE
         WHERE d.profile_id = $1`,
        [driverId],
    );
    return result.rows[0] ?? null;
};

const listDriverOptions = async () => {
    const result = await pool.query(
        `SELECT
            d.profile_id AS id,
            p.full_name,
            a.email,
            d.license_number,
            d.vehicle_id AS current_vehicle_id,
            v.plate_number AS current_vehicle_plate,
            v.status AS current_vehicle_status,
            COALESCE(active_shipments.active_shipment_count, 0)::int AS active_shipment_count,
            COALESCE(unverified_maintenance.unverified_maintenance_count, 0)::int AS unverified_maintenance_count
         FROM drivers d
         JOIN profiles p ON p.id = d.profile_id
         JOIN accounts a ON a.id = d.profile_id
         LEFT JOIN vehicles v ON v.id = d.vehicle_id
         LEFT JOIN LATERAL (
             SELECT COUNT(*)::int AS active_shipment_count
             FROM order_shipments os
             JOIN v_shipment_current sc ON sc.shipment_id = os.id
             WHERE sc.owner_driver_id = d.profile_id
               AND ${ACTIVE_SHIPMENT_STATUS_CONDITION}
         ) active_shipments ON TRUE
         LEFT JOIN LATERAL (
             SELECT COUNT(*)::int AS unverified_maintenance_count
             FROM maintenance_records mr
             WHERE mr.performed_by = d.profile_id
               AND mr.status IN ('open', 'pending_verification')
         ) unverified_maintenance ON TRUE
         ORDER BY p.full_name ASC, d.profile_id ASC`,
    );
    return result.rows;
};

const hasOpenMaintenanceRecord = async (vehicleId, db = pool) => {
    const result = await db.query(
        `SELECT id
         FROM maintenance_records
         WHERE vehicle_id = $1
           AND status IN ('requested', 'open', 'pending_verification')
         LIMIT 1`,
        [vehicleId],
    );
    return result.rows[0] ?? null;
};

const hasOpenFailureRecord = async (vehicleId, db = pool) => {
    const result = await db.query(
        `SELECT id
         FROM incidents
         WHERE vehicle_id = $1
           AND shipment_id IS NULL
           AND incident_type = 'vehicle_breakdown'
           AND status IN ('open', 'investigating')
         LIMIT 1`,
        [vehicleId],
    );
    return result.rows[0] ?? null;
};

const createVehicle = async ({
    plate_number,
    vehicle_group_id,
    brand,
    model,
    load_capacity_kg,
    manufacture_year,
    purchase_date,
    assigned_driver_id,
    status,
}) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const result = await client.query(
            `INSERT INTO vehicles (
                plate_number,
                vehicle_group_id,
                brand,
                model,
                load_capacity_kg,
                manufacture_year,
                purchase_date,
                assigned_driver_id,
                status
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id`,
            [
                plate_number,
                vehicle_group_id,
                brand,
                model,
                load_capacity_kg,
                manufacture_year,
                purchase_date,
                assigned_driver_id,
                status,
            ],
        );

        const vehicleId = result.rows[0]?.id;
        if (assigned_driver_id) {
            // default_vehicle_group_id chỉ set nếu đang trống (gán xe lần đầu) — không
            // ghi đè nhóm KPI cố định của tài nếu đã có từ trước (BR KPI: gắn chết 1 nhóm).
            await client.query(
                `UPDATE drivers
                 SET vehicle_id = $1,
                     default_vehicle_group_id = COALESCE(default_vehicle_group_id, $3)
                 WHERE profile_id = $2`,
                [vehicleId, assigned_driver_id, vehicle_group_id],
            );
        }

        await client.query('COMMIT');
        return vehicleId;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

const updateVehicle = async (
    vehicleId,
    {
        plate_number,
        vehicle_group_id,
        brand,
        model,
        load_capacity_kg,
        manufacture_year,
        purchase_date,
        assigned_driver_id,
    },
) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const currentVehicleResult = await client.query(
            `SELECT id, assigned_driver_id
             FROM vehicles
             WHERE id = $1
             FOR UPDATE`,
            [vehicleId],
        );
        const currentVehicle = currentVehicleResult.rows[0];
        if (!currentVehicle) {
            await client.query('ROLLBACK');
            return null;
        }

        await client.query(
            `SELECT profile_id
             FROM drivers
             WHERE vehicle_id = $1
             FOR UPDATE`,
            [vehicleId],
        );

        await client.query(
            `UPDATE drivers
             SET vehicle_id = NULL
             WHERE vehicle_id = $1
               AND ($2::int IS NULL OR profile_id <> $2)`,
            [vehicleId, assigned_driver_id],
        );

        if (assigned_driver_id) {
            await client.query(
                `UPDATE drivers
                 SET vehicle_id = $1,
                     default_vehicle_group_id = COALESCE(default_vehicle_group_id, $3)
                 WHERE profile_id = $2`,
                [vehicleId, assigned_driver_id, vehicle_group_id],
            );
        }

        const result = await client.query(
            `UPDATE vehicles
             SET
                plate_number = $2,
                vehicle_group_id = $3,
                brand = $4,
                model = $5,
                load_capacity_kg = $6,
                manufacture_year = $7,
                purchase_date = $8,
                assigned_driver_id = $9,
                updated_at = NOW()
             WHERE id = $1
             RETURNING id`,
            [
                vehicleId,
                plate_number,
                vehicle_group_id,
                brand,
                model,
                load_capacity_kg,
                manufacture_year,
                purchase_date,
                assigned_driver_id,
            ],
        );

        if (currentVehicle.assigned_driver_id && currentVehicle.assigned_driver_id !== assigned_driver_id) {
            await client.query(
                `UPDATE drivers
                 SET vehicle_id = NULL
                 WHERE profile_id = $1
                   AND vehicle_id = $2`,
                [currentVehicle.assigned_driver_id, vehicleId],
            );
        }

        await client.query('COMMIT');
        return result.rows[0] ?? null;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

const updateVehicleStatus = async ({ vehicleId, nextStatus, actionType, managerId, note = null, referenceType = null, referenceId = null, metadata = null }) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const currentResult = await client.query(
            `SELECT id, status
             FROM vehicles
             WHERE id = $1
             FOR UPDATE`,
            [vehicleId],
        );
        const currentVehicle = currentResult.rows[0];
        if (!currentVehicle) {
            await client.query('ROLLBACK');
            return null;
        }

        await client.query(
            `UPDATE vehicles
             SET status = $2,
                 updated_at = NOW()
             WHERE id = $1`,
            [vehicleId, nextStatus],
        );

        await client.query(
            `INSERT INTO vehicle_status_history (
                vehicle_id,
                action_type,
                from_status,
                to_status,
                reference_type,
                reference_id,
                note,
                metadata,
                created_by
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
            [
                vehicleId,
                actionType,
                currentVehicle.status,
                nextStatus,
                referenceType,
                referenceId,
                note,
                metadata ? JSON.stringify(metadata) : null,
                managerId,
            ],
        );

        await client.query('COMMIT');
        return { previousStatus: currentVehicle.status, nextStatus };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

const createMaintenanceRecordAndSetStatus = async ({
    vehicleId,
    managerId,
    maintenanceType,
    description,
    maintenanceDate,
    nextDueDate = null,
    performedBy = null,
    cost = null,
    note = null,
}) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const vehicleResult = await client.query(
            `SELECT id, status
             FROM vehicles
             WHERE id = $1
             FOR UPDATE`,
            [vehicleId],
        );
        const vehicle = vehicleResult.rows[0];
        if (!vehicle) {
            await client.query('ROLLBACK');
            return null;
        }

        const openMaintenance = await hasOpenMaintenanceRecord(vehicleId, client);
        if (openMaintenance) {
            const err = new Error('Vehicle already has an active maintenance record');
            err.code = 'OPEN_MAINTENANCE_EXISTS';
            throw err;
        }

        const maintenanceResult = await client.query(
            `INSERT INTO maintenance_records (
                vehicle_id,
                maintenance_type,
                description,
                cost,
                maintenance_date,
                next_due_date,
                performed_by,
                status,
                started_at,
                created_by,
                created_at,
                updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', NOW(), $8, NOW(), NOW())
            RETURNING id`,
            [
                vehicleId,
                maintenanceType,
                description,
                cost,
                maintenanceDate,
                nextDueDate,
                performedBy,
                managerId,
            ],
        );
        const maintenanceId = maintenanceResult.rows[0].id;

        await client.query(
            `UPDATE vehicles
             SET status = 'maintenance',
                 updated_at = NOW()
             WHERE id = $1`,
            [vehicleId],
        );

        await client.query(
            `INSERT INTO vehicle_status_history (
                vehicle_id,
                action_type,
                from_status,
                to_status,
                reference_type,
                reference_id,
                note,
                created_by
            )
            VALUES ($1, 'send_to_maintenance', $2, 'maintenance', 'maintenance_record', $3, $4, $5)`,
            [vehicleId, vehicle.status, maintenanceId, note, managerId],
        );

        await client.query('COMMIT');
        return { maintenanceId, previousStatus: vehicle.status };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

const moveBrokenVehicleToMaintenance = async ({
    vehicleId,
    managerId,
    maintenanceType,
    description,
    maintenanceDate,
    nextDueDate = null,
    performedBy = null,
    note = null,
    failureResolutionNote = null,
}) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const vehicleResult = await client.query(
            `SELECT id, status
             FROM vehicles
             WHERE id = $1
             FOR UPDATE`,
            [vehicleId],
        );
        const vehicle = vehicleResult.rows[0];
        if (!vehicle) {
            await client.query('ROLLBACK');
            return null;
        }

        const openMaintenance = await hasOpenMaintenanceRecord(vehicleId, client);
        if (openMaintenance) {
            const err = new Error('Vehicle already has an active maintenance record');
            err.code = 'OPEN_MAINTENANCE_EXISTS';
            throw err;
        }

        const failureResult = await client.query(
            `SELECT id
             FROM incidents
             WHERE vehicle_id = $1
               AND shipment_id IS NULL
               AND incident_type = 'vehicle_breakdown'
               AND status IN ('open', 'investigating')
             ORDER BY occurred_at DESC, id DESC
             LIMIT 1
             FOR UPDATE`,
            [vehicleId],
        );
        const failure = failureResult.rows[0];
        if (!failure) {
            const err = new Error('Active breakdown incident not found');
            err.code = 'OPEN_FAILURE_NOT_FOUND';
            throw err;
        }

        await client.query(
            `UPDATE incidents
             SET status = 'resolved',
                 resolution_note = $2,
                 resolved_by = $3,
                 resolved_at = NOW(),
                 updated_at = NOW()
             WHERE id = $1`,
            [failure.id, failureResolutionNote, managerId],
        );

        const maintenanceResult = await client.query(
            `INSERT INTO maintenance_records (
                vehicle_id,
                maintenance_type,
                description,
                cost,
                maintenance_date,
                next_due_date,
                performed_by,
                status,
                started_at,
                created_by,
                created_at,
                updated_at
            )
            VALUES ($1, $2, $3, NULL, $4, $5, $6, 'open', NOW(), $7, NOW(), NOW())
            RETURNING id`,
            [
                vehicleId,
                maintenanceType,
                description,
                maintenanceDate,
                nextDueDate,
                performedBy,
                managerId,
            ],
        );
        const maintenanceId = maintenanceResult.rows[0].id;

        await client.query(
            `UPDATE vehicles
             SET status = 'maintenance',
                 updated_at = NOW()
             WHERE id = $1`,
            [vehicleId],
        );

        await client.query(
            `INSERT INTO vehicle_status_history (
                vehicle_id,
                action_type,
                from_status,
                to_status,
                reference_type,
                reference_id,
                note,
                created_by
            )
            VALUES ($1, 'send_to_maintenance', $2, 'maintenance', 'maintenance_record', $3, $4, $5)`,
            [vehicleId, vehicle.status, maintenanceId, note, managerId],
        );

        await client.query('COMMIT');
        return { maintenanceId, previousStatus: vehicle.status, resolvedFailureId: failure.id };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

const completeMaintenanceRecordAndSetStatus = async ({
    vehicleId,
    maintenanceRecordId,
    driverId,
    billPics = [],
    performedBy = null,
    cost = null,
}) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const vehicleResult = await client.query(
            `SELECT id, status
             FROM vehicles
             WHERE id = $1
             FOR UPDATE`,
            [vehicleId],
        );
        const vehicle = vehicleResult.rows[0];
        if (!vehicle) {
            await client.query('ROLLBACK');
            return null;
        }

        const params = [vehicleId];
        let idClause = '';
        if (maintenanceRecordId !== null) {
            params.push(maintenanceRecordId);
            idClause = `AND id = $${params.length}`;
        }

        const recordResult = await client.query(
            `SELECT id, status
             FROM maintenance_records
             WHERE vehicle_id = $1
               AND status = 'open'
               ${idClause}
             ORDER BY started_at DESC, id DESC
             LIMIT 1
             FOR UPDATE`,
            params,
        );
        const record = recordResult.rows[0];
        if (!record) {
            const err = new Error('Active maintenance record not found');
            err.code = 'OPEN_MAINTENANCE_NOT_FOUND';
            throw err;
        }

        await client.query(
            `UPDATE maintenance_records
             SET status = 'pending_verification',
                 completed_at = NOW(),
                 bill_pics = $2::jsonb,
                 completed_by = $3,
                 performed_by = COALESCE($4, performed_by),
                 cost = COALESCE($5, cost),
                 updated_at = NOW()
             WHERE id = $1`,
            [record.id, JSON.stringify(billPics), driverId, performedBy, cost],
        );

        await client.query(
            `INSERT INTO vehicle_status_history (
                vehicle_id,
                action_type,
                from_status,
                to_status,
                reference_type,
                reference_id,
                note,
                created_by
            )
            VALUES ($1, 'complete_maintenance', $2, $2, 'maintenance_record', $3, $4, $5)`,
            [vehicleId, vehicle.status, record.id, 'Driver marked maintenance ready for verification', driverId],
        );

        await client.query('COMMIT');
        return { maintenanceId: record.id, previousStatus: vehicle.status };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

const verifyMaintenanceRecordAndSetStatus = async ({
    vehicleId,
    maintenanceRecordId,
    managerId,
    note = null,
}) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const vehicleResult = await client.query(
            `SELECT id, status
             FROM vehicles
             WHERE id = $1
             FOR UPDATE`,
            [vehicleId],
        );
        const vehicle = vehicleResult.rows[0];
        if (!vehicle) {
            await client.query('ROLLBACK');
            return null;
        }

        const params = [vehicleId];
        let idClause = '';
        if (maintenanceRecordId !== null) {
            params.push(maintenanceRecordId);
            idClause = `AND id = $${params.length}`;
        }

        const recordResult = await client.query(
            `SELECT
                id,
                bill_pics,
                cost,
                description,
                maintenance_type,
                maintenance_date
             FROM maintenance_records
             WHERE vehicle_id = $1
               AND status = 'pending_verification'
               ${idClause}
             ORDER BY completed_at DESC NULLS LAST, started_at DESC, id DESC
             LIMIT 1
             FOR UPDATE`,
            params,
        );
        const record = recordResult.rows[0];
        if (!record) {
            const err = new Error('Maintenance record awaiting verification not found');
            err.code = 'PENDING_MAINTENANCE_NOT_FOUND';
            throw err;
        }

        const billPics = Array.isArray(record.bill_pics) ? record.bill_pics : [];
        if (billPics.length === 0) {
            const err = new Error('Maintenance bill evidence is required before verification');
            err.code = 'MAINTENANCE_BILL_REQUIRED';
            throw err;
        }

        const expenseAmount = Number(record.cost);
        if (!Number.isFinite(expenseAmount) || expenseAmount <= 0) {
            const err = new Error('Maintenance cost must be greater than 0 before verification');
            err.code = 'MAINTENANCE_COST_REQUIRED';
            throw err;
        }

        const expenseDescription = record.description?.trim?.() || `Vehicle maintenance (${record.maintenance_type})`;
        const expenseResult = await client.query(
            `INSERT INTO expenses (
                shipment_id,
                vehicle_id,
                created_by,
                expense_type,
                amount,
                description,
                expense_date
            )
            VALUES (NULL, $1, $2, 'maintenance', $3, $4, $5)
            RETURNING id`,
            [vehicleId, managerId, expenseAmount, expenseDescription, record.maintenance_date],
        );
        const expenseId = expenseResult.rows[0].id;

        // Tài xế đã ứng tiền trả xưởng — không ghi sổ tại đây, chuyển 'pending'
        // chờ hoàn (cấn trừ nợ thu hộ hoặc hoàn qua kỳ lương)
        await client.query(
            `UPDATE expenses SET reimbursement_status = 'pending', updated_at = NOW() WHERE id = $1`,
            [expenseId],
        );

        for (const fileUrl of billPics) {
            await client.query(
                `INSERT INTO expense_attachments (expense_id, file_url)
                 VALUES ($1, $2)`,
                [expenseId, fileUrl],
            );
        }

        await client.query(
            `UPDATE maintenance_records
             SET status = 'completed',
                 expense_id = $2,
                 verified_by = $3,
                 verified_at = NOW(),
                 updated_at = NOW()
             WHERE id = $1`,
            [record.id, expenseId, managerId],
        );

        await client.query(
            `UPDATE vehicles
             SET status = 'active',
                 updated_at = NOW()
             WHERE id = $1`,
            [vehicleId],
        );

        await client.query(
            `INSERT INTO vehicle_status_history (
                vehicle_id,
                action_type,
                from_status,
                to_status,
                reference_type,
                reference_id,
                note,
                created_by
            )
            VALUES ($1, 'complete_maintenance', $2, 'active', 'maintenance_record', $3, $4, $5)`,
            [vehicleId, vehicle.status, record.id, note, managerId],
        );

        await client.query('COMMIT');
        return { maintenanceId: record.id, previousStatus: vehicle.status };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

const createFailureRecordAndSetStatus = async ({
    vehicleId,
    managerId,
    failureType,
    description,
    severityLevel,
    occurredAt = null,
    note = null,
}) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const vehicleResult = await client.query(
            `SELECT id, status
             FROM vehicles
             WHERE id = $1
             FOR UPDATE`,
            [vehicleId],
        );
        const vehicle = vehicleResult.rows[0];
        if (!vehicle) {
            await client.query('ROLLBACK');
            return null;
        }

        const openFailure = await hasOpenFailureRecord(vehicleId, client);
        if (openFailure) {
            const err = new Error('Vehicle already has an active breakdown incident');
            err.code = 'OPEN_FAILURE_EXISTS';
            throw err;
        }

        const failureResult = await client.query(
            `INSERT INTO incidents (
                shipment_id,
                vehicle_id,
                reported_by,
                incident_type,
                severity_level,
                description,
                location,
                estimated_loss,
                occurred_at,
                status
            )
            VALUES (NULL, $1, $2, 'vehicle_breakdown', $3, $4, $5, 0, COALESCE($6, NOW()), 'open')
            RETURNING id`,
            [vehicleId, managerId, severityLevel, description, failureType, occurredAt],
        );
        const failureId = failureResult.rows[0].id;

        await client.query(
            `UPDATE vehicles
             SET status = 'broken',
                 updated_at = NOW()
             WHERE id = $1`,
            [vehicleId],
        );

        await client.query(
            `INSERT INTO vehicle_status_history (
                vehicle_id,
                action_type,
                from_status,
                to_status,
                reference_type,
                reference_id,
                note,
                created_by
            )
            VALUES ($1, 'mark_broken', $2, 'broken', 'incident', $3, $4, $5)`,
            [vehicleId, vehicle.status, failureId, note, managerId],
        );

        await client.query('COMMIT');
        return { failureId, previousStatus: vehicle.status };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

const resolveFailureRecordAndSetStatus = async ({
    vehicleId,
    failureRecordId,
    managerId,
    resolutionNote = null,
}) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const vehicleResult = await client.query(
            `SELECT id, status
             FROM vehicles
             WHERE id = $1
             FOR UPDATE`,
            [vehicleId],
        );
        const vehicle = vehicleResult.rows[0];
        if (!vehicle) {
            await client.query('ROLLBACK');
            return null;
        }

        const params = [vehicleId];
        let idClause = '';
        if (failureRecordId !== null) {
            params.push(failureRecordId);
            idClause = `AND id = $${params.length}`;
        }

        const failureResult = await client.query(
            `SELECT id, status
             FROM incidents
             WHERE vehicle_id = $1
               AND shipment_id IS NULL
               AND incident_type = 'vehicle_breakdown'
               AND status IN ('open', 'investigating')
               ${idClause}
             ORDER BY occurred_at DESC, id DESC
             LIMIT 1
             FOR UPDATE`,
            params,
        );
        const record = failureResult.rows[0];
        if (!record) {
            const err = new Error('Active breakdown incident not found');
            err.code = 'OPEN_FAILURE_NOT_FOUND';
            throw err;
        }

        await client.query(
            `UPDATE incidents
             SET status = 'resolved',
                 resolution_note = $2,
                 resolved_by = $3,
                 resolved_at = NOW(),
                 updated_at = NOW()
             WHERE id = $1`,
            [record.id, resolutionNote, managerId],
        );

        await client.query(
            `UPDATE vehicles
             SET status = 'active',
                 updated_at = NOW()
             WHERE id = $1`,
            [vehicleId],
        );

        await client.query(
            `INSERT INTO vehicle_status_history (
                vehicle_id,
                action_type,
                from_status,
                to_status,
                reference_type,
                reference_id,
                note,
                created_by
            )
            VALUES ($1, 'restore_vehicle', $2, 'active', 'incident', $3, $4, $5)`,
            [vehicleId, vehicle.status, record.id, resolutionNote, managerId],
        );

        await client.query('COMMIT');
        return { failureId: record.id, previousStatus: vehicle.status };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

const retireVehicle = async ({ vehicleId, managerId, note = null }) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const vehicleResult = await client.query(
            `SELECT id, status, assigned_driver_id
             FROM vehicles
             WHERE id = $1
             FOR UPDATE`,
            [vehicleId],
        );
        const vehicle = vehicleResult.rows[0];
        if (!vehicle) {
            await client.query('ROLLBACK');
            return null;
        }

        await client.query(
            `UPDATE vehicles
             SET status = 'retired',
                 assigned_driver_id = NULL,
                 updated_at = NOW()
             WHERE id = $1`,
            [vehicleId],
        );

        await client.query(
            `UPDATE drivers
             SET vehicle_id = NULL
             WHERE vehicle_id = $1`,
            [vehicleId],
        );

        if (vehicle.assigned_driver_id) {
            await insertVehicleAssignmentHistory({
                vehicleId,
                driverId: null,
                previousDriverId: vehicle.assigned_driver_id,
                action: 'unassign',
                note: 'Bỏ gán do xe ngừng hoạt động (retired)',
                createdBy: managerId,
            }, client);
        }

        await client.query(
            `INSERT INTO vehicle_status_history (
                vehicle_id,
                action_type,
                from_status,
                to_status,
                note,
                created_by
            )
            VALUES ($1, 'retire_vehicle', $2, 'retired', $3, $4)`,
            [vehicleId, vehicle.status, note, managerId],
        );

        await client.query('COMMIT');
        return { previousStatus: vehicle.status };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

const listVehicleStatusHistory = async (vehicleId) => {
    const result = await pool.query(
        `SELECT
            vsh.id,
            vsh.action_type,
            vsh.from_status,
            vsh.to_status,
            vsh.reference_type,
            vsh.reference_id,
            vsh.note,
            vsh.metadata,
            vsh.created_by,
            p.full_name AS created_by_name,
            vsh.created_at
         FROM vehicle_status_history vsh
         LEFT JOIN profiles p ON p.id = vsh.created_by
         WHERE vsh.vehicle_id = $1
         ORDER BY vsh.created_at DESC, vsh.id DESC`,
        [vehicleId],
    );
    return result.rows;
};

const getMaintenanceRecordsForDriver = async (driverId, db = pool) => {
    const result = await db.query(
        `SELECT mr.id, mr.vehicle_id, v.plate_number, v.brand, v.model,
                mr.maintenance_type, mr.description, mr.cost, mr.maintenance_date,
                mr.next_due_date, mr.status, mr.bill_pics, mr.started_at, mr.completed_at,
                mr.created_by, mr.request_reason, mr.reject_reason
         FROM maintenance_records mr
         JOIN vehicles v ON v.id = mr.vehicle_id
         WHERE mr.performed_by = $1
           AND (
                mr.status IN ('requested', 'open', 'pending_verification')
                OR (mr.status = 'rejected' AND mr.updated_at > NOW() - INTERVAL '30 days')
           )
         ORDER BY mr.started_at DESC`,
        [driverId],
    );
    return result.rows;
};

const updateMaintenanceCost = async (maintenanceRecordId, cost, db = pool) => {
    const result = await db.query(
        `UPDATE maintenance_records
         SET cost = $2, updated_at = NOW()
         WHERE id = $1
         RETURNING id, cost`,
        [maintenanceRecordId, cost],
    );
    return result.rows[0] ?? null;
};

const getActiveMaintenanceRecordForDriver = async (vehicleId, driverId, db = pool, statuses = ['open']) => {
    const result = await db.query(
        `SELECT id, vehicle_id, performed_by, status, bill_pics, cost, created_by
         FROM maintenance_records
         WHERE vehicle_id = $1
           AND performed_by = $2
           AND status = ANY($3)
         ORDER BY started_at DESC, id DESC
         LIMIT 1`,
        [vehicleId, driverId, statuses],
    );
    return result.rows[0] ?? null;
};

// ─── Vehicle driver assignment history ───────────────────────────────────────

const insertVehicleAssignmentHistory = async ({
    vehicleId, driverId = null, previousDriverId = null, action, note = null, createdBy = null,
}, db = pool) => {
    await db.query(
        `INSERT INTO vehicle_driver_assignments
            (vehicle_id, driver_id, previous_driver_id, action, note, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [vehicleId, driverId, previousDriverId, action, note, createdBy],
    );
};

const getVehicleAssignmentHistory = async (vehicleId, db = pool) => {
    const result = await db.query(
        `SELECT vda.id, vda.vehicle_id, vda.action, vda.note, vda.created_at,
                vda.driver_id, p_driver.full_name AS driver_name,
                vda.previous_driver_id, p_prev.full_name AS previous_driver_name,
                vda.created_by, p_by.full_name AS created_by_name
         FROM vehicle_driver_assignments vda
         LEFT JOIN profiles p_driver ON p_driver.id = vda.driver_id
         LEFT JOIN profiles p_prev   ON p_prev.id   = vda.previous_driver_id
         LEFT JOIN profiles p_by     ON p_by.id     = vda.created_by
         WHERE vda.vehicle_id = $1
         ORDER BY vda.created_at DESC, vda.id DESC`,
        [vehicleId],
    );
    return result.rows;
};

const getDriverAssignmentHistory = async (driverId, db = pool) => {
    const result = await db.query(
        `SELECT vda.id, vda.action, vda.note, vda.created_at,
                vda.vehicle_id, v.plate_number, v.brand, v.model,
                vg.name AS vehicle_group_name,
                vda.created_by, p_by.full_name AS created_by_name
         FROM vehicle_driver_assignments vda
         JOIN vehicles v ON v.id = vda.vehicle_id
         LEFT JOIN vehicle_groups vg ON vg.id = v.vehicle_group_id
         LEFT JOIN profiles p_by ON p_by.id = vda.created_by
         WHERE vda.driver_id = $1
            OR (vda.action = 'unassign' AND vda.previous_driver_id = $1)
         ORDER BY vda.created_at DESC, vda.id DESC`,
        [driverId],
    );
    return result.rows;
};

// ─── Maintenance request (driver gửi yêu cầu, manager duyệt) ─────────────────

const createMaintenanceRequest = async ({ vehicleId, driverId, maintenanceType, reason, billPics = [] }) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query('SELECT id FROM vehicles WHERE id = $1 FOR UPDATE', [vehicleId]);

        const existing = await hasOpenMaintenanceRecord(vehicleId, client);
        if (existing) {
            const err = new Error('Xe đang có yêu cầu hoặc đợt bảo dưỡng chưa hoàn tất');
            err.code = 'OPEN_MAINTENANCE_EXISTS';
            throw err;
        }

        const result = await client.query(
            `INSERT INTO maintenance_records (
                vehicle_id, maintenance_type, description, maintenance_date,
                performed_by, status, requested_by, request_reason, bill_pics,
                started_at, created_at, updated_at
            )
            VALUES ($1, $2, $3, CURRENT_DATE, $4, 'requested', $4, $5, $6::jsonb, NOW(), NOW(), NOW())
            RETURNING id`,
            [vehicleId, maintenanceType, reason, driverId, reason, JSON.stringify(billPics ?? [])],
        );

        await client.query('COMMIT');
        return { maintenanceId: result.rows[0].id };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

const listMaintenanceRequests = async (db = pool) => {
    const result = await db.query(
        `SELECT mr.id, mr.vehicle_id, v.plate_number, v.brand, v.model,
                mr.maintenance_type, mr.request_reason, mr.maintenance_date,
                mr.status, mr.created_at,
                mr.requested_by, p.full_name AS requested_by_name
         FROM maintenance_records mr
         JOIN vehicles v ON v.id = mr.vehicle_id
         LEFT JOIN profiles p ON p.id = mr.requested_by
         WHERE mr.status = 'requested'
         ORDER BY mr.created_at DESC`,
    );
    return result.rows;
};

const approveMaintenanceRequest = async ({ maintenanceRecordId, managerId, note = null }) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const recordResult = await client.query(
            `SELECT id, vehicle_id, status
             FROM maintenance_records
             WHERE id = $1
             FOR UPDATE`,
            [maintenanceRecordId],
        );
        const record = recordResult.rows[0];
        if (!record || record.status !== 'requested') {
            await client.query('ROLLBACK');
            return null;
        }

        const vehicleResult = await client.query(
            'SELECT id, status FROM vehicles WHERE id = $1 FOR UPDATE',
            [record.vehicle_id],
        );
        const vehicle = vehicleResult.rows[0];

        await client.query(
            `UPDATE maintenance_records
             SET status = 'open',
                 started_at = NOW(),
                 created_by = $2,
                 updated_at = NOW()
             WHERE id = $1`,
            [maintenanceRecordId, managerId],
        );

        await client.query(
            `UPDATE vehicles
             SET status = 'maintenance', updated_at = NOW()
             WHERE id = $1`,
            [record.vehicle_id],
        );

        await client.query(
            `INSERT INTO vehicle_status_history (
                vehicle_id, action_type, from_status, to_status,
                reference_type, reference_id, note, created_by
            )
            VALUES ($1, 'send_to_maintenance', $2, 'maintenance', 'maintenance_record', $3, $4, $5)`,
            [record.vehicle_id, vehicle.status, maintenanceRecordId, note, managerId],
        );

        await client.query('COMMIT');
        return { maintenanceId: maintenanceRecordId, vehicleId: record.vehicle_id, previousStatus: vehicle.status };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

const rejectMaintenanceRequest = async ({ maintenanceRecordId, managerId, reason }, db = pool) => {
    const result = await db.query(
        `UPDATE maintenance_records
         SET status = 'rejected',
             reject_reason = $2,
             created_by = $3,
             updated_at = NOW()
         WHERE id = $1
           AND status = 'requested'
         RETURNING id, vehicle_id, performed_by`,
        [maintenanceRecordId, reason, managerId],
    );
    return result.rows[0] ?? null;
};

const updateMaintenanceBillPics = async (maintenanceRecordId, billPics, db = pool) => {
    const result = await db.query(
        `UPDATE maintenance_records
         SET bill_pics = $2::jsonb,
             updated_at = NOW()
         WHERE id = $1
         RETURNING id, bill_pics`,
        [maintenanceRecordId, JSON.stringify(billPics)],
    );
    return result.rows[0] ?? null;
};

module.exports = {
    listVehicleGroups,
    getVehicleGroupById,
    getVehicleGroupByName,
    createVehicleGroup,
    updateVehicleGroup,
    deleteVehicleGroup,
    listVehicles,
    getVehicleById,
    getVehicleByPlateNumber,
    getVehicleGroupReferenceById,
    getDriverById,
    listDriverOptions,
    hasOpenMaintenanceRecord,
    hasOpenFailureRecord,
    createVehicle,
    updateVehicle,
    updateVehicleStatus,
    createMaintenanceRecordAndSetStatus,
    moveBrokenVehicleToMaintenance,
    completeMaintenanceRecordAndSetStatus,
    verifyMaintenanceRecordAndSetStatus,
    createFailureRecordAndSetStatus,
    resolveFailureRecordAndSetStatus,
    retireVehicle,
    listVehicleStatusHistory,
    getActiveMaintenanceRecordForDriver,
    getMaintenanceRecordsForDriver,
    updateMaintenanceBillPics,
    updateMaintenanceCost,
    createMaintenanceRequest,
    listMaintenanceRequests,
    approveMaintenanceRequest,
    rejectMaintenanceRequest,
    insertVehicleAssignmentHistory,
    getVehicleAssignmentHistory,
    getDriverAssignmentHistory,
};
