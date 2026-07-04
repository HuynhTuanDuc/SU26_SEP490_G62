const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { setupTestDb } = require('../helpers/testDb');

let pool;
let teardown;
let incidentService;

describe('Incident Service Integration Tests (L2)', () => {
    before(async () => {
        ({ pool, teardown } = await setupTestDb());
        incidentService = require('../../services/incidentService');
    });

    after(async () => {
        await teardown();
    });

    beforeEach(async () => {
        await pool.query(`
            TRUNCATE incident_evidences, incidents, notifications, shipment_assignment_history,
                     order_shipments, orders, vehicles, vehicle_groups, drivers, profiles,
                     roles, accounts
            RESTART IDENTITY CASCADE
        `);
        await pool.query(`
            INSERT INTO roles (id, name) VALUES (2, 'driver'), (3, 'coordinator')
            ON CONFLICT DO NOTHING
        `);
        await pool.query(`
            INSERT INTO accounts (id, email, password_hash, role_id) VALUES
            (1, 'driver@test.com', 'hash', 2),
            (2, 'coordinator@test.com', 'hash', 3)
        `);
        await pool.query(`
            INSERT INTO profiles (id, full_name, role_id) VALUES
            (1, 'Driver One', 2),
            (2, 'Coordinator One', 3)
        `);
        await pool.query(`INSERT INTO vehicle_groups (id, name, price_per_km) VALUES (1, '5m2', 15000)`);
        await pool.query(`INSERT INTO vehicles (id, plate_number, vehicle_group_id, assigned_driver_id, status) VALUES (1, '29A-11111', 1, 1, 'active')`);
        await pool.query(`INSERT INTO drivers (profile_id, vehicle_id, license_number, hire_date) VALUES (1, 1, 'L1', CURRENT_DATE)`);
        await pool.query(`INSERT INTO orders (id, created_by) VALUES (1, 1)`);
        await pool.query(`INSERT INTO order_shipments (id, order_id, shipment_index, vehicle_group_id, status) VALUES (1, 1, 1, 1, 'transit')`);
        await pool.query(`
            INSERT INTO shipment_assignment_history (shipment_id, to_driver_id, to_vehicle_id, changed_by, change_reason)
            VALUES (1, 1, 1, 1, 'self_claim')
        `);
    });

    it('createIncident() persists the incident, its evidence, and notifies the coordinator', async () => {
        const incident = await incidentService.createIncident(
            1,
            { shipmentId: 1, incidentType: 'vehicle_breakdown', description: 'Xe bị hỏng động cơ giữa đường' },
            ['https://evidence1.jpg', 'https://evidence2.jpg'],
        );

        assert.strictEqual(incident.incident_type, 'vehicle_breakdown');
        assert.strictEqual(incident.status, 'open');

        const evidence = await pool.query('SELECT COUNT(*) FROM incident_evidences WHERE incident_id = $1', [incident.id]);
        assert.strictEqual(Number(evidence.rows[0].count), 2);

        const notif = await pool.query(`SELECT title FROM notifications WHERE user_id = 2 AND type = 'INCIDENT_REPORTED'`);
        assert.strictEqual(notif.rows.length, 1);
    });

    it('rejects a duplicate incident type on the same shipment (DB-checked via getIncidentsByShipment)', async () => {
        await incidentService.createIncident(1, { shipmentId: 1, incidentType: 'vehicle_breakdown', description: 'Xe bị hỏng động cơ' });

        await assert.rejects(
            () => incidentService.createIncident(1, { shipmentId: 1, incidentType: 'vehicle_breakdown', description: 'Lại hỏng xe lần nữa' }),
            (err) => err.message.startsWith('DUPLICATE_TYPE:'),
        );

        const count = await pool.query('SELECT COUNT(*) FROM incidents WHERE shipment_id = 1');
        assert.strictEqual(Number(count.rows[0].count), 1);
    });

    it('updateMyIncident() only succeeds while status is open, and updates the row', async () => {
        const incident = await incidentService.createIncident(1, { shipmentId: 1, incidentType: 'cargo_damage', description: 'Hàng bị vỡ một phần' });

        const updated = await incidentService.updateMyIncident(incident.id, 1, { description: 'Hàng bị vỡ toàn bộ kiện' });
        assert.strictEqual(updated.description, 'Hàng bị vỡ toàn bộ kiện');

        await pool.query(`UPDATE incidents SET status = 'resolved' WHERE id = $1`, [incident.id]);
        await assert.rejects(
            () => incidentService.updateMyIncident(incident.id, 1, { description: 'Sửa lại lần nữa đủ dài ký tự' }),
            { message: 'Chỉ có thể chỉnh sửa sự cố đang ở trạng thái "Đang chờ"' },
        );
    });

    it('BR-023: driver cannot resolve their own incident — only updateIncidentStatus (coordinator) can', async () => {
        const incident = await incidentService.createIncident(1, { shipmentId: 1, incidentType: 'other', description: 'Sự cố khác cần xử lý' });

        const resolved = await incidentService.updateIncidentStatus(incident.id, 2, { status: 'resolved', resolution: 'Đã điều xe hỗ trợ' });

        assert.strictEqual(resolved.status, 'resolved');
        // The driver notification is fire-and-forget (not awaited by updateIncidentStatus) —
        // poll briefly instead of asserting immediately.
        let notif = { rows: [] };
        for (let i = 0; i < 20 && notif.rows.length === 0; i += 1) {
            await new Promise((r) => setTimeout(r, 50));
            notif = await pool.query(`SELECT title FROM notifications WHERE user_id = 1 AND type = 'INCIDENT_FEEDBACK'`);
        }
        assert.strictEqual(notif.rows.length, 1);
    });

    it('BR-024: replacing the driver BEFORE pickup transfers 100% of the revenue (full_transfer)', async () => {
        await pool.query(`
            INSERT INTO accounts (id, email, password_hash, role_id) VALUES (3, 'driver2@test.com', 'hash', 2)
        `);
        await pool.query(`INSERT INTO profiles (id, full_name, role_id) VALUES (3, 'Driver Two', 2)`);
        await pool.query(`INSERT INTO vehicles (id, plate_number, vehicle_group_id, assigned_driver_id, status) VALUES (2, '29A-22222', 1, 3, 'active')`);
        await pool.query(`INSERT INTO drivers (profile_id, vehicle_id, license_number, hire_date) VALUES (3, 2, 'L2', CURRENT_DATE)`);

        const incident = await incidentService.createIncident(1, { shipmentId: 1, incidentType: 'vehicle_breakdown', description: 'Xe hỏng giữa đường cần thay' });

        await incidentService.updateIncidentStatus(incident.id, 2, {
            status: 'resolved',
            resolution: 'Điều xe thay thế',
            replacementDriverId: 3,
        });

        const view = await pool.query('SELECT owner_driver_id, vehicle_id FROM v_shipment_current WHERE shipment_id = 1');
        assert.strictEqual(view.rows[0].owner_driver_id, 3);
        assert.strictEqual(view.rows[0].vehicle_id, 2);

        // No pickup trip_stops were created for this shipment, so pickup_completed_at is NULL
        // -> buildRevenueAllocationPlan() takes the "before pickup" branch: 100% to the
        // replacement driver (full_transfer), not the 50/50 split (which only applies once
        // pickup is already done).
        const allocations = await pool.query('SELECT driver_id, share_percent, allocation_reason FROM shipment_revenue_allocations WHERE shipment_id = 1');
        assert.strictEqual(allocations.rows.length, 1);
        assert.strictEqual(allocations.rows[0].driver_id, 3);
        assert.strictEqual(Number(allocations.rows[0].share_percent), 100);
        assert.strictEqual(allocations.rows[0].allocation_reason, 'incident_full_transfer');
    });
});
