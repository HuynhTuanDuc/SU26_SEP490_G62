import { useEffect, useState } from "react";
import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button, Chip, Spinner, Divider,
} from "@heroui/react";
import {
  RiFileList3Line, RiMapPin2Line, RiArrowRightLine,
  RiTruckLine, RiUserLine, RiPhoneLine, RiBuildingLine,
  RiCheckboxCircleLine, RiTimeLine, RiCalendarLine,
  RiMoneyDollarCircleLine, RiBox2Line, RiScalesLine,
} from "react-icons/ri";
import { MoneyText } from "../components/shared/MoneyText";
import { accountantService } from "../services/accountant.service";

const PAYMENT_LABELS = {
  cash:          "Tiền mặt",
  bank_transfer: "Chuyển khoản",
  client_credit: "Ghi nợ khách",
};

const DEBT_STATUS = {
  paid:    { label: "Đã thu đủ",    color: "success" },
  partial: { label: "Thu 1 phần",   color: "warning" },
  unpaid:  { label: "Chưa thu",     color: "danger"  },
};

// driver_payment_state = debts.status từ BE
const DRIVER_STATE = {
  paid:    { label: "Đã nộp về công ty", color: "text-emerald-600", bg: "bg-emerald-50", icon: RiCheckboxCircleLine },
  partial: { label: "Nộp 1 phần",        color: "text-orange-600",  bg: "bg-orange-50",  icon: RiTimeLine           },
  unpaid:  { label: "TX đang giữ tiền",  color: "text-amber-600",   bg: "bg-amber-50",   icon: RiTimeLine           },
};

function InfoRow({ icon: Icon, label, value, mono }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2.5">
      <Icon size={14} className="text-gray-400 flex-shrink-0" />
      <span className="text-xs text-gray-400 w-24 flex-shrink-0">{label}</span>
      <span className={`text-sm font-medium text-gray-800 ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function ShipmentCard({ s, index }) {
  const pickup   = s.pickup_addresses?.[0]?.address ?? s.pickup_address ?? "—";
  const delivery = s.delivery_address ?? "—";
  const state    = DRIVER_STATE[s.driver_payment_state] ?? { label: "Không có nợ TX", color: "text-gray-400", bg: "bg-gray-50", icon: RiTimeLine };
  const StateIcon = state.icon;

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50/80 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full
                           bg-blue-100 text-[10px] font-bold text-blue-600">
            {index}
          </span>
          <span className="text-xs font-semibold text-gray-600">Chuyến {index}</span>
        </div>
        <div className="flex items-center gap-2">
          {s.actual_price != null ? (
            <MoneyText amount={s.actual_price} className="text-sm font-bold text-gray-800" />
          ) : s.cargo_fee != null ? (
            <span className="flex flex-col items-end">
              <MoneyText amount={s.cargo_fee} className="text-sm font-bold text-gray-800" />
              <span className="text-[9px] text-gray-400">ước tính</span>
            </span>
          ) : null}
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-3 flex flex-col gap-2.5">
        {/* Route */}
        <div className="flex items-start gap-1.5 text-xs text-gray-600">
          <RiMapPin2Line size={13} className="text-green-500 flex-shrink-0 mt-0.5" />
          <span className="flex-1">{pickup}</span>
          <RiArrowRightLine size={12} className="text-gray-300 flex-shrink-0 mx-1 mt-0.5" />
          <RiMapPin2Line size={13} className="text-red-400 flex-shrink-0 mt-0.5" />
          <span className="flex-1">{delivery}</span>
        </div>

        <Divider className="my-0" />

        {/* Driver + payment state */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <RiTruckLine size={13} className="text-gray-400" />
            <div className="flex flex-col">
              <span className="text-xs font-medium text-gray-700">{s.driver_name ?? "Chưa có tài xế"}</span>
              {s.vehicle_plate && (
                <span className="text-[10px] text-gray-400 font-mono">{s.vehicle_plate}</span>
              )}
            </div>
          </div>
          <div className={`flex items-center gap-1 px-2 py-1 rounded-lg ${state.bg}`}>
            <StateIcon size={12} className={state.color} />
            <span className={`text-[11px] font-semibold ${state.color}`}>{state.label}</span>
            {s.driver_total != null && (
              <MoneyText amount={s.driver_total} className={`text-[11px] ${state.color} ml-1`} />
            )}
          </div>
        </div>

        {/* Cargo info */}
        {(s.cargo_name || s.cargo_weight) && (
          <div className="flex items-center gap-3 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-1.5">
            {s.cargo_name && (
              <span className="flex items-center gap-1">
                <RiBox2Line size={12} className="shrink-0" />
                {s.cargo_name}
              </span>
            )}
            {s.cargo_weight && (
              <span className="flex items-center gap-1">
                <RiScalesLine size={12} className="shrink-0" />
                {s.cargo_weight} kg
              </span>
            )}
          </div>
        )}

        {/* Expenses */}
        {Number(s.total_expenses) > 0 && (
          <div className="flex items-center justify-between bg-orange-50 rounded-lg px-3 py-1.5">
            <span className="text-[11px] text-orange-500 font-medium">Chi phí phát sinh</span>
            <MoneyText amount={s.total_expenses} className="text-[11px] font-bold text-orange-600" />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * @param {{ isOpen: boolean, onClose: () => void, order: object|null }} props
 */
export function OrderDetailModal({ isOpen, onClose, order }) {
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading]     = useState(false);

  useEffect(() => {
    if (!isOpen || !order?.id) { setShipments([]); return; }
    setLoading(true);
    accountantService.getOrderShipments(order.id)
      .then((data) => setShipments(Array.isArray(data) ? data : []))
      .catch(() => setShipments([]))
      .finally(() => setLoading(false));
  }, [isOpen, order?.id]);

  if (!order) return null;

  const date = order.created_at
    ? new Date(order.created_at).toLocaleDateString("vi-VN", {
        day: "2-digit", month: "2-digit", year: "numeric",
      })
    : null;

  const debtChip = DEBT_STATUS[order.debt_status];
  const totalRevenue = order.actual_price ?? order.estimated_price;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="2xl" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader className="flex items-center gap-3 pb-2">
          <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
            <RiFileList3Line size={18} className="text-blue-600" />
          </div>
          <div>
            <p className="text-base font-bold">Chi tiết đơn #{order.id}</p>
            <p className="text-xs font-normal text-gray-400">
              {order.cargo_name ?? "Đơn hàng"}
              {date ? ` · ${date}` : ""}
            </p>
          </div>
        </ModalHeader>

        <ModalBody className="gap-4">
          {/* Customer + Revenue summary */}
          <div className="grid grid-cols-2 gap-4">
            {/* Customer */}
            <div className="flex flex-col gap-2 p-4 bg-gray-50 rounded-2xl border border-gray-100">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">
                Khách hàng
              </span>
              <InfoRow icon={RiUserLine}     label="Tên"     value={order.customer_name} />
              <InfoRow icon={RiPhoneLine}    label="SĐT"     value={order.customer_phone} mono />
              <InfoRow icon={RiBuildingLine} label="Công ty" value={order.customer_company} />
              <InfoRow icon={RiCalendarLine} label="Ngày tạo" value={date} />
            </div>

            {/* Revenue */}
            <div className="flex flex-col gap-2 p-4 bg-gray-50 rounded-2xl border border-gray-100">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">
                Tài chính
              </span>
              <div className="flex items-center gap-2">
                <RiMoneyDollarCircleLine size={14} className="text-gray-400" />
                <span className="text-xs text-gray-400 w-24">Tổng cước</span>
                <div className="flex flex-col">
                  <MoneyText amount={totalRevenue} className="text-sm font-bold text-gray-800" />
                  {order.actual_price == null && <span className="text-[9px] text-gray-400">ước tính</span>}
                </div>
              </div>
              <InfoRow
                icon={RiMoneyDollarCircleLine}
                label="Thanh toán"
                value={PAYMENT_LABELS[order.payment_type] ?? order.payment_type}
              />
              {debtChip && (
                <div className="flex items-center gap-2.5 mt-1">
                  <span className="text-[9px] w-[110px]" />
                  <Chip size="sm" color={debtChip.color} variant="flat" className="text-[11px] h-5">
                    {debtChip.label}
                  </Chip>
                </div>
              )}
              {Number(order.driver_debt_remaining) > 0 && (
                <div className="flex items-center gap-2.5">
                  <RiTimeLine size={14} className="text-amber-400" />
                  <span className="text-xs text-amber-600 font-medium">
                    TX đang giữ: <MoneyText amount={order.driver_debt_remaining} className="font-bold" />
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2 pt-1">
                <RiTruckLine size={14} className="text-gray-400" />
                <span className="text-xs text-gray-400 w-24">Số chuyến</span>
                <span className="text-sm font-semibold text-gray-700">{order.shipment_count ?? 0} chuyến</span>
              </div>
            </div>
          </div>

          <Divider />

          {/* Shipments */}
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">
              Danh sách chuyến ({order.shipment_count ?? 0})
            </span>

            {loading ? (
              <div className="flex justify-center py-8">
                <Spinner size="md" color="primary" label="Đang tải..." />
              </div>
            ) : shipments.length === 0 ? (
              <p className="text-sm text-gray-400 italic text-center py-4">Không có chuyến xe nào.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {shipments.map((s, i) => (
                  <ShipmentCard key={s.id} s={s} index={s.shipment_index ?? i + 1} />
                ))}
              </div>
            )}
          </div>
        </ModalBody>

        <ModalFooter>
          <Button variant="light" onPress={onClose}>Đóng</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
