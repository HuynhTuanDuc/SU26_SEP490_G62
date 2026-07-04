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
        await pool.query('TRUNCATE payrolls, salary_advances, drivers, profiles, roles, accounts RESTART IDENTITY CASCADE');
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
});
