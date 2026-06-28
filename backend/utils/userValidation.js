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

const normalizePositiveInteger = (value, { fieldLabel = 'ID nguoi dung', errorFactory } = {}) => {
    const parsedValue = Number.parseInt(value, 10);
    if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
        fail(`${fieldLabel} khong hop le.`, 400, errorFactory);
    }
    return parsedValue;
};

const normalizeRequiredText = (value, { fieldLabel = 'Gia tri', errorFactory } = {}) => {
    if (typeof value !== 'string') {
        fail(`${fieldLabel} khong hop le.`, 400, errorFactory);
    }

    const normalizedValue = value.trim().replace(/\s+/g, ' ');
    if (!normalizedValue) {
        fail(`${fieldLabel} khong duoc de trong.`, 400, errorFactory);
    }

    return normalizedValue;
};

const normalizeOptionalText = (value, { fieldLabel = 'Gia tri', errorFactory } = {}) => {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string') {
        fail(`${fieldLabel} khong hop le.`, 400, errorFactory);
    }

    const normalizedValue = value.trim().replace(/\s+/g, ' ');
    return normalizedValue || null;
};

const normalizePhone = (value, { errorFactory } = {}) => {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string') {
        fail('So dien thoai khong hop le.', 400, errorFactory);
    }

    const normalizedPhone = value.trim().replace(/\s+/g, '');
    if (!normalizedPhone) return null;
    if (!/^0\d{9,10}$/.test(normalizedPhone)) {
        fail('So dien thoai khong hop le.', 400, errorFactory);
    }

    return normalizedPhone;
};

const normalizeGender = (value, { errorFactory, includeHint = false } = {}) => {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string') {
        fail('Gioi tinh khong hop le.', 400, errorFactory);
    }

    const normalizedGender = value.trim().toLowerCase();
    if (!GENDER_VALUES.has(normalizedGender)) {
        const message = includeHint
            ? 'Gioi tinh khong hop le (male / female / other)'
            : 'Gioi tinh khong hop le.';
        fail(message, 400, errorFactory);
    }

    return normalizedGender;
};

const normalizeDob = (value, { errorFactory } = {}) => {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string') {
        fail('Ngay sinh khong hop le.', 400, errorFactory);
    }

    const normalizedDob = value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDob)) {
        fail('Ngay sinh khong hop le.', 400, errorFactory);
    }

    const parsedDate = new Date(`${normalizedDob}T00:00:00.000Z`);
    if (Number.isNaN(parsedDate.getTime())) {
        fail('Ngay sinh khong hop le.', 400, errorFactory);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (parsedDate > today) {
        fail('Ngay sinh khong the trong tuong lai.', 400, errorFactory);
    }

    return normalizedDob;
};

const normalizeRole = (value, { errorFactory } = {}) => {
    return normalizeRequiredText(value, { fieldLabel: 'Vai tro', errorFactory }).toLowerCase();
};

const normalizeEmail = (value, { errorFactory } = {}) => {
    if (typeof value !== 'string') {
        fail('Email khong hop le.', 400, errorFactory);
    }

    const normalizedEmail = value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        fail('Email khong hop le.', 400, errorFactory);
    }

    return normalizedEmail;
};

const normalizeNationalId = (value, { errorFactory } = {}) => {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string') {
        fail('So giay to khong hop le.', 400, errorFactory);
    }

    const normalizedValue = value.trim().replace(/\s+/g, '');
    if (!/^[0-9A-Za-z-]{8,20}$/.test(normalizedValue)) {
        fail('So giay to khong hop le.', 400, errorFactory);
    }

    return normalizedValue;
};

const assertBoolean = (value, { fieldLabel = 'Gia tri', errorFactory } = {}) => {
    if (typeof value !== 'boolean') {
        fail(`${fieldLabel} khong hop le.`, 400, errorFactory);
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
