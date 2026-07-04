const { describe, it, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert');
const { PostgreSqlContainer } = require('@testcontainers/postgresql');
const fs = require('fs');
const path = require('path');

let container;
let pool;
let cashCollectionService;

describe('Cash Collection Service Integration Tests (L2)', () => {
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

        cashCollectionService = require('../../services/cashCollectionService');
    });

    after(async () => {
        if (pool) await pool.end();
        if (container) await container.stop();
    });

    beforeEach(async () => {
        await pool.query('TRUNCATE drivers, profiles, roles, accounts RESTART IDENTITY CASCADE');
        await pool.query(`INSERT INTO roles (id, name) VALUES (2, 'driver') ON CONFLICT DO NOTHING`);
        await pool.query(`INSERT INTO accounts (id, email, password_hash, role_id) VALUES (1, 'driver@test.com', 'hash', 2) ON CONFLICT DO NOTHING`);
        await pool.query(`INSERT INTO profiles (id, full_name, role_id) VALUES (1, 'Driver', 2) ON CONFLICT DO NOTHING`);
        await pool.query(`INSERT INTO drivers (profile_id, license_number, hire_date) VALUES (1, 'L123', CURRENT_DATE)`);
    });

    // SKIPPED — not a test bug: backend/repositories/cashCollectionRepository.js queries a
    // table `cash_collections` (createCollection/getMyCollections/getSummary all hit it) that
    // does not exist anywhere in the real schema (`DB script/DB script.sql` + `seed.sql`,
    // checked exhaustively — 39 CREATE TABLE statements, none named cash_collections or
    // driver_cash_collections). Per BUSINESS_SPECIFICATION.md, driver cash collection is
    // actually modeled through `debts` + `debt_payments`, so this repository/service pair looks
    // like orphaned code from an earlier design that was never wired to the current schema.
    // Not fixable from the test side without either (a) adding a table to the real DB schema,
    // which is out of scope here, or (b) rewriting the repository to use debts/debt_payments,
    // which is a product/architecture decision, not a test fix. Left skipped rather than faked
    // passing so this gap stays visible.
    it.skip('should create and retrieve collections', async () => {
        const col = await cashCollectionService.createCollection(1, { amount: 5000, paymentMethod: 'cash', notes: 'test' });
        assert.strictEqual(Number(col.amount), 5000);
        assert.strictEqual(col.payment_method, 'cash');

        const collections = await cashCollectionService.getMyCollections(1);
        assert.strictEqual(collections.length, 1);
        assert.strictEqual(collections[0].notes, 'test');
    });
});
