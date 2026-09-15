import { useEffect, useMemo, useState } from "react";
import {
  Spinner, Button, Chip, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Input, Select, SelectItem,
} from "@heroui/react";
import { RiRefreshLine, RiHandCoinLine, RiFileList3Line, RiAlertLine, RiCheckboxCircleLine } from "react-icons/ri";
import { MoneyText } from "../components/shared/MoneyText";
import { accountantService } from "../services/accountant.service";
import { notify } from "../../../components/shared-ui/Toast";
import { money } from "../../../utils/formatNumber";

const fmt = (iso) => (iso ? iso.split("-").reverse().join("/") : "—");
const num = (v) => Number(v || 0);

const PAYROLL_CHIP = {
  pending:  { color: "default", label: "Chờ duyệt" },
  reviewed: { color: "warning", label: "Manager đã duyệt" },
  approved: { color: "primary", label: "Kế toán xác nhận" },
  paid:     { color: "success", label: "Đã trả lương" },
};

// Ghi nhận THU phần công nợ còn lại của tài đã nghỉ — đi đúng đường thu nợ tài xế thường
// ngày (allocatePayment: phân bổ vào khoản nợ cũ nhất trước, bút toán Nợ 1111/1121 | Có 1388).
function CollectDebtModal({ target, onClose, onDone }) {
  const remaining = num(target?.remaining_debt);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!target) return;
    setAmount(String(Math.round(remaining)));
    setMethod("cash");
    setNotes(`Thu nợ còn lại khi nghỉ việc — ${target.driver_name}`);
    setError(null);
  }, [target, remaining]);

  const handleSubmit = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return setError("Số tiền phải lớn hơn 0.");
    if (value > remaining + 0.01) return setError(`Số tiền không được vượt số nợ còn lại (${money(remaining)}).`);
    setSaving(true);
    setError(null);
    try {
      await accountantService.allocatePayment({
        personType: "driver",
        personId: target.driver_id,
        amount: value,
        paymentMethod: method,
        notes: notes.trim() || undefined,
      });
      notify.success(`Đã ghi nhận thu ${money(value)} từ ${target.driver_name}.`);
      onDone?.();
      onClose();
    } catch (err) {
      setError(err.message || "Không thể ghi nhận khoản thu.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={!!target} onOpenChange={(open) => !open && !saving && onClose()} size="sm">
      <ModalContent>
        <ModalHeader className="flex flex-col items-start gap-0.5">
          <span>Thu nợ còn lại</span>
          <span className="text-xs font-normal text-gray-400 dark:text-gray-400">
            {target?.driver_name} · còn nợ {money(remaining)}
          </span>
        </ModalHeader>
        <ModalBody className="gap-3">
          {error && <p className="text-xs text-rose-500">{error}</p>}
          <Input
            type="number"
            label="Số tiền thu"
            value={amount}
            onValueChange={setAmount}
            variant="bordered"
            min={0}
            endContent={<span className="text-xs text-gray-400">đ</span>}
          />
          <Select
            label="Hình thức"
            variant="bordered"
            selectedKeys={new Set([method])}
            onSelectionChange={(keys) => setMethod([...keys][0] ?? "cash")}
          >
            <SelectItem key="cash" textValue="Tiền mặt">Tiền mặt</SelectItem>
            <SelectItem key="bank_transfer" textValue="Chuyển khoản">Chuyển khoản</SelectItem>
          </Select>
          <Input label="Ghi chú" value={notes} onValueChange={setNotes} variant="bordered" maxLength={500} />
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Khoản thu được phân bổ vào các khoản nợ cũ nhất trước, giống thu nợ tài xế thường ngày.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={onClose} isDisabled={saving}>Hủy</Button>
          <Button color="primary" isLoading={saving} onPress={handleSubmit}>Ghi nhận thu</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

// Quyết toán tài xế đã chấm dứt hợp đồng. Lương kỳ cuối vẫn tính/duyệt/chi ở tab Bảng lương
// như mọi kỳ (đã tự trừ ứng lương và công nợ theo trần %); tab này gom phần CÒN LẠI sau đó:
//   • phải THU: công nợ chưa trừ hết + phần ứng lương vượt lương (chuyển thành nợ khi chi);
//   • phải CHI: hoàn chi phí tài đã ứng, thưởng đã duyệt mà chưa đi qua kỳ lương nào.
export default function TerminationSettlementPanel({ rows, loading, error, onRefresh, onOpenPayroll }) {
  const [showAll, setShowAll] = useState(false);
  const [collectTarget, setCollectTarget] = useState(null);

  const visible = useMemo(
    () => (showAll ? rows : rows.filter((r) => !r.settled)),
    [rows, showAll],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="text-xs text-gray-600 dark:text-gray-300 bg-sky-50 dark:bg-sky-500/10 border border-sky-100 dark:border-sky-500/20 rounded-lg px-4 py-3 flex flex-col gap-1">
        <span className="font-semibold">Quy trình quyết toán tài xế nghỉ việc</span>
        <span>1. Tính và chi lương kỳ cuối ở tab Bảng lương như thường lệ — lương chỉ tính công đến ngày làm cuối, đã trừ ứng lương và công nợ (theo trần %).</span>
        <span>2. Ứng lương vượt số lương kỳ cuối được tự chuyển thành công nợ tài xế lúc bấm &quot;Đã trả&quot;.</span>
        <span>3. Thu nốt công nợ còn lại (nút Thu nợ). Khoản công ty còn phải trả (hoàn chi phí, thưởng) chi qua Phiếu chi / Thưởng.</span>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex gap-1 bg-gray-100 dark:bg-white/10 p-1 rounded-lg">
          {[
            { key: false, label: "Chưa quyết toán" },
            { key: true,  label: "Tất cả" },
          ].map(({ key, label }) => (
            <button
              key={label}
              onClick={() => setShowAll(key)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-150
                ${showAll === key ? "bg-white dark:bg-[#161922] text-gray-900 dark:text-gray-100 shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <Button size="sm" variant="flat" isIconOnly onPress={onRefresh} className="h-8 w-8" title="Làm mới">
          <RiRefreshLine size={15} />
        </Button>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-white/10 overflow-hidden bg-white dark:bg-[#161922] shadow-sm">
        {loading && rows.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <Spinner color="secondary" label="Đang tải..." size="lg" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-16 gap-2 text-red-500">
            <RiAlertLine size={18} />
            <span className="text-sm">{error}</span>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
              <RiCheckboxCircleLine size={20} className="text-emerald-400" />
            </div>
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              {showAll ? "Chưa có tài xế nào chấm dứt hợp đồng." : "Không còn tài xế nghỉ việc nào chờ quyết toán."}
            </p>
          </div>
        ) : (
          <div className={`overflow-x-auto transition-opacity duration-150 ${loading ? "opacity-50 pointer-events-none" : "opacity-100"}`}>
            <table className="w-full table-fixed min-w-[900px]">
              <thead>
                <tr className="bg-gray-50 dark:bg-white/5 border-b border-gray-200 dark:border-white/10">
                  {[
                    { label: "Tài xế", cls: "w-[20%] text-left" },
                    { label: "Làm tới", cls: "w-[12%] text-left" },
                    { label: "Lương kỳ cuối", cls: "w-[18%] text-left" },
                    { label: "Còn phải thu", cls: "w-[17%] text-right" },
                    { label: "Còn phải chi", cls: "w-[17%] text-right" },
                    { label: "", cls: "w-[16%] text-right" },
                  ].map(({ label, cls }, i) => (
                    <th key={i} className={`text-[11px] font-semibold text-gray-400 dark:text-gray-400 uppercase tracking-wider py-3 pr-4 first:pl-4 ${cls}`}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const fp = r.final_payroll;
                  const chip = fp ? (PAYROLL_CHIP[fp.status] ?? { color: "default", label: fp.status }) : null;
                  const debt = num(r.remaining_debt);
                  const advancePending = num(r.advance_unrecovered);
                  const reimb = num(r.pending_reimbursement);
                  const bonus = num(r.unpaid_bonuses);
                  return (
                    <tr key={r.driver_id} className="border-b border-gray-100 dark:border-white/10 align-top">
                      <td className="py-3.5 pl-4 pr-4">
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{r.driver_name}</span>
                          {r.driver_phone && <span className="text-xs text-gray-400 font-mono">{r.driver_phone}</span>}
                        </div>
                      </td>
                      <td className="py-3.5 pr-4">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm text-rose-600 dark:text-rose-300">{fmt(r.termination_date)}</span>
                          <span className="text-[11px] text-gray-400">Vào làm {fmt(r.hire_date)}</span>
                        </div>
                      </td>
                      <td className="py-3.5 pr-4">
                        <div className="flex flex-col gap-1 items-start">
                          <span className="text-[11px] text-gray-400">Tháng {r.final_month}/{r.final_year}</span>
                          {fp ? (
                            <>
                              <Chip size="sm" color={chip.color} variant="flat" className="text-[11px]">{chip.label}</Chip>
                              <MoneyText amount={fp.net_salary} className="text-xs font-semibold text-violet-700 dark:text-violet-300" />
                            </>
                          ) : (
                            <span className="text-xs text-amber-600 dark:text-amber-400">Chưa tính lương</span>
                          )}
                          {num(r.unpaid_payrolls) > (fp && fp.status !== "paid" ? 1 : 0) && (
                            <span className="text-[11px] text-amber-600 dark:text-amber-400">Còn phiếu lương kỳ khác chưa chi</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 pr-4 text-right">
                        <div className="flex flex-col gap-0.5 items-end">
                          <MoneyText amount={debt} className={`text-sm font-bold ${debt > 0 ? "text-rose-600 dark:text-rose-300" : "text-gray-400"}`} />
                          {debt > 0 && <span className="text-[11px] text-gray-400">công nợ chưa trừ hết</span>}
                          {advancePending > 0 && (
                            <span className="text-[11px] text-amber-600 dark:text-amber-400">
                              + {money(advancePending)} ứng lương chờ trừ vào lương kỳ cuối
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 pr-4 text-right">
                        <div className="flex flex-col gap-0.5 items-end">
                          <MoneyText amount={reimb + bonus} className={`text-sm font-bold ${reimb + bonus > 0 ? "text-emerald-600 dark:text-emerald-300" : "text-gray-400"}`} />
                          {reimb > 0 && <span className="text-[11px] text-gray-400">hoàn chi phí {money(reimb)}</span>}
                          {bonus > 0 && <span className="text-[11px] text-gray-400">thưởng đã duyệt {money(bonus)}</span>}
                          {(reimb > 0 || bonus > 0) && fp && fp.status !== "paid" && (
                            <span className="text-[11px] text-amber-600 dark:text-amber-400">tính lại lương kỳ cuối để gộp vào lương</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 pr-4">
                        <div className="flex flex-col gap-1.5 items-end">
                          {r.settled ? (
                            <Chip size="sm" color="success" variant="flat" className="text-[11px]">Đã quyết toán</Chip>
                          ) : null}
                          <Button
                            size="sm" variant="flat" className="h-7 text-[11px]"
                            startContent={<RiFileList3Line size={13} />}
                            onPress={() => onOpenPayroll(r.final_month, r.final_year, r.driver_name)}
                          >
                            Bảng lương
                          </Button>
                          {debt > 0 && (
                            <Button
                              size="sm" color="primary" variant="flat" className="h-7 text-[11px]"
                              startContent={<RiHandCoinLine size={13} />}
                              onPress={() => setCollectTarget(r)}
                            >
                              Thu nợ
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CollectDebtModal target={collectTarget} onClose={() => setCollectTarget(null)} onDone={onRefresh} />
    </div>
  );
}
