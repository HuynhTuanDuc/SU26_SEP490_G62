import { useRef, useState } from "react";
import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button, Chip, Spinner,
} from "@heroui/react";
import { RiFileExcel2Line, RiUploadCloud2Line, RiCheckboxCircleLine, RiErrorWarningLine, RiDownloadLine } from "react-icons/ri";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { accountantService } from "../services/accountant.service";
import { MoneyText } from "../components/shared/MoneyText";
import { RouteStops } from "../components/shared/RouteStops";

// ─── Quy ước template "Template Import Don Ngoai.xlsx" ────────────────────────
// 1 dòng = 1 chuyến đã hoàn thành. Cột nhận diện theo TÊN HEADER (bỏ dấu (*)).

const PAYMENT_MAP = {
  "ck cong ty":             { payment_type: "bank_transfer", driver_payment_state: "company_received" },
  "tien mat - tai da nop":  { payment_type: "cash",          driver_payment_state: "driver_paid" },
  "tien mat - tai dang giu":{ payment_type: "cash",          driver_payment_state: "driver_holding" },
  "khach no":               { payment_type: "client_credit", driver_payment_state: "company_received" },
};

const stripVN = (s) => String(s ?? "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/đ/g, "d").replace(/Đ/g, "D")
  .toLowerCase().trim();

// Header template → key nội bộ (so khớp sau khi bỏ dấu + bỏ "(*)")
const HEADER_KEYS = [
  ["ngay chay",            "date"],
  ["bien so xe",           "plate"],
  ["ten tai xe",           "driver"],
  ["ten khach hang",       "customer_name"],
  ["sdt khach hang",       "customer_phone"],
  ["diem lay hang",        "pickup"],
  ["diem giao hang",       "delivery"],
  ["quang duong",          "distance"],
  ["so luot",              "runs"],
  ["ten hang",             "cargo_name"],
  ["cuoc xe",              "cargo_fee"],
  ["phi cau duong",        "toll"],
  ["phi do xe",            "parking"],
  ["xang dau",             "fuel"],
  ["sua xe",               "repair"],
  ["thanh toan",           "payment"],
  ["tien tai dang giu",    "holding"],
  ["ghi chu",              "notes"],
];

// ─── Sinh & tải template mẫu ngay trên trình duyệt ────────────────────────────
const TEMPLATE_HEADERS = [
  "Ngày chạy (*)", "Biển số xe (*)", "Tên tài xế (*)", "Tên khách hàng", "SĐT khách hàng",
  "Điểm lấy hàng (*)", "Điểm giao hàng (*)", "Quãng đường (km)", "Số lượt (tăng bo)", "Tên hàng",
  "Cước xe (đ) (*)", "Phí cầu đường/vé (đ)", "Phí đỗ xe/bãi (đ)", "Xăng dầu (đ)", "Sửa xe (đ)",
  "Thanh toán (*)", "Tiền tài đang giữ (đ)", "Ghi chú",
];

const TEMPLATE_EXAMPLES = [
  ["02/05/2026", "29E-080.32", "Tân", "Cty Hưng Dũng", "0912345678",
    "Hưng Yên", "Hoàng Cầu", 35, 1, "Đồ chuyển nhà", 1000000, 30000, "", "", "",
    "CK công ty", "", ""],
  ["03/05/2026", "29E-080.32", "Tân", "", "",
    "Xuân Đỉnh", "Tây Hồ", "", 1, "", 500000, "", "", "", "",
    "Tiền mặt - tài đang giữ", "", "Khách lẻ"],
  ["05/05/2026", "29E-080.32", "Tân", "An Trần", "0987654321",
    "Hoàng Đạt", "Nam Trung Yên", 27, 1, "", 750000, 30000, "", 1450075, "",
    "Khách nợ", "", ""],
  ["08/05/2026", "29E-080.32", "Tân", "", "",
    "Kho A", "Kho B", 12, 5, "Tăng bo x5c", 1500000, "", "", 900133, "",
    "CK công ty", "", "Hệ thống tách thành 5 chuyến, cước chia đều"],
  ["09/05/2026", "29E-080.32", "Tân", "Ngọc Hà", "0905111222",
    "Ngọc Hà", "Bắc Giang", 43, 1, "", 1000000, "", "", "", "",
    "Tiền mặt - tài đang giữ", 900000, "Tài đã nộp trước 100k"],
];

const PAYMENT_OPTIONS = ["CK công ty", "Tiền mặt - tài đã nộp", "Tiền mặt - tài đang giữ", "Khách nợ"];
const REQUIRED_COLS = new Set([
  "Ngày chạy (*)", "Biển số xe (*)", "Tên tài xế (*)", "Điểm lấy hàng (*)",
  "Điểm giao hàng (*)", "Cước xe (đ) (*)", "Thanh toán (*)",
]);
const MONEY_COLS = new Set([
  "Cước xe (đ) (*)", "Phí cầu đường/vé (đ)", "Phí đỗ xe/bãi (đ)", "Xăng dầu (đ)", "Sửa xe (đ)", "Tiền tài đang giữ (đ)",
]);

const BRAND_BLUE = "FF2563EB";
const HEADER_TEXT = "FFFFFFFF";
const REQUIRED_FILL = "FFFEF3C7";
const ZEBRA_FILL = "FFF8FAFC";
const BORDER_COLOR = "FFE2E8F0";

const thinBorder = { style: "thin", color: { argb: BORDER_COLOR } };

const downloadTemplate = async () => {
  const wb = new ExcelJS.Workbook();
  wb.creator = "LogisCount";
  wb.created = new Date();

  // ─── Sheet 1: DON_HANG ───────────────────────────────────────────────────
  const ws = wb.addWorksheet("DON_HANG", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  ws.columns = TEMPLATE_HEADERS.map((h) => ({
    header: h,
    key: h,
    width: Math.max(h.length + 2, 16),
  }));

  const headerRow = ws.getRow(1);
  headerRow.height = 26;
  headerRow.eachCell((cell, colNumber) => {
    const h = TEMPLATE_HEADERS[colNumber - 1];
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: REQUIRED_COLS.has(h) ? "FFF59E0B" : BRAND_BLUE } };
    cell.font = { bold: true, color: { argb: HEADER_TEXT }, size: 11 };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { top: thinBorder, left: thinBorder, right: thinBorder, bottom: thinBorder };
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: TEMPLATE_HEADERS.length } };

  TEMPLATE_EXAMPLES.forEach((rowValues, i) => {
    const row = ws.addRow(rowValues);
    row.eachCell((cell, colNumber) => {
      const h = TEMPLATE_HEADERS[colNumber - 1];
      cell.border = { top: thinBorder, left: thinBorder, right: thinBorder, bottom: thinBorder };
      cell.alignment = { vertical: "middle", horizontal: MONEY_COLS.has(h) ? "right" : "left" };
      if (MONEY_COLS.has(h) && typeof cell.value === "number") cell.numFmt = "#,##0";
      if (i % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA_FILL } };
    });
  });

  // Dropdown chọn sẵn cho cột "Thanh toán (*)" — áp dụng cho 500 dòng đầu để chừa chỗ nhập thêm
  const paymentColIndex = TEMPLATE_HEADERS.indexOf("Thanh toán (*)") + 1;
  for (let r = 2; r <= 500; r += 1) {
    ws.getCell(r, paymentColIndex).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`"${PAYMENT_OPTIONS.join(",")}"`],
      showErrorMessage: true,
      errorTitle: "Giá trị không hợp lệ",
      error: `Chỉ chọn 1 trong: ${PAYMENT_OPTIONS.join(" / ")}`,
    };
  }

  // ─── Sheet 2: HUONG_DAN ──────────────────────────────────────────────────
  const wsGuide = wb.addWorksheet("HUONG_DAN", { views: [{ showGridLines: false }] });
  wsGuide.columns = [{ width: 32 }, { width: 78 }];

  const titleRow = wsGuide.addRow(["HƯỚNG DẪN NHẬP LIỆU — TEMPLATE IMPORT ĐƠN NGOÀI"]);
  wsGuide.mergeCells(`A${titleRow.number}:B${titleRow.number}`);
  titleRow.height = 28;
  titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: HEADER_TEXT } };
  titleRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_BLUE } };
  titleRow.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  wsGuide.addRow([]);

  const addNote = (text) => {
    const row = wsGuide.addRow([text]);
    wsGuide.mergeCells(`A${row.number}:B${row.number}`);
    row.getCell(1).font = { size: 10.5 };
    row.getCell(1).alignment = { wrapText: true, vertical: "top" };
  };
  addNote("• Mỗi dòng = 1 chuyến đã chạy xong. Cột có nền vàng ở sheet DON_HANG là BẮT BUỘC — thiếu sẽ bị từ chối.");
  addNote("• Số tiền nhập SỐ THUẦN (vd 1000000, không chấm/phẩy). Ngày dạng dd/mm/yyyy — định dạng ô để General hoặc Date đều được.");
  addNote("• Nhiều điểm lấy/điểm trả trong 1 chuyến: gõ nhiều dòng trong CÙNG 1 ô (Alt+Enter) hoặc phân cách bằng dấu \"|\", vd: Kho A|Kho B.");
  addNote("• KHÔNG nhập chấm công / ngày nghỉ / ứng lương / bảo dưỡng vào file này — dùng chức năng riêng.");
  addNote("• Biển số xe và Tên tài xế PHẢI khớp đúng với xe/tài khoản đã có sẵn trong hệ thống — hệ thống KHÔNG tự tạo xe hoặc tài khoản tài xế mới nữa. Nếu chưa có, nhờ Manager thêm xe/tạo tài khoản tài xế trước khi import (dòng không khớp sẽ báo lỗi và không được import).");

  wsGuide.addRow([]);
  const sectionRow = wsGuide.addRow(["Cột \"Thanh toán\" — chọn từ dropdown (đã cấu hình sẵn trong sheet DON_HANG):"]);
  wsGuide.mergeCells(`A${sectionRow.number}:B${sectionRow.number}`);
  sectionRow.getCell(1).font = { bold: true, size: 11 };

  const tableHeaderRow = wsGuide.addRow(["Giá trị", "Ý nghĩa"]);
  tableHeaderRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: HEADER_TEXT } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_BLUE } };
    cell.border = { top: thinBorder, left: thinBorder, right: thinBorder, bottom: thinBorder };
  });

  const paymentGuideRows = [
    ["CK công ty", "khách đã chuyển khoản/trả thẳng công ty → không phát sinh nợ"],
    ["Tiền mặt - tài đã nộp", "khách đưa tiền mặt cho tài, tài ĐÃ nộp về → nợ tài xế đã tất toán"],
    ["Tiền mặt - tài đang giữ", "tài ĐANG giữ tiền của khách → ghi NỢ TÀI XẾ"],
    ["Khách nợ", "khách CHƯA thanh toán → ghi NỢ KHÁCH HÀNG (bắt buộc có SĐT khách)"],
  ];
  paymentGuideRows.forEach(([val, meaning], i) => {
    const row = wsGuide.addRow([val, meaning]);
    row.eachCell((cell) => {
      cell.border = { top: thinBorder, left: thinBorder, right: thinBorder, bottom: thinBorder };
      cell.alignment = { wrapText: true, vertical: "top" };
      if (i % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA_FILL } };
    });
    row.getCell(1).font = { bold: true };
  });

  wsGuide.addRow([]);
  addNote("SĐT khách: hệ thống nhận diện khách cũ/mới và gom công nợ theo SĐT — khách quen bắt buộc điền.");
  addNote("Số lượt (tăng bo): chuyến chạy N lượt cùng tuyến điền N — hệ thống tách N chuyến, cước chia đều.");
  addNote("Tiền tài đang giữ: chỉ điền khi KHÁC (cước + phí khách chịu) — vd khách trả thiếu, tài nộp một phần.");
  addNote("Phí cầu đường/đỗ xe: KHÁCH chịu (cộng vào tiền khách phải trả). Xăng dầu/Sửa xe: CÔNG TY chịu.");

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "Template Import Don Ngoai.xlsx";
  a.click();
  URL.revokeObjectURL(url);
};

const parseMoney = (v) => {
  const digits = String(v ?? "").replace(/[^\d]/g, "");
  return digits ? Number(digits) : 0;
};

const parseKm = (v) => {
  const s = String(v ?? "").replace(",", ".").replace(/[^\d.]/g, "");
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
};

// Đọc trực tiếp cell gốc (không qua sheet_to_json) để tránh SheetJS tự format lại
// text của ô kiểu "Date" theo bảng định dạng dựng sẵn (thiên về kiểu Mỹ m/d/yy),
// khiến chuỗi hiển thị khác với dd/mm/yyyy dù Excel vẫn hiện đúng dd/mm/yyyy.
const parseDateCell = (cell) => {
  if (!cell) return null;

  if (cell.t === "n" && typeof cell.v === "number") {
    const d = XLSX.SSF.parse_date_code(cell.v);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }

  if (cell.v instanceof Date && !Number.isNaN(cell.v.getTime())) {
    return `${cell.v.getUTCFullYear()}-${String(cell.v.getUTCMonth() + 1).padStart(2, "0")}-${String(cell.v.getUTCDate()).padStart(2, "0")}`;
  }

  const s = String(cell.w ?? cell.v ?? "").trim();
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!m) return null;
  let [, d, mo, y] = m;
  if (y.length === 2) y = (Number(y) < 70 ? "20" : "19") + y;
  const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
};

// Tách nhiều điểm lấy/trả trong cùng 1 ô — phân cách bằng "|" hoặc xuống dòng (Alt+Enter)
const splitStops = (v) => String(v ?? "")
  .split(/\r?\n|\|/)
  .map((s) => s.trim())
  .filter(Boolean);

// Parse workbook → { rows: [{rowIndex, order, display}], errors: [string] }
function parseWorkbook(wb) {
  const sheetName = wb.SheetNames.includes("DON_HANG") ? "DON_HANG" : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
  if (raw.length < 2) return { rows: [], errors: ["File không có dữ liệu."] };

  // Map cột theo header
  const headerRow = raw[0].map((h) => stripVN(h).replace(/\(\*\)/g, "").trim());
  const colIndex = {};
  for (const [prefix, key] of HEADER_KEYS) {
    const idx = headerRow.findIndex((h) => h.startsWith(prefix));
    if (idx >= 0) colIndex[key] = idx;
  }
  const missing = ["date", "plate", "driver", "pickup", "delivery", "cargo_fee", "payment"]
    .filter((k) => colIndex[k] === undefined);
  if (missing.length) {
    return { rows: [], errors: [`File thiếu cột bắt buộc — hãy dùng đúng template. Thiếu: ${missing.join(", ")}`] };
  }

  const get = (r, key) => (colIndex[key] !== undefined ? r[colIndex[key]] : "");
  const rows = [];
  const errors = [];

  for (let i = 1; i < raw.length; i += 1) {
    const r = raw[i];
    if (!r || r.every((c) => String(c).trim() === "")) continue;
    const rowNo = i + 1; // số dòng Excel (1-based, gồm header)
    const rowErr = [];

    const dateCellAddr = XLSX.utils.encode_cell({ r: i, c: colIndex.date });
    const dateIso = parseDateCell(ws[dateCellAddr]);
    if (!dateIso) rowErr.push("Ngày chạy sai định dạng (cần dd/mm/yyyy)");

    const plate = String(get(r, "plate")).trim();
    if (!plate) rowErr.push("Thiếu biển số xe");
    const driver = String(get(r, "driver")).trim();
    if (!driver) rowErr.push("Thiếu tên tài xế");

    const pickups = splitStops(get(r, "pickup"));
    const deliveries = splitStops(get(r, "delivery"));
    if (pickups.length === 0) rowErr.push("Thiếu điểm lấy hàng");
    if (deliveries.length === 0) rowErr.push("Thiếu điểm giao hàng");

    const cargoFee = parseMoney(get(r, "cargo_fee"));
    if (cargoFee <= 0) rowErr.push("Cước xe phải lớn hơn 0");

    const paymentRaw = String(get(r, "payment")).trim();
    const payment = PAYMENT_MAP[stripVN(paymentRaw)];
    if (!paymentRaw) rowErr.push('Thiếu cột "Thanh toán" (bắt buộc)');
    else if (!payment) rowErr.push(`Giá trị Thanh toán không hợp lệ: "${paymentRaw}"`);

    const phone = String(get(r, "customer_phone")).replace(/[^\d]/g, "");
    if (phone && !/^0\d{9}$/.test(phone)) rowErr.push("SĐT khách không hợp lệ (10 số, bắt đầu bằng 0)");

    const runs = Math.max(1, Math.round(Number(String(get(r, "runs")).replace(/[^\d]/g, "")) || 1));
    const holdingRaw = String(get(r, "holding")).trim();
    const holding = holdingRaw ? parseMoney(holdingRaw) : null;
    if (runs > 1 && holding != null) {
      rowErr.push('Dòng tăng bo (Số lượt > 1) không dùng được cột "Tiền tài đang giữ" — tách dòng thủ công');
    }

    if (rowErr.length) {
      errors.push(`Dòng ${rowNo}: ${rowErr.join("; ")}`);
      continue;
    }

    const toll = parseMoney(get(r, "toll"));
    const parking = parseMoney(get(r, "parking"));
    const fuel = parseMoney(get(r, "fuel"));
    const repair = parseMoney(get(r, "repair"));
    const distance = parseKm(get(r, "distance"));
    const notes = String(get(r, "notes")).trim() || null;
    const customerName = String(get(r, "customer_name")).trim() || null;

    // Tăng bo N lượt → N chuyến, cước chia đều (chuyến 1 nhận phần dư + toàn bộ chi phí)
    const feePerRun = Math.floor(cargoFee / runs);
    const feeFirst = cargoFee - feePerRun * (runs - 1);

    const shipments = [];
    for (let run = 0; run < runs; run += 1) {
      const isFirst = run === 0;
      const expenses = [];
      if (isFirst) {
        if (toll > 0)    expenses.push({ expense_type: "toll",    amount: toll });
        if (parking > 0) expenses.push({ expense_type: "parking", amount: parking });
        if (fuel > 0)    expenses.push({ expense_type: "fuel",    amount: fuel });
        if (repair > 0)  expenses.push({ expense_type: "repair",  amount: repair });
      }
      shipments.push({
        vehicle_plate: plate,
        driver_name: driver,
        pickup_addresses: pickups,
        delivery_addresses: deliveries,
        cargo_fee: isFirst ? feeFirst : feePerRun,
        cargo_name: String(get(r, "cargo_name")).trim() || null,
        distance_km: isFirst ? distance : null,
        expenses,
        payment_type: payment.payment_type,
        driver_payment_state: payment.driver_payment_state,
        driver_holding_amount: isFirst ? holding : null,
        notes: runs > 1 ? `${notes ? `${notes} | ` : ""}Tăng bo lượt ${run + 1}/${runs}` : notes,
      });
    }

    rows.push({
      rowIndex: rowNo,
      display: {
        date: get(r, "date"), plate, driver,
        customer: customerName || "Khách lẻ",
        pickups, deliveries,
        cargoFee, paymentRaw, runs,
      },
      order: {
        row_index: rowNo,
        customer_name: customerName,
        customer_phone: phone || null,
        order_date: get(r, "date"),
        completed_at: dateIso,
        prepaid_amount: 0,
        notes,
        shipments,
      },
    });
  }

  return { rows, errors };
}

export function ImportExcelModal({ isOpen, onClose, onImported }) {
  const fileRef = useRef(null);
  const [fileName, setFileName] = useState(null);
  const [parsed, setParsed] = useState(null);      // { rows, errors }
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);      // response từ BE
  const [fatalError, setFatalError] = useState(null);

  const reset = () => {
    setFileName(null); setParsed(null); setResult(null); setFatalError(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setResult(null); setFatalError(null);
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      setParsed(parseWorkbook(wb));
    } catch (err) {
      setParsed(null);
      setFatalError(`Không đọc được file: ${err.message}`);
    }
  };

  const handleImport = async () => {
    if (!parsed || parsed.rows.length === 0) return;
    setSubmitting(true);
    setFatalError(null);
    try {
      const res = await accountantService.importOrders(parsed.rows.map((r) => r.order));
      setResult(res);
      if (res.imported_count > 0) onImported?.();
    } catch (err) {
      setFatalError(err.message ?? "Import thất bại");
    } finally {
      setSubmitting(false);
    }
  };

  const canImport = parsed && parsed.rows.length > 0 && parsed.errors.length === 0 && !submitting && !result;

  return (
    <Modal isOpen={isOpen} onClose={() => { reset(); onClose(); }} size="4xl" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader className="flex items-center gap-2">
          <RiFileExcel2Line size={20} className="text-emerald-600" />
          Import đơn ngoài từ Excel
        </ModalHeader>

        <ModalBody className="gap-4">
          <p className="text-xs text-gray-500">
            Dùng file theo mẫu <span className="font-semibold">Template Import Don Ngoai.xlsx</span> —
            mỗi dòng là 1 chuyến đã hoàn thành. Cột Thanh toán bắt buộc; dòng lỗi sẽ bị từ chối và liệt kê bên dưới.
          </p>

          {/* Chọn file + tải template */}
          <div className="flex items-center gap-2 flex-wrap">
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
            <Button
              variant="flat" color="primary"
              startContent={<RiUploadCloud2Line size={16} />}
              onPress={() => fileRef.current?.click()}
            >
              {fileName ?? "Chọn file Excel"}
            </Button>
            <Button
              variant="light" color="success"
              startContent={<RiDownloadLine size={16} />}
              onPress={downloadTemplate}
            >
              Tải template mẫu
            </Button>
          </div>

          {fatalError && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
              {fatalError}
            </div>
          )}

          {/* Lỗi parse theo dòng */}
          {parsed && parsed.errors.length > 0 && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-red-600 mb-1">
                <RiErrorWarningLine size={15} />
                {parsed.errors.length} dòng lỗi — sửa file rồi chọn lại (không dòng nào được import khi còn lỗi)
              </div>
              <ul className="text-xs text-red-500 list-disc pl-5 max-h-40 overflow-y-auto">
                {parsed.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}

          {/* Preview */}
          {parsed && parsed.rows.length > 0 && !result && (
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 text-xs font-semibold text-gray-500">
                Xem trước {parsed.rows.length} chuyến hợp lệ
              </div>
              <div className="max-h-72 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-400 sticky top-0">
                    <tr>
                      <th className="px-3 py-1.5 text-left">Dòng</th>
                      <th className="px-3 py-1.5 text-left">Ngày</th>
                      <th className="px-3 py-1.5 text-left">Xe / Tài xế</th>
                      <th className="px-3 py-1.5 text-left">Khách</th>
                      <th className="px-3 py-1.5 text-left">Hành trình</th>
                      <th className="px-3 py-1.5 text-right">Cước</th>
                      <th className="px-3 py-1.5 text-left">Thanh toán</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.map(({ rowIndex, display }) => (
                      <tr key={rowIndex} className="border-t border-gray-100">
                        <td className="px-3 py-1.5 text-gray-400">{rowIndex}</td>
                        <td className="px-3 py-1.5">{display.date}</td>
                        <td className="px-3 py-1.5">{display.plate} · {display.driver}</td>
                        <td className="px-3 py-1.5">{display.customer}</td>
                        <td className="px-3 py-1.5 max-w-[220px]">
                          <RouteStops pickups={display.pickups} deliveries={display.deliveries} />
                          {display.runs > 1 ? <span className="text-gray-400"> (x{display.runs})</span> : null}
                        </td>
                        <td className="px-3 py-1.5 text-right font-semibold"><MoneyText amount={display.cargoFee} /></td>
                        <td className="px-3 py-1.5">{display.paymentRaw}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Kết quả import */}
          {result && (
            <div className={`rounded-xl border px-4 py-3 ${result.error_count > 0 ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"}`}>
              <div className="flex items-center gap-2 text-sm font-semibold mb-1">
                <RiCheckboxCircleLine size={16} className="text-emerald-600" />
                {result.message}
              </div>
              {result.errors?.length > 0 && (
                <ul className="text-xs text-amber-700 list-disc pl-5 max-h-40 overflow-y-auto">
                  {result.errors.map((e, i) => <li key={i}>{e.error}</li>)}
                </ul>
              )}
            </div>
          )}

          {submitting && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Spinner size="sm" /> Đang import {parsed?.rows.length} chuyến...
            </div>
          )}
        </ModalBody>

        <ModalFooter>
          {result ? (
            <Button color="primary" onPress={() => { reset(); onClose(); }}>Đóng</Button>
          ) : (
            <>
              <Button variant="light" onPress={() => { reset(); onClose(); }} isDisabled={submitting}>Huỷ</Button>
              <Button color="primary" onPress={handleImport} isDisabled={!canImport} isLoading={submitting}>
                Import {parsed?.rows.length ? `${parsed.rows.length} chuyến` : ""}
              </Button>
            </>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
