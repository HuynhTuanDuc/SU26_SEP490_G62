const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { ACTIVE_STATUSES, SHIPMENT_STATUS } = require('../constants/tripConstants');
const { insertAssignmentHistory } = require('./tripRepository');
const financialLedgerRepository = require('./financialLedgerRepository');


//Query to list order specific detail
const selectOrderProjection = `
    SELECT
        o.id,
        o.customer_id,
        o.cargo_name,
        o.cargo_weight_kg,
        o.payment_type,
        o.prepaid_amount,
        o.total_estimated_price,
        o.total_estimated_price AS estimated_price,
        o.partner_name,
        COALESCE(actual_totals.total_actual_price, 0) AS total_actual_price,
        o.derived_status,
        o.derived_status AS order_status,
        os.status,
        os.status AS first_shipment_status,
        o.notes,
        o.created_at,
        o.updated_at,
        os.id AS shipment_id,
        os.completed_at,
        os.vehicle_group_id,
        sc.owner_driver_id,
        os.estimated_distance_km,
        os.arrived_at,
        pickup.address AS pickup_address,
        delivery.address AS delivery_address,
        c.full_name AS customer_name,
        c.phone AS customer_phone,
        d.full_name AS driver_name,
        v.plate_number AS plate_number,
        all_shipments.trips
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id

    LEFT JOIN LATERAL (
        SELECT s1.*
        FROM order_shipments s1
        WHERE s1.order_id = o.id
        ORDER BY s1.shipment_index ASC
        LIMIT 1
    ) os ON TRUE

    LEFT JOIN v_shipment_current sc ON sc.shipment_id = os.id

    LEFT JOIN LATERAL (
        SELECT ts.address
        FROM trip_stops ts
        WHERE ts.shipment_id = os.id AND ts.stop_type = 'pickup'
        ORDER BY ts.stop_index ASC
        LIMIT 1
    ) pickup ON TRUE

    LEFT JOIN LATERAL (
        SELECT ts.address
        FROM trip_stops ts
        WHERE ts.shipment_id = os.id AND ts.stop_type = 'delivery'
        ORDER BY ts.stop_index ASC
        LIMIT 1
    ) delivery ON TRUE

    LEFT JOIN profiles d ON d.id = sc.owner_driver_id
    LEFT JOIN vehicles v ON v.id = sc.vehicle_id

    LEFT JOIN LATERAL (
        SELECT SUM(s_actual.actual_price) AS total_actual_price
        FROM order_shipments s_actual
        WHERE s_actual.order_id = o.id
    ) actual_totals ON TRUE

    LEFT JOIN LATERAL (
        SELECT json_agg(
            json_build_object(
                'vehicle_group_id', s_all.vehicle_group_id,
                'shipment_id', s_all.id,
                'shipment_index', s_all.shipment_index,
                'owner_driver_id', sc_all.owner_driver_id,
                'vehicle_id', sc_all.vehicle_id,
                'plate', v_all.plate_number,
                'distance', s_all.estimated_distance_km,
                'arrived_at', s_all.arrived_at,
                'pickup_address', (SELECT address FROM trip_stops WHERE shipment_id = s_all.id AND stop_type = 'pickup' LIMIT 1),
                'delivery_address', (SELECT address FROM trip_stops WHERE shipment_id = s_all.id AND stop_type = 'delivery' LIMIT 1),
                'pickup_addresses', (SELECT json_agg(ts.address ORDER BY ts.stop_index ASC) FROM trip_stops ts WHERE ts.shipment_id = s_all.id AND ts.stop_type = 'pickup'),
                'delivery_addresses', (SELECT json_agg(ts.address ORDER BY ts.stop_index ASC) FROM trip_stops ts WHERE ts.shipment_id = s_all.id AND ts.stop_type = 'delivery'),
                'fare', s_all.estimated_price,
                'status', s_all.status,
                'driverName', d_all.full_name
            ) ORDER BY s_all.shipment_index ASC
        ) AS trips
        FROM order_shipments s_all
        LEFT JOIN v_shipment_current sc_all ON sc_all.shipment_id = s_all.id
        LEFT JOIN vehicles v_all ON v_all.id = sc_all.vehicle_id
        LEFT JOIN profiles d_all ON d_all.id = sc_all.owner_driver_id
        WHERE s_all.order_id = o.id
    ) all_shipments ON TRUE
`;

//Chỉ lấy số nguyên dương 
const parsePositiveInt = (value, fallback, max = 100) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
    return Math.min(parsed, max);
};

//List orders
const listOrders = async ({
    page = 1,
    limit = 10,
    search = '',
    status = '',
    dateFrom = '',
    dateTo = '',
    customer = '',
} = {}) => {

    const normalizedPage = parsePositiveInt(page, 1, 1000000);//số trang

    const normalizedLimit = parsePositiveInt(limit, 10, 100);//số bản ghi 1 trang

    const offset = (normalizedPage - 1) * normalizedLimit; //Dựa vào limit và page 
    const conditions = [];
    const params = [];

    if (status) {
        const statuses = String(status)
            .split(',')
            .map((item) => item.trim().toLowerCase())
            .filter(Boolean);
        if (statuses.length) {
            params.push(statuses);
            conditions.push(`EXISTS (
                SELECT 1
                FROM order_shipments os_status
                WHERE os_status.order_id = o.id
                  AND LOWER(os_status.status) = ANY($${params.length})
            )`);
        }
    }

    if (dateFrom) {
        params.push(dateFrom);
        conditions.push(`EXISTS (
            SELECT 1
            FROM order_shipments os_date_from
            WHERE os_date_from.order_id = o.id
              AND os_date_from.arrived_at::date >= $${params.length}::date
        )`);
    }

    if (dateTo) {
        params.push(dateTo);
        conditions.push(`EXISTS (
            SELECT 1
            FROM order_shipments os_date_to
            WHERE os_date_to.order_id = o.id
              AND os_date_to.arrived_at::date <= $${params.length}::date
        )`);
    }

    if (customer) {
        params.push(`%${String(customer).trim().toLowerCase()}%`);
        conditions.push(`LOWER(COALESCE(c.full_name, '')) LIKE $${params.length}`);
    }

    if (search) {
        params.push(`%${String(search).trim().toLowerCase()}%`);
        conditions.push(`(
            LOWER(COALESCE(o.cargo_name, '')) LIKE $${params.length}
            OR LOWER(COALESCE(pickup.address, '')) LIKE $${params.length}
            OR LOWER(COALESCE(delivery.address, '')) LIKE $${params.length}
            OR LOWER(COALESCE(c.full_name, '')) LIKE $${params.length}
            OR LOWER(COALESCE(d.full_name, '')) LIKE $${params.length}
            OR LOWER(COALESCE(v.plate_number, '')) LIKE $${params.length}
            OR LOWER(COALESCE(os.status, '')) LIKE $${params.length}
            OR EXISTS (
                SELECT 1
                FROM order_shipments os_search
                LEFT JOIN v_shipment_current sc_search ON sc_search.shipment_id = os_search.id
                LEFT JOIN vehicles v_search ON v_search.id = sc_search.vehicle_id
                LEFT JOIN profiles d_search ON d_search.id = sc_search.owner_driver_id
                LEFT JOIN trip_stops ts_search ON ts_search.shipment_id = os_search.id
                WHERE os_search.order_id = o.id
                  AND (
                    LOWER(COALESCE(os_search.status, '')) LIKE $${params.length}
                    OR LOWER(COALESCE(v_search.plate_number, '')) LIKE $${params.length}
                    OR LOWER(COALESCE(d_search.full_name, '')) LIKE $${params.length}
                    OR LOWER(COALESCE(ts_search.address, '')) LIKE $${params.length}
                  )
            )
        )`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const countResult = await pool.query(
        `SELECT COUNT(*)::int AS total FROM (${selectOrderProjection} ${whereClause}) counted_orders`,
        params,
    );

    const rowsParams = [...params, normalizedLimit, offset];
    const rowsResult = await pool.query(
        `${selectOrderProjection}
         ${whereClause}
         ORDER BY o.created_at DESC, o.id DESC
         LIMIT $${rowsParams.length - 1} OFFSET $${rowsParams.length}`,
        rowsParams,
    );

    const total = Number(countResult.rows[0]?.total ?? 0);
    return {
        orders: rowsResult.rows,
        pagination: {
            page: normalizedPage,
            limit: normalizedLimit,
            total,
            totalPages: Math.max(1, Math.ceil(total / normalizedLimit)),
        },
    };
};

//Lấy tài xế theo Id
const getDriverById = async (client, driverId) => {
    if (!driverId) return null;
    const result = await client.query(
        `SELECT
            d.profile_id AS id,
            p.full_name,
            p.phone,
            d.vehicle_id,
            v.plate_number,
            v.vehicle_group_id,
            v.status AS vehicle_status
         FROM drivers d
         JOIN profiles p ON p.id = d.profile_id
         LEFT JOIN vehicles v ON v.id = d.vehicle_id
         WHERE d.profile_id = $1
         LIMIT 1`,
        [driverId],
    );
    return result.rows[0] ?? null;
};

//Lấy Id nhóm xe
const getDefaultVehicleGroupId = async (client) => {
    const result = await client.query(
        `SELECT id FROM vehicle_groups ORDER BY id ASC LIMIT 1`,
    );
    return result.rows[0]?.id ?? null;
};

//Lấy thông tin lái xe theo BKS
const getDriverByPlate = async (client, plateNumber) => {
    if (!plateNumber) return null;
    const result = await client.query(
        `SELECT
            d.profile_id AS id,
            p.full_name,
            p.phone,
            d.vehicle_id,
            v.plate_number,
            v.vehicle_group_id,
            v.status AS vehicle_status
         FROM vehicles v
         LEFT JOIN drivers d ON d.vehicle_id = v.id
         LEFT JOIN profiles p ON p.id = d.profile_id
         WHERE UPPER(v.plate_number) = UPPER($1)
         LIMIT 1`,
        [plateNumber],
    );
    return result.rows[0] ?? null;
};
//Lấy xe theo BKS
const getVehicleByPlate = async (client, plateNumber, vehicleGroupId = null) => {
    if (!plateNumber) return null;
    const params = [String(plateNumber).trim().toUpperCase()];
    let groupFilter = '';
    if (vehicleGroupId) {
        params.push(Number(vehicleGroupId));
        groupFilter = ` AND v.vehicle_group_id = $${params.length}`;
    }
    const result = await client.query(
        `SELECT
            v.id,
            v.plate_number,
            v.vehicle_group_id,
            v.assigned_driver_id,
            vg.name AS vehicle_group_name,
            vg.price_per_km,
            v.status AS vehicle_status
         FROM vehicles v
         JOIN vehicle_groups vg ON vg.id = v.vehicle_group_id
         WHERE UPPER(v.plate_number) = $1${groupFilter}
         LIMIT 1`,
        params,
    );
    return result.rows[0] ?? null;
};

const validateVehicleShipmentAssignment = async (
    client,
    { vehicleId, driverId, excludeShipmentId = null },
) => {
    if (!vehicleId || !driverId) {
        throw new Error('Xe phải có tài xế được gán trước khi điều phối chuyến');
    }

    const vehicleResult = await client.query(
        `SELECT
            v.id,
            v.plate_number,
            v.status,
            v.assigned_driver_id,
            d.vehicle_id AS driver_vehicle_id
         FROM vehicles v
         LEFT JOIN drivers d ON d.profile_id = $2
         WHERE v.id = $1
         LIMIT 1`,
        [vehicleId, driverId],
    );
    const vehicle = vehicleResult.rows[0];
    if (!vehicle) throw new Error('Xe không tồn tại');

    if (vehicle.status !== 'active') {
        throw new Error(`Xe ${vehicle.plate_number} hiện không sẵn sàng cho điều phối (trạng thái: ${vehicle.status})`);
    }

    if (Number(vehicle.assigned_driver_id) !== Number(driverId) || Number(vehicle.driver_vehicle_id) !== Number(vehicleId)) {
        throw new Error(`Tài xế chưa được gán hợp lệ với xe ${vehicle.plate_number}`);
    }

    const activeVehicleShipment = await client.query(
        `SELECT os.id
         FROM order_shipments os
         JOIN v_shipment_current sc ON sc.shipment_id = os.id
         WHERE sc.vehicle_id = $1
           AND os.status = ANY($2::text[])
           AND ($3::int IS NULL OR os.id <> $3)
         LIMIT 1`,
        [vehicleId, ACTIVE_STATUSES, excludeShipmentId],
    );
    if (activeVehicleShipment.rows[0]) {
        throw new Error(`Xe ${vehicle.plate_number} đang có chuyến đang hoạt động`);
    }

    const activeDriverShipment = await client.query(
        `SELECT os.id
         FROM order_shipments os
         JOIN v_shipment_current sc ON sc.shipment_id = os.id
         WHERE sc.owner_driver_id = $1
           AND os.status = ANY($2::text[])
           AND ($3::int IS NULL OR os.id <> $3)
         LIMIT 1`,
        [driverId, ACTIVE_STATUSES, excludeShipmentId],
    );
    if (activeDriverShipment.rows[0]) {
        throw new Error('Tài xế đang có chuyến đang hoạt động');
    }

    const openVehicleMaintenance = await client.query(
        `SELECT id
         FROM maintenance_records
         WHERE vehicle_id = $1
           AND status IN ('open', 'pending_verification')
         LIMIT 1`,
        [vehicleId],
    );
    if (openVehicleMaintenance.rows[0]) {
        throw new Error(`Xe ${vehicle.plate_number} đang trong bảo trì`);
    }

    const openDriverMaintenance = await client.query(
        `SELECT id
         FROM maintenance_records
         WHERE performed_by = $1
           AND vehicle_id <> $2
           AND status IN ('open', 'pending_verification')
         LIMIT 1`,
        [driverId, vehicleId],
    );
    if (openDriverMaintenance.rows[0]) {
        throw new Error('Tài xế đang phụ trách bảo trì xe khác');
    }

    return true;
};

//Lấy loại xe 
const getVehicleGroupById = async (client, vehicleGroupId) => {
    if (!vehicleGroupId) return null;
    const result = await client.query(
        `SELECT id, name, price_per_km
         FROM vehicle_groups
         WHERE id = $1
         LIMIT 1`,
        [vehicleGroupId],
    );
    return result.rows[0] ?? null;
};

//Chọn loại xe rồi hiển thị các phương tiện 
const listCoordinatorVehicleGroups = async () => {
    const result = await pool.query(
        `SELECT
            vg.id,
            vg.name,
            vg.price_per_km,

            COALESCE(
                JSON_AGG(
                    JSON_BUILD_OBJECT(
                        'id', v.id,
                        'plate_number', v.plate_number,
                        'status', v.status,
                        'assigned_driver_id', v.assigned_driver_id,
                        'assigned_driver_name', p.full_name
                    ) ORDER BY v.plate_number
                ) FILTER (WHERE v.id IS NOT NULL),
                '[]'::json
            ) AS vehicles

         FROM vehicle_groups vg
         LEFT JOIN vehicles v ON v.vehicle_group_id = vg.id
            AND v.status = 'active'
            AND NOT EXISTS (
                SELECT 1
                FROM order_shipments os
                JOIN v_shipment_current sc ON sc.shipment_id = os.id
                WHERE sc.vehicle_id = v.id
                  AND os.status = ANY($1::text[])
            )
            AND NOT EXISTS (
                SELECT 1
                FROM maintenance_records mr
                WHERE mr.vehicle_id = v.id
                  AND mr.status IN ('open', 'pending_verification')
            )
            AND NOT EXISTS (
                SELECT 1
                FROM order_shipments os_driver
                JOIN v_shipment_current sc_driver ON sc_driver.shipment_id = os_driver.id
                WHERE sc_driver.owner_driver_id = v.assigned_driver_id
                  AND os_driver.status = ANY($1::text[])
            )
            AND NOT EXISTS (
                SELECT 1
                FROM maintenance_records mr_driver
                WHERE mr_driver.performed_by = v.assigned_driver_id
                  AND mr_driver.vehicle_id <> v.id
                  AND mr_driver.status IN ('open', 'pending_verification')
            )
         LEFT JOIN profiles p ON p.id = v.assigned_driver_id
         GROUP BY vg.id
         ORDER BY vg.name ASC, vg.id ASC`,
        [ACTIVE_STATUSES],
    );
    return result.rows;
};

//Tìm tài xế theo tên
const findDriverByName = async (client, driverName) => {
    if (!driverName) return null;
    const result = await client.query(
        `SELECT
            d.profile_id AS id,
            p.full_name,
            p.phone,
            d.vehicle_id,
            v.plate_number,
            v.vehicle_group_id,
            v.status AS vehicle_status
         FROM drivers d
         JOIN profiles p ON p.id = d.profile_id
         JOIN roles r ON r.id = p.role_id
         LEFT JOIN vehicles v ON v.id = d.vehicle_id
         WHERE r.name = 'driver' AND LOWER(p.full_name) = LOWER($1)
         LIMIT 1`,
        [driverName],
    );
    return result.rows[0] ?? null;
};

//Tạo tài xế dựa trên import 
const createImportedDriverAccount = async (client, driverName) => {
    const roleResult = await client.query(
        `SELECT id FROM roles WHERE name = 'driver' LIMIT 1`,
    );
    const roleId = roleResult.rows[0]?.id;
    if (!roleId) throw new Error('Không tìm thấy vai trò tài xế trong hệ thống');

    const baseEmail = String(driverName || 'driver')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '.')
        .replace(/^\.+|\.+$/g, '') || 'driver';
    const email = `imported.${baseEmail}.${Date.now()}.${Math.floor(Math.random() * 10000)}@local.invalid`;

    const passwordHash = await bcrypt.hash(`Imported@${Date.now()}`, 10);
    const accountResult = await client.query(
        `INSERT INTO accounts (email, password_hash, role_id, is_active)
         VALUES ($1, $2, $3, TRUE)
         RETURNING id`,
        [email, passwordHash, roleId],
    );
    const accountId = accountResult.rows[0].id;

    await client.query(
        `INSERT INTO profiles (id, full_name, role_id)
         VALUES ($1, $2, $3)`,
        [accountId, driverName || `Tài xế ${accountId}`, roleId],
    );

    await client.query(
        `INSERT INTO drivers (profile_id, license_number, hire_date)
         VALUES ($1, $2, CURRENT_DATE)`,
        [accountId, `IMPORT-${accountId}`],
    );

    return accountId;
};

//Tìm hoặc tạo tài xế
const findOrCreateDriverWithVehicle = async (client, { driverName, plateNumber, vehicleGroupId }) => {
    const name = String(driverName || '').trim();
    const plate = String(plateNumber || '').trim().toUpperCase();
    if (!name && !plate) return null;

    let vehicle = null;
    if (plate) {
        const vehicleResult = await client.query(
            `INSERT INTO vehicles (plate_number, vehicle_group_id, status)
             VALUES ($1, $2, 'active')
             ON CONFLICT (plate_number) DO UPDATE
             SET vehicle_group_id = COALESCE(vehicles.vehicle_group_id, EXCLUDED.vehicle_group_id),
                 updated_at = NOW()
             RETURNING id, plate_number, vehicle_group_id, assigned_driver_id, status`,
            [plate, vehicleGroupId],
        );
        vehicle = vehicleResult.rows[0];
    }

    const driverByPlate = plate ? await getDriverByPlate(client, plate) : null;
    if (driverByPlate?.id) return driverByPlate;

    let driver = name ? await findDriverByName(client, name) : null;
    let driverId = driver?.id;
    if (!driverId && name) {
        driverId = await createImportedDriverAccount(client, name);
    }

    if (!driverId) return null;

    if (vehicle?.id) {
        await client.query(
            `UPDATE drivers
             SET vehicle_id = $2
             WHERE profile_id = $1 AND (vehicle_id IS NULL OR vehicle_id = $2)`,
            [driverId, vehicle.id],
        );
        await client.query(
            `UPDATE vehicles
             SET assigned_driver_id = $2, updated_at = NOW()
             WHERE id = $1 AND (assigned_driver_id IS NULL OR assigned_driver_id = $2)`,
            [vehicle.id, driverId],
        );
    }

    return getDriverById(client, driverId);
};

//Nếu sdt tồn tại trả về custormer, nếu ko tồn tại, tạo thêm customer 
const findOrCreateCustomer = async (client, customerName, customerPhone, normalizePhone, safeTrim) => {
    const normalizedPhone = normalizePhone(customerPhone);
    const normalizedName = safeTrim(customerName);

    if (normalizedPhone) {
        const existingCustomer = await client.query(// Nếu có khách hàng tìm bởi số điện thoại
            `SELECT id, full_name, phone 
             FROM customers
             WHERE phone = $1
             LIMIT 1`,
            [normalizedPhone],//Query tìm khách hàng 
        );
        if (existingCustomer.rows[0]) return existingCustomer.rows[0];//Thì return khách hàng

    }else {
        return null;
    }

    const createdCustomer = await client.query(
        `INSERT INTO customers (customer_type, full_name, phone)
        VALUES('individual', $1, $2)
        RETURNING id, full_name, phone`,
        [normalizedName || normalizedPhone, normalizedPhone],
    );
    return createdCustomer.rows[0];
};

// phương thức thêm điểm đi và điểm dừng
const normalizeStopList = (stops) => {
    const source = Array.isArray(stops) ? stops : (stops ? [stops] : []);
    return source.map((stop) => String(stop ?? '').trim()).filter(Boolean);
};

const insertStops = async (client, shipmentId, pickupStops, deliveryStops, contactName, contactPhone, notes) => {
    const pickups = normalizeStopList(pickupStops);
    const deliveries = normalizeStopList(deliveryStops);

    if (pickups.length === 0 || deliveries.length === 0) {
        throw new Error('Thiếu điểm lấy hàng hoặc điểm giao hàng');
    }

    let stopIndex = 1;
    for (const address of pickups) {
        await client.query(
            `INSERT INTO trip_stops(shipment_id, stop_index, stop_type, address, contact_name, contact_phone, notes)
             VALUES ($1, $2, 'pickup', $3, $4, $5, $6)`,
            [shipmentId, stopIndex, address, contactName || null, contactPhone || null, notes || null],
        );
        stopIndex += 1;
    }

    for (const address of deliveries) {
        await client.query(
            `INSERT INTO trip_stops(shipment_id, stop_index, stop_type, address, contact_name, contact_phone, notes)
             VALUES ($1, $2, 'delivery', $3, $4, $5, $6)`,
            [shipmentId, stopIndex, address, contactName || null, contactPhone || null, notes || null],
        );
        stopIndex += 1;
    }
};

//Phương thức tạo order với 1 chuyến(cũ)
const createOrderWithShipment = async ({
    client,
    userId,
    orderData,
    shipmentData,
    assignmentData,
}) => {
    //Ghi vào order
    const orderResult = await client.query(
        `INSERT INTO orders
            (customer_id, created_by, cargo_name, cargo_weight_kg, payment_type, total_estimated_price, notes, prepaid_amount, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, NOW()))
         RETURNING *`,
        [
            orderData.customer_id,
            userId,
            orderData.cargo_name,
            orderData.cargo_weight_kg,
            orderData.payment_type || 'cash',
            orderData.estimated_price || 0,
            orderData.notes,
            orderData.prepaid_amount || 0,
            orderData.created_at || null,
        ],
    );

    const order = orderResult.rows[0];
    // Ghi sổ tiền khách ứng trước (nếu có)
    await financialLedgerRepository.insertTransaction(client, {
        eventType: 'prepaid_received',
        debitAccount: '1121', creditAccount: '131',
        amount: Number(orderData.prepaid_amount || 0),
        description: `Khách ứng trước — đơn #${order.id}`,
        refType: 'order', refId: order.id, actorId: userId,
    });
    const shipmentResult = await client.query(
        `INSERT INTO order_shipments
            (order_id, shipment_index, cargo_name, cargo_weight_kg, vehicle_group_id, estimated_price, estimated_distance_km, arrived_at, status, notes, created_at, claimed_at)
         VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, NOW()), CASE WHEN $8 = 'claimed' THEN NOW() ELSE NULL END)
         RETURNING *`,
        [
            order.id,
            shipmentData.cargo_name || order.cargo_name,
            shipmentData.cargo_weight_kg,
            shipmentData.vehicle_group_id || null,
            shipmentData.estimated_price,
            shipmentData.estimated_distance_km,
            shipmentData.arrived_at || null,
            shipmentData.status,
            shipmentData.notes,
            shipmentData.created_at || null,
        ],
    );

    await insertStops(
        client,
        shipmentResult.rows[0].id,
        shipmentData.pickup_addresses ?? shipmentData.pickup_address,
        shipmentData.delivery_addresses ?? shipmentData.delivery_address,
        orderData.customer_name,
        orderData.customer_phone,
    );

    if (shipmentData.owner_driver_id || shipmentData.vehicle_id) {
        await insertAssignmentHistory(client, {
            shipmentId: shipmentResult.rows[0].id,
            toDriverId: shipmentData.owner_driver_id || null,
            toVehicleId: shipmentData.vehicle_id || null,
            changedBy: assignmentData?.assigned_by ?? userId,
            changeReason: 'initial_assign',
        });
    }

    return {
        order: {
            ...order,
            estimated_price: order.total_estimated_price,
            pickup_address: shipmentData.pickup_address,
            delivery_address: shipmentData.delivery_address,
            status: shipmentData.status,
            estimated_distance_km: shipmentData.estimated_distance_km,
            arrived_at: shipmentData.arrived_at,
            plate_number: shipmentData.plate_number,
            driver_name: null,
        },
        shipment: shipmentResult.rows[0],
    };
};

//Phương thức tạo order với 1 hoặc nhiều chuyến
const createOrderWithMultipleShipments = async ({
    client,
    userId,
    orderData,
    shipmentsDataArray,
}) => {
    const totalEstimatedPrice = shipmentsDataArray.reduce((sum, shipment) => sum + (shipment.estimated_price || 0), 0);

    //Tạo và lấy dữ liệu hàng order vừa ghi
    const orderResult = await client.query(
        `INSERT INTO orders
            (customer_id, created_by, cargo_name, cargo_weight_kg, payment_type, total_estimated_price, notes, prepaid_amount, created_at, partner_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, NOW()), $10)
         RETURNING *`,
        [
            orderData.customer_id,
            userId,
            orderData.cargo_name,
            orderData.cargo_weight_kg,
            orderData.payment_type || 'cash',
            totalEstimatedPrice,
            orderData.notes,
            orderData.prepaid_amount || 0,
            orderData.created_at || null,
            orderData.partner_name || null,
        ],
    );


    const order = orderResult.rows[0]; //Lấy order

    // Ghi sổ tiền khách ứng trước (nếu có)
    await financialLedgerRepository.insertTransaction(client, {
        eventType: 'prepaid_received',
        debitAccount: '1121', creditAccount: '131',
        amount: Number(orderData.prepaid_amount || 0),
        description: `Khách ứng trước — đơn #${order.id}`,
        refType: 'order', refId: order.id, actorId: userId,
    });

    const createdShipments = [];

    for (let i = 0; i < shipmentsDataArray.length; i++) {//Lặp qua mỗi object trong mảng shipmentsDataArray
        const shipmentData = shipmentsDataArray[i];//Lấy object 

        const shipmentResult = await client.query(// ghi 1 lần và lấy bản ghi ordershipment vừa tạo
            `INSERT INTO order_shipments
                (order_id, shipment_index, cargo_name, cargo_weight_kg, vehicle_group_id, estimated_price, estimated_distance_km, arrived_at, status, notes, created_at, claimed_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11, NOW()), CASE WHEN $9 = 'claimed' THEN NOW() ELSE NULL END)
             RETURNING *`,
            [
                order.id,
                i + 1,
                shipmentData.cargo_name || order.cargo_name,
                shipmentData.cargo_weight_kg,
                shipmentData.vehicle_group_id || null,
                shipmentData.estimated_price,
                shipmentData.estimated_distance_km,
                shipmentData.arrived_at || null,
                shipmentData.status,
                shipmentData.notes,
                shipmentData.created_at || null,
            ],
        );

        const shipment = shipmentResult.rows[0]; //hàng 1 của order_shipment
        createdShipments.push(shipment);

        const assignmentData = shipmentData.assignmentData; //Lấy giá trị assignment Data trong object shipment Data

        if (shipmentData.owner_driver_id || shipmentData.vehicle_id) {
            await insertAssignmentHistory(client, {
                shipmentId: shipment.id,
                toDriverId: shipmentData.owner_driver_id || null,
                toVehicleId: shipmentData.vehicle_id || null,
                changedBy: assignmentData?.assigned_by ?? userId,
                changeReason: 'initial_assign',
            });
        }


        await insertStops(//Chèn vào bảng trip stop 
            client,
            shipment.id,
            shipmentData.pickup_addresses ?? shipmentData.pickup_address,
            shipmentData.delivery_addresses ?? shipmentData.delivery_address,
            orderData.customer_name,
            orderData.customer_phone,
            shipmentData.notes
        );
    }

    return {
        order: {
            ...order,
            estimated_price: order.total_estimated_price,
            pickup_address: shipmentsDataArray[0]?.pickup_address,
            delivery_address: shipmentsDataArray[0]?.delivery_address,
            status: shipmentsDataArray[0]?.status,
            estimated_distance_km: shipmentsDataArray[0]?.estimated_distance_km,
            arrived_at: shipmentsDataArray[0]?.arrived_at,
            plate_number: shipmentsDataArray[0]?.plate_number,
            driver_name: null,
        },
        shipments: createdShipments,
    };
};

//Phương thức tạo order dựa trên dữ liệu được import 
const importOrderWithShipment = async ({ client, userId, orderData, shipmentData }) => {
    return createOrderWithShipment({
        client,
        userId,
        orderData: { ...orderData, payment_type: orderData.payment_type || 'cash', created_at: orderData.created_at || null },
        shipmentData: {
            ...shipmentData,
            cargo_name: orderData.cargo_name,
            vehicle_group_id: shipmentData.vehicle_group_id,
            owner_driver_id: shipmentData.owner_driver_id || null,
            vehicle_id: shipmentData.vehicle_id || null,
            estimated_distance_km: shipmentData.estimated_distance_km ?? null,
            arrived_at: shipmentData.arrived_at || null,
            plate_number: shipmentData.plate_number || null,
            status: shipmentData.status || 'available',
            created_at: shipmentData.created_at || null,
        },
    });
};

//Phương thức cập nhât order
const updateOrder = async (orderId, payload, normalizeNumber, safeTrim, normalizePhone, shipmentsDataArray) => {
    const {
        customer_name,
        customer_phone,
        cargo_name,
        cargo_weight_kg,
        pickup_address,
        delivery_address,
        estimated_price,
        notes,
        plate,
        driver_id,
        vehicle_id,
        distance,
        arrived_at,
        date,
        partner_name,
        prepaid_amount,
    } = payload;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const currentShipmentsRes = await client.query(
            `SELECT status FROM order_shipments WHERE order_id = $1`,
            [orderId],
        );
        const currentShipments = currentShipmentsRes.rows;
        if (
            currentShipments.length > 0
            && currentShipments.every((s) => ['completed', 'cancelled'].includes(String(s.status).toLowerCase()))
        ) {
            throw new Error('Không thể chỉnh sửa đơn đã hoàn tất hoặc đã hủy');
        }

        const customer = (customer_name || customer_phone)
            ? await findOrCreateCustomer(client, customer_name, customer_phone, normalizePhone, safeTrim)
            : null;
        const totalEstimatedPrice = shipmentsDataArray ? shipmentsDataArray.reduce((sum, shipment) => sum + (shipment.estimated_price || 0), 0) : null;
        const arrivedAt = safeTrim(arrived_at || date) || null;
        const orderNotes = notes !== undefined ? safeTrim(notes) : '';

        const orderResult = await client.query(
            `UPDATE orders
             SET customer_id = COALESCE($6, customer_id),
                 cargo_name = COALESCE(NULLIF($2, ''), cargo_name),
                 cargo_weight_kg = COALESCE($3, cargo_weight_kg),
                 total_estimated_price = COALESCE($4, total_estimated_price),
                 notes = $5,
                 partner_name = COALESCE($7, partner_name),
                 prepaid_amount = COALESCE($8, prepaid_amount),
                 updated_at = NOW()
             WHERE id = $1
             RETURNING *`,
            [
                orderId,
                safeTrim(cargo_name),
                normalizeNumber(cargo_weight_kg),
                totalEstimatedPrice !== null ? totalEstimatedPrice : undefined,
                orderNotes,
                customer?.id ?? null,
                partner_name !== undefined ? partner_name : null,
                prepaid_amount,
            ],
        );

        if (!orderResult.rows[0]) {
            await client.query('ROLLBACK');
            return null;
        }

        if (shipmentsDataArray && shipmentsDataArray.length > 0) {
            const existingShipmentsRes = await client.query(
                `SELECT os.id, os.status, sc.owner_driver_id, sc.vehicle_id
                 FROM order_shipments os
                 LEFT JOIN v_shipment_current sc ON sc.shipment_id = os.id
                 WHERE os.order_id = $1
                 ORDER BY os.shipment_index ASC`,
                [orderId],
            );
            const existingShipments = existingShipmentsRes.rows;

            for (let i = 0; i < Math.max(existingShipments.length, shipmentsDataArray.length); i++) {
                const existing = existingShipments[i];
                const shipmentData = shipmentsDataArray[i];

                if (existing && shipmentData) {
                    if (['completed', 'cancelled'].includes(String(existing.status).toLowerCase())) {
                        throw new Error(`Không thể chỉnh sửa chuyến đã ở trạng thái ${existing.status}`);
                    }

                    if (
                        existing.status !== SHIPMENT_STATUS.AVAILABLE
                        && (
                            Number(existing.owner_driver_id || 0) !== Number(shipmentData.owner_driver_id || 0)
                            || Number(existing.vehicle_id || 0) !== Number(shipmentData.vehicle_id || 0)
                        )
                    ) {
                        throw new Error(`Không thể đổi tài xế hoặc xe của chuyến đang ở trạng thái ${existing.status}`);
                    }

                    const nextStatus = shipmentData.owner_driver_id && shipmentData.vehicle_id && existing.status === SHIPMENT_STATUS.AVAILABLE
                        ? SHIPMENT_STATUS.CLAIMED
                        : existing.status;

                    await client.query(
                        `UPDATE order_shipments
                         SET estimated_price = COALESCE($2, estimated_price),
                             estimated_distance_km = COALESCE($3, estimated_distance_km),
                             arrived_at = COALESCE($4, arrived_at),
                             actual_price = COALESCE($5, actual_price),
                             vehicle_group_id = COALESCE($6, vehicle_group_id),
                             status = $7,
                             claimed_at = CASE WHEN $7 = 'claimed' AND claimed_at IS NULL THEN NOW() ELSE claimed_at END,
                             updated_at = NOW()
                         WHERE id = $1`,
                        [
                            existing.id,
                            shipmentData.estimated_price,
                            shipmentData.estimated_distance_km,
                            arrivedAt,
                            shipmentData.actual_price ?? null,
                            shipmentData.vehicle_group_id ?? null,
                            nextStatus,
                        ],
                    );

                    if (
                        Number(existing.owner_driver_id || 0) !== Number(shipmentData.owner_driver_id || 0)
                        || Number(existing.vehicle_id || 0) !== Number(shipmentData.vehicle_id || 0)
                    ) {
                        await insertAssignmentHistory(client, {
                            shipmentId: existing.id,
                            fromDriverId: existing.owner_driver_id || null,
                            fromVehicleId: existing.vehicle_id || null,
                            toDriverId: shipmentData.owner_driver_id || null,
                            toVehicleId: shipmentData.vehicle_id || null,
                            changedBy: shipmentData.assignmentData?.assigned_by ?? null,
                            changeReason: 'coordinator_swap',
                        });
                    }

                    if (
                        shipmentData.pickup_addresses
                        || shipmentData.pickup_address
                        || shipmentData.delivery_addresses
                        || shipmentData.delivery_address
                    ) {
                        await client.query(`DELETE FROM trip_stops WHERE shipment_id = $1`, [existing.id]);
                        await insertStops(
                            client,
                            existing.id,
                            shipmentData.pickup_addresses ?? shipmentData.pickup_address,
                            shipmentData.delivery_addresses ?? shipmentData.delivery_address,
                            customer_name,
                            customer_phone,
                            orderNotes
                        );
                    }
                } else if (!existing && shipmentData) {
                    const shipmentResult = await client.query(
                        `INSERT INTO order_shipments
                            (order_id, shipment_index, cargo_name, cargo_weight_kg, vehicle_group_id, estimated_price, estimated_distance_km, arrived_at, status, notes, created_at, claimed_at)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), CASE WHEN $9 = 'claimed' THEN NOW() ELSE NULL END)
                         RETURNING id`,
                        [
                            orderId,
                            i + 1,
                            orderResult.rows[0].cargo_name,
                            orderResult.rows[0].cargo_weight_kg,
                            shipmentData.vehicle_group_id || null,
                            shipmentData.estimated_price,
                            shipmentData.estimated_distance_km,
                            arrivedAt,
                            shipmentData.status || SHIPMENT_STATUS.AVAILABLE,
                            orderNotes,
                        ],
                    );
                    const newShipmentId = shipmentResult.rows[0].id;
                    if (shipmentData.owner_driver_id || shipmentData.vehicle_id) {
                        await insertAssignmentHistory(client, {
                            shipmentId: newShipmentId,
                            toDriverId: shipmentData.owner_driver_id || null,
                            toVehicleId: shipmentData.vehicle_id || null,
                            changedBy: shipmentData.assignmentData?.assigned_by ?? null,
                            changeReason: 'initial_assign',
                        });
                    }
                    await insertStops(
                        client,
                        newShipmentId,
                        shipmentData.pickup_addresses ?? shipmentData.pickup_address,
                        shipmentData.delivery_addresses ?? shipmentData.delivery_address,
                        customer_name,
                        customer_phone,
                        orderNotes
                    );
                } else if (existing && !shipmentData) {
                    if (existing.status !== 'available') {
                        throw new Error(`Không thể xóa chuyến xe đã được xử lý (trạng thái: ${existing.status})`);
                    }
                    await client.query(`DELETE FROM trip_stops WHERE shipment_id = $1`, [existing.id]);
                    await client.query(`DELETE FROM order_shipments WHERE id = $1`, [existing.id]);
                }
            }
        }

        await client.query('COMMIT');
        const updated = await pool.query(`${selectOrderProjection} WHERE o.id = $1`, [orderId]);
        return updated.rows[0] ?? null;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

//Phương thức hủy order 
const cancelOrder = async (orderId, reason = 'Coordinator cancelled order') => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const shipmentResult = await client.query(
            `SELECT id, status
             FROM order_shipments
             WHERE order_id = $1
             ORDER BY shipment_index ASC
             LIMIT 1
             FOR UPDATE`,
            [orderId],
        );
        const shipment = shipmentResult.rows[0];
        if (!shipment) {
            await client.query('ROLLBACK');
            return null;
        }

        if (['completed', 'cancelled'].includes(String(shipment.status).toLowerCase())) {
            throw new Error('Không thể hủy đơn đã hoàn tất hoặc đã hủy');
        }

        await client.query(
            `UPDATE order_shipments
             SET status = 'cancelled', cancel_reason = $2, cancelled_at = NOW(), updated_at = NOW()
             WHERE id = $1`,
            [shipment.id, reason],
        );
        const { rows: [cancelledOrder] } = await client.query(
            `UPDATE orders
             SET derived_status = 'cancelled', updated_at = NOW()
             WHERE id = $1
             RETURNING prepaid_amount`,
            [orderId],
        );

        // Đơn đã nhận tiền ứng trước → ghi bút toán hoàn tiền (đảo prepaid_received)
        // để tiền ứng không "mất tích" khỏi sổ khi đơn bị hủy.
        const prepaid = Number(cancelledOrder?.prepaid_amount || 0);
        if (prepaid > 0) {
            await financialLedgerRepository.insertTransaction(client, {
                eventType: 'prepaid_refunded',
                debitAccount: '131', creditAccount: '1121',
                amount: prepaid,
                description: `Hoàn tiền khách ứng trước do hủy đơn #${orderId} — ${reason}`,
                refType: 'order', refId: orderId, actorId: null,
            });
        }

        await client.query('COMMIT');
        const updated = await pool.query(`${selectOrderProjection} WHERE o.id = $1`, [orderId]);
        return updated.rows[0] ?? null;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

//Gửi phương thức ra ngoài 
module.exports = {
    listOrders,
    getDriverById,
    getDriverByPlate,
    getVehicleByPlate,
    getVehicleGroupById,
    listCoordinatorVehicleGroups,
    findOrCreateDriverWithVehicle,
    getDefaultVehicleGroupId,
    findOrCreateCustomer,
    validateVehicleShipmentAssignment,
    createOrderWithShipment,
    createOrderWithMultipleShipments,
    importOrderWithShipment,
    updateOrder,
    cancelOrder,
};
