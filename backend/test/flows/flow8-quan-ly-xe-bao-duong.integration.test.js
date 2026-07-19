/**
 * L2-FLOW-06 — Luồng: Vòng đời quản lý xe & bảo dưỡng
 *
 * Test THEO LUỒNG nghiệp vụ thật, không phải CRUD rời rạc từng endpoint:
 *
 *   Manager tạo nhóm xe + xe (điều kiện tiên quyết để vận hành)
 *   → Driver yêu cầu bảo dưỡng (status=requested)
 *   → Manager duyệt (status=open, xe chuyển MAINTENANCE)
 *   → Driver upload hóa đơn + hoàn tất (status=pending_verification)
 *   → Manager xác minh (status=completed, xe về ACTIVE)
 *
 *   Luồng phụ: xe hỏng giữa vận hành (manager ghi nhận sự cố qua incidents,
 *   xe → BROKEN) → manager khôi phục (xe → ACTIVE).
 */
const assert = require('node:assert');
const { setupTestDb } = require('../helpers/testDb');

let pool;
let teardown;
let vehicleManagementService;
let driverService;

const MGR_ID = 1;
const DRIVER_A = 4;

beforeAll(async () => {
    ({ pool, teardown } = await setupTestDb());
    vehicleManagementService = require('../../services/vehicleManagementService');
    driverService = require('../../services/driverService');

    await pool.query(`
        TRUNCATE vehicle_status_history, vehicle_driver_assignments, maintenance_records, incidents,
                 order_shipments, orders, customers, vehicles, vehicle_groups, drivers, profiles, roles, accounts
        RESTART IDENTITY CASCADE
    `);
    await pool.query(`INSERT INTO roles (id, name) VALUES (1,'manager'),(2,'coordinator'),(3,'accountant'),(4,'driver')`);
    await pool.query(`
        INSERT INTO accounts (id, email, password_hash, role_id) VALUES
        (1,'manager@test.com','hash',1),(4,'driverA@test.com','hash',4)
    `);
    await pool.query(`
        INSERT INTO profiles (id, full_name, role_id) VALUES (1,'Manager',1),(4,'Driver A',4)
    `);
    // drivers.vehicle_id để NULL — service createVehicle tự cập nhật khi gán tài xế cho xe
    await pool.query(`
        INSERT INTO drivers (profile_id, vehicle_id, license_number, hire_date) VALUES (4, NULL, 'DL-A', CURRENT_DATE)
    `);
});

afterAll(async () => {
    await teardown();
});

describe('L2-FLOW-06 — Vòng đời xe: tạo nhóm xe/xe → driver yêu cầu bảo dưỡng → manager duyệt → driver hoàn tất → manager xác minh', () => {
    it('B1 — Manager tạo nhóm xe và xe (điều kiện tiên quyết để driver vận hành)', async () => {
        const group = await vehicleManagementService.createVehicleGroup({
            name: 'Xe 5m2', price_per_km: 15000, max_load_weight_kg: 2500,
        });
        assert.strictEqual(group.name, 'Xe 5m2');

        const vehicle = await vehicleManagementService.createVehicle({
            plate_number: '51E-999.99', vehicle_group_id: group.id, brand: 'Hyundai', model: 'Mighty',
            assigned_driver_id: DRIVER_A,
        }, MGR_ID);
        assert.strictEqual(vehicle.status, 'active');
        assert.strictEqual(vehicle.assigned_driver_id, DRIVER_A);

        const { rows: [d] } = await pool.query('SELECT vehicle_id, default_vehicle_group_id FROM drivers WHERE profile_id = $1', [DRIVER_A]);
        assert.strictEqual(d.vehicle_id, vehicle.id, 'service phải tự cập nhật drivers.vehicle_id khi gán tài xế lúc tạo xe');
        assert.strictEqual(d.default_vehicle_group_id, group.id);
    });

    it('B2 — Driver gửi yêu cầu bảo dưỡng kèm hóa đơn nháp (status=requested, xe VẪN active)', async () => {
        const { rows: [vehicle] } = await pool.query('SELECT id FROM vehicles WHERE plate_number = $1', ['51E-999.99']);
        const result = await driverService.requestMaintenance(DRIVER_A, {
            maintenance_type: 'repair', reason: 'Xe co tieng keu la o dong co',
        }, ['https://bill.test/draft1.jpg']);
        assert.ok(result.maintenanceRecordId, 'phải tạo được bản ghi bảo dưỡng');

        const { rows: [record] } = await pool.query('SELECT status, vehicle_id FROM maintenance_records WHERE id = $1', [result.maintenanceRecordId]);
        assert.strictEqual(record.status, 'requested');
        assert.strictEqual(record.vehicle_id, vehicle.id);

        const { rows: [v] } = await pool.query('SELECT status FROM vehicles WHERE id = $1', [vehicle.id]);
        assert.strictEqual(v.status, 'active', 'xe chỉ chuyển MAINTENANCE sau khi manager duyệt, không phải lúc gửi yêu cầu');
    });

    it('B3 — Manager duyệt yêu cầu (status=open, xe chuyển MAINTENANCE)', async () => {
        const { rows: [record] } = await pool.query(`SELECT id FROM maintenance_records WHERE status = 'requested'`);
        const vehicle = await vehicleManagementService.approveMaintenanceRequest(record.id, MGR_ID, { note: 'Duyet cho sua chua' });
        assert.strictEqual(vehicle.status, 'maintenance');

        const { rows: [r] } = await pool.query('SELECT status FROM maintenance_records WHERE id = $1', [record.id]);
        assert.strictEqual(r.status, 'open');
    });

    it('B4 — Driver upload thêm hóa đơn và hoàn tất bảo dưỡng kèm chi phí (status=pending_verification)', async () => {
        const { rows: [vehicle] } = await pool.query('SELECT id FROM vehicles WHERE plate_number = $1', ['51E-999.99']);
        await driverService.uploadMaintenanceBill(DRIVER_A, vehicle.id, 'https://bill.test/final.jpg');

        const result = await driverService.completeMaintenance(DRIVER_A, vehicle.id, { cost: 850000 });
        assert.ok(result.maintenanceRecordId);

        const { rows: [record] } = await pool.query('SELECT status, cost, bill_pics FROM maintenance_records WHERE id = $1', [result.maintenanceRecordId]);
        assert.strictEqual(record.status, 'pending_verification');
        assert.strictEqual(Number(record.cost), 850000);
        assert.strictEqual(record.bill_pics.length, 2, 'phải gồm cả ảnh nháp lúc yêu cầu + ảnh upload thêm');
    });

    it('B5 — Manager xác minh → hoàn tất, xe trở về ACTIVE', async () => {
        const { rows: [vehicle] } = await pool.query('SELECT id FROM vehicles WHERE plate_number = $1', ['51E-999.99']);
        const updated = await vehicleManagementService.verifyMaintenance(vehicle.id, MGR_ID, { verification_note: 'Da kiem tra, xe hoat dong tot' });
        assert.strictEqual(updated.status, 'active', 'xác minh xong xe phải trở lại ACTIVE để driver tiếp tục vận hành');

        const { rows: [record] } = await pool.query(`SELECT status, verified_by FROM maintenance_records WHERE vehicle_id = $1 ORDER BY id DESC LIMIT 1`, [vehicle.id]);
        assert.strictEqual(record.status, 'completed');
        assert.strictEqual(record.verified_by, MGR_ID);
    });
});

describe('L2-FLOW-06b — Xe hỏng giữa vận hành → Manager ghi nhận sự cố → Khôi phục', () => {
    it('B1 — Manager ghi nhận xe hỏng đột xuất (không qua luồng yêu cầu bảo dưỡng của driver) → xe chuyển BROKEN', async () => {
        const { rows: [vehicle] } = await pool.query('SELECT id FROM vehicles WHERE plate_number = $1', ['51E-999.99']);
        const updated = await vehicleManagementService.markVehicleAsBroken(vehicle.id, MGR_ID, {
            failure_type: 'engine_failure', description: 'Xe chet may dot ngot tren duong, khong khoi dong lai duoc',
        });
        assert.strictEqual(updated.status, 'broken');

        const { rows: [inc] } = await pool.query(`SELECT status, incident_type FROM incidents WHERE vehicle_id = $1`, [vehicle.id]);
        assert.strictEqual(inc.status, 'open');
        assert.strictEqual(inc.incident_type, 'vehicle_breakdown');
    });

    it('B2 — Manager khôi phục sau khi xử lý xong → xe trở về ACTIVE', async () => {
        const { rows: [vehicle] } = await pool.query('SELECT id FROM vehicles WHERE plate_number = $1', ['51E-999.99']);
        const updated = await vehicleManagementService.restoreVehicle(vehicle.id, MGR_ID, { resolution_note: 'Da sua xong, xe van hanh binh thuong' });
        assert.strictEqual(updated.status, 'active');
    });
});

describe('L2-FLOW-06 — Negative paths (validation, trạng thái không hợp lệ)', () => {
    it('N1 — Tạo nhóm xe trùng tên bị từ chối', async () => {
        await assert.rejects(
            () => vehicleManagementService.createVehicleGroup({ name: 'Xe 5m2', price_per_km: 20000 }),
            /already exists/,
        );
    });

    it('N2 — Tạo xe với biển số đã tồn tại bị từ chối', async () => {
        const { rows: [group] } = await pool.query(`SELECT id FROM vehicle_groups WHERE name = 'Xe 5m2'`);
        await assert.rejects(
            () => vehicleManagementService.createVehicle({ plate_number: '51E-999.99', vehicle_group_id: group.id }, MGR_ID),
            /Plate number already exists/,
        );
    });

    it('N3 — Driver không có xe được gán thì không thể gửi yêu cầu bảo dưỡng', async () => {
        await pool.query(`INSERT INTO accounts (id, email, password_hash, role_id) VALUES (99, 'driverX@test.com', 'hash', 4)`);
        await pool.query(`INSERT INTO profiles (id, full_name, role_id) VALUES (99, 'Driver Ngoai Le', 4)`);
        await pool.query(`INSERT INTO drivers (profile_id, vehicle_id, license_number, hire_date) VALUES (99, NULL, 'DL-X', CURRENT_DATE)`);
        await assert.rejects(
            () => driverService.requestMaintenance(99, { maintenance_type: 'repair', reason: 'Test khong co xe' }, []),
            /chưa được phân công xe/,
        );
    });

    it('N4 — Gửi 2 yêu cầu bảo dưỡng khi yêu cầu trước còn đang mở bị chặn (unique open request)', async () => {
        const { rows: [vehicle] } = await pool.query('SELECT id FROM vehicles WHERE plate_number = $1', ['51E-999.99']);
        await driverService.requestMaintenance(DRIVER_A, { maintenance_type: 'inspection', reason: 'Kiem tra dinh ky' }, []);
        await assert.rejects(
            () => driverService.requestMaintenance(DRIVER_A, { maintenance_type: 'repair', reason: 'Yeu cau thu 2' }, []),
            /đang có yêu cầu hoặc đợt bảo dưỡng chưa hoàn tất/,
        );
        // dọn lại trạng thái cho các case sau: từ chối yêu cầu vừa tạo
        const { rows: [pending] } = await pool.query(`SELECT id FROM maintenance_records WHERE vehicle_id = $1 AND status = 'requested'`, [vehicle.id]);
        await vehicleManagementService.rejectMaintenanceRequest(pending.id, MGR_ID, { reason: 'Khong can thiet, huy de test tiep' });
    });

    it('N5 — Từ chối yêu cầu bảo dưỡng mà không ghi lý do bị chặn', async () => {
        const { rows: [vehicle] } = await pool.query('SELECT id FROM vehicles WHERE plate_number = $1', ['51E-999.99']);
        const result = await driverService.requestMaintenance(DRIVER_A, { maintenance_type: 'repair', reason: 'Yeu cau de test tu choi' }, []);
        await assert.rejects(
            () => vehicleManagementService.rejectMaintenanceRequest(result.maintenanceRecordId, MGR_ID, {}),
            /Cần ghi lý do/,
        );
        await vehicleManagementService.rejectMaintenanceRequest(result.maintenanceRecordId, MGR_ID, { reason: 'Don giep test xong' });
    });

    it('N6 — Hoàn tất bảo dưỡng khi chưa có ảnh hóa đơn nào bị chặn', async () => {
        const { rows: [vehicle] } = await pool.query('SELECT id FROM vehicles WHERE plate_number = $1', ['51E-999.99']);
        const result = await driverService.requestMaintenance(DRIVER_A, { maintenance_type: 'repair', reason: 'Test khong anh hoa don' }, []);
        await vehicleManagementService.approveMaintenanceRequest(result.maintenanceRecordId, MGR_ID, {});
        await assert.rejects(
            () => driverService.completeMaintenance(DRIVER_A, vehicle.id, { cost: 100000 }),
            /At least one maintenance bill image is required/,
        );
        // dọn lại: upload ảnh rồi hoàn tất + xác minh để không ảnh hưởng case sau
        await driverService.uploadMaintenanceBill(DRIVER_A, vehicle.id, 'https://bill.test/cleanup.jpg');
        await driverService.completeMaintenance(DRIVER_A, vehicle.id, { cost: 100000 });
        await vehicleManagementService.verifyMaintenance(vehicle.id, MGR_ID, {});
    });

    it('N7 — Đánh dấu xe hỏng khi xe đang trong trạng thái khác ACTIVE bị chặn', async () => {
        const { rows: [vehicle] } = await pool.query('SELECT id FROM vehicles WHERE plate_number = $1', ['51E-999.99']);
        await vehicleManagementService.markVehicleAsBroken(vehicle.id, MGR_ID, { failure_type: 'x', description: 'Lan hong thu 2 de test' });
        await assert.rejects(
            () => vehicleManagementService.markVehicleAsBroken(vehicle.id, MGR_ID, { failure_type: 'y', description: 'Bao hong lan nua khi da hong' }),
            /not allowed when vehicle status is broken/,
        );
        await vehicleManagementService.restoreVehicle(vehicle.id, MGR_ID, {});
    });

    it('N8 — Cho nghỉ hưu (retire) một xe đang trong đợt bảo dưỡng dở dang bị chặn', async () => {
        const { rows: [vehicle] } = await pool.query('SELECT id FROM vehicles WHERE plate_number = $1', ['51E-999.99']);
        const result = await driverService.requestMaintenance(DRIVER_A, { maintenance_type: 'scheduled', reason: 'Test retire khi dang bao duong' }, ['https://bill.test/x.jpg']);
        await vehicleManagementService.approveMaintenanceRequest(result.maintenanceRecordId, MGR_ID, {});
        await assert.rejects(
            () => vehicleManagementService.retireVehicle(vehicle.id, MGR_ID, {}),
            /Cannot retire a vehicle while maintenance is still open/,
        );
    });
});
