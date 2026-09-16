import { useMemo, useRef, useState } from "react";
import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button, Chip, Spinner,
} from "@heroui/react";
import { RiFileExcel2Line, RiUploadCloud2Line, RiCheckboxCircleLine, RiErrorWarningLine, RiDownloadLine } from "react-icons/ri";
import { accountantService } from "../services/accountant.service";
import { MoneyText } from "../components/shared/MoneyText";
import { RouteStops } from "../components/shared/RouteStops";
import { notify } from "../../../components/shared-ui/Toast";
import { APP_NAME } from "../../../constants/brand";
import {
  PAYMENT_OPTIONS, parseWorkbook,
} from "../utils/parseImportRows";
import { money } from "../../../utils/formatNumber";

// ─── Quy ước template "Template Import Don Ngoai.xlsx" ────────────────────────
// 1 dòng = 1 chuyến đã hoàn thành. Cột nhận diện theo TÊN HEADER (bỏ dấu (*)).


// ─── Sinh & tải template mẫu ngay trên trình duyệt ────────────────────────────
const TEMPLATE_HEADERS = [
  "Ngày chạy (*)", "Biển số xe (*)", "Tên tài xế (*)", "Tên khách hàng", "SĐT khách hàng",
  "Điểm lấy hàng (*)", "Điểm giao hàng (*)", "Quãng đường (km)", "Số lượt (tăng bo)", "Tên hàng",
  "Cước xe 1 lượt (đ) (*)", "Giá chốt 1 lượt (đ)", "Thu hộ (đ)", "Phí cầu đường/vé (đ)", "Phí đỗ xe/bãi (đ)",
  "Xăng dầu (đ)", "Sửa xe (đ)", "Thanh toán (*)", "Tiền tài đang giữ (đ)", "Ghi chú",
];

const DATE_HEADER = TEMPLATE_HEADERS[0];

const TEMPLATE_EXAMPLES = [
  ["02/05/2026", "29E-080.32", "Tân", "Cty Hưng Dũng", "0912345678",
    "Hưng Yên", "Hoàng Cầu", 35, 1, "Đồ chuyển nhà", 1000000, "", "", 30000, "", "", "",
    "CK công ty", "", ""],
  ["03/05/2026", "29E-080.32", "Tân", "", "",
    "Xuân Đỉnh", "Tây Hồ", "", 1, "", 500000, "", "", "", "", "", "",
    "Tiền mặt - tài đang giữ", "", "Khách lẻ"],
  ["05/05/2026", "29E-080.32", "Tân", "An Trần", "0987654321",
    "Hoàng Đạt", "Nam Trung Yên", 27, 1, "", 750000, "", "", 30000, "", 1450075, "",
    "Khách nợ", "", ""],
  ["08/05/2026", "29E-080.32", "Tân", "", "",
    "Kho A", "Kho B", 12, 5, "Tăng bo x5c", 300000, "", "", "", "", 900133, "",
    "CK công ty", "", "Cước 300.000 MỘT LƯỢT × 5 lượt → doanh thu 1.500.000"],
  ["09/05/2026", "29E-080.32", "Tân", "Ngọc Hà", "0905111222",
    "Ngọc Hà", "Bắc Giang", 43, 1, "", 1000000, 1200000, "", "", "", "", "",
    "Tiền mặt - tài đang giữ", 1200000, "Báo 1tr, chốt lại 1tr2 — tài cầm đủ 1tr2"],
  ["10/05/2026", "29E-080.32", "Tân", "Cty Minh Long", "0913222333",
    "Kho Long Biên", "Hải Phòng", 120, 1, "Hàng điện tử", 2000000, "", 15000000, "", "", "", "",
    "Tiền mặt - tài đang giữ", 17000000,
    "Thu hộ 15tr tiền hàng — tài cầm cả cước lẫn thu hộ. Doanh thu vẫn chỉ là 2tr"],
];

const REQUIRED_COLS = new Set([
  "Ngày chạy (*)", "Biển số xe (*)", "Tên tài xế (*)", "Điểm lấy hàng (*)",
  "Điểm giao hàng (*)", "Cước xe 1 lượt (đ) (*)", "Thanh toán (*)",
]);
const MONEY_COLS = new Set([
  "Cước xe 1 lượt (đ) (*)", "Giá chốt 1 lượt (đ)", "Thu hộ (đ)", "Phí cầu đường/vé (đ)", "Phí đỗ xe/bãi (đ)", "Xăng dầu (đ)", "Sửa xe (đ)", "Tiền tài đang giữ (đ)",
]);

const BRAND_BLUE = "FF2563EB";
const HEADER_TEXT = "FFFFFFFF";
const REQUIRED_FILL = "FFFEF3C7";
const ZEBRA_FILL = "FFF8FAFC";
const BORDER_COLOR = "FFE2E8F0";

const thinBorder = { style: "thin", color: { argb: BORDER_COLOR } };

const loadExcelJS = async () => {
  const mod = await import("exceljs");
  return mod.default || mod;
};

const loadXLSX = async () => import("xlsx");

const downloadTemplate = async () => {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = APP_NAME;
  wb.created = new Date();

  // ─── Sheet 1: DON_HANG ───────────────────────────────────────────────────
  const ws = wb.addWorksheet("DON_HANG", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  ws.columns = TEMPLATE_HEADERS.map((h) => ({
    header: h,
    key: h,
    width: Math.max(h.length + 2, 16),
    // Ép cột "Ngày chạy" hiển thị dd/mm/yyyy. Không ép thì Excel dùng định dạng ngày theo
    // máy người nhập — máy để kiểu Mỹ thì gõ "12/8" ra ngày 8 THÁNG 12, mà ô vẫn hiện
    // "12/8/26" nên không ai nhận ra. Chuyện này đã xảy ra thật: doanh thu rơi sang tháng
    // 12, KPI và bảng lương tháng hiện tại không thấy gì mà chẳng có lỗi nào báo.
    ...(h === DATE_HEADER ? { style: { numFmt: "dd/mm/yyyy" } } : {}),
  }));

  const headerRow = ws.getRow(1);
  headerRow.height = 26;
  headerRow.eachCell((cell, colNumber) => {
    const h = TEMPLATE_HEADERS[colNumber - 1];
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: REQUIRED_COLS.has(h) ? "FFF59E0B" : BRAND_BLUE } };
    cell.font = { bold: true, color: { argb: HEADER_TEXT }, size: 11 };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { top: thinBorder, left: thinBorder, right: thinBorder, bottom: thinBorder };
    // Ghi chú dán ngay trên ô tiêu đề cột ngày — hiện lúc rê chuột vào, tức là đúng lúc
    // người dùng đang gõ. Để trong sheet hướng dẫn thôi thì phần lớn không ai mở sang đọc.
    if (h === DATE_HEADER) {
      cell.note = 'Gõ dd/mm/yyyy — 12/8/2026 là NGÀY 12 THÁNG 8.\n\n'
        + 'Cột này đã đặt sẵn định dạng dd/mm/yyyy, đừng đổi và đừng chép sang file cũ:\n'
        + 'nếu ô để định dạng kiểu Mỹ (m/d/yy) thì "12/8" bị hiểu thành NGÀY 8 THÁNG 12,\n'
        + 'mà ô vẫn hiện "12/8" nên nhìn không ra — doanh thu sẽ bị ghi sang tháng khác.\n\n'
        + 'Kiểm tra nhanh: =TEXT(A2;"dd/mm/yyyy")';
    }
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: TEMPLATE_HEADERS.length } };

  // Sheet DON_HANG để TRỐNG (chỉ tiêu đề + dropdown). Dòng ví dụ nằm ở sheet VI_DU_MAU
  // riêng: biển số/tên tài trong ví dụ là số liệu bịa, nếu để lẫn trong sheet dữ liệu thì
  // kế toán tải template về nhập thêm bên dưới rồi import là dính đúng 5 dòng lỗi
  // "xe chưa có trong hệ thống" mỗi lần.

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

  // ─── Sheet 2: VI_DU_MAU (chỉ để xem, không import) ───────────────────────
  const wsExample = wb.addWorksheet("VI_DU_MAU", { views: [{ state: "frozen", ySplit: 2 }] });
  wsExample.columns = TEMPLATE_HEADERS.map((h) => ({ key: h, width: Math.max(h.length + 2, 16) }));

  const exNote = wsExample.addRow(["VÍ DỤ MINH HOẠ — KHÔNG IMPORT SHEET NÀY. Chép cách nhập sang sheet DON_HANG và thay bằng xe/tài xế có thật."]);
  wsExample.mergeCells(`A1:${String.fromCharCode(64 + TEMPLATE_HEADERS.length)}1`);
  exNote.height = 24;
  exNote.getCell(1).font = { bold: true, color: { argb: HEADER_TEXT } };
  exNote.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDC2626" } };
  exNote.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  const exHeader = wsExample.addRow(TEMPLATE_HEADERS);
  exHeader.height = 26;
  exHeader.eachCell((cell, colNumber) => {
    const h = TEMPLATE_HEADERS[colNumber - 1];
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: REQUIRED_COLS.has(h) ? "FFF59E0B" : BRAND_BLUE } };
    cell.font = { bold: true, color: { argb: HEADER_TEXT }, size: 11 };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { top: thinBorder, left: thinBorder, right: thinBorder, bottom: thinBorder };
  });

  TEMPLATE_EXAMPLES.forEach((rowValues, i) => {
    const row = wsExample.addRow(rowValues);
    row.eachCell((cell, colNumber) => {
      const h = TEMPLATE_HEADERS[colNumber - 1];
      cell.border = { top: thinBorder, left: thinBorder, right: thinBorder, bottom: thinBorder };
      cell.alignment = { vertical: "middle", horizontal: MONEY_COLS.has(h) ? "right" : "left" };
      if (MONEY_COLS.has(h) && typeof cell.value === "number") cell.numFmt = "#,##0";
      if (i % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA_FILL } };
    });
  });

  // ─── Sheet 3: HUONG_DAN ──────────────────────────────────────────────────
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
  addNote("• Nhập dữ liệu vào sheet DON_HANG. Sheet VI_DU_MAU chỉ để xem cách nhập — hệ thống KHÔNG đọc sheet đó.");
  addNote("• Mỗi dòng = 1 chuyến đã chạy xong. Cột có nền vàng ở sheet DON_HANG là BẮT BUỘC — thiếu sẽ bị từ chối.");
  addNote("• Số tiền nhập SỐ THUẦN (vd 1000000, không chấm/phẩy) và KHÔNG ÂM.");
  // Cảnh báo này đến từ một sự cố có thật: file để cột ngày ở định dạng kiểu Mỹ (m/d/yy),
  // kế toán gõ "12/8" định là 12 tháng 8, Excel hiểu thành 8 THÁNG 12 và lưu số 46364 —
  // nhưng ô vẫn hiện "12/8/26" nên không ai nhận ra. Doanh thu 11.900.000 rơi sang tháng 12,
  // bảng lương tháng 8 không thấy gì mà chẳng có lỗi nào báo ra.
  addNote("• NGÀY CHẠY — cột này đã được đặt sẵn định dạng dd/mm/yyyy, ĐỪNG đổi. Gõ 12/8/2026 nghĩa là NGÀY 12 THÁNG 8.");
  addNote("   ⚠ Đừng chép dữ liệu vào file template CŨ hoặc file tự tạo: nếu ô ngày đang để định dạng kiểu Mỹ (m/d/yy) thì gõ \"12/8\" Excel sẽ hiểu thành NGÀY 8 THÁNG 12, mà ô vẫn hiện \"12/8\" nên nhìn không ra. Doanh thu sẽ bị ghi sang tháng khác, KPI và bảng lương tháng này không thấy gì.");
  addNote("   ✓ Cách kiểm tra: bấm vào ô ngày rồi gõ ở ô trống bên cạnh =TEXT(A2;\"dd/mm/yyyy\") — ra đúng ngày mình định nhập là được. Hoặc xem lại ngày ở màn XEM TRƯỚC lúc import, hệ thống hiện ngày đã đọc được theo dd/mm/yyyy.");
  addNote("• Nhiều điểm lấy/điểm trả trong 1 chuyến: gõ nhiều dòng trong CÙNG 1 ô (Alt+Enter) hoặc phân cách bằng dấu \"|\", vd: Kho A|Kho B.");
  addNote("• Cột \"Thu hộ\" = tiền HÀNG công ty thu hộ khách khi giao (COD). Đây là tiền CỦA KHÁCH công ty đang giữ, KHÔNG phải doanh thu và KHÔNG cộng vào số khách nợ — hệ thống theo dõi riêng để đối chiếu và trả lại. Cước xe vẫn ghi ở cột \"Cước xe 1 lượt\" như bình thường.");
  addNote("• Chuyến tăng bo nhiều lượt: \"Thu hộ\" là số của CẢ DÒNG (giống các cột chi phí), không nhân theo số lượt. Riêng \"Cước xe 1 lượt\" mới là giá của MỘT lượt.");
  addNote("• KHÔNG nhập chấm công / ngày nghỉ / ứng lương / bảo dưỡng vào file này — dùng chức năng riêng.");
  addNote("• Biển số xe và Tên tài xế PHẢI có sẵn trong hệ thống — hệ thống KHÔNG tự tạo xe hoặc tài khoản tài xế. Nếu chưa có, nhờ Manager thêm xe/tạo tài khoản trước khi import (dòng không khớp sẽ báo lỗi và không được import).");
  addNote("• Biển số không phân biệt hoa/thường và dấu cách/chấm/gạch: 51C-123.45 = 51c 123 45. Tên tài xế phải đúng dấu tiếng Việt (Tiến ≠ Tiền) nhưng không phân biệt hoa/thường.");

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
  addNote("Khách hàng: điền TÊN hoặc SĐT, có một trong hai là đủ. Có SĐT thì hệ thống khớp khách theo SĐT (chắc nhất); không có SĐT thì khớp theo tên.");
  addNote("Trùng tên: nếu tên khách trùng với khách khác đang có, hệ thống sẽ báo và yêu cầu điền SĐT vào ĐÚNG CỘT \"SĐT khách hàng\" — đừng viết số vào sau tên, viết vào tên thì không tra cứu hay nhắc nợ được.");
  addNote("Gõ sai tên (thừa/thiếu dấu, viết tắt khác đi) sẽ tạo ra khách MỚI và tách đôi công nợ. Màn xem trước lúc import có báo dòng nào tạo khách mới — kiểm lại trước khi bấm.");
  addNote("Bỏ trống cả tên lẫn SĐT chỉ dùng cho khách vãng lai trả tiền ngay; dòng \"Khách nợ\" bắt buộc có ít nhất một trong hai.");
  addNote("Giá chốt: giá thật sau khi hai bên chốt lại — giống việc điều phối sửa giá lúc duyệt phiếu thu. Để TRỐNG nếu không đổi giá. Được phép cao hoặc thấp hơn giá báo. Doanh thu, KPI và công nợ đều tính theo GIÁ CHỐT; cột Cước xe giữ lại giá báo ban đầu để đối chiếu.");
  addNote("Cước xe: giá của MỘT lượt. Chạy nhiều lượt thì hệ thống tự nhân lên — vd cước 250.000, Số lượt 2 → doanh thu 500.000.");
  addNote("Số lượt (tăng bo): chuyến chạy N lượt cùng tuyến điền N — hệ thống tách thành N chuyến, mỗi chuyến mang trọn cước 1 lượt. Điền số nguyên (1, 2, 3...), đừng để ô ở định dạng thập phân.");
  addNote("Tiền tài đang giữ: TỔNG số tiền tài đang cầm của cả dòng (không phải của 1 lượt). Chỉ điền khi khác số khách phải trả — vd khách trả thiếu, tài nộp trước một phần. Không có thì để TRỐNG, đừng gõ số 0.");
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


const getBackendImportError = (result) =>
  result?.errors?.[0]?.error || result?.message || "Import thất bại.";

const notifyImportResult = (result) => {
  const imported = Number(result?.imported_count || 0);
  const failed = Number(result?.error_count || 0);
  const duplicated = Number(result?.duplicate_count || 0);

  if (failed > 0 && imported === 0) {
    notify.error(`${result.message || "Import thất bại."} ${getBackendImportError(result)}`);
    return;
  }
  if (failed > 0) {
    notify.warning(`${result.message || "Import chưa hoàn tất."} ${getBackendImportError(result)}`);
    return;
  }
  // Có dòng trùng nhưng vẫn nhập được dòng mới → thành công bình thường. Trùng là hệ quả
  // đương nhiên của việc gộp thêm dòng vào file cũ rồi import lại, không phải sự cố.
  if (imported === 0 && duplicated > 0) {
    notify.info(result?.message || `Không có dòng mới — ${duplicated} dòng đã có sẵn trong hệ thống.`);
    return;
  }
  notify.success(result?.message || "Import Excel thành công.");
};

/** Nhãn nhỏ dưới tên khách ở bảng xem trước: khớp khách cũ / tạo mới / trùng tên */
function CustomerMatchBadge({ info }) {
  if (!info) return null;

  if (info.status === "ambiguous") {
    return (
      <div className="text-[10px] text-red-600 dark:text-red-300 font-medium">
        trùng {info.candidates?.length} khách cùng tên — cần điền SĐT
      </div>
    );
  }
  if (info.status === "new") {
    return (
      <div className="text-[10px] text-amber-600 dark:text-amber-300">
        sẽ tạo khách mới
      </div>
    );
  }
  return (
    <div className="text-[10px] text-emerald-600 dark:text-emerald-300">
      khớp khách có sẵn{info.matchedName ? `: ${info.matchedName}` : ""}
    </div>
  );
}

export function ImportExcelModal({ isOpen, onClose, onImported }) {
  const fileRef = useRef(null);
  const [fileName, setFileName] = useState(null);
  const [parsed, setParsed] = useState(null);      // { rows, errors }
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);      // response từ BE
  const [fatalError, setFatalError] = useState(null);
  // Đối chiếu trước khi import: { [rowIndex]: { customer, already_imported } }.
  // Hỏi BE để kế toán thấy TRƯỚC là dòng nào đã có, dòng nào mới, dòng nào đẻ khách mới.
  // Gộp thêm dòng vào file cũ rồi import lại là luồng bình thường của DN, nên phải nói rõ
  // "chỉ N dòng mới sẽ vào" ngay từ màn xem trước thay vì để tới lúc import xong mới báo.
  const [previewByRow, setPreviewByRow] = useState(null);
  const [previewing, setPreviewing] = useState(false);

  const reset = () => {
    setFileName(null); setParsed(null); setResult(null); setFatalError(null);
    setPreviewByRow(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const runPreview = async (rows) => {
    if (!rows?.length) return;
    setPreviewing(true);
    try {
      const { results } = await accountantService.previewImport(rows.map((r) => r.order));
      setPreviewByRow(Object.fromEntries(results.map((x) => [x.row_index, x])));
    } catch {
      // Không đối chiếu được thì vẫn cho import — đây là thông tin hỗ trợ, không phải
      // điều kiện bắt buộc. Backend vẫn chặn trùng khi import thật.
      setPreviewByRow(null);
    } finally {
      setPreviewing(false);
    }
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setResult(null); setFatalError(null); setPreviewByRow(null);
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const XLSX = await loadXLSX();
      const wb = XLSX.read(buf, { type: "array" });
      const parsedResult = parseWorkbook(wb, XLSX);
      setParsed(parsedResult);
      if (parsedResult.errors.length === 0) void runPreview(parsedResult.rows);
    } catch (err) {
      setParsed(null);
      setFatalError(`Không đọc được file: ${err.message}`);
    }
  };

  // Dòng sẽ thực sự gửi lên: bỏ những dòng đã có trong hệ thống. Trước đây gửi cả file
  // rồi để backend từ chối từng dòng — file 500 dòng gộp thêm 10 dòng là 490 lượt bị
  // từ chối, vừa chậm vừa hiện một bảng cảnh báo dài dằng dặc cho việc hoàn toàn bình thường.
  const newRows = useMemo(() => {
    if (!parsed?.rows?.length) return [];
    if (!previewByRow) return parsed.rows;
    return parsed.rows.filter((r) => !previewByRow[r.rowIndex]?.already_imported);
  }, [parsed, previewByRow]);

  const handleImport = async (allowDuplicates = false) => {
    if (!parsed || parsed.rows.length === 0) return;

    // Ép nhập dòng trùng thì CHỈ gửi lại đúng những dòng bị bỏ qua. Gửi lại cả file sẽ
    // nhân đôi thật những dòng đã vào thành công ở lần trước — đúng cái mà cơ chế này
    // sinh ra để ngăn.
    const rowsToSend = allowDuplicates
      ? (result?.duplicates?.length
        ? parsed.rows.filter((r) => result.duplicates.some((d) => d.row_index === r.rowIndex))
        : parsed.rows.filter((r) => previewByRow?.[r.rowIndex]?.already_imported))
      : newRows;
    if (rowsToSend.length === 0) return;

    setSubmitting(true);
    setFatalError(null);
    try {
      const res = await accountantService.importOrders(
        rowsToSend.map((r) => r.order),
        allowDuplicates,
      );
      setResult(res);
      notifyImportResult(res);
      if (res.imported_count > 0) onImported?.();
    } catch (err) {
      setFatalError(err.message ?? "Import thất bại");
      notify.error(err.message ?? "Import thất bại");
    } finally {
      setSubmitting(false);
    }
  };

  const previewSummary = useMemo(() => {
    if (!previewByRow) return null;
    const v = Object.values(previewByRow);
    return {
      alreadyImported: v.filter((x) => x.already_imported).length,
      newRows: v.filter((x) => !x.already_imported).length,
      newCustomers: v.filter((x) => !x.already_imported && x.customer?.status === "new").length,
      ambiguous: v.filter((x) => !x.already_imported && x.customer?.status === "ambiguous").length,
    };
  }, [previewByRow]);

  const canImport = parsed && parsed.errors.length === 0 && newRows.length > 0 && !submitting && !result && !previewing;

  const resultHasErrors = Number(result?.error_count || 0) > 0;
  const resultFailedAll = resultHasErrors && Number(result?.imported_count || 0) === 0;
  const resultDuplicates = Number(result?.duplicate_count || 0);
  // Dòng trùng KHÔNG phải cảnh báo: gộp file rồi import lại là luồng bình thường, dòng cũ
  // bị bỏ qua đúng như mong đợi. Chỉ tô vàng/đỏ khi có lỗi thật.
  const resultBoxClass = resultFailedAll
    ? "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/25"
    : resultHasErrors
      ? "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/25"
      : "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/25";
  const ResultIcon = resultHasErrors ? RiErrorWarningLine : RiCheckboxCircleLine;

  return (
    <Modal isOpen={isOpen} onClose={() => { reset(); onClose(); }} size="4xl" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader className="flex items-center gap-2">
          <RiFileExcel2Line size={20} className="text-emerald-600 dark:text-emerald-300" />
          Import đơn ngoài từ Excel
        </ModalHeader>

        <ModalBody className="gap-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">
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
            <div className="rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/25 px-4 py-3 text-sm text-red-600 dark:text-red-300">
              {fatalError}
            </div>
          )}

          {/* Lỗi parse theo dòng */}
          {parsed && parsed.errors.length > 0 && (
            <div className="rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/25 px-4 py-3">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-red-600 dark:text-red-300 mb-1">
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
            <div className="rounded-xl border border-gray-200 dark:border-white/10 overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 dark:bg-white/5 text-xs font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-2 flex-wrap">
                <span>Đọc được {parsed.rows.length} chuyến từ file</span>
                {previewing && (
                  <span className="font-normal text-gray-400 dark:text-gray-400">· đang đối chiếu với hệ thống...</span>
                )}
                {previewSummary && (
                  <span className="font-normal">
                    <span className="text-emerald-600 dark:text-emerald-300">· {previewSummary.newRows} dòng mới sẽ nhập </span>
                    {previewSummary.alreadyImported > 0 && (
                      <span className="text-gray-400 dark:text-gray-400">· {previewSummary.alreadyImported} dòng đã có, sẽ bỏ qua </span>
                    )}
                    {previewSummary.newCustomers > 0 && <span className="text-amber-600 dark:text-amber-300">· {previewSummary.newCustomers} khách mới </span>}
                    {previewSummary.ambiguous > 0 && <span className="text-red-600 dark:text-red-300">· {previewSummary.ambiguous} trùng tên khách </span>}
                  </span>
                )}
              </div>
              {previewSummary?.newRows === 0 && (
                <div className="px-4 py-2 bg-gray-50 dark:bg-white/5 border-b border-gray-200 dark:border-white/10 text-xs text-gray-500 dark:text-gray-400">
                  Toàn bộ dòng trong file đã có trong hệ thống — không có gì mới để nhập. Thêm dòng mới vào
                  file rồi chọn lại là được.
                </div>
              )}
              {previewSummary?.ambiguous > 0 && (
                <div className="px-4 py-2 bg-red-50 dark:bg-red-500/10 border-b border-red-200 dark:border-red-500/25 text-xs text-red-700 dark:text-red-300">
                  Có {previewSummary.ambiguous} dòng mà tên khách trùng với nhiều khách đang có. Những dòng đó sẽ bị
                  từ chối khi import — điền SĐT vào cột <b>SĐT khách hàng</b> để chỉ đúng người, các dòng còn lại vẫn vào bình thường.
                </div>
              )}
              {previewSummary?.newCustomers > 0 && (
                <div className="px-4 py-2 bg-amber-50 dark:bg-amber-500/10 border-b border-amber-200 dark:border-amber-500/25 text-xs text-amber-700 dark:text-amber-300">
                  {previewSummary.newCustomers} dòng sẽ tạo khách MỚI. Kiểm tra lại chính tả tên khách — gõ sai một dấu là
                  hệ thống hiểu thành khách khác và công nợ bị tách làm hai hồ sơ.
                </div>
              )}
              <div className="max-h-72 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 dark:bg-white/5 text-gray-400 dark:text-gray-400 sticky top-0">
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
                    {parsed.rows.map(({ rowIndex, display }) => {
                      const info = previewByRow?.[rowIndex];
                      const daCo = Boolean(info?.already_imported);
                      return (
                        // Dòng đã có thì làm mờ đi — nó không tham gia lần import này nữa,
                        // để đậm ngang dòng mới thì kế toán không biết cái nào thật sự vào.
                        <tr key={rowIndex} className={`border-t border-gray-100 dark:border-white/10 ${daCo ? "opacity-45" : ""}`}>
                          <td className="px-3 py-1.5 text-gray-400 dark:text-gray-400">{rowIndex}</td>
                          <td className="px-3 py-1.5">
                            {display.date}
                            {daCo && (
                              <div className="text-[10px] text-gray-400 dark:text-gray-400">đã có — bỏ qua</div>
                            )}
                          </td>
                          <td className="px-3 py-1.5">{display.plate} · {display.driver}</td>
                          <td className="px-3 py-1.5">
                            {display.customer}
                            {!daCo && <CustomerMatchBadge info={info?.customer} />}
                          </td>
                          <td className="px-3 py-1.5 max-w-55">
                            <RouteStops pickups={display.pickups} deliveries={display.deliveries} />
                            {display.runs > 1 ? <span className="text-gray-400 dark:text-gray-400"> (x{display.runs})</span> : null}
                          </td>
                          {/* Dòng tăng bo: hiện TỔNG sẽ ghi nhận kèm phép tính, để kế toán
                            thấy ngay hệ thống hiểu cước là giá 1 lượt chứ không phải tổng */}
                          <td className="px-3 py-1.5 text-right font-semibold tabular-nums">
                            <MoneyText amount={display.totalFee} />
                            {display.settledFee != null && (
                              // Chốt lại giá thì phải thấy rõ báo bao nhiêu → chốt bao nhiêu,
                              // vì đây là con số quyết định doanh thu và KPI của tài xế.
                              <div className={`text-[10px] font-normal ${
                                display.settledFee >= display.cargoFee
                                  ? "text-emerald-600 dark:text-emerald-300"
                                  : "text-amber-600 dark:text-amber-300"}`}>
                                báo {money(display.cargoFee)} → chốt {money(display.settledFee)}
                              </div>
                            )}
                            {display.runs > 1 && (
                              <div className="text-[10px] font-normal text-gray-400 dark:text-gray-400">
                                {money(display.effectiveFee)} × {display.runs} lượt
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-1.5">
                            {display.paymentRaw}
                            {display.holding != null && (
                              <div className="text-[10px] text-gray-400 dark:text-gray-400">
                                tài giữ {money(display.holding)}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Kết quả import */}
          {result && (
            <div className={`rounded-xl border px-4 py-3 ${resultBoxClass}`}>
              <div className="flex items-center gap-2 text-sm font-semibold mb-1">
                <ResultIcon size={16} className={resultHasErrors ? "text-red-600 dark:text-red-300" : "text-emerald-600 dark:text-emerald-300"} />
                {result.message}
              </div>
              {resultFailedAll && (
                <p className="mb-2 text-xs text-red-700 dark:text-red-300">
                  Không có dòng nào được import. Vui lòng sửa các lỗi bên dưới rồi chọn lại file.
                </p>
              )}
              {result.errors?.length > 0 && (
                <ul className={`text-xs list-disc pl-5 max-h-40 overflow-y-auto ${resultFailedAll ? "text-red-700 dark:text-red-300" : "text-amber-700 dark:text-amber-300"}`}>
                  {result.errors.map((e, i) => <li key={i}>{e.error}</li>)}
                </ul>
              )}

              {/* Dòng trùng KHÔNG liệt kê từng cái nữa: file gộp 500 dòng thêm 10 dòng mới
                  sẽ đẻ ra 490 gạch đầu dòng cho một việc hoàn toàn bình thường. Chỉ nói tổng,
                  ai cần chi tiết thì mở ra. */}
              {result.duplicates?.length > 0 && (
                <details className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                  <summary className="cursor-pointer select-none">
                    {result.duplicates.length} dòng đã có sẵn nên được bỏ qua — xem danh sách
                  </summary>
                  <ul className="list-disc pl-5 max-h-32 overflow-y-auto mt-1">
                    {result.duplicates.map((e, i) => <li key={i}>{e.error}</li>)}
                  </ul>
                </details>
              )}
            </div>
          )}

          {submitting && (
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <Spinner size="sm" /> Đang import {resultDuplicates > 0 ? resultDuplicates : newRows.length} chuyến...
            </div>
          )}
        </ModalBody>

        <ModalFooter>
          {result ? (
            <>
              {resultDuplicates > 0 && (
                <Button
                  color="warning" variant="flat"
                  isLoading={submitting}
                  onPress={() => handleImport(true)}
                >
                  Nhập cả dòng trùng
                </Button>
              )}
              <Button color="primary" onPress={() => { reset(); onClose(); }}>Đóng</Button>
            </>
          ) : (
            <>
              <Button variant="light" onPress={() => { reset(); onClose(); }} isDisabled={submitting}>Huỷ</Button>
              <Button color="primary" onPress={() => handleImport(false)} isDisabled={!canImport} isLoading={submitting}>
                {previewSummary
                  ? `Import ${previewSummary.newRows} chuyến mới`
                  : `Import ${parsed?.rows.length ?? ""} chuyến`}
              </Button>
            </>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
