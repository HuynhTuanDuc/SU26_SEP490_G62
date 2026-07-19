/**
 * L3-FLOW-06 — Luồng System API: Vòng đời quản lý xe & bảo dưỡng qua HTTP thật
 *
 * Tương ứng L2-FLOW-06 (integration) nhưng đi qua HTTP thật:
 *   [manager]  POST /api/admin/vehicle-groups, /api/admin/vehicles (tạo điều kiện tiên quyết)
 *   [driver]   POST /api/drivers/maintenance/request
 *   [manager]  POST /api/admin/maintenance-requests/:id/approve
 *   [driver]   POST /api/drivers/maintenance/:vehicleId/bills, /complete
 *   [manager]  POST /api/admin/vehicles/:id/verify-maintenance
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
let mgrToken;
let driverToken;

const img = () => Buffer.from('fake-bill-bytes');

beforeAll(async () => {
    ({ pool, teardown } = await setupTestDb());

    app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use('/', require('../../routes'));

    await pool.query(`
        TRUNCATE vehicle_status_history, vehicle_driver_assignments, maintenance_records, incidents,
                 order_shipments, orders, customers, vehicles, vehicle_groups, drivers, profiles, roles, accounts
        RESTART IDENTITY CASCADE
    `);
    await pool.query(`INSERT INTO roles (id, name) VALUES (1,'manager'),(2,'coordinator'),(3,'accountant'),(4,'driver')`);
    await pool.query(`
        INSERT INTO accounts (id, email, password_hash, role_id) VALUES
        (1,'manager@test.com',$1,1),(4,'driverA@test.com',$1,4)
    `, [TEST_PASSWORD_HASH]);
    await pool.query(`INSERT INTO profiles (id, full_name, role_id) VALUES (1,'Manager',1),(4,'Driver A',4)`);
    await pool.query(`INSERT INTO drivers (profile_id, vehicle_id, license_number, hire_date) VALUES (4, NULL, 'DL-A', CURRENT_DATE)`);
});

afterAll(async () => {
    await teardown();
});

describe('L3-FLOW-06 — API: Manager tạo xe → Driver yêu cầu bảo dưỡng → Manager duyệt → Driver hoàn tất → Manager xác minh', () => {
    it('B1 — Mỗi vai trò đăng nhập THẬT qua HTTP (POST /auth/login) trước khi bắt đầu luồng', async () => {
        mgrToken = await loginAs(app, 'manager@test.com');
        driverToken = await loginAs(app, 'driverA@test.com');
    });

    it('B2 [manager] — tạo nhóm xe + xe qua HTTP (điều kiện tiên quyết); driver không gọi được API quản lý xe', async () => {
        const forbidden = await request(app).post('/api/admin/vehicle-groups')
            .set('Authorization', `Bearer ${driverToken}`).send({ name: 'Xe 5m2', price_per_km: 15000 });
        assert.strictEqual(forbidden.status, 403);

        const group = await request(app).post('/api/admin/vehicle-groups')
            .set('Authorization', `Bearer ${mgrToken}`).send({ name: 'Xe 5m2', price_per_km: 15000 });
        assert.ok([200, 201].includes(group.status), `create vehicle group failed: ${group.status} ${JSON.stringify(group.body)}`);
        const groupId = group.body.id ?? group.body.vehicleGroup?.id ?? group.body.group?.id;
        assert.ok(groupId, 'phải trả về id nhóm xe vừa tạo');

        const vehicle = await request(app).post('/api/admin/vehicles')
            .set('Authorization', `Bearer ${mgrToken}`)
            .send({ plate_number: '51E-888.88', vehicle_group_id: groupId, assigned_driver_id: 4 });
        assert.ok([200, 201].includes(vehicle.status), `create vehicle failed: ${vehicle.status} ${JSON.stringify(vehicle.body)}`);
        const v = vehicle.body.vehicle ?? vehicle.body;
        assert.strictEqual(v.status, 'active');
    });

    it('B3 [driver] — gửi yêu cầu bảo dưỡng qua HTTP (multipart hóa đơn nháp) → status=requested', async () => {
        const res = await request(app).post('/api/drivers/maintenance/request')
            .set('Authorization', `Bearer ${driverToken}`)
            .field('maintenance_type', 'repair')
            .field('reason', 'Xe co tieng keu la o dong co')
            .attach('bills', img(), 'draft.jpg');
        assert.ok([200, 201].includes(res.status), `request maintenance failed: ${res.status} ${JSON.stringify(res.body)}`);

        const { rows: [record] } = await pool.query(`SELECT status FROM maintenance_records WHERE status = 'requested'`);
        assert.ok(record, 'phải tạo bản ghi bảo dưỡng qua API');

        // notificationService thật được gọi bên trong driverService.requestMaintenance —
        // manager phải nhận thông báo ngay, không phải chờ vào xem danh sách mới biết.
        const { rows: [notif] } = await pool.query(
            `SELECT title FROM notifications WHERE user_id = 1 ORDER BY id DESC LIMIT 1`,
        );
        assert.ok(notif, 'manager phải nhận được thông báo khi driver gửi yêu cầu bảo dưỡng');
    });

    it('B4 [manager] — xem danh sách yêu cầu và duyệt qua HTTP → xe chuyển MAINTENANCE', async () => {
        const list = await request(app).get('/api/admin/maintenance-requests').set('Authorization', `Bearer ${mgrToken}`);
        assert.strictEqual(list.status, 200);
        const pending = (list.body.requests ?? list.body)[0];
        assert.ok(pending, 'manager phải thấy yêu cầu bảo dưỡng đang chờ');

        const approve = await request(app).post(`/api/admin/maintenance-requests/${pending.id}/approve`)
            .set('Authorization', `Bearer ${mgrToken}`).send({ note: 'Duyet cho sua chua' });
        assert.strictEqual(approve.status, 200);

        const { rows: [vehicle] } = await pool.query(`SELECT status FROM vehicles WHERE plate_number = '51E-888.88'`);
        assert.strictEqual(vehicle.status, 'maintenance');
    });

    it('B5 [driver] — upload thêm hóa đơn và hoàn tất bảo dưỡng qua HTTP (kèm chi phí)', async () => {
        const { rows: [vehicle] } = await pool.query(`SELECT id FROM vehicles WHERE plate_number = '51E-888.88'`);

        const uploadBill = await request(app).post(`/api/drivers/maintenance/${vehicle.id}/bills`)
            .set('Authorization', `Bearer ${driverToken}`).attach('bill', img(), 'final.jpg');
        assert.strictEqual(uploadBill.status, 200);

        const complete = await request(app).post(`/api/drivers/maintenance/${vehicle.id}/complete`)
            .set('Authorization', `Bearer ${driverToken}`).send({ cost: 850000 });
        assert.ok([200, 201].includes(complete.status), `complete maintenance failed: ${complete.status} ${JSON.stringify(complete.body)}`);

        const { rows: [record] } = await pool.query(`SELECT status, cost FROM maintenance_records WHERE vehicle_id = $1 ORDER BY id DESC LIMIT 1`, [vehicle.id]);
        assert.strictEqual(record.status, 'pending_verification');
        assert.strictEqual(Number(record.cost), 850000);
    });

    it('B6 [manager] — xác minh qua HTTP → xe trở về ACTIVE; driver không tự xác minh được', async () => {
        const { rows: [vehicle] } = await pool.query(`SELECT id FROM vehicles WHERE plate_number = '51E-888.88'`);

        const forbidden = await request(app).post(`/api/admin/vehicles/${vehicle.id}/verify-maintenance`)
            .set('Authorization', `Bearer ${driverToken}`).send({});
        assert.strictEqual(forbidden.status, 403);

        const verify = await request(app).post(`/api/admin/vehicles/${vehicle.id}/verify-maintenance`)
            .set('Authorization', `Bearer ${mgrToken}`).send({ verification_note: 'Da kiem tra' });
        assert.strictEqual(verify.status, 200);

        const { rows: [v] } = await pool.query('SELECT status FROM vehicles WHERE id = $1', [vehicle.id]);
        assert.strictEqual(v.status, 'active');
    });
});

describe('L3-FLOW-06 — Negative paths over HTTP (validation, trạng thái không hợp lệ, authZ)', () => {
    it('N1 — Tạo nhóm xe trùng tên qua HTTP bị từ chối', async () => {
        const res = await request(app).post('/api/admin/vehicle-groups')
            .set('Authorization', `Bearer ${mgrToken}`).send({ name: 'Xe 5m2', price_per_km: 20000 });
        assert.ok(res.status >= 400, `expected an error status, got ${res.status}`);
    });

    it('N2 — Tạo xe với biển số đã tồn tại qua HTTP bị từ chối', async () => {
        const { rows: [group] } = await pool.query(`SELECT id FROM vehicle_groups WHERE name = 'Xe 5m2'`);
        const res = await request(app).post('/api/admin/vehicles')
            .set('Authorization', `Bearer ${mgrToken}`).send({ plate_number: '51E-888.88', vehicle_group_id: group.id });
        assert.ok(res.status >= 400, `expected an error status, got ${res.status}`);
    });

    it('N3 — Gửi yêu cầu bảo dưỡng lần 2 khi yêu cầu trước còn đang mở qua HTTP bị chặn', async () => {
        const first = await request(app).post('/api/drivers/maintenance/request')
            .set('Authorization', `Bearer ${driverToken}`)
            .field('maintenance_type', 'inspection').field('reason', 'Kiem tra dinh ky');
        assert.ok([200, 201].includes(first.status));

        const second = await request(app).post('/api/drivers/maintenance/request')
            .set('Authorization', `Bearer ${driverToken}`)
            .field('maintenance_type', 'repair').field('reason', 'Yeu cau thu 2');
        assert.ok(second.status >= 400, `expected an error status, got ${second.status}`);
    });

    it('N4 — Từ chối yêu cầu bảo dưỡng qua HTTP mà không ghi lý do bị chặn', async () => {
        const { rows: [record] } = await pool.query(`SELECT id FROM maintenance_records WHERE status = 'requested'`);
        const res = await request(app).post(`/api/admin/maintenance-requests/${record.id}/reject`)
            .set('Authorization', `Bearer ${mgrToken}`).send({});
        assert.ok(res.status >= 400, `expected an error status, got ${res.status}`);

        const reject = await request(app).post(`/api/admin/maintenance-requests/${record.id}/reject`)
            .set('Authorization', `Bearer ${mgrToken}`).send({ reason: 'Khong can thiet' });
        assert.strictEqual(reject.status, 200);
    });

    it('N5 — Hoàn tất bảo dưỡng qua HTTP khi chưa có ảnh hóa đơn nào bị chặn', async () => {
        const { rows: [vehicle] } = await pool.query(`SELECT id FROM vehicles WHERE plate_number = '51E-888.88'`);
        const create = await request(app).post('/api/drivers/maintenance/request')
            .set('Authorization', `Bearer ${driverToken}`)
            .field('maintenance_type', 'repair').field('reason', 'Test khong anh hoa don');
        assert.ok([200, 201].includes(create.status));
        const { rows: [record] } = await pool.query(`SELECT id FROM maintenance_records WHERE status = 'requested'`);
        await request(app).post(`/api/admin/maintenance-requests/${record.id}/approve`).set('Authorization', `Bearer ${mgrToken}`).send({});

        const res = await request(app).post(`/api/drivers/maintenance/${vehicle.id}/complete`)
            .set('Authorization', `Bearer ${driverToken}`).send({ cost: 100000 });
        assert.ok(res.status >= 400, `expected an error status, got ${res.status}`);
    });

    it('N6 — Đánh dấu xe hỏng qua HTTP khi xe đang trong đợt bảo dưỡng (không phải ACTIVE) bị chặn', async () => {
        const { rows: [vehicle] } = await pool.query(`SELECT id FROM vehicles WHERE plate_number = '51E-888.88'`);
        const res = await request(app).post(`/api/admin/vehicles/${vehicle.id}/mark-broken`)
            .set('Authorization', `Bearer ${mgrToken}`).send({ failure_type: 'engine', description: 'Test danh dau hong khi dang bao duong' });
        assert.ok(res.status >= 400, `expected an error status, got ${res.status}`);
    });

    it('N7 — Một driver token gọi API quản lý xe (manager-only) bị từ chối', async () => {
        const res = await request(app).get('/api/admin/vehicles').set('Authorization', `Bearer ${driverToken}`);
        assert.strictEqual(res.status, 403);
    });
});
