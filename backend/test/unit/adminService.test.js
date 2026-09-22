/**
 * L1 Unit Test — adminService (quản trị tài khoản)
 *
 * GIỮ THẬT bcryptjs và utils/passwordGenerator: khẳng định mạnh nhất ở đây là "mật khẩu
 * gửi cho người dùng phải khớp với bản băm lưu xuống DB" — mock bcrypt thì mất luôn ý nghĩa.
 *
 * Ba luật bảo mật được khoá riêng:
 *   - không thao tác được lên tài khoản manager/admin (isProtectedUserRole);
 *   - không tự reset mật khẩu / tự khoá chính mình;
 *   - mật khẩu khởi tạo CHỈ được trả về response khi tài khoản không có email — có
 *     email rồi thì cố tình không trả, để mật khẩu không nằm thừa trong log/response.
 */
jest.mock('../../repositories/profileRepository');
jest.mock('../../services/emailService', () => ({
    sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetCodeEmail: jest.fn().mockResolvedValue(undefined),
    sendEmailChangeVerificationCode: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../services/notificationGateway', () => ({
    broadcastToRole: jest.fn(), broadcastToUser: jest.fn(), notifyCreated: jest.fn(),
}));
jest.mock('../../services/roleNotificationService', () => ({
    notifyRoles: jest.fn().mockResolvedValue([]),
    notifyRolesSafe: jest.fn(),
}));

const bcrypt = require('bcryptjs');
const profileRepository = require('../../repositories/profileRepository');
const emailService = require('../../services/emailService');
const notificationGateway = require('../../services/notificationGateway');
const { notifyRolesSafe } = require('../../services/roleNotificationService');
const adminService = require('../../services/adminService');

/** Thứ tự tham số của createUser/updateUser rất dài — gói lại cho dễ đọc */
const taoUser = (o = {}) => adminService.createUser(
    o.email !== undefined ? o.email : 'nhanvien@logiscount.vn',
    o.full_name !== undefined ? o.full_name : 'Nguyễn Văn A',
    o.phone !== undefined ? o.phone : '0901000001',
    // Dùng so sánh undefined chứ KHÔNG dùng ?? — truyền role: null là chủ ý của ca test,
    // ?? sẽ âm thầm thay bằng 'driver' và ca "thiếu vai trò" không bao giờ chạy tới nhánh cần đo.
    o.role !== undefined ? o.role : 'driver',
    o.gender ?? 'male',
    o.dob ?? '1995-05-20',
    o.city ?? 'Đồng Nai',
    o.address ?? '12 Lê Lợi',
    o.country,
    o.national_id ?? null,
    o.tax_code ?? null,
    o.emergency_contact_name ?? null,
    o.emergency_contact_phone ?? null,
    o.notes ?? null,
    o.actorId ?? 1,
);

const suaUser = (o = {}) => adminService.updateUser(
    o.userId ?? 5,
    o.full_name ?? 'Nguyễn Văn A',
    o.phone ?? '0901000001',
    o.role ?? 'driver',
    o.gender ?? 'male',
    o.dob ?? '1995-05-20',
    o.city ?? 'Đồng Nai',
    o.address ?? '12 Lê Lợi',
    o.country,
    o.national_id ?? null,
    o.tax_code ?? null,
    o.emergency_contact_name ?? null,
    o.emergency_contact_phone ?? null,
    o.notes ?? null,
    o.email,
    o.actorId ?? 1,
);

beforeEach(() => {
    jest.clearAllMocks();
    profileRepository.getRoleIdByName.mockResolvedValue(4);
    profileRepository.getAccountByEmail.mockResolvedValue(null);
    profileRepository.adminCreateUser.mockResolvedValue(77);
    profileRepository.adminUpdateUser.mockResolvedValue(undefined);
    profileRepository.updateAccountEmail.mockResolvedValue(undefined);
    profileRepository.ensureDriverRow.mockResolvedValue(undefined);
    profileRepository.getProfileById.mockResolvedValue({
        id: 5, full_name: 'Nguyễn Văn A', role: 'driver', email: 'nhanvien@logiscount.vn', is_active: true,
    });
    profileRepository.resetPassword.mockResolvedValue({ email: 'nhanvien@logiscount.vn' });
    profileRepository.adminToggleUserStatus.mockResolvedValue({ id: 5, is_active: false });
});

describe('adminService.createUser', () => {
    it('TC-UNIT-AdminService-001 — an account with an email gets a welcome mail and the password is NOT returned in the response', async () => {
        const kq = await taoUser();

        expect(emailService.sendWelcomeEmail).toHaveBeenCalledWith(
            'nhanvien@logiscount.vn', expect.any(String), 'Nguyễn Văn A', 'driver',
        );
        expect(kq).toEqual({
            id: 77, email: 'nhanvien@logiscount.vn', welcomeEmailSent: true, initialPassword: null,
        });
    });

    it('TC-UNIT-AdminService-002 — the password sent by mail MUST match the hash stored in the database', async () => {
        await taoUser();

        const matKhauDaGui = emailService.sendWelcomeEmail.mock.calls[0][1];
        const banBamDaLuu = profileRepository.adminCreateUser.mock.calls[0][1];
        expect(bcrypt.compareSync(matKhauDaGui, banBamDaLuu)).toBe(true);
    });

    it('TC-UNIT-AdminService-003 — an account without an email returns the password so it can be handed over in person', async () => {
        const kq = await taoUser({ email: null });

        expect(emailService.sendWelcomeEmail).not.toHaveBeenCalled();
        expect(kq.welcomeEmailSent).toBe(false);
        expect(kq.initialPassword).toEqual(expect.any(String));
        expect(kq.initialPassword.length).toBeGreaterThanOrEqual(10);
    });

    it('TC-UNIT-AdminService-004 — rejects a missing role (400)', async () => {
        await expect(taoUser({ role: null }))
            .rejects.toMatchObject({ message: 'Thiếu thông tin bắt buộc (role).', status: 400 });

        expect(profileRepository.adminCreateUser).not.toHaveBeenCalled();
    });

    it('TC-UNIT-AdminService-005 — rejects a role that does not exist in the system (400)', async () => {
        profileRepository.getRoleIdByName.mockResolvedValue(null);

        await expect(taoUser()).rejects.toMatchObject({ message: 'Vai trò không hợp lệ.', status: 400 });

        expect(profileRepository.adminCreateUser).not.toHaveBeenCalled();
    });

    it('TC-UNIT-AdminService-006 — rejects an email that already exists (409)', async () => {
        profileRepository.getAccountByEmail.mockResolvedValue({ id: 9 });

        await expect(taoUser()).rejects.toMatchObject({ message: 'Email đã tồn tại.', status: 409 });

        expect(profileRepository.adminCreateUser).not.toHaveBeenCalled();
    });

    it('TC-UNIT-AdminService-007 — a blank email skips the duplicate check, several accounts may have none', async () => {
        await taoUser({ email: '' });

        expect(profileRepository.getAccountByEmail).not.toHaveBeenCalled();
        expect(profileRepository.adminCreateUser).toHaveBeenCalled();
    });

    it('TC-UNIT-AdminService-008 — a database unique violation becomes a 409 business error', async () => {
        profileRepository.adminCreateUser.mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' }));

        await expect(taoUser())
            .rejects.toMatchObject({ message: 'Số điện thoại hoặc Email đã tồn tại.', status: 409 });
    });

    it('TC-UNIT-AdminService-009 — any other database error is not swallowed into a 409', async () => {
        profileRepository.adminCreateUser.mockRejectedValue(new Error('connection reset'));

        await expect(taoUser()).rejects.toThrow('connection reset');
    });

    it('TC-UNIT-AdminService-010 — the driver role raises the flag that creates the driver record', async () => {
        await taoUser({ role: 'driver' });

        const args = profileRepository.adminCreateUser.mock.calls[0];
        expect(args.at(-1)).toBe(true);
    });

    it('TC-UNIT-AdminService-011 — a non-driver role creates no driver record', async () => {
        await taoUser({ role: 'accountant' });

        expect(profileRepository.adminCreateUser.mock.calls[0].at(-1)).toBe(false);
    });

    it('TC-UNIT-AdminService-012 — defaults the country to VN when none is given', async () => {
        await taoUser({ country: null });

        expect(profileRepository.adminCreateUser.mock.calls[0][9]).toBe('VN');
    });

    it('TC-UNIT-AdminService-013 — rejects a malformed phone number before writing to the database', async () => {
        await expect(taoUser({ phone: '12345' })).rejects.toMatchObject({ status: 400 });

        expect(profileRepository.adminCreateUser).not.toHaveBeenCalled();
    });

    it('TC-UNIT-AdminService-014 — rejects a missing full name', async () => {
        await expect(taoUser({ full_name: '   ' })).rejects.toMatchObject({ status: 400 });
    });

    it('TC-UNIT-AdminService-015 — rejects a malformed email', async () => {
        await expect(taoUser({ email: 'khong-phai-email' })).rejects.toMatchObject({ status: 400 });
    });

    it('TC-UNIT-AdminService-016 — creation pushes realtime and notifies managers, excluding the actor', async () => {
        await taoUser({ actorId: 1 });

        expect(notificationGateway.broadcastToRole).toHaveBeenCalledWith('manager',
            expect.objectContaining({ action: 'created', userId: 77 }));
        expect(notifyRolesSafe).toHaveBeenCalledWith(
            ['manager'],
            expect.objectContaining({ type: 'USER_CREATED', entityId: 77 }),
            { excludeUserId: 1, displayMode: 'toast' },
        );
    });
});

describe('adminService.updateUser', () => {
    it('TC-UNIT-AdminService-017 — an unchanged email leaves the account table untouched', async () => {
        await suaUser({ email: 'nhanvien@logiscount.vn' });

        expect(profileRepository.adminUpdateUser).toHaveBeenCalled();
        expect(profileRepository.updateAccountEmail).not.toHaveBeenCalled();
    });

    it('TC-UNIT-AdminService-018 — a changed email updates the account', async () => {
        await suaUser({ email: 'MoiTinh@LogisCount.VN' });

        expect(profileRepository.updateAccountEmail).toHaveBeenCalledWith(5, 'moitinh@logiscount.vn');
    });

    it('TC-UNIT-AdminService-019 — a blank email does not update the account email', async () => {
        await suaUser({ email: '   ' });

        expect(profileRepository.updateAccountEmail).not.toHaveBeenCalled();
    });

    it('TC-UNIT-AdminService-020 — a manager account can NOT be updated (403)', async () => {
        profileRepository.getProfileById.mockResolvedValue({ id: 5, role: 'manager', is_active: true });

        await expect(suaUser())
            .rejects.toMatchObject({ message: 'Không thể cập nhật tài khoản manager.', status: 403 });

        expect(profileRepository.adminUpdateUser).not.toHaveBeenCalled();
    });

    it('TC-UNIT-AdminService-021 — an admin account can NOT be updated (403)', async () => {
        profileRepository.getProfileById.mockResolvedValue({ id: 5, role: 'ADMIN', is_active: true });

        await expect(suaUser()).rejects.toMatchObject({ status: 403 });
    });

    it('TC-UNIT-AdminService-022 — returns 404 when the user does not exist', async () => {
        profileRepository.getProfileById.mockResolvedValue(null);

        await expect(suaUser()).rejects.toMatchObject({ message: 'Người dùng không tồn tại.', status: 404 });
    });

    it('TC-UNIT-AdminService-023 — switching to the driver role ensures the driver record exists', async () => {
        await suaUser({ role: 'driver' });

        expect(profileRepository.ensureDriverRow).toHaveBeenCalledWith(5);
    });

    it('TC-UNIT-AdminService-024 — a non-driver role creates no driver record', async () => {
        await suaUser({ role: 'accountant' });

        expect(profileRepository.ensureDriverRow).not.toHaveBeenCalled();
    });

    it('TC-UNIT-AdminService-025 — rejects an invalid userId before querying the database', async () => {
        await expect(suaUser({ userId: 0 })).rejects.toMatchObject({ status: 400 });
        await expect(suaUser({ userId: 'abc' })).rejects.toMatchObject({ status: 400 });

        expect(profileRepository.getProfileById).not.toHaveBeenCalled();
    });

    it('TC-UNIT-AdminService-026 — a database unique violation on update also becomes a 409', async () => {
        profileRepository.adminUpdateUser.mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' }));

        await expect(suaUser()).rejects.toMatchObject({ status: 409 });
    });
});

describe('adminService.resetUserPassword', () => {
    it('TC-UNIT-AdminService-027 — with an email the password goes out by mail and is not returned in the response', async () => {
        const kq = await adminService.resetUserPassword(5, 1);

        expect(emailService.sendPasswordResetEmail).toHaveBeenCalledWith(
            'nhanvien@logiscount.vn', expect.any(String), 'Nguyễn Văn A',
        );
        expect(kq).toEqual({
            id: 5, email: 'nhanvien@logiscount.vn', resetEmailSent: true, newPassword: null,
        });
    });

    it('TC-UNIT-AdminService-028 — the password sent out matches the hash just stored', async () => {
        await adminService.resetUserPassword(5, 1);

        const matKhau = emailService.sendPasswordResetEmail.mock.calls[0][1];
        const [, banBam] = profileRepository.resetPassword.mock.calls[0];
        expect(bcrypt.compareSync(matKhau, banBam)).toBe(true);
    });

    it('TC-UNIT-AdminService-029 — an account without an email returns the password, so the user is not locked out', async () => {
        profileRepository.resetPassword.mockResolvedValue({ email: null });

        const kq = await adminService.resetUserPassword(5, 1);

        expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
        expect(kq.resetEmailSent).toBe(false);
        expect(kq.newPassword).toEqual(expect.any(String));
    });

    it('TC-UNIT-AdminService-030 — a user may not reset their own password', async () => {
        await expect(adminService.resetUserPassword(5, 5))
            .rejects.toMatchObject({ status: 400, message: expect.stringContaining('chính mình') });

        expect(profileRepository.resetPassword).not.toHaveBeenCalled();
    });

    it('TC-UNIT-AdminService-031 — a manager or admin password cannot be reset (403)', async () => {
        profileRepository.getProfileById.mockResolvedValue({ id: 5, role: 'manager' });

        await expect(adminService.resetUserPassword(5, 1)).rejects.toMatchObject({ status: 403 });

        expect(profileRepository.resetPassword).not.toHaveBeenCalled();
    });

    it('TC-UNIT-AdminService-032 — returns 404 when the repository updates nothing', async () => {
        profileRepository.resetPassword.mockResolvedValue(null);

        await expect(adminService.resetUserPassword(5, 1)).rejects.toMatchObject({ status: 404 });

        expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
});

describe('adminService.toggleUserStatus', () => {
    it('TC-UNIT-AdminService-033 — locking an open account writes to the database and notifies managers', async () => {
        profileRepository.getProfileById.mockResolvedValue({
            id: 5, full_name: 'Nguyễn Văn A', role: 'driver', is_active: true,
        });

        const kq = await adminService.toggleUserStatus(5, false, 1);

        expect(profileRepository.adminToggleUserStatus).toHaveBeenCalledWith(5, false);
        expect(kq.changed).toBe(true);
        expect(notifyRolesSafe).toHaveBeenCalledWith(
            ['manager'],
            expect.objectContaining({ type: 'USER_STATUS_CHANGED', entityId: 5 }),
            { excludeUserId: 1, displayMode: 'toast' },
        );
    });

    it('TC-UNIT-AdminService-034 — an unchanged status writes NOTHING and returns changed=false', async () => {
        profileRepository.getProfileById.mockResolvedValue({ id: 5, role: 'driver', is_active: true });

        const kq = await adminService.toggleUserStatus(5, true, 1);

        expect(profileRepository.adminToggleUserStatus).not.toHaveBeenCalled();
        expect(notifyRolesSafe).not.toHaveBeenCalled();
        expect(kq).toEqual({ id: 5, is_active: true, changed: false });
    });

    it('TC-UNIT-AdminService-035 — a user may not lock their own account', async () => {
        await expect(adminService.toggleUserStatus(5, false, 5))
            .rejects.toMatchObject({ status: 400, message: 'Không thể tự khóa tài khoản của chính mình.' });

        expect(profileRepository.getProfileById).not.toHaveBeenCalled();
    });

    it('TC-UNIT-AdminService-036 — a manager or admin account cannot be locked (403)', async () => {
        profileRepository.getProfileById.mockResolvedValue({ id: 5, role: 'admin', is_active: true });

        await expect(adminService.toggleUserStatus(5, false, 1)).rejects.toMatchObject({ status: 403 });

        expect(profileRepository.adminToggleUserStatus).not.toHaveBeenCalled();
    });

    it('TC-UNIT-AdminService-037 — rejects a non-boolean is_active, the string false is not accepted', async () => {
        await expect(adminService.toggleUserStatus(5, 'false', 1)).rejects.toMatchObject({ status: 400 });
        await expect(adminService.toggleUserStatus(5, 1, 1)).rejects.toMatchObject({ status: 400 });

        expect(profileRepository.adminToggleUserStatus).not.toHaveBeenCalled();
    });
});
