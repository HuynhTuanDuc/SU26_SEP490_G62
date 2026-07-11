import { useRef, useState } from "react";
import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button, Chip, Spinner,
} from "@heroui/react";
import { RiFileExcel2Line, RiUploadCloud2Line, RiCheckboxCircleLine, RiErrorWarningLine, RiDownloadLine } from "react-icons/ri";
import * as XLSX from "xlsx";
import { accountantService } from "../services/accountant.service";
import { MoneyText } from "../components/shared/MoneyText";

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

const TEMPLATE_GUIDE = [
  ["HƯỚNG DẪN NHẬP LIỆU — TEMPLATE IMPORT ĐƠN NGOÀI (đơn đã hoàn thành)"],
  [""],
  ["- Mỗi dòng = 1 chuyến đã chạy xong. Cột (*) là BẮT BUỘC — thiếu sẽ bị từ chối."],
  ["- Số tiền nhập SỐ THUẦN (vd 1000000). Ngày dạng dd/mm/yyyy."],
  ["- KHÔNG nhập chấm công / ngày nghỉ / ứng lương / bảo dưỡng vào file này — dùng chức năng riêng."],
  [""],
  ["Cột \"Thanh toán\" — chọn đúng 1 trong 4 (copy nguyên văn):"],
  ["CK công ty", "khách đã chuyển khoản/trả thẳng công ty → không phát sinh nợ"],
  ["Tiền mặt - tài đã nộp", "khách đưa tiền mặt cho tài, tài ĐÃ nộp về → nợ tài xế đã tất toán"],
  ["Tiền mặt - tài đang giữ", "tài ĐANG giữ tiền của khách → ghi NỢ TÀI XẾ"],
  ["Khách nợ", "khách CHƯA thanh toán → ghi NỢ KHÁCH HÀNG (bắt buộc có SĐT khách)"],
  [""],
  ["SĐT khách: hệ thống nhận diện khách cũ/mới và gom công nợ theo SĐT — khách quen bắt buộc điền."],
  ["Số lượt (tăng bo): chuyến chạy N lượt cùng tuyến điền N — hệ thống tách N chuyến, cước chia đều."],
  ["Tiền tài đang giữ: chỉ điền khi KHÁC (cước + phí khách chịu) — vd khách trả thiếu, tài nộp một phần."],
  ["Phí cầu đường/đỗ xe: KHÁCH chịu (cộng vào tiền khách phải trả). Xăng dầu/Sửa xe: CÔNG TY chịu."],
];

const downloadTemplate = () => {
  const wb = XLSX.utils.book_new();
  const wsData = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...TEMPLATE_EXAMPLES]);
  wsData["!cols"] = TEMPLATE_HEADERS.map((h) => ({ wch: Math.max(h.length + 2, 14) }));
  XLSX.utils.book_append_sheet(wb, wsData, "DON_HANG");
  const wsGuide = XLSX.utils.aoa_to_sheet(TEMPLATE_GUIDE);
  wsGuide["!cols"] = [{ wch: 30 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, wsGuide, "HUONG_DAN");
  XLSX.writeFile(wb, "Template Import Don Ngoai.xlsx");
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

const parseDate = (v) => {
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
};

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

    const dateIso = parseDate(get(r, "date"));
    if (!dateIso) rowErr.push("Ngày chạy sai định dạng (cần dd/mm/yyyy)");

    const plate = String(get(r, "plate")).trim();
    if (!plate) rowErr.push("Thiếu biển số xe");
    const driver = String(get(r, "driver")).trim();
    if (!driver) rowErr.push("Thiếu tên tài xế");

    const pickup = String(get(r, "pickup")).trim();
    const delivery = String(get(r, "delivery")).trim();
    if (!pickup) rowErr.push("Thiếu điểm lấy hàng");
    if (!delivery) rowErr.push("Thiếu điểm giao hàng");

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
        pickup_addresses: [pickup],
        delivery_address: delivery,
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
        route: `${pickup} → ${delivery}`,
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
                        <td className="px-3 py-1.5 max-w-[220px] truncate">{display.route}{display.runs > 1 ? ` (x${display.runs})` : ""}</td>
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
