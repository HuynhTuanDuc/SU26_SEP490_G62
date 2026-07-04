const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { setupTestDb } = require('../helpers/testDb');

let pool;
let teardown;
let debtService;

describe('Debt Service Integration Tests (L2)', () => {
    before(async () => {
        ({ pool, teardown } = await setupTestDb());
        debtService = require('../../services/debtService');
    });

    after(async () => {
        await teardown();
    });

    beforeEach(async () => {
        await pool.query(`
            TRUNCATE debt_payments, debts, profiles, roles, accounts
            RESTART IDENTITY CASCADE
        `);
        await pool.query(`
            INSERT INTO roles (id, name) VALUES (2, 'driver'), (4, 'accountant')
            ON CONFLICT DO NOTHING
        `);
        await pool.query(`
            INSERT INTO accounts (id, email, password_hash, role_id) VALUES
            (1, 'driver@test.com', 'hash', 2),
            (2, 'accountant@test.com', 'hash', 4)
        `);
        await pool.query(`
            INSERT INTO profiles (id, full_name, role_id) VALUES
            (1, 'Driver One', 2),
            (2, 'Accountant One', 4)
        `);
        await pool.query(`
            INSERT INTO debts (id, debt_type, driver_id, total_amount)
            VALUES (1, 'driver', 1, 1000000)
        `);
    });

    it('BR-020: allows multiple partial repayments against the same debt', async () => {
        await debtService.submitRepayment(1, 1, { amount: 300000, paymentMethod: 'cash' }, 'https://receipt1.jpg');
        await debtService.submitRepayment(1, 1, { amount: 200000, paymentMethod: 'bank_transfer' }, 'https://receipt2.jpg');

        const payments = await debtService.getDebtPayments(1, 1);
        assert.strictEqual(payments.length, 2);
        assert.strictEqual(payments.every((p) => p.status === 'pending'), true);
    });

    it('cancelRepayment() removes a pending repayment owned by the driver', async () => {
        await debtService.submitRepayment(1, 1, { amount: 300000 }, 'url');
        const before = await debtService.getDebtPayments(1, 1);

        await debtService.cancelRepayment(1, before[0].id);

        const after = await debtService.getDebtPayments(1, 1);
        assert.strictEqual(after.length, 0);
    });

    it('confirmRepayment() marks the payment confirmed — remaining debt is derived dynamically', async () => {
        await debtService.submitRepayment(1, 1, { amount: 300000 }, 'url');
        const [payment] = await debtService.getDebtPayments(1, 1);

        await debtService.confirmRepayment(payment.id, 2);

        const row = await pool.query('SELECT status FROM debt_payments WHERE id = $1', [payment.id]);
        assert.strictEqual(row.rows[0].status, 'confirmed');

        const summary = await debtService.getMyDebtSummary(1);
        // total_amount 1,000,000 - confirmed 300,000 = 700,000 remaining
        assert.strictEqual(Number(summary.total_remaining), 700000);
    });

    it('rejectRepayment() marks the payment rejected with a reason, remaining debt unaffected', async () => {
        await debtService.submitRepayment(1, 1, { amount: 300000 }, 'url');
        const [payment] = await debtService.getDebtPayments(1, 1);

        await debtService.rejectRepayment(payment.id, 2, 'Ảnh không rõ số tiền');

        const row = await pool.query('SELECT status FROM debt_payments WHERE id = $1', [payment.id]);
        assert.strictEqual(row.rows[0].status, 'rejected');
    });

    it('getPendingRepayments() lists only pending driver-type debt repayments for accountants', async () => {
        await debtService.submitRepayment(1, 1, { amount: 300000 }, 'url');

        const pending = await debtService.getPendingRepayments();

        assert.strictEqual(pending.length, 1);
        assert.strictEqual(Number(pending[0].amount), 300000);
    });
});
