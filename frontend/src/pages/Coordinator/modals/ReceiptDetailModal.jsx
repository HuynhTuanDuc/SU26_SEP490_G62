import { useEffect, useState } from "react";
import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button, Input, Select, SelectItem, Textarea, Chip, Spinner, Image,
} from "@heroui/react";
import { RiAddLine, RiCloseLine, RiCheckLine, RiErrorWarningLine, RiImageLine, RiLoader4Line } from "react-icons/ri";
import { StatusBadge } from "../../../components/shared-ui/StatusBadge";
import { coordinatorService } from "../services/coordinator.service";
import { expenseTypeOptions, formatCurrency, normalizeStatus } from "../utils";

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
      .catch(() => {})
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
  const passThroughExpenses = [...(detail?.expenses || []), ...(form?.expenses || [])]
    .filter((expense) => expense.status !== "rejected" && ["parking", "toll", "etc"].includes(String(expense.expense_type || "").trim()))
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const finalPrice = actualRevenue + passThroughExpenses;

  return (
    <Modal isOpen={open} onOpenChange={(isOpen) => !isOpen && onClose()} size="5xl" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <span className="text-base font-bold text-gray-900">{readonly ? "Chi tiết phiếu thu" : "Tạo phiếu thu"}</span>
          <span className="text-xs font-normal text-gray-400">
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
                  <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Khách hàng</div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><span className="text-xs text-gray-400 block">Khách hàng</span><strong>{detail.customer?.full_name || "Khách lẻ"}</strong></div>
                    <div><span className="text-xs text-gray-400 block">Số điện thoại</span><strong>{detail.customer?.phone || "-"}</strong></div>
                    <div><span className="text-xs text-gray-400 block">Công ty</span><strong>{detail.customer?.company_name || "-"}</strong></div>
                    <div><span className="text-xs text-gray-400 block">Tài xế</span><strong>{detail.request?.driver_name || "-"}</strong></div>
                    <div><span className="text-xs text-gray-400 block">Đơn hàng</span><strong>#{detail.order?.id || "-"}</strong></div>
                    <div><span className="text-xs text-gray-400 block">Số chuyến</span><strong>{shipments.length || 0}</strong></div>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Thông tin đơn hàng</div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><span className="text-xs text-gray-400 block">Hàng hóa</span><strong>{detail.order?.cargo_name || "-"}</strong></div>
                    <div><span className="text-xs text-gray-400 block">Khối lượng</span><strong>{detail.order?.cargo_weight_kg ? `${detail.order.cargo_weight_kg} kg` : "-"}</strong></div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {shipments.map((shipment) => (
                  <div key={shipment.id} className="rounded-xl border border-gray-100 p-4 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <strong className="text-sm">Chuyến #{shipment.id} · {shipment.shipment_index || "-"}</strong>
                      <StatusBadge status={shipment.status} />
                    </div>
                    <div className="grid grid-cols-4 gap-3 text-sm">
                      <div><span className="text-xs text-gray-400 block">Tài xế</span><strong>{shipment.driver_name || "-"}</strong></div>
                      <div><span className="text-xs text-gray-400 block">Biển số</span><strong>{shipment.plate_number || "-"}</strong></div>
                      <div><span className="text-xs text-gray-400 block">Nhóm xe</span><strong>{shipment.vehicle_group_name || "-"}</strong></div>
                      <div><span className="text-xs text-gray-400 block">Đơn giá/km</span><strong>{formatCurrency(shipment.price_per_km)}</strong></div>
                      <div><span className="text-xs text-gray-400 block">KM thực tế</span><strong>{shipment.actual_km ? `${shipment.actual_km} km` : "-"}</strong></div>
                      {!readonly && primaryShipment && shipment.id === primaryShipment.id ? (
                        <div>
                          <span className="text-xs text-gray-400 block">Doanh thu (có thể sửa)</span>
                          <Input
                            type="number"
                            min="0"
                            step="1000"
                            size="sm"
                            variant="bordered"
                            placeholder={`Gợi ý: ${formatCurrency(shipment.actual_revenue || shipment.actual_price || 0)}`}
                            value={form?.priceOverride ?? ""}
                            onValueChange={(v) => updateField("priceOverride", v)}
                          />
                        </div>
                      ) : (
                        <div><span className="text-xs text-gray-400 block">Doanh thu</span><strong>{formatCurrency(shipment.actual_revenue || shipment.actual_price || 0)}</strong></div>
                      )}
                      <div className="col-span-2"><span className="text-xs text-gray-400 block">Lộ trình</span><strong>{formatRouteLabel(shipment)}</strong></div>
                      <div><span className="text-xs text-gray-400 block">Chi phí chuyến</span><strong>{formatCurrency(shipment.total_expenses)}</strong></div>
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">{readonly ? "Thông tin phiếu thu" : "Chi phí & phát hành"}</div>
                    <p className="text-xs text-gray-400 mt-1">
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
                    return (
                      <div key={expense.id} className="rounded-xl border border-gray-100 p-3 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <strong className="text-sm">{expenseTypeOptions.find((o) => o.value === expense.expense_type)?.label || expense.expense_type}</strong>
                            <span className="ml-2 text-xs text-gray-400">
                              {expense.description || "Chi phí đã ghi nhận"}{expense.shipment_id ? ` · Chuyến #${expense.shipment_id}` : ""}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {hasImage && (
                              ocrLoading && !ocr ? (
                                <Chip size="sm" variant="flat" color="primary" startContent={<RiLoader4Line size={12} className="animate-spin" />}>Đang quét</Chip>
                              ) : ocr?.valid === true ? (
                                <Chip size="sm" variant="flat" color="success" startContent={<RiCheckLine size={12} />}>Hợp lệ</Chip>
                              ) : ocr?.valid === false ? (
                                <Chip size="sm" variant="flat" color="danger" startContent={<RiErrorWarningLine size={12} />}>Không khớp</Chip>
                              ) : null
                            )}
                            {!hasImage && (
                              <Chip size="sm" variant="flat" startContent={<RiImageLine size={12} />}>Chưa có ảnh</Chip>
                            )}
                            <strong className="text-sm">{formatCurrency(expense.amount)}</strong>
                          </div>
                        </div>
                        {hasImage && (
                          <div className="flex gap-2 flex-wrap">
                            {images.map((url, idx) => (
                              <Image key={idx} src={url} width={72} height={72} className="object-cover rounded-lg border border-gray-100" />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {!readonly && (form?.expenses || []).map((expense, index) => (
                    <div key={`expense-${index}`} className="rounded-xl border border-blue-100 bg-blue-50/40 p-3 flex items-start gap-3">
                      <div className="grid grid-cols-4 gap-3 flex-1">
                        <Select
                          label="Chuyến"
                          selectedKeys={expense.shipment_id || primaryShipment?.id ? [String(expense.shipment_id || primaryShipment?.id)] : []}
                          onSelectionChange={(keys) => updateExpenseShipment(index, [...keys][0])}
                          variant="bordered"
                          size="sm"
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
                        />
                        <Input
                          label="Mô tả"
                          placeholder="VD: BOT, gửi xe, khấu hao chuyến..."
                          value={expense.description}
                          onValueChange={(v) => updateExpense(index, "description", v)}
                          variant="bordered"
                          size="sm"
                        />
                      </div>
                      <Button isIconOnly size="sm" variant="light" color="danger" onPress={() => removeExpense(index)}>
                        <RiCloseLine size={16} />
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-xl border border-gray-100 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="text-xs text-gray-400 block">Ghi chú phiếu thu</span>
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
                  />
                </div>

                <div className="mt-3 rounded-xl bg-blue-50 border border-blue-100 p-4 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-blue-500 block">Chuyến dùng để chốt phiếu thu</span>
                    <strong className="text-sm text-blue-900">{primaryShipment ? `#${primaryShipment.id} · ${primaryShipment.plate_number || primaryShipment.driver_name || "-"}` : "-"}</strong>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-blue-500 block">Tổng thu</span>
                    <strong className="text-lg text-blue-900">{formatCurrency(finalPrice)}</strong>
                  </div>
                </div>
              </div>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={onClose}>Đóng</Button>
          {!readonly && (
            <Button color="primary" isLoading={publishing} onPress={onPublish}>
              {publishing ? "Đang phát hành..." : "Phát hành phiếu thu"}
            </Button>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
