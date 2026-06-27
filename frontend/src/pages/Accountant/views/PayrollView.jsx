import { useState, useMemo } from "react";
import {
  Spinner, Button, Chip, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Input, Select, SelectItem,
} from "@heroui/react";
import {
  RiGroupLine, RiMoneyDollarCircleLine, RiCheckboxCircleLine, RiTimeLine,
  RiRefreshLine, RiArrowDownSLine, RiArrowUpSLine,
  RiLineChartLine, RiAlertLine, RiHandCoinLine, RiWalletLine,
} from "react-icons/ri";
import { MoneyText } from "../components/shared/MoneyText";
import { PaginationBar } from "../components/shared/PaginationBar";
import { usePayroll, useSalaryAdvances } from "../hooks/usePayroll";
import { accountantService } from "../services/accountant.service";

const VND = (n) => Number(n || 0).toLocaleString("vi-VN") + "đ";

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

// ─── Stat card ───────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, bg, text, border }) {
  return (
    <div className={`relative overflow-hidden rounded-xl bg-white border ${border} p-5 flex flex-col gap-3 shadow-sm`}>
      <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center`}>
        <Icon size={18} className={text} />
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</span>
        <span className={`text-2xl font-bold ${text}`}>{value}</span>
      </div>
    </div>
  );
}

// ─── Payroll row (expandable) ────────────────────────────────────────────────
function PayrollRow({ row, onConfirm, onPay, confirming }) {
  const [expanded, setExpanded] = useState(false);
  const chip = STATUS_CHIP[row.status] ?? { color: "default", label: row.status };

  const detail = [
    { label: "Lương cứng",      value: row.base_salary },
    { label: "Doanh thu",       value: row.total_revenue },
    { label: "Thưởng DT (15%)", value: row.revenue_bonus },
    { label: "Phụ cấp ĐT",     value: "200,000đ",       raw: true },
    { label: "Thưởng KPI",      value: row.kpi_bonus },
    { label: "Thưởng xuất sắc", value: row.top_driver_bonus },
    { label: "Lương gộp",       value: row.gross_salary,  bold: true },
    { label: "BHXH (10.5%)",    value: `-${VND(row.insurance_employee)}`, raw: true, neg: true },
    { label: "Nghỉ không lương",value: `-${VND(row.absence_penalty)}`,    raw: true, neg: true },
    { label: "Trừ ứng lương",   value: `-${VND(row.advance_deduction)}`,  raw: true, neg: true },
    { label: "Trừ công nợ",     value: `-${VND(row.driver_debt_deduction)}`, raw: true, neg: true },
    { label: "Lương thực nhận", value: row.net_salary,   bold: true, highlight: true },
  ];

  return (
    <>
      <tr
        className={`border-b border-gray-100 cursor-pointer transition-colors
                   ${expanded ? "bg-violet-50/40" : "hover:bg-gray-50/60"}`}
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="py-3.5 pl-4 w-9">
          <span className="text-gray-400">
            {expanded ? <RiArrowUpSLine size={17} /> : <RiArrowDownSLine size={17} />}
          </span>
        </td>
        <td className="py-3.5 pr-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold text-gray-800">{row.driver_name}</span>
            {row.driver_phone && (
              <span className="text-xs text-gray-400 font-mono">{row.driver_phone}</span>
            )}
          </div>
        </td>
        <td className="py-3.5 pr-4 hidden sm:table-cell">
          <span className="text-xs text-gray-500">{row.vehicle_group || "—"}</span>
        </td>
        <td className="py-3.5 pr-4">
          <MoneyText amount={row.gross_salary} className="text-sm font-semibold text-gray-700" />
        </td>
        <td className="py-3.5 pr-4">
          <MoneyText amount={row.net_salary} className="text-sm font-bold text-violet-700" />
        </td>
        <td className="py-3.5 pr-4">
          <Chip size="sm" color={chip.color} variant="flat" className="text-[11px]">
            {chip.label}
          </Chip>
        </td>
        <td className="py-3.5 pr-4 w-36" onClick={(e) => e.stopPropagation()}>
          <div className="flex gap-1.5">
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
          </div>
        </td>
      </tr>

      {expanded && (
        <tr className="bg-violet-50/30 border-b border-violet-100/50">
          <td colSpan={7} className="px-10 py-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {detail.map(({ label, value, raw, neg, bold, highlight }) => (
                <div
                  key={label}
                  className={`flex justify-between items-center p-2.5 rounded-lg text-xs
                    ${highlight ? "bg-violet-100 col-span-2 sm:col-span-3" : "bg-white"}`}
                >
                  <span className="text-gray-500">{label}</span>
                  <span className={`font-${bold ? "bold" : "medium"} ${
                    highlight ? "text-violet-700 text-sm" :
                    neg ? "text-red-500" : "text-gray-800"
                  }`}>
                    {raw ? value : <MoneyText amount={value} />}
                  </span>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Salary Advance row ───────────────────────────────────────────────────────
function AdvanceRow({ row, onDisburse, disbursing }) {
  const isApproved = row.status === "approved";
  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50/60 transition-colors">
      <td className="py-3.5 pl-4 pr-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-gray-800">{row.driver_name}</span>
          {row.driver_phone && (
            <span className="text-xs text-gray-400 font-mono">{row.driver_phone}</span>
          )}
        </div>
      </td>
      <td className="py-3.5 pr-4">
        <MoneyText amount={row.amount} className="text-sm font-bold text-amber-700" />
      </td>
      <td className="py-3.5 pr-4 hidden sm:table-cell">
        <span className="text-xs text-gray-500">
          Tháng {row.request_month}/{row.request_year}
        </span>
      </td>
      <td className="py-3.5 pr-4 hidden sm:table-cell">
        <span className="text-xs text-gray-400 line-clamp-1">{row.reason || "—"}</span>
      </td>
      <td className="py-3.5 pr-4">
        <Chip
          size="sm"
          color={isApproved ? "warning" : row.status === "paid" ? "success" : "default"}
          variant="flat"
          className="text-[11px]"
        >
          {isApproved ? "Chờ giải ngân" : row.status === "paid" ? "Đã giải ngân" : row.status}
        </Chip>
      </td>
      <td className="py-3.5 pr-4 w-32" onClick={(e) => e.stopPropagation()}>
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
      </td>
    </tr>
  );
}

// ─── Disburse modal ───────────────────────────────────────────────────────────
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
    } catch (err) {
      setError(err.message ?? "Lỗi khi giải ngân.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} size="sm">
      <ModalContent>
        <ModalHeader className="flex flex-col gap-0.5">
          <span>Giải ngân ứng lương</span>
          <span className="text-sm font-normal text-gray-400">{advance.driver_name}</span>
        </ModalHeader>
        <ModalBody>
          <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg mb-1 text-sm border border-amber-100">
            <span className="text-gray-600">Số tiền ứng</span>
            <MoneyText amount={advance.amount} className="font-bold text-amber-700" />
          </div>
          <div className="text-xs text-gray-500 px-1">
            Tháng {advance.request_month}/{advance.request_year}
            {advance.reason && ` · ${advance.reason}`}
          </div>
          {error && (
            <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 p-3 rounded-lg">
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

// ─── Main PayrollView ─────────────────────────────────────────────────────────
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
  const [generating, setGenerating] = useState(false);
  const [generateErr, setGenerateErr] = useState(null);
  const [disburseTarget, setDisburseTarget] = useState(null);

  // Pagination — payroll tab
  const [payPage, setPayPage]         = useState(1);
  const [payPageSize, setPayPageSize] = useState(10);

  // Pagination — advance tab
  const [advPage, setAdvPage]         = useState(1);
  const [advPageSize, setAdvPageSize] = useState(10);

  const pagedPayrolls = useMemo(() => {
    const start = (payPage - 1) * payPageSize;
    return payrolls.slice(start, start + payPageSize);
  }, [payrolls, payPage, payPageSize]);

  const pagedAdvances = useMemo(() => {
    const start = (advPage - 1) * advPageSize;
    return advances.slice(start, start + advPageSize);
  }, [advances, advPage, advPageSize]);

  const payTotalPages = Math.max(1, Math.ceil(payrolls.length / payPageSize));
  const advTotalPages = Math.max(1, Math.ceil(advances.length / advPageSize));

  const handleGenerate = async () => {
    setGenerating(true);
    setGenerateErr(null);
    try {
      await accountantService.generatePayrolls(period.month, period.year);
      refetch();
    } catch (err) {
      setGenerateErr(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleConfirm = async (id) => {
    setConfirming(id);
    try {
      await accountantService.confirmPayroll(id);
      refetch();
    } finally {
      setConfirming(null);
    }
  };

  const handlePay = async (id) => {
    setConfirming(id);
    try {
      await accountantService.markPayrollPaid(id);
      refetch();
    } finally {
      setConfirming(null);
    }
  };

  const pendingAdvances = advances.filter((a) => a.status === "approved");

  return (
    <div className="flex flex-col gap-5">
      {/* Top tabs */}
      <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {[
          { key: "payroll", label: "Bảng lương" },
          { key: "advance", label: `Ứng lương${pendingAdvances.length ? ` (${pendingAdvances.length})` : ""}` },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-150
              ${tab === key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Payroll tab ─────────────────────────────────────────────────────── */}
      {tab === "payroll" && (
        <>
          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard
                label="Tổng tài xế"
                value={stats.total_drivers ?? 0}
                icon={RiGroupLine}
                bg="bg-blue-50" text="text-blue-600" border="border-blue-100"
              />
              <StatCard
                label="Chờ xác nhận"
                value={stats.reviewed_count ?? 0}
                icon={RiTimeLine}
                bg="bg-amber-50" text="text-amber-600" border="border-amber-100"
              />
              <StatCard
                label="Tổng lương gộp"
                value={VND(stats.total_gross)}
                icon={RiLineChartLine}
                bg="bg-violet-50" text="text-violet-600" border="border-violet-100"
              />
              <StatCard
                label="Tổng thực nhận"
                value={VND(stats.total_net)}
                icon={RiMoneyDollarCircleLine}
                bg="bg-emerald-50" text="text-emerald-600" border="border-emerald-100"
              />
            </div>
          )}

          {/* Controls */}
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

          {generateErr && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">
              <RiAlertLine size={15} />
              {generateErr}
            </div>
          )}

          {/* Table */}
          <div className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
            {loading ? (
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
                <div className="w-12 h-12 rounded-full bg-violet-50 flex items-center justify-center">
                  <RiWalletLine size={20} className="text-violet-400" />
                </div>
                <p className="text-gray-500 text-sm">Chưa có bảng lương tháng này.</p>
                <Button size="sm" color="primary" variant="flat" onPress={handleGenerate} isLoading={generating}>
                  Tạo bảng lương ngay
                </Button>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {[
                      { label: "", cls: "w-9" },
                      { label: "Tài xế" },
                      { label: "Nhóm xe", cls: "hidden sm:table-cell" },
                      { label: "Lương gộp" },
                      { label: "Thực nhận" },
                      { label: "Trạng thái" },
                      { label: "", cls: "w-36" },
                    ].map(({ label, cls }, i) => (
                      <th
                        key={i}
                        className={`text-left text-[11px] font-semibold text-gray-400 uppercase
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
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Payroll pagination */}
          {!loading && payrolls.length > 0 && (
            <PaginationBar
              page={Math.min(payPage, payTotalPages)}
              pageSize={payPageSize}
              totalItems={payrolls.length}
              totalPages={payTotalPages}
              onPageChange={setPayPage}
              onPageSizeChange={(s) => { setPayPageSize(s); setPayPage(1); }}
            />
          )}
        </>
      )}

      {/* ── Advance tab ──────────────────────────────────────────────────────── */}
      {tab === "advance" && (
        <>
          {/* Filter */}
          <div className="flex items-center gap-2">
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
              {[
                { key: "approved", label: "Chờ giải ngân" },
                { key: "paid",     label: "Đã giải ngân" },
                { key: "",         label: "Tất cả" },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => { setStatusFilter(key); setAdvPage(1); }}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-150
                    ${statusFilter === key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <Button size="sm" variant="flat" isIconOnly onPress={refetchAdvances} className="h-8 w-8">
              <RiRefreshLine size={15} />
            </Button>
          </div>

          {/* Table */}
          <div className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
            {advLoading ? (
              <div className="flex items-center justify-center py-20">
                <Spinner color="warning" label="Đang tải..." size="lg" />
              </div>
            ) : advances.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center">
                  <RiCheckboxCircleLine size={20} className="text-amber-400" />
                </div>
                <p className="text-gray-500 text-sm">Không có yêu cầu ứng lương nào.</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {[
                      { label: "Tài xế" },
                      { label: "Số tiền" },
                      { label: "Kỳ lương", cls: "hidden sm:table-cell" },
                      { label: "Lý do", cls: "hidden sm:table-cell" },
                      { label: "Trạng thái" },
                      { label: "", cls: "w-32" },
                    ].map(({ label, cls }, i) => (
                      <th
                        key={i}
                        className={`text-left text-[11px] font-semibold text-gray-400 uppercase
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
            )}
          </div>

          {/* Advance pagination */}
          {!advLoading && advances.length > 0 && (
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
    </div>
  );
}
