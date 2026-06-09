const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { ASSIGNMENT_TYPE } = require('../constants/tripConstants');

const selectOrderProjection = `
    SELECT
        o.id,
        o.customer_id,
        o.cargo_name,
        o.cargo_weight_kg,
        o.payment_type,
        o.total_estimated_price,
        os.estimated_price AS estimated_price,
        o.derived_status,
        os.status,
        o.notes,
        o.created_at,
        o.updated_at,
        os.id AS shipment_id,
        os.completed_at,
        os.vehicle_group_id,
        os.owner_driver_id,
        pickup.address AS pickup_address,
        pickup.contact_name AS stop_contact_name,
        delivery.address AS delivery_address,
        c.full_name AS customer_name,
        c.phone AS customer_phone,
        d.full_name AS driver_name,
        v.plate_number AS plate_number,
        vg.price_per_km AS vehicle_group_price_per_km
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id

    LEFT JOIN order_shipments os ON os.order_id = o.id
     
    LEFT JOIN LATERAL (
        SELECT ts.address, ts.contact_name
        FROM trip_stops ts
        WHERE ts.shipment_id = os.id AND ts.stop_type = 'pickup'
        ORDER BY ts.stop_index ASC
        LIMIT 1
    ) pickup ON TRUE

    LEFT JOIN LATERAL (
        SELECT string_agg(ts.address, E'\n' ORDER BY ts.stop_index ASC) AS address
        FROM trip_stops ts
        WHERE ts.shipment_id = os.id AND ts.stop_type = 'delivery'
    ) delivery ON TRUE

    LEFT JOIN profiles d ON d.id = os.owner_driver_id
    LEFT JOIN vehicles v ON v.id = os.vehicle_id
    LEFT JOIN vehicle_groups vg ON vg.id = os.vehicle_group_id
`;

const listOrders = async () => {
    const result = await pool.query(`${selectOrderProjection} ORDER BY o.created_at DESC, os.shipment_index ASC`);
    return result.rows;
};

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

//If vehicle group id is not selected, to set default but fe set auto when choose driver
const getDefaultVehicleGroupId = async (client) => {
    const result = await client.query(
        `SELECT id FROM vehicle_groups ORDER BY id ASC LIMIT 1`,
    );
    return result.rows[0]?.id ?? null;
};

//Get driver Infor if have plate 
const getDriverByPlate = async (client, plateNumber) => {
    if (!plateNumber) return null;
    const result = await client.query(
        `SELECT
            d.profile_id AS id,
            p.full_name,
            p.phone,
            v.id AS vehicle_id,
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

const getVehicleByPlate = async (client, plateNumber) => {
    if (!plateNumber) return null;
    const result = await client.query(
        `SELECT
            v.id AS vehicle_id,
            v.plate_number,
            v.vehicle_group_id,
            v.status AS vehicle_status,
            vg.price_per_km
         FROM vehicles v
         JOIN vehicle_groups vg ON vg.id = v.vehicle_group_id
         WHERE UPPER(v.plate_number) = UPPER($1)
         LIMIT 1`,
        [plateNumber],
    );
    return result.rows[0] ?? null;
};

const getVehicleGroupById = async (client, vehicleGroupId) => {
    if (!vehicleGroupId) return null;
    const result = await client.query(
        `SELECT id, name, price_per_km FROM vehicle_groups WHERE id = $1 LIMIT 1`,
        [vehicleGroupId],
    );
    return result.rows[0] ?? null;
};
//Find driver by name
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

const findOrCreateCustomer = async (client, customerName, customerPhone, normalizePhone, safeTrim) => {
    const normalizedPhone = normalizePhone(customerPhone);
    const normalizedName = safeTrim(customerName);

    if (normalizedPhone) {
        const existingCustomer = await client.query(
            `SELECT id, full_name, phone
             FROM customers
             WHERE phone = $1
             LIMIT 1`,
            [normalizedPhone],
        );
        if (existingCustomer.rows[0]) return existingCustomer.rows[0];
    } else if (normalizedName) {
        const existingCustomer = await client.query(
            `SELECT id, full_name, phone
             FROM customers
             WHERE LOWER(full_name) = LOWER($1)
               AND phone IS NULL
             LIMIT 1`,
            [normalizedName],
        );
        if (existingCustomer.rows[0]) return existingCustomer.rows[0];
    } else {
        return null;
    }

    const createdCustomer = await client.query(
        `INSERT INTO customers (customer_type, full_name, contact_person, phone)
         VALUES ('individual', $1, $1, $2)
         RETURNING id, full_name, phone`,
        [normalizedName || normalizedPhone, normalizedPhone || null],
    );
    return createdCustomer.rows[0];
};

const insertStops = async (client, shipmentId, pickupAddress, deliveryAddresses, contactName, contactPhone) => {
    const addresses = Array.isArray(deliveryAddresses) ? deliveryAddresses : [deliveryAddresses];
    const values = [[shipmentId, 1, 'pickup', pickupAddress, contactName || null, contactPhone || null]];
    addresses.filter(Boolean).forEach((address, index) => {
        values.push([shipmentId, index + 2, 'delivery', address, contactName || null, contactPhone || null]);
    });

    const placeholders = values.map((_, index) => {
        const base = index * 6;
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
    }).join(', ');

    await client.query(
        `INSERT INTO trip_stops (shipment_id, stop_index, stop_type, address, contact_name, contact_phone)
         VALUES ${placeholders}`,
        values.flat(),
    );
};

const createOrderWithShipment = async ({
    client,
    userId,
    orderData,
    shipmentData,
    assignmentData,
}) => {
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
            (order_id, shipment_index, vehicle_group_id, owner_driver_id, vehicle_id, cargo_name, cargo_weight_kg, estimated_price, status, notes, created_at)
         VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, NOW()))
         RETURNING *`,
        [
            order.id,
            shipmentData.vehicle_group_id,
            shipmentData.owner_driver_id,
            shipmentData.vehicle_id || null,
            shipmentData.cargo_name || order.cargo_name,
            shipmentData.cargo_weight_kg,
            shipmentData.estimated_price,
            shipmentData.status,
            shipmentData.notes,
            shipmentData.created_at || null,
        ],
    );

    await insertStops(
        client,
        shipmentResult.rows[0].id,
        shipmentData.pickup_address,
        shipmentData.delivery_addresses || shipmentData.delivery_address,
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
            driver_name: null,
            vehicle_group_id: shipmentData.vehicle_group_id,
            plate_number: shipmentData.plate_number || null,
        },
        shipment: shipmentResult.rows[0],
    };
};

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
            status: shipmentData.status || 'available',
            created_at: shipmentData.created_at || null,
        },
    });
};

const updateOrder = async (orderId, payload, normalizeNumber, safeTrim, normalizePhone) => {
    const {
        customer_name,
        customer_phone,
        cargo_name,
        cargo_weight_kg,
        pickup_address,
        delivery_address,
        delivery_addresses,
        distance,
        estimated_price,
        notes,
        plate,
        driver_id,
        vehicle_group_id,
    } = payload;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const customer = (customer_name || customer_phone)
            ? await findOrCreateCustomer(client, customer_name, customer_phone, normalizePhone, safeTrim)
            : null;
        const normalizedDriverId = driver_id ? Number(driver_id) : null;
        const driver = normalizedDriverId ? await getDriverById(client, normalizedDriverId) : null;
        const selectedVehicle = plate ? await getVehicleByPlate(client, plate) : null;

        if (driver_id && !driver) {
            throw new Error('Tài xế không tồn tại');
        }
        if (plate && !selectedVehicle) {
            throw new Error('BKS không tồn tại');
        }
        if (selectedVehicle?.vehicle_status && selectedVehicle.vehicle_status !== 'active') {
            throw new Error(`Xe ${plate} hiện không sẵn sàng cho điều phối (trạng thái: ${selectedVehicle.vehicle_status})`);
        }

        const finalVehicleGroupId = vehicle_group_id ? Number(vehicle_group_id) : selectedVehicle?.vehicle_group_id ?? driver?.vehicle_group_id ?? null;
        const finalVehicleId = selectedVehicle?.vehicle_id ?? driver?.vehicle_id ?? null;
        const finalNotes = [notes !== undefined ? safeTrim(notes) : null, distance ? `Quãng đường: ${safeTrim(distance)}` : ''].filter((item) => item !== null && item !== '').join(' | ');

        const orderResult = await client.query(
            `UPDATE orders
             SET customer_id = COALESCE($6, customer_id),
                 cargo_name = COALESCE(NULLIF($2, ''), cargo_name),
                 cargo_weight_kg = COALESCE($3, cargo_weight_kg),
                 total_estimated_price = COALESCE($4, total_estimated_price),
                 notes = $5,
                 updated_at = NOW()
             WHERE id = $1
             RETURNING *`,
            [
                orderId,
                safeTrim(cargo_name),
                normalizeNumber(cargo_weight_kg),
                normalizeNumber(estimated_price),
                finalNotes || null,
                customer?.id ?? null,
            ],
        );

        if (!orderResult.rows[0]) {
            await client.query('ROLLBACK');
            return null;
        }

        const shipmentResult = await client.query(
            `SELECT id FROM order_shipments WHERE order_id = $1 ORDER BY shipment_index ASC LIMIT 1`,
            [orderId],
        );
        const shipmentId = shipmentResult.rows[0]?.id;

        if (shipmentId) {
            await client.query(
                `UPDATE order_shipments
                 SET cargo_name = COALESCE(NULLIF($2, ''), cargo_name),
                     cargo_weight_kg = COALESCE($3, cargo_weight_kg),
                     estimated_price = COALESCE($4, estimated_price),
                     notes = COALESCE(NULLIF($5, ''), notes),
                     owner_driver_id = $6,
                     vehicle_id = COALESCE($7, vehicle_id),
                     vehicle_group_id = COALESCE($8, vehicle_group_id),
                     updated_at = NOW()
                 WHERE id = $1`,
                [
                    shipmentId,
                    safeTrim(cargo_name),
                    normalizeNumber(cargo_weight_kg),
                    normalizeNumber(estimated_price),
                    finalNotes || safeTrim(notes),
                    driver?.id ?? null,
                    finalVehicleId,
                    finalVehicleGroupId,
                ],
            );

            if (safeTrim(pickup_address)) {
                await client.query(
                    `UPDATE trip_stops SET address = $2 WHERE shipment_id = $1 AND stop_type = 'pickup'`,
                    [shipmentId, safeTrim(pickup_address)],
                );
            }
            const finalDeliveryAddresses = (Array.isArray(delivery_addresses) ? delivery_addresses : String(delivery_addresses || delivery_address || '').split(/\n|;/)).map(safeTrim).filter(Boolean);
            if (finalDeliveryAddresses.length > 0) {
                await client.query(`DELETE FROM trip_stops WHERE shipment_id = $1 AND stop_type = 'delivery'`, [shipmentId]);
                for (const [index, address] of finalDeliveryAddresses.entries()) {
                    await client.query(
                        `INSERT INTO trip_stops (shipment_id, stop_index, stop_type, address, contact_name, contact_phone)
                         VALUES ($1, $2, 'delivery', $3, $4, $5)`,
                        [shipmentId, index + 2, address, safeTrim(customer_name) || null, normalizePhone(customer_phone) || null],
                    );
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

module.exports = {
    listOrders,
    getDriverById,
    getDriverByPlate,
    getVehicleByPlate,
    getVehicleGroupById,
    findOrCreateDriverWithVehicle,
    getDefaultVehicleGroupId,
    findOrCreateCustomer,
    createOrderWithShipment,
    importOrderWithShipment,
    updateOrder,
    cancelOrder,
};
