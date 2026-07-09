const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const XLSX = require('xlsx');
const { setupTestDb } = require('./helpers/testDb');

const buildOrdersExcelBuffer = (rows) => {
    const header = ['Ngày', 'Chấm công', 'BKS', 'Lái xe', 'Khách hàng', 'SĐT', 'Điểm lấy hàng', 'Điểm giao hàng', 'Quãng đường', 'Ghi chú'];
    const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};

let pool;
let teardown;
let orderService;

describe('Order Service Integration Tests (L2 — coordinator)', () => {
    before(async () => {
        ({ pool, teardown } = await setupTestDb());
        orderService = require('../services/orderService');
    });

    after(async () => {
        await teardown();
    });

    beforeEach(async () => {
        await pool.query(`
            TRUNCATE trip_stops, shipment_assignment_history, order_shipments, orders, customers,
                     vehicles, vehicle_groups, drivers, profiles, roles, accounts
            RESTART IDENTITY CASCADE
        `);
        await pool.query(`INSERT INTO roles (id, name) VALUES (1, 'coordinator'), (2, 'driver') ON CONFLICT DO NOTHING`);
        await pool.query(`INSERT INTO accounts (id, email, password_hash, role_id) VALUES (1, 'coord@test.com', 'hash', 1)`);
        await pool.query(`INSERT INTO profiles (id, full_name, role_id) VALUES (1, 'Coordinator One', 1)`);
        await pool.query(`INSERT INTO vehicle_groups (id, name, price_per_km) VALUES (1, 'Truck 5T', 15000)`);
    });

    it('createOrder() rejects when pickup/delivery address is missing', async () => {
        await assert.rejects(
            () => orderService.createOrder(1, { pickup_address: '', delivery_address: 'B', arrived_at: '2999-01-01', trips: [] }),
            { message: 'Thiếu điểm nhận hoặc điểm đến' },
        );
    });

    it('createOrder() rejects a delivery date before today', async () => {
        await assert.rejects(
            () => orderService.createOrder(1, {
                pickup_address: 'A', delivery_address: 'B', arrived_at: '2000-01-01', trips: [{ distance: 10 }],
            }),
            { message: 'Ngày không được trước hôm nay' },
        );
    });

    it('createOrder() rejects a trip with no valid distance', async () => {
        await assert.rejects(
            () => orderService.createOrder(1, {
                pickup_address: 'A', delivery_address: 'B', arrived_at: '2999-01-01', trips: [{ distance: 0 }],
            }),
            { message: 'Quãng đường là bắt buộc để tính cước' },
        );
    });

    it('createOrder() creates an unassigned shipment as AVAILABLE when no plate is given', async () => {
        const result = await orderService.createOrder(1, {
            customer_name: 'Nguyen Van A',
            customer_phone: '0912345678',
            pickup_address: 'HN',
            delivery_address: 'HCM',
            arrived_at: '2999-01-01',
            payment_type: 'cash',
            trips: [{ distance: 100, vehicle_group_id: 1 }],
        });

        assert.strictEqual(Number(result.order.estimated_price), 1_500_000);
        const shipment = await pool.query('SELECT status, owner_driver_id FROM order_shipments os LEFT JOIN v_shipment_current sc ON sc.shipment_id = os.id WHERE os.order_id = $1', [result.order.id]);
        assert.strictEqual(shipment.rows[0].status, 'available');
        assert.strictEqual(shipment.rows[0].owner_driver_id, null);

        const customer = await pool.query('SELECT phone FROM customers WHERE phone = $1', ['0912345678']);
        assert.strictEqual(customer.rows.length, 1);
    });

    it('createOrder() auto-claims the shipment when the plate already has an assigned driver', async () => {
        await pool.query(`INSERT INTO accounts (id, email, password_hash, role_id) VALUES (2, 'driver1@test.com', 'hash', 2)`);
        await pool.query(`INSERT INTO profiles (id, full_name, role_id) VALUES (2, 'Driver One', 2)`);
        await pool.query(`INSERT INTO vehicles (id, plate_number, vehicle_group_id, assigned_driver_id, status) VALUES (1, '29A-11111', 1, 2, 'active')`);
        await pool.query(`INSERT INTO drivers (profile_id, vehicle_id, license_number, hire_date) VALUES (2, 1, 'L123', CURRENT_DATE)`);

        const result = await orderService.createOrder(1, {
            pickup_address: 'HN', delivery_address: 'HCM', arrived_at: '2999-01-01', payment_type: 'cash',
            trips: [{ distance: 50, plate: '29A-11111', vehicle_group_id: 1 }],
        });

        const shipment = await pool.query('SELECT status, sc.owner_driver_id FROM order_shipments os LEFT JOIN v_shipment_current sc ON sc.shipment_id = os.id WHERE os.order_id = $1', [result.order.id]);
        assert.strictEqual(shipment.rows[0].status, 'claimed');
        assert.strictEqual(shipment.rows[0].owner_driver_id, 2);
    });

    it('createOrder() rejects an unknown plate number', async () => {
        await assert.rejects(
            () => orderService.createOrder(1, {
                pickup_address: 'HN', delivery_address: 'HCM', arrived_at: '2999-01-01',
                trips: [{ distance: 50, plate: 'NOPE-999', vehicle_group_id: 1 }],
            }),
            { message: 'BKS NOPE-999 không tồn tại trong nhóm xe đã chọn' },
        );
    });

    it('cancelOrder() marks the shipment cancelled and the order derived_status cancelled', async () => {
        const created = await orderService.createOrder(1, {
            pickup_address: 'HN', delivery_address: 'HCM', arrived_at: '2999-01-01', payment_type: 'cash',
            trips: [{ distance: 50, vehicle_group_id: 1 }],
        });

        const cancelled = await orderService.cancelOrder(created.order.id, 'khách huỷ đơn');

        assert.strictEqual(cancelled.order_status, 'cancelled');
        const shipment = await pool.query('SELECT status, cancel_reason FROM order_shipments WHERE order_id = $1', [created.order.id]);
        assert.strictEqual(shipment.rows[0].status, 'cancelled');
        assert.strictEqual(shipment.rows[0].cancel_reason, 'khách huỷ đơn');
    });

    it('cancelOrder() rejects an order whose shipment is already completed', async () => {
        const created = await orderService.createOrder(1, {
            pickup_address: 'HN', delivery_address: 'HCM', arrived_at: '2999-01-01', payment_type: 'cash',
            trips: [{ distance: 50, vehicle_group_id: 1 }],
        });
        await pool.query(`UPDATE order_shipments SET status = 'completed' WHERE order_id = $1`, [created.order.id]);

        await assert.rejects(
            () => orderService.cancelOrder(created.order.id, 'too late'),
            { message: 'Không thể hủy đơn đã hoàn tất hoặc đã hủy' },
        );
    });

    it('cancelOrder() returns null for a non-existent order', async () => {
        const result = await orderService.cancelOrder(999999, 'n/a');
        assert.strictEqual(result, null);
    });

    it('listOrders() returns a paginated list including a newly created order', async () => {
        const created = await orderService.createOrder(1, {
            pickup_address: 'HN', delivery_address: 'HCM', arrived_at: '2999-01-01', payment_type: 'cash',
            trips: [{ distance: 50, vehicle_group_id: 1 }],
        });

        const result = await orderService.listOrders({ page: 1, limit: 10 });

        assert.strictEqual(result.pagination.total, 1);
        assert.strictEqual(result.orders[0].id, created.order.id);
    });

    it('updateOrder() recalculates estimated price when trip distance changes', async () => {
        const created = await orderService.createOrder(1, {
            pickup_address: 'HN', delivery_address: 'HCM', arrived_at: '2999-01-01', payment_type: 'cash',
            trips: [{ distance: 50, vehicle_group_id: 1 }],
        });

        const updated = await orderService.updateOrder(created.order.id, {
            pickup_address: 'HN', delivery_address: 'HCM', arrived_at: '2999-01-01',
            trips: [{ distance: 100, vehicle_group_id: 1 }],
        });

        const shipment = await pool.query('SELECT estimated_price, estimated_distance_km FROM order_shipments WHERE order_id = $1', [created.order.id]);
        assert.strictEqual(Number(shipment.rows[0].estimated_distance_km), 100);
        assert.strictEqual(Number(shipment.rows[0].estimated_price), 100 * 15000);
    });

    it('updateOrder() rejects editing an order whose shipments are all completed/cancelled', async () => {
        const created = await orderService.createOrder(1, {
            pickup_address: 'HN', delivery_address: 'HCM', arrived_at: '2999-01-01', payment_type: 'cash',
            trips: [{ distance: 50, vehicle_group_id: 1 }],
        });
        await pool.query(`UPDATE order_shipments SET status = 'completed' WHERE order_id = $1`, [created.order.id]);

        await assert.rejects(
            () => orderService.updateOrder(created.order.id, {
                pickup_address: 'HN', delivery_address: 'HCM', arrived_at: '2999-01-01',
                trips: [{ distance: 100, vehicle_group_id: 1 }],
            }),
            { message: 'Không thể chỉnh sửa đơn đã hoàn tất hoặc đã hủy' },
        );
    });

    it('importOrdersFromExcel() rejects when no file buffer is provided', async () => {
        await assert.rejects(
            () => orderService.importOrdersFromExcel(1, null),
            { message: 'Thiếu file Excel' },
        );
    });

    it('importOrdersFromExcel() creates an order per data row using the vehicle plate lookup', async () => {
        await pool.query(`INSERT INTO vehicles (id, plate_number, vehicle_group_id, status) VALUES (1, '29A-11111', 1, 'active')`);

        const buffer = buildOrdersExcelBuffer([
            ['2999-01-01', 'x', '29A-11111', 'Driver One', 'Nguyen Van A', '0912345678', 'HN', 'HCM', 80, ''],
        ]);

        const created = await orderService.importOrdersFromExcel(1, buffer);

        assert.strictEqual(created.length, 1);
        const shipment = await pool.query('SELECT estimated_price FROM order_shipments WHERE order_id = $1', [created[0].order.id]);
        assert.strictEqual(Number(shipment.rows[0].estimated_price), 80 * 15000);
    });

    it('importOrdersFromExcel() rejects a row missing a required field', async () => {
        const buffer = buildOrdersExcelBuffer([
            ['2999-01-01', '', '29A-11111', '', '', '', 'HN', 'HCM', 80, ''],
        ]);

        await assert.rejects(
            () => orderService.importOrdersFromExcel(1, buffer),
            /Thiếu thông tin bắt buộc trong file Excel/,
        );
    });
});
