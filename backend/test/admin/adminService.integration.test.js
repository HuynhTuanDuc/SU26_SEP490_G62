const { describe, it, before, after, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert');
const { PostgreSqlContainer } = require('@testcontainers/postgresql');

let container;
let pool;
let adminService;
let emailService;

describe('Admin Service Integration Tests', () => {
    before(async () => {
        container = await new PostgreSqlContainer('postgres:16-alpine').start();

        process.env.DB_HOST = container.getHost();
        process.env.DB_PORT = container.getPort();
        process.env.DB_NAME = container.getDatabase();
        process.env.DB_USER = container.getUsername();
        process.env.DB_PASSWORD = container.getPassword();

        pool = require('../../config/database');

        await pool.query(`
            CREATE TABLE roles (
                id SERIAL PRIMARY KEY,
                name VARCHAR(50) UNIQUE NOT NULL
            );

            CREATE TABLE accounts (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                role_id INT REFERENCES roles(id),
                is_active BOOLEAN DEFAULT true,
                last_login_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE profiles (
                id INT PRIMARY KEY REFERENCES accounts(id),
                full_name VARCHAR(255),
                phone VARCHAR(20) UNIQUE,
                role_id INT REFERENCES roles(id),
                avatar_url VARCHAR(255),
                dob DATE,
                gender VARCHAR(20),
                address VARCHAR(255),
                city VARCHAR(100),
                country VARCHAR(100),
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
        `);

        adminService = require('../../services/adminService');
        emailService = require('../../services/emailService');
    });

    after(async () => {
        if (pool) await pool.end();
        if (container) await container.stop();
    });

    beforeEach(async () => {
        await pool.query('TRUNCATE profiles, accounts, roles RESTART IDENTITY CASCADE');

        await pool.query(`INSERT INTO roles (id, name) VALUES (1, 'admin'), (2, 'manager'), (3, 'user')`);

        await pool.query(`
            INSERT INTO accounts (id, email, password_hash, role_id, is_active) VALUES
            (1, 'admin1@test.com', 'hash', 1, true),
            (2, 'manager1@test.com', 'hash', 2, true),
            (3, 'user1@test.com', 'hash', 3, true),
            (4, 'user2@test.com', 'hash', 3, false)
        `);

        await pool.query(`
            INSERT INTO profiles (id, full_name, phone, role_id) VALUES
            (1, 'Admin One', '0900000000', 1),
            (2, 'Manager One', '0911111111', 2),
            (3, 'User One', '0922222222', 3),
            (4, 'User Two', '0933333333', 3)
        `);

        await pool.query(`SELECT setval('accounts_id_seq', 4, true)`);

        mock.method(emailService, 'sendWelcomeEmail', async () => {});
    });

    afterEach(() => {
        mock.restoreAll();
    });

    it('updates both profile and account role successfully', async () => {
        await adminService.updateUser(1, '  Updated Name  ', ' 0944444444 ', 'manager');

        const profile = await pool.query('SELECT full_name, phone, role_id FROM profiles WHERE id = 1');
        const account = await pool.query('SELECT role_id FROM accounts WHERE id = 1');

        assert.strictEqual(profile.rows[0].full_name, 'Updated Name');
        assert.strictEqual(profile.rows[0].phone, '0944444444');
        assert.strictEqual(profile.rows[0].role_id, 2);
        assert.strictEqual(account.rows[0].role_id, 2);
    });

    it('rejects update for non-existent user', async () => {
        await assert.rejects(
            () => adminService.updateUser(999, 'Updated Name', '0944444444', 'manager'),
            (err) => err.status === 404 && err.message === 'Người dùng không tồn tại.',
        );
    });

    it('rejects update when phone already exists and keeps original data', async () => {
        await assert.rejects(
            () => adminService.updateUser(1, 'Updated Name', '0911111111', 'manager'),
            (err) => err.status === 409 && err.message === 'Số điện thoại đã tồn tại.',
        );

        const profile = await pool.query('SELECT full_name, phone, role_id FROM profiles WHERE id = 1');
        const account = await pool.query('SELECT role_id FROM accounts WHERE id = 1');

        assert.strictEqual(profile.rows[0].full_name, 'Admin One');
        assert.strictEqual(profile.rows[0].phone, '0900000000');
        assert.strictEqual(profile.rows[0].role_id, 1);
        assert.strictEqual(account.rows[0].role_id, 1);
    });

    it('allows clearing phone number', async () => {
        await adminService.updateUser(1, 'Updated Name', '   ', 'manager');

        const profile = await pool.query('SELECT phone FROM profiles WHERE id = 1');
        assert.strictEqual(profile.rows[0].phone, null);
    });
});
