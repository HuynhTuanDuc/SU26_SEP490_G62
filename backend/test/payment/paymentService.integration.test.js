const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { setupTestDb } = require('../helpers/testDb');

let pool;
let teardown;
let paymentService;

describe('Payment Service Integration Tests (L2)', () => {
    before(async () => {
        ({ pool, teardown } = await setupTestDb());
        paymentService = require('../../services/paymentService');
    });

    after(async () => {
        await teardown();
    });

    beforeEach(async () => {
        await pool.query(`
            TRUNCATE payment_receipts, shipment_receipts, shipment_assignment_history,
                     order_shipments, orders, vehicles, vehicle_groups, drivers, profiles,
                     roles, accounts
            RESTART IDENTITY CASCADE
        `);
        await pool.query(`INSERT INTO roles (id, name) VALUES (2, 'driver') ON CONFLICT DO NOTHING`);
        await pool.query(`INSERT INTO accounts (id, email, password_hash, role_id) VALUES (1, 'driver@test.com', 'hash', 2)`);
        await pool.query(`INSERT INTO profiles (id, full_name, role_id) VALUES (1, 'Driver One', 2)`);
        await pool.query(`INSERT INTO vehicle_groups (id, name, price_per_km) VALUES (1, '5m2', 15000)`);
        await pool.query(`INSERT INTO vehicles (id, plate_number, vehicle_group_id, assigned_driver_id, status) VALUES (1, '29A-11111', 1, 1, 'active')`);
        await pool.query(`INSERT INTO drivers (profile_id, vehicle_id, license_number, hire_date) VALUES (1, 1, 'L1', CURRENT_DATE)`);
        await pool.query(`INSERT INTO orders (id, created_by, payment_type) VALUES (1, 1, 'cash')`);
        await pool.query(`INSERT INTO order_shipments (id, order_id, shipment_index, vehicle_group_id, status) VALUES (1, 1, 1, 1, 'arrived')`);
        await pool.query(`
            INSERT INTO shipment_assignment_history (shipment_id, to_driver_id, to_vehicle_id, changed_by, change_reason)
            VALUES (1, 1, 1, 1, 'self_claim')
        `);
    });

    it('BR-018: recordDriverCashPayment() inserts a shipment_receipts row and a driver debt', async () => {
        const { payment } = await paymentService.recordDriverCashPayment(1, 1, { amount: 300000, notes: 'thu tại kho' }, 'https://receipt.jpg');

        assert.strictEqual(Number(payment.amount), 300000);

        const debt = await pool.query(`SELECT debt_type, total_amount FROM debts WHERE shipment_id = 1`);
        assert.strictEqual(debt.rows[0].debt_type, 'driver');
        assert.strictEqual(Number(debt.rows[0].total_amount), 300000);

        const attachment = await pool.query(`SELECT file_url FROM payment_receipts WHERE payment_id = $1`, [payment.id]);
        assert.strictEqual(attachment.rows[0].file_url, 'https://receipt.jpg');
    });

    it('rejects cash payment when the order is paid by bank_transfer', async () => {
        await pool.query(`UPDATE orders SET payment_type = 'bank_transfer' WHERE id = 1`);

        await assert.rejects(
            () => paymentService.recordDriverCashPayment(1, 1, { amount: 100000 }, 'url'),
            (err) => err.message.includes('khách thanh toán chuyển khoản trực tiếp'),
        );

        const count = await pool.query('SELECT COUNT(*) FROM debts');
        assert.strictEqual(Number(count.rows[0].count), 0);
    });

    it('rejects cash payment from a driver who does not own the shipment', async () => {
        await pool.query(`INSERT INTO accounts (id, email, password_hash, role_id) VALUES (2, 'driver2@test.com', 'hash', 2)`);
        await pool.query(`INSERT INTO profiles (id, full_name, role_id) VALUES (2, 'Driver Two', 2)`);

        await assert.rejects(
            () => paymentService.recordDriverCashPayment(2, 1, { amount: 100000 }, 'url'),
            { message: 'Bạn không có quyền ghi nhận thanh toán cho chuyến này' },
        );
    });

    it('updateCashPayment() updates amount and replaces the receipt for the collecting driver', async () => {
        const { payment } = await paymentService.recordDriverCashPayment(1, 1, { amount: 200000 }, 'url-1.jpg');

        const { payment: updated } = await paymentService.updateCashPayment(1, 1, payment.id, { newAmount: 250000, newReceiptUrl: 'url-2.jpg' });

        assert.strictEqual(Number(updated.amount), 250000);
        const attachments = await pool.query(`SELECT file_url FROM payment_receipts WHERE payment_id = $1`, [payment.id]);
        assert.strictEqual(attachments.rows.length, 1);
        assert.strictEqual(attachments.rows[0].file_url, 'url-2.jpg');
    });
});
