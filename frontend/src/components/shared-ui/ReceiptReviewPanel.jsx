import { useState, useEffect, useCallback } from "react";
import { Button, Image, Chip, Textarea, Spinner, Select, SelectItem } from "@heroui/react";
import {
  RiCheckLine, RiErrorWarningFill, RiAlertLine, RiInformationLine,
  RiRobot2Line, RiPriceTag3Line,
} from "react-icons/ri";
import { money } from "../../utils/formatNumber";

/**
 * Kết quả máy đọc hóa đơn, bày ra cho người duyệt: ảnh bên trái, bảng dòng hàng bên
 * phải, các kiểm tra tô màu theo mức độ.
 *
 * Vì sao cần màn này: trước đây manager chỉ thấy ảnh hóa đơn và số tiền tài xế khai,
 * nên "kiểm tra" thực chất là căng mắt cộng nhẩm trên một tấm ảnh chụp nghiêng. Ở đây
 * máy đã đọc sẵn từng dòng và cộng sẵn, việc của người là xác nhận hoặc bác lại.
 *
 * Nút "Đúng ra là..." không chỉ sửa một lần: từ khoá được dạy sẽ vào từ điển và áp
 * ngược lại cho cả những hóa đơn đã đọc trước đó.
 */

const VERDICT = {
  passed: { label: "Đạt", color: "success", Icon: RiCheckLine },
  needs_review: { label: "Cần xem", color: "warning", Icon: RiAlertLine },
  rejected: { label: "Không đạt", color: "danger", Icon: RiErrorWarningFill },
  error: { label: "Không đọc được", color: "default", Icon: RiInformationLine },
};

const vnd = (n) => (Number.isFinite(Number(n)) ? `${money(Number(n))}` : "—");

/**
 * Màu của độ tin cậy suy từ CHÍNH con số, không tra theo nhãn chữ.
 *
 * Nhãn ("cao"/"trung bình"/"thấp") do backend sinh và có thể đổi cách diễn đạt; tra
 * theo chữ thì một ngày nào đó đổi chữ là chip mất màu mà không ai biết.
 */
const confidenceColor = (value) => {
  if (value >= 0.8) return "success";
  if (value >= 0.6) return "warning";
  return "danger";
};

/**
 * Độ tin cậy của lần đọc, chấm bằng cách đối chiếu bản đọc của AI với văn bản OCR quét
 * độc lập từ cùng tấm ảnh.
 *
 * Vì sao đáng bày ra: phán quyết "Đạt/Cần xem" nói hóa đơn có hợp lệ không, còn con số
 * này nói MÁY CÓ ĐỌC ĐÚNG KHÔNG — hai chuyện khác nhau. Một hóa đơn "Đạt" với độ tin
 * cậy thấp là tờ người duyệt phải mở ảnh ra xem tận nơi.
 */
function ConfidenceChip({ value, label }) {
  if (!Number.isFinite(value)) return null;
  return (
    <Chip
      size="sm"
      variant="dot"
      color={confidenceColor(value)}
      title="Mức khớp giữa bản đọc của AI và văn bản quét được từ ảnh"
    >
      Đọc {label ?? ""} · {Math.round(value * 100)}%
    </Chip>
  );
}

/** Một dòng hàng trên hóa đơn, kèm ô sửa phân loại khi người duyệt bấm vào. */
function LineItemRow({ item, onTeach, teachable, categories, profileLabel }) {
  const [editing, setEditing] = useState(false);
  const [category, setCategory] = useState(item.category ?? "");

  // Dòng sai chủ đề tô đỏ, dòng chưa phân loại được tô vàng — đúng hai thứ người duyệt
  // cần nhìn trước tiên, phần còn lại để trắng cho khỏi nhiễu.
  const tone = item.on_topic === false
    ? "bg-rose-50 dark:bg-rose-950/30"
    : item.on_topic === null
      ? "bg-amber-50 dark:bg-amber-950/30"
      : "";

  const handleTeach = async () => {
    const picked = categories.find((o) => o.value === category);
    if (!picked) return;
    await onTeach({ keyword: item.raw_name, category: picked.value, item_group: picked.group });
    setEditing(false);
  };

  return (
    <>
      <tr className={`border-b border-gray-100 dark:border-gray-800 ${tone}`}>
        <td className="py-1.5 pr-2 align-top">
          <div className="text-gray-800 dark:text-gray-100">{item.raw_name ?? "—"}</div>
          <div className="flex items-center gap-1 mt-0.5">
            {item.category_label
              ? <span className="text-[11px] text-gray-400 dark:text-gray-400">{item.category_label}</span>
              : <span className="text-[11px] text-amber-600 dark:text-amber-400">Chưa phân loại</span>}
            {item.matched_by === "model" && (
              <RiRobot2Line size={11} className="text-gray-300" title="AI đoán, từ điển chưa có" />
            )}
            {item.matched_by === "conflict" && (
              <span className="text-[11px] text-amber-600 dark:text-amber-400">· từ điển và AI khác nhau</span>
            )}
          </div>
        </td>
        <td className="py-1.5 px-1 text-right align-top tabular-nums text-gray-600 dark:text-gray-300">
          {item.quantity ?? "—"}
        </td>
        <td className="py-1.5 px-1 text-right align-top tabular-nums text-gray-600 dark:text-gray-300">
          {vnd(item.unit_price)}
        </td>
        <td className="py-1.5 pl-1 text-right align-top tabular-nums font-medium text-gray-800 dark:text-gray-100">
          {vnd(item.line_total)}
        </td>
        {teachable && (
          <td className="py-1.5 pl-2 align-top">
            <Button size="sm" variant="light" isIconOnly onPress={() => setEditing((v) => !v)} title="Sửa phân loại">
              <RiPriceTag3Line size={14} />
            </Button>
          </td>
        )}
      </tr>
      {editing && (
        <tr className="bg-gray-50 dark:bg-gray-900/50">
          <td colSpan={teachable ? 5 : 4} className="py-2 px-2">
            <div className="flex items-end gap-2 flex-wrap">
              <Select
                size="sm"
                label="Đúng ra dòng này là"
                selectedKeys={category ? [category] : []}
                onSelectionChange={(keys) => setCategory([...keys][0] ?? "")}
                className="max-w-xs"
              >
                {categories.map((o) => (
                  <SelectItem key={o.value}>
                    {o.on_topic ? o.label : `${o.label} (không thuộc ${profileLabel})`}
                  </SelectItem>
                ))}
              </Select>
              <Button size="sm" color="primary" onPress={handleTeach} isDisabled={!category}>Ghi nhớ</Button>
              <Button size="sm" variant="light" onPress={() => setEditing(false)}>Bỏ qua</Button>
            </div>
            <p className="text-[11px] text-gray-400 dark:text-gray-400 mt-1">
              Hệ thống sẽ nhớ tên hàng này và tự phân loại đúng ở những hóa đơn sau,
              kể cả những hóa đơn đã đọc trước đó.
            </p>
          </td>
        </tr>
      )}
    </>
  );
}

// Ảnh gửi kèm yêu cầu không phải hóa đơn (báo giá, chứng từ): bước hoàn tất đã gạt nó
// khỏi tổng. Gắn "Không đạt" cho nó là báo động giả cho người duyệt.
const SUPPORTING = { label: "Chứng từ kèm theo — không tính vào tổng", color: "default", Icon: RiInformationLine };

function ReceiptCard({ receipt, onReview, readOnly, categories, profileLabel, showClaim, recordCost }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const verdict = receipt.supporting ? SUPPORTING : (VERDICT[receipt.verdict] ?? VERDICT.error);
  // Số khai CUỐI CÙNG của đợt nếu có; claimed_amount của dòng vết là số lúc tải ảnh, tài xế
  // có thể đã sửa sau đó.
  const claimed = Number.isFinite(recordCost) && recordCost > 0 ? recordCost : receipt.claimed_amount;

  const submit = async (action, learnKeywords) => {
    setBusy(true);
    try {
      await onReview(receipt.id, { action, note: note.trim() || null, learn_keywords: learnKeywords });
    } finally {
      setBusy(false);
    }
  };

  // Dạy từ điển KHÔNG kèm kết luận về tờ hóa đơn: sửa một chữ mà hệ thống ghi luôn
  // "đã chấp nhận hóa đơn" thì vết kiểm toán thành sai. Người duyệt vẫn phải tự bấm
  // một trong ba nút kết luận sau khi sửa xong.
  const teach = (keyword) => onReview(receipt.id, { learn_keywords: [keyword] });

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Chip size="sm" color={verdict.color} variant="flat" startContent={<verdict.Icon size={13} />}>
            {verdict.label}
          </Chip>
          <ConfidenceChip value={receipt.confidence} label={receipt.confidence_label} />
          {receipt.invoice_no && (
            <span className="text-xs text-gray-400 dark:text-gray-400 truncate">
              Số {receipt.invoice_no}
              {receipt.issued_date ? ` · ${receipt.issued_date}` : ""}
            </span>
          )}
        </div>
        {receipt.review && (
          <Chip size="sm" variant="flat" color="default">
            {receipt.review.action === "agree" ? "Đã đồng ý" : "Đã ghi đè"}
            {receipt.review.by ? ` · ${receipt.review.by}` : ""}
          </Chip>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[160px_1fr] gap-3">
        <div>
          <a href={receipt.image_url} target="_blank" rel="noreferrer">
            <Image src={receipt.image_url} width={160} className="object-cover rounded-lg" />
          </a>
          {receipt.vendor?.name && (
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5 leading-tight">{receipt.vendor.name}</p>
          )}
          {receipt.vehicle_plate && (
            <p className="text-[11px] text-gray-400 dark:text-gray-400">Biển số trên HĐ: {receipt.vehicle_plate}</p>
          )}
        </div>

        <div className="min-w-0">
          {receipt.items.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-400 dark:text-gray-400 border-b border-gray-200 dark:border-gray-800">
                    <th className="text-left font-medium pb-1">Hàng hóa / dịch vụ</th>
                    <th className="text-right font-medium pb-1 px-1">SL</th>
                    <th className="text-right font-medium pb-1 px-1">Đơn giá</th>
                    <th className="text-right font-medium pb-1 pl-1">Thành tiền</th>
                    {!readOnly && <th className="w-8" />}
                  </tr>
                </thead>
                <tbody>
                  {receipt.items.map((item) => (
                    <LineItemRow
                      key={item.index}
                      item={item}
                      teachable={!readOnly}
                      onTeach={teach}
                      categories={categories}
                      profileLabel={profileLabel}
                    />
                  ))}
                </tbody>
                <tfoot className="text-xs">
                  {receipt.totals?.subtotal != null && (
                    <tr><td colSpan={3} className="text-right pt-1.5 pr-2 text-gray-400">Tiền hàng</td>
                      <td className="text-right pt-1.5 tabular-nums text-gray-600 dark:text-gray-300">{vnd(receipt.totals.subtotal)}</td>
                      {!readOnly && <td />}</tr>
                  )}
                  {receipt.totals?.vat_amount != null && receipt.totals.vat_amount > 0 && (
                    <tr><td colSpan={3} className="text-right pr-2 text-gray-400">
                      Thuế{receipt.totals.vat_rate ? ` ${receipt.totals.vat_rate}%` : ""}</td>
                      <td className="text-right tabular-nums text-gray-600 dark:text-gray-300">{vnd(receipt.totals.vat_amount)}</td>
                      {!readOnly && <td />}</tr>
                  )}
                  <tr className="border-t border-gray-200 dark:border-gray-800">
                    <td colSpan={3} className="text-right pt-1 pr-2 font-bold text-gray-500 dark:text-gray-400">Tổng hóa đơn</td>
                    <td className="text-right pt-1 tabular-nums font-bold text-gray-800 dark:text-gray-100">{vnd(receipt.receipt_total)}</td>
                    {!readOnly && <td />}
                  </tr>
                  {/* Số khai là của CẢ ĐỢT. Đặt cạnh tổng của từng tờ khi đợt có nhiều hóa
                      đơn thì tờ nào cũng tô đỏ "lệch", dù cả đợt khớp từng đồng. */}
                  {showClaim && claimed != null && (
                    <tr><td colSpan={3} className="text-right pr-2 text-gray-400">Tài xế khai</td>
                      <td className={`text-right tabular-nums ${
                        Math.abs(claimed - (receipt.receipt_total ?? 0)) > 1000
                          ? "text-rose-600 dark:text-rose-400 font-bold" : "text-gray-600 dark:text-gray-300"}`}>
                        {vnd(claimed)}
                      </td>
                      {!readOnly && <td />}</tr>
                  )}
                </tfoot>
              </table>
            </div>
          ) : (
            <p className="text-xs text-gray-400 dark:text-gray-400">Không đọc được dòng hàng nào trên ảnh này.</p>
          )}
        </div>
      </div>

      {(receipt.errors.length > 0 || receipt.warnings.length > 0) && (
        <div className="mt-3 flex flex-col gap-1">
          {receipt.errors.map((r, i) => (
            <p key={`e${i}`} className="text-xs text-rose-600 dark:text-rose-400 flex gap-1.5">
              <RiErrorWarningFill size={14} className="shrink-0 mt-0.5" /><span>{r.message}</span>
            </p>
          ))}
          {receipt.warnings.map((r, i) => (
            <p key={`w${i}`} className="text-xs text-amber-600 dark:text-amber-400 flex gap-1.5">
              <RiAlertLine size={14} className="shrink-0 mt-0.5" /><span>{r.message}</span>
            </p>
          ))}
        </div>
      )}

      {/* Văn bản OCR — mặc định gập lại vì phần lớn lần duyệt không cần tới.
          Khi cần thì nó là thứ quan trọng nhất trên màn này: bảng dòng hàng ở trên là
          lời khai của AI, còn đây là chữ quét thẳng từ ảnh, không đi qua AI nào. Tranh
          chấp "máy đọc sai số tiền" chỉ phân xử được bằng cách so hai thứ đó với nhau. */}
      {receipt.ocr?.text && (
        <details className="mt-3">
          <summary className="text-xs text-gray-400 dark:text-gray-400 cursor-pointer select-none">
            Văn bản quét thẳng từ ảnh (không qua AI)
            {Number.isFinite(Number(receipt.ocr.confidence))
              ? ` · độ rõ ${Math.round(Number(receipt.ocr.confidence))}%`
              : ""}
          </summary>
          <pre className="mt-1.5 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-gray-50 dark:bg-gray-900/50 p-2 text-[11px] leading-snug text-gray-600 dark:text-gray-300">
            {receipt.ocr.text}
          </pre>
        </details>
      )}

      {!readOnly && (
        <div className="mt-3 flex flex-col gap-2">
          <Textarea
            size="sm" minRows={1} placeholder="Ghi chú khi kết luận khác máy (tuỳ chọn)"
            value={note} onValueChange={setNote}
          />
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" color="success" variant="flat" isLoading={busy}
              onPress={() => submit("agree")}>
              Đồng ý với kết quả máy
            </Button>
            <Button size="sm" color="primary" variant="flat" isLoading={busy}
              onPress={() => submit("override_accept")}>
              Vẫn chấp nhận hóa đơn
            </Button>
            <Button size="sm" color="danger" variant="flat" isLoading={busy}
              onPress={() => submit("override_reject")}>
              Hóa đơn có vấn đề
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReceiptReviewPanel({ recordId, fetchReview, submitReview, readOnly = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!recordId) return;
    setLoading(true);
    setError(null);
    try {
      setData(await fetchReview(recordId));
    } catch (err) {
      // Không chặn màn xác nhận: đây là lớp trợ giúp, hỏng thì manager vẫn duyệt được
      // bằng mắt như trước.
      setError(err.message || "Không tải được kết quả đọc hóa đơn.");
    } finally {
      setLoading(false);
    }
  }, [recordId, fetchReview]);

  useEffect(() => { load(); }, [load]);

  const handleReview = async (extractionId, payload) => {
    await submitReview(extractionId, payload);
    await load();
  };

  if (!recordId) return null;
  if (loading) return <div className="flex justify-center py-4"><Spinner size="sm" /></div>;
  if (error) return <p className="text-xs text-gray-400 dark:text-gray-400">{error}</p>;
  if (!data) return null;

  const { summary } = data;
  const recordChecks = data.record_checks ?? [];
  const invoiceCount = data.receipts.filter((r) => !r.supporting).length;
  if (data.receipts.length === 0 && recordChecks.length === 0 && !summary?.unread && !summary?.rejected_uploads) {
    return <p className="text-xs text-gray-400 dark:text-gray-400">Chưa có hóa đơn nào được máy đọc cho đợt này.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Điểm ở mức cả đợt — bước hoàn tất đã nêu (tổng hóa đơn so với số khai, ảnh chứng
          từ bị gạt khỏi tổng) và chi phí bất thường so với lịch sử xe. Không thuộc riêng
          tờ hóa đơn nào nên đứng riêng trên đầu. */}
      {recordChecks.map((check, i) => (
        <p key={`rc${i}`} className="text-xs text-amber-600 dark:text-amber-400 flex gap-1.5">
          <RiAlertLine size={14} className="shrink-0 mt-0.5" /><span>{check.message}</span>
        </p>
      ))}
      {summary?.unread > 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400 flex gap-1.5">
          <RiAlertLine size={14} className="shrink-0 mt-0.5" />
          <span>{summary.unread} ảnh của đợt chưa được máy đọc — vui lòng xem ảnh gốc bằng mắt.</span>
        </p>
      )}
      {summary?.rejected_uploads > 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400 flex gap-1.5">
          <RiInformationLine size={14} className="shrink-0 mt-0.5" />
          <span>Tài xế đã thử tải {summary.rejected_uploads} ảnh bị máy chặn (không thuộc đợt này).</span>
        </p>
      )}
      {(summary.rejected > 0 || summary.needs_review > 0 || summary.low_confidence > 0) && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          {summary.rejected > 0 && `${summary.rejected} hóa đơn không đạt. `}
          {summary.needs_review > 0 && `${summary.needs_review} hóa đơn cần người xem. `}
          {/* Tách riêng khỏi "cần người xem": đây là những tờ máy ĐỌC KHÔNG CHẮC, tức
              là phải mở ảnh ra đối chiếu tận nơi — khác với tờ bị gắn cảnh báo vì lý do
              nghiệp vụ (lệch ngày, lệch biển số) mà việc đọc thì không có vấn đề gì. */}
          {summary.low_confidence > 0 && `${summary.low_confidence} hóa đơn máy đọc không chắc, cần mở ảnh đối chiếu. `}
          Vui lòng đối chiếu trước khi xác nhận.
        </p>
      )}
      {data.receipts.map((receipt) => (
        <ReceiptCard
          key={receipt.id}
          receipt={receipt}
          onReview={handleReview}
          readOnly={readOnly}
          categories={data.categories ?? []}
          profileLabel={data.profile_label ?? "loại chi phí này"}
          showClaim={invoiceCount === 1 && !receipt.supporting}
          recordCost={Number(data.record?.cost)}
        />
      ))}
    </div>
  );
}
