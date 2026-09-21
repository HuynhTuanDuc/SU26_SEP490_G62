/**
 * L1 Unit Test — profileService
 *
 * Ca quan trọng nhất là TC-001/002: sanitizeProfileUpdate phải LOẠI BỎ email, role,
 * role_id, is_active khỏi payload người dùng tự gửi. Lọt một trường trong số đó là
 * tài xế tự nâng quyền lên manager bằng chính màn "Sửa hồ sơ" (SEC-DRV-004).
 *
 * GIỮ THẬT: bcryptjs, crypto và utils/userValidation — đó là phần đang được kiểm chứng.
 */
jest.mock('../../repositories/profileRepository');
jest.mock('../../services/emailService', () => ({
    sendEmailChangeVerificationCode: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetCodeEmail: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../services/fcmService', () => ({
    registerToken: jest.fn().mockResolvedValue(undefined),
    sendNotification: jest.fn().mockResolvedValue({ sent: 0 }),
}));

const bcrypt = require('bcryptjs');
const profileRepository = require('../../repositories/profileRepository');
const emailService = require('../../services/emailService');
const fcmService = require('../../services/fcmService');
const profileService = require('../../services/profileService');

const MAT_KHAU = 'MatKhau@123';
let HASH_DUNG;

beforeAll(() => { HASH_DUNG = bcrypt.hashSync(MAT_KHAU, 4); });

beforeEach(() => {
    jest.clearAllMocks();
    profileRepository.getFullProfile.mockResolvedValue({
        id: 5, email: 'taixe01@logiscount.vn', full_name: 'Lê Văn Tài', role: 'driver',
    });
    profileRepository.updateProfile.mockResolvedValue({ id: 5 });
    profileRepository.getPasswordHash.mockResolvedValue(HASH_DUNG);
    profileRepository.updatePasswordHash.mockResolvedValue(undefined);
    profileRepository.updateAccountEmail.mockResolvedValue({ email: 'moi@logiscount.vn' });
    profileRepository.getAccountByEmail.mockResolvedValue(null);
});

describe('profileService.updateMyProfile — chặn tự nâng quyền', () => {
    it('TC-UNIT-ProfileService-001 — role, role_id and is_active sent by the user are all stripped out', async () => {
        await profileService.updateMyProfile(5, {
            full_name: 'Lê Văn Tài',
            role: 'manager',
            role_id: 1,
            is_active: true,
            email: 'hacker@evil.com',
        });

        const [, payload] = profileRepository.updateProfile.mock.calls[0];
        expect(payload).toEqual({ full_name: 'Lê Văn Tài' });
        expect(payload).not.toHaveProperty('role');
        expect(payload).not.toHaveProperty('role_id');
        expect(payload).not.toHaveProperty('is_active');
        expect(payload).not.toHaveProperty('email');
    });

    it('TC-UNIT-ProfileService-002 — id, created_at and updated_at cannot be overwritten either', async () => {
        await profileService.updateMyProfile(5, {
            id: 999, created_at: '2020-01-01', updated_at: '2020-01-01', city: 'Biên Hoà',
        });

        expect(profileRepository.updateProfile).toHaveBeenCalledWith(5, { city: 'Biên Hoà' });
    });

    it('TC-UNIT-ProfileService-003 — only the fields present in the payload are updated', async () => {
        await profileService.updateMyProfile(5, { phone: '0901000001' });

        expect(profileRepository.updateProfile).toHaveBeenCalledWith(5, { phone: '0901000001' });
    });

    it('TC-UNIT-ProfileService-004 — an empty string is normalised to null, never stored as an empty value', async () => {
        await profileService.updateMyProfile(5, { address: '   ', notes: '' });

        expect(profileRepository.updateProfile).toHaveBeenCalledWith(5, { address: null, notes: null });
    });

    it('TC-UNIT-ProfileService-005 — rejects a malformed phone number', async () => {
        await expect(profileService.updateMyProfile(5, { phone: '12345' })).rejects.toThrow();

        expect(profileRepository.updateProfile).not.toHaveBeenCalled();
    });

    it('TC-UNIT-ProfileService-006 — rejects a gender outside the catalogue', async () => {
        await expect(profileService.updateMyProfile(5, { gender: 'khac_gioi' })).rejects.toThrow();

        expect(profileRepository.updateProfile).not.toHaveBeenCalled();
    });
});

describe('profileService.changePassword', () => {
    it('TC-UNIT-ProfileService-007 — a correct password change stores a hash matching the new password', async () => {
        const result = await profileService.changePassword(5, {
            currentPassword: MAT_KHAU, newPassword: 'MatKhauMoi@1',
        });

        const [userId, hashMoi] = profileRepository.updatePasswordHash.mock.calls[0];
        expect(userId).toBe(5);
        expect(bcrypt.compareSync('MatKhauMoi@1', hashMoi)).toBe(true);
        expect(result).toEqual({ message: 'Đổi mật khẩu thành công' });
    });

    it('TC-UNIT-ProfileService-008 — a wrong current password is rejected and nothing is written', async () => {
        await expect(profileService.changePassword(5, {
            currentPassword: 'SaiRoi', newPassword: 'MatKhauMoi@1',
        })).rejects.toThrow('Mật khẩu hiện tại không đúng');

        expect(profileRepository.updatePasswordHash).not.toHaveBeenCalled();
    });

    it('TC-UNIT-ProfileService-009 — rejects a 5-character new password, below the minimum of 6', async () => {
        await expect(profileService.changePassword(5, {
            currentPassword: MAT_KHAU, newPassword: '12345',
        })).rejects.toThrow('Mật khẩu mới phải có ít nhất 6 ký tự');

        expect(profileRepository.getPasswordHash).not.toHaveBeenCalled();
    });

    it('TC-UNIT-ProfileService-010 — a new password of exactly 6 characters passes the length rule (lower boundary)', async () => {
        await expect(profileService.changePassword(5, {
            currentPassword: MAT_KHAU, newPassword: '123456',
        })).resolves.toEqual({ message: 'Đổi mật khẩu thành công' });
    });

    it('TC-UNIT-ProfileService-011 — rejects a missing current password', async () => {
        await expect(profileService.changePassword(5, { newPassword: 'MatKhauMoi@1' }))
            .rejects.toThrow('Mật khẩu hiện tại và mật khẩu mới là bắt buộc');
    });

    it('TC-UNIT-ProfileService-012 — reports not found when the account holds no password hash', async () => {
        profileRepository.getPasswordHash.mockResolvedValue(null);

        await expect(profileService.changePassword(5, {
            currentPassword: MAT_KHAU, newPassword: 'MatKhauMoi@1',
        })).rejects.toThrow('Không tìm thấy tài khoản');
    });
});

describe('profileService.sendEmailChangeCode', () => {
    const layMaVuaGui = () => emailService.sendEmailChangeVerificationCode.mock.calls.at(-1)[2];

    it('TC-UNIT-ProfileService-013 — sends the 6-character code to the CURRENT mailbox, proving ownership', async () => {
        profileRepository.getFullProfile.mockResolvedValue({ id: 13, email: 'cu13@logiscount.vn', full_name: 'A' });

        const result = await profileService.sendEmailChangeCode(13);

        expect(emailService.sendEmailChangeVerificationCode)
            .toHaveBeenCalledWith('cu13@logiscount.vn', 'A', expect.any(String));
        expect(layMaVuaGui()).toHaveLength(6);
        expect(result.expires_in_seconds).toBe(600);
    });

    it('TC-UNIT-ProfileService-014 — an account with no email is told to contact a manager', async () => {
        profileRepository.getFullProfile.mockResolvedValue({ id: 14, email: null });

        await expect(profileService.sendEmailChangeCode(14))
            .rejects.toThrow('Tài khoản của bạn chưa có email');

        expect(emailService.sendEmailChangeVerificationCode).not.toHaveBeenCalled();
    });

    it('TC-UNIT-ProfileService-015 — an immediate resend is blocked and the wait in seconds is returned', async () => {
        profileRepository.getFullProfile.mockResolvedValue({ id: 15, email: 'cu15@logiscount.vn', full_name: 'A' });
        await profileService.sendEmailChangeCode(15);

        await expect(profileService.sendEmailChangeCode(15))
            .rejects.toMatchObject({ retry_after_seconds: expect.any(Number) });
    });
});

describe('profileService.verifyEmailChangeCode', () => {
    const guiMa = async (userId, email) => {
        profileRepository.getFullProfile.mockResolvedValue({ id: userId, email, full_name: 'A' });
        await profileService.sendEmailChangeCode(userId);
        return emailService.sendEmailChangeVerificationCode.mock.calls.at(-1)[2];
    };

    it('TC-UNIT-ProfileService-016 — a correct code and a valid new email update the account', async () => {
        const ma = await guiMa(16, 'cu16@logiscount.vn');

        const result = await profileService.verifyEmailChangeCode(16, { code: ma, newEmail: 'Moi16@LogisCount.VN' });

        expect(profileRepository.updateAccountEmail).toHaveBeenCalledWith(16, 'moi16@logiscount.vn');
        expect(result.message).toBe('Cập nhật email thành công');
    });

    it('TC-UNIT-ProfileService-017 — rejects a code that is not 6 characters long', async () => {
        await expect(profileService.verifyEmailChangeCode(17, { code: 'ABC', newEmail: 'a@b.vn' }))
            .rejects.toThrow('Mã xác nhận không hợp lệ');
    });

    it('TC-UNIT-ProfileService-018 — a wrong code is rejected and the database is untouched', async () => {
        await guiMa(18, 'cu18@logiscount.vn');

        await expect(profileService.verifyEmailChangeCode(18, { code: 'ZZZZZZ', newEmail: 'moi18@logiscount.vn' }))
            .rejects.toThrow('Mã xác nhận không đúng');

        expect(profileRepository.updateAccountEmail).not.toHaveBeenCalled();
    });

    it('TC-UNIT-ProfileService-019 — reports an error when confirming without ever requesting a code', async () => {
        await expect(profileService.verifyEmailChangeCode(19, { code: 'ABC123', newEmail: 'a@b.vn' }))
            .rejects.toThrow('Không tìm thấy yêu cầu xác nhận');
    });

    it('TC-UNIT-ProfileService-020 — a new email equal to the old one writes nothing and reports no change', async () => {
        const ma = await guiMa(20, 'cu20@logiscount.vn');

        const result = await profileService.verifyEmailChangeCode(20, { code: ma, newEmail: 'CU20@logiscount.vn' });

        expect(result.message).toBe('Email không thay đổi');
        expect(profileRepository.updateAccountEmail).not.toHaveBeenCalled();
    });

    it('TC-UNIT-ProfileService-021 — rejects a new email already owned by another account', async () => {
        const ma = await guiMa(21, 'cu21@logiscount.vn');
        profileRepository.getAccountByEmail.mockResolvedValue({ id: 99 });

        await expect(profileService.verifyEmailChangeCode(21, { code: ma, newEmail: 'trung@logiscount.vn' }))
            .rejects.toThrow('Email đã tồn tại');

        expect(profileRepository.updateAccountEmail).not.toHaveBeenCalled();
    });

    it('TC-UNIT-ProfileService-022 — rejects a malformed new email', async () => {
        const ma = await guiMa(22, 'cu22@logiscount.vn');

        await expect(profileService.verifyEmailChangeCode(22, { code: ma, newEmail: 'khong-phai-email' }))
            .rejects.toThrow();
    });
});

describe('profileService.registerDeviceToken', () => {
    it('TC-UNIT-ProfileService-023 — a valid token is registered with the chosen platform', async () => {
        const result = await profileService.registerDeviceToken(5, { fcmToken: '  abc123  ', platform: 'ios' });

        expect(fcmService.registerToken).toHaveBeenCalledWith(5, 'abc123', 'ios');
        expect(result).toEqual({ message: 'Đăng ký thiết bị thành công', platform: 'ios' });
    });

    it('TC-UNIT-ProfileService-024 — an unknown platform falls back to android instead of storing junk', async () => {
        await profileService.registerDeviceToken(5, { fcmToken: 'abc123', platform: 'symbian' });

        expect(fcmService.registerToken).toHaveBeenCalledWith(5, 'abc123', 'android');
    });

    it('TC-UNIT-ProfileService-025 — rejects a missing token', async () => {
        await expect(profileService.registerDeviceToken(5, { fcmToken: '   ' }))
            .rejects.toThrow('fcmToken là bắt buộc');

        expect(fcmService.registerToken).not.toHaveBeenCalled();
    });
});

describe('profileService.getMyProfile / updateAvatar', () => {
    it('TC-UNIT-ProfileService-026 — raises an error instead of returning null when the profile is not found', async () => {
        profileRepository.getFullProfile.mockResolvedValue(null);

        await expect(profileService.getMyProfile(5)).rejects.toThrow('Không tìm thấy hồ sơ');
    });

    it('TC-UNIT-ProfileService-027 — rejects a missing avatar URL', async () => {
        await expect(profileService.updateAvatar(5, null)).rejects.toThrow('URL ảnh đại diện không hợp lệ');

        expect(profileRepository.updateAvatar).not.toHaveBeenCalled();
    });
});
