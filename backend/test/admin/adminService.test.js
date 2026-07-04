const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert');

const profileRepository = require('../../repositories/profileRepository');
const bcrypt = require('bcryptjs');
const emailService = require('../../services/emailService');

const adminService = require('../../services/adminService');
const { AdminError } = adminService;

describe('Admin Service', () => {
    afterEach(() => {
        mock.restoreAll();
    });

    describe('getAllUsers', () => {
        it('returns a list of users', async () => {
            const mockUsers = [{ id: 1, email: 'user1@example.com' }, { id: 2, email: 'user2@example.com' }];
            mock.method(profileRepository, 'getAllUsers', async () => mockUsers);

            const result = await adminService.getAllUsers();

            assert.deepStrictEqual(result, mockUsers);
        });
    });

    describe('createUser', () => {
        beforeEach(() => {
            mock.method(bcrypt, 'genSalt', async () => 'somesalt');
            mock.method(bcrypt, 'hash', async () => 'hashedpassword');
            mock.method(emailService, 'sendWelcomeEmail', async () => {});
        });

        it('creates user successfully', async () => {
            mock.method(profileRepository, 'getRoleIdByName', async () => 1);
            mock.method(profileRepository, 'getAccountByEmail', async () => null);
            mock.method(profileRepository, 'adminCreateUser', async () => 100);

            const newId = await adminService.createUser('test@example.com', 'Full Name', '0123456789', 'admin');

            assert.strictEqual(newId, 100);
            assert.strictEqual(emailService.sendWelcomeEmail.mock.calls.length, 1);
        });
    });

    describe('updateUser', () => {
        it('updates user with normalized values', async () => {
            mock.method(profileRepository, 'getProfileById', async () => ({ id: 1 }));
            mock.method(profileRepository, 'getRoleIdByName', async () => 2);
            mock.method(profileRepository, 'adminUpdateUser', async () => true);

            await adminService.updateUser('1', '  Updated   Name  ', ' 0987654321 ', ' Manager ');

            const updateArgs = profileRepository.adminUpdateUser.mock.calls[0].arguments;
            assert.strictEqual(updateArgs[0], 1);
            assert.deepStrictEqual(updateArgs[1], {
                full_name: 'Updated Name',
                phone: '0987654321',
                gender: null,
                dob: null,
                city: null,
                address: null,
                country: 'VN',
                national_id: null,
                tax_code: null,
                emergency_contact_name: null,
                emergency_contact_phone: null,
                notes: null,
            });
            assert.strictEqual(updateArgs[2], 2);
        });

        it('allows clearing phone by passing blank string', async () => {
            mock.method(profileRepository, 'getProfileById', async () => ({ id: 1 }));
            mock.method(profileRepository, 'getRoleIdByName', async () => 2);
            mock.method(profileRepository, 'adminUpdateUser', async () => true);

            await adminService.updateUser(1, 'Updated Name', '   ', 'manager');

            const updateArgs = profileRepository.adminUpdateUser.mock.calls[0].arguments;
            assert.deepStrictEqual(updateArgs[1], {
                full_name: 'Updated Name',
                phone: null,
                gender: null,
                dob: null,
                city: null,
                address: null,
                country: 'VN',
                national_id: null,
                tax_code: null,
                emergency_contact_name: null,
                emergency_contact_phone: null,
                notes: null,
            });
        });

        it('throws 400 when userId is invalid', async () => {
            await assert.rejects(
                () => adminService.updateUser('abc', 'Updated', '0987654321', 'manager'),
                (err) => err instanceof AdminError && err.status === 400 && err.message === 'ID người dùng không hợp lệ.',
            );
        });

        it('throws 400 when role is missing', async () => {
            await assert.rejects(
                () => adminService.updateUser(1, 'Updated', '0987654321', undefined),
                (err) => err instanceof AdminError && err.status === 400 && err.message === 'Vai trò không hợp lệ.',
            );
        });

        it('throws 400 when full_name is blank', async () => {
            await assert.rejects(
                () => adminService.updateUser(1, '   ', '0987654321', 'manager'),
                (err) => err instanceof AdminError && err.status === 400 && err.message === 'Họ tên không được để trống.',
            );
        });

        it('throws 400 when phone is invalid', async () => {
            await assert.rejects(
                () => adminService.updateUser(1, 'Updated', '12-34', 'manager'),
                (err) => err instanceof AdminError && err.status === 400 && err.message === 'Số điện thoại không hợp lệ.',
            );
        });

        it('throws 404 when user does not exist', async () => {
            mock.method(profileRepository, 'getProfileById', async () => null);

            await assert.rejects(
                () => adminService.updateUser(999, 'Updated', '0987654321', 'manager'),
                (err) => err instanceof AdminError && err.status === 404 && err.message === 'Người dùng không tồn tại.',
            );
        });

        it('throws 403 when updating protected roles', async () => {
            mock.method(profileRepository, 'getProfileById', async () => ({ id: 1, role: 'manager', is_active: true }));

            await assert.rejects(
                () => adminService.updateUser(1, 'Updated', '0987654321', 'driver'),
                (err) => err instanceof AdminError && err.status === 403 && err.message === 'Không thể cập nhật tài khoản manager.',
            );
        });

        it('throws 400 when role is invalid', async () => {
            mock.method(profileRepository, 'getProfileById', async () => ({ id: 1 }));
            mock.method(profileRepository, 'getRoleIdByName', async () => null);

            await assert.rejects(
                () => adminService.updateUser(1, 'Updated', '0987654321', 'ghost'),
                (err) => err instanceof AdminError && err.status === 400 && err.message === 'Vai trò không hợp lệ.',
            );
        });

        it('throws 409 on duplicate phone', async () => {
            mock.method(profileRepository, 'getProfileById', async () => ({ id: 1 }));
            mock.method(profileRepository, 'getRoleIdByName', async () => 2);
            const error = new Error('Dup');
            error.code = '23505';
            mock.method(profileRepository, 'adminUpdateUser', async () => {
                throw error;
            });

            await assert.rejects(
                () => adminService.updateUser(1, 'Updated', '0987654321', 'manager'),
                (err) => err instanceof AdminError && err.status === 409 && err.message === 'Số điện thoại đã tồn tại.',
            );
        });
    });

    describe('toggleUserStatus', () => {
        it('locks account successfully', async () => {
            mock.method(profileRepository, 'getProfileById', async () => ({ id: 2, role: 'driver', is_active: true }));
            mock.method(profileRepository, 'adminToggleUserStatus', async () => ({ id: 2 }));

            await adminService.toggleUserStatus(2, false, 1);

            const args = profileRepository.adminToggleUserStatus.mock.calls[0].arguments;
            assert.strictEqual(args[0], 2);
            assert.strictEqual(args[1], false);
        });

        it('does not call repository when account is already disabled', async () => {
            mock.method(profileRepository, 'getProfileById', async () => ({ id: 2, role: 'driver', is_active: false }));
            mock.method(profileRepository, 'adminToggleUserStatus', async () => ({ id: 2, is_active: false }));

            const result = await adminService.toggleUserStatus(2, false, 1);

            assert.strictEqual(profileRepository.adminToggleUserStatus.mock.calls.length, 0);
            assert.deepStrictEqual(result, { id: 2, is_active: false, changed: false });
        });

        it('prevents locking self', async () => {
            await assert.rejects(
                () => adminService.toggleUserStatus(1, false, 1),
                (err) => err instanceof AdminError && err.status === 400 && err.message === 'Không thể tự khóa tài khoản của chính mình.',
            );
        });

        it('rejects non-boolean is_active', async () => {
            await assert.rejects(
                () => adminService.toggleUserStatus(2, 'false', 1),
                (err) => err instanceof AdminError && err.status === 400 && err.message === 'is_active không hợp lệ.',
            );
        });

        it('rejects disabling protected roles', async () => {
            mock.method(profileRepository, 'getProfileById', async () => ({ id: 2, role: 'manager', is_active: true }));

            await assert.rejects(
                () => adminService.toggleUserStatus(2, false, 1),
                (err) => err instanceof AdminError && err.status === 403 && err.message === 'Không thể khóa tài khoản manager.',
            );
        });
    });
});
