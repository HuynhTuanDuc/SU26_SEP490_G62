/**
 * Định dạng SỐ dùng chung cho toàn bộ giao diện web.
 *
 * Vì sao gom về một chỗ: trước file này cùng một số 1.500.000 hiện ra năm kiểu khác
 * nhau tuỳ màn hình — "1.500.000đ", "1.500.000 đ", "1.500.000 ₫", "1.5 tr", và
 * "1.5M₫" bên mobile. Người dùng xem lương trên web rồi mở app kiểm lại thấy hai con
 * số trông khác nhau thì họ không tin cái nào cả.
 *
 * Hai lỗi thật (không chỉ là thiếu nhất quán) được sửa ở đây:
 *
 * 1. DẤU THẬP PHÂN. Bản rút gọn cũ in "1.5 tr" — dùng dấu CHẤM. Trong tiếng Việt dấu
 *    chấm là dấu phân cách HÀNG NGHÌN, nên "1.5" đọc ra là một nghìn năm trăm. Đúng
 *    phải là "1,5 tr".
 *
 * 2. GIÁ TRỊ RỖNG. Nhiều chỗ viết Number(n || 0) nên dữ liệu thiếu hiện thành "0đ".
 *    "Chưa có số liệu" và "bằng không" là hai chuyện hoàn toàn khác nhau khi nói về
 *    tiền — cái sau là một khẳng định, và khẳng định sai thì người đọc ra quyết định sai.
 *    Ở đây giá trị rỗng luôn ra "—".
 */

/** Ký hiệu tiền: "đ" liền sau số, không có dấu cách. Một chuẩn duy nhất cho cả hệ thống. */
export const CURRENCY_SUFFIX = "đ";

/** Cái hiện ra khi không có số liệu. KHÔNG BAO GIỜ là "0đ". */
export const EMPTY = "—";

const NF = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const NF1 = new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * Có thật sự là một con số không.
 *
 * Chuỗi rỗng bị loại riêng vì Number("") === 0 — không có chốt này thì một ô nhập bỏ
 * trống sẽ hiện ra "0đ" như thể người dùng đã khai số không.
 */
export const isNum = (v) => {
    if (v === null || v === undefined) return false;
    if (typeof v === "string" && v.trim() === "") return false;
    return Number.isFinite(Number(v));
};

/** Số nguyên có phân cách hàng nghìn: 1.234.567. Dùng cho km, số chuyến, số lượng. */
export const num = (v, empty = EMPTY) => (isNum(v) ? NF.format(Number(v)) : empty);

/** Tiền đầy đủ: 1.500.000đ. Đây là dạng mặc định — dùng nó trừ khi chỗ đó quá chật. */
export const money = (v, empty = EMPTY) =>
    (isNum(v) ? NF.format(Math.round(Number(v))) + CURRENCY_SUFFIX : empty);

/**
 * Tiền rút gọn cho biểu đồ và thẻ số liệu chật chỗ: 1,5 tỷ · 1,5 tr · 15k · 900đ.
 *
 * Bỏ phần thập phân khi nó bằng 0 ("2 tr" chứ không phải "2,0 tr") — số tròn đọc nhanh
 * hơn, và đuôi ",0" chỉ tốn chỗ mà không thêm thông tin gì.
 */
export const moneyShort = (v, empty = EMPTY) => {
    if (!isNum(v)) return empty;
    const n = Number(v);
    const abs = Math.abs(n);
    const sign = n < 0 ? "-" : "";

    const unit = (chia, nhan) => {
        const x = abs / chia;
        // Bỏ ",0" ở số tròn
        const s = Number.isInteger(x) ? NF.format(x) : NF1.format(x);
        return `${sign}${s} ${nhan}`;
    };

    if (abs >= 1_000_000_000) return unit(1_000_000_000, "tỷ");
    if (abs >= 1_000_000) return unit(1_000_000, "tr");
    if (abs >= 1_000) {
        // Mốc "k" cũng giữ một chữ số thập phân: làm tròn 1.500 thành "2k" là sai lệch
        // một phần ba ngay trên màn hình, mà đây lại là mốc hay gặp nhất (phí cầu
        // đường, phí đỗ xe). "1,5k" vừa ngắn vừa không nói dối.
        const x = abs / 1_000;
        const s = Number.isInteger(x) ? NF.format(x) : NF1.format(x);
        return `${sign}${s}k`;
    }
    return money(n, empty);
};

/**
 * Tiền có dấu, dùng ở chỗ chiều tăng/giảm là thông tin chính (chênh lệch, điều chỉnh).
 * Số dương được thêm dấu "+" — không có nó thì người đọc phải tự suy ra chiều.
 */
export const moneySigned = (v, empty = EMPTY) => {
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
