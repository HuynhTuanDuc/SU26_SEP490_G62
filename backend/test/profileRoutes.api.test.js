const { describe, it, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { setupTestDb } = require('./helpers/testDb');
const { signAccessToken } = require('./helpers/authToken');
const { installCloudinaryMock } = require('./helpers/cloudinaryMock');

let pool;
let teardown;
let app;
let driverToken;
let emailService;
let uninstallCloudinaryMock;
let signDriverToken;

const DRIVER_PASSWORD = 'OldPass1';

describe('Profile Routes API Tests (L3)', () => {
    before(async () => {
        process.env.JWT_SECRET = process.env.JWT_SECRET || 'TEST_SECRET';
        uninstallCloudinaryMock = installCloudinaryMock();
        ({ pool, teardown } = await setupTestDb());

        const profileRoutes = require('../routes/profileRoutes');
        emailService = require('../services/emailService');
        app = express();
        app.use(express.json());
        app.use('/api/profile', profileRoutes);

        driverToken = signAccessToken({ userId: 1, email: 'driver@test.com', role: 'driver' });
        signDriverToken = (userId, email) => signAccessToken({ userId, email, role: 'driver' });
    });

    after(async () => {
        await teardown();
        uninstallCloudinaryMock();
    });

    beforeEach(async () => {
        mock.restoreAll();
        const passwordHash = await bcrypt.hash(DRIVER_PASSWORD, 10);
        await pool.query('TRUNCATE profiles, roles, accounts RESTART IDENTITY CASCADE');
        await pool.query(`INSERT INTO roles (id, name) VALUES (2, 'driver') ON CONFLICT DO NOTHING`);
        await pool.query(`
            INSERT INTO accounts (id, email, password_hash, role_id, is_active) VALUES
            (1, 'driver@test.com', $1, 2, true),
            (2, 'driver2@test.com', $1, 2, true),
            (3, 'driver3@test.com', $1, 2, true),
            (4, 'driver4@test.com', $1, 2, true),
            (5, 'driver5@test.com', $1, 2, true)
        `, [passwordHash]);
        await pool.query(`
            INSERT INTO profiles (id, full_name, phone, role_id) VALUES
            (1, 'Driver One', '0912345678', 2),
            (2, 'Driver Two', '0987654321', 2),
            (3, 'Driver Three', '0911111111', 2),
            (4, 'Driver Four', '0922222222', 2),
            (5, 'Driver Five', '0933333333', 2)
        `);
    });

    describe('GET /api/profile/me', () => {
        it('without a token -> 403', async () => {
            const res = await request(app).get('/api/profile/me');
            assert.strictEqual(res.status, 403);
        });

        it('as the driver -> 200 with their own profile', async () => {
            const res = await request(app).get('/api/profile/me').set('Authorization', `Bearer ${driverToken}`);
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.profile.full_name, 'Driver One');
            assert.strictEqual(res.body.profile.email, 'driver@test.com');
        });
    });

    describe('PATCH /api/profile/me', () => {
        it('without a token -> 403', async () => {
            const res = await request(app).patch('/api/profile/me').send({ full_name: 'New Name' });
            assert.strictEqual(res.status, 403);
        });

        it('with a valid update -> 200, persists the change', async () => {
            const res = await request(app)
                .patch('/api/profile/me')
                .set('Authorization', `Bearer ${driverToken}`)
                .send({ full_name: 'Driver One Updated', city: 'Hanoi' });

            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.message, 'Cập nhật hồ sơ thành công');
            assert.strictEqual(res.body.profile.full_name, 'Driver One Updated');

            const row = await pool.query('SELECT full_name, city FROM profiles WHERE id = 1');
            assert.strictEqual(row.rows[0].full_name, 'Driver One Updated');
            assert.strictEqual(row.rows[0].city, 'Hanoi');
        });

        it('with an invalid phone number -> 422', async () => {
            const res = await request(app)
                .patch('/api/profile/me')
                .set('Authorization', `Bearer ${driverToken}`)
                .send({ phone: '123' });

            assert.strictEqual(res.status, 422);
            assert.strictEqual(res.body.error, 'Số điện thoại không hợp lệ.');
        });

        it('with a phone already used by another account -> 409', async () => {
            const res = await request(app)
                .patch('/api/profile/me')
                .set('Authorization', `Bearer ${driverToken}`)
                .send({ phone: '0987654321' }); // belongs to profile id 2

            assert.strictEqual(res.status, 409);
            assert.strictEqual(res.body.error, 'Số điện thoại đã được sử dụng bởi tài khoản khác');
        });
    });

    describe('POST /api/profile/me/email/send-code', () => {
        it('without a token -> 403', async () => {
            const res = await request(app).post('/api/profile/me/email/send-code');
            assert.strictEqual(res.status, 403);
        });

        it('as the driver -> 200, sends a verification code to the current email', async () => {
            mock.method(emailService, 'sendEmailChangeVerificationCode', async () => {});

            const res = await request(app)
                .post('/api/profile/me/email/send-code')
                .set('Authorization', `Bearer ${driverToken}`);

            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.message, 'Đã gửi mã xác nhận tới email hiện tại');
            assert.strictEqual(emailService.sendEmailChangeVerificationCode.mock.calls.length, 1);
            assert.strictEqual(emailService.sendEmailChangeVerificationCode.mock.calls[0].arguments[0], 'driver@test.com');
        });

        it('called twice in a row -> 429 (resend cooldown)', async () => {
            mock.method(emailService, 'sendEmailChangeVerificationCode', async () => {});

            await request(app).post('/api/profile/me/email/send-code').set('Authorization', `Bearer ${driverToken}`);
            const res = await request(app).post('/api/profile/me/email/send-code').set('Authorization', `Bearer ${driverToken}`);

            assert.strictEqual(res.status, 429);
            assert.ok(res.body.retry_after_seconds > 0);
        });
    });

    describe('POST /api/profile/me/email/verify', () => {
        it('without a token -> 403', async () => {
            const res = await request(app).post('/api/profile/me/email/verify');
            assert.strictEqual(res.status, 403);
        });

        it('with a malformed code -> 400', async () => {
            const res = await request(app)
                .post('/api/profile/me/email/verify')
                .set('Authorization', `Bearer ${driverToken}`)
                .send({ code: '123', newEmail: 'new@test.com' });

            assert.strictEqual(res.status, 400);
            assert.strictEqual(res.body.error, 'Mã xác nhận không hợp lệ');
        });

        it('with no prior send-code request -> 400', async () => {
            // Uses a driver id (3) that has never called send-code in this run: profileService's
            // emailVerificationStore is a module-level Map keyed by userId that outlives DB
            // TRUNCATEs between tests, so re-using userId 1 here would pick up state left behind
            // by earlier send-code tests instead of exercising the "never sent" path.
            const freshDriverToken = signDriverToken(3, 'driver3@test.com');
            const res = await request(app)
                .post('/api/profile/me/email/verify')
                .set('Authorization', `Bearer ${freshDriverToken}`)
                .send({ code: 'ABCDEF', newEmail: 'new@test.com' });

            assert.strictEqual(res.status, 400);
            assert.strictEqual(res.body.error, 'Không tìm thấy yêu cầu xác nhận. Vui lòng gửi lại mã');
        });

        it('with the new email already taken by another account -> 409', async () => {
            // Fresh driver id (4) — see note above on emailVerificationStore/cooldown state.
            const freshDriverToken = signDriverToken(4, 'driver4@test.com');
            let capturedCode;
            mock.method(emailService, 'sendEmailChangeVerificationCode', async (_to, _name, code) => { capturedCode = code; });
            await request(app).post('/api/profile/me/email/send-code').set('Authorization', `Bearer ${freshDriverToken}`);

            const res = await request(app)
                .post('/api/profile/me/email/verify')
                .set('Authorization', `Bearer ${freshDriverToken}`)
                .send({ code: capturedCode, newEmail: 'driver2@test.com' });

            assert.strictEqual(res.status, 409);
            assert.strictEqual(res.body.error, 'Email đã tồn tại');
        });

        it('with a correct code and an unclaimed new email -> 200, updates the account email', async () => {
            // Fresh driver id (5) — see note above on emailVerificationStore/cooldown state.
            const freshDriverToken = signDriverToken(5, 'driver5@test.com');
            let capturedCode;
            mock.method(emailService, 'sendEmailChangeVerificationCode', async (_to, _name, code) => { capturedCode = code; });
            await request(app).post('/api/profile/me/email/send-code').set('Authorization', `Bearer ${freshDriverToken}`);

            const res = await request(app)
                .post('/api/profile/me/email/verify')
                .set('Authorization', `Bearer ${freshDriverToken}`)
                .send({ code: capturedCode, newEmail: 'new-driver@test.com' });

            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.message, 'Cập nhật email thành công');
            assert.strictEqual(res.body.email, 'new-driver@test.com');

            const row = await pool.query('SELECT email FROM accounts WHERE id = 5');
            assert.strictEqual(row.rows[0].email, 'new-driver@test.com');
        });
    });

    describe('PATCH /api/profile/me/password', () => {
        it('without a token -> 403', async () => {
            const res = await request(app).patch('/api/profile/me/password').send({ currentPassword: 'a', newPassword: 'b' });
            assert.strictEqual(res.status, 403);
        });

        it('missing fields -> 422', async () => {
            const res = await request(app)
                .patch('/api/profile/me/password')
                .set('Authorization', `Bearer ${driverToken}`)
                .send({ currentPassword: DRIVER_PASSWORD });

            assert.strictEqual(res.status, 422);
            assert.strictEqual(res.body.error, 'Mật khẩu hiện tại và mật khẩu mới là bắt buộc');
        });

        it('wrong current password -> 401', async () => {
            const res = await request(app)
                .patch('/api/profile/me/password')
                .set('Authorization', `Bearer ${driverToken}`)
                .send({ currentPassword: 'WrongPass1', newPassword: 'NewPass1' });

            assert.strictEqual(res.status, 401);
            assert.strictEqual(res.body.error, 'Mật khẩu hiện tại không đúng');
        });

        it('valid current password -> 200, persists the new password hash', async () => {
            const res = await request(app)
                .patch('/api/profile/me/password')
                .set('Authorization', `Bearer ${driverToken}`)
                .send({ currentPassword: DRIVER_PASSWORD, newPassword: 'NewPass1' });

            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.message, 'Đổi mật khẩu thành công');

            const row = await pool.query('SELECT password_hash FROM accounts WHERE id = 1');
            const matches = await bcrypt.compare('NewPass1', row.rows[0].password_hash);
            assert.strictEqual(matches, true);
        });
    });

    describe('POST /api/profile/me/avatar', () => {
        it('without a token -> 403', async () => {
            const res = await request(app).post('/api/profile/me/avatar');
            assert.strictEqual(res.status, 403);
        });

        it('without a file -> 422', async () => {
            const res = await request(app).post('/api/profile/me/avatar').set('Authorization', `Bearer ${driverToken}`);
            assert.strictEqual(res.status, 422);
            assert.strictEqual(res.body.error, 'Vui lòng chọn ảnh đại diện');
        });

        it('with a file -> 200, updates avatar_url (Cloudinary mocked)', async () => {
            const res = await request(app)
                .post('/api/profile/me/avatar')
                .set('Authorization', `Bearer ${driverToken}`)
                .attach('avatar', Buffer.from('fake-image-bytes'), { filename: 'avatar.jpg', contentType: 'image/jpeg' });

            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.message, 'Cập nhật ảnh đại diện thành công');
            assert.ok(res.body.avatar_url.includes('fake-cloudinary.test'));

            const row = await pool.query('SELECT avatar_url FROM profiles WHERE id = 1');
            assert.strictEqual(row.rows[0].avatar_url, res.body.avatar_url);
        });
    });

    describe('POST /api/profile/me/device-token', () => {
        it('without a token -> 403', async () => {
            const res = await request(app).post('/api/profile/me/device-token');
            assert.strictEqual(res.status, 403);
        });

        it('without an fcmToken -> 422', async () => {
            const res = await request(app)
                .post('/api/profile/me/device-token')
                .set('Authorization', `Bearer ${driverToken}`)
                .send({});

            assert.strictEqual(res.status, 422);
            assert.strictEqual(res.body.error, 'fcmToken là bắt buộc');
        });

        it('with an fcmToken -> 200, defaults platform to android', async () => {
            const res = await request(app)
                .post('/api/profile/me/device-token')
                .set('Authorization', `Bearer ${driverToken}`)
                .send({ fcmToken: 'tok-123' });

            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.message, 'Đăng ký thiết bị thành công');
            assert.strictEqual(res.body.platform, 'android');
        });
    });
});
