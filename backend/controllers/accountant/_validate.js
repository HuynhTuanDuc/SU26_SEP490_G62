/**
 * Shared validation helpers for accountant controllers.
 * All throw an Error with `.status` set so controllers can forward the right HTTP code.
 */

const err400 = (msg) => Object.assign(new Error(msg), { status: 400 });

/** Parse and assert positive integer. */
const posInt = (val, label) => {
    const n = Number(val);
    if (!val && val !== 0 || !Number.isInteger(n) || n <= 0)
        throw err400(`${label} không hợp lệ.`);
    return n;
};

/** Parse and assert amount > 0. */
const posAmount = (val, label = 'Số tiền') => {
    const n = Number(val);
    if (isNaN(n) || n <= 0)
        throw err400(`${label} phải lớn hơn 0.`);
    return n;
};

/** Parse and assert amount >= 0. */
const nonNegAmount = (val, label = 'Số tiền') => {
    const n = Number(val ?? 0);
    if (isNaN(n) || n < 0)
        throw err400(`${label} không được âm.`);
    return n;
};

/** Assert value is one of allowed list (skips null/undefined). */
const enumVal = (val, allowed, label) => {
    if (val !== undefined && val !== null && val !== '' && !allowed.includes(val))
        throw err400(`${label} không hợp lệ.`);
    return val || null;
};

/** Parse safe pagination params. */
const pageParams = (query) => ({
    page:  Math.max(1, parseInt(query.page)  || 1),
    limit: Math.min(100, Math.max(1, parseInt(query.limit) || 20)),
});

/** Validate Vietnamese phone number. */
const phoneVN = (phone) => /^0\d{8,10}$/.test(phone);

/** Validate month 1-12. */
const validMonth = (val, label = 'Tháng') => {
    const n = Number(val);
    if (!Number.isInteger(n) || n < 1 || n > 12) throw err400(`${label} không hợp lệ (1–12).`);
    return n;
};

/** Validate year >= 2020. */
const validYear = (val, label = 'Năm') => {
    const n = Number(val);
    if (!Number.isInteger(n) || n < 2020 || n > 2100) throw err400(`${label} không hợp lệ.`);
    return n;
};

/**
 * Respond with a user-friendly error.
 * For 500 errors, never expose internal detail to the client.
 */
const sendError = (res, err) => {
    const status = err.status || 500;
    if (status >= 500) {
        console.error('[Accountant]', err);
        return res.status(500).json({ error: 'Có lỗi xảy ra phía máy chủ. Vui lòng thử lại sau.' });
    }
    return res.status(status).json({ error: err.message });
};

module.exports = { posInt, posAmount, nonNegAmount, enumVal, pageParams, phoneVN, validMonth, validYear, sendError, err400 };
