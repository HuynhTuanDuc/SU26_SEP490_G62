const { describe, it, before, after, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert');
const { setupTestDb } = require('./helpers/testDb');

let pool;
let teardown;
let profileService;
let emailService;

describe('Profile Service Integration Tests (L2)', () => {
    before(async () => {
        ({ pool, teardown } = await setupTestDb());
        profileService = require('../services/profileService');
        emailService = require('../services/emailService');
    });

    after(async () => {
        await teardown();
    });

    beforeEach(async () => {
        await pool.query('TRUNCATE profiles, accounts, roles RESTART IDENTITY CASCADE');
        await pool.query(`INSERT INTO roles (id, name) VALUES (2, 'driver') ON CONFLICT DO NOTHING`);
        await pool.query(`
            INSERT INTO accounts (id, email, password_hash, role_id) VALUES
            (1, 'driver1@test.com', '$2a$10$0NDvkKNS3Mno7e1gxPnCF.wErwo5OOPQstS/aBxj4HaYEH/e6s7Oe', 2)
        `);
        await pool.query(`INSERT INTO profiles (id, full_name, role_id) VALUES (1, 'Driver One', 2)`);
    });

    afterEach(() => {
        mock.restoreAll();
    });

    it('getMyProfile() reads back the joined account/profile/role row from the real schema', async () => {
        const profile = await profileService.getMyProfile(1);

        assert.strictEqual(profile.email, 'driver1@test.com');
        assert.strictEqual(profile.full_name, 'Driver One');
        assert.strictEqual(profile.role, 'driver');
    });

    it('getMyProfile() rejects for an id with no matching account', async () => {
        await assert.rejects(
            () => profileService.getMyProfile(999),
            { message: 'Không tìm thấy hồ sơ' },
        );
    });

    it('updateMyProfile() persists normalized fields and ignores protected columns', async () => {
        const updated = await profileService.updateMyProfile(1, {
            full_name: '  New Name  ',
            phone: '0987654321',
            email: 'attacker@test.com',
            role_id: 999,
        });

        assert.strictEqual(updated.full_name, 'New Name');
        assert.strictEqual(updated.phone, '0987654321');

        const row = await pool.query('SELECT full_name, phone, role_id FROM profiles WHERE id = 1');
        assert.strictEqual(row.rows[0].full_name, 'New Name');
        assert.strictEqual(row.rows[0].role_id, 2);

        const account = await pool.query('SELECT email FROM accounts WHERE id = 1');
        assert.strictEqual(account.rows[0].email, 'driver1@test.com');
    });

    it('updateAvatar() persists the new avatar URL', async () => {
        const result = await profileService.updateAvatar(1, 'https://cdn/avatar.png');
        assert.strictEqual(result.avatar_url, 'https://cdn/avatar.png');

        const row = await pool.query('SELECT avatar_url FROM profiles WHERE id = 1');
        assert.strictEqual(row.rows[0].avatar_url, 'https://cdn/avatar.png');
    });

    it('changePassword() rejects a wrong current password without touching the stored hash', async () => {
        const before = await pool.query('SELECT password_hash FROM accounts WHERE id = 1');

        await assert.rejects(
            () => profileService.changePassword(1, { currentPassword: 'wrong-password', newPassword: 'newpass123' }),
            { message: 'Mật khẩu hiện tại không đúng' },
        );

        const after = await pool.query('SELECT password_hash FROM accounts WHERE id = 1');
        assert.strictEqual(after.rows[0].password_hash, before.rows[0].password_hash);
    });

    it('sendEmailChangeCode() -> verifyEmailChangeCode() updates the account email end to end', async () => {
        let sentCode;
        mock.method(emailService, 'sendEmailChangeVerificationCode', async (_to, _name, code) => { sentCode = code; });

        const sendResult = await profileService.sendEmailChangeCode(1);
        assert.strictEqual(sendResult.message, 'Đã gửi mã xác nhận tới email hiện tại');
        assert.ok(sentCode);

        const verifyResult = await profileService.verifyEmailChangeCode(1, {
            code: sentCode,
            newEmail: 'new.email@test.com',
        });

        assert.strictEqual(verifyResult.email, 'new.email@test.com');

        const row = await pool.query('SELECT email FROM accounts WHERE id = 1');
        assert.strictEqual(row.rows[0].email, 'new.email@test.com');
    });

    it('verifyEmailChangeCode() rejects a new email already used by another account', async () => {
        await pool.query(`
            INSERT INTO accounts (id, email, password_hash, role_id) VALUES (2, 'other@test.com', 'hash', 2)
        `);
        await pool.query(`INSERT INTO profiles (id, full_name, role_id) VALUES (2, 'Other Driver', 2)`);

        let sentCode;
        mock.method(emailService, 'sendEmailChangeVerificationCode', async (_to, _name, code) => { sentCode = code; });
        await profileService.sendEmailChangeCode(1);

        await assert.rejects(
            () => profileService.verifyEmailChangeCode(1, { code: sentCode, newEmail: 'other@test.com' }),
            { message: 'Email đã tồn tại' },
        );

        const row = await pool.query('SELECT email FROM accounts WHERE id = 1');
        assert.strictEqual(row.rows[0].email, 'driver1@test.com');
    });
});
