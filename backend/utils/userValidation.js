const GENDER_VALUES = new Set(['male', 'female', 'other']);
const PROTECTED_USER_ROLES = new Set(['manager', 'admin']);

const defaultErrorFactory = (message, status = 400) => {
    const error = new Error(message);
    error.status = status;
    return error;
};

const resolveErrorFactory = (errorFactory) => errorFactory || defaultErrorFactory;

const fail = (message, status = 400, errorFactory) => {
    throw resolveErrorFactory(errorFactory)(message, status);
};

const normalizePositiveInteger = (value, { fieldLabel = 'ID người dùng', errorFactory } = {}) => {
    const parsedValue = Number.parseInt(value, 10);
    if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
        fail(`${fieldLabel} không hợp lệ.`, 400, errorFactory);
    }
    return parsedValue;
};

const normalizeRequiredText = (value, { fieldLabel = 'Giá trị', errorFactory } = {}) => {
    if (typeof value !== 'string') {
        fail(`${fieldLabel} không hợp lệ.`, 400, errorFactory);
    }

    const normalizedValue = value.trim().replace(/\s+/g, ' ');
    if (!normalizedValue) {
        fail(`${fieldLabel} không được để trống.`, 400, errorFactory);
    }

    return normalizedValue;
};

const normalizeOptionalText = (value, { fieldLabel = 'Giá trị', errorFactory } = {}) => {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string') {
        fail(`${fieldLabel} không hợp lệ.`, 400, errorFactory);
    }

    const normalizedValue = value.trim().replace(/\s+/g, ' ');
    return normalizedValue || null;
};

const normalizePhone = (value, { errorFactory } = {}) => {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string') {
        fail('Số điện thoại không hợp lệ.', 400, errorFactory);
    }

    const normalizedPhone = value.trim().replace(/\s+/g, '');
    if (!normalizedPhone) return null;
    if (!/^0\d{9,10}$/.test(normalizedPhone)) {
        fail('Số điện thoại không hợp lệ.', 400, errorFactory);
    }

    return normalizedPhone;
};

const normalizeGender = (value, { errorFactory, includeHint = false } = {}) => {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string') {
        fail('Giới tính không hợp lệ.', 400, errorFactory);
    }

    const normalizedGender = value.trim().toLowerCase();
    if (!GENDER_VALUES.has(normalizedGender)) {
        const message = includeHint
            ? 'Giới tính không hợp lệ (male / female / other)'
            : 'Giới tính không hợp lệ.';
        fail(message, 400, errorFactory);
    }

    return normalizedGender;
};

const normalizeDob = (value, { errorFactory } = {}) => {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string') {
        fail('Ngày sinh không hợp lệ.', 400, errorFactory);
    }

    const normalizedDob = value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDob)) {
        fail('Ngày sinh không hợp lệ.', 400, errorFactory);
    }

    const parsedDate = new Date(`${normalizedDob}T00:00:00.000Z`);
    if (Number.isNaN(parsedDate.getTime())) {
        fail('Ngày sinh không hợp lệ.', 400, errorFactory);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (parsedDate > today) {
        fail('Ngày sinh không thể trong tương lai.', 400, errorFactory);
    }

    return normalizedDob;
};

const normalizeRole = (value, { errorFactory } = {}) => {
    return normalizeRequiredText(value, { fieldLabel: 'Vai trò', errorFactory }).toLowerCase();
};

const normalizeEmail = (value, { errorFactory } = {}) => {
    if (typeof value !== 'string') {
        fail('Email không hợp lệ.', 400, errorFactory);
    }

    const normalizedEmail = value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        fail('Email không hợp lệ.', 400, errorFactory);
    }

    return normalizedEmail;
};

const normalizeNationalId = (value, { errorFactory } = {}) => {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string') {
        fail('Số giấy tờ không hợp lệ.', 400, errorFactory);
    }

    const normalizedValue = value.trim().replace(/\s+/g, '');
    if (!/^[0-9A-Za-z-]{8,20}$/.test(normalizedValue)) {
        fail('Số giấy tờ không hợp lệ.', 400, errorFactory);
    }

    return normalizedValue;
};

const assertBoolean = (value, { fieldLabel = 'Giá trị', errorFactory } = {}) => {
    if (typeof value !== 'boolean') {
        fail(`${fieldLabel} không hợp lệ.`, 400, errorFactory);
    }
    return value;
};

const isProtectedUserRole = (role) => {
    return PROTECTED_USER_ROLES.has(String(role || '').trim().toLowerCase());
};

module.exports = {
    normalizePositiveInteger,
    normalizeRequiredText,
    normalizeOptionalText,
    normalizePhone,
    normalizeGender,
    normalizeDob,
    normalizeRole,
    normalizeEmail,
    normalizeNationalId,
    assertBoolean,
    isProtectedUserRole,
};
