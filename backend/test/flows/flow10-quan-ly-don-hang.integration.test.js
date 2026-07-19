/**
 * L2-FLOW-07 — Luồng: Coordinator tạo đơn hàng → Trip Pool → Driver xem chuyến →
 * Coordinator cập nhật/hủy đơn
 *
 * Test THEO LUỒNG: Coordinator tạo đơn 2 chuyến (1 chuyến gán sẵn xe/tài, 1 chuyến
 * để trống cho driver khác claim) → chuyến trống phải xuất hiện trong Trip Pool
 * đúng nhóm xe của driver → Coordinator sửa giá cước đơn → Coordinator hủy đơn
 * (chuyến không còn claim được nữa).
 */
const assert = require('node:assert');
const { setupTestDb } = require('../helpers/testDb');

let pool;
let teardown;
let orderService;
let tripService;

const COORD_ID = 2;
const DRIVER_A = 4; // đã gán sẵn xe — dùng cho chuyến "auto-assign"
const DRIVER_B = 5; // chưa có chuyến — dùng để claim chuyến còn trống trong pool

beforeAll(async () => {
    ({ pool, teardown } = await setupTestDb());
    orderService = require('../../services/orderService');
    tripService = require('../../services/tripService');

    await pool.query(`
        TRUNCATE shipment_assignment_history, trip_stops, order_shipments, orders, customers,
                 vehicles, vehicle_groups, drivers, profiles, roles, accounts
        RESTART IDENTITY CASCADE
    `);
    await pool.query(`INSERT INTO roles (id, name) VALUES (1,'manager'),(2,'coordinator'),(3,'accountant'),(4,'driver')`);
    await pool.query(`
        INSERT INTO accounts (id, email, password_hash, role_id) VALUES
        (2,'coord@test.com','hash',2),(4,'driverA@test.com','hash',4),(5,'driverB@test.com','hash',4)
    `);
    await pool.query(`
        INSERT INTO profiles (id, full_name, role_id) VALUES (2,'Coordinator',2),(4,'Driver A',4),(5,'Driver B',4)
    `);
    await pool.query(`INSERT INTO vehicle_groups (id, name, price_per_km) VALUES (1, 'Xe 5m2', 15000)`);
    await pool.query(`
        INSERT INTO vehicles (id, plate_number, vehicle_group_id, assigned_driver_id, status) VALUES
        (1, '51E-100.01', 1, 4, 'active'), (2, '51E-100.02', 1, 5, 'active')
    `);
    await pool.query(`
        INSERT INTO drivers (profile_id, vehicle_id, default_vehicle_group_id, license_number, hire_date) VALUES
        (4, 1, 1, 'DL-A', CURRENT_DATE), (5, 2, 1, 'DL-B', CURRENT_DATE)
    `);
});

afterAll(async () => {
    await teardown();
});

describe('L2-FLOW-07 — Coordinator tạo đơn nhiều chuyến → Trip Pool → cập nhật giá → hủy đơn', () => {
    it('B1 — Coordinator tạo đơn 2 chuyến: 1 chuyến gán sẵn BKS (claimed ngay), 1 chuyến để trống (available)', async () => {
        const result = await orderService.createOrder(COORD_ID, {
            arrived_at: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
            customer_name: 'Cong ty Thanh Cong', customer_phone: '0909111222',
            cargo_name: 'Hang dien tu', pickup_address: 'Kho Q7', delivery_address: 'KCN Tan Binh',
            payment_type: 'bank_transfer',
            trips: [
                { plate: '51E-100.01', distance: 40 },
                { distance: 60 },
            ],
        });
        assert.ok(result.order?.id, 'phải tạo được order');

        const { rows: shipments } = await pool.query('SELECT id, status, estimated_price FROM order_shipments WHERE order_id = $1 ORDER BY shipment_index', [result.order.id]);
        assert.strictEqual(shipments.length, 2);
        assert.strictEqual(shipments[0].status, 'claimed', 'chuyến có BKS hợp lệ phải tự động claimed cho tài xế của xe đó');
        assert.strictEqual(Number(shipments[0].estimated_price), 40 * 15000);
        assert.strictEqual(shipments[1].status, 'available', 'chuyến không gán BKS phải nằm chờ trong pool');

        const { rows: [owner] } = await pool.query('SELECT owner_driver_id FROM v_shipment_current WHERE shipment_id = $1', [shipments[0].id]);
        assert.strictEqual(owner.owner_driver_id, DRIVER_A);

        const { rows: [customer] } = await pool.query(`SELECT full_name, phone FROM customers WHERE phone = '0909111222'`);
        assert.ok(customer, 'phải tự tạo khách hàng mới nếu chưa tồn tại (findOrCreateCustomer)');
    });

    it('B2 — Chuyến available xuất hiện trong Trip Pool của Driver B (đúng nhóm xe), không xuất hiện chuyến đã claimed', async () => {
        const pool1 = await tripService.getTripPool(DRIVER_B, {});
        const trips = pool1.trips ?? pool1.items ?? pool1;
        const cargoNames = JSON.stringify(trips);
        assert.ok(cargoNames.includes('KCN Tan Binh') || trips.some((t) => t.delivery_address === 'KCN Tan Binh'),
            'Trip Pool phải hiển thị chuyến available cùng nhóm xe');
        assert.ok(!trips.some((t) => t.status === 'claimed'), 'Trip Pool không được hiển thị chuyến đã có chủ');
    });

    it('B3 — Coordinator sửa giá cước thủ công cho đơn (không theo km × đơn giá mặc định)', async () => {
        const { rows: [order] } = await pool.query(`SELECT id FROM orders ORDER BY id DESC LIMIT 1`);
        const updated = await orderService.updateOrder(order.id, {
            pickup_address: 'Kho Q7', delivery_address: 'KCN Tan Binh',
            trips: [
                { plate: '51E-100.01', distance: 40, price: 700000 },
                { distance: 60 },
            ],
            updated_by: COORD_ID,
        });
        assert.ok(updated, 'phải cập nhật được đơn');

        const { rows: [shipment] } = await pool.query('SELECT estimated_price FROM order_shipments WHERE order_id = $1 ORDER BY shipment_index LIMIT 1', [order.id]);
        assert.strictEqual(Number(shipment.estimated_price), 700000, 'giá cước thủ công phải ghi đè công thức km × đơn giá (40×15000=600k)');
    });

    it('B4 — Coordinator hủy đơn 1 chuyến còn trong pool → Driver B không claim được nữa', async () => {
        const result = await orderService.createOrder(COORD_ID, {
            arrived_at: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
            customer_name: 'Khach le', pickup_address: 'Kho Q9', delivery_address: 'Bien Hoa',
            payment_type: 'bank_transfer', trips: [{ distance: 20 }],
        });
        const { rows: [shipment] } = await pool.query('SELECT id, status FROM order_shipments WHERE order_id = $1', [result.order.id]);
        assert.strictEqual(shipment.status, 'available');

        await orderService.cancelOrder(result.order.id, 'Khach huy don dot xuat');

        const { rows: [s] } = await pool.query('SELECT status FROM order_shipments WHERE id = $1', [shipment.id]);
        assert.strictEqual(s.status, 'cancelled');

        await assert.rejects(() => tripService.claimTrip(shipment.id, DRIVER_B));
    });
});

describe('L2-FLOW-07 — Negative paths (thiếu dữ liệu, xe không tồn tại, xung đột gán trùng)', () => {
    it('N1 — Tạo đơn thiếu điểm nhận/điểm đến bị từ chối', async () => {
        await assert.rejects(
            () => orderService.createOrder(COORD_ID, {
                arrived_at: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
                customer_name: 'X', pickup_address: '', delivery_address: '',
                trips: [{ distance: 10 }],
            }),
            /Thiếu điểm nhận hoặc điểm đến/,
        );
    });

    it('N2 — Tạo đơn với ngày giao hàng trong quá khứ bị từ chối', async () => {
        await assert.rejects(
            () => orderService.createOrder(COORD_ID, {
                arrived_at: '2020-01-01', customer_name: 'X', pickup_address: 'A', delivery_address: 'B',
                trips: [{ distance: 10 }],
            }),
            /Ngày không được trước hôm nay/,
        );
    });

    it('N3 — Tạo đơn với BKS không tồn tại trong hệ thống bị từ chối', async () => {
        await assert.rejects(
            () => orderService.createOrder(COORD_ID, {
                arrived_at: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
                customer_name: 'X', pickup_address: 'A', delivery_address: 'B',
                trips: [{ plate: '99Z-999.99', distance: 10 }],
            }),
            /không tồn tại trong nhóm xe/,
        );
    });

    it('N4 — Tạo đơn gán CÙNG một xe cho 2 chuyến trong cùng yêu cầu bị từ chối', async () => {
        await assert.rejects(
            () => orderService.createOrder(COORD_ID, {
                arrived_at: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
                customer_name: 'X', pickup_address: 'A', delivery_address: 'B',
                trips: [
                    { plate: '51E-100.02', distance: 10 },
                    { plate: '51E-100.02', distance: 20 },
                ],
            }),
            /đã được gán cho một chuyến khác/,
        );
    });

    it('N5 — Tạo đơn với quãng đường bằng 0 bị từ chối (không tính được cước)', async () => {
        await assert.rejects(
            () => orderService.createOrder(COORD_ID, {
                arrived_at: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
                customer_name: 'X', pickup_address: 'A', delivery_address: 'B',
                trips: [{ distance: 0 }],
            }),
            /Quãng đường là bắt buộc/,
        );
    });

    it('N6 — Import Excel với buffer rỗng/không hợp lệ bị từ chối', async () => {
        await assert.rejects(
            () => orderService.importOrdersFromExcel(COORD_ID, null),
            /Thiếu file Excel/,
        );
    });
});
