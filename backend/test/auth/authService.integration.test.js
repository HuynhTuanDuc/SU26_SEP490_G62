const { describe, it, before, after, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert');
const { PostgreSqlContainer } = require('@testcontainers/postgresql');
const bcrypt = require('bcryptjs');

let container;
let pool;
let authService;

describe('Auth Service Integration Tests (L2)', () => {
    before(async () => {
        container = await new PostgreSqlContainer("postgres:16-alpine").start();

        process.env.DB_HOST = container.getHost();
        process.env.DB_PORT = container.getPort();
        process.env.DB_NAME = container.getDatabase();
        process.env.DB_USER = container.getUsername();
        process.env.DB_PASSWORD = container.getPassword();
        process.env.JWT_SECRET = 'TEST_SECRET';

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
                national_id VARCHAR(50),
                tax_code VARCHAR(50),
                emergency_contact_name VARCHAR(255),
                emergency_contact_phone VARCHAR(20),
                notes TEXT,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
        `);

        authService = require('../../services/authService');
    });

    after(async () => {
        if (pool) await pool.end();
        if (container) await container.stop();
    });

    beforeEach(async () => {
        await pool.query('TRUNCATE profiles, accounts, roles RESTART IDENTITY CASCADE');
        await pool.query(`INSERT INTO roles (id, name) VALUES (1, 'admin'), (2, 'manager')`);

        const validHash = await bcrypt.hash('password123', 10);

        await pool.query(`
            INSERT INTO accounts (id, email, password_hash, role_id, is_active) VALUES 
            (1, 'valid@test.com', $1, 1, true),
            (2, 'locked@test.com', $1, 2, false)
        `, [validHash]);

        await pool.query(`
            INSERT INTO profiles (id, full_name, phone, role_id) VALUES 
            (1, 'Valid User', '0123456789', 1),
            (2, 'Locked User', '0987654321', 2)
        `);
    });

    afterEach(() => {
        mock.restoreAll();
    });

    it('L2-Auth-01 [Happy Path]: login - should return token and update last_login_at on valid credentials', async () => {
        const result = await authService.login('valid@test.com', 'password123');
        
        assert.ok(result.token);
        assert.strictEqual(result.user.email, 'valid@test.com');
        assert.strictEqual(result.user.full_name, 'Valid User');
        assert.strictEqual(result.user.role, 'admin');

        const account = await pool.query('SELECT last_login_at FROM accounts WHERE email = $1', ['valid@test.com']);
        assert.notStrictEqual(account.rows[0].last_login_at, null);
    });

    it('L2-Auth-02 [Error Path]: login - should throw 401 on wrong password', async () => {
        await assert.rejects(
            () => authService.login('valid@test.com', 'wrongpassword'),
            (err) => err.status === 401 && err.message === 'Mật khẩu không đúng.'
        );
    });

    it('L2-Auth-03 [Error Path]: login - should throw 404 on missing email', async () => {
        await assert.rejects(
            () => authService.login('missing@test.com', 'password123'),
            (err) => err.status === 404 && err.message === 'Email không tồn tại.'
        );
    });

    it('L2-Auth-04 [Error Path]: login - should throw 403 on locked account', async () => {
        await assert.rejects(
            () => authService.login('locked@test.com', 'password123'),
            (err) => err.status === 403 && err.message === 'Tài khoản của bạn đã bị khóa.'
        );
    });
});
