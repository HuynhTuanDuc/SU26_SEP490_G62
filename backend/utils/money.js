/**
 * Kiểm tra số tiền người dùng nhập, TRƯỚC khi nó chạm tới cơ sở dữ liệu.
 *
 * Vì sao phải có: Postgres coi chuỗi 'NaN' là một giá trị NUMERIC HỢP LỆ. Cộng thêm
 * hai điều nữa thì thành một lỗ hổng hỏng dữ liệu âm thầm:
 *
 *   • NaN > 0  là TRUE  → ràng buộc CHECK (amount > 0) không chặn được
 *   • SUM() gặp một dòng NaN thì trả về NaN cho CẢ CỘT
 *   • WHERE amount > 0 cũng KHÔNG lọc được NaN ra
 *
 * Hệ quả thực tế: một tài xế dán chuỗi "1.500.000đ" từ tin nhắn vào ô số tiền là
 * Number() ra NaN, lọt qua tầng kiểm tra cũ (vì NaN <= 0 là false), xuống DB thành một
 * dòng NaN. Từ đó tổng hoàn ứng của tài xế, tổng chi phí của đơn, và dòng "chi phí vận
 * hành" trên báo cáo kinh doanh đều thành NaN — không có lỗi nào báo ra, không ai biết
 * cho tới lúc nhìn báo cáo thấy chữ NaN.
 *
 * Hàm này nhận đúng những gì người dùng thật gõ ra ("1.500.000", "1500000", 1500000)
 * và từ chối phần còn lại bằng một câu tiếng Việt nói rõ sai ở đâu.
 */

const { money } = require('./formatNumber');

/** NUMERIC(12,2) chứa tối đa 10 chữ số phần nguyên. */
const MAX_MONEY = 9_999_999_999;

/**
 * @returns {{ok: true, value: number} | {ok: false, error: string}}
 */
const parseMoneyInput = (raw, { field = 'Số tiền', min = 0, max = MAX_MONEY, allowZero = false } = {}) => {
    if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) {
        return { ok: false, error: `${field} là bắt buộc` };
    }

    let n;
    if (typeof raw === 'number') {
        n = raw;
    } else {
        const s = String(raw).trim();
        // TỪ CHỐI HẲN DẤU PHẨY. Đây là chỗ dễ ghi sai tiền nhất mà không ai phát hiện:
        // theo quy ước tiếng Việt "50,000" là năm mươi phẩy không, nhưng người gõ nó
        // gần như chắc chắn muốn năm mươi nghìn (thói quen bàn phím tiếng Anh). Đoán
        // theo hướng nào cũng có lúc sai, mà sai ở đây là sai một khoản tiền thật —
        // nên hỏi lại người dùng thay vì đoán.
        if (s.includes(',')) {
            return {
                ok: false,
                error: `${field} không dùng dấu phẩy — nhập 1500000 hoặc 1.500.000 (tiền Việt không có phần lẻ)`,
            };
        }
        // Chấp nhận "1.500.000" (chấm phân cách nghìn) và "1500000".
        if (!/^-?\d{1,3}(\.\d{3})+$|^-?\d+(\.\d+)?$/.test(s)) {
            return { ok: false, error: `${field} không hợp lệ — chỉ nhập số, ví dụ 1500000 hoặc 1.500.000` };
        }
        // Chuỗi dạng "1.500.000" là phân cách nghìn; dạng "1500.5" là phần thập phân.
        const laPhanCachNghin = /^-?\d{1,3}(\.\d{3})+$/.test(s);
        n = Number(laPhanCachNghin ? s.replace(/\./g, '') : s);
    }

    // Chốt chặn quan trọng nhất của cả file: NaN và Infinity đều lọt qua mọi phép so
    // sánh thông thường, phải hỏi thẳng.
    if (!Number.isFinite(n)) {
        return { ok: false, error: `${field} không hợp lệ — chỉ nhập số, ví dụ 1500000 hoặc 1.500.000` };
    }
    // Trường hợp phổ biến nhất (min = 0, không cho phép 0): gộp cả 0 lẫn số âm vào
    // MỘT câu "phải lớn hơn 0". Tách ra thành "không được nhỏ hơn 0đ" cho số âm nghe
    // vòng vo mà không nói thêm được gì — người gõ -50000 cần biết đúng một điều.
    if (min === 0 && !allowZero && n <= 0) {
        return { ok: false, error: `${field} phải lớn hơn 0` };
    }
    if (!allowZero && n === 0) {
        return { ok: false, error: `${field} phải lớn hơn 0` };
    }
    if (n < min) {
        return { ok: false, error: `${field} không được nhỏ hơn ${money(min)}` };
    }
    if (n > max) {
        // Nói rõ trần thay vì "numeric field overflow": lỗi hay gặp nhất ở đây là gõ
        // thừa một số 0, và người dùng chỉ nhận ra khi thấy con số trần bên cạnh.
        return { ok: false, error: `${field} vượt quá mức cho phép (tối đa ${money(max)}) — kiểm tra lại xem có thừa số 0 không` };
    }

    // Làm tròn về ĐỒNG chẵn. Tiền Việt không tiêu tới phần lẻ, và để phần lẻ trôi vào
    // DB thì tổng của nhiều dòng sẽ lệch với tổng người dùng tự cộng trên màn hình.
    return { ok: true, value: Math.round(n) };
};

/**
 * Bản ném lỗi, dùng trong service — thông điệp đi thẳng ra cho người dùng.
 *
 * Gắn CẢ `statusCode` LẪN `status`: codebase đang có hai quy ước song song (controller
 * chi phí/phiếu chi/xe đọc `statusCode`, controller kế toán và quy tắc thưởng đọc
 * `status`). Đặt cả hai ở đây rẻ hơn nhiều so với việc mỗi lần nối thêm một ô tiền lại
 * phải nhớ xem controller đầu kia đọc tên nào — quên một chỗ là lỗi nhập liệu của người
 * dùng hiện ra thành "lỗi máy chủ 500", và họ sẽ đi báo hỏng thay vì sửa lại con số.
 */
const requireMoney = (raw, opts = {}) => {
    const r = parseMoneyInput(raw, opts);
    if (!r.ok) {
        throw Object.assign(new Error(r.error), { statusCode: 400, status: 400, invalidMoney: true });
    }
    return r.value;
};

/**
 * Ô tiền KHÔNG bắt buộc: bỏ trống trả về null, còn đã gõ gì vào thì kiểm như thường.
 *
 * Tách riêng vì phần lớn các ô này trước đây rơi vào `Number(x) || 0`, biến "chưa nhập"
 * và "nhập sai" thành cùng một con số 0 — người dùng gõ sai định dạng vẫn thấy lưu thành
 * công, chỉ khác là số tiền đã bị thay bằng 0.
 */
const optionalMoney = (raw, opts = {}) => {
    if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) return null;
    return requireMoney(raw, opts);
};

module.exports = { MAX_MONEY, parseMoneyInput, requireMoney, optionalMoney };
