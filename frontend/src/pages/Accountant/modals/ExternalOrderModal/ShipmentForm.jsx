import { Button, Input, Select, SelectItem, Divider } from "@heroui/react";
import { RiAddLine, RiDeleteBinLine, RiTruckLine, RiMapPin2Line, RiMoneyDollarCircleLine, RiReceiptLine } from "react-icons/ri";

const PAYMENT_TYPES = [
  { key: "cash",          label: "Tiền mặt (khách trả driver)" },
  { key: "bank_transfer", label: "Chuyển khoản" },
  { key: "client_credit", label: "Ghi nợ khách" },
];

const DRIVER_PAYMENT_STATES = [
  { key: "company_received", label: "Đã nộp về công ty" },
  { key: "driver_holding",   label: "Driver đang giữ tiền" },
];

export const EXPENSE_TYPES = [
  { key: "fuel",         label: "Xăng dầu" },
  { key: "toll",         label: "Phí cầu đường / BOT" },
  { key: "parking",      label: "Phí bãi xe" },
  { key: "ferry",        label: "Phà" },
  { key: "minor_repair", label: "Sửa chữa nhỏ" },
  { key: "other",        label: "Chi phí khác" },
];

const EMPTY_EXPENSE = () => ({ expense_type: "toll", amount: "", description: "" });

function SectionLabel({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <Icon size={13} className="text-gray-400" />
      <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">{children}</span>
    </div>
  );
}

export function ShipmentForm({ index, shipment, onChange, onRemove, canRemove }) {
  const isCash = ["cash", "bank_transfer", "qr_transfer"].includes(shipment.payment_type);

  // ── Pickup helpers ────────────────────────────────────────────────────
  const handleAddPickup = () =>
    onChange("pickup_addresses", [...(shipment.pickup_addresses ?? [""]), ""]);

  const handlePickupChange = (i, value) => {
    const next = [...(shipment.pickup_addresses ?? [])];
    next[i] = value;
    onChange("pickup_addresses", next);
  };

  const handleRemovePickup = (i) => {
    const next = (shipment.pickup_addresses ?? []).filter((_, idx) => idx !== i);
    onChange("pickup_addresses", next.length ? next : [""]);
  };

  // ── Expense helpers ───────────────────────────────────────────────────
  const expenses = shipment.expenses ?? [];

  const handleAddExpense = () =>
    onChange("expenses", [...expenses, EMPTY_EXPENSE()]);

  const handleExpenseChange = (i, field, value) => {
    const next = expenses.map((e, idx) => idx === i ? { ...e, [field]: value } : e);
    onChange("expenses", next);
  };

  const handleRemoveExpense = (i) =>
    onChange("expenses", expenses.filter((_, idx) => idx !== i));

  const totalExpenses = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  return (
    <div className="flex flex-col gap-4 p-4 border border-gray-200 rounded-2xl bg-gray-50/40">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-gray-700">Chuyến {index + 1}</span>
        {canRemove && (
          <Button size="sm" variant="light" color="danger" isIconOnly onPress={onRemove}>
            <RiDeleteBinLine size={15} />
          </Button>
        )}
      </div>

      {/* ── Tuyến đường ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <SectionLabel icon={RiMapPin2Line}>Tuyến đường</SectionLabel>

        <div className="flex flex-col gap-2">
          <span className="text-xs text-gray-500 font-medium">Điểm lấy hàng</span>
          {(shipment.pickup_addresses ?? [""]).map((addr, i) => (
            <div key={i} className="flex gap-2">
              <Input
                placeholder={`Địa chỉ lấy ${i + 1}`}
                value={addr}
                onValueChange={(v) => handlePickupChange(i, v)}
                size="sm"
                classNames={{ inputWrapper: "bg-white" }}
              />
              {(shipment.pickup_addresses?.length ?? 1) > 1 && (
                <Button size="sm" variant="light" isIconOnly onPress={() => handleRemovePickup(i)}>
                  <RiDeleteBinLine size={14} className="text-red-400" />
                </Button>
              )}
            </div>
          ))}
          <Button
            size="sm" variant="light"
            startContent={<RiAddLine size={14} />}
            onPress={handleAddPickup}
            className="self-start text-xs text-gray-500"
          >
            Thêm điểm lấy
          </Button>
        </div>

        <Input
          label="Điểm giao hàng"
          placeholder="Địa chỉ giao hàng"
          value={shipment.delivery_address ?? ""}
          onValueChange={(v) => onChange("delivery_address", v)}
          size="sm"
          isRequired
          classNames={{ inputWrapper: "bg-white" }}
        />
      </div>

      <Divider className="my-0" />

      {/* ── Hàng hóa & Cước ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <SectionLabel icon={RiTruckLine}>Hàng hóa & Cước</SectionLabel>
        <div className="grid grid-cols-3 gap-2">
          <Input
            label="Tên hàng"
            placeholder="Tuỳ chọn"
            value={shipment.cargo_name ?? ""}
            onValueChange={(v) => onChange("cargo_name", v)}
            size="sm"
            classNames={{ inputWrapper: "bg-white" }}
          />
          <Input
            label="Khối lượng (kg)"
            placeholder="0"
            type="number"
            value={shipment.cargo_weight ?? ""}
            onValueChange={(v) => onChange("cargo_weight", v)}
            size="sm"
            classNames={{ inputWrapper: "bg-white" }}
          />
          <Input
            label="Cước xe (đ)"
            placeholder="0"
            type="number"
            value={shipment.cargo_fee ?? ""}
            onValueChange={(v) => onChange("cargo_fee", v)}
            size="sm"
            isRequired
            classNames={{ inputWrapper: "bg-white" }}
          />
        </div>
      </div>

      <Divider className="my-0" />

      {/* ── Thanh toán ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <SectionLabel icon={RiMoneyDollarCircleLine}>Thanh toán</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <Select
            label="Hình thức thanh toán"
            selectedKeys={new Set([shipment.payment_type ?? "cash"])}
            onSelectionChange={(keys) => onChange("payment_type", [...keys][0])}
            size="sm"
            classNames={{ trigger: "bg-white" }}
          >
            {PAYMENT_TYPES.map(({ key, label }) => (
              <SelectItem key={key}>{label}</SelectItem>
            ))}
          </Select>

          {isCash && (
            <Select
              label="Trạng thái nộp tiền"
              selectedKeys={new Set([shipment.driver_payment_state ?? "company_received"])}
              onSelectionChange={(keys) => onChange("driver_payment_state", [...keys][0])}
              size="sm"
              classNames={{ trigger: "bg-white" }}
            >
              {DRIVER_PAYMENT_STATES.map(({ key, label }) => (
                <SelectItem key={key}>{label}</SelectItem>
              ))}
            </Select>
          )}
        </div>
      </div>

      <Divider className="my-0" />

      {/* ── Tài xế / Xe ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <SectionLabel icon={RiTruckLine}>Tài xế / Xe</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <Input
            label="Tên tài xế"
            placeholder="Tuỳ chọn"
            value={shipment.driver_name ?? ""}
            onValueChange={(v) => onChange("driver_name", v)}
            size="sm"
            classNames={{ inputWrapper: "bg-white" }}
          />
          <Input
            label="Biển số xe"
            placeholder="51C-12345"
            value={shipment.vehicle_plate ?? ""}
            onValueChange={(v) => onChange("vehicle_plate", v)}
            size="sm"
            classNames={{ inputWrapper: "bg-white" }}
          />
        </div>
      </div>

      <Divider className="my-0" />

      {/* ── Chi phí phát sinh ────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <SectionLabel icon={RiReceiptLine}>Chi phí phát sinh</SectionLabel>
          {totalExpenses > 0 && (
            <span className="text-[11px] font-bold text-orange-600 mb-2">
              Tổng: {Number(totalExpenses).toLocaleString("vi-VN")}đ
            </span>
          )}
        </div>

        {expenses.length === 0 ? (
          <p className="text-[11px] text-gray-400 italic px-1">Chưa có chi phí nào.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {expenses.map((exp, i) => (
              <div key={i} className="flex items-center gap-2 p-2.5 bg-white rounded-xl border border-gray-100">
                <div className="grid grid-cols-3 gap-2 flex-1">
                  <Select
                    size="sm"
                    label="Loại"
                    selectedKeys={new Set([exp.expense_type])}
                    onSelectionChange={(keys) => handleExpenseChange(i, "expense_type", [...keys][0])}
                    classNames={{ trigger: "bg-gray-50" }}
                  >
                    {EXPENSE_TYPES.map(({ key, label }) => (
                      <SelectItem key={key}>{label}</SelectItem>
                    ))}
                  </Select>
                  <Input
                    size="sm"
                    label="Số tiền (đ)"
                    placeholder="0"
                    type="number"
                    value={exp.amount}
                    onValueChange={(v) => handleExpenseChange(i, "amount", v)}
                    classNames={{ inputWrapper: "bg-gray-50" }}
                  />
                  <Input
                    size="sm"
                    label="Ghi chú"
                    placeholder="Mô tả..."
                    value={exp.description}
                    onValueChange={(v) => handleExpenseChange(i, "description", v)}
                    classNames={{ inputWrapper: "bg-gray-50" }}
                  />
                </div>
                <Button size="sm" variant="light" isIconOnly onPress={() => handleRemoveExpense(i)}>
                  <RiDeleteBinLine size={14} className="text-red-400" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <Button
          size="sm" variant="flat" color="warning"
          startContent={<RiAddLine size={14} />}
          onPress={handleAddExpense}
          className="self-start text-xs"
        >
          Thêm chi phí
        </Button>
      </div>

      {/* ── Ghi chú chuyến ───────────────────────────────────────────── */}
      <Input
        label="Ghi chú chuyến (tuỳ chọn)"
        placeholder="Thông tin thêm về chuyến này..."
        value={shipment.notes ?? ""}
        onValueChange={(v) => onChange("notes", v)}
        size="sm"
        classNames={{ inputWrapper: "bg-white" }}
      />
    </div>
  );
}
