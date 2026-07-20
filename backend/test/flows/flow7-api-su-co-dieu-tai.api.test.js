/**
 * L3-FLOW-05 — Luồng System API: Sự cố hỏng xe → Điều chuyển tài xế qua HTTP thật
 *
 * Test THEO LUỒNG ở tầng API — tương ứng với L2-FLOW-05 (integration) nhưng đi qua
 * HTTP thật: driver A báo sự cố (multipart ảnh bằng chứng) → coordinator resolve +
 * điều Driver B thay thế → Driver B chạy tiếp và hoàn thành → KPI ghi cho Driver B.
 *
 *   [driver A]    POST claim → PATCH status(picking) → POST /api/incidents (multipart)
 *   [coordinator] PATCH /api/incidents/:id/status { status:'resolved', replacementDriverId }
 *   [driver B]    POST start-transit → PATCH arrived → POST complete
 *   [coordinator] GET /api/kpi/driver/:id → completed_shipments
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
let driverAToken;
let driverBToken;
let coordToken;

const PRICE_PER_KM = 15000;
const img = () => Buffer.from('fake-image-bytes');

beforeAll(async () => {
    ({ pool, teardown } = await setupTestDb());

    app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use('/', require('../../routes'));

    await pool.query(`
        TRUNCATE financial_transactions, incident_evidences, incidents, delivery_proofs, trip_stops,
                 shipment_assignment_history, shipment_revenue_allocations, kpi_records, order_shipments,
                 orders, customers, vehicles, vehicle_groups, drivers, profiles, roles, accounts
        RESTART IDENTITY CASCADE
    `);
    await pool.query(`INSERT INTO roles (id, name) VALUES (1,'manager'),(2,'coordinator'),(3,'accountant'),(4,'driver')`);
    await pool.query(`
        INSERT INTO accounts (id, email, password_hash, role_id) VALUES
        (1,'manager@test.com',$1,1),(2,'coord@test.com',$1,2),
        (3,'acct@test.com',$1,3),(4,'driverA@test.com',$1,4),(5,'driverB@test.com',$1,4)
    `, [TEST_PASSWORD_HASH]);
    await pool.query(`
        INSERT INTO profiles (id, full_name, role_id) VALUES
        (1,'Manager',1),(2,'Coordinator',2),(3,'Accountant',3),(4,'Driver A',4),(5,'Driver B',4)
    `);
    await pool.query(`INSERT INTO vehicle_groups (id, name, price_per_km) VALUES (1, 'Xe 5m2', ${PRICE_PER_KM})`);
    await pool.query(`
        INSERT INTO vehicles (id, plate_number, vehicle_group_id, assigned_driver_id, status) VALUES
        (1, '51E-111.11', 1, 4, 'active'), (2, '51E-222.22', 1, 5, 'active')
    `);
    await pool.query(`
        INSERT INTO drivers (profile_id, vehicle_id, default_vehicle_group_id, license_number, hire_date) VALUES
        (4, 1, 1, 'DL-A', CURRENT_DATE), (5, 2, 1, 'DL-B', CURRENT_DATE)
    `);
    await pool.query(`INSERT INTO customers (id, customer_type, full_name, phone) VALUES (1, 'individual', 'Khach A', '0912345678')`);
    await pool.query(`INSERT INTO orders (id, customer_id, created_by, payment_type) VALUES (1, 1, 2, 'bank_transfer')`);
    await pool.query(`
        INSERT INTO order_shipments (id, order_id, shipment_index, vehicle_group_id, estimated_price, status)
        VALUES (1, 1, 1, 1, 2000000, 'available')
    `);
    await pool.query(`
        INSERT INTO trip_stops (shipment_id, stop_index, stop_type, address) VALUES
        (1, 1, 'pickup', 'Kho Q1'), (1, 2, 'delivery', 'KCN Song Than')
    `);

});

afterAll(async () => {
    await teardown();
});

describe('L3-FLOW-05 — API: Sự cố hỏng xe → Coordinator điều Driver B thay thế → Driver B hoàn thành', () => {
    it('B1 — Mỗi vai trò đăng nhập THẬT qua HTTP (POST /auth/login) trước khi bắt đầu luồng', async () => {
        driverAToken = await loginAs(app, 'driverA@test.com');
        driverBToken = await loginAs(app, 'driverB@test.com');
        coordToken = await loginAs(app, 'coord@test.com');
    });

    it('B2 [driver A] — nhận chuyến, đang picking thì báo sự cố hỏng xe qua HTTP (multipart ảnh)', async () => {
        const claim = await request(app).post('/api/trips/1/claim').set('Authorization', `Bearer ${driverAToken}`);
        assert.strictEqual(claim.status, 200);

        const picking = await request(app).patch('/api/trips/1/status')
            .set('Authorization', `Bearer ${driverAToken}`).send({ status: 'picking' });
        assert.strictEqual(picking.status, 200);

        const incident = await request(app).post('/api/incidents')
            .set('Authorization', `Bearer ${driverAToken}`)
            .field('shipmentId', '1')
            .field('incidentType', 'vehicle_breakdown')
            .field('severityLevel', 'high')
            .field('description', 'Xe chet may giua duong, khong the tiep tuc chuyen')
            .field('location', 'Cau Phu My')
            .attach('images', img(), 'breakdown.jpg');
        assert.strictEqual(incident.status, 201);
        assert.strictEqual(incident.body.incident.status, 'open');

        // notificationService thật được gọi bên trong incidentService.createIncident —
        // coordinator phải nhận được thông báo ngay khi sự cố được báo, không phải chờ
        // đến khi vào xem danh sách sự cố mới biết.
        const { rows: [notif] } = await pool.query(
            `SELECT title FROM notifications WHERE user_id = 2 ORDER BY id DESC LIMIT 1`,
        );
        assert.ok(notif, 'coordinator phải nhận được thông báo khi driver báo sự cố');
    });

    it('B3 [coordinator] — resolve + điều Driver B thay thế qua HTTP: chuyến sang tài mới, doanh thu chuyển 100%', async () => {
        const { rows: [inc] } = await pool.query(`SELECT id FROM incidents WHERE status = 'open'`);

        const resolve = await request(app).patch(`/api/incidents/${inc.id}/status`)
            .set('Authorization', `Bearer ${coordToken}`)
            .send({ status: 'resolved', resolution: 'Dieu xe 51E-222.22 thay the', replacementDriverId: 5 });
        assert.strictEqual(resolve.status, 200);
        assert.strictEqual(resolve.body.incident.status, 'resolved');
        assert.strictEqual(resolve.body.incident.replacement_driver_id, 5);

        const { rows: [owner] } = await pool.query('SELECT owner_driver_id FROM v_shipment_current WHERE shipment_id = 1');
        assert.strictEqual(owner.owner_driver_id, 5, 'chuyến phải thuộc về Driver B sau khi điều chuyển');

        const { rows: [alloc] } = await pool.query(
            'SELECT share_percent, allocation_reason FROM shipment_revenue_allocations WHERE shipment_id = 1',
        );
        assert.strictEqual(Number(alloc.share_percent), 100, 'chưa lấy hàng → chuyển toàn bộ doanh thu');
        assert.strictEqual(alloc.allocation_reason, 'incident_full_transfer');
    });

    it('B4 [driver B] — chạy tiếp vòng đời qua HTTP và hoàn thành → KPI ghi cho Driver B', async () => {
        const transit = await request(app).post('/api/trips/1/start-transit')
            .set('Authorization', `Bearer ${driverBToken}`).attach('proof', Buffer.from('fake'), 'loading.jpg');
        assert.strictEqual(transit.status, 200);

        const arrived = await request(app).patch('/api/trips/1/status')
            .set('Authorization', `Bearer ${driverBToken}`).send({ status: 'arrived' });
        assert.strictEqual(arrived.status, 200);

        const complete = await request(app).post('/api/trips/1/complete')
            .set('Authorization', `Bearer ${driverBToken}`).attach('proof', Buffer.from('fake'), 'delivery.jpg');
        assert.strictEqual(complete.status, 200);

        // KPI upsert chạy fire-and-forget sau khi commit — poll ngắn qua endpoint thật
        let kpi = null;
        for (let i = 0; i < 20 && !kpi; i += 1) {
            await new Promise((r) => setTimeout(r, 50));
            const res = await request(app).get('/api/kpi/driver/5').set('Authorization', `Bearer ${coordToken}`);
            kpi = (res.body.kpi ?? [])[0] ?? null;
        }
        assert.ok(kpi, 'KPI của tài thay thế phải được ghi qua API');
        assert.strictEqual(Number(kpi.completed_shipments), 1, 'KPI của tài thay thế phải được ghi qua API');
    });
});

describe('L3-FLOW-05 — Negative paths over HTTP (BR-023, invalid input, duplicate replacement)', () => {
    it('N1 — BR-023: a driver token hitting the staff-only incident-status endpoint is forbidden', async () => {
        const { rows: [inc] } = await pool.query(`SELECT id FROM incidents ORDER BY id DESC LIMIT 1`);
        const res = await request(app).patch(`/api/incidents/${inc.id}/status`)
            .set('Authorization', `Bearer ${driverAToken}`)
            .send({ status: 'resolved' });
        assert.strictEqual(res.status, 403, 'driver không được tự đóng sự cố (BR-023)');
    });

    it('N2 — reporting an incident with a description shorter than 10 characters is rejected', async () => {
        const res = await request(app).post('/api/incidents')
            .set('Authorization', `Bearer ${driverBToken}`)
            .field('shipmentId', '1')
            .field('incidentType', 'cargo_damage')
            .field('severityLevel', 'low')
            .field('description', 'too short');
        assert.ok(res.status >= 400, `expected an error status, got ${res.status}`);
    });

    it('N3 — assigning a replacement driver identical to the current shipment owner is rejected', async () => {
        // Chuyến 1 đã completed từ B3 — dựng một chuyến đang hoạt động riêng cho Driver B
        await pool.query(`INSERT INTO orders (id, customer_id, created_by, payment_type) VALUES (90, 1, 2, 'bank_transfer')`);
        await pool.query(`
            INSERT INTO order_shipments (id, order_id, shipment_index, vehicle_group_id, status, claimed_at, picking_at)
            VALUES (90, 90, 1, 1, 'picking', NOW(), NOW())
        `);
        await pool.query(`
            INSERT INTO shipment_assignment_history (shipment_id, to_driver_id, to_vehicle_id, changed_by, change_reason)
            VALUES (90, 5, 2, 5, 'self_claim')
        `);

        const created = await request(app).post('/api/incidents')
            .set('Authorization', `Bearer ${driverBToken}`)
            .field('shipmentId', '90')
            .field('incidentType', 'road_incident')
            .field('severityLevel', 'low')
            .field('description', 'Tac duong keo dai o cua ngo');
        assert.strictEqual(created.status, 201);

        const res = await request(app).patch(`/api/incidents/${created.body.incident.id}/status`)
            .set('Authorization', `Bearer ${coordToken}`)
            .send({ status: 'resolved', resolution: 'x', replacementDriverId: 5 });
        assert.ok(res.status >= 400, `expected an error status, got ${res.status}`);
    });

    it('N4 — an unauthenticated request to the driver-only incident list is rejected', async () => {
        const res = await request(app).get('/api/incidents/my');
        assert.strictEqual(res.status, 403);
    });
});
