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
        await pool.query('TRUNCATE expenses, trips, vehicles, vehicle_groups, drivers, profiles, roles, accounts RESTART IDENTITY CASCADE');
        await pool.query(`INSERT INTO roles (id, name) VALUES (2, 'driver') ON CONFLICT DO NOTHING`);
        await pool.query(`INSERT INTO accounts (id, email, password_hash, role_id) VALUES (1, 'driver@test.com', 'hash', 2) ON CONFLICT DO NOTHING`);
        await pool.query(`INSERT INTO profiles (id, full_name, role_id) VALUES (1, 'Driver', 2) ON CONFLICT DO NOTHING`);
        await pool.query(`INSERT INTO drivers (profile_id, license_number, hire_date) VALUES (1, 'L123', CURRENT_DATE)`);
        await pool.query(`INSERT INTO vehicle_groups (id, name) VALUES (1, 'Truck')`);
        await pool.query(`INSERT INTO vehicles (id, plate_number, vehicle_group_id, assigned_driver_id) VALUES (1, '29A', 1, 1)`);
        await pool.query(`INSERT INTO trips (id, owner_driver_id, vehicle_id, status) VALUES (1, 1, 1, 'transit')`);
    });

    it('should create and retrieve expenses', async () => {
        const expenses = await expenseService.createExpense(1, { shipmentId: 1, expenseType: 'fuel', amount: 500, receiptUrl: 'url', description: 'desc' });
        assert.strictEqual(expenses.length, 1);
        assert.strictEqual(Number(expenses[0].amount), 500);

        const fetched = await expenseService.getShipmentExpenses(1, 1);
        assert.strictEqual(fetched.length, 1);
        assert.strictEqual(fetched[0].expense_type, 'fuel');
    });
});
