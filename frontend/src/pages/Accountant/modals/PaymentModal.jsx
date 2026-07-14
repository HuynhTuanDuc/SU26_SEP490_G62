import { useState, useEffect, useCallback } from "react";
import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button, Input, Select, SelectItem, Divider, Spinner, Chip,
} from "@heroui/react";
import {
  RiBankCard2Line, RiHistoryLine, RiCheckboxCircleLine,
  RiAlertLine, RiArrowRightLine,
} from "react-icons/ri";
import { accountantService } from "../services/accountant.service";
import { MoneyText } from "../components/shared/MoneyText";

const PAYMENT_METHODS = [
  { key: "cash",          label: "Tiền mặt" },
  { key: "bank_transfer", label: "Chuyển khoản" },
];

const METHOD_LABEL = {
  cash:          "Tiền mặt",
  bank_transfer: "Chuyển khoản",
  offset:        "Cấn trừ",
};

const PAYMENT_STATUS_CHIP = {
  confirmed: { label: "Đã xác nhận",  color: "success" },
  pending:   { label: "Chờ xác nhận", color: "warning" },
  rejected:  { label: "Từ chối",      color: "danger"  },
  voided:    { label: "Đã hủy",       color: "default" },
};

function HistoryItem({ payment, onVoid }) {
  const rawDate = payment.paid_at ?? payment.confirmed_at ?? payment.created_at;
  const date = rawDate
    ? new Date(rawDate).toLocaleDateString("vi-VN", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : "—";
  const statusChip = PAYMENT_STATUS_CHIP[payment.payment_status] ?? PAYMENT_STATUS_CHIP.confirmed;

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0">
      <div className="flex flex-col gap-0.5">
        <MoneyText amount={payment.amount} className="text-xs font-bold text-emerald-600" />
        <span className="text-[11px] text-gray-400">
          {METHOD_LABEL[payment.payment_method] ?? payment.payment_method ?? "—"} · {date}
          {payment.creator_name ? ` · ghi bởi ${payment.creator_name}` : ""}
        </span>
        {payment.notes && (
          <span className="text-[11px] text-gray-400 italic">{payment.notes}</span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <Chip size="sm" color={statusChip.color} variant="flat" className="text-[10px] h-5">
          <RiCheckboxCircleLine size={10} className="inline mr-0.5" />
          {statusChip.label}
        </Chip>
        {payment.payment_status === "confirmed" && onVoid && (
          <Button size="sm" variant="light" color="danger" className="h-5 min-w-0 px-2 text-[10px]"
            onPress={() => onVoid(payment)}>
            Hủy
          </Button>
        )}
      </div>
    </div>
  );
}

function AllocationRow({ alloc, isCurrentOrder }) {
  const statusColor = {
    paid:    "success",
    partial: "warning",
    unpaid:  "danger",
  }[alloc.newStatus] ?? "default";

  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-1.5 min-w-0">
        <RiArrowRightLine size={11} className="text-gray-400 shrink-0" />
        <span className="text-[11px] text-gray-600 truncate">
          Đơn #{alloc.orderId}
          {isCurrentOrder && (
            <span className="ml-1 text-[10px] text-blue-500 font-medium">(đơn này)</span>
          )}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <MoneyText amount={alloc.allocated} className="text-[11px] font-bold text-emerald-700" />
        <Chip size="sm" color={statusColor} variant="flat" className="text-[10px] h-4 px-1">
          {alloc.newStatus === "paid" ? "Xong" : alloc.newStatus === "partial" ? "Một phần" : "Còn nợ"}
        </Chip>
      </div>
    </div>
  );
}

export function PaymentModal({ isOpen, onClose, order, onPaymentRecorded }) {
  const [amount, setAmount]        = useState("");
  const [method, setMethod]        = useState(new Set(["cash"]));
  const [notes, setNotes]          = useState("");
  const [submitting, setSubmit]    = useState(false);
  const [error, setError]          = useState(null);
  const [history, setHistory]      = useState([]);
  const [histLoading, setHistL]    = useState(false);
  const [customerDebt, setCustDebt] = useState(null);
  const [debtLoading, setDebtL]    = useState(false);
  const [result, setResult]        = useState(null);

  // Hủy xác nhận khoản đã confirmed — nợ hồi phục + hệ thống tự ghi bút toán đảo
  const handleVoidPayment = async (payment) => {
    const reason = window.prompt(
      `Hủy xác nhận khoản ${Number(payment.amount).toLocaleString("vi-VN")}đ?\nNhập lý do (bắt buộc):`
    );
    if (!reason?.trim()) return;
    try {
      await accountantService.voidRepayment(payment.id, reason.trim());
      await loadData();
      onPaymentRecorded?.();
    } catch (err) {
      setError(err.message ?? "Hủy xác nhận thất bại");
    }
  };

  const loadData = useCallback(async () => {
    if (!order?.id) return;

    setHistL(true);
    setDebtL(true);

    const [histData, debtData] = await Promise.allSettled([
      accountantService.getPayments(order.id),
      accountantService.getCustomerDebt(order.id),
    ]);

    setHistory(histData.status === "fulfilled" && Array.isArray(histData.value)
      ? histData.value : []);
    setCustDebt(debtData.status === "fulfilled" ? debtData.value : null);
    setHistL(false);
    setDebtL(false);
  }, [order?.id]);

  useEffect(() => {
    if (isOpen) {
      setAmount("");
      setMethod(new Set(["cash"]));
      setNotes("");
      setError(null);
      setResult(null);
      loadData();
    }
  }, [isOpen, loadData]);

  const totalOutstanding = customerDebt?.totalOutstanding ?? 0;

  const handleSubmit = async () => {
    const num = Number(String(amount).replace(/[^0-9.]/g, ""));
    if (!num || num <= 0) {
      setError("Số tiền phải lớn hơn 0.");
      return;
    }
    if (totalOutstanding > 0 && num > totalOutstanding + 0.01) {
      setError(
        `Số tiền vượt quá tổng công nợ khách hàng (${Math.round(totalOutstanding).toLocaleString("vi-VN")}đ).`
      );
      return;
    }

    setSubmit(true);
    setError(null);
    try {
      const data = await accountantService.createPayment(order.id, {
        amount:        num,
        paymentMethod: [...method][0],
        notes:         notes.trim() || undefined,
      });
      setResult(data);
      onPaymentRecorded();
      // Reload history với debt mới
      loadData();
      setAmount("");
      setNotes("");
    } catch (err) {
      setError(err.message ?? "Lỗi khi ghi nhận thanh toán.");
    } finally {
      setSubmit(false);
    }
  };

  const orderDebtRemaining = Number(order?.debt_remaining ?? 0);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader className="flex flex-col gap-0.5 pb-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <RiBankCard2Line size={16} className="text-blue-600" />
            </div>
            <div>
              <p className="text-base font-bold text-gray-900">Ghi nhận thanh toán</p>
              {order && (
                <p className="text-xs font-normal text-gray-400">
                  Đơn #{order.id} · {order.customer_name}
                </p>
              )}
            </div>
          </div>
        </ModalHeader>

        <ModalBody className="gap-4">
          {/* Tóm tắt công nợ */}
          {order && (
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-0.5 bg-gray-50 rounded-xl p-3">
                <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">
                  Còn lại đơn này
                </span>
                <MoneyText
                  amount={orderDebtRemaining}
                  className="text-sm font-bold text-red-600"
                />
              </div>
              <div className="flex flex-col gap-0.5 bg-amber-50 rounded-xl p-3">
                <span className="text-[10px] text-amber-600 font-semibold uppercase tracking-wide">
                  Tổng công nợ khách
                </span>
                {debtLoading ? (
                  <Spinner size="sm" className="mt-1" />
                ) : (
                  <MoneyText
                    amount={totalOutstanding}
                    className="text-sm font-bold text-amber-700"
                  />
                )}
              </div>
            </div>
          )}

          {/* Nếu vừa ghi nhận thành công — hiển thị breakdown */}
          {result && (
            <div className="bg-emerald-50 rounded-xl p-3 flex flex-col gap-1.5">
              <p className="text-xs font-semibold text-emerald-700">{result.message}</p>
              {result.spreadAcrossOrders && (
                <div className="flex flex-col gap-0.5 mt-1">
                  <span className="text-[10px] text-emerald-600 font-medium uppercase tracking-wide mb-0.5">
                    Phân bổ vào các đơn
                  </span>
                  {result.allocations.map((alloc) => (
                    <AllocationRow
                      key={alloc.debtId}
                      alloc={alloc}
                      isCurrentOrder={alloc.orderId === order?.id}
                    />
                  ))}
                </div>
              )}
              {result.totalRemainingAfter > 0.01 && (
                <p className="text-[11px] text-amber-600 mt-1">
                  Còn tổng nợ:{" "}
                  <MoneyText
                    amount={result.totalRemainingAfter}
                    className="font-bold inline"
                  />
                </p>
              )}
            </div>
          )}

          <Divider />

          {/* Form nhập */}
          <div className="flex flex-col gap-3">
            {error && (
              <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 p-3 rounded-lg">
                <RiAlertLine size={13} />
                {error}
              </div>
            )}
            <Input
              label="Số tiền thu (VND)"
              placeholder="0"
              value={amount}
              onValueChange={(v) => { setAmount(v); setError(null); setResult(null); }}
              type="number"
              min={0}
              description={
                totalOutstanding > 0
                  ? `Tổng nợ khách: ${Math.round(totalOutstanding).toLocaleString("vi-VN")}đ${
                      orderDebtRemaining > 0 && orderDebtRemaining < totalOutstanding
                        ? ` — Đơn này: ${Math.round(orderDebtRemaining).toLocaleString("vi-VN")}đ (số thừa tự động trừ đơn cũ hơn)`
                        : ""
                    }`
                  : undefined
              }
              isInvalid={!!error}
              classNames={{ inputWrapper: "bg-white" }}
            />
            <Select
              label="Hình thức thanh toán"
              selectedKeys={method}
              onSelectionChange={setMethod}
            >
              {PAYMENT_METHODS.map(({ key, label }) => (
                <SelectItem key={key}>{label}</SelectItem>
              ))}
            </Select>
            <Input
              label="Ghi chú"
              placeholder="Mã GD, tên người nộp... (tuỳ chọn)"
              value={notes}
              onValueChange={setNotes}
              maxLength={500}
              classNames={{ inputWrapper: "bg-white" }}
            />
          </div>

          {/* Lịch sử */}
          <Divider />
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 mb-1">
              <RiHistoryLine size={13} className="text-gray-400" />
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Lịch sử thanh toán đơn này
              </span>
            </div>
            {histLoading ? (
              <div className="flex justify-center py-4"><Spinner size="sm" /></div>
            ) : history.length === 0 ? (
              <p className="text-xs text-gray-400 py-2 italic">Chưa có thanh toán nào.</p>
            ) : (
              history.map((p, i) => <HistoryItem key={i} payment={p} onVoid={handleVoidPayment} />)
            )}
          </div>
        </ModalBody>

        <ModalFooter>
          <Button variant="light" onPress={onClose} isDisabled={submitting}>Đóng</Button>
          <Button
            color="primary"
            onPress={handleSubmit}
            isLoading={submitting}
            isDisabled={!amount || Number(amount) <= 0}
            startContent={!submitting && <RiBankCard2Line size={15} />}
          >
            Ghi nhận
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
