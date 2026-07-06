const { describe, it, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert');
const { PostgreSqlContainer } = require('@testcontainers/postgresql');
const fs = require('fs');
const path = require('path');

let container;
let pool;
let expenseService;

describe('Expense Service Integration Tests (L2)', () => {
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

        expenseService = require('../../services/expenseService');
    });

    after(async () => {
        if (pool) await pool.end();
        if (container) await container.stop();
    });

    beforeEach(async () => {
        await pool.query('TRUNCATE expense_attachments, expenses, shipment_assignment_history, order_shipments, orders, vehicles, vehicle_groups, drivers, profiles, roles, accounts RESTART IDENTITY CASCADE');
        await pool.query(`INSERT INTO roles (id, name) VALUES (2, 'driver') ON CONFLICT DO NOTHING`);
        await pool.query(`INSERT INTO accounts (id, email, password_hash, role_id) VALUES (1, 'driver@test.com', 'hash', 2) ON CONFLICT DO NOTHING`);
        await pool.query(`INSERT INTO profiles (id, full_name, role_id) VALUES (1, 'Driver', 2) ON CONFLICT DO NOTHING`);
        await pool.query(`INSERT INTO drivers (profile_id, license_number, hire_date) VALUES (1, 'L123', CURRENT_DATE)`);
        await pool.query(`INSERT INTO vehicle_groups (id, name, price_per_km) VALUES (1, 'Truck', 15000)`);
        await pool.query(`INSERT INTO vehicles (id, plate_number, vehicle_group_id, assigned_driver_id) VALUES (1, '29A', 1, 1)`);
        // Real schema: order_shipments has no owner_driver_id/vehicle_id column directly —
        // "who currently holds this shipment" comes from the v_shipment_current view, derived
        // from the latest shipment_assignment_history row (see tripRepository.getTripById).
        await pool.query(`INSERT INTO orders (id, created_by) VALUES (1, 1)`);
        await pool.query(`INSERT INTO order_shipments (id, order_id, shipment_index, vehicle_group_id, status) VALUES (1, 1, 1, 1, 'transit')`);
        await pool.query(`
            INSERT INTO shipment_assignment_history (shipment_id, to_driver_id, to_vehicle_id, changed_by, change_reason)
            VALUES (1, 1, 1, 1, 'initial_assign')
        `);
    });

    it('should create and retrieve expenses', async () => {
        const expenses = await expenseService.createExpense(1, { shipmentId: 1, expenseType: 'fuel', amount: 500, receiptUrl: 'url', description: 'desc' });
        assert.strictEqual(expenses.length, 1);
        assert.strictEqual(Number(expenses[0].amount), 500);

        const fetched = await expenseService.getShipmentExpenses(1, 1);
        assert.strictEqual(fetched.length, 1);
        assert.strictEqual(fetched[0].expense_type, 'fuel');
    });

    it('accumulates multiple expenses for the same shipment in insertion order', async () => {
        await expenseService.createExpense(1, { shipmentId: 1, expenseType: 'fuel', amount: 500, receiptUrl: 'url1' });
        await expenseService.createExpense(1, { shipmentId: 1, expenseType: 'toll', amount: 100, receiptUrl: 'url2' });

        const fetched = await expenseService.getShipmentExpenses(1, 1);
        assert.strictEqual(fetched.length, 2);
        assert.deepStrictEqual(fetched.map((e) => e.expense_type), ['fuel', 'toll']);
    });

    it('rejects an expense from a driver who does not currently own the shipment (via v_shipment_current)', async () => {
        await pool.query(`INSERT INTO accounts (id, email, password_hash, role_id) VALUES (2, 'driver2@test.com', 'hash', 2)`);
        await pool.query(`INSERT INTO profiles (id, full_name, role_id) VALUES (2, 'Driver Two', 2)`);
        await pool.query(`INSERT INTO drivers (profile_id, license_number, hire_date) VALUES (2, 'L456', CURRENT_DATE)`);

        await assert.rejects(
            () => expenseService.createExpense(2, { shipmentId: 1, expenseType: 'fuel', amount: 500, receiptUrl: 'url' }),
            { message: 'Bạn không có quyền thêm chi phí cho chuyến này' },
        );
    });

    it('rejects an expense once the shipment has already completed', async () => {
        await pool.query(`UPDATE order_shipments SET status = 'completed' WHERE id = 1`);

        await assert.rejects(
            () => expenseService.createExpense(1, { shipmentId: 1, expenseType: 'fuel', amount: 500, receiptUrl: 'url' }),
            { message: 'Không thể thêm chi phí khi chuyến đã kết thúc' },
        );
    });
});
