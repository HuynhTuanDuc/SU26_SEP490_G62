import { useState, useMemo, useEffect } from "react";
import {
  Spinner, Button, Chip, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Input, Select, SelectItem,
} from "@heroui/react";
import {
  RiGroupLine, RiMoneyDollarCircleLine, RiCheckboxCircleLine, RiTimeLine,
  RiRefreshLine, RiArrowDownSLine, RiArrowUpSLine,
  RiLineChartLine, RiAlertLine, RiHandCoinLine, RiWalletLine, RiPencilLine,
  RiFileDownloadLine, RiArrowGoBackLine, RiSearchLine, RiFilter3Line, RiSortDesc,
} from "react-icons/ri";

const ic = (Icon) => <Icon size={16} className="text-gray-400 dark:text-gray-400 shrink-0" />;
import { MoneyText } from "../components/shared/MoneyText";
import { PaginationBar } from "../components/shared/PaginationBar";
import { usePayroll, useSalaryAdvances } from "../hooks/usePayroll";
import { accountantService } from "../services/accountant.service";
import { DriverVehicleGroupModal } from "../../../components/shared-ui/DriverVehicleGroupModal";
import { notify } from "../../../components/shared-ui/Toast";
import { confirmDialog } from "../../../components/shared-ui/confirm";
import { exportPayslipToPDF } from "../../../utils/exportPayslip";
import { attendanceLine, phoneAllowanceOf, prorationNote } from "../../../utils/payrollDisplay";
import TerminationSettlementPanel from "./TerminationSettlementPanel";
import { money } from "../../../utils/formatNumber";

const VND = (n) => Number(n || money(0));

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  key: String(i + 1),
  label: `Tháng ${i + 1}`,
}));

const YEARS = Array.from({ length: 5 }, (_, i) => {
  const y = new Date().getFullYear() - i;
  return { key: String(y), label: String(y) };
});

const STATUS_CHIP = {
  pending:  { color: "default",  label: "Chờ duyệt" },
  reviewed: { color: "warning",  label: "Manager đã duyệt" },
  approved: { color: "primary",  label: "Kế toán xác nhận" },
  paid:     { color: "success",  label: "Đã trả lương" },
};

const PAYROLL_STATUS_OPTIONS = [
  { key: "",         label: "Tất cả trạng thái" },
  { key: "pending",  label: "Chờ duyệt" },
  { key: "reviewed", label: "Manager đã duyệt" },
  { key: "approved", label: "Kế toán xác nhận" },
  { key: "paid",     label: "Đã trả lương" },
];

const PAYROLL_SORT_OPTIONS = [
  { key: "net_desc", label: "Thực lĩnh cao nhất" },
  { key: "net_asc",  label: "Thực lĩnh thấp nhất" },
  { key: "status",   label: "Trạng thái" },
];

function StatCard({ label, value, icon: Icon, bg, text, border }) {
  return (
    <div className={`relative overflow-hidden rounded-xl bg-white dark:bg-[#161922] border ${border} p-5 flex flex-col gap-3 shadow-sm`}>
      <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center`}>
        <Icon size={18} className={text} />
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-medium text-gray-400 dark:text-gray-400 uppercase tracking-wide">{label}</span>
        <span className={`text-2xl font-bold ${text}`}>{value}</span>
      </div>
    </div>
  );
}

function PayrollRow({ row, onConfirm, onPay, confirming, onEditGroup, onExportPdf, onAdjust, onRevert }) {
  const [expanded, setExpanded] = useState(false);
  const chip = STATUS_CHIP[row.status] ?? { color: "default", label: row.status };

  // holiday_bonus = 100% lương ngày cộng thêm cho mỗi ngày lễ tài đi làm (tổng 200%).
  // Suy ngược số ngày từ số tiền vì BE tính đúng holidayBonus = round(lương cứng/28) × số ngày.
  const holidayBonus  = Number(row.holiday_bonus ?? 0);
  const dailyWage     = Math.round(Number(row.base_salary ?? 0) / 28);
  const holidayDays   = dailyWage > 0 ? Math.round(holidayBonus / dailyWage) : 0;
  const attendance    = attendanceLine(row);

  const detail = [
    { label: "Lương cứng",      value: row.base_salary },
    { label: "Doanh thu",       value: row.total_revenue },
    { label: "Thưởng DT (15%)", value: row.revenue_bonus },
    { label: `Phụ cấp ĐT${prorationNote(row)}`, value: phoneAllowanceOf(row) },
    { label: "Thưởng KPI",           value: row.kpi_bonus },
    { label: "Thưởng xuất sắc",     value: row.top_driver_bonus },
    ...(holidayBonus > 0
      ? [{ label: `Đi làm ngày lễ ×2 (${holidayDays} ngày)`, value: row.holiday_bonus }]
      : []),
    { label: "Thưởng & Phúc lợi",  value: row.overtime_bonus },
    ...(Number(row.manual_bonus) > 0 ? [{ label: "Điều chỉnh (+)", value: row.manual_bonus }] : []),
    { label: "Lương gộp",           value: row.gross_salary,  bold: true },
    // Tiền hoàn khoản tài đã ứng (chi hộ khách + chi phí công ty) — không phải thu nhập
    { label: "Hoàn chi phí đã ứng", value: row.expense_reimbursement },
    { label: `BHXH (10.5%)${prorationNote(row)}`, value: `-${VND(row.insurance_employee)}`, raw: true, neg: true },
    // Trừ công (nghỉ không lương / vào làm giữa tháng) hoặc cộng công (đi làm dư quota 28)
    // — nhãn + dấu theo đúng bản chất, không hiện "-(-x)" gây hiểu nhầm (utils/payrollDisplay)
    (attendance.sign === "minus"
      ? { label: attendance.label, value: `-${VND(attendance.amount)}`, raw: true, neg: true }
      : { label: attendance.label, value: `+${VND(attendance.amount)}`, raw: true }),
    // Ứng lương vượt số lương kỳ (kỳ cuối khi nghỉ việc giữa tháng): chỉ trừ bằng số làm ra,
    // phần còn lại chuyển thành công nợ tài xế lúc bấm "Đã trả"
    {
      label: Number(row.advance_total ?? 0) > Number(row.advance_deduction ?? 0) + 0.01
        ? `Trừ ứng lương (còn ${money(Number(row.advance_total) - Number(row.advance_deduction))} chuyển công nợ)`
        : "Trừ ứng lương",
      value: `-${VND(row.advance_deduction)}`, raw: true, neg: true,
    },
    { label: "Trừ công nợ",     value: `-${VND(row.driver_debt_deduction)}`, raw: true, neg: true },
    ...(Number(row.manual_deduction) > 0 ? [{ label: "Điều chỉnh (−)", value: `-${VND(row.manual_deduction)}`, raw: true, neg: true }] : []),
    { label: "Lương thực nhận", value: row.net_salary,   bold: true, highlight: true },
  ];

  return (
    <>
      <tr
        className={`border-b border-gray-100 dark:border-white/10 cursor-pointer transition-colors
                   ${expanded ? "bg-violet-50/40 dark:bg-violet-500/10" : "hover:bg-gray-50/60 dark:hover:bg-white/5"}`}
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="py-3.5 pl-4">
          <span className="text-gray-400 dark:text-gray-400">
            {expanded ? <RiArrowUpSLine size={17} /> : <RiArrowDownSLine size={17} />}
          </span>
        </td>
        <td className="py-3.5 pr-4">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{row.driver_name}</span>
            {row.driver_phone && (
              <span className="text-xs text-gray-400 dark:text-gray-400 font-mono">{row.driver_phone}</span>
            )}
            {/* Kỳ lương cuối của tài đã nghỉ — sau kỳ này không còn kỳ nào trừ tiếp ứng lương / công nợ */}
            {row.termination_date
              && row.termination_date.slice(0, 7) === `${row.payroll_year}-${String(row.payroll_month).padStart(2, "0")}` && (
              <span className="text-[11px] text-rose-500">
                Nghỉ việc — làm tới {row.termination_date.split("-").reverse().join("/")}
              </span>
            )}
          </div>
        </td>
        <td className="py-3.5 pr-4 hidden sm:table-cell" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{row.vehicle_group || "—"}</span>
            <Button
              isIconOnly size="sm" variant="light" className="w-5 h-5 min-w-5"
              onPress={() => onEditGroup(row)}
            >
              <RiPencilLine size={12} className="text-gray-400 dark:text-gray-400" />
            </Button>
          </div>
        </td>
        {/* tabular-nums: các chữ số cùng bề ngang → cột tiền thẳng hàng, không rung khi số đổi */}
        <td className="py-3.5 pr-4 text-right tabular-nums">
          <MoneyText amount={row.gross_salary} className="text-sm font-semibold text-gray-700 dark:text-gray-200" />
        </td>
        <td className="py-3.5 pr-4 text-right tabular-nums">
          <MoneyText amount={row.net_salary} className="text-sm font-bold text-violet-700 dark:text-violet-300" />
        </td>
        <td className="py-3.5 pr-4 text-center">
          <Chip size="sm" color={chip.color} variant="flat" className="text-[11px]">
            {chip.label}
          </Chip>
        </td>
        <td className="py-3.5 pr-4" onClick={(e) => e.stopPropagation()}>
          <div className="flex gap-1.5 items-center justify-end">
            {row.status === "reviewed" && (
              <Button
                size="sm" color="primary" variant="flat"
                className="h-7 text-[11px]"
                isLoading={confirming === row.id}
                onPress={() => onConfirm(row.id)}
              >
                Xác nhận
              </Button>
            )}
            {row.status === "approved" && (
              <Button
                size="sm" color="success" variant="flat"
                className="h-7 text-[11px]"
                isLoading={confirming === row.id}
                onPress={() => onPay(row.id)}
              >
                Đã trả
              </Button>
            )}
            <Button
              size="sm" variant="flat" isIconOnly
              className="h-7 w-7 min-w-7 text-gray-500 dark:text-gray-400"
              title="Xuất phiếu lương PDF"
              onPress={() => onExportPdf(row)}
            >
              <RiFileDownloadLine size={14} />
            </Button>
          </div>
        </td>
      </tr>

      {expanded && (
        <tr className="bg-violet-50/30 dark:bg-violet-500/10 border-b border-violet-100/50">
          <td colSpan={7} className="px-10 py-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {detail.map(({ label, value, raw, neg, bold, highlight }) => (
                <div
                  key={label}
                  className={`flex justify-between items-center p-2.5 rounded-lg text-xs
                    ${highlight ? "bg-violet-100 dark:bg-violet-500/15 col-span-2 sm:col-span-3" : "bg-white dark:bg-[#161922]"}`}
                >
                  <span className="text-gray-500 dark:text-gray-400">{label}</span>
                  <span className={`font-${bold ? "bold" : "medium"} ${
                    highlight ? "text-violet-700 dark:text-violet-300 text-sm" :
                    neg ? "text-red-500" : "text-gray-800 dark:text-gray-100"
                  }`}>
                    {raw ? value : <MoneyText amount={value} />}
                  </span>
                </div>
              ))}
            </div>
            {row.adjustment_note && (
              <div className="mt-3 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 rounded-lg px-3 py-2">
                <span className="font-semibold">Ghi chú điều chỉnh:</span> {row.adjustment_note}
              </div>
            )}
            <div className="flex justify-end gap-2 mt-3 flex-wrap">
              {row.status !== "paid" && (
                <Button
                  size="sm" color="warning" variant="flat"
                  startContent={<RiPencilLine size={15} />}
                  onPress={() => onAdjust(row)}
                >
                  Điều chỉnh / Tính lại
                </Button>
              )}
              {(row.status === "reviewed" || row.status === "approved") && (
                <Button
                  size="sm" color="danger" variant="flat"
                  startContent={<RiArrowGoBackLine size={15} />}
                  onPress={() => onRevert(row)}
                >
                  Trả về tính lại
                </Button>
              )}
              <Button
                size="sm" color="secondary" variant="flat"
                startContent={<RiFileDownloadLine size={15} />}
                onPress={() => onExportPdf(row)}
              >
                Xuất phiếu lương PDF
              </Button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function AdvanceRow({ row, onDisburse, disbursing }) {
  const isApproved = row.status === "approved";
  return (
    <tr className="border-b border-gray-100 dark:border-white/10 hover:bg-gray-50/60 dark:hover:bg-white/5 transition-colors">
      <td className="py-3.5 pl-4 pr-4">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{row.driver_name}</span>
          {row.driver_phone && (
            <span className="text-xs text-gray-400 dark:text-gray-400 font-mono">{row.driver_phone}</span>
          )}
        </div>
      </td>
      <td className="py-3.5 pr-4 text-right tabular-nums">
        <MoneyText amount={row.amount} className="text-sm font-bold text-amber-700 dark:text-amber-300" />
      </td>
      <td className="py-3.5 pr-4 hidden sm:table-cell">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          Tháng {row.request_month}/{row.request_year}
        </span>
      </td>
      <td className="py-3.5 pr-4 hidden sm:table-cell">
        <span className="text-xs text-gray-400 dark:text-gray-400 line-clamp-1">{row.reason || "—"}</span>
      </td>
      <td className="py-3.5 pr-4 text-center">
        <Chip
          size="sm"
          color={isApproved ? "warning" : row.status === "paid" ? "success" : "default"}
          variant="flat"
          className="text-[11px]"
        >
          {isApproved ? "Chờ giải ngân" : row.status === "paid" ? "Đã giải ngân" : row.status}
        </Chip>
      </td>
      <td className="py-3.5 pr-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-end">
          {isApproved && (
            <Button
              size="sm" color="warning" variant="flat"
              className="h-7 text-[11px]"
              isLoading={disbursing === row.id}
              onPress={() => onDisburse(row)}
            >
              Giải ngân
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

function DisburseModal({ advance, onClose, onDone }) {
  const [notes, setNotes]   = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      await accountantService.disburseAdvance(advance.id, notes.trim() || undefined);
      onDone();
      onClose();
      notify.success("Đã xác nhận giải ngân ứng lương.");
    } catch (err) {
      const message = err.message ?? "Lỗi khi giải ngân.";
      setError(message);
      notify.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} size="sm">
      <ModalContent>
        <ModalHeader className="flex flex-col gap-0.5">
          <span>Giải ngân ứng lương</span>
          <span className="text-sm font-normal text-gray-400 dark:text-gray-400">{advance.driver_name}</span>
        </ModalHeader>
        <ModalBody>
          <div className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-500/10 rounded-lg mb-1 text-sm border border-amber-100 dark:border-amber-500/20">
            <span className="text-gray-600 dark:text-gray-300">Số tiền ứng</span>
            <MoneyText amount={advance.amount} className="font-bold text-amber-700 dark:text-amber-300" />
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 px-1">
            Tháng {advance.request_month}/{advance.request_year}
            {advance.reason && ` · ${advance.reason}`}
          </div>
          {error && (
            <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-500/10 p-3 rounded-lg">
              <RiAlertLine size={13} />
              {error}
            </div>
          )}
          <Input
            label="Ghi chú (tuỳ chọn)"
            placeholder="Ví dụ: Chuyển khoản MB Bank 25/06/2026"
            value={notes}
            onValueChange={setNotes}
          />
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose} isDisabled={saving}>Huỷ</Button>
          <Button color="warning" onPress={handleSubmit} isLoading={saving}>
            Xác nhận giải ngân
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

function AdjustModal({ row, onClose, onDone }) {
  const [bonus, setBonus]       = useState(String(Number(row.manual_bonus || 0)));
  const [deduction, setDeduction] = useState(String(Number(row.manual_deduction || 0)));
  const [note, setNote]         = useState(row.adjustment_note || "");
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState(null);

  const handleSubmit = async () => {
    const b = Number(bonus), d = Number(deduction);
    if (!Number.isFinite(b) || b < 0 || !Number.isFinite(d) || d < 0) {
      const message = "Số tiền điều chỉnh phải là số không âm.";
      setError(message);
      notify.error(message);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await accountantService.adjustPayroll(row.id, { manual_bonus: b, manual_deduction: d, note: note.trim() });
      onDone();
      onClose();
      notify.success("Đã điều chỉnh bảng lương.");
    } catch (err) {
      const message = err.message ?? "Lỗi khi điều chỉnh.";
      setError(message);
      notify.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} size="md">
      <ModalContent>
        <ModalHeader className="flex flex-col gap-0.5">
          <span>Điều chỉnh lương — {row.driver_name}</span>
          <span className="text-sm font-normal text-gray-400 dark:text-gray-400">
            Kỳ lương tháng {row.payroll_month}/{row.payroll_year}
          </span>
        </ModalHeader>
        <ModalBody>
          <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-white/5 rounded-lg p-3">
            Nhập khoản điều chỉnh thêm ngoài số hệ thống tự tính. Sau khi lưu, phiếu quay về
            trạng thái <b>Chờ duyệt</b> để duyệt lại từ đầu. Các số hệ thống (lương cứng, thưởng DT/KPI,
            BHXH…) giữ nguyên.
          </div>
          {error && (
            <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-500/10 p-3 rounded-lg">
              <RiAlertLine size={13} /> {error}
            </div>
          )}
          <Input
            type="number" min={0} label="Thưởng thêm (+)" placeholder="0"
            value={bonus} onValueChange={setBonus}
            endContent={<span className="text-xs text-gray-400 dark:text-gray-400">đ</span>}
          />
          <Input
            type="number" min={0} label="Khấu trừ thêm (−)" placeholder="0"
            value={deduction} onValueChange={setDeduction}
            endContent={<span className="text-xs text-gray-400 dark:text-gray-400">đ</span>}
          />
          <Input
            label="Lý do / ghi chú" placeholder="Ví dụ: bù thưởng chuyên cần còn thiếu"
            value={note} onValueChange={setNote}
          />
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose} isDisabled={saving}>Huỷ</Button>
          <Button color="warning" onPress={handleSubmit} isLoading={saving}>
            Lưu &amp; tính lại
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

function RevertModal({ row, onClose, onDone }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      await accountantService.revertPayroll(row.id, reason.trim());
      onDone();
      onClose();
      notify.success("Đã trả bảng lương về tính lại.");
    } catch (err) {
      const message = err.message ?? "Lỗi khi trả về.";
      setError(message);
      notify.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} size="sm">
      <ModalContent>
        <ModalHeader className="flex flex-col gap-0.5">
          <span>Trả về tính lại — {row.driver_name}</span>
          <span className="text-sm font-normal text-gray-400 dark:text-gray-400">
            Kỳ lương tháng {row.payroll_month}/{row.payroll_year}
          </span>
        </ModalHeader>
        <ModalBody>
          <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-white/5 rounded-lg p-3">
            Phiếu sẽ quay về trạng thái <b>Chờ duyệt</b> (huỷ mọi dấu duyệt trước đó) để tính lại
            hoặc điều chỉnh. Chỉ áp dụng khi phiếu chưa trả lương.
          </div>
          {error && (
            <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-500/10 p-3 rounded-lg">
              <RiAlertLine size={13} /> {error}
            </div>
          )}
          <Input
            isRequired
            label="Lý do trả về" placeholder="Ví dụ: sai ngày công tháng này"
            value={reason} onValueChange={setReason}
          />
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose} isDisabled={saving}>Huỷ</Button>
          <Button
            color="danger" onPress={handleSubmit} isLoading={saving}
            isDisabled={!reason.trim()}
          >
            Trả về tính lại
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export function PayrollView({ defaultTab = "payroll" }) {
  const {
    period, setPeriod,
    payrolls, stats, loading, error,
    refetch,
  } = usePayroll();

  const {
    statusFilter, setStatusFilter,
    advances, loading: advLoading,
    refetch: refetchAdvances,
  } = useSalaryAdvances();

  const [tab, setTab] = useState(defaultTab);
  const [confirming, setConfirming] = useState(null);
  const [vehicleGroups, setVehicleGroups] = useState([]);
  const [editingDriver, setEditingDriver] = useState(null);
  const [companyInfo, setCompanyInfo] = useState(null);

  useEffect(() => {
    accountantService.getVehicleGroupsForKpi()
      .then((data) => setVehicleGroups(data.vehicleGroups || []))
      .catch(() => {});
    accountantService.getCompanyInfo()
      .then((data) => setCompanyInfo(data?.info || null))
      .catch(() => {});
  }, []);

  const handleExportPdf = (row) => {
    exportPayslipToPDF(row, { month: period.month, year: period.year, companyInfo });
  };
  const [generating, setGenerating] = useState(false);
  const [generateErr, setGenerateErr] = useState(null);
  const [disburseTarget, setDisburseTarget] = useState(null);
  const [adjustTarget, setAdjustTarget] = useState(null);
  const [revertTarget, setRevertTarget] = useState(null);

  const [payPage, setPayPage]         = useState(1);
  const [payPageSize, setPayPageSize] = useState(10);

  const [payrollSearch, setPayrollSearch]             = useState("");
  const [payrollStatusFilter, setPayrollStatusFilter] = useState("");
  const [payrollSort, setPayrollSort]                 = useState("net_desc");

  const [advPage, setAdvPage]         = useState(1);
  const [advPageSize, setAdvPageSize] = useState(10);

  // Quyết toán tài xế nghỉ việc — tải ở đây (không trong panel) để nhãn tab có số chờ xử lý
  const [settlements, setSettlements]     = useState([]);
  const [settleLoading, setSettleLoading] = useState(false);
  const [settleError, setSettleError]     = useState(null);

  const loadSettlements = async () => {
    setSettleLoading(true);
    setSettleError(null);
    try {
      const data = await accountantService.getTerminationSettlements();
      setSettlements(data?.settlements || []);
    } catch (err) {
      setSettleError(err.message || "Không tải được danh sách quyết toán.");
    } finally {
      setSettleLoading(false);
    }
  };

  useEffect(() => { loadSettlements(); }, []);

  const openSettlements = settlements.filter((s) => !s.settled).length;

  // Từ màn quyết toán nhảy sang đúng kỳ lương cuối của tài đó
  const openPayrollFor = (month, year, driverName) => {
    setPeriod({ month, year });
    setPayrollSearch(driverName || "");
    setPayrollStatusFilter("");
    setPayPage(1);
    setTab("payroll");
  };

  const filteredPayrolls = useMemo(() => {
    const rows = payrolls.filter((row) => {
      if (payrollStatusFilter && row.status !== payrollStatusFilter) return false;
      if (payrollSearch && !(row.driver_name ?? "").toLowerCase().includes(payrollSearch.toLowerCase())) return false;
      return true;
    });
    const sorted = [...rows];
    if (payrollSort === "net_asc") {
      sorted.sort((a, b) => Number(a.net_salary || 0) - Number(b.net_salary || 0));
    } else if (payrollSort === "status") {
      const order = { pending: 0, reviewed: 1, approved: 2, paid: 3 };
      sorted.sort((a, b) => (order[a.status] ?? 99) - (order[b.status] ?? 99));
    } else {
      sorted.sort((a, b) => Number(b.net_salary || 0) - Number(a.net_salary || 0));
    }
    return sorted;
  }, [payrolls, payrollStatusFilter, payrollSearch, payrollSort]);

  const pagedPayrolls = useMemo(() => {
    const start = (payPage - 1) * payPageSize;
    return filteredPayrolls.slice(start, start + payPageSize);
  }, [filteredPayrolls, payPage, payPageSize]);

  const pagedAdvances = useMemo(() => {
    const start = (advPage - 1) * advPageSize;
    return advances.slice(start, start + advPageSize);
  }, [advances, advPage, advPageSize]);

  // Chỉ che toàn bộ bảng bằng spinner ở lần tải đầu. Những lần tải lại sau (đổi tháng,
  // bấm làm mới, sau khi duyệt/chi) vẫn giữ bảng cũ và chỉ làm mờ — nếu tháo bảng ra thì
  // khung co lại rồi bung ra, cả trang giật lên giật xuống.
  const isInitialLoad = loading && payrolls.length === 0;

  const payTotalPages = Math.max(1, Math.ceil(filteredPayrolls.length / payPageSize));
  const advTotalPages = Math.max(1, Math.ceil(advances.length / advPageSize));

  const handleGenerate = async () => {
    setGenerating(true);
    setGenerateErr(null);
    try {
      await accountantService.generatePayrolls(period.month, period.year);
      refetch();
      notify.success("Đã tạo bảng lương.");
    } catch (err) {
      setGenerateErr(err.message);
      notify.error(err.message || "Không thể tạo bảng lương.");
    } finally {
      setGenerating(false);
    }
  };

  const handleConfirm = async (id) => {
    if (!(await confirmDialog({
      title: "Xác nhận bảng lương",
      description: "Xác nhận bảng lương này để chuyển sang bước chi trả?",
      confirmLabel: "Xác nhận",
    }))) return;
    setConfirming(id);
    try {
      await accountantService.confirmPayroll(id);
      refetch();
      notify.success("Đã xác nhận bảng lương.");
    } catch (err) {
      notify.error(err.message || "Không thể xác nhận bảng lương.");
    } finally {
      setConfirming(null);
    }
  };

  const handlePay = async (id) => {
    if (!(await confirmDialog({
      title: "Đánh dấu đã trả lương",
      description: "Xác nhận đã trả lương cho tài xế? Thao tác này sẽ cập nhật trạng thái phiếu lương.",
      confirmLabel: "Đã trả",
      danger: true,
    }))) return;
    setConfirming(id);
    try {
      const res = await accountantService.markPayrollPaid(id);
      refetch();
      loadSettlements();
      notify.success("Đã đánh dấu đã trả lương.");
      // Ứng lương vượt lương kỳ (thường là kỳ cuối khi nghỉ việc) → đã thành công nợ để thu
      if (res?.payroll?.advance_carried_to_debt) notify.warning(res.payroll.advance_carried_to_debt);
    } catch (err) {
      notify.error(err.message || "Không thể đánh dấu đã trả lương.");
    } finally {
      setConfirming(null);
    }
  };

  const pendingAdvances = advances.filter((a) => a.status === "approved");

  return (
    <div className="flex flex-col gap-5">
      {}
      <div className="flex items-center gap-1 bg-gray-100 dark:bg-white/10 p-1 rounded-lg w-fit">
        {[
          { key: "payroll", label: "Bảng lương" },
          { key: "advance", label: `Ứng lương${pendingAdvances.length ? ` (${pendingAdvances.length})` : ""}` },
          { key: "settlement", label: `Quyết toán nghỉ việc${openSettlements ? ` (${openSettlements})` : ""}` },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-150
              ${tab === key ? "bg-white dark:bg-[#161922] text-gray-900 dark:text-gray-100 shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {}
      {tab === "payroll" && (
        <>
          {}
          {/* Luôn dựng sẵn 4 thẻ (số 0 khi chưa có dữ liệu) — nếu ẩn đi lúc chưa tải xong
              thì khi số về, cả khối bên dưới bị đẩy xuống ~140px, nhìn như trang bị giật. */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard
                label="Tổng tài xế"
                value={stats?.total_drivers ?? 0}
                icon={RiGroupLine}
                bg="bg-blue-50 dark:bg-blue-500/10" text="text-blue-600 dark:text-blue-300" border="border-blue-100 dark:border-blue-500/20"
              />
              <StatCard
                label="Chờ xác nhận"
                value={stats?.reviewed_count ?? 0}
                icon={RiTimeLine}
                bg="bg-amber-50 dark:bg-amber-500/10" text="text-amber-600 dark:text-amber-300" border="border-amber-100 dark:border-amber-500/20"
              />
              <StatCard
                label="Tổng lương gộp"
                value={VND(stats?.total_gross)}
                icon={RiLineChartLine}
                bg="bg-violet-50 dark:bg-violet-500/10" text="text-violet-600 dark:text-violet-300" border="border-violet-100 dark:border-violet-500/20"
              />
              <StatCard
                label="Tổng thực nhận"
                value={VND(stats?.total_net)}
                icon={RiMoneyDollarCircleLine}
                bg="bg-emerald-50 dark:bg-emerald-500/10" text="text-emerald-600 dark:text-emerald-300" border="border-emerald-100 dark:border-emerald-500/20"
              />
          </div>

          {}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Select
                size="sm"
                selectedKeys={new Set([String(period.month)])}
                onSelectionChange={(s) => { setPeriod((p) => ({ ...p, month: Number([...s][0]) })); setPayPage(1); }}
                className="w-36"
                aria-label="Tháng"
              >
                {MONTHS.map(({ key, label }) => (
                  <SelectItem key={key}>{label}</SelectItem>
                ))}
              </Select>
              <Select
                size="sm"
                selectedKeys={new Set([String(period.year)])}
                onSelectionChange={(s) => { setPeriod((p) => ({ ...p, year: Number([...s][0]) })); setPayPage(1); }}
                className="w-28"
                aria-label="Năm"
              >
                {YEARS.map(({ key, label }) => (
                  <SelectItem key={key}>{label}</SelectItem>
                ))}
              </Select>
              <Button
                size="sm" variant="flat" isIconOnly
                onPress={refetch} title="Làm mới"
                className="h-8 w-8"
              >
                <RiRefreshLine size={15} />
              </Button>
            </div>

            <Button
              size="sm" color="primary" variant="bordered"
              isLoading={generating}
              onPress={handleGenerate}
              startContent={!generating && <RiRefreshLine size={15} />}
            >
              Tính lương tháng {period.month}/{period.year}
            </Button>
          </div>

          {}
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              size="sm"
              placeholder="Tìm theo tên tài xế..."
              value={payrollSearch}
              onValueChange={(v) => { setPayrollSearch(v); setPayPage(1); }}
              className="w-56"
              startContent={ic(RiSearchLine)}
            />
            <Select
              size="sm"
              placeholder="Trạng thái"
              aria-label="Trạng thái"
              className="w-52"
              selectedKeys={new Set([payrollStatusFilter])}
              onChange={(e) => { setPayrollStatusFilter(e.target.value); setPayPage(1); }}
              startContent={ic(RiFilter3Line)}
            >
              {PAYROLL_STATUS_OPTIONS.map(({ key, label }) => (
                <SelectItem key={key} textValue={label}>{label}</SelectItem>
              ))}
            </Select>
            <Select
              size="sm"
              placeholder="Sắp xếp"
              aria-label="Sắp xếp"
              className="w-48"
              selectedKeys={new Set([payrollSort])}
              onChange={(e) => { setPayrollSort(e.target.value); setPayPage(1); }}
              startContent={ic(RiSortDesc)}
            >
              {PAYROLL_SORT_OPTIONS.map(({ key, label }) => (
                <SelectItem key={key} textValue={label}>{label}</SelectItem>
              ))}
            </Select>
          </div>

          {generateErr && (
            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-500/10 p-3 rounded-lg border border-red-100 dark:border-red-500/20">
              <RiAlertLine size={15} />
              {generateErr}
            </div>
          )}

          {}
          <div className="rounded-xl border border-gray-200 dark:border-white/10 overflow-hidden bg-white dark:bg-[#161922] shadow-sm">
            {isInitialLoad ? (
              <div className="flex items-center justify-center py-20">
                <Spinner color="secondary" label="Đang tải..." size="lg" />
              </div>
            ) : error ? (
              <div className="flex items-center justify-center py-16 gap-2 text-red-500">
                <RiAlertLine size={18} />
                <span className="text-sm">{error}</span>
              </div>
            ) : payrolls.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-12 h-12 rounded-full bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center">
                  <RiWalletLine size={20} className="text-violet-400" />
                </div>
                <p className="text-gray-500 dark:text-gray-400 text-sm">Chưa có bảng lương tháng này.</p>
                <Button size="sm" color="primary" variant="flat" onPress={handleGenerate} isLoading={generating}>
                  Tạo bảng lương ngay
                </Button>
              </div>
            ) : filteredPayrolls.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-12 h-12 rounded-full bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center">
                  <RiWalletLine size={20} className="text-violet-400" />
                </div>
                <p className="text-gray-500 dark:text-gray-400 text-sm">Không tìm thấy bảng lương phù hợp bộ lọc.</p>
              </div>
            ) : (
              <div className={`overflow-x-auto transition-opacity duration-150
                              ${loading ? "opacity-50 pointer-events-none" : "opacity-100"}`}>
              {/* table-fixed: khoá bề ngang cột theo hàng tiêu đề. Để auto thì mỗi lần
                  lọc / đổi trang / mở dòng chi tiết (td colSpan) trình duyệt tính lại
                  bề ngang → cả bảng nhảy. */}
              <table className="w-full table-fixed min-w-[820px]">
                <thead>
                  <tr className="bg-gray-50 dark:bg-white/5 border-b border-gray-200 dark:border-white/10">
                    {[
                      { label: "", cls: "w-11 text-left" },
                      { label: "Tài xế", cls: "w-[24%] text-left" },
                      { label: "Nhóm xe", cls: "w-[16%] text-left hidden sm:table-cell" },
                      { label: "Lương gộp", cls: "w-[16%] text-right" },
                      { label: "Thực nhận", cls: "w-[16%] text-right" },
                      { label: "Trạng thái", cls: "w-[15%] text-center" },
                      { label: "", cls: "w-[13%] text-right" },
                    ].map(({ label, cls }, i) => (
                      <th
                        key={i}
                        className={`text-[11px] font-semibold text-gray-400 dark:text-gray-400 uppercase
                                   tracking-wider py-3 pr-4 first:pl-4 ${cls ?? ""}`}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedPayrolls.map((row) => (
                    <PayrollRow
                      key={row.id}
                      row={row}
                      onConfirm={handleConfirm}
                      onPay={handlePay}
                      confirming={confirming}
                      onEditGroup={setEditingDriver}
                      onExportPdf={handleExportPdf}
                      onAdjust={setAdjustTarget}
                      onRevert={setRevertTarget}
                    />
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>

          {}
          {filteredPayrolls.length > 0 && (
            <PaginationBar
              page={Math.min(payPage, payTotalPages)}
              pageSize={payPageSize}
              totalItems={filteredPayrolls.length}
              totalPages={payTotalPages}
              onPageChange={setPayPage}
              onPageSizeChange={(s) => { setPayPageSize(s); setPayPage(1); }}
            />
          )}
        </>
      )}

      {}
      {tab === "settlement" && (
        <TerminationSettlementPanel
          rows={settlements}
          loading={settleLoading}
          error={settleError}
          onRefresh={loadSettlements}
          onOpenPayroll={openPayrollFor}
        />
      )}

      {tab === "advance" && (
        <>
          {}
          <div className="flex items-center gap-2">
            <div className="flex gap-1 bg-gray-100 dark:bg-white/10 p-1 rounded-lg">
              {[
                { key: "approved", label: "Chờ giải ngân" },
                { key: "paid",     label: "Đã giải ngân" },
                { key: "",         label: "Tất cả" },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => { setStatusFilter(key); setAdvPage(1); }}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-150
                    ${statusFilter === key ? "bg-white dark:bg-[#161922] text-gray-900 dark:text-gray-100 shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <Button size="sm" variant="flat" isIconOnly onPress={refetchAdvances} className="h-8 w-8">
              <RiRefreshLine size={15} />
            </Button>
          </div>

          {}
          <div className="rounded-xl border border-gray-200 dark:border-white/10 overflow-hidden bg-white dark:bg-[#161922] shadow-sm">
            {advLoading && advances.length === 0 ? (
              <div className="flex items-center justify-center py-20">
                <Spinner color="warning" label="Đang tải..." size="lg" />
              </div>
            ) : advances.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-12 h-12 rounded-full bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center">
                  <RiCheckboxCircleLine size={20} className="text-amber-400" />
                </div>
                <p className="text-gray-500 dark:text-gray-400 text-sm">Không có yêu cầu ứng lương nào.</p>
              </div>
            ) : (
              <div className={`overflow-x-auto transition-opacity duration-150
                              ${advLoading ? "opacity-50 pointer-events-none" : "opacity-100"}`}>
              <table className="w-full table-fixed min-w-[760px]">
                <thead>
                  <tr className="bg-gray-50 dark:bg-white/5 border-b border-gray-200 dark:border-white/10">
                    {[
                      { label: "Tài xế", cls: "w-[22%] text-left" },
                      { label: "Số tiền", cls: "w-[16%] text-right" },
                      { label: "Kỳ lương", cls: "w-[14%] text-left hidden sm:table-cell" },
                      { label: "Lý do", cls: "w-[22%] text-left hidden sm:table-cell" },
                      { label: "Trạng thái", cls: "w-[14%] text-center" },
                      { label: "", cls: "w-[12%] text-right" },
                    ].map(({ label, cls }, i) => (
                      <th
                        key={i}
                        className={`text-[11px] font-semibold text-gray-400 dark:text-gray-400 uppercase
                                   tracking-wider py-3 pr-4 first:pl-4 ${cls ?? ""}`}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedAdvances.map((row) => (
                    <AdvanceRow
                      key={row.id}
                      row={row}
                      onDisburse={setDisburseTarget}
                      disbursing={null}
                    />
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>

          {}
          {advances.length > 0 && (
            <PaginationBar
              page={Math.min(advPage, advTotalPages)}
              pageSize={advPageSize}
              totalItems={advances.length}
              totalPages={advTotalPages}
              onPageChange={setAdvPage}
              onPageSizeChange={(s) => { setAdvPageSize(s); setAdvPage(1); }}
            />
          )}
        </>
      )}

      {disburseTarget && (
        <DisburseModal
          advance={disburseTarget}
          onClose={() => setDisburseTarget(null)}
          onDone={refetchAdvances}
        />
      )}

      {adjustTarget && (
        <AdjustModal
          row={adjustTarget}
          onClose={() => setAdjustTarget(null)}
          onDone={refetch}
        />
      )}

      {revertTarget && (
        <RevertModal
          row={revertTarget}
          onClose={() => setRevertTarget(null)}
          onDone={refetch}
        />
      )}

      <DriverVehicleGroupModal
        open={!!editingDriver}
        driver={editingDriver}
        vehicleGroups={vehicleGroups}
        getHistory={accountantService.getDriverGroupHistory}
        readOnly   // đổi nhóm xe cố định là độc quyền Manager, kế toán chỉ tra cứu
        onClose={() => setEditingDriver(null)}
      />
    </div>
  );
}
