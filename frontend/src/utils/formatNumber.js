/**
 * Định dạng SỐ dùng chung cho toàn bộ giao diện web.
 *
 * Vì sao gom về một chỗ: trước file này cùng một số 1.500.000 hiện ra năm kiểu khác
 * nhau tuỳ màn hình — "1.500.000đ", "1.500.000 đ", "1.500.000 ₫", "1.5 tr", và
 * "1.5M₫" bên mobile. Người dùng xem lương trên web rồi mở app kiểm lại thấy hai con
 * số trông khác nhau thì họ không tin cái nào cả.
 *
 * HỢP ĐỒNG HIỂN THỊ TIỀN (chốt với người dùng, giữ nguyên ở cả ba nền):
 *
 * 1. MỘT DẠNG DUY NHẤT: 1.500.000đ — nhóm hàng nghìn bằng dấu chấm, đuôi "đ" liền sau
 *    số. Không có dạng rút gọn bằng chữ ("1,5 tr", "1,5 tỷ", "15k"), không dùng ký hiệu
 *    ₫, không để số trần không đuôi. Số tiền đọc ở thẻ tổng quan và số đọc trong bảng
 *    chi tiết phải viết giống hệt nhau thì người dùng mới đối chiếu được.
 *
 * 2. KHÔNG CÓ SỐ LIỆU THÌ HIỆN 0đ. Trước đây chỗ này trả "—" để phân biệt "chưa khai"
 *    với "bằng không", nhưng trên thực tế nó đẻ ra nhiều cách viết cho cùng một ô tiền.
 *    Nay mọi ô tiền rỗng đều là 0đ.
 *
 * 3. DẤU THẬP PHÂN LÀ DẤU PHẨY (phần trăm). Trong tiếng Việt dấu chấm phân cách hàng
 *    NGHÌN, nên viết "1.5" cho một phẩy năm là sai ba bậc độ lớn.
 */

/** Ký hiệu tiền: "đ" liền sau số, không có dấu cách. Một chuẩn duy nhất cho cả hệ thống. */
export const CURRENCY_SUFFIX = "đ";

/** Cái hiện ra khi không có số liệu — dùng cho số đếm và phần trăm, KHÔNG dùng cho tiền. */
export const EMPTY = "—";

/** Ô tiền rỗng hiện ra số không, xem hợp đồng hiển thị ở đầu file. */
export const ZERO_MONEY = `0${CURRENCY_SUFFIX}`;

const NF = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

/**
 * Có thật sự là một con số không.
 *
 * Chuỗi rỗng bị loại riêng vì Number("") === 0 — không có chốt này thì phép kiểm sẽ
 * nhận nhầm ô bỏ trống thành số không hợp lệ.
 */
export const isNum = (v) => {
    if (v === null || v === undefined) return false;
    if (typeof v === "string" && v.trim() === "") return false;
    return Number.isFinite(Number(v));
};

/** Số nguyên có phân cách hàng nghìn: 1.234.567. Dùng cho km, số chuyến, số lượng. */
export const num = (v, empty = EMPTY) => (isNum(v) ? NF.format(Number(v)) : empty);

/**
 * Tiền: 1.500.000đ. ĐÂY LÀ DẠNG DUY NHẤT để hiện một khoản tiền trên giao diện.
 *
 * Giá trị rỗng, NaN, Infinity đều ra "0đ" — đặc biệt NaN: trước đây một phép tính hỏng
 * lọt ra màn hình thành chữ "NaN" ngay chỗ đáng lẽ là số tiền.
 */
export const money = (v, empty = ZERO_MONEY) =>
    (isNum(v) ? NF.format(Math.round(Number(v))) + CURRENCY_SUFFIX : empty);

/**
 * Tiền có dấu, dùng ở chỗ chiều tăng/giảm là thông tin chính (chênh lệch, điều chỉnh).
 * Số dương được thêm dấu "+" — không có nó thì người đọc phải tự suy ra chiều.
 */
export const moneySigned = (v, empty = ZERO_MONEY) => {
    if (!isNum(v)) return empty;
    const n = Number(v);
    return (n > 0 ? "+" : "") + money(n);
};

/** Phần trăm: 12,5% — dấu phẩy thập phân theo đúng cách viết tiếng Việt. */
export const percent = (v, { digits = 1, empty = EMPTY } = {}) => {
    if (!isNum(v)) return empty;
    return `${Number(v).toLocaleString("vi-VN", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    })}%`;
};

/** Phần trăm có dấu, dùng cho cột "thay đổi so với kỳ trước". */
export const percentSigned = (v, opts = {}) => {
    if (!isNum(v)) return opts.empty ?? EMPTY;
    return (Number(v) > 0 ? "+" : "") + percent(v, opts);
};

/**
 * Đọc số người dùng gõ vào ô nhập tiền: "1.500.000", "1500000", "1,5" đều nhận.
 *
 * Bỏ mọi dấu chấm (phân cách nghìn) rồi đổi dấu phẩy thành dấu chấm thập phân — đúng
 * quy ước tiếng Việt. Không làm bước này thì parseFloat("1.500.000") ra 1,5.
 */
export const parseMoney = (raw) => {
    if (raw === null || raw === undefined) return null;
    const s = String(raw).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(/,/g, ".");
    if (s === "" || s === "-") return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
};
