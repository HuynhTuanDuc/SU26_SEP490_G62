import { useState, useCallback } from "react";
import {
  Spinner, Chip, Button,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Input, Select, SelectItem,
} from "@heroui/react";
import {
  RiUserLine, RiTruckLine, RiAlertLine,
  RiArrowRightSLine, RiArrowDownSLine,
  RiBankCard2Line, RiGroupLine,
  RiCheckboxCircleLine, RiTimeLine,
  RiFileList3Line,
} from "react-icons/ri";
import { MoneyText } from "../components/shared/MoneyText";
import { useDebts } from "../hooks/useDebts";
import { accountantService } from "../services/accountant.service";

const VND = (n) => Number(n || 0).toLocaleString("vi-VN") + "đ";

const STATUS_OPTIONS = [
  { key: "all",     label: "Tất cả" },
  { key: "unpaid",  label: "Chưa thu" },
  { key: "partial", label: "Thu 1 phần" },
  { key: "paid",    label: "Đã thu đủ" },
];

const STATUS_CHIP = {
  unpaid:  { label: "Chưa thu",     color: "danger"  },
  partial: { label: "Thu 1 phần",   color: "warning" },
  paid:    { label: "Đã thu đủ",    color: "success" },
};

// Lấy tên/SĐT/personId từ grouped row
function getPersonInfo(person) {
  if (person.debt_type === "driver") {
    return {
      name:      person.driver_name   ?? "—",
      phone:     person.driver_phone  ?? null,
      person_id: person.driver_id,
    };
  }
  return {
    name:      person.customer_name ?? person.customer_company ?? "—",
    phone:     person.customer_phone ?? null,
    person_id: person.customer_ids?.[0] ?? null,
  };
}

function isOverdue(due_date) {
  return due_date && new Date(due_date) < new Date();
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function DebtStatCard({ label, value, sub, icon: Icon, gradient, lightBg, text, border }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-white border ${border} p-5 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow`}>
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-xl ${lightBg} flex items-center justify-center`}>
          <Icon size={20} className={text} />
        </div>
        <div className={`w-14 h-14 rounded-full bg-gradient-to-br ${gradient} opacity-10 absolute top-2 right-2`} />
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{label}</span>
        <span className={`text-2xl font-bold ${text} leading-tight`}>{VND(value)}</span>
        {sub && <span className="text-[11px] text-gray-400 mt-0.5">{sub}</span>}
      </div>
    </div>
  );
}

// ─── Payment modal ────────────────────────────────────────────────────────────
function PayDebtModal({ person, onClose, onDone }) {
  const { name, person_id } = getPersonInfo(person);
  const [amount, setAmount] = useState(String(person?.total_remaining || ""));
  const [method, setMethod] = useState(new Set(["cash"]));
  const [notes, setNotes]   = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);

  const handleSubmit = async () => {
    const num = Number(String(amount).replace(/[^0-9.]/g, ""));
    if (!num || num <= 0) { setError("Số tiền phải lớn hơn 0."); return; }
    if (!person_id) { setError("Không xác định được người nợ."); return; }
    setSaving(true); setError(null);
    try {
      await accountantService.allocatePayment({
        person_type:    person.debt_type,
        person_id,
        amount:         num,
        payment_method: [...method][0],
        notes:          notes.trim() || undefined,
      });
      onDone();
      onClose();
    } catch (err) {
      setError(err.message ?? "Lỗi khi ghi nhận.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} size="sm">
      <ModalContent>
        <ModalHeader className="flex items-center gap-2 pb-2">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
            <RiBankCard2Line size={16} className="text-blue-600" />
          </div>
          <div>
            <p className="text-base font-bold">Ghi nhận thanh toán</p>
            <p className="text-xs font-normal text-gray-400">{name}</p>
          </div>
        </ModalHeader>

        <ModalBody className="gap-3">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-0.5 bg-red-50 rounded-xl p-3">
              <span className="text-[10px] text-red-400 font-semibold uppercase tracking-wide">Tổng nợ</span>
              <MoneyText amount={person?.total_amount} className="text-sm font-bold text-red-600" />
            </div>
            <div className="flex flex-col gap-0.5 bg-orange-50 rounded-xl p-3">
              <span className="text-[10px] text-orange-400 font-semibold uppercase tracking-wide">Còn lại</span>
              <MoneyText amount={person?.total_remaining} className="text-sm font-bold text-orange-600" />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 p-3 rounded-lg">
              <RiAlertLine size={13} />
              {error}
            </div>
          )}

          <Input
            label="Số tiền thu (VND)"
            type="number"
            value={amount}
            onValueChange={(v) => { setAmount(v); setError(null); }}
            isInvalid={!!error}
            classNames={{ inputWrapper: "bg-white" }}
          />
          <Select
            label="Hình thức thanh toán"
            selectedKeys={method}
            onSelectionChange={setMethod}
          >
            <SelectItem key="cash">Tiền mặt</SelectItem>
            <SelectItem key="bank_transfer">Chuyển khoản</SelectItem>
            <SelectItem key="qr_transfer">QR Code</SelectItem>
          </Select>
          <Input
            label="Ghi chú (tuỳ chọn)"
            placeholder="Mã GD, tên người nộp..."
            value={notes}
            onValueChange={setNotes}
            classNames={{ inputWrapper: "bg-white" }}
          />
        </ModalBody>

        <ModalFooter>
          <Button variant="light" onPress={onClose} isDisabled={saving}>Huỷ</Button>
          <Button color="primary" onPress={handleSubmit} isLoading={saving}
            startContent={!saving && <RiBankCard2Line size={15} />}>
            Ghi nhận
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

// ─── Expand debt detail row ───────────────────────────────────────────────────
function DebtDetailRow({ d }) {
  const overdue = isOverdue(d.due_date);
  const status  = d.computed_status;

  return (
    <tr className="bg-orange-50/20 border-b border-orange-100/30">
      <td className="pl-10 py-2.5 w-10">
        <span className="text-[10px] text-orange-400 font-bold">#{d.id}</span>
      </td>
      <td className="py-2.5 pr-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-medium text-gray-700">
            {d.order_id ? `Đơn #${d.order_id}` : "—"}
            {d.order_cargo_name ? ` · ${d.order_cargo_name}` : ""}
          </span>
          {d.notes && (
            <span className="text-[10px] text-gray-400 italic">{d.notes}</span>
          )}
        </div>
      </td>
      <td className="py-2.5 pr-4 w-28">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-gray-400">
            {d.created_at ? new Date(d.created_at).toLocaleDateString("vi-VN") : "—"}
          </span>
          {d.due_date && (
            <span className={`text-[10px] font-medium ${overdue ? "text-red-500" : "text-gray-400"}`}>
              Hạn: {new Date(d.due_date).toLocaleDateString("vi-VN")}
              {overdue && " ⚠"}
            </span>
          )}
        </div>
      </td>
      <td className="py-2.5 pr-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-bold text-red-500">{VND(d.remaining)}</span>
          <span className="text-[10px] text-gray-400">/ {VND(d.total_amount)}</span>
        </div>
      </td>
      <td className="py-2.5 pr-4 w-28">
        {STATUS_CHIP[status] && (
          <Chip size="sm" color={STATUS_CHIP[status].color} variant="flat" className="text-[10px] h-5">
            {STATUS_CHIP[status].label}
          </Chip>
        )}
      </td>
      <td className="py-2.5 w-10" />
    </tr>
  );
}

// ─── Person row (expandable) ─────────────────────────────────────────────────
function PersonRow({ person, onPay, statusFilter, searchText }) {
  const [expanded, setExpanded] = useState(false);
  const [debts, setDebts]       = useState(null);
  const [loading, setLoading]   = useState(false);

  const { name, phone, person_id } = getPersonInfo(person);

  // Client-side search filter
  if (searchText && !name.toLowerCase().includes(searchText.toLowerCase()) &&
      !(phone ?? "").includes(searchText)) {
    return null;
  }

  // Client-side status filter
  if (statusFilter !== "all" && person.computed_status !== statusFilter) {
    return null;
  }

  const toggle = useCallback(async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && debts === null && person_id) {
      setLoading(true);
      try {
        const data = await accountantService.getDebtsByPerson(person.debt_type, person_id);
        // BE returns { debts: [...] }
        setDebts(Array.isArray(data?.debts) ? data.debts : []);
      } catch {
        setDebts([]);
      } finally {
        setLoading(false);
      }
    }
  }, [expanded, debts, person, person_id]);

  const chipProps = STATUS_CHIP[person.computed_status];

  return (
    <>
      <tr
        className={`border-b border-gray-100 cursor-pointer transition-colors
                   ${expanded ? "bg-orange-50/40" : "hover:bg-gray-50/60"}`}
        onClick={toggle}
      >
        <td className="py-3.5 pl-4 w-10">
          <span className="text-gray-400">
            {expanded ? <RiArrowDownSLine size={17} /> : <RiArrowRightSLine size={17} />}
          </span>
        </td>
        <td className="py-3.5 pr-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold text-gray-800">{name}</span>
            {phone && <span className="text-xs text-gray-400 font-mono">{phone}</span>}
            {person.debt_type === "customer" && person.customer_company && (
              <span className="text-[11px] text-gray-400">{person.customer_company}</span>
            )}
          </div>
        </td>
        <td className="py-3.5 pr-4 w-20 text-center">
          <span className="text-xs text-gray-500">{person.debt_count ?? 0} khoản</span>
        </td>
        <td className="py-3.5 pr-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-bold text-red-600">{VND(person.total_remaining)}</span>
            <span className="text-[10px] text-gray-400">/ {VND(person.total_amount)}</span>
          </div>
        </td>
        <td className="py-3.5 pr-4 w-28">
          {chipProps && (
            <Chip size="sm" color={chipProps.color} variant="flat" className="text-[10px] h-5">
              {chipProps.label}
            </Chip>
          )}
          {isOverdue(person.earliest_due_date) && person.computed_status !== "paid" && (
            <p className="text-[10px] text-red-500 mt-0.5 font-medium">⚠ Quá hạn</p>
          )}
        </td>
        <td className="py-3.5 pr-4 w-10" onClick={(e) => e.stopPropagation()}>
          {person.computed_status !== "paid" && (
            <Button
              size="sm" color="danger" variant="flat" isIconOnly
              title="Ghi nhận thanh toán"
              className="h-7 w-7 min-w-7"
              onPress={() => onPay(person)}
            >
              <RiBankCard2Line size={14} />
            </Button>
          )}
        </td>
      </tr>

      {expanded && (
        loading ? (
          <tr>
            <td colSpan={6} className="py-4 text-center bg-orange-50/20">
              <Spinner size="sm" color="warning" />
            </td>
          </tr>
        ) : (debts ?? []).length === 0 ? (
          <tr>
            <td colSpan={6} className="py-3 pl-10 text-xs text-gray-400 italic bg-orange-50/10">
              Không có khoản nợ nào.
            </td>
          </tr>
        ) : (debts ?? []).map((d) => (
          <DebtDetailRow key={d.id} d={d} />
        ))
      )}
    </>
  );
}

// ─── Main DebtView ────────────────────────────────────────────────────────────
export function DebtView({ search = "" }) {
  const {
    stats, statsLoading,
    debtType, setDebtType,
    customerDebts, driverDebts,
    groupedLoading,
    refetch,
  } = useDebts();

  const [payPerson, setPayPerson]       = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");

  const list = debtType === "customer" ? customerDebts : driverDebts;

  // Count by status for tab badges
  const unpaidCount  = list.filter((d) => d.computed_status === "unpaid").length;
  const partialCount = list.filter((d) => d.computed_status === "partial").length;

  return (
    <div className="flex flex-col gap-5">

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <DebtStatCard
          label="Tổng nợ phải thu"
          value={statsLoading ? 0 : stats.total_debt}
          sub={statsLoading ? "" : `${stats.customer_count + stats.driver_count} khoản nợ`}
          icon={RiAlertLine}
          gradient="from-red-500 to-rose-600"
          lightBg="bg-red-50" text="text-red-600" border="border-red-100"
        />
        <DebtStatCard
          label="Khách hàng nợ"
          value={statsLoading ? 0 : stats.total_customer_debt}
          sub={statsLoading ? "" : `${stats.customer_count} khoản`}
          icon={RiGroupLine}
          gradient="from-blue-500 to-blue-600"
          lightBg="bg-blue-50" text="text-blue-600" border="border-blue-100"
        />
        <DebtStatCard
          label="Tài xế đang giữ tiền"
          value={statsLoading ? 0 : stats.total_driver_debt}
          sub={statsLoading ? "" : `${stats.driver_count} khoản`}
          icon={RiTruckLine}
          gradient="from-amber-500 to-amber-600"
          lightBg="bg-amber-50" text="text-amber-600" border="border-amber-100"
        />
      </div>

      {/* Tabs + Status filter */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        {/* Type tabs */}
        <div className="flex gap-1 bg-gray-100/80 p-1 rounded-xl">
          {[
            { key: "customer", label: "Khách hàng", icon: RiUserLine,  count: customerDebts.length },
            { key: "driver",   label: "Tài xế",     icon: RiTruckLine, count: driverDebts.length },
          ].map(({ key, label, icon: Icon, count }) => {
            const active = debtType === key;
            return (
              <button
                key={key}
                onClick={() => { setDebtType(key); setStatusFilter("all"); }}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium
                            transition-all duration-150
                  ${active ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
              >
                <Icon size={14} className={active ? "text-blue-500" : "text-gray-400"} />
                {label}
                <span className={`ml-1 text-[11px] px-1.5 py-0.5 rounded-full font-bold
                  ${active ? "bg-blue-100 text-blue-600" : "bg-gray-200 text-gray-500"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Status filter */}
        <div className="flex gap-1 bg-gray-100/60 p-1 rounded-xl">
          {STATUS_OPTIONS.map(({ key, label }) => {
            const active = statusFilter === key;
            return (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all duration-150
                  ${active ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
              >
                {label}
                {key === "unpaid"  && unpaidCount  > 0 && (
                  <span className="ml-1 text-[10px] px-1 py-0.5 rounded-full bg-red-100 text-red-600 font-bold">{unpaidCount}</span>
                )}
                {key === "partial" && partialCount > 0 && (
                  <span className="ml-1 text-[10px] px-1 py-0.5 rounded-full bg-orange-100 text-orange-600 font-bold">{partialCount}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-gray-200 overflow-hidden bg-white shadow-sm">
        {groupedLoading ? (
          <div className="flex items-center justify-center py-20">
            <Spinner color="primary" label="Đang tải..." size="lg" />
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-2xl bg-green-50 flex items-center justify-center">
              <RiCheckboxCircleLine size={22} className="text-green-400" />
            </div>
            <p className="text-gray-500 text-sm">Không có công nợ nào.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-200">
                {[
                  { label: "",              cls: "w-10 pl-4" },
                  { label: "Tên / Liên hệ" },
                  { label: "Số khoản",      cls: "w-20 text-center" },
                  { label: "Còn lại / Tổng" },
                  { label: "Trạng thái",    cls: "w-28" },
                  { label: "",              cls: "w-10" },
                ].map(({ label, cls }, i) => (
                  <th
                    key={i}
                    className={`text-left text-[11px] font-semibold text-gray-400 uppercase
                               tracking-wider py-3 pr-4 ${cls ?? ""}`}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((p, i) => (
                <PersonRow
                  key={`${p.debt_type}-${p.driver_id ?? p.customer_ids?.[0]}-${i}`}
                  person={p}
                  onPay={setPayPerson}
                  statusFilter={statusFilter}
                  searchText={search}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {payPerson && (
        <PayDebtModal
          person={payPerson}
          onClose={() => setPayPerson(null)}
          onDone={refetch}
        />
      )}
    </div>
  );
}
