const { describe, it, before, after, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { setupTestDb } = require('./helpers/testDb');
const { signAccessToken } = require('./helpers/authToken');

let pool;
let teardown;
let app;
let emailService;

const PASSWORD = 'password123';
let passwordHash;

// Set-Cookie array -> a single "Cookie" request header value (name=value pairs only).
const toCookieHeader = (setCookieArr) => (setCookieArr || [])
    .map((raw) => raw.split(';')[0])
    .join('; ');

describe('Auth Routes API Tests (L3)', () => {
    before(async () => {
        process.env.JWT_SECRET = process.env.JWT_SECRET || 'TEST_SECRET';
        process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || `${process.env.JWT_SECRET}_refresh`;
        ({ pool, teardown } = await setupTestDb());

        emailService = require('../services/emailService');

        const authRoutes = require('../routes/authRoutes');
        app = express();
        app.use(express.json());
        app.use('/auth', authRoutes);

        passwordHash = await bcrypt.hash(PASSWORD, 10);
    });

    after(async () => {
        await teardown();
    });

    afterEach(() => {
        mock.restoreAll();
    });

    beforeEach(async () => {
        await pool.query('TRUNCATE profiles, roles, accounts RESTART IDENTITY CASCADE');
        await pool.query(`INSERT INTO roles (id, name) VALUES (2, 'driver'), (5, 'manager') ON CONFLICT DO NOTHING`);
        await pool.query(`
            INSERT INTO accounts (id, email, password_hash, role_id, is_active) VALUES
            (1, 'valid@test.com', $1, 2, true),
            (2, 'locked@test.com', $1, 5, false),
            (3, 'reset-code@test.com', $1, 2, true),
            (4, 'reset-flow@test.com', $1, 2, true)
        `, [passwordHash]);
        await pool.query(`
            INSERT INTO profiles (id, full_name, role_id) VALUES
            (1, 'Valid User', 2),
            (2, 'Locked User', 5),
            (3, 'Reset Code User', 2),
            (4, 'Reset Flow User', 2)
        `);
    });

    describe('POST /auth/login', () => {
        it('missing email/password -> 400', async () => {
            const res = await request(app).post('/auth/login').send({ email: 'valid@test.com' });
            assert.strictEqual(res.status, 400);
            assert.strictEqual(res.body.error, 'Email và mật khẩu là bắt buộc.');
        });

        it('wrong password -> 401', async () => {
            const res = await request(app).post('/auth/login').send({ email: 'valid@test.com', password: 'wrongpassword' });
            assert.strictEqual(res.status, 401);
            assert.strictEqual(res.body.error, 'Mật khẩu không đúng.');
        });

        it('nonexistent email -> 404', async () => {
            const res = await request(app).post('/auth/login').send({ email: 'missing@test.com', password: PASSWORD });
            assert.strictEqual(res.status, 404);
            assert.strictEqual(res.body.error, 'Email không tồn tại.');
        });

        it('locked account -> 403', async () => {
            const res = await request(app).post('/auth/login').send({ email: 'locked@test.com', password: PASSWORD });
            assert.strictEqual(res.status, 403);
            assert.strictEqual(res.body.error, 'Tài khoản của bạn đã bị khóa.');
        });

        it('happy path -> 200 with token, user, and session cookies', async () => {
            const res = await request(app).post('/auth/login').send({ email: 'valid@test.com', password: PASSWORD });
            assert.strictEqual(res.status, 200);
            assert.ok(res.body.token);
            assert.strictEqual(res.body.user.email, 'valid@test.com');
            assert.strictEqual(res.body.user.role, 'driver');

            const setCookie = res.headers['set-cookie'] || [];
            assert.ok(setCookie.some((c) => c.startsWith('auth_token=')));
            assert.ok(setCookie.some((c) => c.startsWith('refresh_token=')));
        });
    });

    describe('POST /auth/google', () => {
        it('missing credential -> 400 (no external Google call made)', async () => {
            const res = await request(app).post('/auth/google').send({});
            assert.strictEqual(res.status, 400);
            assert.strictEqual(res.body.error, 'Google credential is required.');
        });
    });

    describe('POST /auth/forgot-password/request', () => {
        it('nonexistent email -> 404', async () => {
            const res = await request(app).post('/auth/forgot-password/request').send({ email: 'ghost@test.com' });
            assert.strictEqual(res.status, 404);
            assert.strictEqual(res.body.error, 'Email không tồn tại.');
        });

        it('existing email -> 200, sends a reset code (mocked email transport)', async () => {
            mock.method(emailService, 'sendPasswordResetCodeEmail', async () => {});

            const res = await request(app).post('/auth/forgot-password/request').send({ email: 'valid@test.com' });
            assert.strictEqual(res.status, 200);
            assert.strictEqual(emailService.sendPasswordResetCodeEmail.mock.calls.length, 1);
            assert.strictEqual(emailService.sendPasswordResetCodeEmail.mock.calls[0].arguments[0], 'valid@test.com');
        });
    });

    describe('POST /auth/forgot-password/verify', () => {
        it('malformed code -> 400', async () => {
            const res = await request(app)
                .post('/auth/forgot-password/verify')
                .send({ email: 'valid@test.com', code: '123' });
            assert.strictEqual(res.status, 400);
            assert.strictEqual(res.body.error, 'Mã xác nhận không hợp lệ.');
        });

        it('no prior reset request for this email -> 400', async () => {
            const res = await request(app)
                .post('/auth/forgot-password/verify')
                .send({ email: 'never-requested@test.com', code: 'ABCDEF' });
            assert.strictEqual(res.status, 400);
            assert.strictEqual(res.body.error, 'Không tìm thấy yêu cầu đặt lại mật khẩu. Vui lòng gửi lại mã.');
        });

        it('correct code -> 200', async () => {
            let capturedCode;
            mock.method(emailService, 'sendPasswordResetCodeEmail', async (_to, _name, code) => {
                capturedCode = code;
            });

            await request(app).post('/auth/forgot-password/request').send({ email: 'reset-code@test.com' });
            assert.ok(capturedCode);

            const res = await request(app)
                .post('/auth/forgot-password/verify')
                .send({ email: 'reset-code@test.com', code: capturedCode });
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.message, 'Xác nhận mã thành công.');
        });
    });

    describe('POST /auth/forgot-password/reset', () => {
        it('mismatched confirmPassword -> 400', async () => {
            const res = await request(app)
                .post('/auth/forgot-password/reset')
                .send({ email: 'valid@test.com', code: 'ABCDEF', newPassword: 'newpass123', confirmPassword: 'other456' });
            assert.strictEqual(res.status, 400);
            assert.strictEqual(res.body.error, 'Xác nhận mật khẩu không khớp.');
        });

        it('happy path: request -> verify -> reset -> login with new password', async () => {
            let capturedCode;
            mock.method(emailService, 'sendPasswordResetCodeEmail', async (_to, _name, code) => {
                capturedCode = code;
            });

            await request(app).post('/auth/forgot-password/request').send({ email: 'reset-flow@test.com' });
            await request(app).post('/auth/forgot-password/verify').send({ email: 'reset-flow@test.com', code: capturedCode });

            const resetRes = await request(app)
                .post('/auth/forgot-password/reset')
                .send({ email: 'reset-flow@test.com', code: capturedCode, newPassword: 'newpass123', confirmPassword: 'newpass123' });
            assert.strictEqual(resetRes.status, 200);
            assert.strictEqual(resetRes.body.message, 'Đặt lại mật khẩu thành công.');

            const oldLogin = await request(app).post('/auth/login').send({ email: 'reset-flow@test.com', password: PASSWORD });
            assert.strictEqual(oldLogin.status, 401);

            const newLogin = await request(app).post('/auth/login').send({ email: 'reset-flow@test.com', password: 'newpass123' });
            assert.strictEqual(newLogin.status, 200);
        });
    });

    describe('POST /auth/refresh', () => {
        it('no refresh token supplied -> 401', async () => {
            const res = await request(app).post('/auth/refresh').send({});
            assert.strictEqual(res.status, 401);
        });

        it('happy path: refreshes the session using the cookie from login', async () => {
            const loginRes = await request(app).post('/auth/login').send({ email: 'valid@test.com', password: PASSWORD });
            const cookieHeader = toCookieHeader(loginRes.headers['set-cookie']);

            const refreshRes = await request(app).post('/auth/refresh').set('Cookie', cookieHeader).send({});
            assert.strictEqual(refreshRes.status, 200);
            assert.ok(refreshRes.body.token);
            assert.ok(refreshRes.body.refreshToken);
            assert.strictEqual(refreshRes.body.user.email, 'valid@test.com');
        });
    });

    describe('POST /auth/logout', () => {
        it('revokes the refresh token so it can no longer be used to refresh', async () => {
            const loginRes = await request(app).post('/auth/login').send({ email: 'valid@test.com', password: PASSWORD });
            const cookieHeader = toCookieHeader(loginRes.headers['set-cookie']);

            const logoutRes = await request(app).post('/auth/logout').set('Cookie', cookieHeader);
            assert.strictEqual(logoutRes.status, 200);
            assert.strictEqual(logoutRes.body.message, 'Logout successful');

            const refreshAfterLogout = await request(app).post('/auth/refresh').set('Cookie', cookieHeader).send({});
            assert.strictEqual(refreshAfterLogout.status, 401);
        });

        it('logout without any token still returns 200', async () => {
            const res = await request(app).post('/auth/logout');
            assert.strictEqual(res.status, 200);
        });
    });

    describe('GET /auth/me', () => {
        it('without a token -> 403', async () => {
            const res = await request(app).get('/auth/me');
            assert.strictEqual(res.status, 403);
        });

        it('with a valid token -> 200 with the user profile', async () => {
            const token = signAccessToken({ userId: 1, email: 'valid@test.com', role: 'driver' });
            const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`);
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.email, 'valid@test.com');
            assert.strictEqual(res.body.full_name, 'Valid User');
            assert.strictEqual(res.body.role, 'driver');
        });
    });
});
