const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { setupTestDb } = require('../helpers/testDb');

let pool;
let teardown;
let kpiService;

describe('Kpi Service Integration Tests (L2)', () => {
    before(async () => {
        ({ pool, teardown } = await setupTestDb());
        kpiService = require('../../services/kpiService');
    });

    after(async () => {
        await teardown();
    });

    beforeEach(async () => {
        await pool.query(`
            TRUNCATE kpi_records, shipment_assignment_history, order_shipments, orders,
                     vehicles, vehicle_groups, drivers, profiles, roles, accounts
            RESTART IDENTITY CASCADE
        `);
        await pool.query(`INSERT INTO roles (id, name) VALUES (2, 'driver') ON CONFLICT DO NOTHING`);
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
        await pool.query(`INSERT INTO orders (id, created_by) VALUES (1, 1)`);
    });

    it('BR-030: recalculateAfterCompletion() aggregates completed shipments and revenue into kpi_records', async () => {
        await pool.query(`
            INSERT INTO order_shipments (id, order_id, shipment_index, vehicle_group_id, status, estimated_price, completed_at)
            VALUES (1, 1, 1, 1, 'completed', 500000, NOW())
        `);
        await pool.query(`
            INSERT INTO shipment_assignment_history (shipment_id, to_driver_id, to_vehicle_id, changed_by, change_reason)
            VALUES (1, 1, 1, 1, 'self_claim')
        `);

        const now = new Date();
        kpiService.recalculateAfterCompletion([1], now);

        let kpiRow = null;
        for (let i = 0; i < 20 && !kpiRow; i += 1) {
            await new Promise((r) => setTimeout(r, 50));
            const res = await pool.query(
                'SELECT completed_shipments, total_revenue FROM kpi_records WHERE driver_id = 1 AND month = $1 AND year = $2',
                [now.getMonth() + 1, now.getFullYear()],
            );
            kpiRow = res.rows[0] ?? null;
        }
        assert.ok(kpiRow, 'expected a kpi_records row to be upserted');
        assert.strictEqual(Number(kpiRow.completed_shipments), 1);
        assert.strictEqual(Number(kpiRow.total_revenue), 500000);
    });

    it('getMyKPI() reads back the record for a specific month/year', async () => {
        await pool.query(`
            INSERT INTO kpi_records (driver_id, vehicle_group_id, month, year, completed_shipments, total_revenue)
            VALUES (1, 1, 10, 2024, 5, 2500000)
        `);

        const rows = await kpiService.getMyKPI(1, { month: 10, year: 2024 });

        assert.strictEqual(rows.length, 1);
        assert.strictEqual(Number(rows[0].completed_shipments), 5);
    });

    it('BR-028: getLeaderboard() ranks drivers within the same vehicle group only', async () => {
        await pool.query(`
            INSERT INTO kpi_records (driver_id, vehicle_group_id, month, year, completed_shipments, total_revenue) VALUES
            (1, 1, 10, 2024, 5, 2000000),
            (2, 1, 10, 2024, 8, 5000000)
        `);

        const result = await kpiService.getLeaderboard(1, { month: 10, year: 2024 });

        assert.strictEqual(result.vehicle_group_name, '5m2');
        assert.strictEqual(result.total_in_group, 2);
        // Driver 2 has more revenue -> rank 1; driver 1 (the caller) should show as rank 2
        const me = result.leaderboard.find((r) => r.is_me);
        assert.strictEqual(Number(me.driver_id), 1);
        assert.strictEqual(Number(me.revenue_rank), 2);
    });

    it('throws when a driver with no vehicle group requests the leaderboard', async () => {
        await pool.query(`
            INSERT INTO accounts (id, email, password_hash, role_id) VALUES (3, 'driver3@test.com', 'hash', 2)
        `);
        await pool.query(`INSERT INTO profiles (id, full_name, role_id) VALUES (3, 'Driver Three', 2)`);
        // Driver 3 has no row in `drivers` at all -> no vehicle group

        await assert.rejects(
            () => kpiService.getLeaderboard(3, { month: 10, year: 2024 }),
            { message: 'Driver chưa được gán xe — không thể xem bảng xếp hạng' },
        );
    });
});
