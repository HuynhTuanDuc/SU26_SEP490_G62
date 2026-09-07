import { money } from "../../../utils/formatNumber";
/**
 * Đọc file Excel đơn ngoài thành payload gửi lên API.
 *
 * Tách khỏi ImportExcelModal.jsx để test được: đây là chỗ quyết định doanh thu và công
 * nợ của từng dòng, mà trước đây nằm lẫn trong component React nên không có một test
 * nào — hai lỗi tiền bạc đã lọt qua vì thế (cước tăng bo bị chia thay vì nhân, và ô
 * "Số lượt" định dạng thập phân biến 1 thành 100 lượt).
 */

// Dấu hiệu nhận biết khối ký ở cuối biểu mẫu — những dòng này không phải dữ liệu.
// So sau khi đã bỏ dấu (stripVN) nên viết ở dạng không dấu.
const FOOTER_MARKERS = [
    "nguoi lap bieu", "nguoi ghi so", "ke toan truong", "giam doc",
    "(ky, ho ten", "ngay ", "so nay co", "ngay mo so",
];

export const PAYMENT_OPTIONS = ["CK công ty", "Tiền mặt - tài đã nộp", "Tiền mặt - tài đang giữ", "Khách nợ"];

export const PAYMENT_MAP = {
  "ck cong ty":             { payment_type: "bank_transfer", driver_payment_state: "company_received" },
  "tien mat - tai da nop":  { payment_type: "cash",          driver_payment_state: "driver_paid" },
  "tien mat - tai dang giu":{ payment_type: "cash",          driver_payment_state: "driver_holding" },
  "khach no":               { payment_type: "client_credit", driver_payment_state: "company_received" },
};

export const stripVN = (s) => String(s ?? "")
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
  ["gia chot",             "settled_fee"],
  // Thu hộ (COD) — tiền hàng công ty thu hộ khách khi giao. KHÔNG phải doanh thu, không
  // cộng vào số khách phải trả; chỉ ghi nhận để đối chiếu và trả lại khách.
  ["thu ho",               "collect_on_behalf"],
  ["phi cau duong",        "toll"],
  ["phi do xe",            "parking"],
  ["xang dau",             "fuel"],
  ["sua xe",               "repair"],
  ["thanh toan",           "payment"],
  ["tien tai dang giu",    "holding"],
  ["ghi chu",              "notes"],
];
// Trả { value, negative } — số âm phải BÁO LỖI chứ không được lặng lẽ đổi thành dương.
// Trước đây "-500000" (kế toán gõ nhầm dấu, hoặc ô Excel định dạng kế toán hiển thị số
// âm trong ngoặc) bị biến thành +500000 và ghi thẳng vào doanh thu.
export const parseMoneyCell = (v) => {
  const s = String(v ?? "").trim();
  const digits = s.replace(/[^\d]/g, "");
  const negative = digits !== "" && (s.startsWith("-") || /^\(.*\)$/.test(s));
  return { value: digits ? Number(digits) : 0, negative };
};

const parseMoney = (v) => parseMoneyCell(v).value;

// Các cột tiền phụ cần kiểm tra dấu âm (cước xe kiểm riêng vì còn phải > 0)
const MONEY_FIELD_LABELS = [
  ["toll", "Phí cầu đường/vé"],
  ["parking", "Phí đỗ xe/bãi"],
  ["fuel", "Xăng dầu"],
  ["repair", "Sửa xe"],
  ["holding", "Tiền tài đang giữ"],
  ["collect_on_behalf", "Thu hộ"],
];

/**
 * Số lượt tăng bo. Trả null nếu ô không đọc được thành số lượt hợp lệ.
 *
 * KHÔNG lọc chữ số kiểu replace(/[^\d]/g,'') như trước: ô định dạng "Number 2 chữ số
 * thập phân" hiển thị 1 thành "1.00", lọc chữ số ra "100" → âm thầm tách 1 chuyến
 * thành 100 chuyến. Ở đây giữ nguyên phần thập phân để phát hiện và từ chối.
 */
export const parseRuns = (v) => {
  const s = String(v ?? "").trim();
  if (!s) return 1;                       // bỏ trống = 1 lượt
  const m = s.match(/\d+(?:[.,]\d+)?/);   // "x2c", "2 lượt" → 2
  if (!m) return null;
  const n = Number(m[0].replace(",", "."));
  // Trần 50 khớp giới hạn "một đơn tối đa 50 chuyến" ở backend
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 50) return null;
  return n;
};

/**
 * Tiền tài đang giữ. Trả null nghĩa là "không điền" → công nợ rơi về mặc định
 * (đúng số khách phải trả).
 *
 * "0", "-", "n/a" đều là cách kế toán ghi "không có" nên coi như bỏ trống. Trước đây
 * chỉ cần ô có ký tự là tính như đã điền, nên gõ "0" hay "-" lại làm hỏng cả dòng.
 */
export const parseHoldingCell = (v) => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = parseMoney(s);
  return n > 0 ? n : null;
};

const parseKm = (v) => {
  const s = String(v ?? "").replace(",", ".").replace(/[^\d.]/g, "");
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
};

// Đọc trực tiếp cell gốc (không qua sheet_to_json) để tránh SheetJS tự format lại
// text của ô kiểu "Date" theo bảng định dạng dựng sẵn (thiên về kiểu Mỹ m/d/yy),
// khiến chuỗi hiển thị khác với dd/mm/yyyy dù Excel vẫn hiện đúng dd/mm/yyyy.
const parseDateCell = (cell, XLSX) => {
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

// Hôm nay theo GIỜ MÁY người dùng, dạng YYYY-MM-DD để so chuỗi trực tiếp với dateIso.
// Không dùng toISOString() vì nó quy về UTC — từ 0h đến 7h sáng giờ VN sẽ ra ngày hôm qua
// và chặn oan đơn chạy trong ngày.
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// YYYY-MM-DD → dd/mm/yyyy, để thông báo lỗi và màn xem trước nói đúng thứ người Việt đọc.
export const viDate = (iso) => {
  const m = String(iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
};

// Tách nhiều điểm lấy/trả trong cùng 1 ô — phân cách bằng "|" hoặc xuống dòng (Alt+Enter)
const splitStops = (v) => String(v ?? "")
  .split(/\r?\n|\|/)
  .map((s) => s.trim())
  .filter(Boolean);

// Parse workbook → { rows: [{rowIndex, order, display}], errors: [string] }
export function parseWorkbook(wb, XLSX) {
  const sheetName = wb.SheetNames.includes("DON_HANG") ? "DON_HANG" : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
  if (raw.length < 2) return { rows: [], errors: ["File không có dữ liệu."] };

  // TÌM dòng tiêu đề thay vì mặc định là dòng 1.
  //
  // File báo cáo xuất ra nay mở đầu bằng khối định danh đơn vị (Đơn vị / Địa chỉ / Mã số
  // thuế) rồi mới tới tiêu đề cột — đó là khung bắt buộc của một biểu mẫu chính thức.
  // Đọc cứng raw[0] thì file vừa xuất ra không nhập ngược lại được nữa, mà đó lại là một
  // đường làm việc thật: kế toán xuất báo cáo, sửa vài dòng trong Excel, nhập lại.
  //
  // Quét 20 dòng đầu, lấy dòng khớp nhiều tên cột bắt buộc nhất. Cách này còn chịu được
  // cả trường hợp ai đó chèn thêm một dòng ghi chú phía trên bảng.
  const norm = (h) => stripVN(h).replace(/\(\*\)/g, "").trim();
  const matchCount = (cells) => {
    const cols = cells.map(norm);
    return HEADER_KEYS.filter(([prefix]) => cols.some((h) => h.startsWith(prefix))).length;
  };

  let headerAt = 0;
  let best = -1;
  for (let i = 0; i < Math.min(raw.length, 20); i += 1) {
    const n = matchCount(raw[i] ?? []);
    if (n > best) { best = n; headerAt = i; }
  }

  const headerRow = (raw[headerAt] ?? []).map(norm);
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

  for (let i = headerAt + 1; i < raw.length; i += 1) {
    const r = raw[i];
    if (!r || r.every((c) => String(c).trim() === "")) continue;
    // Dòng TỔNG CỘNG khép lại phần dữ liệu của file báo cáo xuất ra. DỪNG hẳn ở đây,
    // không chỉ bỏ qua một dòng: bên dưới nó còn khối ký (ngày tháng, "Người lập biểu",
    // "(Ký, họ tên)"...). Những dòng đó không rỗng nên vòng lặp cũ đọc chúng như một
    // chuyến và đẻ ra một loạt lỗi giả "thiếu biển số / thiếu tài xế".
    if (r.some((c) => stripVN(c) === "tong cong")) break;

    // Phòng trường hợp file bị xoá mất dòng tổng: nhận diện thẳng khối ký.
    if (r.some((c) => FOOTER_MARKERS.some((m) => stripVN(c).startsWith(m)))) continue;
    const rowNo = i + 1; // số dòng Excel (1-based, gồm header)
    const rowErr = [];

    const dateCellAddr = XLSX.utils.encode_cell({ r: i, c: colIndex.date });
    const dateIso = parseDateCell(ws[dateCellAddr], XLSX);
    if (!dateIso) rowErr.push("Ngày chạy sai định dạng (cần dd/mm/yyyy)");
    else if (dateIso > todayIso()) {
      // Đơn ở đây là đơn ĐÃ HOÀN THÀNH nên ngày chạy không thể ở tương lai. Chặn tại đây
      // bắt được lỗi hay gặp nhất: ô ngày trong Excel đang để định dạng kiểu Mỹ (m/d/yy),
      // gõ "12/8" ra ngày 8 tháng 12 nhưng màn hình vẫn hiện "12/8/26" nên người nhập
      // tưởng là 12 tháng 8. Không chặn thì doanh thu rơi sang tháng 12, KPI và bảng lương
      // tháng hiện tại không thấy gì mà chẳng có lỗi nào báo ra.
      rowErr.push(
        `Ngày chạy ${viDate(dateIso)} ở tương lai — đơn đã hoàn thành không thể có ngày sau hôm nay. `
        + `Kiểm tra định dạng ô ngày trong Excel (phải là dd/mm/yyyy)`,
      );
    }

    const plate = String(get(r, "plate")).trim();
    if (!plate) rowErr.push("Thiếu biển số xe");
    const driver = String(get(r, "driver")).trim();
    if (!driver) rowErr.push("Thiếu tên tài xế");

    const pickups = splitStops(get(r, "pickup"));
    const deliveries = splitStops(get(r, "delivery"));
    if (pickups.length === 0) rowErr.push("Thiếu điểm lấy hàng");
    if (deliveries.length === 0) rowErr.push("Thiếu điểm giao hàng");

    const cargoFeeCell = parseMoneyCell(get(r, "cargo_fee"));
    const cargoFee = cargoFeeCell.value;
    if (cargoFeeCell.negative) rowErr.push("Cước xe không được âm");
    else if (cargoFee <= 0) rowErr.push("Cước xe phải lớn hơn 0");

    // Các cột tiền còn lại: âm là sai dữ liệu, không được tự đổi dấu
    for (const [key, label] of MONEY_FIELD_LABELS) {
      if (parseMoneyCell(get(r, key)).negative) rowErr.push(`${label} không được âm`);
    }

    const paymentRaw = String(get(r, "payment")).trim();
    const payment = PAYMENT_MAP[stripVN(paymentRaw)];
    if (!paymentRaw) rowErr.push('Thiếu cột "Thanh toán" (bắt buộc)');
    else if (!payment) {
      rowErr.push(
        `Giá trị Thanh toán không hợp lệ: "${paymentRaw}" — chỉ nhận: ${PAYMENT_OPTIONS.join(" / ")}`,
      );
    }

    const phone = String(get(r, "customer_phone")).replace(/[^\d]/g, "");
    if (phone && !/^0\d{9}$/.test(phone)) rowErr.push("SĐT khách không hợp lệ (10 số, bắt đầu bằng 0)");

    const runs = parseRuns(get(r, "runs"));
    if (runs == null) rowErr.push('Cột "Số lượt" phải là số nguyên từ 1 đến 50');

    const holding = parseHoldingCell(get(r, "holding"));

    const toll = parseMoney(get(r, "toll"));
    const parking = parseMoney(get(r, "parking"));
    const fuel = parseMoney(get(r, "fuel"));
    const repair = parseMoney(get(r, "repair"));
    // Thu hộ (COD): tiền của KHÁCH mà công ty thu giúp rồi trả lại — ngược chiều với công
    // nợ cước nên KHÔNG cộng vào customerTotal và không đụng gì tới doanh thu.
    const collectOnBehalf = parseMoney(get(r, "collect_on_behalf"));

    // Giá chốt: giá thật sau khi hai bên thống nhất lại, giống việc coordinator sửa giá
    // lúc duyệt phiếu thu trong app (estimated_price → actual_price). Để trống thì giá
    // chốt = giá báo, tức y hệt cách chạy cũ nên file cũ không phải sửa gì.
    // Được phép CAO hoặc THẤP hơn giá báo — tăng giá do phát sinh, giảm giá cho khách
    // quen đều là chuyện thật.
    const settledCell = parseMoneyCell(get(r, "settled_fee"));
    if (settledCell.negative) rowErr.push("Giá chốt không được âm");
    const settledFee = settledCell.value > 0 ? settledCell.value : null;

    // Số tiền dùng cho mọi tính toán tiền bạc: doanh thu, KPI, công nợ.
    const effectiveFee = settledFee ?? cargoFee;

    // Khách phải trả = giá chốt từng lượt × số lượt + phần chi hộ (cầu đường, bãi).
    // Xăng dầu / sửa xe là công ty chịu nên không nằm trong số khách trả.
    const runCount = runs ?? 1;
    const totalFee = effectiveFee * runCount;
    const passThrough = toll + parking;
    const customerTotal = totalFee + passThrough;

    // Kiểm tra THẬT SỰ có ý nghĩa: tài không thể đang giữ nhiều hơn số khách đưa.
    // So với GIÁ CHỐT chứ không phải giá báo — chốt 1tr2 rồi thì tài cầm 1tr2 là đúng.
    // Trần gồm CẢ thu hộ: tài xế thu COD của người nhận thì cũng đang cầm số tiền đó, nên
    // giữ nhiều hơn cước là hợp lệ. Bỏ thu hộ ra khỏi trần sẽ chặn oan đúng những dòng có
    // COD — dòng mà cột thu hộ sinh ra để phục vụ.
    const holdingCeiling = customerTotal + collectOnBehalf;
    if (holding != null && effectiveFee > 0 && runs != null && holding > holdingCeiling) {
      const goc = settledFee != null ? "giá chốt" : "cước";
      rowErr.push(
        `Tiền tài đang giữ (${money(holding)}) lớn hơn số tiền tài có thể cầm `
        + `(${money(holdingCeiling)} = ${goc} ${money(effectiveFee)} × ${runCount} lượt`
        + `${passThrough > 0 ? ` + chi hộ ${money(passThrough)}` : ""}`
        + `${collectOnBehalf > 0 ? ` + thu hộ ${money(collectOnBehalf)}` : ""})`,
      );
    }

    if (rowErr.length) {
      errors.push(`Dòng ${rowNo}: ${rowErr.join("; ")}`);
      continue;
    }

    const distance = parseKm(get(r, "distance"));
    const notes = String(get(r, "notes")).trim() || null;
    const customerName = String(get(r, "customer_name")).trim() || null;

    // Tăng bo N lượt → N chuyến, MỖI chuyến mang trọn cước của 1 lượt (cột "Cước xe"
    // là giá một lượt, không phải tổng cả dòng).
    // Tiền tài đang giữ thì ngược lại — là tổng của cả dòng — nên chia đều cho N chuyến,
    // chuyến đầu nhận phần dư, để tổng công nợ tài xế đúng bằng số đã nhập.
    const holdingPerRun = holding == null ? null : Math.floor(holding / runCount);
    const holdingFirst = holding == null ? null : holding - holdingPerRun * (runCount - 1);

    const shipments = [];
    for (let run = 0; run < runCount; run += 1) {
      const isFirst = run === 0;
      // Chi phí là số tiền thực chi của cả dòng (theo chứng từ), không nhân theo lượt —
      // dồn vào chuyến đầu để không bị đếm N lần.
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
        cargo_fee: cargoFee,
        // null = không sửa giá → backend để actual_price = cargo_fee như cũ
        settled_fee: settledFee,
        cargo_name: String(get(r, "cargo_name")).trim() || null,
        distance_km: isFirst ? distance : null,
        // Thu hộ là số của CẢ DÒNG (giống chi phí, khác cước xe vốn tính theo lượt) — dồn
        // vào chuyến đầu để tăng bo N lượt không nhân số COD lên N lần.
        collect_on_behalf: isFirst ? collectOnBehalf : 0,
        expenses,
        payment_type: payment.payment_type,
        driver_payment_state: payment.driver_payment_state,
        driver_holding_amount: holding == null ? null : (isFirst ? holdingFirst : holdingPerRun),
        notes: runCount > 1 ? `${notes ? `${notes} | ` : ""}Tăng bo lượt ${run + 1}/${runCount}` : notes,
      });
    }

    rows.push({
      rowIndex: rowNo,
      display: {
        // Hiện ngày ĐÃ HIỂU ĐƯỢC (dd/mm/yyyy) chứ không phải chuỗi thô trong ô Excel.
        // Ô ngày kiểu Mỹ hiện "12/8/26" nhưng thực chất là 8 tháng 12 — chép nguyên chuỗi
        // thô ra màn xem trước thì kế toán không đời nào phát hiện được, còn hiện ngày đã
        // giải mã thì sai lệch lộ ra ngay trước khi bấm Import.
        date: viDate(dateIso) || get(r, "date"), plate, driver,
        // Chỉ gọi là "Khách lẻ" khi KHÔNG có cả tên lẫn SĐT. Dòng chỉ có SĐT vẫn định
        // danh được nên hiện SĐT, gọi là khách lẻ thì kế toán tưởng dòng bị mất khách.
        customer: customerName || phone || "Khách lẻ",
        pickups, deliveries,
        cargoFee, settledFee, effectiveFee, totalFee, holding, paymentRaw, runs: runCount,
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
