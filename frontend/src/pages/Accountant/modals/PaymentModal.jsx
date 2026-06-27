import { useState, useEffect, useCallback } from "react";
import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button, Input, Select, SelectItem, Divider, Spinner, Chip,
} from "@heroui/react";
import {
  RiBankCard2Line, RiHistoryLine, RiCheckboxCircleLine, RiAlertLine,
} from "react-icons/ri";
import { accountantService } from "../services/accountant.service";
import { MoneyText } from "../components/shared/MoneyText";

const PAYMENT_METHODS = [
  { key: "cash",          label: "Tiền mặt" },
  { key: "bank_transfer", label: "Chuyển khoản" },
  { key: "qr_transfer",   label: "QR Code" },
];

const METHOD_LABEL = {
  cash: "Tiền mặt",
  bank_transfer: "Chuyển khoản",
  qr_transfer: "QR Code",
};

function HistoryItem({ payment }) {
  const date = payment.created_at
    ? new Date(payment.created_at).toLocaleDateString("vi-VN", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : "—";

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0">
      <div className="flex flex-col gap-0.5">
        <MoneyText amount={payment.amount} className="text-xs font-bold text-emerald-600" />
        <span className="text-[11px] text-gray-400">
          {METHOD_LABEL[payment.payment_method] ?? payment.payment_method ?? "—"} · {date}
        </span>
        {payment.notes && (
          <span className="text-[11px] text-gray-400 italic">{payment.notes}</span>
        )}
      </div>
      <Chip size="sm" color="success" variant="flat" className="text-[10px] h-5">
        <RiCheckboxCircleLine size={10} className="inline mr-0.5" />
        Đã ghi
      </Chip>
    </div>
  );
}

export function PaymentModal({ isOpen, onClose, order, onPaymentRecorded }) {
  const [amount, setAmount]   = useState("");
  const [method, setMethod]   = useState(new Set(["cash"]));
  const [notes, setNotes]     = useState("");
  const [submitting, setSubmit] = useState(false);
  const [error, setError]     = useState(null);
  const [history, setHistory] = useState([]);
  const [histLoading, setHistL] = useState(false);

  const loadHistory = useCallback(async () => {
    if (!order?.id) return;
    setHistL(true);
    try {
      const data = await accountantService.getPayments(order.id);
      setHistory(Array.isArray(data) ? data : []);
    } catch {
      setHistory([]);
    } finally {
      setHistL(false);
    }
  }, [order?.id]);

  useEffect(() => {
    if (isOpen) {
      setAmount("");
      setMethod(new Set(["cash"]));
      setNotes("");
      setError(null);
      loadHistory();
    }
  }, [isOpen, loadHistory]);

  const handleSubmit = async () => {
    const num = Number(String(amount).replace(/[^0-9.]/g, ""));
    if (!num || num <= 0) { setError("Số tiền phải lớn hơn 0."); return; }
    setSubmit(true); setError(null);
    try {
      await accountantService.createPayment(order.id, {
        amount: num,
        paymentMethod: [...method][0],
        notes: notes.trim() || undefined,
      });
      onPaymentRecorded();
      onClose();
    } catch (err) {
      setError(err.message ?? "Lỗi khi ghi nhận thanh toán.");
    } finally {
      setSubmit(false);
    }
  };

  const debtRemaining = Number(order?.debt_remaining ?? 0);
  const totalPrice    = Number(order?.actual_price || order?.estimated_price || 0);
  const collected     = totalPrice - debtRemaining;

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
          {/* Summary strip */}
          {order && (
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Tổng cước", value: totalPrice,    cls: "text-gray-700" },
                { label: "Đã thu",    value: collected,     cls: "text-emerald-600" },
                { label: "Còn lại",   value: debtRemaining, cls: "text-red-600" },
              ].map(({ label, value, cls }) => (
                <div key={label} className="flex flex-col gap-0.5 bg-gray-50 rounded-xl p-3">
                  <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">{label}</span>
                  <MoneyText amount={value} className={`text-sm font-bold ${cls}`} />
                </div>
              ))}
            </div>
          )}

          <Divider />

          {/* Form */}
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
              onValueChange={(v) => { setAmount(v); setError(null); }}
              type="number"
              min={0}
              description={debtRemaining > 0
                ? `Còn phải thu: ${debtRemaining.toLocaleString("vi-VN")}đ`
                : undefined}
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
              classNames={{ inputWrapper: "bg-white" }}
            />
          </div>

          {/* History */}
          <Divider />
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 mb-1">
              <RiHistoryLine size={13} className="text-gray-400" />
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Lịch sử thanh toán
              </span>
            </div>
            {histLoading ? (
              <div className="flex justify-center py-4"><Spinner size="sm" /></div>
            ) : history.length === 0 ? (
              <p className="text-xs text-gray-400 py-2 italic">Chưa có thanh toán nào.</p>
            ) : (
              history.map((p, i) => <HistoryItem key={i} payment={p} />)
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
