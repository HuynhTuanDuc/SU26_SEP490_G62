/**
 * L3-FLOW-07 — Luồng System API: Coordinator tạo đơn → Trip Pool → cập nhật/hủy đơn qua HTTP thật
 *
 * Tương ứng L2-FLOW-07 (integration) nhưng đi qua HTTP thật:
 *   [coordinator] POST /api/orders (2 chuyến) → PATCH /api/orders/:id (sửa giá) → DELETE /api/orders/:id
 *   [driver]      GET /api/trips/pool (thấy chuyến available đúng nhóm xe)
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'TEST_SECRET';

const assert = require('node:assert');
const express = require('express');
const request = require('supertest');
const { setupTestDb } = require('../helpers/testDb');
const { TEST_PASSWORD_HASH, loginAs } = require('../helpers/httpAuth');

let pool;
let teardown;
let app;
let coordToken;
let driverBToken;

beforeAll(async () => {
    ({ pool, teardown } = await setupTestDb());

    app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use('/', require('../../routes'));

    await pool.query(`
        TRUNCATE shipment_assignment_history, trip_stops, order_shipments, orders, customers,
                 vehicles, vehicle_groups, drivers, profiles, roles, accounts
        RESTART IDENTITY CASCADE
    `);
    await pool.query(`INSERT INTO roles (id, name) VALUES (1,'manager'),(2,'coordinator'),(3,'accountant'),(4,'driver')`);
    await pool.query(`
        INSERT INTO accounts (id, email, password_hash, role_id) VALUES
        (2,'coord@test.com',$1,2),(4,'driverA@test.com',$1,4),(5,'driverB@test.com',$1,4)
    `, [TEST_PASSWORD_HASH]);
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

describe('L3-FLOW-07 — API: Coordinator tạo đơn nhiều chuyến → Trip Pool → cập nhật giá → hủy đơn', () => {
    it('B1 — Mỗi vai trò đăng nhập THẬT qua HTTP (POST /auth/login) trước khi bắt đầu luồng', async () => {
        coordToken = await loginAs(app, 'coord@test.com');
        driverBToken = await loginAs(app, 'driverB@test.com');
    });

    it('B2 [coordinator] — tạo đơn 2 chuyến qua HTTP (tự tạo khách hàng mới nếu chưa có — luồng chức năng "Khách hàng"); driver không gọi được API tạo đơn', async () => {
        const forbidden = await request(app).post('/api/orders')
            .set('Authorization', `Bearer ${driverBToken}`)
            .send({ arrived_at: new Date(Date.now() + 86400000).toISOString().slice(0, 10), pickup_address: 'A', delivery_address: 'B', trips: [{ distance: 10 }] });
        assert.strictEqual(forbidden.status, 403);

        const res = await request(app).post('/api/orders')
            .set('Authorization', `Bearer ${coordToken}`)
            .send({
                arrived_at: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
                customer_name: 'Cong ty Thanh Cong', customer_phone: '0909111222',
                pickup_address: 'Kho Q7', delivery_address: 'KCN Tan Binh', payment_type: 'bank_transfer',
                trips: [{ plate: '51E-100.01', distance: 40 }, { distance: 60 }],
            });
        assert.strictEqual(res.status, 201);
        assert.ok(res.body.order?.id);

        // orderService dùng thật customerService.findOrCreateCustomer bên trong — phải tự
        // tạo khách hàng mới nếu số điện thoại chưa tồn tại trong hệ thống.
        const { rows: [customer] } = await pool.query(`SELECT full_name FROM customers WHERE phone = '0909111222'`);
        assert.ok(customer, 'phải tự tạo khách hàng mới khi tạo đơn (luồng chức năng Khách hàng)');
    });

    it('B3 [driver B] — thấy chuyến available đúng nhóm xe trong Trip Pool qua HTTP, không thấy chuyến đã claimed', async () => {
        const res = await request(app).get('/api/trips/pool').set('Authorization', `Bearer ${driverBToken}`);
        assert.strictEqual(res.status, 200);
        const trips = res.body.trips ?? res.body;
        assert.ok(JSON.stringify(trips).includes('KCN Tan Binh'), 'phải thấy chuyến available của đơn vừa tạo');
        assert.ok(!trips.some((t) => t.status === 'claimed'), 'không được thấy chuyến đã có chủ');
    });

    it('B4 [coordinator] — sửa giá cước thủ công cho đơn qua HTTP', async () => {
        const { rows: [order] } = await pool.query(`SELECT id FROM orders ORDER BY id DESC LIMIT 1`);
        const res = await request(app).patch(`/api/orders/${order.id}`)
            .set('Authorization', `Bearer ${coordToken}`)
            .send({
                pickup_address: 'Kho Q7', delivery_address: 'KCN Tan Binh',
                trips: [{ plate: '51E-100.01', distance: 40, price: 700000 }, { distance: 60 }],
            });
        assert.strictEqual(res.status, 200);

        const { rows: [shipment] } = await pool.query('SELECT estimated_price FROM order_shipments WHERE order_id = $1 ORDER BY shipment_index LIMIT 1', [order.id]);
        assert.strictEqual(Number(shipment.estimated_price), 700000);
    });

    it('B5 [coordinator] — hủy đơn 1 chuyến qua HTTP → không claim được nữa', async () => {
        const create = await request(app).post('/api/orders')
            .set('Authorization', `Bearer ${coordToken}`)
            .send({
                arrived_at: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
                customer_name: 'Khach le', pickup_address: 'Kho Q9', delivery_address: 'Bien Hoa',
                payment_type: 'bank_transfer', trips: [{ distance: 20 }],
            });
        assert.strictEqual(create.status, 201);

        const del = await request(app).delete(`/api/orders/${create.body.order.id}`)
            .set('Authorization', `Bearer ${coordToken}`).send({ reason: 'Khach huy don dot xuat' });
        assert.strictEqual(del.status, 200);

        const { rows: [shipment] } = await pool.query('SELECT id, status FROM order_shipments WHERE order_id = $1', [create.body.order.id]);
        assert.strictEqual(shipment.status, 'cancelled');

        const claim = await request(app).post(`/api/trips/${shipment.id}/claim`).set('Authorization', `Bearer ${driverBToken}`);
        assert.ok(claim.status >= 400, `expected an error status, got ${claim.status}`);
    });
});

describe('L3-FLOW-07 — Negative paths over HTTP (thiếu dữ liệu, xe không tồn tại, xung đột gán trùng)', () => {
    it('N1 — Tạo đơn thiếu điểm nhận/điểm đến qua HTTP bị từ chối với 400', async () => {
        const res = await request(app).post('/api/orders')
            .set('Authorization', `Bearer ${coordToken}`)
            .send({ arrived_at: new Date(Date.now() + 86400000).toISOString().slice(0, 10), pickup_address: '', delivery_address: '', trips: [{ distance: 10 }] });
        assert.strictEqual(res.status, 400);
    });

    it('N2 — Tạo đơn với BKS không tồn tại qua HTTP bị từ chối', async () => {
        const res = await request(app).post('/api/orders')
            .set('Authorization', `Bearer ${coordToken}`)
            .send({
                arrived_at: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
                pickup_address: 'A', delivery_address: 'B', trips: [{ plate: '99Z-999.99', distance: 10 }],
            });
        assert.ok(res.status >= 400, `expected an error status, got ${res.status}`);
    });

    it('N3 — Tạo đơn gán cùng một xe cho 2 chuyến trong cùng yêu cầu qua HTTP bị từ chối', async () => {
        const res = await request(app).post('/api/orders')
            .set('Authorization', `Bearer ${coordToken}`)
            .send({
                arrived_at: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
                pickup_address: 'A', delivery_address: 'B',
                trips: [{ plate: '51E-100.02', distance: 10 }, { plate: '51E-100.02', distance: 20 }],
            });
        assert.ok(res.status >= 400, `expected an error status, got ${res.status}`);
    });

    it('N4 — Import Excel không gửi kèm file qua HTTP bị từ chối với 400', async () => {
        const res = await request(app).post('/api/orders/import').set('Authorization', `Bearer ${coordToken}`);
        assert.strictEqual(res.status, 400);
    });

    it('N5 — Một driver token gọi API tạo/sửa/xóa đơn (coordinator-only) đều bị từ chối', async () => {
        const { rows: [order] } = await pool.query(`SELECT id FROM orders LIMIT 1`);
        const patch = await request(app).patch(`/api/orders/${order.id}`).set('Authorization', `Bearer ${driverBToken}`).send({});
        assert.strictEqual(patch.status, 403);
        const del = await request(app).delete(`/api/orders/${order.id}`).set('Authorization', `Bearer ${driverBToken}`);
        assert.strictEqual(del.status, 403);
    });
});
