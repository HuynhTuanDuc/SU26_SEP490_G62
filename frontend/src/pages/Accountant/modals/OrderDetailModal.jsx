import { useEffect, useState } from "react";
import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button, Chip, Spinner, Divider, Textarea,
} from "@heroui/react";
import {
  RiFileList3Line, RiMapPin2Line, RiArrowRightLine,
  RiTruckLine, RiUserLine, RiPhoneLine, RiBuildingLine,
  RiCheckboxCircleLine, RiTimeLine, RiCalendarLine,
  RiMoneyDollarCircleLine, RiBox2Line, RiScalesLine,
  RiBankCardLine, RiCheckLine, RiImageLine,
  RiArrowUpLine, RiArrowDownLine,
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

// ── Lightbox ──────────────────────────────────────────────────────────────────
function Lightbox({ url, onClose }) {
  if (!url) return null;
  return (
    <div
      className="fixed inset-0 bg-black/80 z-[999] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <img src={url} alt="Biên lai" className="max-w-full max-h-full rounded-xl shadow-2xl" onClick={e => e.stopPropagation()} />
    </div>
  );
}

// ── Bank-transfer confirm panel (inside ShipmentCard) ─────────────────────────
const fmtVND = (v) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(Number(v));

function BankTransferPanel({ s, onConfirmed }) {
  const [actualAmount, setActualAmount] = useState(
    s.receipt_amount != null ? String(s.receipt_amount) : ""
  );
  const [notes,        setNotes]        = useState("");
  const [lightboxUrl,  setLightboxUrl]  = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);
  const [confirmed,    setConfirmed]    = useState(s.bank_confirmed);
  const [confirmResult, setConfirmResult] = useState(null);

  if (!s.receipt_payment_type || s.receipt_payment_type !== "bank_transfer") return null;

  const receiptAmt  = Number(s.receipt_amount ?? 0);
  const actualNum   = Number(actualAmount.replace(/[^\d.]/g, "")) || 0;
  const diff        = actualNum - receiptAmt;
  const isShort     = diff < -0.01;
  const isExcess    = diff > 0.01;
  const amountValid = actualNum >= 0 && actualAmount.trim() !== "";

  const handleConfirm = async () => {
    if (!amountValid) { setError("Vui lòng nhập số tiền thực nhận"); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await accountantService.confirmBankTransfer(s.receipt_id, notes || undefined, actualNum);
      setConfirmed(true);
      setConfirmResult(res);
      onConfirmed?.();
    } catch (err) {
      setError(err.message ?? "Xác nhận thất bại");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`mt-2 rounded-xl border p-3 ${confirmed ? "bg-emerald-50 border-emerald-200" : "bg-orange-50 border-orange-200"}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <RiBankCardLine size={13} className={confirmed ? "text-emerald-600" : "text-orange-500"} />
          <span className={`text-xs font-semibold ${confirmed ? "text-emerald-700" : "text-orange-700"}`}>
            Chuyển khoản về công ty
          </span>
          {s.receipt_amount && (
            <span className="text-[11px] text-gray-500 font-mono">· {fmtVND(s.receipt_amount)}</span>
          )}
        </div>
        {confirmed ? (
          <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600">
            <RiCheckLine size={12} /> Đã xác nhận
          </span>
        ) : (
          <span className="text-[11px] font-semibold text-orange-600">Chờ xác nhận</span>
        )}
      </div>

      {/* Proof thumbnails */}
      {s.proof_urls?.length > 0 ? (
        <div className="flex gap-1.5 mb-2 flex-wrap">
          {s.proof_urls.map((url, i) => (
            <button key={i} onClick={() => setLightboxUrl(url)}
              className="w-14 h-14 rounded-lg overflow-hidden border border-white shadow-sm hover:ring-2 hover:ring-blue-400 flex-shrink-0">
              <img src={url} alt={`Biên lai ${i + 1}`} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-1 text-gray-400 text-xs mb-2">
          <RiImageLine size={12} /> Không có ảnh biên lai
        </div>
      )}

      {/* Result after confirm */}
      {confirmed && confirmResult && (
        <div className={`rounded-lg px-3 py-2 text-xs mt-1 ${
          confirmResult.action === "short"  ? "bg-red-50 text-red-700" :
          confirmResult.action === "excess" ? "bg-blue-50 text-blue-700" :
          "bg-emerald-100 text-emerald-700"
        }`}>
          {confirmResult.action === "short"  && `Khách trả thiếu ${fmtVND(Math.abs(confirmResult.diff))} — đã tạo công nợ khách hàng`}
          {confirmResult.action === "excess" && `Khách trả thừa ${fmtVND(confirmResult.diff)} — đã phân bổ vào nợ cũ`}
          {confirmResult.action === "exact"  && "Khách trả đủ — đã xác nhận"}
        </div>
      )}

      {/* Confirm form */}
      {!confirmed && (
        <div className="flex flex-col gap-2">
          {/* Amount input */}
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1 block">
              Số tiền thực nhận được
            </label>
            <input
              type="number"
              min="0"
              value={actualAmount}
              onChange={e => setActualAmount(e.target.value)}
              placeholder={String(receiptAmt)}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-mono
                         focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            {/* Diff hint */}
            {amountValid && actualNum !== receiptAmt && (
              <div className={`flex items-center gap-1 text-[11px] mt-1 font-semibold
                ${isShort ? "text-red-600" : "text-blue-600"}`}>
                {isShort
                  ? <><RiArrowDownLine size={12} /> Thiếu {fmtVND(Math.abs(diff))} — sẽ tạo công nợ khách</>
                  : <><RiArrowUpLine   size={12} /> Thừa {fmtVND(diff)} — sẽ phân bổ vào nợ cũ của khách</>
                }
              </div>
            )}
            {amountValid && Math.abs(diff) <= 0.01 && (
              <p className="text-[11px] mt-1 text-emerald-600 font-semibold">Khớp đúng số tiền phiếu thu</p>
            )}
          </div>

          <Textarea
            placeholder="Ghi chú (tuỳ chọn)..."
            value={notes}
            onValueChange={setNotes}
            minRows={1}
            size="sm"
          />

          {error && <p className="text-red-500 text-xs">{error}</p>}

          <Button
            size="sm" color="success" fullWidth
            onPress={handleConfirm} isLoading={loading}
            isDisabled={!amountValid}
            startContent={!loading && <RiCheckLine size={13} />}
          >
            Xác nhận đã nhận tiền
          </Button>
        </div>
      )}

      <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </div>
  );
}

function ShipmentCard({ s, index, onBankConfirmed }) {
  const pickup   = (s.pickup_addresses || []).map((p) => p?.address).filter(Boolean).join(", ") || s.pickup_address || "—";
  const delivery = (s.delivery_addresses || []).map((d) => d?.address).filter(Boolean).join(", ") || s.delivery_address || "—";
  const state    = DRIVER_STATE[s.driver_payment_state] ?? { label: "Không có nợ TX", color: "text-gray-400", bg: "bg-gray-50", icon: RiTimeLine };
  const StateIcon = state.icon;

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      {}
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
            <span className="flex flex-col items-end">
              <MoneyText amount={s.total_customer_due || s.actual_price} className="text-sm font-bold text-gray-800" />
              {Number(s.pass_through_total) > 0 && (
                <span className="text-[10px] text-gray-400">
                  cước {Number(s.actual_price).toLocaleString("vi-VN")} + PT {Number(s.pass_through_total).toLocaleString("vi-VN")}
                </span>
              )}
            </span>
          ) : s.cargo_fee != null ? (
            <span className="flex flex-col items-end">
              <MoneyText amount={s.cargo_fee} className="text-sm font-bold text-gray-800" />
              <span className="text-[9px] text-gray-400">ước tính</span>
            </span>
          ) : null}
        </div>
      </div>

      {}
      <div className="px-4 py-3 flex flex-col gap-2.5">
        {}
        <div className="flex items-start gap-1.5 text-xs text-gray-600">
          <RiMapPin2Line size={13} className="text-green-500 flex-shrink-0 mt-0.5" />
          <span className="flex-1">{pickup}</span>
          <RiArrowRightLine size={12} className="text-gray-300 flex-shrink-0 mx-1 mt-0.5" />
          <RiMapPin2Line size={13} className="text-red-400 flex-shrink-0 mt-0.5" />
          <span className="flex-1">{delivery}</span>
        </div>

        <Divider className="my-0" />

        {}
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
              s.driver_payment_state === "partial" ? (
                <span className={`text-[11px] ${state.color} ml-1`}>
                  còn <MoneyText amount={Math.max(0, Number(s.driver_total) - Number(s.driver_paid || 0))} />
                  {" / "}<MoneyText amount={s.driver_total} />
                </span>
              ) : (
                <MoneyText amount={s.driver_total} className={`text-[11px] ${state.color} ml-1`} />
              )
            )}
          </div>
        </div>

        {}
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

        {}
        {Number(s.pass_through_total) > 0 && (
          <div className="flex items-center justify-between bg-blue-50 rounded-lg px-3 py-1.5">
            <span className="text-[11px] text-blue-600 font-medium">BOT / Parking / Phà (khách chịu)</span>
            <MoneyText amount={s.pass_through_total} className="text-[11px] font-bold text-blue-700" />
          </div>
        )}
        {Number(s.expenses?.fuel) > 0 && (
          <div className="flex items-center justify-between bg-orange-50 rounded-lg px-3 py-1.5">
            <span className="text-[11px] text-orange-500 font-medium">Xăng dầu (công ty chịu)</span>
            <MoneyText amount={s.expenses.fuel} className="text-[11px] font-bold text-orange-600" />
          </div>
        )}
        {(Number(s.total_expenses) - Number(s.pass_through_total) - Number(s.expenses?.fuel)) > 0.5 && (
          <div className="flex items-center justify-between bg-orange-50 rounded-lg px-3 py-1.5">
            <span className="text-[11px] text-orange-500 font-medium">Chi phí khác (công ty chịu)</span>
            <MoneyText
              amount={Number(s.total_expenses) - Number(s.pass_through_total) - Number(s.expenses?.fuel)}
              className="text-[11px] font-bold text-orange-600"
            />
          </div>
        )}

        {/* Bank transfer confirmation panel */}
        <BankTransferPanel s={s} onConfirmed={onBankConfirmed} />
      </div>
    </div>
  );
}

export function OrderDetailModal({ isOpen, onClose, order }) {
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading]     = useState(false);

  const loadShipments = () => {
    if (!order?.id) return;
    setLoading(true);
    accountantService.getOrderShipments(order.id)
      .then((data) => setShipments(Array.isArray(data) ? data : []))
      .catch(() => setShipments([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!isOpen || !order?.id) { setShipments([]); return; }
    loadShipments();
  }, [isOpen, order?.id]);

  if (!order) return null;

  const date = order.created_at
    ? new Date(order.created_at).toLocaleDateString("vi-VN", {
        day: "2-digit", month: "2-digit", year: "numeric",
      })
    : null;

  const debtChip = DEBT_STATUS[order.debt_status];
  const totalRevenue = order.actual_price ?? order.estimated_price;
  const totalPassThrough = shipments.reduce((sum, s) => sum + (Number(s.pass_through_total) || 0), 0);
  const totalCustomerDue = (Number(totalRevenue) || 0) + totalPassThrough;

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
          {}
          <div className="grid grid-cols-2 gap-4">
            {}
            <div className="flex flex-col gap-2 p-4 bg-gray-50 rounded-2xl border border-gray-100">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">
                Khách hàng
              </span>
              <InfoRow icon={RiUserLine}     label="Tên"     value={order.customer_name} />
              <InfoRow icon={RiPhoneLine}    label="SĐT"     value={order.customer_phone} mono />
              <InfoRow icon={RiBuildingLine} label="Công ty" value={order.customer_company} />
              <InfoRow icon={RiCalendarLine} label="Ngày tạo" value={date} />
            </div>

            {}
            <div className="flex flex-col gap-2 p-4 bg-gray-50 rounded-2xl border border-gray-100">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">
                Tài chính
              </span>
              <div className="flex items-center gap-2">
                <RiMoneyDollarCircleLine size={14} className="text-gray-400" />
                <span className="text-xs text-gray-400 w-24">Thực thu khách</span>
                <div className="flex flex-col">
                  <MoneyText amount={totalCustomerDue} className="text-sm font-bold text-gray-800" />
                  {order.actual_price == null && <span className="text-[9px] text-gray-400">ước tính</span>}
                  {totalPassThrough > 0 && (
                    <span className="text-[9px] text-gray-400">
                      cước {Number(totalRevenue).toLocaleString("vi-VN")} + PT {totalPassThrough.toLocaleString("vi-VN")}
                    </span>
                  )}
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

          {}
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
                  <ShipmentCard
                    key={s.id}
                    s={s}
                    index={s.shipment_index ?? i + 1}
                    onBankConfirmed={loadShipments}
                  />
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
