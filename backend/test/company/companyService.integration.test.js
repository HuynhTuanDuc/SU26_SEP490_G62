const { describe, it, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert');
const { PostgreSqlContainer } = require('@testcontainers/postgresql');
const fs = require('fs');
const path = require('path');

let container;
let pool;
let companyService;

describe('Company Service Integration Tests (L2)', () => {
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

        companyService = require('../../services/companyService');
    });

    after(async () => {
        if (pool) await pool.end();
        if (container) await container.stop();
    });

    beforeEach(async () => {
        await pool.query('TRUNCATE company_info, profiles, roles, accounts RESTART IDENTITY CASCADE');
        await pool.query(`INSERT INTO roles (id, name) VALUES (1, 'manager') ON CONFLICT DO NOTHING`);
        await pool.query(`INSERT INTO accounts (id, email, password_hash, role_id) VALUES (1, 'manager@test.com', 'hash', 1) ON CONFLICT DO NOTHING`);
        // company_info.updated_by references profiles(id), not accounts(id) directly
        await pool.query(`INSERT INTO profiles (id, full_name, role_id) VALUES (1, 'Manager', 1) ON CONFLICT DO NOTHING`);
    });

    it('should insert and get company info', async () => {
        const upserted = await companyService.updateCompanyInfo({ companyName: 'LogisCount', hotline: '19001234' }, 1);
        assert.strictEqual(upserted.company_name, 'LogisCount');
        assert.strictEqual(upserted.hotline, '19001234');

        const fetched = await companyService.getCompanyInfo();
        assert.strictEqual(fetched.company_name, 'LogisCount');
    });

    it('should update bank QR url', async () => {
        const updated = await companyService.uploadBankQr('https://img.url', 1);
        assert.strictEqual(updated.bank_qr_url, 'https://img.url');

        const fetched = await companyService.getCompanyInfo();
        assert.strictEqual(fetched.bank_qr_url, 'https://img.url');
    });
});
