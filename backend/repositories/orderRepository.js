const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { ASSIGNMENT_TYPE } = require('../constants/tripConstants');


//Query to list order specific detail
const selectOrderProjection = `
    SELECT
        o.id,
        o.customer_id,
        o.cargo_name,
        o.cargo_weight_kg,
        o.payment_type,
        o.total_estimated_price,
        o.total_estimated_price AS estimated_price,
        o.derived_status,
        os.status,
        o.notes,
        o.created_at,
        o.updated_at,
        os.id AS shipment_id,
        os.completed_at,
        os.vehicle_group_id,
        os.owner_driver_id,
        os.estimated_distance_km,
        os.delivery_at,
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

    LEFT JOIN profiles d ON d.id = os.owner_driver_id
    LEFT JOIN vehicles v ON v.id = os.vehicle_id

    LEFT JOIN LATERAL (
        SELECT json_agg(
            json_build_object(
                'vehicle_group_id', s_all.vehicle_group_id,
                'plate', v_all.plate_number,
                'distance', s_all.estimated_distance_km
            ) ORDER BY s_all.shipment_index ASC
        ) AS trips
        FROM order_shipments s_all
        LEFT JOIN vehicles v_all ON v_all.id = s_all.vehicle_id
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
            conditions.push(`LOWER(os.status) = ANY($${params.length})`);
        }
    }

    if (dateFrom) {
        params.push(dateFrom);
        conditions.push(`os.arrived_at::date >= $${params.length}::date`);
    }

    if (dateTo) {
        params.push(dateTo);
        conditions.push(`os.arrived_at::date <= $${params.length}::date`);
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
                        'status', v.status
                    ) ORDER BY v.plate_number
                ) FILTER (WHERE v.id IS NOT NULL),
                '[]'::json
            ) AS vehicles

         FROM vehicle_groups vg
         LEFT JOIN vehicles v ON v.vehicle_group_id = vg.id AND v.status = 'active'
         GROUP BY vg.id
         ORDER BY vg.name ASC, vg.id ASC`,
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
const insertStops = async (client, shipmentId, pickupAddress, deliveryAddress, contactName, contactPhone, notes) => {
    await client.query(
        `INSERT INTO trip_stops(shipment_id, stop_index, stop_type, address, contact_name, contact_phone, notes)
         VALUES
            ($1, 1, 'pickup', $2, $4, $5, $6),
            ($1, 2, 'delivery', $3, $4, $5, $6)`,
        [shipmentId, pickupAddress, deliveryAddress, contactName || null, contactPhone || null, notes || null],
    );
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
            (customer_id, created_by, cargo_name, cargo_weight_kg, payment_type, total_estimated_price, notes, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, NOW()))
         RETURNING *`,
        [
            orderData.customer_id,
            userId,
            orderData.cargo_name,
            orderData.cargo_weight_kg,
            orderData.payment_type || 'cash',
            orderData.estimated_price || 0,
            orderData.notes,
            orderData.created_at || null,
        ],
    );

    const order = orderResult.rows[0]; 
    const shipmentResult = await client.query(
        `INSERT INTO order_shipments
            (order_id, shipment_index, vehicle_group_id, owner_driver_id, vehicle_id, cargo_name, cargo_weight_kg, estimated_price, estimated_distance_km, arrived_at, status, notes, created_at)
         VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12, NOW()))
         RETURNING *`,
        [
            order.id,
            shipmentData.vehicle_group_id,
            shipmentData.owner_driver_id,
            shipmentData.vehicle_id || null,
            shipmentData.cargo_name || order.cargo_name,
            shipmentData.cargo_weight_kg,
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
        shipmentData.pickup_address,
        shipmentData.delivery_address,
        orderData.customer_name,
        orderData.customer_phone,
    );

    if (assignmentData?.driver_id && assignmentData?.vehicle_id) {
        await client.query(
            `INSERT INTO shipment_assignments
                (shipment_id, driver_id, vehicle_id, assignment_type, assigned_by, assigned_at)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [
                shipmentResult.rows[0].id,
                assignmentData.driver_id,
                assignmentData.vehicle_id,
                assignmentData.assignment_type ?? ASSIGNMENT_TYPE.COORDINATOR_ASSIGN,
                assignmentData.assigned_by ?? null,
            ],
        );
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
            (customer_id, created_by, cargo_name, cargo_weight_kg, payment_type, total_estimated_price, notes, created_at, partner_name, total_actual_price)
         VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, NOW()), $9, $10)
         RETURNING *`,
        [
            orderData.customer_id,
            userId,
            orderData.cargo_name,
            orderData.cargo_weight_kg,
            orderData.payment_type || 'cash',
            totalEstimatedPrice,
            orderData.notes,
            orderData.created_at || null,
            orderData.partner_name || null,
            orderData.total_actual_price || 0,
        ],
    );

    
    const order = orderResult.rows[0]; //Lấy order 

    const createdShipments = [];

    for (let i = 0; i < shipmentsDataArray.length; i++) {//Lặp qua mỗi object trong mảng shipmentsDataArray
        const shipmentData = shipmentsDataArray[i];//Lấy object 

        const shipmentResult = await client.query(// ghi 1 lần và lấy bản ghi ordershipment vừa tạo 
            `INSERT INTO order_shipments
                (order_id, shipment_index, vehicle_group_id, owner_driver_id, vehicle_id, cargo_name, cargo_weight_kg, estimated_price, estimated_distance_km, arrived_at, status, notes, created_at, actual_price)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, COALESCE($13, NOW()), $14)
             RETURNING *`,
            [
                order.id,
                i + 1,
                shipmentData.vehicle_group_id,
                shipmentData.owner_driver_id,
                shipmentData.vehicle_id || null,
                shipmentData.cargo_name || order.cargo_name,
                shipmentData.cargo_weight_kg,
                shipmentData.estimated_price,
                shipmentData.estimated_distance_km,
                shipmentData.arrived_at || null,
                shipmentData.status,
                shipmentData.notes,
                shipmentData.created_at || null,
                orderData.total_actual_price || 0,
            ],
        );

        const shipment = shipmentResult.rows[0]; //hàng 1 của order_shipment 

        const assignmentData = shipmentData.assignmentData; //Lấy giá trị assignment Data trong object shipment Data

        if (assignmentData?.driver_id && assignmentData?.vehicle_id) { //Kiểm tra null
            await client.query(//Chèm vào shipment_assignment 
                `INSERT INTO shipment_assignments
                    (shipment_id, driver_id, vehicle_id, assignment_type, assigned_by, assigned_at)
                 VALUES ($1, $2, $3, $4, $5, NOW())`,
                [
                    shipment.id,
                    assignmentData.driver_id,
                    assignmentData.vehicle_id,
                    assignmentData.assignment_type ?? ASSIGNMENT_TYPE.COORDINATOR_ASSIGN,
                    assignmentData.assigned_by ?? null
                ],
            );
        }

        
        await insertStops(//Chèn vào bảng trip stop 
            client,
            shipment.id,
            shipmentData.pickup_address,
            shipmentData.delivery_address,
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
            delivery_at: shipmentsDataArray[0]?.delivery_at,
            plate_number: shipmentsDataArray[0]?.plate_number,
            driver_name: null,
        },
        shipments: createdShipments,
    };
};

//Phương thức tạo order dựa trên dữ liệu được 
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
            delivery_at: shipmentData.delivery_at || null,
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
        vehicle_group_id,
        distance,
        delivery_at,
        date,
        partner_name,
        total_actual_price,
    } = payload;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const customer = (customer_name || customer_phone)
            ? await findOrCreateCustomer(client, customer_name, customer_phone, normalizePhone, safeTrim)
            : null;
        const totalEstimatedPrice = shipmentsDataArray ? shipmentsDataArray.reduce((sum, shipment) => sum + (shipment.estimated_price || 0), 0) : null;
        const deliveryAt = safeTrim(delivery_at || date) || null;
        const orderNotes = notes !== undefined ? safeTrim(notes) : '';

        const orderResult = await client.query(
            `UPDATE orders
             SET customer_id = COALESCE($6, customer_id),
                 cargo_name = COALESCE(NULLIF($2, ''), cargo_name),
                 cargo_weight_kg = COALESCE($3, cargo_weight_kg),
                 total_estimated_price = COALESCE($4, total_estimated_price),
                 notes = $5,
                 partner_name = COALESCE($7, partner_name),
                 total_actual_price = COALESCE($8, total_actual_price),
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
                total_actual_price !== undefined ? total_actual_price : 0,
            ],
        );

        if (!orderResult.rows[0]) {
            await client.query('ROLLBACK');
            return null;
        }

        if (shipmentsDataArray && shipmentsDataArray.length > 0) {
            const existingShipmentsRes = await client.query(
                `SELECT id, status FROM order_shipments WHERE order_id = $1 ORDER BY shipment_index ASC`,
                [orderId],
            );
            const existingShipments = existingShipmentsRes.rows;

            for (let i = 0; i < Math.max(existingShipments.length, shipmentsDataArray.length); i++) {
                const existing = existingShipments[i];
                const shipmentData = shipmentsDataArray[i];

                if (existing && shipmentData) {
                    await client.query(
                        `UPDATE order_shipments
                         SET vehicle_group_id = COALESCE($2, vehicle_group_id),
                             owner_driver_id = $3,
                             vehicle_id = COALESCE($4, vehicle_id),
                             estimated_price = COALESCE($5, estimated_price),
                             estimated_distance_km = COALESCE($6, estimated_distance_km),
                             delivery_at = COALESCE($7, delivery_at),
                             actual_price = COALESCE($8, actual_price),
                             updated_at = NOW()
                         WHERE id = $1`,
                        [
                            existing.id,
                            shipmentData.vehicle_group_id,
                            shipmentData.owner_driver_id,
                            shipmentData.vehicle_id,
                            shipmentData.estimated_price,
                            shipmentData.estimated_distance_km,
                            deliveryAt,
                            total_actual_price !== undefined ? total_actual_price : 0,
                        ],
                    );

                    if (safeTrim(shipmentData.pickup_address)) {
                        await client.query(
                            `UPDATE trip_stops SET address = $2 WHERE shipment_id = $1 AND stop_type = 'pickup'`,
                            [existing.id, safeTrim(shipmentData.pickup_address)],
                        );
                    }
                    if (safeTrim(shipmentData.delivery_address)) {
                        await client.query(
                            `UPDATE trip_stops SET address = $2 WHERE shipment_id = $1 AND stop_type = 'delivery'`,
                            [existing.id, safeTrim(shipmentData.delivery_address)],
                        );
                    }
                } else if (!existing && shipmentData) {
                    const shipmentResult = await client.query(
                        `INSERT INTO order_shipments
                            (order_id, shipment_index, vehicle_group_id, owner_driver_id, vehicle_id, cargo_name, cargo_weight_kg, estimated_price, estimated_distance_km, delivery_at, status, notes, created_at)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'available', $11, NOW())
                         RETURNING id`,
                        [
                            orderId,
                            i + 1,
                            shipmentData.vehicle_group_id,
                            shipmentData.owner_driver_id,
                            shipmentData.vehicle_id,
                            orderResult.rows[0].cargo_name,
                            orderResult.rows[0].cargo_weight_kg,
                            shipmentData.estimated_price,
                            shipmentData.estimated_distance_km,
                            deliveryAt,
                            orderNotes,
                        ],
                    );
                    const newShipmentId = shipmentResult.rows[0].id;
                    await insertStops(
                        client,
                        newShipmentId,
                        safeTrim(shipmentData.pickup_address),
                        safeTrim(shipmentData.delivery_address),
                        customer_name,
                        customer_phone,
                        orderNotes
                    );
                } else if (existing && !shipmentData) {
                    if (existing.status !== 'available') {
                        throw new Error(`Không thể xóa chuyến xe đã được xử lý (trạng thái: ${existing.status})`);
                    }
                    await client.query(`DELETE FROM trip_stops WHERE shipment_id = $1`, [existing.id]);
                    await client.query(`DELETE FROM shipment_assignments WHERE shipment_id = $1`, [existing.id]);
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
        await client.query(
            `UPDATE orders
             SET derived_status = 'cancelled', updated_at = NOW()
             WHERE id = $1`,
            [orderId],
        );

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
    createOrderWithShipment,
    createOrderWithMultipleShipments,
    importOrderWithShipment,
    updateOrder,
    cancelOrder,
};
