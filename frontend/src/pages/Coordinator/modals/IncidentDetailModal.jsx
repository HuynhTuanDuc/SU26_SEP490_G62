import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button, Select, SelectItem, Textarea, Input, Checkbox,
} from "@heroui/react";
import {
  RiTruckLine, RiUserLine, RiScales3Line, RiFlag2Line, RiExchangeLine,
  RiFileTextLine, RiMoneyDollarCircleLine, RiBankCardLine, RiUserReceivedLine,
  RiAlertLine, RiArrowGoBackLine,
} from "react-icons/ri";
import { money } from "../../../utils/formatNumber";

const ic = (Icon) => <Icon size={16} className="text-gray-400 dark:text-gray-400 shrink-0" />;

export default function IncidentDetailModal({ open, incident, incidentForm, setIncidentForm, saving, drivers, onClose, onSubmit, compensation, setCompensation, readOnly = false, onResolveFailed, resolvingFailed = false, onCancelDamagedShipment, cancellingDamaged = false }) {
  if (!incident) return null;

  // Sự cố "khách từ chối nhận" sinh tự động khi tài báo giao thất bại. Tài xế đang
  // đứng chờ quyết định của điều phối và không tự chuyển trạng thái được, nên nút
  // xử lý nằm ngay đây thay vì bắt mở màn Đơn hàng.
  const isFailedDelivery = incident.incident_type === "customer_refusal"
    && incident.shipment_status === "failed"
    && Boolean(onResolveFailed) && !readOnly;

  // Sự cố "hàng hóa hư hại": outcome duy nhất hỗ trợ là hủy dứt điểm chuyến (cho phép
  // hủy dù đã lấy hàng). Chỉ hiện khi chuyến còn sống (chưa completed/cancelled) và
  // sự cố chưa được đóng.
  const isCargoDamage = incident.incident_type === "cargo_damage"
    && incident.shipment_status && !["completed", "cancelled"].includes(incident.shipment_status)
    && !["resolved", "closed"].includes(incident.status)
    && Boolean(onCancelDamagedShipment) && !readOnly;

  const replacementOptions = drivers.filter((driver) => {
    if (!driver?.vehicle_id) return false;
    if (driver.has_active_trip) return false;
    return Number(driver.id) !== Number(incident.current_driver_id || incident.reported_by);
  });

  const compensationState = incident.compensation_status ?? "none";
  const hasLiveCompensation = ["pending", "approved", "paid"].includes(compensationState);
  const COMPENSATION_BANNER = {
    pending:  { text: "Khoản đền bù đang chờ Manager duyệt — sự cố tạm khóa ở “đang xử lý”.", cls: "border-amber-200 dark:border-amber-500/25 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300" },
    approved: { text: "Khoản đền bù đã được duyệt, chờ Kế toán chi.", cls: "border-blue-200 dark:border-blue-500/25 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300" },
    paid:     { text: "Khoản đền bù đã được chi.", cls: "border-emerald-200 dark:border-emerald-500/25 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
    rejected: { text: "Khoản đền bù đã bị từ chối.", cls: "border-red-200 dark:border-red-500/25 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300" },
    cancelled: { text: "Khoản đền bù đã được duyệt nhưng bị Kế toán huỷ trước khi chi.", cls: "border-red-200 dark:border-red-500/25 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300" },
  }[compensationState];

  // Đã có phiếu còn hiệu lực → backend chặn tạo trùng, nên ẩn luôn form thay vì để bấm rồi báo lỗi.
  const showCompensation = Boolean(compensation && setCompensation) && !hasLiveCompensation;
  const updateCompensation = (patch) => setCompensation?.((prev) => ({ ...prev, ...patch }));

  // Sự cố có đền bù không được tự đóng: backend ép về 'investigating' và chỉ chuyển sang
  // 'resolved' khi Manager duyệt khoản chi. Khóa luôn ở UI để coordinator không chọn nhầm
  // rồi thấy trạng thái khác với thứ mình vừa chọn.
  const statusLocked = compensationState === "pending" || Boolean(compensation?.enabled);

  return (
    <Modal isOpen={open} onOpenChange={(isOpen) => !isOpen && onClose()} size="2xl" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
              <RiAlertLine size={17} />
            </span>
            <span className="text-base font-bold text-gray-900 dark:text-gray-100">Sự cố #{incident.id}</span>
          </div>
          <span className="text-xs font-normal text-gray-400 dark:text-gray-400">{incident.description || "Không có mô tả."}</span>
        </ModalHeader>
        <ModalBody className="gap-4">
          {isFailedDelivery && (
            <div className="rounded-xl border border-rose-200 dark:border-rose-500/25 bg-rose-50/70 dark:bg-rose-500/[0.07] p-4">
              <div className="flex items-center gap-2 mb-1">
                <RiArrowGoBackLine size={15} className="text-rose-600 dark:text-rose-300" />
                <span className="text-xs font-bold uppercase tracking-wide text-rose-700 dark:text-rose-300">
                  Giao hàng thất bại — cần quyết định
                </span>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-3">
                Liên hệ khách rồi chọn một trong hai. Chọn <b>hoàn hàng</b> thì tài chở hàng về điểm
                lấy và chuyến đó được tính <b>gấp đôi cước</b> (tài chạy cả hai chiều). Sự cố này tự
                chuyển sang “đã giải quyết” ngay sau khi bấm.
              </p>
              <div className="flex flex-wrap gap-2 justify-end">
                <Button
                  size="sm"
                  color="primary"
                  variant="flat"
                  isDisabled={resolvingFailed}
                  onPress={() => onResolveFailed("redeliver")}
                >
                  Cho giao lại
                </Button>
                <Button
                  size="sm"
                  color="danger"
                  isLoading={resolvingFailed}
                  onPress={() => onResolveFailed("return")}
                >
                  Cho hoàn hàng (×2 cước)
                </Button>
              </div>
            </div>
          )}

          {isCargoDamage && (
            <div className="rounded-xl border border-rose-200 dark:border-rose-500/25 bg-rose-50/70 dark:bg-rose-500/[0.07] p-4">
              <div className="flex items-center gap-2 mb-1">
                <RiAlertLine size={15} className="text-rose-600 dark:text-rose-300" />
                <span className="text-xs font-bold uppercase tracking-wide text-rose-700 dark:text-rose-300">
                  Hàng hóa hư hại — cần quyết định
                </span>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-3">
                Nhập lý do vào ô "Phản hồi / ghi chú" bên dưới rồi bấm hủy. Chuyến sẽ bị
                hủy dứt điểm (kể cả khi đã lấy hàng) và sự cố này tự chuyển sang
                “đã giải quyết” ngay sau khi bấm.
              </p>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  color="danger"
                  isLoading={cancellingDamaged}
                  onPress={() => onCancelDamagedShipment(incidentForm.resolution)}
                >
                  Hủy chuyến (hàng hư hỏng)
                </Button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <Input label="Chuyến" value={incident.shipment_id ? `#${incident.shipment_id}` : "-"} isReadOnly variant="bordered" startContent={ic(RiTruckLine)} />
            <Input label="Tài xế báo cáo" value={incident.reported_by_name || "-"} isReadOnly variant="bordered" startContent={ic(RiUserLine)} />
            <Input
              label="Quy tắc doanh thu"
              value={incident.pickup_completed ? "Đã lấy hàng - chia 50/50" : "Chưa lấy hàng - tài xế thay thế nhận 100%"}
              isReadOnly
              variant="bordered"
              startContent={ic(RiScales3Line)}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Select
              label="Trạng thái"
              selectedKeys={[statusLocked ? "investigating" : incidentForm.status]}
              onSelectionChange={(keys) => setIncidentForm((prev) => ({ ...prev, status: [...keys][0] }))}
              isDisabled={readOnly || statusLocked}
              description={statusLocked ? "Khóa tới khi Manager duyệt khoản đền bù" : undefined}
              variant="bordered"
              startContent={ic(RiFlag2Line)}
            >
              <SelectItem key="open">Mới tiếp nhận</SelectItem>
              <SelectItem key="investigating">Đang xử lý</SelectItem>
              <SelectItem key="resolved">Đã giải quyết</SelectItem>
              <SelectItem key="closed">Đã đóng</SelectItem>
            </Select>
            <Select
              label="Tài xế thay thế"
              placeholder="Không đổi tài xế"
              selectedKeys={incidentForm.replacement_driver_id ? [incidentForm.replacement_driver_id] : []}
              onSelectionChange={(keys) => setIncidentForm((prev) => ({ ...prev, replacement_driver_id: [...keys][0] ?? "" }))}
              isDisabled={readOnly}
              variant="bordered"
              startContent={ic(RiExchangeLine)}
            >
              {replacementOptions.map((driver) => (
                <SelectItem key={String(driver.id)}>{`${driver.full_name} - ${driver.plate_number || "Chưa có xe"}`}</SelectItem>
              ))}
            </Select>
            <Input label="Đã thay thế" value={incident.replacement_driver_name || "-"} isReadOnly variant="bordered" startContent={ic(RiUserReceivedLine)} />
          </div>

          <Textarea
            label="Phản hồi / ghi chú"
            placeholder="Nhập cách xử lý hoặc lý do điều chuyển"
            value={incidentForm.resolution}
            onValueChange={(v) => setIncidentForm((prev) => ({ ...prev, resolution: v }))}
            isReadOnly={readOnly}
            minRows={4}
            variant="bordered"
            startContent={ic(RiFileTextLine)}
          />

          {COMPENSATION_BANNER && (
            <div className={`rounded-xl border p-3 text-xs ${COMPENSATION_BANNER.cls}`}>
              <p className="font-semibold">{COMPENSATION_BANNER.text}</p>
              {incident.compensation_amount && (
                <p className="mt-1 opacity-80">
                  {money(Number(incident.compensation_amount))}
                  {incident.compensation_payee ? ` — ${incident.compensation_payee}` : ""}
                </p>
              )}
              {["rejected", "cancelled"].includes(compensationState) && (
                <p className="mt-1">
                  Lý do: {incident.compensation_rejection_reason || "Không ghi rõ"}.
                  {" "}Sửa lại số tiền bên dưới và lưu để gửi duyệt lại.
                </p>
              )}
            </div>
          )}

          {showCompensation && !readOnly && (
            <div className="rounded-xl border border-gray-200 dark:border-white/10 p-4 flex flex-col gap-3">
              <Checkbox
                isSelected={compensation.enabled}
                onValueChange={(v) => updateCompensation(
                  v && !compensation.payee && incident.customer_name
                    ? { enabled: v, payee: incident.customer_name }
                    : { enabled: v }
                )}
                size="sm"
              >
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">Tạo khoản đền bù hàng hóa hư hại</span>
              </Checkbox>
              <p className="text-xs text-gray-400 dark:text-gray-400 -mt-1">
                Khi lưu, hệ thống tạo một phiếu chi loại “Đền bù hàng hóa” (chờ Manager duyệt, Kế toán chi).
                Sự cố giữ ở “đang xử lý” và chỉ tự chuyển sang “đã giải quyết” sau khi Manager duyệt khoản chi.
              </p>

              {compensation.enabled && (
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      type="number"
                      min={0}
                      label="Số tiền đền bù (đồng)"
                      placeholder="0"
                      value={compensation.amount}
                      onValueChange={(v) => updateCompensation({ amount: v })}
                      variant="bordered"
                      isRequired
                      startContent={ic(RiMoneyDollarCircleLine)}
                    />
                    <Select
                      label="Hình thức chi"
                      selectedKeys={[compensation.payment_method]}
                      onSelectionChange={(keys) => updateCompensation({ payment_method: [...keys][0] })}
                      variant="bordered"
                      startContent={ic(RiBankCardLine)}
                    >
                      <SelectItem key="cash">Tiền mặt</SelectItem>
                      <SelectItem key="bank_transfer">Chuyển khoản</SelectItem>
                    </Select>
                  </div>
                  <Input
                    label="Người / đơn vị nhận đền bù"
                    placeholder="VD: Khách hàng, chủ hàng..."
                    value={compensation.payee}
                    onValueChange={(v) => updateCompensation({ payee: v })}
                    variant="bordered"
                    isRequired
                    startContent={ic(RiUserReceivedLine)}
                  />
                  {incident.customer_name && (
                    <div className="flex items-center gap-2 flex-wrap text-xs -mt-1">
                      <span className="text-gray-500 dark:text-gray-400">
                        Khách hàng của đơn{incident.order_id ? ` #${incident.order_id}` : ""}:
                      </span>
                      <Button
                        size="sm"
                        variant="flat"
                        color="primary"
                        className="h-7"
                        onPress={() => updateCompensation({ payee: incident.customer_name })}
                      >
                        Dùng “{incident.customer_name}”
                      </Button>
                    </div>
                  )}
                  <Textarea
                    label="Mô tả hàng hóa hư hại"
                    placeholder="Mô tả thiệt hại làm căn cứ đền bù"
                    value={compensation.reason}
                    onValueChange={(v) => updateCompensation({ reason: v })}
                    minRows={2}
                    variant="bordered"
                    startContent={ic(RiFileTextLine)}
                  />
                </div>
              )}
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={onClose}>Đóng</Button>
          {!readOnly && <Button color="primary" isLoading={saving} onPress={onSubmit}>Lưu xử lý</Button>}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
