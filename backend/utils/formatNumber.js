/**
 * Định dạng SỐ cho các chuỗi backend sinh ra — thông báo đẩy, lý do từ chối, mô tả bút
 * toán. Giữ ĐÚNG cùng quy tắc với web (frontend/src/utils/formatNumber.js) và app
 * (mobile/src/lib/format-number.ts). Ba file phải đi cùng nhau.
 *
 * Vì sao backend cũng cần: phần lớn con số tài xế đọc được là do backend ghép chuỗi —
 * "Chi phí 1.500.000đ đã được duyệt", "lệch 4.800.000đ". Nếu backend định dạng một kiểu
 * còn màn hình một kiểu thì cùng một khoản tiền hiện ra hai dạng trong cùng một màn.
 *
 * HỢP ĐỒNG HIỂN THỊ TIỀN:
 *
 * 1. MỘT DẠNG DUY NHẤT: 1.500.000đ — nhóm hàng nghìn bằng dấu chấm, đuôi "đ" liền sau
 *    số. Không rút gọn bằng chữ ("1,5 tr", "1,5 tỷ", "15k"), không dùng ký hiệu ₫.
 * 2. KHÔNG CÓ SỐ LIỆU THÌ HIỆN 0đ.
 * 3. Dấu thập phân (phần trăm) là DẤU PHẨY theo cách viết tiếng Việt.
 *
 * Trước file này backend có bốn bản fmtVND gần giống nhau nằm rải rác, trong đó vài bản
 * viết Number(n) không chắn — dữ liệu thiếu ra thẳng chuỗi "NaNđ" gửi tới người dùng.
 */

const CURRENCY_SUFFIX = 'đ';

/** Dùng cho số đếm và phần trăm, KHÔNG dùng cho tiền. */
const EMPTY = '—';

/** Ô tiền rỗng hiện ra số không, xem hợp đồng hiển thị ở đầu file. */
const ZERO_MONEY = `0${CURRENCY_SUFFIX}`;

const NF = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });

/** Chuỗi rỗng bị loại riêng: Number('') === 0, không chặn thì ô trống lọt qua phép kiểm. */
const isNum = (v) => {
    if (v === null || v === undefined) return false;
    if (typeof v === 'string' && v.trim() === '') return false;
    return Number.isFinite(Number(v));
};

/** Số nguyên có phân cách hàng nghìn: 1.234.567. */
const num = (v, empty = EMPTY) => (isNum(v) ? NF.format(Number(v)) : empty);

/**
 * Tiền: 1.500.000đ. Dạng duy nhất để viết một khoản tiền trong chuỗi gửi cho người dùng.
 * Rỗng / NaN / Infinity đều ra "0đ" — không để chữ "NaN" lọt vào thông báo.
 */
const money = (v, empty = ZERO_MONEY) =>
    (isNum(v) ? NF.format(Math.round(Number(v))) + CURRENCY_SUFFIX : empty);

/** Tiền có dấu — dùng ở chỗ chiều tăng/giảm là thông tin chính. */
const moneySigned = (v, empty = ZERO_MONEY) => {
    if (!isNum(v)) return empty;
    const n = Number(v);
    return (n > 0 ? '+' : '') + money(n);
};

/** Phần trăm: 12,5% — dấu phẩy thập phân theo cách viết tiếng Việt. */
const percent = (v, { digits = 1, empty = EMPTY } = {}) => {
    if (!isNum(v)) return empty;
    return `${Number(v).toLocaleString('vi-VN', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    })}%`;
};

module.exports = { CURRENCY_SUFFIX, EMPTY, ZERO_MONEY, isNum, num, money, moneySigned, percent };
