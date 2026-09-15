const { mock } = require('../helpers/nodeTestMock');
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

            // Email không còn bắt buộc, nên createUser phải trả về cả kết quả gửi thư:
            // tài khoản tạo KHÔNG có email thì mật khẩu ban đầu chỉ đến tay người quản lý
            // qua giá trị trả về này — trả mỗi id là mất luôn đường giao mật khẩu.
            const created = await adminService.createUser('test@example.com', 'Full Name', '0123456789', 'admin');

            assert.strictEqual(created.id, 100);
            assert.strictEqual(created.welcomeEmailSent, true);
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

        // 11 tham số giữa role và actorId: gender … email
        const REST = Array(11).fill(undefined);
        const driverEmploymentRepository = require('../../repositories/driverEmploymentRepository');
        const activityLogRepository = require('../../repositories/activityLogRepository');

        // Tài xế đang có hồ sơ: vào làm 01/09/2026, chưa nghỉ việc
        const mockDriverUpdate = ({ locked = null } = {}) => {
            mock.method(profileRepository, 'getProfileById', async () => ({ id: 1, role: 'driver' }));
            mock.method(profileRepository, 'getRoleIdByName', async () => 4);
            mock.method(profileRepository, 'adminUpdateUser', async () => true);
            mock.method(profileRepository, 'ensureDriverRow', async () => {});
            mock.method(driverEmploymentRepository, 'getEmployment', async () => ({ driver_id: 1, hire_date: '2026-09-01', termination_date: null }));
            mock.method(driverEmploymentRepository, 'findLockedPayroll', async () => locked);
            mock.method(driverEmploymentRepository, 'updateEmployment', async (id, hire, term) => ({ driver_id: id, hire_date: hire, termination_date: term }));
            mock.method(activityLogRepository, 'logSafe', () => {});
        };

        it('driver: sửa ngày vào làm — kiểm tra kỳ lương bị ảnh hưởng rồi mới ghi', async () => {
            mockDriverUpdate();

            await adminService.updateUser(1, 'Tai Xe', '0987654321', 'driver', ...REST, null, { hireDate: ' 2026-09-25 ' });

            // Dời 01/09 → 25/09: chỉ kỳ tháng 9 đổi số công
            assert.deepStrictEqual(driverEmploymentRepository.findLockedPayroll.mock.calls[0].arguments, [1, '2026-09-01', '2026-09-01']);
            assert.deepStrictEqual(driverEmploymentRepository.updateEmployment.mock.calls[0].arguments, [1, '2026-09-25', null]);
        });

        it('driver: bỏ trống ngày vào làm thì giữ nguyên, không ghi', async () => {
            mockDriverUpdate();

            await adminService.updateUser(1, 'Tai Xe', '0987654321', 'driver');

            assert.strictEqual(driverEmploymentRepository.updateEmployment.mock.calls.length, 0);
        });

        it('driver: kỳ lương bị ảnh hưởng đã chốt → 409, hồ sơ KHÔNG bị ghi dở', async () => {
            mockDriverUpdate({ locked: { payroll_month: 9, payroll_year: 2026, status: 'approved' } });

            await assert.rejects(
                () => adminService.updateUser(1, 'Tai Xe', '0987654321', 'driver', ...REST, null, { hireDate: '2026-09-25' }),
                (err) => err instanceof AdminError && err.status === 409 && err.message.includes('tháng 9/2026'),
            );
            assert.strictEqual(profileRepository.adminUpdateUser.mock.calls.length, 0);
        });

        it('throws 400 khi ngày vào làm không có thật', async () => {
            await assert.rejects(
                () => adminService.updateUser(1, 'Tai Xe', '0987654321', 'driver', ...REST, null, { hireDate: '2026-02-30' }),
                (err) => err instanceof AdminError && err.status === 400 && err.message === 'Ngày vào làm không hợp lệ.',
            );
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
                (err) => err instanceof AdminError && err.status === 409 && err.message === 'Số điện thoại hoặc Email đã tồn tại.',
            );
        });
    });

    describe('updateDriverEmployment', () => {
        const driverEmploymentRepository = require('../../repositories/driverEmploymentRepository');
        const activityLogRepository = require('../../repositories/activityLogRepository');

        const mockDriver = (
            employment = { driver_id: 1, hire_date: '2020-01-01', termination_date: null },
            { role = 'driver', locked = null } = {},
        ) => {
            mock.method(profileRepository, 'getProfileById', async () => ({ id: 1, role }));
            mock.method(driverEmploymentRepository, 'getEmployment', async () => employment);
            mock.method(driverEmploymentRepository, 'findLockedPayroll', async () => locked);
            mock.method(driverEmploymentRepository, 'updateEmployment', async (id, hire, term) => ({ driver_id: id, hire_date: hire, termination_date: term }));
            mock.method(activityLogRepository, 'logSafe', () => {});
        };

        it('ghi ngày nghỉ việc lần đầu: mọi kỳ từ tháng nghỉ việc trở đi phải chưa chốt', async () => {
            mockDriver();

            const saved = await adminService.updateDriverEmployment(1, { terminationDate: '2026-09-20' }, 9);

            assert.deepStrictEqual(driverEmploymentRepository.findLockedPayroll.mock.calls[0].arguments, [1, '2026-09-01', null]);
            assert.deepStrictEqual(saved, { driver_id: 1, hire_date: '2020-01-01', termination_date: '2026-09-20' });
            const log = activityLogRepository.logSafe.mock.calls[0].arguments[0];
            assert.strictEqual(log.action, 'driver_employment_update');
            assert.strictEqual(log.userId, 9);
        });

        it('xoá ngày nghỉ việc (null) — tài quay lại làm', async () => {
            mockDriver({ driver_id: 1, hire_date: '2020-01-01', termination_date: '2026-08-10' });

            await adminService.updateDriverEmployment(1, { terminationDate: null }, 9);

            assert.deepStrictEqual(driverEmploymentRepository.findLockedPayroll.mock.calls[0].arguments, [1, '2026-08-01', null]);
            assert.deepStrictEqual(driverEmploymentRepository.updateEmployment.mock.calls[0].arguments, [1, '2020-01-01', null]);
        });

        it('không gửi termination_date thì giữ nguyên; không đổi gì thì không ghi', async () => {
            mockDriver({ driver_id: 1, hire_date: '2020-01-01', termination_date: '2026-08-10' });

            await adminService.updateDriverEmployment(1, { hireDate: '2020-01-01' }, 9);

            assert.strictEqual(driverEmploymentRepository.findLockedPayroll.mock.calls.length, 0);
            assert.strictEqual(driverEmploymentRepository.updateEmployment.mock.calls.length, 0);
        });

        it('ngày nghỉ việc trước ngày vào làm → 400', async () => {
            mockDriver();

            await assert.rejects(
                () => adminService.updateDriverEmployment(1, { terminationDate: '2019-12-31' }, 9),
                (err) => err instanceof AdminError && err.status === 400 && err.message === 'Ngày nghỉ việc không được trước ngày vào làm.',
            );
        });

        it('kỳ lương bị ảnh hưởng đã chốt → 409, không ghi', async () => {
            mockDriver(undefined, { locked: { payroll_month: 9, payroll_year: 2026, status: 'paid' } });

            await assert.rejects(
                () => adminService.updateDriverEmployment(1, { terminationDate: '2026-09-20' }, 9),
                (err) => err instanceof AdminError && err.status === 409 && err.message.includes('Đã trả lương'),
            );
            assert.strictEqual(driverEmploymentRepository.updateEmployment.mock.calls.length, 0);
        });

        it('không phải tài xế → 400', async () => {
            mockDriver(undefined, { role: 'accountant' });

            await assert.rejects(
                () => adminService.updateDriverEmployment(1, { hireDate: '2026-01-01' }, 9),
                (err) => err instanceof AdminError && err.status === 400,
            );
        });
    });

    describe('terminateDriverContract', () => {
        const driverEmploymentRepository = require('../../repositories/driverEmploymentRepository');
        const activityLogRepository = require('../../repositories/activityLogRepository');

        const mockTerminate = ({
            employment = { driver_id: 1, hire_date: '2020-01-01', termination_date: null },
            isActive = true,
            role = 'driver',
            locked = null,
            trips = { activeTrips: 0, lastCompletedDate: '2026-08-15' },
        } = {}) => {
            mock.method(profileRepository, 'getProfileById', async () => ({ id: 1, role, is_active: isActive, full_name: 'Tai Xe' }));
            mock.method(driverEmploymentRepository, 'getEmployment', async () => employment);
            mock.method(driverEmploymentRepository, 'findLockedPayroll', async () => locked);
            mock.method(driverEmploymentRepository, 'getTripFootprint', async () => trips);
            mock.method(driverEmploymentRepository, 'terminateContract', async (id, date) => ({
                employment: { ...employment, termination_date: date },
                releasedVehicles: ['51C-123.45'],
                rejectedAdvances: [{ id: 7, amount: '1000000.00', request_month: 8, request_year: 2026 }],
            }));
            mock.method(activityLogRepository, 'logSafe', () => {});
        };

        const tomorrowVN = () => new Date(Date.now() + 86_400_000)
            .toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });

        it('ghi ngày làm cuối + khoá tài khoản trong một thao tác, có nhật ký', async () => {
            mockTerminate();

            const result = await adminService.terminateDriverContract(1, { terminationDate: '2026-08-20', reason: 'Xin nghỉ' }, 9);

            assert.deepStrictEqual(driverEmploymentRepository.terminateContract.mock.calls[0].arguments, [1, '2026-08-20']);
            // Nghỉ 20/08: kỳ tháng 8 trở đi đổi số công → phải chưa chốt
            assert.deepStrictEqual(driverEmploymentRepository.findLockedPayroll.mock.calls[0].arguments, [1, '2026-08-01', null]);
            assert.deepStrictEqual(result.released_vehicles, ['51C-123.45']);
            assert.strictEqual(result.rejected_advances.length, 1);
            const log = activityLogRepository.logSafe.mock.calls[0].arguments[0];
            assert.strictEqual(log.action, 'driver_contract_terminated');
            assert.strictEqual(log.userId, 9);
            assert.strictEqual(log.newData.is_active, false);
            assert.strictEqual(log.newData.termination_date, '2026-08-20');
            assert.deepStrictEqual(log.newData.rejected_advance_ids, [7]);
        });

        it('làm tới ngày cuối tháng: không đụng kỳ lương tháng đó', async () => {
            mockTerminate();

            await adminService.terminateDriverContract(1, { terminationDate: '2026-08-31' }, 9);

            assert.deepStrictEqual(driverEmploymentRepository.findLockedPayroll.mock.calls[0].arguments, [1, '2026-09-01', null]);
        });

        it('ngày làm cuối sau hôm nay → 400 (tài khoản bị khoá ngay)', async () => {
            mockTerminate();

            await assert.rejects(
                () => adminService.terminateDriverContract(1, { terminationDate: tomorrowVN() }, 9),
                (err) => err instanceof AdminError && err.status === 400 && err.message.includes('không được sau hôm nay'),
            );
            assert.strictEqual(driverEmploymentRepository.terminateContract.mock.calls.length, 0);
        });

        it('thiếu ngày làm cuối → 400', async () => {
            mockTerminate();

            await assert.rejects(
                () => adminService.terminateDriverContract(1, {}, 9),
                (err) => err instanceof AdminError && err.status === 400,
            );
        });

        it('còn chuyến đang chạy → 409, không khoá', async () => {
            mockTerminate({ trips: { activeTrips: 2, lastCompletedDate: null } });

            await assert.rejects(
                () => adminService.terminateDriverContract(1, { terminationDate: '2026-08-20' }, 9),
                (err) => err instanceof AdminError && err.status === 409 && err.message.includes('2 chuyến đang chạy'),
            );
            assert.strictEqual(driverEmploymentRepository.terminateContract.mock.calls.length, 0);
        });

        it('có chuyến hoàn thành sau ngày làm cuối → 400', async () => {
            mockTerminate({ trips: { activeTrips: 0, lastCompletedDate: '2026-08-25' } });

            await assert.rejects(
                () => adminService.terminateDriverContract(1, { terminationDate: '2026-08-20' }, 9),
                (err) => err instanceof AdminError && err.status === 400 && err.message.includes('25/08/2026'),
            );
        });

        it('kỳ lương bị ảnh hưởng đã chốt → 409, không khoá', async () => {
            mockTerminate({ locked: { payroll_month: 8, payroll_year: 2026, status: 'approved' } });

            await assert.rejects(
                () => adminService.terminateDriverContract(1, { terminationDate: '2026-08-20' }, 9),
                (err) => err instanceof AdminError && err.status === 409 && err.message.includes('8/2026'),
            );
            assert.strictEqual(driverEmploymentRepository.terminateContract.mock.calls.length, 0);
        });

        it('đã chấm dứt và đã khoá → 409', async () => {
            mockTerminate({
                employment: { driver_id: 1, hire_date: '2020-01-01', termination_date: '2026-07-31' },
                isActive: false,
            });

            await assert.rejects(
                () => adminService.terminateDriverContract(1, { terminationDate: '2026-08-20' }, 9),
                (err) => err instanceof AdminError && err.status === 409 && err.message.includes('31/07/2026'),
            );
        });

        it('không phải tài xế → 400', async () => {
            mockTerminate({ role: 'accountant' });

            await assert.rejects(
                () => adminService.terminateDriverContract(1, { terminationDate: '2026-08-20' }, 9),
                (err) => err instanceof AdminError && err.status === 400,
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
