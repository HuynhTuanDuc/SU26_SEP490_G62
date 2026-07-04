const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { setupTestDb } = require('../helpers/testDb');

let pool;
let teardown;
let tripService;

describe('Trip Service Integration Tests (L2)', () => {
    before(async () => {
        ({ pool, teardown } = await setupTestDb());
        tripService = require('../../services/tripService');
    });

    after(async () => {
        await teardown();
    });

    beforeEach(async () => {
        await pool.query(`
            TRUNCATE shipment_assignment_history, trip_stops, order_receipt_requests,
                     shipment_receipts, order_shipments, orders, maintenance_records,
                     vehicles, vehicle_groups, drivers, profiles, roles, accounts
            RESTART IDENTITY CASCADE
        `);
        await pool.query(`INSERT INTO roles (id, name) VALUES (2, 'driver') ON CONFLICT DO NOTHING`);
        // Driver 1 + Driver 2, each with their own active vehicle
        await pool.query(`
            INSERT INTO accounts (id, email, password_hash, role_id) VALUES
            (1, 'driver1@test.com', 'hash', 2),
            (2, 'driver2@test.com', 'hash', 2)
        `);
        await pool.query(`
            INSERT INTO profiles (id, full_name, role_id) VALUES
            (1, 'Driver One', 2),
            (2, 'Driver Two', 2)
        `);
        await pool.query(`INSERT INTO vehicle_groups (id, name, price_per_km) VALUES (1, '5m2', 15000)`);
        await pool.query(`
            INSERT INTO vehicles (id, plate_number, vehicle_group_id, assigned_driver_id, status) VALUES
            (1, '29A-11111', 1, 1, 'active'),
            (2, '29A-22222', 1, 2, 'active')
        `);
        await pool.query(`
            INSERT INTO drivers (profile_id, vehicle_id, license_number, hire_date) VALUES
            (1, 1, 'L1', CURRENT_DATE),
            (2, 2, 'L2', CURRENT_DATE)
        `);
        await pool.query(`INSERT INTO orders (id, created_by, payment_type) VALUES (1, 1, 'cash')`);
        await pool.query(`
            INSERT INTO order_shipments (id, order_id, shipment_index, vehicle_group_id, status)
            VALUES (1, 1, 1, 1, 'available')
        `);
    });

    it('BR-005: claimTrip() atomically claims an available shipment for the driver', async () => {
        const claimed = await tripService.claimTrip(1, 1);
        assert.strictEqual(claimed.status, 'claimed');

        const view = await pool.query('SELECT owner_driver_id FROM v_shipment_current WHERE shipment_id = 1');
        assert.strictEqual(view.rows[0].owner_driver_id, 1);

        const history = await pool.query(`SELECT change_reason FROM shipment_assignment_history WHERE shipment_id = 1`);
        assert.strictEqual(history.rows[0].change_reason, 'self_claim');
    });

    it('BR-006: rejects a second claim while the driver (and their fixed vehicle, BR-001) already has an active trip', async () => {
        await tripService.claimTrip(1, 1);
        await pool.query(`
            INSERT INTO order_shipments (id, order_id, shipment_index, vehicle_group_id, status)
            VALUES (2, 1, 2, 1, 'available')
        `);

        // Since 1 driver <-> 1 vehicle (BR-001), the repository's vehicle-level active-trip
        // check fires before the driver-level one for this exact scenario — both guard the
        // same real-world rule (driver cannot hold two shipments at once).
        await assert.rejects(
            () => tripService.claimTrip(2, 1),
            { message: 'Xe đang có chuyến đang hoạt động, không thể nhận thêm chuyến mới' },
        );
    });

    it('BR-007: concurrent claim — only one of two drivers wins the atomic race', async () => {
        await pool.query(`
            INSERT INTO order_shipments (id, order_id, shipment_index, vehicle_group_id, status)
            VALUES (3, 1, 3, 1, 'available')
        `);

        const results = await Promise.allSettled([
            tripService.claimTrip(3, 1),
            tripService.claimTrip(3, 2),
        ]);

        const fulfilled = results.filter((r) => r.status === 'fulfilled');
        const rejected  = results.filter((r) => r.status === 'rejected');
        assert.strictEqual(fulfilled.length, 1);
        assert.strictEqual(rejected.length, 1);
        assert.match(rejected[0].reason.message, /ALREADY_CLAIMED/);
    });

    it('BR-012/013: startTransit() with proof moves picking -> transit and records the timestamp', async () => {
        await tripService.claimTrip(1, 1);
        await tripService.updateStatus(1, 1, 'picking');

        const updated = await tripService.startTransit(1, 1, 'https://proof.jpg');

        assert.strictEqual(updated.status, 'transit');
        const row = await pool.query('SELECT transit_at FROM order_shipments WHERE id = 1');
        assert.notStrictEqual(row.rows[0].transit_at, null);
    });

    it('BR-013: startTransit() without proof and without pickup stops is rejected — DB left unchanged', async () => {
        await tripService.claimTrip(1, 1);
        await tripService.updateStatus(1, 1, 'picking');

        await assert.rejects(
            () => tripService.startTransit(1, 1, null),
            { message: 'Ảnh xác nhận lấy hàng là bắt buộc (BR-013)' },
        );

        const row = await pool.query('SELECT status FROM order_shipments WHERE id = 1');
        assert.strictEqual(row.rows[0].status, 'picking');
    });

    it('BR-015/030: completeTrip() marks the shipment completed and upserts a kpi_records row', async () => {
        await tripService.claimTrip(1, 1);
        await tripService.updateStatus(1, 1, 'picking');
        await tripService.startTransit(1, 1, 'https://proof-load.jpg');
        await tripService.updateStatus(1, 1, 'arrived');

        await tripService.completeTrip(1, 1, 'https://proof-deliver.jpg');

        const row = await pool.query('SELECT status, completed_at FROM order_shipments WHERE id = 1');
        assert.strictEqual(row.rows[0].status, 'completed');
        assert.notStrictEqual(row.rows[0].completed_at, null);

        // recalculateAfterCompletion() is fire-and-forget — poll briefly for the async KPI upsert.
        const now = new Date();
        let kpiRow = null;
        for (let i = 0; i < 20 && !kpiRow; i += 1) {
            await new Promise((r) => setTimeout(r, 50));
            const res = await pool.query(
                `SELECT completed_shipments FROM kpi_records WHERE driver_id = 1 AND month = $1 AND year = $2`,
                [now.getMonth() + 1, now.getFullYear()],
            );
            kpiRow = res.rows[0] ?? null;
        }
        assert.ok(kpiRow, 'expected kpi_records row to be upserted after trip completion');
        assert.strictEqual(Number(kpiRow.completed_shipments), 1);
    });

    it('BR-008B/018: requestOrderReceipt() on the final shipment of a cash order creates a pending receipt request', async () => {
        await tripService.claimTrip(1, 1);
        await tripService.updateStatus(1, 1, 'picking');
        await tripService.startTransit(1, 1, 'https://proof-load.jpg');
        await tripService.updateStatus(1, 1, 'arrived');
        await tripService.completeTrip(1, 1, 'https://proof-deliver.jpg');

        const result = await tripService.requestOrderReceipt(1, 1, { shipmentId: 1, actualKm: 180 });

        assert.strictEqual(result.receipt_request_created, true);
        const km = await pool.query('SELECT actual_distance_km FROM order_shipments WHERE id = 1');
        assert.strictEqual(Number(km.rows[0].actual_distance_km), 180);

        const request = await pool.query('SELECT status FROM order_receipt_requests WHERE order_id = 1');
        assert.strictEqual(request.rows[0].status, 'pending');
    });

    it('BR-018B: a second request for the same order is rejected — unique constraint enforced at DB level', async () => {
        await tripService.claimTrip(1, 1);
        await tripService.updateStatus(1, 1, 'picking');
        await tripService.startTransit(1, 1, 'https://proof-load.jpg');
        await tripService.updateStatus(1, 1, 'arrived');
        await tripService.completeTrip(1, 1, 'https://proof-deliver.jpg');
        await tripService.requestOrderReceipt(1, 1, { shipmentId: 1, actualKm: 180 });

        await assert.rejects(
            () => tripService.requestOrderReceipt(1, 1, { shipmentId: 1, actualKm: 190 }),
            { message: 'Đơn hàng này đã có yêu cầu tạo phiếu thu rồi (BR-018B)' },
        );

        const count = await pool.query('SELECT COUNT(*) FROM order_receipt_requests WHERE order_id = 1');
        assert.strictEqual(Number(count.rows[0].count), 1);
    });

    it('recordReceiptCollection(): cash_collected updates the receipt payment_type (coordinator-approved flow)', async () => {
        // recordReceiptCollection() joins shipment_receipts to the order_receipt_requests row
        // it was created from (order_receipt_request_id) and matches on orr.driver_id — this
        // mirrors the coordinator-approval flow, not a bare shipment_receipts row.
        await pool.query(`
            INSERT INTO order_receipt_requests (id, order_id, requesting_shipment_id, driver_id, status)
            VALUES (1, 1, 1, 1, 'approved')
        `);
        await pool.query(`
            INSERT INTO shipment_receipts (id, shipment_id, amount, collected_by, order_receipt_request_id)
            VALUES (1, 1, 500000, 1, 1)
        `);

        await tripService.recordReceiptCollection(1, 1, { paymentType: 'cash_collected', proofUrl: 'https://proof.jpg' });

        const receipt = await pool.query('SELECT payment_type FROM shipment_receipts WHERE id = 1');
        assert.strictEqual(receipt.rows[0].payment_type, 'cash_collected');
    });
});
