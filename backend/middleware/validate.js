const { validationResult } = require('express-validator');

// Chạy sau 1 chuỗi express-validator check(...) — trả 400 sớm với message rõ ràng
// thay vì để giá trị sai kiểu (object, array...) rơi xuống service gây lỗi 500 khó hiểu.
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (errors.isEmpty()) return next();

    const firstErrors = errors.array({ onlyFirstError: true });
    res.status(400).json({ error: firstErrors[0].msg, errors: firstErrors });
};

module.exports = validate;
