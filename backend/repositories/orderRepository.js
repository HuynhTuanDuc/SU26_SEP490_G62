const pool = require('../config/database');
const { SHIPMENT_STATUS, ASSIGNMENT_TYPE } = require('../constants/tripConstants');

const listOrders = async ({ limit = 10, offset = 0, search = '', status = '' } = {}) => {
    const values = [];
    const filters = [];

    if (status) {
        values.push(status);
        filters.push(`o.status = $${values.length}`);
    }

    if (search) {
        values.push(`%${search}%`);
        const searchParam = `$${values.length}`;
        filters.push(`(
            CAST(o.id AS TEXT) ILIKE ${searchParam}
            OR o.cargo_name ILIKE ${searchParam}
            OR o.pickup_address ILIKE ${searchParam}
            OR o.delivery_address ILIKE ${searchParam}
            OR o.status ILIKE ${searchParam}
            OR o.notes ILIKE ${searchParam}
            OR c.full_name ILIKE ${searchParam}
            OR c.phone ILIKE ${searchParam}
            OR d.full_name ILIKE ${searchParam}
        )`);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const baseFrom = `
         FROM orders o
         LEFT JOIN customers c ON c.id = o.customer_id
         LEFT JOIN LATERAL (
            SELECT s1.completed_at
            FROM order_shipments s1
            WHERE s1.order_id = o.id
            ORDER BY s1.shipment_index DESC
            LIMIT 1
         ) s ON TRUE
         LEFT JOIN LATERAL (
            SELECT pr.full_name
            FROM order_shipments os
            LEFT JOIN profiles pr ON pr.id = os.owner_driver_id
            WHERE os.order_id = o.id
            ORDER BY os.shipment_index ASC
            LIMIT 1
         ) d ON TRUE
         ${whereClause}`;

    const countResult = await pool.query(`SELECT COUNT(*)::int AS total ${baseFrom}`, values);

    const pageValues = [...values, limit, offset];
    const limitParam = `$${pageValues.length - 1}`;
    const offsetParam = `$${pageValues.length}`;
    const result = await pool.query(
        `SELECT
            o.id,
            o.customer_id,
            o.cargo_name,
            o.cargo_weight_kg,
            o.pickup_address,
            o.delivery_address,
            o.estimated_price,
            o.status,
            o.notes,
            o.created_at,
            o.updated_at,
            s.completed_at,
            c.full_name AS customer_name,
            c.phone AS customer_phone,
            d.full_name AS driver_name
         ${baseFrom}
         ORDER BY o.created_at DESC
         LIMIT ${limitParam} OFFSET ${offsetParam}`,
        pageValues,
    );

    return { rows: result.rows, total: countResult.rows[0]?.total ?? 0 };
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
            v.vehicle_group_id
         FROM drivers d
         JOIN profiles p ON p.id = d.profile_id
         LEFT JOIN vehicles v ON v.id = d.vehicle_id
         WHERE d.profile_id = $1
         LIMIT 1`,
        [driverId],
    );
    return result.rows[0] ?? null;
};

const getDriverByPlate = async (client, plateNumber) => {
    if (!plateNumber) return null;
    const result = await client.query(
        `SELECT
            d.profile_id AS id,
            p.full_name,
            p.phone,
            d.vehicle_id,
            v.plate_number,
            v.vehicle_group_id
         FROM vehicles v
         LEFT JOIN drivers d ON d.vehicle_id = v.id
         LEFT JOIN profiles p ON p.id = d.profile_id
         WHERE v.plate_number = $1
         LIMIT 1`,
        [plateNumber],
    );
    return result.rows[0] ?? null;
};

const findOrCreateCustomer = async (client, customerName, customerPhone, normalizePhone, safeTrim) => {
    const normalizedPhone = normalizePhone(customerPhone);
    if (!normalizedPhone) return null;

    const existingCustomer = await client.query(
        `SELECT id, full_name, phone
         FROM customers
         WHERE phone = $1
         LIMIT 1`,
        [normalizedPhone],
    );
    if (existingCustomer.rows[0]) return existingCustomer.rows[0];

    const createdCustomer = await client.query(
        `INSERT INTO customers (customer_type, full_name, contact_person, phone)
         VALUES ('individual', $1, $1, $2)
         RETURNING id, full_name, phone`,
        [safeTrim(customerName) || normalizedPhone, normalizedPhone],
    );
    return createdCustomer.rows[0];
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
            (customer_id, created_by, cargo_name, cargo_weight_kg, pickup_address, delivery_address, estimated_price, status, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
            orderData.customer_id,
            userId,
            orderData.cargo_name,
            orderData.cargo_weight_kg,
            orderData.pickup_address,
            orderData.delivery_address,
            orderData.estimated_price,
            orderData.status,
            orderData.notes,
        ],
    );

    const order = orderResult.rows[0];
    const shipmentResult = await client.query(
        `INSERT INTO order_shipments
            (order_id, shipment_index, vehicle_group_id, owner_driver_id, pickup_address, delivery_address, cargo_weight_kg, estimated_price, status, notes, completed_at)
         VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8, $9, NULL)
         RETURNING *`,
        [
            order.id,
            shipmentData.vehicle_group_id,
            shipmentData.owner_driver_id,
            shipmentData.pickup_address,
            shipmentData.delivery_address,
            shipmentData.cargo_weight_kg,
            shipmentData.estimated_price,
            shipmentData.status,
            shipmentData.notes,
        ],
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

    return { order, shipment: shipmentResult.rows[0] };
};

const importOrderWithShipment = async ({ client, userId, orderData, shipmentData }) => {
    const orderResult = await client.query(
        `INSERT INTO orders
            (customer_id, created_by, cargo_name, cargo_weight_kg, pickup_address, delivery_address, estimated_price, status, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'available', $8)
         RETURNING *`,
        [
            orderData.customer_id,
            userId,
            orderData.cargo_name,
            orderData.cargo_weight_kg,
            orderData.pickup_address,
            orderData.delivery_address,
            orderData.estimated_price,
            orderData.notes,
        ],
    );

    const order = orderResult.rows[0];
    const shipmentResult = await client.query(
        `INSERT INTO order_shipments
            (order_id, shipment_index, vehicle_group_id, owner_driver_id, pickup_address, delivery_address, cargo_weight_kg, estimated_price, status, notes, completed_at)
         VALUES ($1, 1, 1, NULL, $2, $3, $4, $5, 'available', $6, NULL)
         RETURNING *`,
        [
            order.id,
            shipmentData.pickup_address,
            shipmentData.delivery_address,
            shipmentData.cargo_weight_kg,
            shipmentData.estimated_price,
            shipmentData.notes,
        ],
    );

    return { order, shipment: shipmentResult.rows[0] };
};

module.exports = {
    listOrders,
    getDriverById,
    getDriverByPlate,
    findOrCreateCustomer,
    createOrderWithShipment,
    importOrderWithShipment,
    SHIPMENT_STATUS,
};
