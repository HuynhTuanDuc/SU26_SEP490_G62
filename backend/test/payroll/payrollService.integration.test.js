const { describe, it, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert');
const { PostgreSqlContainer } = require('@testcontainers/postgresql');
const fs = require('fs');
const path = require('path');

let container;
let pool;
let payrollService;

describe('Payroll Service Integration Tests (L2)', () => {
    before(async () => {
        container = await new PostgreSqlContainer("postgres:16-alpine").start();
        process.env.DB_HOST = container.getHost();
        process.env.DB_PORT = container.getPort();
        process.env.DB_NAME = container.getDatabase();
        process.env.DB_USER = container.getUsername();
        process.env.DB_PASSWORD = container.getPassword();

        pool = require('../../config/database');
        const schemaPath = path.join(__dirname, '../../../DB script/DB script.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');
        await pool.query(schema);

        payrollService = require('../../services/payrollService');
    });

    after(async () => {
        if (pool) await pool.end();
        if (container) await container.stop();
    });

    beforeEach(async () => {
        await pool.query('TRUNCATE payrolls, salary_advances, kpi_records, debts, debt_payments, leave_requests, vehicle_groups, drivers, profiles, roles, accounts RESTART IDENTITY CASCADE');
        await pool.query(`INSERT INTO roles (id, name) VALUES (2, 'driver') ON CONFLICT DO NOTHING`);
        await pool.query(`INSERT INTO accounts (id, email, password_hash, role_id) VALUES (1, 'driver@test.com', 'hash', 2) ON CONFLICT DO NOTHING`);
        await pool.query(`INSERT INTO profiles (id, full_name, role_id) VALUES (1, 'Driver', 2) ON CONFLICT DO NOTHING`);
        await pool.query(`INSERT INTO drivers (profile_id, license_number, hire_date) VALUES (1, 'L123', CURRENT_DATE)`);
    });

    it('should create and retrieve salary advances', async () => {
        const RealDate = Date;
        global.Date = class extends RealDate {
            constructor() {
                super();
                return new RealDate('2025-05-25T00:00:00Z'); // 25th
            }
            getDate() { return 25; }
        };

        try {
            const advance = await payrollService.requestSalaryAdvance(1, { amount: 1000000, requestMonth: 5, requestYear: 2025, reason: 'test' });
            assert.strictEqual(Number(advance.amount), 1000000);
            assert.strictEqual(advance.status, 'pending');

            const fetches = await payrollService.getMyAdvances(1);
            assert.strictEqual(fetches.length, 1);
            assert.strictEqual(fetches[0].reason, 'test');
        } finally {
            global.Date = RealDate;
        }
    });

    it('getMyPayrolls() reads back finalized payroll rows for the driver', async () => {
        await pool.query(`
            INSERT INTO payrolls (driver_id, payroll_month, payroll_year, base_salary, months_of_service, revenue_bonus, status)
            VALUES (1, 5, 2025, 9000000, 13, 200000, 'paid')
        `);

        const rows = await payrollService.getMyPayrolls(1, { month: 5, year: 2025 });

        assert.strictEqual(rows.length, 1);
        assert.strictEqual(Number(rows[0].net_salary), 9200000);
        assert.strictEqual(rows[0].status, 'paid');
        assert.strictEqual(rows[0].months_of_service, 13);
    });

    it('getMyPayrolls() rejects an out-of-range month', async () => {
        await assert.rejects(
            () => payrollService.getMyPayrolls(1, { month: 13 }),
            { message: 'Tháng không hợp lệ (1-12)' },
        );
    });

    it('getPayrollEstimate() aggregates hire date, unpaid leave, KPI revenue, advances and driver debt from the real schema', async () => {
        // Driver hired 13 months before the estimate period -> base salary tier = 9,000,000
        await pool.query(`UPDATE drivers SET hire_date = '2024-04-01', revenue_share_percent = 15 WHERE profile_id = 1`);

        await pool.query(`
            INSERT INTO leave_requests (driver_id, leave_date, leave_type, status)
            VALUES (1, '2025-05-10', 'unpaid', 'approved')
        `);

        const group = await pool.query(`INSERT INTO vehicle_groups (name, price_per_km) VALUES ('Group Payroll', 10000) RETURNING id`);
        await pool.query(`
            INSERT INTO kpi_records (driver_id, vehicle_group_id, month, year, completed_shipments, total_revenue)
            VALUES (1, $1, 5, 2025, 10, 20000000)
        `, [group.rows[0].id]);

        await pool.query(`
            INSERT INTO salary_advances (driver_id, amount, request_month, request_year, status)
            VALUES (1, 1000000, 5, 2025, 'paid')
        `);

        await pool.query(`
            INSERT INTO debts (debt_type, driver_id, total_amount) VALUES ('driver', 1, 500000)
        `);

        const estimate = await payrollService.getPayrollEstimate(1, { month: 5, year: 2025 });

        assert.strictEqual(estimate.months_of_service, 13);
        assert.strictEqual(Number(estimate.base_salary), 9000000);
        assert.strictEqual(estimate.unpaid_days, 1);
        assert.strictEqual(estimate.actual_working_days, 27);
        assert.strictEqual(Number(estimate.total_revenue), 20000000);
        assert.strictEqual(Number(estimate.revenue_bonus), 20000000 * 0.15);
        assert.strictEqual(Number(estimate.advance_deduction), 1000000);
        assert.strictEqual(Number(estimate.driver_debt_deduction), 500000);
    });

    it('getPayrollEstimate() rejects an invalid month', async () => {
        await assert.rejects(
            () => payrollService.getPayrollEstimate(1, { month: 13, year: 2025 }),
            { message: 'Tháng không hợp lệ' },
        );
    });
});
