/**
 * Định dạng SỐ cho app tài xế — giữ ĐÚNG cùng quy tắc với web
 * (frontend/src/utils/formatNumber.js). Hai file phải đi đôi với nhau.
 *
 * Vì sao quan trọng: tài xế xem lương trên app rồi mở web kiểm lại. Trước file này app
 * in "1.50M₫" còn web in "1.500.000đ" cho cùng một con số — trông như hai số khác nhau,
 * và người bị trừ lương sẽ không tin cái nào cả.
 *
 * Hai lỗi thật của bản cũ được sửa ở đây:
 *
 * 1. "1.5M₫" dùng dấu CHẤM làm dấu thập phân. Trong tiếng Việt dấu chấm phân cách hàng
 *    NGHÌN, nên "1.5" đọc ra là một nghìn năm trăm. Đúng phải là "1,5 tr".
 *
 * 2. Đơn vị viết bằng chữ cái tiếng Anh (M, K) trong một app hoàn toàn tiếng Việt.
 *    Nay dùng "tỷ / tr / k" như mọi phần mềm Việt khác.
 *
 * Ngoài ra: giá trị rỗng ra "—", KHÔNG ra "0đ". Với tiền, "chưa có số liệu" và "bằng
 * không" là hai chuyện khác hẳn nhau.
 */

export const CURRENCY_SUFFIX = 'đ';
export const EMPTY = '—';

const NF = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
const NF1 = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

type Num = string | number | null | undefined;

/** Chuỗi rỗng bị loại riêng: Number('') === 0, không chặn thì ô trống hiện ra "0đ". */
export const isNum = (v: Num): boolean => {
    if (v === null || v === undefined) return false;
    if (typeof v === 'string' && v.trim() === '') return false;
    return Number.isFinite(Number(v));
};

/** Số nguyên có phân cách hàng nghìn: 1.234.567 — dùng cho km, số chuyến, số lượng. */
export const num = (v: Num, empty = EMPTY): string =>
    (isNum(v) ? NF.format(Number(v)) : empty);

/** Tiền đầy đủ: 1.500.000đ. Dạng mặc định — dùng nó trừ khi chỗ đó quá chật. */
export const money = (v: Num, empty = EMPTY): string =>
    (isNum(v) ? NF.format(Math.round(Number(v))) + CURRENCY_SUFFIX : empty);

/** Tiền rút gọn cho thẻ số liệu chật chỗ: 1,5 tỷ · 1,5 tr · 1,5k · 900đ. */
export const moneyShort = (v: Num, empty = EMPTY): string => {
    if (!isNum(v)) return empty;
    const n = Number(v);
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';

    const fmt = (x: number) => (Number.isInteger(x) ? NF.format(x) : NF1.format(x));

    if (abs >= 1_000_000_000) return `${sign}${fmt(abs / 1_000_000_000)} tỷ`;
    if (abs >= 1_000_000) return `${sign}${fmt(abs / 1_000_000)} tr`;
    // Mốc "k" cũng giữ một chữ số thập phân: làm tròn 1.500 thành "2k" là sai lệch một
    // phần ba, mà đây lại là mốc hay gặp nhất (phí cầu đường, phí đỗ xe).
    if (abs >= 1_000) return `${sign}${fmt(abs / 1_000)}k`;
    return money(n, empty);
};

/** Tiền có dấu — dùng ở chỗ chiều tăng/giảm mới là thông tin chính. */
export const moneySigned = (v: Num, empty = EMPTY): string => {
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
