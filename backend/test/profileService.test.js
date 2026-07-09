const { describe, it, afterEach, mock } = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcryptjs');

const profileRepository = require('../repositories/profileRepository');
const emailService = require('../services/emailService');
const fcmService = require('../services/fcmService');
const pool = require('../config/database');
const profileService = require('../services/profileService');

describe('Profile Service', () => {
    afterEach(() => {
        mock.restoreAll();
    });

    it('getMyProfile() rejects when no profile is found', async () => {
        mock.method(profileRepository, 'getFullProfile', async () => null);

        await assert.rejects(
            () => profileService.getMyProfile(1),
            { message: 'Không tìm thấy hồ sơ' },
        );
    });

    it('getMyProfile() returns the repository row when found', async () => {
        mock.method(profileRepository, 'getFullProfile', async () => ({ id: 1, full_name: 'A' }));

        const result = await profileService.getMyProfile(1);
        assert.strictEqual(result.full_name, 'A');
    });

    it('updateMyProfile() strips protected fields and normalizes the rest before saving', async () => {
        mock.method(profileRepository, 'updateProfile', async (userId, data) => ({ userId, data }));

        const result = await profileService.updateMyProfile(1, {
            full_name: '  Nguyen Van A  ',
            phone: '0912345678',
            email: 'hacker@test.com',
            role_id: 999,
            is_active: false,
        });

        assert.strictEqual(result.userId, 1);
        assert.deepStrictEqual(result.data, { full_name: 'Nguyen Van A', phone: '0912345678' });
    });

    it('updateMyProfile() rejects an invalid phone number', async () => {
        await assert.rejects(
            () => profileService.updateMyProfile(1, { phone: '123' }),
            { message: 'Số điện thoại không hợp lệ.' },
        );
    });

    it('updateAvatar() rejects when no URL is provided', async () => {
        await assert.rejects(
            () => profileService.updateAvatar(1, ''),
            { message: 'URL ảnh đại diện không hợp lệ' },
        );
    });

    it('updateAvatar() delegates to the repository with the given URL', async () => {
        mock.method(profileRepository, 'updateAvatar', async (userId, url) => ({ userId, url }));

        const result = await profileService.updateAvatar(1, 'https://cdn/a.png');
        assert.deepStrictEqual(result, { userId: 1, url: 'https://cdn/a.png' });
    });

    it('changePassword() rejects when currentPassword or newPassword is missing', async () => {
        await assert.rejects(
            () => profileService.changePassword(1, { currentPassword: 'old' }),
            { message: 'Mật khẩu hiện tại và mật khẩu mới là bắt buộc' },
        );
    });

    it('changePassword() rejects a new password shorter than 6 characters', async () => {
        await assert.rejects(
            () => profileService.changePassword(1, { currentPassword: 'old', newPassword: '123' }),
            { message: 'Mật khẩu mới phải có ít nhất 6 ký tự' },
        );
    });

    it('changePassword() rejects when the account does not exist', async () => {
        mock.method(pool, 'query', async () => ({ rows: [] }));

        await assert.rejects(
            () => profileService.changePassword(1, { currentPassword: 'old', newPassword: 'newpass1' }),
            { message: 'Không tìm thấy tài khoản' },
        );
    });

    it('changePassword() rejects when the current password does not match', async () => {
        mock.method(pool, 'query', async () => ({ rows: [{ password_hash: 'stored-hash' }] }));
        mock.method(bcrypt, 'compare', async () => false);

        await assert.rejects(
            () => profileService.changePassword(1, { currentPassword: 'wrong', newPassword: 'newpass1' }),
            { message: 'Mật khẩu hiện tại không đúng' },
        );
    });

    it('changePassword() hashes and persists the new password when the current one matches', async () => {
        const calls = [];
        mock.method(pool, 'query', async (sql, params) => {
            calls.push([sql, params]);
            if (calls.length === 1) return { rows: [{ password_hash: 'stored-hash' }] };
            return { rows: [] };
        });
        mock.method(bcrypt, 'compare', async () => true);
        mock.method(bcrypt, 'hash', async () => 'new-hash');

        const result = await profileService.changePassword(1, { currentPassword: 'old', newPassword: 'newpass1' });

        assert.strictEqual(result.message, 'Đổi mật khẩu thành công');
        assert.strictEqual(calls.length, 2);
        assert.match(calls[1][0], /UPDATE accounts SET password_hash/);
        assert.deepStrictEqual(calls[1][1], ['new-hash', 1]);
    });

    it('sendEmailChangeCode() rejects when the profile has no email on file', async () => {
        mock.method(profileRepository, 'getFullProfile', async () => ({ email: null }));

        await assert.rejects(
            () => profileService.sendEmailChangeCode(101),
            { message: 'Không tìm thấy email hiện tại' },
        );
    });

    it('sendEmailChangeCode() sends a verification code to the current email', async () => {
        mock.method(profileRepository, 'getFullProfile', async () => ({ email: 'me@test.com', full_name: 'Me' }));
        mock.method(emailService, 'sendEmailChangeVerificationCode', async () => {});

        const result = await profileService.sendEmailChangeCode(102);

        assert.strictEqual(result.message, 'Đã gửi mã xác nhận tới email hiện tại');
        assert.strictEqual(emailService.sendEmailChangeVerificationCode.mock.calls[0].arguments[0], 'me@test.com');
    });

    it('sendEmailChangeCode() enforces the resend cooldown on a second call', async () => {
        mock.method(profileRepository, 'getFullProfile', async () => ({ email: 'me@test.com', full_name: 'Me' }));
        mock.method(emailService, 'sendEmailChangeVerificationCode', async () => {});

        await profileService.sendEmailChangeCode(103);

        await assert.rejects(
            () => profileService.sendEmailChangeCode(103),
            (err) => /Vui lòng chờ/.test(err.message) && Number.isInteger(err.retry_after_seconds),
        );
    });

    it('verifyEmailChangeCode() rejects a malformed code', async () => {
        await assert.rejects(
            () => profileService.verifyEmailChangeCode(200, { code: '123', newEmail: 'new@test.com' }),
            { message: 'Mã xác nhận không hợp lệ' },
        );
    });

    it('verifyEmailChangeCode() rejects when no verification request was ever sent', async () => {
        await assert.rejects(
            () => profileService.verifyEmailChangeCode(201, { code: 'ABCDEF', newEmail: 'new@test.com' }),
            { message: 'Không tìm thấy yêu cầu xác nhận. Vui lòng gửi lại mã' },
        );
    });

    it('verifyEmailChangeCode() rejects an incorrect code', async () => {
        mock.method(profileRepository, 'getFullProfile', async () => ({ email: 'me@test.com', full_name: 'Me' }));
        mock.method(emailService, 'sendEmailChangeVerificationCode', async () => {});
        await profileService.sendEmailChangeCode(202);

        await assert.rejects(
            () => profileService.verifyEmailChangeCode(202, { code: 'WRONG1', newEmail: 'new@test.com' }),
            { message: 'Mã xác nhận không đúng' },
        );
    });

    it('verifyEmailChangeCode() returns early without updating when the new email equals the current one', async () => {
        let sentCode;
        mock.method(profileRepository, 'getFullProfile', async () => ({ email: 'me@test.com', full_name: 'Me' }));
        mock.method(emailService, 'sendEmailChangeVerificationCode', async (_to, _name, code) => { sentCode = code; });
        mock.method(profileRepository, 'updateAccountEmail', async () => { throw new Error('should not be called'); });
        await profileService.sendEmailChangeCode(203);

        const result = await profileService.verifyEmailChangeCode(203, { code: sentCode, newEmail: 'ME@test.com' });

        assert.strictEqual(result.message, 'Email không thay đổi');
        assert.strictEqual(result.email, 'me@test.com');
    });

    it('verifyEmailChangeCode() rejects when the new email is already taken by another account', async () => {
        let sentCode;
        mock.method(profileRepository, 'getFullProfile', async () => ({ email: 'me@test.com', full_name: 'Me' }));
        mock.method(emailService, 'sendEmailChangeVerificationCode', async (_to, _name, code) => { sentCode = code; });
        mock.method(profileRepository, 'getAccountByEmail', async () => ({ id: 999 }));
        await profileService.sendEmailChangeCode(204);

        await assert.rejects(
            () => profileService.verifyEmailChangeCode(204, { code: sentCode, newEmail: 'taken@test.com' }),
            { message: 'Email đã tồn tại' },
        );
    });

    it('verifyEmailChangeCode() updates the account email on a valid, unclaimed new address', async () => {
        let sentCode;
        mock.method(profileRepository, 'getFullProfile', async () => ({ email: 'me@test.com', full_name: 'Me' }));
        mock.method(emailService, 'sendEmailChangeVerificationCode', async (_to, _name, code) => { sentCode = code; });
        mock.method(profileRepository, 'getAccountByEmail', async () => null);
        mock.method(profileRepository, 'updateAccountEmail', async () => ({ email: 'new@test.com' }));
        await profileService.sendEmailChangeCode(205);

        const result = await profileService.verifyEmailChangeCode(205, { code: sentCode, newEmail: 'new@test.com' });

        assert.strictEqual(result.message, 'Cập nhật email thành công');
        assert.strictEqual(result.email, 'new@test.com');
    });

    it('registerDeviceToken() rejects when no fcmToken is provided', async () => {
        await assert.rejects(
            () => profileService.registerDeviceToken(1, {}),
            { message: 'fcmToken là bắt buộc' },
        );
    });

    it('registerDeviceToken() defaults to the android platform and registers the token', async () => {
        mock.method(fcmService, 'registerToken', () => {});

        const result = await profileService.registerDeviceToken(1, { fcmToken: ' tok123 ' });

        assert.strictEqual(result.platform, 'android');
        assert.deepStrictEqual(fcmService.registerToken.mock.calls[0].arguments, [1, 'tok123', 'android']);
    });

    it('registerDeviceToken() honors an explicit valid platform', async () => {
        mock.method(fcmService, 'registerToken', () => {});

        const result = await profileService.registerDeviceToken(1, { fcmToken: 'tok', platform: 'ios' });

        assert.strictEqual(result.platform, 'ios');
    });
});
