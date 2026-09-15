import { money } from "./formatNumber";
import { attendanceLine, phoneAllowanceOf, prorationNote } from "./payrollDisplay";
// Xuất phiếu lương PDF cho từng tài xế.
//
// Cách tiếp cận: dựng một trang HTML tối ưu cho in ấn rồi nạp vào iframe ẩn và gọi
// print() — trình duyệt cho phép "Lưu thành PDF". Ưu điểm so với jsPDF:
//   • Tiếng Việt hiển thị hoàn hảo (font hệ thống, không cần nhúng TTF vài trăm KB)
//   • Chữ trong PDF chọn/copy được (vector), file nhẹ
//   • Không thêm dependency, chạy offline
// Dữ liệu lấy trực tiếp từ row bảng lương (đã có sẵn mọi trường) — không gọi thêm API,
// và các con số Lương gộp / Thực nhận dùng đúng giá trị DB đã chốt, không tự cộng lại.

// Trên phiếu lương, dòng nào không có số liệu nghĩa là bằng 0 (không phụ cấp,
// không thưởng) — nên ở ĐÂY "0đ" mới đúng, khác với các màn hình tra cứu.
const VND = (n) => money(Number(n || 0));

const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const STATUS_LABEL = {
  pending: "Chờ duyệt",
  reviewed: "Manager đã duyệt",
  approved: "Kế toán xác nhận",
  paid: "Đã trả lương",
};

// Ép kiểu số, KHÔNG phải định dạng — đổi tên để không đụng toNum() của formatNumber.
const toNum = (v) => Number(v || 0);

export function exportPayslipToPDF(row, { month, year, companyInfo } = {}) {
  const m = row.payroll_month ?? month;
  const y = row.payroll_year ?? year;

  const company = companyInfo || {};
  const companyName = company.company_name || "CÔNG TY VẬN TẢI";
  const companyMeta = [
    company.hotline ? `Hotline: ${company.hotline}` : null,
    company.bank_name && company.bank_account_number
      ? `${company.bank_name} — ${company.bank_account_number}${company.bank_account_name ? ` (${company.bank_account_name})` : ""}`
      : null,
  ].filter(Boolean);

  // Đi làm ngày lễ = 200% lương (Điều V.1): lương cứng đã trả 100% cho ngày lễ,
  // holiday_bonus là 100% cộng thêm. Suy ngược số ngày từ số tiền vì backend tính
  // đúng holidayBonus = round(lương cứng / 28) × số ngày.
  const holidayBonus = toNum(row.holiday_bonus);
  const dailyWage    = Math.round(toNum(row.base_salary) / 28);
  const holidayDays  = dailyWage > 0 ? Math.round(holidayBonus / dailyWage) : 0;

  // Phụ cấp ĐT, BHXH chia theo ngày làm và dòng trừ/cộng công — nhãn dùng chung với màn
  // hình bảng lương (utils/payrollDisplay)
  const period = { month: m, year: y };
  const attendance = attendanceLine(row, period);

  // Thu nhập — bám sát đúng các dòng hiển thị trên màn hình bảng lương.
  // other_bonus CHÍNH LÀ phụ cấp điện thoại (không phải "thưởng khác") — trước đây in cả
  // hai dòng nên phiếu PDF hiện phụ cấp hai lần.
  const incomeRows = [
    ["Lương cứng", toNum(row.base_salary)],
    ["Thưởng doanh thu", toNum(row.revenue_bonus)],
    [`Phụ cấp điện thoại${prorationNote(row, period)}`, phoneAllowanceOf(row)],
    ["Thưởng KPI", toNum(row.kpi_bonus)],
    ["Thưởng xuất sắc", toNum(row.top_driver_bonus)],
    ...(holidayBonus > 0 ? [[`Đi làm ngày lễ ×2 (${holidayDays} ngày)`, holidayBonus]] : []),
    ["Thưởng & Phúc lợi", toNum(row.overtime_bonus)],
  ];
  if (toNum(row.manual_bonus) > 0) incomeRows.push(["Điều chỉnh (+)", toNum(row.manual_bonus)]);

  // Điều chỉnh & khấu trừ (dấu để hiển thị, không tự tính lại tổng)
  const adjustRows = [
    ["Hoàn chi phí đã ứng", toNum(row.expense_reimbursement), "plus"],
    [`BHXH (10.5%)${prorationNote(row, period)}`, toNum(row.insurance_employee), "minus"],
    [attendance.label, attendance.amount, attendance.sign],
    ["Trừ ứng lương", toNum(row.advance_deduction), "minus"],
    ["Trừ công nợ", toNum(row.driver_debt_deduction), "minus"],
  ];
  if (toNum(row.other_deduction) > 0) adjustRows.push(["Khấu trừ khác", toNum(row.other_deduction), "minus"]);
  if (toNum(row.manual_deduction) > 0) adjustRows.push(["Điều chỉnh (−)", toNum(row.manual_deduction), "minus"]);

  const infoPairs = [
    ["Tài xế", esc(row.driver_name || "—")],
    ["Số điện thoại", esc(row.driver_phone || "—")],
    ["Nhóm xe", esc(row.vehicle_group || "—")],
    ["Biển số xe", esc(row.plate_number || "—")],
    ["Kỳ lương", `Tháng ${m}/${y}`],
    ["Thâm niên", `${toNum(row.months_of_service)} tháng`],
    ["Doanh thu tháng", VND(row.total_revenue)],
    ["Trạng thái", STATUS_LABEL[row.status] || esc(row.status || "—")],
  ];

  const printedAt = new Date().toLocaleString("vi-VN");

  const html = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<title>Phieu luong ${esc(row.driver_name || "")} - T${m}.${y}</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: "Segoe UI", Roboto, Arial, "Helvetica Neue", sans-serif;
    color: #000; font-size: 12.5px; line-height: 1.5; margin: 0;
  }
  .sheet { max-width: 720px; margin: 0 auto; }
  .top { display: flex; justify-content: space-between; align-items: flex-start;
         border-bottom: 2px solid #000; padding-bottom: 14px; margin-bottom: 18px; }
  .company-name { font-size: 16px; font-weight: 800; color: #000; letter-spacing: .3px; }
  .company-meta { font-size: 10.5px; color: #000; margin-top: 3px; }
  .doc-title { text-align: right; }
  .doc-title h1 { font-size: 19px; font-weight: 800; margin: 0; color: #000; text-transform: uppercase; }
  .doc-title .period { font-size: 12px; color: #000; font-weight: 600; margin-top: 2px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; margin-bottom: 20px; }
  .info-item { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dashed #cbd5e1; }
  .info-item .k { color: #000; }
  .info-item .v { font-weight: 600; text-align: right; }
  .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px;
                   color: #000; margin: 4px 0 6px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  td { padding: 6px 4px; border-bottom: 1px solid #e2e8f0; }
  td.amt { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tr.subtotal td { border-top: 2px solid #000; border-bottom: none; font-weight: 700; padding-top: 8px; }
  .minus { color: #000; }
  .plus { color: #000; }
  .net-box { border: 1.5px solid #000; border-radius: 10px;
             display: flex; justify-content: space-between; align-items: center;
             padding: 14px 18px; margin: 6px 0 24px; }
  .net-box .label { font-size: 13px; font-weight: 700; color: #000; text-transform: uppercase; }
  .net-box .value { font-size: 22px; font-weight: 800; color: #000; }
  .signs { display: flex; justify-content: space-between; margin-top: 30px; text-align: center; }
  .signs .col { width: 45%; }
  .signs .role { font-weight: 700; font-size: 12px; }
  .signs .hint { font-size: 10px; color: #000; font-style: italic; }
  .signs .space { height: 58px; }
  .footer { margin-top: 26px; text-align: center; font-size: 9.5px; color: #000;
            border-top: 1px solid #cbd5e1; padding-top: 8px; }
</style>
</head>
<body>
  <div class="sheet">
    <div class="top">
      <div>
        <div class="company-name">${esc(companyName)}</div>
        ${companyMeta.map((t) => `<div class="company-meta">${esc(t)}</div>`).join("")}
      </div>
      <div class="doc-title">
        <h1>Phiếu lương</h1>
        <div class="period">Kỳ lương tháng ${m}/${y}</div>
      </div>
    </div>

    <div class="info-grid">
      ${infoPairs.map(([k, v]) => `<div class="info-item"><span class="k">${esc(k)}</span><span class="v">${v}</span></div>`).join("")}
    </div>

    <div class="section-title">Thu nhập</div>
    <table>
      <tbody>
        ${incomeRows.map(([label, val]) => `<tr><td>${esc(label)}</td><td class="amt">${VND(val)}</td></tr>`).join("")}
        <tr class="subtotal"><td>Lương gộp</td><td class="amt">${VND(row.gross_salary)}</td></tr>
      </tbody>
    </table>

    <div class="section-title">Điều chỉnh &amp; khấu trừ</div>
    <table>
      <tbody>
        ${adjustRows
          .map(([label, val, sign]) => {
            const cls = sign === "minus" ? "minus" : "plus";
            const prefix = sign === "minus" ? "− " : "+ ";
            return `<tr><td>${esc(label)}</td><td class="amt ${cls}">${prefix}${VND(val)}</td></tr>`;
          })
          .join("")}
      </tbody>
    </table>

    <div class="net-box">
      <span class="label">Lương thực nhận</span>
      <span class="value">${VND(row.net_salary)}</span>
    </div>

    <div class="signs">
      <div class="col">
        <div class="role">Người nhận lương</div>
        <div class="hint">(Ký, ghi rõ họ tên)</div>
        <div class="space"></div>
        <div>${esc(row.driver_name || "")}</div>
      </div>
      <div class="col">
        <div class="role">Người lập bảng lương</div>
        <div class="hint">(Ký, ghi rõ họ tên)</div>
        <div class="space"></div>
      </div>
    </div>

    <div class="footer">
      Phiếu lương được lập tự động từ hệ thống ${esc(companyName)} — In lúc ${esc(printedAt)}.
      Con số Lương gộp và Lương thực nhận là giá trị đã chốt trên hệ thống.
    </div>
  </div>
</body>
</html>`;

  // Nạp vào iframe ẩn, in, rồi dọn dẹp.
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.srcdoc = html;

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    setTimeout(() => iframe.remove(), 300);
  };

  iframe.onload = () => {
    const win = iframe.contentWindow;
    try {
      win.focus();
      win.onafterprint = cleanup;
      win.print();
    } catch {
      cleanup();
    }
    // Dự phòng: nếu onafterprint không kích hoạt (người dùng hủy), vẫn dọn sau 60s.
    setTimeout(cleanup, 60000);
  };

  document.body.appendChild(iframe);
}
