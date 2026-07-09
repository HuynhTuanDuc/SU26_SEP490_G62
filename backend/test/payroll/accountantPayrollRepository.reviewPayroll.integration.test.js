const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { setupTestDb } = require('../helpers/testDb');

let pool;
let teardown;
let accountantPayrollRepository;

// Manager's "finalize/review payroll" step (managerController.reviewPayroll ->
// accountantPayrollRepository.reviewPayroll) — pending -> reviewed, gated on current status.
describe('accountantPayrollRepository.reviewPayroll() — manager payroll review (L2)', () => {
    before(async () => {
        ({ pool, teardown } = await setupTestDb());
        accountantPayrollRepository = require('../../repositories/accountantPayrollRepository');
    });

    after(async () => {
        await teardown();
    });

    beforeEach(async () => {
        await pool.query('TRUNCATE payrolls, profiles, roles, accounts RESTART IDENTITY CASCADE');
        await pool.query(`INSERT INTO roles (id, name) VALUES (1, 'manager'), (2, 'driver') ON CONFLICT DO NOTHING`);
        await pool.query(`INSERT INTO accounts (id, email, password_hash, role_id) VALUES (1, 'manager1@test.com', 'hash', 1), (2, 'driver1@test.com', 'hash', 2)`);
        await pool.query(`INSERT INTO profiles (id, full_name, role_id) VALUES (1, 'Manager One', 1), (2, 'Driver One', 2)`);
        await pool.query(`
            INSERT INTO payrolls (id, driver_id, payroll_month, payroll_year, base_salary, months_of_service, status)
            VALUES (1, 2, 5, 2025, 9000000, 13, 'pending')
        `);
    });

    it('moves a pending payroll to reviewed and stamps the reviewing manager', async () => {
        const row = await accountantPayrollRepository.reviewPayroll(1, 1);

        assert.strictEqual(row.status, 'reviewed');
        assert.strictEqual(row.reviewed_by, 1);
        assert.ok(row.reviewed_at);

        const dbRow = await pool.query('SELECT status, reviewed_by FROM payrolls WHERE id = 1');
        assert.strictEqual(dbRow.rows[0].status, 'reviewed');
        assert.strictEqual(dbRow.rows[0].reviewed_by, 1);
    });

    it('rejects a payroll that is not pending (already reviewed)', async () => {
        await pool.query(`UPDATE payrolls SET status = 'reviewed' WHERE id = 1`);

        await assert.rejects(
            () => accountantPayrollRepository.reviewPayroll(1, 1),
            { message: 'Không tìm thấy phiếu lương hoặc trạng thái không hợp lệ (cần pending)' },
        );
    });

    it('rejects a non-existent payroll id', async () => {
        await assert.rejects(
            () => accountantPayrollRepository.reviewPayroll(999999, 1),
            { message: 'Không tìm thấy phiếu lương hoặc trạng thái không hợp lệ (cần pending)' },
        );
    });
});
