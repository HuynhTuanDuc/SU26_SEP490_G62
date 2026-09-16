// Diễn giải các dòng phiếu lương phụ thuộc NGÀY CÔNG — dùng chung cho bảng lương của Kế
// toán, của Quản lý và phiếu lương PDF, để ba nơi không mỗi nơi tự đặt một nhãn.
//
// `fallback` = { month, year } cho nơi row thiếu payroll_month/payroll_year.

const daysInPeriod = (row, fallback = {}) => {
  const m = Number(row.payroll_month ?? fallback.month);
  const y = Number(row.payroll_year ?? fallback.year);
  return m && y ? new Date(y, m, 0).getDate() : null;
};

// Nửa công làm số công lẻ — hiện "27,5" thay vì "27.5"
const fmtDays = (v) => {
  const n = Number(v);
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
};

// Vào làm giữa kỳ: employed_days < số ngày của tháng. Phiếu tạo trước khi có cột
// employed_days (NULL) coi như đủ tháng — đúng với cách tính lúc phiếu đó được tạo.
export const isPartialMonth = (row, fallback) => {
  const days = daysInPeriod(row, fallback);
  return row.employed_days != null && days != null && Number(row.employed_days) < days;
};

// Hậu tố cho các khoản chia theo ngày làm (phụ cấp ĐT, BHXH) khi vào làm giữa tháng
export const prorationNote = (row, fallback) =>
  isPartialMonth(row, fallback)
    ? ` (theo ${row.employed_days}/${daysInPeriod(row, fallback)} ngày làm)`
    : "";

// absence_penalty = lương cứng − lương theo công:
//   âm    → đi làm dư so với quota 28 công (tháng 29-31 ngày đi đủ) → được TRẢ THÊM
//   dương → thiếu công: vào làm / nghỉ việc giữa tháng (ngày ngoài thời gian làm việc
//           không tính công) và/hoặc nghỉ không lương, vắng không phép
// Trả về số dương + dấu để nơi hiển thị tự định dạng, không hiện "-(-x)" gây hiểu nhầm.
export const attendanceLine = (row, fallback) => {
  const penalty = Number(row.absence_penalty || 0);
  if (penalty < 0) return { label: "Đi làm dư ngày công (>28)", amount: -penalty, sign: "plus" };
  if (isPartialMonth(row, fallback)) {
    const worked = row.working_days ?? row.employed_days;
    return {
      label: `Trừ công — không làm trọn tháng (${fmtDays(worked)}/${daysInPeriod(row, fallback)} ngày công)`,
      amount: penalty,
      sign: "minus",
    };
  }
  return { label: "Nghỉ không lương", amount: penalty, sign: "minus" };
};

// Phụ cấp ĐT lưu ở other_bonus — đã chia theo ngày làm nếu vào làm giữa tháng. Phiếu cũ
// luôn lưu 200.000 ở cột này nên đọc thẳng cột là đúng cho cả hai.
export const phoneAllowanceOf = (row) => Number(row.other_bonus || 0);
