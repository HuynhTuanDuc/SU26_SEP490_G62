/**
 * Định dạng SỐ cho các chuỗi backend sinh ra — thông báo đẩy, lý do từ chối, mô tả bút
 * toán. Giữ ĐÚNG cùng quy tắc với web (frontend/src/utils/formatNumber.js) và app
 * (mobile/src/lib/format-number.ts). Ba file phải đi cùng nhau.
 *
 * Vì sao backend cũng cần: phần lớn con số tài xế đọc được là do backend ghép chuỗi —
 * "Chi phí 1.500.000đ đã được duyệt", "lệch 4.800.000đ". Nếu backend định dạng một kiểu
 * còn màn hình một kiểu thì cùng một khoản tiền hiện ra hai dạng trong cùng một màn.
 *
 * Trước file này backend có bốn bản fmtVND gần giống nhau nằm rải rác, trong đó vài bản
 * viết Number(n) không chắn — dữ liệu thiếu ra thẳng chuỗi "NaNđ" gửi tới người dùng.
 */

const CURRENCY_SUFFIX = 'đ';
const EMPTY = '—';

const NF = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
const NF1 = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Chuỗi rỗng bị loại riêng: Number('') === 0, không chặn thì ô trống thành "0đ". */
const isNum = (v) => {
    if (v === null || v === undefined) return false;
    if (typeof v === 'string' && v.trim() === '') return false;
    return Number.isFinite(Number(v));
};

/** Số nguyên có phân cách hàng nghìn: 1.234.567. */
const num = (v, empty = EMPTY) => (isNum(v) ? NF.format(Number(v)) : empty);

/**
 * Tiền đầy đủ: 1.500.000đ.
 *
 * Giá trị rỗng ra "—" chứ không ra "0đ": một thông báo viết "Chi phí 0đ đã được duyệt"
 * vừa vô nghĩa vừa làm người nhận tưởng khoản của mình bị về không.
 */
const money = (v, empty = EMPTY) =>
    (isNum(v) ? NF.format(Math.round(Number(v))) + CURRENCY_SUFFIX : empty);

/** Tiền rút gọn: 1,5 tỷ · 1,5 tr · 1,5k · 900đ. Hiếm dùng ở backend, có để đồng bộ. */
const moneyShort = (v, empty = EMPTY) => {
    if (!isNum(v)) return empty;
    const n = Number(v);
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    const fmt = (x) => (Number.isInteger(x) ? NF.format(x) : NF1.format(x));

    if (abs >= 1_000_000_000) return `${sign}${fmt(abs / 1_000_000_000)} tỷ`;
    if (abs >= 1_000_000) return `${sign}${fmt(abs / 1_000_000)} tr`;
    if (abs >= 1_000) return `${sign}${fmt(abs / 1_000)}k`;
    return money(n, empty);
};

/** Tiền có dấu — dùng ở chỗ chiều tăng/giảm là thông tin chính. */
const moneySigned = (v, empty = EMPTY) => {
    if (!isNum(v)) return empty;
    const n = Number(v);
    return (n > 0 ? '+' : '') + money(n);
};

/** Phần trăm: 12,5% — dấu phẩy thập phân theo cách viết tiếng Việt. */
const percent = (v, digits = 1, empty = EMPTY) => {
    if (!isNum(v)) return empty;
    return `${Number(v).toLocaleString('vi-VN', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    })}%`;
};

module.exports = { CURRENCY_SUFFIX, EMPTY, isNum, num, money, moneyShort, moneySigned, percent };
