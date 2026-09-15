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

// Nới lỏng định dạng: chấp nhận "YYYY-MM-DD" lẫn "YYYY-MM-DDTHH:mm:ss..." (cột DATE
// Postgres trả nguyên về client rồi client gửi ngược lại không sửa — không nên coi là
// lỗi form). Vẫn chặn ngày sinh trong tương lai.
const normalizeDob = (value, { errorFactory } = {}) => {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string') {
        fail('Ngày sinh không hợp lệ.', 400, errorFactory);
    }

    const trimmed = value.trim();
    if (!trimmed) return null;

    const datePart = /^\d{4}-\d{2}-\d{2}/.test(trimmed) ? trimmed.slice(0, 10) : trimmed;
    const parsedDate = new Date(datePart);
    if (Number.isNaN(parsedDate.getTime())) {
        fail('Ngày sinh không hợp lệ.', 400, errorFactory);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (parsedDate > today) {
        fail('Ngày sinh không thể trong tương lai.', 400, errorFactory);
    }

    return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : parsedDate.toISOString().slice(0, 10);
};

// Ngày vào làm / ngày nghỉ việc quyết định tháng đó được tính bao nhiêu công (ngày ngoài
// khoảng làm việc không tính lương), nên phải là một ngày lịch có thật — new Date(
// '2026-02-30') tự lăn sang 02/03 nên phải so lại từng phần. Cho phép ngày tương lai (tạo
// tài khoản trước ngày nhận việc, tài báo nghỉ trước) nhưng không quá 1 năm: xa hơn thì
// gần như chắc chắn là gõ nhầm năm.
const normalizeEmploymentDate = (value, { fieldLabel, errorFactory } = {}) => {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string') {
        fail(`${fieldLabel} không hợp lệ.`, 400, errorFactory);
    }

    const trimmed = value.trim();
    if (!trimmed) return null;

    const datePart = trimmed.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
        fail(`${fieldLabel} không hợp lệ (định dạng YYYY-MM-DD).`, 400, errorFactory);
    }
    const [y, m, d] = datePart.split('-').map(Number);
    const parsed = new Date(Date.UTC(y, m - 1, d));
    if (parsed.getUTCFullYear() !== y || parsed.getUTCMonth() !== m - 1 || parsed.getUTCDate() !== d || y < 2000) {
        fail(`${fieldLabel} không hợp lệ.`, 400, errorFactory);
    }

    const limit = new Date();
    limit.setFullYear(limit.getFullYear() + 1);
    if (datePart > limit.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })) {
        fail(`${fieldLabel} không được quá 1 năm kể từ hôm nay.`, 400, errorFactory);
    }

    return datePart;
};

const normalizeHireDate = (value, { errorFactory } = {}) =>
    normalizeEmploymentDate(value, { fieldLabel: 'Ngày vào làm', errorFactory });

const normalizeTerminationDate = (value, { errorFactory } = {}) =>
    normalizeEmploymentDate(value, { fieldLabel: 'Ngày nghỉ việc', errorFactory });

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

// Email nhân viên KHÔNG bắt buộc — phần lớn tài xế không có, ép nhập chỉ khiến người
// dùng bịa địa chỉ giả cho qua form. Để trống → null (một cách biểu diễn duy nhất, khớp
// ràng buộc chk_accounts_email_not_blank). CÓ nhập thì vẫn phải đúng định dạng: một địa
// chỉ sai chính tả còn tệ hơn không có, vì mail chào mừng/đặt lại mật khẩu sẽ đi lạc mà
// không ai biết.
const normalizeOptionalEmail = (value, { errorFactory } = {}) => {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string') {
        fail('Email không hợp lệ.', 400, errorFactory);
    }
    if (!value.trim()) return null;

    return normalizeEmail(value, { errorFactory });
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
    normalizeHireDate,
    normalizeTerminationDate,
    normalizeRole,
    normalizeEmail,
    normalizeOptionalEmail,
    normalizeNationalId,
    assertBoolean,
    isProtectedUserRole,
};
