const profileRepository = require('../repositories/profileRepository');
const bcrypt = require('bcryptjs');
const emailService = require('./emailService');
const notificationGateway = require('./notificationGateway');
const {
    normalizePositiveInteger,
    normalizeRole,
    normalizeRequiredText,
    normalizePhone,
    normalizeGender,
    normalizeDob,
    normalizeOptionalText,
    normalizeNationalId,
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
    fieldLabel: 'ID nguoi dung',
    errorFactory: createAdminError,
});

const normalizeManagerRole = (role) => normalizeRole(role, { errorFactory: createAdminError });

const normalizeFullName = (fullName) => normalizeRequiredText(fullName, {
    fieldLabel: 'Ho ten',
    errorFactory: createAdminError,
});

const normalizeUserPhone = (phone) => normalizePhone(phone, { errorFactory: createAdminError });

const normalizeUserGender = (gender) => normalizeGender(gender, { errorFactory: createAdminError });

const normalizeUserDob = (dob) => normalizeDob(dob, { errorFactory: createAdminError });

const normalizeHometown = (city) => normalizeOptionalText(city, {
    fieldLabel: 'Que quan',
    errorFactory: createAdminError,
});

const normalizeAddress = (address) => normalizeOptionalText(address, {
    fieldLabel: 'Dia chi',
    errorFactory: createAdminError,
});

const normalizeCountry = (country) => normalizeOptionalText(country, {
    fieldLabel: 'Quoc gia',
    errorFactory: createAdminError,
}) || 'VN';

const normalizeUserNationalId = (nationalId) => normalizeNationalId(nationalId, {
    errorFactory: createAdminError,
});

const normalizeUserTaxCode = (taxCode) => normalizeOptionalText(taxCode, {
    fieldLabel: 'Ma so thue',
    errorFactory: createAdminError,
});

const normalizeEmergencyContactName = (value) => normalizeOptionalText(value, {
    fieldLabel: 'Nguoi lien he khan cap',
    errorFactory: createAdminError,
});

const normalizeEmergencyContactPhone = (value) => normalizePhone(value, {
    errorFactory: createAdminError,
});

const normalizeUserNotes = (value) => normalizeOptionalText(value, {
    fieldLabel: 'Ghi chu',
    errorFactory: createAdminError,
});

const ensureRoleExists = async (role) => {
    const roleId = await profileRepository.getRoleIdByName(role);
    if (!roleId) {
        throw new AdminError('Vai tro khong hop le.', 400);
    }
    return roleId;
};

const ensureUserExists = async (userId) => {
    const existingUser = await profileRepository.getProfileById(userId);
    if (!existingUser) {
        throw new AdminError('Nguoi dung khong ton tai.', 404);
    }
    return existingUser;
};

const ensureUserCanBeManaged = (user, action) => {
    if (isProtectedUserRole(user?.role)) {
        throw new AdminError(`Khong the ${action} tai khoan ${String(user.role).toLowerCase()}.`, 403);
    }
};

const getAllUsers = async () => {
    return profileRepository.getAllUsers();
};

const createUser = async (email, full_name, phone, role, gender, dob, city, address, country, national_id, tax_code, emergency_contact_name, emergency_contact_phone, notes) => {
    const password = '123123';
    if (!email || !role) {
        throw new AdminError('Thieu thong tin bat buoc (email, role).', 400);
    }

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
    const normalizedRole = normalizeManagerRole(role);
    const roleId = await ensureRoleExists(normalizedRole);

    const existingAccount = await profileRepository.getAccountByEmail(email);
    if (existingAccount) {
        throw new AdminError('Email da ton tai.', 409);
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    try {
        const newId = await profileRepository.adminCreateUser(
            email,
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
        );
        emailService.sendWelcomeEmail(email, password, normalizedFullName, normalizedRole);
        notificationGateway.broadcastToRole('manager', {
            type: 'manager.users.changed',
            action: 'created',
            userId: newId,
        });
        return newId;
    } catch (err) {
        if (err.code === '23505') {
            throw new AdminError('So dien thoai hoac Email da ton tai.', 409);
        }
        throw err;
    }
};

const updateUser = async (userId, full_name, phone, role, gender, dob, city, address, country, national_id, tax_code, emergency_contact_name, emergency_contact_phone, notes) => {
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

    const existingUser = await ensureUserExists(normalizedUserId);
    ensureUserCanBeManaged(existingUser, 'cap nhat');

    const roleId = await ensureRoleExists(normalizedRole);

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
        notificationGateway.broadcastToRole('manager', {
            type: 'manager.users.changed',
            action: 'updated',
            userId: normalizedUserId,
        });
    } catch (err) {
        if (err.code === '23505') {
            throw new AdminError('So dien thoai da ton tai.', 409);
        }
        throw err;
    }
};

const toggleUserStatus = async (userId, is_active, currentUserId) => {
    const normalizedUserId = normalizeUserId(userId);
    const normalizedCurrentUserId = normalizeUserId(currentUserId);
    const normalizedStatus = assertBoolean(is_active, {
        fieldLabel: 'is_active',
        errorFactory: createAdminError,
    });

    if (normalizedUserId === normalizedCurrentUserId) {
        throw new AdminError('Khong the tu khoa tai khoan cua chinh minh.', 400);
    }

    const existingUser = await ensureUserExists(normalizedUserId);
    ensureUserCanBeManaged(existingUser, normalizedStatus ? 'mo khoa' : 'khoa');

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
    return {
        ...updatedUser,
        changed: true,
    };
};

module.exports = {
    getAllUsers,
    createUser,
    updateUser,
    toggleUserStatus,
    AdminError,
};
