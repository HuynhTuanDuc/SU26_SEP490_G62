/**
 * Định dạng SỐ cho app tài xế — giữ ĐÚNG cùng quy tắc với web
 * (frontend/src/utils/formatNumber.js) và backend (backend/utils/formatNumber.js).
 * Ba file phải đi cùng nhau.
 *
 * Vì sao quan trọng: tài xế xem lương trên app rồi mở web kiểm lại. Trước đây app in
 * "1.50M₫", chỗ khác in "1,5 tr", web in "1.500.000đ" cho cùng một con số — trông như
 * ba số khác nhau, và người bị trừ lương sẽ không tin cái nào cả.
 *
 * HỢP ĐỒNG HIỂN THỊ TIỀN:
 *
 * 1. MỘT DẠNG DUY NHẤT: 1.500.000đ — nhóm hàng nghìn bằng dấu chấm, đuôi "đ" liền sau
 *    số. Không rút gọn bằng chữ ("1,5 tr", "1,5 tỷ", "15k"), không dùng ký hiệu ₫,
 *    không để số trần không đuôi.
 * 2. KHÔNG CÓ SỐ LIỆU THÌ HIỆN 0đ — mọi ô tiền rỗng đều là 0đ.
 * 3. Dấu thập phân (phần trăm) là DẤU PHẨY: trong tiếng Việt dấu chấm phân cách hàng
 *    NGHÌN, nên "1.5" đọc ra là một nghìn năm trăm.
 */

export const CURRENCY_SUFFIX = 'đ';

/** Dùng cho số đếm và phần trăm, KHÔNG dùng cho tiền. */
export const EMPTY = '—';

/** Ô tiền rỗng hiện ra số không, xem hợp đồng hiển thị ở đầu file. */
export const ZERO_MONEY = `0${CURRENCY_SUFFIX}`;

const NF = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });

type Num = string | number | null | undefined;

/** Chuỗi rỗng bị loại riêng: Number('') === 0, không chặn thì ô trống lọt qua phép kiểm. */
export const isNum = (v: Num): boolean => {
    if (v === null || v === undefined) return false;
    if (typeof v === 'string' && v.trim() === '') return false;
    return Number.isFinite(Number(v));
};

/** Số nguyên có phân cách hàng nghìn: 1.234.567 — dùng cho km, số chuyến, số lượng. */
export const num = (v: Num, empty = EMPTY): string =>
    (isNum(v) ? NF.format(Number(v)) : empty);

/**
 * Tiền: 1.500.000đ. ĐÂY LÀ DẠNG DUY NHẤT để hiện một khoản tiền trên giao diện.
 * Rỗng / NaN / Infinity đều ra "0đ" — không để chữ "NaN" lọt ra chỗ đáng lẽ là tiền.
 */
export const money = (v: Num, empty = ZERO_MONEY): string =>
    (isNum(v) ? NF.format(Math.round(Number(v))) + CURRENCY_SUFFIX : empty);

/** Tiền có dấu — dùng ở chỗ chiều tăng/giảm mới là thông tin chính. */
export const moneySigned = (v: Num, empty = ZERO_MONEY): string => {
    if (!isNum(v)) return empty;
    const n = Number(v);
    return (n > 0 ? '+' : '') + money(n);
};

/** Phần trăm: 12,5% — dấu phẩy thập phân theo cách viết tiếng Việt. */
export const percent = (v: Num, digits = 1, empty = EMPTY): string => {
    if (!isNum(v)) return empty;
    return `${Number(v).toLocaleString('vi-VN', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    })}%`;
};

/** Đọc số người dùng gõ vào ô nhập tiền: "1.500.000", "1500000", "1,5" đều nhận. */
export const parseMoney = (raw: Num): number | null => {
    if (raw === null || raw === undefined) return null;
    const s = String(raw).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(/,/g, '.');
    if (s === '' || s === '-') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
};
