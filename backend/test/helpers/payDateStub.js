/**
 * Stub global.Date to a specific instant — dùng để test các ràng buộc theo ngày
 * (ứng lương chỉ ngày 25, chi lương chỉ ngày 10 — Điều III/IV chính sách lương).
 */
function stubDateTo(RealDate, date) {
    global.Date = class extends RealDate {
        constructor(...args) {
            if (args.length === 0) return new RealDate(date);
            super(...args);
        }
        static now() { return date.getTime(); }
    };
}

function restoreDateTo(RealDate) {
    global.Date = RealDate;
}

// Tính 1 ngày hợp lệ để chi lương trong tháng/năm cho trước: đúng ngày 10 nếu là ngày
// làm việc, hoặc ngày làm việc kế tiếp gần nhất nếu ngày 10 rơi vào cuối tuần/ngày lễ
// (khớp logic accountantPayrollRepository._getValidPayrollPayDates — chỉ cần MỘT ngày
// hợp lệ nên chọn nhánh "tiến tới" cho đơn giản, không cần dựng cả 2 hướng).
async function computeValidPayrollPayDate(pool, year, month) {
    const { rows } = await pool.query('SELECT holiday_date::text AS d FROM company_holidays');
    const holidayKeys = new Set(rows.map((r) => r.d));
    const pad2 = (n) => String(n).padStart(2, '0');
    const key = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    const isBusinessDay = (d) => {
        const dow = d.getDay();
        if (dow === 0 || dow === 6) return false;
        return !holidayKeys.has(key(d));
    };
    const date = new Date(year, month - 1, 10, 9, 0, 0);
    while (!isBusinessDay(date)) date.setDate(date.getDate() + 1);
    return date;
}

module.exports = { stubDateTo, restoreDateTo, computeValidPayrollPayDate };
