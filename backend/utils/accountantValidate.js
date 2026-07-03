

const err400 = (msg) => Object.assign(new Error(msg), { status: 400 });

const posInt = (val, label) => {
    const n = Number(val);
    if (!val && val !== 0 || !Number.isInteger(n) || n <= 0)
        throw err400(`${label} không hợp lệ.`);
    return n;
};

const posAmount = (val, label = 'Số tiền') => {
    const n = Number(val);
    if (isNaN(n) || n <= 0)
        throw err400(`${label} phải lớn hơn 0.`);
    return n;
};

const nonNegAmount = (val, label = 'Số tiền') => {
    const n = Number(val ?? 0);
    if (isNaN(n) || n < 0)
        throw err400(`${label} không được âm.`);
    return n;
};

const enumVal = (val, allowed, label) => {
    if (val !== undefined && val !== null && val !== '' && !allowed.includes(val))
        throw err400(`${label} không hợp lệ.`);
    return val || null;
};

const pageParams = (query) => ({
    page:  Math.max(1, parseInt(query.page)  || 1),
    limit: Math.min(100, Math.max(1, parseInt(query.limit) || 20)),
});

const phoneVN = (phone) => /^0\d{8,10}$/.test(phone);

const validMonth = (val, label = 'Tháng') => {
    const n = Number(val);
    if (!Number.isInteger(n) || n < 1 || n > 12) throw err400(`${label} không hợp lệ (1–12).`);
    return n;
};

const validYear = (val, label = 'Năm') => {
    const n = Number(val);
    if (!Number.isInteger(n) || n < 2020 || n > 2100) throw err400(`${label} không hợp lệ.`);
    return n;
};

const sendError = (res, err) => {
    const status = err.status || 500;
    if (status >= 500) {
        console.error('[Accountant]', err);
        return res.status(500).json({ error: 'Có lỗi xảy ra phía máy chủ. Vui lòng thử lại sau.' });
    }
    return res.status(status).json({ error: err.message });
};

module.exports = { posInt, posAmount, nonNegAmount, enumVal, pageParams, phoneVN, validMonth, validYear, sendError, err400 };
