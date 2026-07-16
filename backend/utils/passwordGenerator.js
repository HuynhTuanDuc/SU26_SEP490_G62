const crypto = require('crypto');

// Bỏ các ký tự dễ nhầm khi đọc/gõ lại (0/O, 1/l/I)
const CHARSETS = {
    upper: 'ABCDEFGHJKMNPQRSTUVWXYZ',
    lower: 'abcdefghjkmnpqrstuvwxyz',
    digit: '23456789',
    symbol: '!@#$%',
};

const randomChar = (charset) => charset[crypto.randomInt(charset.length)];

// Sinh mật khẩu tạm ngẫu nhiên (không phải mật khẩu cố định '123123' như trước) —
// đảm bảo có đủ chữ hoa/thường/số/ký tự đặc biệt rồi xáo trộn vị trí.
const generateRandomPassword = (length = 10) => {
    const required = [
        randomChar(CHARSETS.upper),
        randomChar(CHARSETS.lower),
        randomChar(CHARSETS.digit),
        randomChar(CHARSETS.symbol),
    ];
    const all = Object.values(CHARSETS).join('');
    const rest = Array.from({ length: length - required.length }, () => randomChar(all));

    const chars = [...required, ...rest];
    for (let i = chars.length - 1; i > 0; i -= 1) {
        const j = crypto.randomInt(i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
};

module.exports = { generateRandomPassword };
