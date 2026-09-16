const profileRepository = require('../repositories/profileRepository');
const driverEmploymentRepository = require('../repositories/driverEmploymentRepository');
const activityLogRepository = require('../repositories/activityLogRepository');
const bcrypt = require('bcryptjs');
const emailService = require('./emailService');
const notificationGateway = require('./notificationGateway');
const { notifyRolesSafe } = require('./roleNotificationService');
const { generateRandomPassword } = require('../utils/passwordGenerator');
const {
    normalizePositiveInteger,
    normalizeRole,
    normalizeRequiredText,
    normalizePhone,
    normalizeGender,
    normalizeDob,
    normalizeHireDate,
    normalizeTerminationDate,
    normalizeOptionalText,
    normalizeNationalId,
    normalizeEmail,
    normalizeOptionalEmail,
    assertBoolean,
    isProtectedUserRole,
} = require('../utils/userValidation');

class AdminError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.name = 'AdminError';
        this.status = status;
    }
}

const createAdminError = (message, status = 400) => new AdminError(message, status);

const normalizeUserId = (userId) => normalizePositiveInteger(userId, {
    fieldLabel: 'ID người dùng',
    errorFactory: createAdminError,
});

const normalizeManagerRole = (role) => normalizeRole(role, { errorFactory: createAdminError });

const normalizeFullName = (fullName) => normalizeRequiredText(fullName, {
    fieldLabel: 'Họ tên',
    errorFactory: createAdminError,
});

const normalizeUserPhone = (phone) => normalizePhone(phone, { errorFactory: createAdminError });

const normalizeUserGender = (gender) => normalizeGender(gender, { errorFactory: createAdminError });

const normalizeUserDob = (dob) => normalizeDob(dob, { errorFactory: createAdminError });

const normalizeUserHireDate = (hireDate) => normalizeHireDate(hireDate, { errorFactory: createAdminError });

const normalizeUserTerminationDate = (value) => normalizeTerminationDate(value, { errorFactory: createAdminError });

const normalizeHometown = (city) => normalizeOptionalText(city, {
    fieldLabel: 'Quê quán',
    errorFactory: createAdminError,
});

const normalizeAddress = (address) => normalizeOptionalText(address, {
    fieldLabel: 'Địa chỉ',
    errorFactory: createAdminError,
});

const normalizeCountry = (country) => normalizeOptionalText(country, {
    fieldLabel: 'Quốc gia',
    errorFactory: createAdminError,
}) || 'VN';

const normalizeUserNationalId = (nationalId) => normalizeNationalId(nationalId, {
    errorFactory: createAdminError,
});

const normalizeUserTaxCode = (taxCode) => normalizeOptionalText(taxCode, {
    fieldLabel: 'Mã số thuế',
    errorFactory: createAdminError,
});

const normalizeEmergencyContactName = (value) => normalizeOptionalText(value, {
    fieldLabel: 'Người liên hệ khẩn cấp',
    errorFactory: createAdminError,
});

const normalizeEmergencyContactPhone = (value) => normalizePhone(value, {
    errorFactory: createAdminError,
});

const normalizeUserNotes = (value) => normalizeOptionalText(value, {
    fieldLabel: 'Ghi chú',
    errorFactory: createAdminError,
});

const ensureRoleExists = async (role) => {
    const roleId = await profileRepository.getRoleIdByName(role);
    if (!roleId) {
        throw new AdminError('Vai trò không hợp lệ.', 400);
    }
    return roleId;
};

const ensureUserExists = async (userId) => {
    const existingUser = await profileRepository.getProfileById(userId);
    if (!existingUser) {
        throw new AdminError('Người dùng không tồn tại.', 404);
    }
    return existingUser;
};

const ensureUserCanBeManaged = (user, action) => {
    if (isProtectedUserRole(user?.role)) {
        throw new AdminError(`Không thể ${action} tài khoản ${String(user.role).toLowerCase()}.`, 403);
    }
};

// ─── Hồ sơ công việc tài xế (ngày vào làm / ngày nghỉ việc) ─────────────────

const PAYROLL_STATUS_LABEL = { reviewed: 'Manager đã duyệt', approved: 'Kế toán xác nhận', paid: 'Đã trả lương' };

const monthStart = (iso) => `${iso.slice(0, 7)}-01`;

const addDays = (iso, n) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

const todayVN = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });

const formatVN = (iso) => iso.split('-').reverse().join('/');

// Các kỳ lương đổi số công khi dời một mốc: [tháng đầu, tháng cuối] ('YYYY-MM-01', cuối
// null = không giới hạn), hoặc null nếu không đổi. Tính theo NGÀY bị đổi trạng thái, không
// theo tháng của hai mốc — ghi ngày nghỉ việc 31/08 không đụng gì tới kỳ tháng 8.
//  • Ngày vào làm a → b: đổi các ngày [min, max − 1].
//  • Ngày làm cuối a → b (null = đang làm, tức vô hạn): đổi các ngày [min + 1, max].
const hireAffectedMonths = (a, b) => {
    if (a === b) return null;
    const [lo, hi] = [a, b].sort();
    return [monthStart(lo), monthStart(addDays(hi, -1))];
};

const terminationAffectedMonths = (a, b) => {
    if (a === b) return null;
    if (!a || !b) return [monthStart(addDays(a || b, 1)), null];
    const [lo, hi] = [a, b].sort();
    return [monthStart(addDays(lo, 1)), monthStart(hi)];
};

// Kiểm tra một thay đổi hồ sơ công việc TRƯỚC khi ghi. hireDate null = giữ nguyên;
// terminationDate undefined = giữ nguyên, null = xoá (tài quay lại làm / nhập nhầm).
// Chặn khi kỳ lương bị ảnh hưởng đã chốt: số công kỳ đó sẽ lệch với số tiền đã duyệt/đã
// trả mà không ai hay (bảng lương chỉ tính lại phiếu 'pending'). Cùng nguyên tắc với chặn
// chấm công lùi vào kỳ đã chốt (attendanceService.markAttendance).
const planEmploymentChange = async (driverId, { hireDate = null, terminationDate } = {}) => {
    const current = await driverEmploymentRepository.getEmployment(driverId);
    const next = {
        hire_date: hireDate ?? current?.hire_date ?? null,
        termination_date: terminationDate === undefined ? (current?.termination_date ?? null) : terminationDate,
    };
    if (next.hire_date && next.termination_date && next.termination_date < next.hire_date) {
        throw new AdminError('Ngày nghỉ việc không được trước ngày vào làm.', 400);
    }
    // Chưa có dòng drivers → chưa có phiếu lương nào để lệch
    if (!current) return { current: null, next };

    const ranges = [
        hireAffectedMonths(current.hire_date, next.hire_date),
        terminationAffectedMonths(current.termination_date, next.termination_date),
    ].filter(Boolean);
    for (const [from, to] of ranges) {
        const locked = await driverEmploymentRepository.findLockedPayroll(driverId, from, to);
        if (locked) {
            throw new AdminError(
                `Bảng lương tháng ${locked.payroll_month}/${locked.payroll_year} đã chốt (${PAYROLL_STATUS_LABEL[locked.status] ?? locked.status}) — `
                + 'đổi ngày này làm số công kỳ đó lệch với số tiền đã duyệt/đã trả. Trả phiếu lương về "Chờ duyệt" trước nếu cần sửa.',
                409,
            );
        }
    }
    return { current, next };
};

const commitEmploymentChange = async (driverId, { current, next }, actorId) => {
    if (!current || (current.hire_date === next.hire_date && current.termination_date === next.termination_date)) {
        return current;
    }
    const saved = await driverEmploymentRepository.updateEmployment(driverId, next.hire_date, next.termination_date);
    // Hai mốc này ăn thẳng vào lương — phải truy được ai đổi, đổi từ gì sang gì
    activityLogRepository.logSafe({
        userId: actorId,
        action: 'driver_employment_update',
        entityType: 'drivers',
        entityId: driverId,
        oldData: { hire_date: current.hire_date, termination_date: current.termination_date },
        newData: { hire_date: saved?.hire_date ?? next.hire_date, termination_date: saved?.termination_date ?? next.termination_date },
    });
    return saved;
};

const getAllUsers = async () => {
    return profileRepository.getAllUsers();
};

// hireDate (tuỳ chọn, chỉ dùng cho tài xế): ngày vào làm — lương tháng đầu chỉ tính công từ
// ngày này. Bỏ trống thì lấy ngày tạo tài khoản như trước.
const createUser = async (email, full_name, phone, role, gender, dob, city, address, country, national_id, tax_code, emergency_contact_name, emergency_contact_phone, notes, actorId = null, { hireDate } = {}) => {
    const password = generateRandomPassword();
    if (!role) {
        throw new AdminError('Thiếu thông tin bắt buộc (role).', 400);
    }

    // Email tuỳ chọn: để trống → null. Nhân viên không có email vẫn đăng nhập được
    // bằng số điện thoại (utils/loginIdentifier).
    const normalizedEmail = normalizeOptionalEmail(email, { errorFactory: createAdminError });

    const normalizedFullName = normalizeFullName(full_name || '');
    const normalizedPhone = normalizeUserPhone(phone);
    const normalizedGender = normalizeUserGender(gender);
    const normalizedDob = normalizeUserDob(dob);
    const normalizedCity = normalizeHometown(city);
    const normalizedAddress = normalizeAddress(address);
    const normalizedCountry = normalizeCountry(country);
    const normalizedNationalId = normalizeUserNationalId(national_id);
    const normalizedTaxCode = normalizeUserTaxCode(tax_code);
    const normalizedEmergencyContactName = normalizeEmergencyContactName(emergency_contact_name);
    const normalizedEmergencyContactPhone = normalizeEmergencyContactPhone(emergency_contact_phone);
    const normalizedNotes = normalizeUserNotes(notes);
    const normalizedHireDate = normalizeUserHireDate(hireDate);
    const normalizedRole = normalizeManagerRole(role);
    const roleId = await ensureRoleExists(normalizedRole);

    // Chỉ kiểm tra trùng khi CÓ email — nhiều tài khoản cùng để trống là hợp lệ.
    if (normalizedEmail) {
        const existingAccount = await profileRepository.getAccountByEmail(normalizedEmail);
        if (existingAccount) {
            throw new AdminError('Email đã tồn tại.', 409);
        }
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    try {
        const newId = await profileRepository.adminCreateUser(
            normalizedEmail,
            passwordHash,
            roleId,
            normalizedFullName,
            normalizedPhone,
            normalizedDob,
            normalizedGender,
            normalizedCity,
            normalizedAddress,
            normalizedCountry,
            normalizedNationalId,
            normalizedTaxCode,
            normalizedEmergencyContactName,
            normalizedEmergencyContactPhone,
            normalizedNotes,
            normalizedRole === 'driver',
            normalizedRole === 'driver' ? normalizedHireDate : null,
        );
        // Có email thì gửi mail chào mừng kèm mật khẩu; không có thì bỏ qua.
        if (normalizedEmail) {
            emailService.sendWelcomeEmail(normalizedEmail, password, normalizedFullName, normalizedRole);
        }
        notificationGateway.broadcastToRole('manager', {
            type: 'manager.users.changed',
            action: 'created',
            userId: newId,
        });
        notifyRolesSafe(['manager'], {
            title: 'Tài khoản mới đã được tạo',
            message: `Tài khoản ${normalizedFullName} (${normalizedRole}) vừa được tạo.`,
            type: 'USER_CREATED',
            entityType: 'users',
            entityId: newId,
        }, { excludeUserId: actorId, displayMode: 'toast' });

        // Không có email thì KHÔNG có đường nào khác để giao mật khẩu khởi tạo —
        // trả về đúng một lần cho màn quản lý hiển thị để giao tận tay. Có email rồi
        // thì cố tình KHÔNG trả, để mật khẩu không nằm thừa trong log/response.
        return {
            id: newId,
            email: normalizedEmail,
            welcomeEmailSent: Boolean(normalizedEmail),
            initialPassword: normalizedEmail ? null : password,
        };
    } catch (err) {
        if (err.code === '23505') {
            throw new AdminError('Số điện thoại hoặc Email đã tồn tại.', 409);
        }
        throw err;
    }
};

// hireDate (tuỳ chọn, chỉ dùng cho tài xế): sửa ngày vào làm. Bỏ trống = giữ nguyên.
const updateUser = async (userId, full_name, phone, role, gender, dob, city, address, country, national_id, tax_code, emergency_contact_name, emergency_contact_phone, notes, email, actorId = null, { hireDate } = {}) => {
    const normalizedUserId = normalizeUserId(userId);
    const normalizedRole = normalizeManagerRole(role);
    const normalizedFullName = normalizeFullName(full_name);
    const normalizedPhone = normalizeUserPhone(phone);
    const normalizedGender = normalizeUserGender(gender);
    const normalizedDob = normalizeUserDob(dob);
    const normalizedCity = normalizeHometown(city);
    const normalizedAddress = normalizeAddress(address);
    const normalizedCountry = normalizeCountry(country);
    const normalizedNationalId = normalizeUserNationalId(national_id);
    const normalizedTaxCode = normalizeUserTaxCode(tax_code);
    const normalizedEmergencyContactName = normalizeEmergencyContactName(emergency_contact_name);
    const normalizedEmergencyContactPhone = normalizeEmergencyContactPhone(emergency_contact_phone);
    const normalizedNotes = normalizeUserNotes(notes);
    const normalizedHireDate = normalizeUserHireDate(hireDate);
    const normalizedEmail = email?.trim() ? normalizeEmail(email, { errorFactory: createAdminError }) : null;

    const existingUser = await ensureUserExists(normalizedUserId);
    ensureUserCanBeManaged(existingUser, 'cập nhật');

    const roleId = await ensureRoleExists(normalizedRole);

    // Ngày vào làm sửa được ở đây lẫn ở "Hồ sơ công việc" — cùng một đường kiểm tra. Kiểm
    // TRƯỚC khi ghi hồ sơ để lỗi (kỳ lương đã chốt) không để lại cập nhật dở dang.
    const employmentPlan = normalizedRole === 'driver' && normalizedHireDate
        ? await planEmploymentChange(normalizedUserId, { hireDate: normalizedHireDate })
        : null;

    try {
        await profileRepository.adminUpdateUser(
            normalizedUserId,
            {
                full_name: normalizedFullName,
                phone: normalizedPhone,
                gender: normalizedGender,
                dob: normalizedDob,
                city: normalizedCity,
                address: normalizedAddress,
                country: normalizedCountry,
                national_id: normalizedNationalId,
                tax_code: normalizedTaxCode,
                emergency_contact_name: normalizedEmergencyContactName,
                emergency_contact_phone: normalizedEmergencyContactPhone,
                notes: normalizedNotes,
            },
            roleId,
        );
        if (normalizedEmail && normalizedEmail !== String(existingUser.email || '').trim().toLowerCase()) {
            await profileRepository.updateAccountEmail(normalizedUserId, normalizedEmail);
        }
        if (normalizedRole === 'driver') {
            // Chưa có dòng drivers (vừa đổi vai trò sang tài xế) thì tạo luôn với ngày vào
            // làm đã nhập; có rồi thì ensureDriverRow không đụng tới — ghi qua kế hoạch đã kiểm.
            await profileRepository.ensureDriverRow(normalizedUserId, normalizedHireDate);
            if (employmentPlan) {
                await commitEmploymentChange(normalizedUserId, employmentPlan, actorId);
            }
        }
        notificationGateway.broadcastToRole('manager', {
            type: 'manager.users.changed',
            action: 'updated',
            userId: normalizedUserId,
        });
        notifyRolesSafe(['manager'], {
            title: 'Tài khoản đã được cập nhật',
            message: `Thông tin tài khoản ${normalizedFullName} vừa được cập nhật.`,
            type: 'USER_UPDATED',
            entityType: 'users',
            entityId: normalizedUserId,
        }, { excludeUserId: actorId, displayMode: 'toast' });
    } catch (err) {
        if (err.code === '23505') {
            throw new AdminError('Số điện thoại hoặc Email đã tồn tại.', 409);
        }
        throw err;
    }
};

// Hồ sơ công việc của tài xế — màn Người dùng, nút "Hồ sơ". hireDate null = giữ nguyên;
// terminationDate undefined = giữ nguyên, null/'' = xoá ngày nghỉ việc.
const updateDriverEmployment = async (userId, { hireDate, terminationDate } = {}, actorId = null) => {
    const normalizedUserId = normalizeUserId(userId);
    const normalizedHireDate = normalizeUserHireDate(hireDate);
    const normalizedTermination = terminationDate === undefined
        ? undefined
        : normalizeUserTerminationDate(terminationDate);

    const existingUser = await ensureUserExists(normalizedUserId);
    if (existingUser.role !== 'driver') {
        throw new AdminError('Chỉ tài xế mới có ngày vào làm / ngày nghỉ việc.', 400);
    }

    const plan = await planEmploymentChange(normalizedUserId, {
        hireDate: normalizedHireDate,
        terminationDate: normalizedTermination,
    });
    if (!plan.current) {
        throw new AdminError('Không tìm thấy hồ sơ tài xế.', 404);
    }

    const saved = await commitEmploymentChange(normalizedUserId, plan, actorId);
    notificationGateway.broadcastToRole('manager', {
        type: 'manager.users.changed',
        action: 'updated',
        userId: normalizedUserId,
    });
    return saved;
};

// Chấm dứt hợp đồng tài xế — nút "Chấm dứt HĐ" ở màn Người dùng, thay cho "Khóa". Ghi ngày
// làm việc cuối cùng và khoá tài khoản trong CÙNG một giao dịch (driverEmploymentRepository
// .terminateContract). Ứng lương đã giải ngân và công nợ vẫn trừ vào lương kỳ cuối như
// thường lệ; phần còn lại kế toán quyết toán ở Bảng lương → "Quyết toán nghỉ việc".
const terminateDriverContract = async (userId, { terminationDate, reason } = {}, actorId = null) => {
    const normalizedUserId = normalizeUserId(userId);
    const normalizedDate = normalizeUserTerminationDate(terminationDate);
    if (!normalizedDate) {
        throw new AdminError('Vui lòng chọn ngày làm việc cuối cùng.', 400);
    }
    // Khoá tài khoản ngay → ngày làm cuối không thể ở tương lai: những ngày còn lại tài không
    // đăng nhập được để chạy chuyến mà vẫn được tính công
    if (normalizedDate > todayVN()) {
        throw new AdminError('Ngày làm việc cuối cùng không được sau hôm nay — tài khoản bị khoá ngay khi chấm dứt hợp đồng.', 400);
    }
    const normalizedReason = normalizeOptionalText(reason, { fieldLabel: 'Lý do', errorFactory: createAdminError });
    if (normalizedReason && normalizedReason.length > 500) {
        throw new AdminError('Lý do không được vượt quá 500 ký tự.', 400);
    }

    const existingUser = await ensureUserExists(normalizedUserId);
    if (existingUser.role !== 'driver') {
        throw new AdminError('Chỉ tài xế mới chấm dứt hợp đồng ở đây — tài khoản khác dùng nút Khóa.', 400);
    }
    const current = await driverEmploymentRepository.getEmployment(normalizedUserId);
    if (!current) {
        throw new AdminError('Không tìm thấy hồ sơ tài xế.', 404);
    }
    if (current.termination_date && existingUser.is_active === false) {
        throw new AdminError(
            `Tài xế đã chấm dứt hợp đồng (làm tới ${formatVN(current.termination_date)}). Sửa ngày ở "Hồ sơ" nếu ghi nhầm.`,
            409,
        );
    }

    const trips = await driverEmploymentRepository.getTripFootprint(normalizedUserId);
    if (trips.activeTrips > 0) {
        throw new AdminError(
            `Tài xế còn ${trips.activeTrips} chuyến đang chạy — hoàn tất hoặc chuyển cho tài xế khác trước khi chấm dứt hợp đồng.`,
            409,
        );
    }
    if (trips.lastCompletedDate && trips.lastCompletedDate > normalizedDate) {
        throw new AdminError(
            `Tài xế có chuyến hoàn thành ngày ${formatVN(trips.lastCompletedDate)} — ngày làm việc cuối cùng không được trước ngày này `
            + '(doanh thu chuyến đó vẫn vào lương mà ngày công lại không tính).',
            400,
        );
    }

    // Cùng đường kiểm tra với "Hồ sơ": ngày làm cuối ≥ ngày vào làm, kỳ lương bị ảnh hưởng
    // chưa chốt. Không commit qua đây — terminateContract ghi tất cả trong một giao dịch.
    const plan = await planEmploymentChange(normalizedUserId, { terminationDate: normalizedDate });

    const result = await driverEmploymentRepository.terminateContract(normalizedUserId, normalizedDate);
    if (!result) {
        throw new AdminError('Không tìm thấy hồ sơ tài xế.', 404);
    }

    activityLogRepository.logSafe({
        userId: actorId,
        action: 'driver_contract_terminated',
        entityType: 'drivers',
        entityId: normalizedUserId,
        oldData: { termination_date: plan.current?.termination_date ?? null, is_active: existingUser.is_active },
        newData: {
            termination_date: result.employment?.termination_date ?? normalizedDate,
            is_active: false,
            reason: normalizedReason,
            released_vehicles: result.releasedVehicles,
            rejected_advance_ids: result.rejectedAdvances.map((a) => a.id),
        },
    });

    const name = existingUser.full_name || `#${normalizedUserId}`;
    const [year, month] = normalizedDate.split('-').map(Number);
    notificationGateway.broadcastToRole('manager', {
        type: 'manager.users.changed',
        action: 'terminated',
        userId: normalizedUserId,
    });
    notifyRolesSafe(['accountant'], {
        title: 'Tài xế chấm dứt hợp đồng — cần quyết toán',
        message: `${name} làm tới ${formatVN(normalizedDate)}. Lương tháng ${month}/${year} chỉ tính công đến ngày này; `
            + 'sau khi chi lương kỳ cuối, thu nốt công nợ / ứng lương còn lại ở Bảng lương → Quyết toán nghỉ việc.',
        type: 'DRIVER_CONTRACT_TERMINATED',
        entityType: 'users',
        entityId: normalizedUserId,
    }, { displayMode: 'alert' });
    notifyRolesSafe(['manager'], {
        title: 'Tài xế đã chấm dứt hợp đồng',
        message: `${name} nghỉ việc, làm tới ${formatVN(normalizedDate)}. Tài khoản đã bị khoá.`,
        type: 'USER_STATUS_CHANGED',
        entityType: 'users',
        entityId: normalizedUserId,
    }, { excludeUserId: actorId, displayMode: 'toast' });

    return {
        employment: result.employment,
        released_vehicles: result.releasedVehicles,
        rejected_advances: result.rejectedAdvances,
    };
};

const resetUserPassword = async (userId, currentUserId) => {
    const normalizedUserId = normalizeUserId(userId);
    const normalizedCurrentUserId = normalizeUserId(currentUserId);

    if (normalizedUserId === normalizedCurrentUserId) {
        throw new AdminError('Không thể tự reset mật khẩu của chính mình — dùng chức năng đổi mật khẩu.', 400);
    }

    const existingUser = await ensureUserExists(normalizedUserId);
    ensureUserCanBeManaged(existingUser, 'reset mật khẩu');

    const newPassword = generateRandomPassword();
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    const updated = await profileRepository.resetPassword(normalizedUserId, passwordHash);
    if (!updated) {
        throw new AdminError('Người dùng không tồn tại.', 404);
    }

    // Tài khoản không có email: mật khẩu mới không có đường nào đi tới người dùng.
    // Bỏ qua bước gửi mail rồi im lặng là khoá luôn tài khoản đó — phải trả mật khẩu
    // về màn quản lý để giao tận tay.
    if (updated.email) {
        emailService.sendPasswordResetEmail(updated.email, newPassword, existingUser.full_name);
    }
    notificationGateway.broadcastToRole('manager', {
        type: 'manager.users.changed',
        action: 'password_reset',
        userId: normalizedUserId,
    });
    notifyRolesSafe(['manager'], {
        title: 'Mật khẩu tài khoản đã được reset',
        message: `Mật khẩu tài khoản ${existingUser.full_name || updated.email || normalizedUserId} vừa được reset.`,
        type: 'USER_PASSWORD_RESET',
        entityType: 'users',
        entityId: normalizedUserId,
    }, { excludeUserId: normalizedCurrentUserId, displayMode: 'toast' });

    return {
        id: normalizedUserId,
        email: updated.email ?? null,
        resetEmailSent: Boolean(updated.email),
        newPassword: updated.email ? null : newPassword,
    };
};

const toggleUserStatus = async (userId, is_active, currentUserId) => {
    const normalizedUserId = normalizeUserId(userId);
    const normalizedCurrentUserId = normalizeUserId(currentUserId);
    const normalizedStatus = assertBoolean(is_active, {
        fieldLabel: 'is_active',
        errorFactory: createAdminError,
    });

    if (normalizedUserId === normalizedCurrentUserId) {
        throw new AdminError('Không thể tự khóa tài khoản của chính mình.', 400);
    }

    const existingUser = await ensureUserExists(normalizedUserId);
    ensureUserCanBeManaged(existingUser, normalizedStatus ? 'mở khóa' : 'khóa');

    if (existingUser.is_active === normalizedStatus) {
        return {
            id: normalizedUserId,
            is_active: normalizedStatus,
            changed: false,
        };
    }

    const updatedUser = await profileRepository.adminToggleUserStatus(normalizedUserId, normalizedStatus);
    notificationGateway.broadcastToRole('manager', {
        type: 'manager.users.changed',
        action: 'status_changed',
        userId: normalizedUserId,
        is_active: normalizedStatus,
    });
    notifyRolesSafe(['manager'], {
        title: normalizedStatus ? 'Tài khoản đã được mở khóa' : 'Tài khoản đã bị khóa',
        message: `Tài khoản ${existingUser.full_name || normalizedUserId} vừa ${normalizedStatus ? 'được mở khóa' : 'bị khóa'}.`,
        type: 'USER_STATUS_CHANGED',
        entityType: 'users',
        entityId: normalizedUserId,
    }, { excludeUserId: normalizedCurrentUserId, displayMode: 'toast' });
    return {
        ...updatedUser,
        changed: true,
    };
};

module.exports = {
    getAllUsers,
    createUser,
    updateUser,
    updateDriverEmployment,
    terminateDriverContract,
    toggleUserStatus,
    resetUserPassword,
    AdminError,
};
