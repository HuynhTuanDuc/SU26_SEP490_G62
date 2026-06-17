const profileRepository = require('../repositories/profileRepository');
const bcrypt = require('bcryptjs');
const emailService = require('./emailService');

class AdminError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.name = 'AdminError';
        this.status = status;
    }
}

const normalizeUserId = (userId) => {
    const parsedId = Number.parseInt(userId, 10);
    if (!Number.isInteger(parsedId) || parsedId <= 0) {
        throw new AdminError('ID nguoi dung khong hop le.', 400);
    }
    return parsedId;
};

const normalizeRole = (role) => {
    if (typeof role !== 'string' || !role.trim()) {
        throw new AdminError('Vai tro khong duoc de trong.', 400);
    }
    return role.trim().toLowerCase();
};

const normalizeFullName = (fullName) => {
    if (typeof fullName !== 'string') {
        throw new AdminError('Ho ten khong hop le.', 400);
    }

    const trimmedName = fullName.trim().replace(/\s+/g, ' ');
    if (!trimmedName) {
        throw new AdminError('Ho ten khong duoc de trong.', 400);
    }

    return trimmedName;
};

const normalizePhone = (phone) => {
    if (phone === undefined || phone === null) return null;
    if (typeof phone !== 'string') {
        throw new AdminError('So dien thoai khong hop le.', 400);
    }

    const normalizedPhone = phone.trim().replace(/\s+/g, '');
    if (!normalizedPhone) return null;
    if (!/^0\d{9,10}$/.test(normalizedPhone)) {
        throw new AdminError('So dien thoai khong hop le.', 400);
    }

    return normalizedPhone;
};

const normalizeGender = (gender) => {
    if (gender === undefined || gender === null || gender === '') return null;
    if (typeof gender !== 'string') {
        throw new AdminError('Gioi tinh khong hop le.', 400);
    }

    const normalizedGender = gender.trim().toLowerCase();
    if (!['male', 'female', 'other'].includes(normalizedGender)) {
        throw new AdminError('Gioi tinh khong hop le.', 400);
    }

    return normalizedGender;
};

const normalizeDob = (dob) => {
    if (dob === undefined || dob === null || dob === '') return null;
    if (typeof dob !== 'string') {
        throw new AdminError('Ngay sinh khong hop le.', 400);
    }

    const trimmedDob = dob.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedDob)) {
        throw new AdminError('Ngay sinh khong hop le.', 400);
    }

    const date = new Date(`${trimmedDob}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
        throw new AdminError('Ngay sinh khong hop le.', 400);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date > today) {
        throw new AdminError('Ngay sinh khong the trong tuong lai.', 400);
    }

    return trimmedDob;
};

const normalizeHometown = (city) => {
    if (city === undefined || city === null) return null;
    if (typeof city !== 'string') {
        throw new AdminError('Que quan khong hop le.', 400);
    }

    const normalizedCity = city.trim().replace(/\s+/g, ' ');
    return normalizedCity || null;
};

const getAllUsers = async () => {
    return await profileRepository.getAllUsers();
};

const createUser = async (email, full_name, phone, role, gender, dob, city) => {
    const password = '123123';
    if (!email || !role) {
        throw new AdminError('Thieu thong tin bat buoc (email, role).', 400);
    }

    const normalizedFullName = normalizeFullName(full_name || '');
    const normalizedPhone = normalizePhone(phone);
    const normalizedGender = normalizeGender(gender);
    const normalizedDob = normalizeDob(dob);
    const normalizedCity = normalizeHometown(city);
    const normalizedRole = normalizeRole(role);

    const roleId = await profileRepository.getRoleIdByName(normalizedRole);
    if (!roleId) {
        throw new AdminError('Vai tro khong hop le.', 400);
    }

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
        );
        emailService.sendWelcomeEmail(email, password, normalizedFullName, normalizedRole);
        return newId;
    } catch (err) {
        if (err.code === '23505') {
            throw new AdminError('So dien thoai hoac Email da ton tai.', 409);
        }
        throw err;
    }
};

const updateUser = async (userId, full_name, phone, role, gender, dob, city) => {
    const normalizedUserId = normalizeUserId(userId);
    const normalizedRole = normalizeRole(role);
    const normalizedFullName = normalizeFullName(full_name);
    const normalizedPhone = normalizePhone(phone);
    const normalizedGender = normalizeGender(gender);
    const normalizedDob = normalizeDob(dob);
    const normalizedCity = normalizeHometown(city);

    const existingUser = await profileRepository.getProfileById(normalizedUserId);
    if (!existingUser) {
        throw new AdminError('Nguoi dung khong ton tai.', 404);
    }

    const roleId = await profileRepository.getRoleIdByName(normalizedRole);
    if (!roleId) {
        throw new AdminError('Vai tro khong hop le.', 400);
    }

    try {
        await profileRepository.adminUpdateUser(
            normalizedUserId,
            {
                full_name: normalizedFullName,
                phone: normalizedPhone,
                gender: normalizedGender,
                dob: normalizedDob,
                city: normalizedCity,
            },
            roleId,
        );
    } catch (err) {
        if (err.code === '23505') {
            throw new AdminError('So dien thoai da ton tai.', 409);
        }
        throw err;
    }
};

const toggleUserStatus = async (userId, is_active, currentUserId) => {
    const normalizedUserId = normalizeUserId(userId);

    if (is_active === undefined) {
        throw new AdminError('Thieu is_active.', 400);
    }

    if (Number(normalizedUserId) === Number(currentUserId)) {
        throw new AdminError('Khong the tu khoa tai khoan cua chinh minh.', 400);
    }

    await profileRepository.adminToggleUserStatus(normalizedUserId, is_active);
};

module.exports = {
    getAllUsers,
    createUser,
    updateUser,
    toggleUserStatus,
    AdminError,
};
