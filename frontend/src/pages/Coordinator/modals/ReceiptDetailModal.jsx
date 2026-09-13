import { useEffect, useState } from "react";
import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button, Input, Select, SelectItem, Textarea, Chip, Spinner, Image,
} from "@heroui/react";
import {
  RiAddLine, RiCloseLine, RiCheckLine, RiErrorWarningLine, RiImageLine, RiLoader4Line,
  RiMoneyDollarCircleLine, RiTruckLine, RiPriceTag3Line, RiFileTextLine,
} from "react-icons/ri";

const ic = (Icon) => <Icon size={16} className="text-gray-400 dark:text-gray-400 shrink-0" />;
import { StatusBadge } from "../../../components/shared-ui/StatusBadge";
import { coordinatorService } from "../services/coordinator.service";
import { expenseTypeOptions, formatCurrency, normalizeStatus } from "../utils";
import { money } from "../../../utils/formatNumber";

const EXPENSE_STATUS_CHIP = {
  pending: { label: "Sẽ duyệt khi phát hành", color: "warning" },
  approved: { label: "Đã duyệt", color: "success" },
  rejected: { label: "Đã từ chối", color: "danger" },
};

const PASS_THROUGH_TYPES = ["parking", "toll", "etc"];

// Chuyến hủy vì hàng hóa hư hại (hoặc giao thất bại): mọi chi phí của chuyến do DOANH
// NGHIỆP chịu, kể cả loại vốn là chi hộ khách. Phải khớp đúng
// backend/constants/expenseConstants.js — lệch một bên là "Tổng thu" xem trước ra số khác
// số thực sự chốt lúc bấm Phát hành.
const COMPANY_BORNE_SHIPMENT_STATUSES = ["cancelled", "failed"];
const isCompanyBorneShipment = (shipment) =>
  COMPANY_BORNE_SHIPMENT_STATUSES.includes(String(shipment?.status || "").trim().toLowerCase());

const formatRouteLabel = (shipment) => {
  if (!shipment) return "-";
  const pickup = shipment.pickup_address || shipment.stops?.find((stop) => stop.stop_type === "pickup")?.address || "-";
  const delivery = shipment.delivery_address || shipment.stops?.find((stop) => stop.stop_type === "delivery")?.address || "-";
  return `${pickup} -> ${delivery}`;
};

export default function ReceiptDetailModal({
  open, detail, loading, form, publishing, onClose, onPublish,
  updateField, addExpense, updateExpense, updateExpenseShipment, removeExpense,
}) {
  const [ocrResults, setOcrResults] = useState({});
  const [ocrLoading, setOcrLoading] = useState(false);

  useEffect(() => {
    if (!open || !detail?.request?.id) return;
    const allExpenses = (detail.shipments || []).flatMap((s) => s.expenses || []);
    const hasImages = allExpenses.some((e) => Array.isArray(e.receipt_urls) && e.receipt_urls.length > 0);
    if (!hasImages) return;

    setOcrResults({});
    setOcrLoading(true);
    coordinatorService.scanReceiptExpenses(detail.request.id)
      .then((data) => {
        const map = {};
        (data.results || []).forEach((r) => { map[r.expense_id] = r; });
        setOcrResults(map);
      })
      .catch(() => { })
      .finally(() => setOcrLoading(false));
  }, [open, detail?.request?.id]);

  const shipments = detail?.shipments || (detail?.shipment ? [detail.shipment] : []);
  const primaryShipment = detail?.shipment || shipments[0] || null;
  const status = normalizeStatus(detail?.request?.status);
  const readonly = ["approved", "rejected"].includes(status);
  const priceOverrideNum = Number(form?.priceOverride);
  const hasPriceOverride = !readonly && Number.isFinite(priceOverrideNum) && priceOverrideNum > 0;
  const actualRevenue = shipments.reduce((sum, s) => {
    const base = Number(s.actual_revenue || s.actual_price || 0);
    if (hasPriceOverride && primaryShipment && s.id === primaryShipment.id) return sum + priceOverrideNum;
    return sum + base;
  }, 0);
  const companyBorneShipmentIds = new Set(shipments.filter(isCompanyBorneShipment).map((s) => Number(s.id)));
  const billableCandidates = [...(detail?.expenses || []), ...(form?.expenses || [])]
    .filter((expense) => expense.status !== "rejected" && PASS_THROUGH_TYPES.includes(String(expense.expense_type || "").trim()));
  // Khoản coordinator vừa thêm có thể chưa chọn chuyến (shipment_id rỗng) — backend
  // normalizeExpenses gán về chuyến chốt phiếu, ở đây phải suy ra y hệt.
  const isCompanyBorneExpense = (expense) => {
    const raw = expense.shipment_id;
    const shipmentId = raw === null || raw === undefined || raw === "" ? primaryShipment?.id : raw;
    return companyBorneShipmentIds.has(Number(shipmentId));
  };
  const passThroughExpenses = billableCandidates
    .filter((expense) => !isCompanyBorneExpense(expense))
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  // Chi hộ của chuyến hàng hư hại — đã chuyển sang DN chịu, KHÔNG cộng vào tiền khách.
  const companyBorneExpenses = billableCandidates
    .filter(isCompanyBorneExpense)
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const finalPrice = actualRevenue + passThroughExpenses;
  // Tiền ứng trước trừ vào TOÀN BỘ số phải trả (cước + chi hộ) — khớp đúng công thức
  // approveReceiptRequest dùng để chốt. Ứng dư thì phần dư sinh phiếu hoàn cho kế toán.
  //
  // prepaid_amount backend trả về đã loại khoản 'pending' (tiền chưa về, chưa ghi sổ) nên
  // không cần lọc lại ở đây; prepaid_pending chỉ dùng để cảnh báo + khoá nút Phát hành.
  const prepaidPending = detail?.order?.prepaid_pending === true;
  const prepaidDeclared = Math.max(Number(detail?.order?.prepaid_amount_declared || 0), 0);
  const prepaidAmount = Math.max(Number(detail?.order?.prepaid_amount || 0), 0);
  const amountDue = Math.max(finalPrice - prepaidAmount, 0);
  const prepaidRefundDue = Math.max(prepaidAmount - finalPrice, 0);

  return (
    <Modal isOpen={open} onOpenChange={(isOpen) => !isOpen && onClose()} size="5xl" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <span className="text-base font-bold text-gray-900 dark:text-gray-100">{readonly ? "Chi tiết phiếu thu" : "Tạo phiếu thu"}</span>
          <span className="text-xs font-normal text-gray-400 dark:text-gray-400">
            {detail?.request ? `Yêu cầu #${detail.request.id} · Đơn #${detail.order?.id}` : "Đang tải thông tin yêu cầu phiếu thu"}
          </span>
        </ModalHeader>
        <ModalBody>
          {loading || !detail ? (
            <div className="flex justify-center py-12"><Spinner color="primary" label="Đang tải chi tiết phiếu thu..." /></div>
          ) : (
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-bold text-gray-400 dark:text-gray-400 uppercase tracking-wider mb-3">Khách hàng</div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><span className="text-xs text-gray-400 dark:text-gray-400 block">Khách hàng</span><strong>{detail.customer?.full_name || "Khách lẻ"}</strong></div>
                    <div><span className="text-xs text-gray-400 dark:text-gray-400 block">Số điện thoại</span><strong>{detail.customer?.phone || "-"}</strong></div>
                    <div><span className="text-xs text-gray-400 dark:text-gray-400 block">Công ty</span><strong>{detail.customer?.company_name || "-"}</strong></div>
                    <div><span className="text-xs text-gray-400 dark:text-gray-400 block">Tài xế</span><strong>{detail.request?.driver_name || "-"}</strong></div>
                    <div><span className="text-xs text-gray-400 dark:text-gray-400 block">Đơn hàng</span><strong>#{detail.order?.id || "-"}</strong></div>
                    <div><span className="text-xs text-gray-400 dark:text-gray-400 block">Số chuyến</span><strong>{shipments.length || 0}</strong></div>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-bold text-gray-400 dark:text-gray-400 uppercase tracking-wider mb-3">Thông tin đơn hàng</div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><span className="text-xs text-gray-400 dark:text-gray-400 block">Hàng hóa</span><strong>{detail.order?.cargo_name || "-"}</strong></div>
                    <div><span className="text-xs text-gray-400 dark:text-gray-400 block">Khối lượng</span><strong>{detail.order?.cargo_weight_kg ? `${detail.order.cargo_weight_kg} kg` : "-"}</strong></div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {shipments.map((shipment) => (
                  <div key={shipment.id} className="rounded-xl border border-gray-100 dark:border-white/10 p-4 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <strong className="text-sm">Chuyến #{shipment.id} · {shipment.shipment_index || "-"}</strong>
                        {shipment.returning_at ? (
                          <Chip size="sm" variant="flat" color="warning">Hoàn hàng · ×2 cước</Chip>
                        ) : null}
                      </div>
                      <StatusBadge status={shipment.status} />
                    </div>
                    <div className="grid grid-cols-4 gap-3 text-sm">
                      <div><span className="text-xs text-gray-400 dark:text-gray-400 block">Tài xế</span><strong>{shipment.driver_name || "-"}</strong></div>
                      <div><span className="text-xs text-gray-400 dark:text-gray-400 block">Biển số</span><strong>{shipment.plate_number || "-"}</strong></div>
                      <div><span className="text-xs text-gray-400 dark:text-gray-400 block">Nhóm xe</span><strong>{shipment.vehicle_group_name || "-"}</strong></div>
                      <div><span className="text-xs text-gray-400 dark:text-gray-400 block">Đơn giá/km</span><strong>{money(shipment.price_per_km)}</strong></div>
                      <div><span className="text-xs text-gray-400 dark:text-gray-400 block">KM thực tế</span><strong>{shipment.actual_km ? `${shipment.actual_km} km` : "-"}</strong></div>
                      {!readonly && primaryShipment && shipment.id === primaryShipment.id ? (
                        <div>
                          <span className="text-xs text-gray-400 dark:text-gray-400 block">Doanh thu (có thể sửa)</span>
                          <Input
                            type="number"
                            min="0"
                            step="1000"
                            size="sm"
                            variant="bordered"
                            placeholder={`Gợi ý: ${money(shipment.actual_revenue || shipment.actual_price || 0)}`}
                            value={form?.priceOverride ?? ""}
                            onValueChange={(v) => updateField("priceOverride", v)}
                            startContent={ic(RiMoneyDollarCircleLine)}
                          />
                        </div>
                      ) : (
                        <div><span className="text-xs text-gray-400 dark:text-gray-400 block">Doanh thu</span><strong>{money(shipment.actual_revenue || shipment.actual_price || 0)}</strong></div>
                      )}
                      <div className="col-span-2"><span className="text-xs text-gray-400 dark:text-gray-400 block">Lộ trình</span><strong>{formatRouteLabel(shipment)}</strong></div>
                      <div>
                        <span className="text-xs text-gray-400 dark:text-gray-400 block">Chi phí phát sinh</span>
                        <strong>{money(shipment.total_expenses)}</strong>
                        {isCompanyBorneShipment(shipment) && Number(shipment.total_expenses) > 0 && (
                          <span className="text-[11px] text-amber-600 dark:text-amber-400 block">Doanh nghiệp chịu</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-xs font-bold text-gray-400 dark:text-gray-400 uppercase tracking-wider">{readonly ? "Thông tin phiếu thu" : "Chi phí & phát hành"}</div>
                    <p className="text-xs text-gray-400 dark:text-gray-400 mt-1">
                      {readonly ? "Xem lại chi phí đã ghi nhận và tổng hợp phiếu thu." : "Quản lý toàn bộ chi phí của đơn hàng và thêm khoản mới ngay bên dưới."}
                    </p>
                  </div>
                  {!readonly && (
                    <Button size="sm" color="primary" startContent={<RiAddLine size={16} />} onPress={addExpense}>Thêm chi phí</Button>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  {(detail.expenses || []).map((expense) => {
                    const ocr = ocrResults[expense.id];
                    const images = Array.isArray(expense.receipt_urls) ? expense.receipt_urls : [];
                    const hasImage = images.length > 0;
                    // Ba trạng thái, không phải hai. Chi phí chuyến có những khoản không
                    // xác thực được (vé giữ xe viết tay, phí không hóa đơn), nên gắn nhãn
                    // "Hợp lệ" cho cả thứ máy không đọc nổi là nói quá điều hệ thống biết.
                    // `valid` giữ lại làm đường lùi cho phản hồi kiểu cũ.
                    const ocrVerdict = ocr?.verdict ?? (ocr?.valid === true ? "passed" : ocr?.valid === false ? "rejected" : null);
                    const ocrHint = ocr?.reject_reason
                      || (ocr?.warnings || []).map((w) => w.message).join(" ")
                      || undefined;
                    return (
                      <div key={expense.id} className="rounded-xl border border-gray-100 dark:border-white/10 p-3 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <strong className="text-sm">{expenseTypeOptions.find((o) => o.value === expense.expense_type)?.label || expense.expense_type}</strong>
                            <span className="ml-2 text-xs text-gray-400 dark:text-gray-400">
                              {expense.description || "Chi phí đã ghi nhận"}{expense.shipment_id ? ` · Chuyến #${expense.shipment_id}` : ""}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {hasImage && (
                              ocrLoading && !ocr ? (
                                <Chip size="sm" variant="flat" color="primary" startContent={<RiLoader4Line size={12} className="animate-spin" />}>Đang quét</Chip>
                              ) : ocrVerdict === "passed" ? (
                                <Chip size="sm" variant="flat" color="success" startContent={<RiCheckLine size={12} />}>Hợp lệ</Chip>
                              ) : ocrVerdict === "needs_review" ? (
                                <Chip size="sm" variant="flat" color="warning" startContent={<RiErrorWarningLine size={12} />}
                                  title={ocrHint}>Cần xem</Chip>
                              ) : ocrVerdict === "rejected" ? (
                                <Chip size="sm" variant="flat" color="danger" startContent={<RiErrorWarningLine size={12} />}
                                  title={ocrHint}>Không khớp</Chip>
                              ) : null
                            )}
                            {!hasImage && (
                              <Chip size="sm" variant="flat" startContent={<RiImageLine size={12} />}>Chưa có ảnh</Chip>
                            )}
                            {/* Khoản 'pending' sẽ được duyệt tự động khi phát hành phiếu thu —
                                nói rõ ra để coordinator không tưởng nó bị bỏ ngoài số tiền. */}
                            <Chip size="sm" variant="flat" color={EXPENSE_STATUS_CHIP[expense.status]?.color || "default"}>
                              {EXPENSE_STATUS_CHIP[expense.status]?.label || expense.status}
                            </Chip>
                            <strong className="text-sm">{money(expense.amount)}</strong>
                          </div>
                        </div>
                        {hasImage && (
                          <div>
                            {/* Ảnh 72px không đủ để đối chiếu số tiền — mở ảnh gốc ở tab mới. */}
                            <div className="text-[11px] text-gray-400 dark:text-gray-400 mb-1">
                              Ảnh hóa đơn tài xế tải lên ({images.length}) — bấm để xem ảnh gốc
                            </div>
                            <div className="flex gap-2 flex-wrap">
                              {images.map((url, idx) => (
                                <a key={idx} href={url} target="_blank" rel="noreferrer">
                                  <Image src={url} width={72} height={72} className="object-cover rounded-lg border border-gray-100 dark:border-white/10" />
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {!readonly && (form?.expenses || []).map((expense, index) => (
                    <div key={`expense-${index}`} className="rounded-xl border border-blue-100 dark:border-blue-500/20 bg-blue-50/40 dark:bg-blue-500/10 p-3 flex items-start gap-3">
                      <div className="grid grid-cols-4 gap-3 flex-1">
                        <Select
                          label="Chuyến"
                          selectedKeys={expense.shipment_id || primaryShipment?.id ? [String(expense.shipment_id || primaryShipment?.id)] : []}
                          onSelectionChange={(keys) => updateExpenseShipment(index, [...keys][0])}
                          variant="bordered"
                          size="sm"
                          startContent={ic(RiTruckLine)}
                        >
                          {shipments.map((s) => (
                            <SelectItem key={String(s.id)}>{`Chuyến #${s.id} · ${s.plate_number || s.driver_name || "Chưa gán"}`}</SelectItem>
                          ))}
                        </Select>
                        <Select
                          label="Loại chi phí"
                          selectedKeys={[expense.expense_type]}
                          onSelectionChange={(keys) => updateExpense(index, "expense_type", [...keys][0])}
                          variant="bordered"
                          size="sm"
                          startContent={ic(RiPriceTag3Line)}
                        >
                          {expenseTypeOptions.map((o) => <SelectItem key={o.value}>{o.label}</SelectItem>)}
                        </Select>
                        <Input
                          label="Số tiền"
                          type="number"
                          min="0"
                          step="0.01"
                          value={expense.amount}
                          onValueChange={(v) => updateExpense(index, "amount", v)}
                          variant="bordered"
                          size="sm"
                          startContent={ic(RiMoneyDollarCircleLine)}
                        />
                        <Input
                          label="Mô tả"
                          placeholder="VD: BOT, gửi xe, khấu hao chuyến..."
                          value={expense.description}
                          onValueChange={(v) => updateExpense(index, "description", v)}
                          variant="bordered"
                          size="sm"
                          startContent={ic(RiFileTextLine)}
                        />
                      </div>
                      <Button isIconOnly size="sm" variant="light" color="danger" onPress={() => removeExpense(index)}>
                        <RiCloseLine size={16} />
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-xl border border-gray-100 dark:border-white/10 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="text-xs text-gray-400 dark:text-gray-400 block">Ghi chú phiếu thu</span>
                      <strong className="text-sm">Thông tin nội bộ cho coordinator</strong>
                    </div>
                    <Chip size="sm" variant="flat">{readonly ? (detail?.request?.status || "-") : "Không bắt buộc"}</Chip>
                  </div>
                  <Textarea
                    value={readonly ? (detail?.request?.coordinator_notes || "") : form?.notes}
                    onValueChange={(v) => updateField("notes", v)}
                    isReadOnly={readonly}
                    minRows={3}
                    placeholder="Ví dụ: đối soát theo km thực tế, thêm chi phí cầu đường..."
                    variant="bordered"
                    startContent={ic(RiFileTextLine)}
                  />
                </div>

                {prepaidPending && (
                  <div className="mt-3 rounded-xl bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/30 p-4">
                    <span className="text-xs text-orange-600 dark:text-orange-400 block">Chưa phát hành được phiếu thu</span>
                    <strong className="text-sm text-orange-900 dark:text-orange-200 block">
                      Đơn khai đã ứng trước {money(prepaidDeclared)} nhưng kế toán chưa xác nhận.
                      Số này chưa được trừ vào tiền khách phải trả — cần xác nhận tiền ứng trước khi chốt phiếu thu.
                    </strong>
                  </div>
                )}

                {companyBorneExpenses > 0 && (
                  <div className="mt-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 p-4 flex items-center justify-between">
                    <div>
                      <span className="text-xs text-amber-600 dark:text-amber-400 block">Chi phí doanh nghiệp chịu</span>
                      <strong className="text-sm text-amber-900 dark:text-amber-200">
                        Chuyến hủy do hàng hóa hư hại — không tính vào tiền khách
                      </strong>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-amber-600 dark:text-amber-400 block">Đã gạt khỏi tổng thu</span>
                      <strong className="text-lg text-amber-900 dark:text-amber-200">{money(companyBorneExpenses)}</strong>
                    </div>
                  </div>
                )}

                {prepaidRefundDue > 0 && (
                  <div className="mt-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20 p-4 flex items-center justify-between">
                    <div>
                      <span className="text-xs text-rose-600 dark:text-rose-400 block">Phải hoàn lại khách</span>
                      <strong className="text-sm text-rose-900 dark:text-rose-200">
                        Khách ứng trước nhiều hơn số phải trả — phát hành phiếu thu sẽ tạo phiếu hoàn
                        để kế toán trả lại toàn bộ phần thừa (không cấn vào nợ cũ của khách)
                      </strong>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-rose-600 dark:text-rose-400 block">Tiền hoàn</span>
                      <strong className="text-lg text-rose-900 dark:text-rose-200">{money(prepaidRefundDue)}</strong>
                    </div>
                  </div>
                )}

                <div className="mt-3 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 p-4 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-blue-500 block">Chuyến dùng để chốt phiếu thu</span>
                    <strong className="text-sm text-blue-900 dark:text-blue-200">{primaryShipment ? `#${primaryShipment.id} · ${primaryShipment.plate_number || primaryShipment.driver_name || "-"}` : "-"}</strong>
                  </div>
                  <div className="text-right">
                    {prepaidAmount > 0 && (
                      <>
                        <span className="text-[11px] text-blue-500 block">Tổng thu {money(finalPrice)}</span>
                        <span className="text-[11px] text-blue-500 block">Đã trả trước −{money(prepaidAmount)}</span>
                      </>
                    )}
                    <span className="text-xs text-blue-500 block">Khách phải trả</span>
                    <strong className="text-lg text-blue-900 dark:text-blue-200">{money(amountDue)}</strong>
                    {amountDue <= 0 && (
                      <span className="text-[11px] text-blue-500 block">Không phải thu của khách</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={onClose}>Đóng</Button>
          {!readonly && (
            // Backend từ chối phát hành khi đơn còn tiền ứng chưa xác nhận — khoá nút ngay
            // ở đây để coordinator không bấm rồi mới nhận lỗi.
            <Button color="primary" isLoading={publishing} isDisabled={prepaidPending} onPress={onPublish}>
              {publishing ? "Đang phát hành..." : "Phát hành phiếu thu"}
            </Button>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
