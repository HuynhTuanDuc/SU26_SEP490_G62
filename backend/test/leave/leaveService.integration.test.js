const { describe, it, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert');
const { PostgreSqlContainer } = require('@testcontainers/postgresql');
const fs = require('fs');
const path = require('path');

let container;
let pool;
let leaveService;

describe('Leave Service Integration Tests (L2)', () => {
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

        leaveService = require('../../services/leaveService');
    });

    after(async () => {
        if (pool) await pool.end();
        if (container) await container.stop();
    });

    beforeEach(async () => {
        await pool.query('TRUNCATE leave_requests, drivers, profiles, roles, accounts RESTART IDENTITY CASCADE');
        await pool.query(`INSERT INTO roles (id, name) VALUES (2, 'driver') ON CONFLICT DO NOTHING`);
        await pool.query(`INSERT INTO accounts (id, email, password_hash, role_id) VALUES (1, 'driver@test.com', 'hash', 2) ON CONFLICT DO NOTHING`);
        await pool.query(`INSERT INTO profiles (id, full_name, role_id) VALUES (1, 'Driver', 2) ON CONFLICT DO NOTHING`);
        await pool.query(`INSERT INTO drivers (profile_id, license_number, hire_date) VALUES (1, 'L123', CURRENT_DATE)`);
    });

    it('should create and retrieve leaves', async () => {
        const leave = await leaveService.createLeave(1, { leaveDate: '2026-10-10', leaveType: 'paid', reason: 'sick' });
        assert.strictEqual(leave.leave_type, 'paid');
        assert.strictEqual(leave.status, 'approved');

        const leaves = await leaveService.getMyLeaves(1, { month: 10, year: 2026 });
        assert.strictEqual(leaves.length, 1);
        assert.strictEqual(leaves[0].reason, 'sick');
    });

    it('should get summary of leaves', async () => {
        await leaveService.createLeave(1, { leaveDate: '2026-10-01', leaveType: 'unpaid' });
        await leaveService.createLeave(1, { leaveDate: '2026-10-02', leaveType: 'paid' });

        const summary = await leaveService.getSummary(1, { month: 10, year: 2026 });
        assert.strictEqual(Number(summary.total_leaves), 2);
        assert.strictEqual(Number(summary.unpaid_days), 1);
        assert.strictEqual(Number(summary.paid_days), 1);
        assert.strictEqual(Number(summary.working_days), 27); // 28 - 1 unpaid
    });

    it('should delete future leave but not past leave', async () => {
        // Future leave
        const leave1 = await leaveService.createLeave(1, { leaveDate: '2099-01-01', leaveType: 'paid' });
        const deleted = await leaveService.deleteLeave(leave1.id, 1);
        assert.strictEqual(deleted.id, leave1.id);

        // Past leave (mocking direct insert to bypass rules for testing)
        await pool.query(`INSERT INTO leave_requests (id, driver_id, leave_date, leave_type, status) VALUES (99, 1, '2000-01-01', 'paid', 'approved')`);
        
        await assert.rejects(
            leaveService.deleteLeave(99, 1),
            /Không thể huỷ đăng ký nghỉ đã qua/
        );
    });
});
