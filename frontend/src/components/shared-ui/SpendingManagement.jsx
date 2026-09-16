import { useCallback, useEffect, useState } from "react";
import { notify } from "./Toast";
import { confirmDialog } from "./confirm";
import {
  Button, Select, SelectItem, Input, NumberInput, Textarea, Tabs, Tab, Chip, Spinner,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
} from "@heroui/react";
import {
  RiRefreshLine, RiCheckLine, RiCloseLine, RiAddLine, RiMoneyDollarCircleLine, RiWalletLine,
  RiCheckboxCircleLine, RiCloseCircleLine, RiHandCoinLine, RiTimeLine, RiArrowGoBackLine,
} from "react-icons/ri";
import { StatCard } from "./StatCard";
import { PaginationBar } from "./PaginationBar";
import { money } from "../../utils/formatNumber";

const NOW = new Date();
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const YEARS = [NOW.getFullYear(), NOW.getFullYear() - 1, NOW.getFullYear() - 2];
const fmt = (v) => money(v ?? 0);
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString("vi-VN") : "—");

const EXPENSE_TYPE_LABEL = {
  toll: "Cầu đường", parking: "Đỗ xe", etc: "ETC (thu không dừng)",
  fuel: "Xăng dầu", repair: "Sửa xe",
  maintenance: "Bảo dưỡng", depreciation: "Khấu hao", other: "Khác",
};

// Loại phiếu kế toán được TỰ CHỌN khi lập phiếu tay ở màn này — phải khớp allowlist
// VOUCHER_TYPES của backend, chọn loại ngoài danh sách là server từ chối.
const CREATABLE_VOUCHER_TYPES = {
  office: "Văn phòng phẩm", rent: "Thuê mặt bằng/kho", utilities: "Điện nước/Internet",
  equipment: "Mua sắm thiết bị", entertainment: "Tiếp khách", compensation: "Đền bù hàng hóa",
  other: "Khác",
};

// Thêm các loại CHỈ ĐỂ HIỂN THỊ: chúng luôn gắn với một bản ghi cụ thể (đơn hàng / khoản
// chi phí) nên chỉ sinh ra từ đúng luồng của nó, không cho chọn tay. Nhưng bảng và bộ lọc
// vẫn phải đọc được tên tiếng Việt, nếu không sẽ hiện chuỗi thô như "driver_reimbursement".
const VOUCHER_TYPE_LABEL = {
  ...CREATABLE_VOUCHER_TYPES,
  prepaid_refund: "Hoàn tiền trả trước",
  driver_reimbursement: "Hoàn ứng tài xế",
};

const EVENT_LABEL = {
  expense_recorded: "Chi phí vận hành & phiếu chi",
  pass_through_cost: "Chi hộ khách (thu lại sau)",
  payroll_paid: "Chi lương",
  bonus_paid: "Chi thưởng / phúc lợi",
  advance_disbursed: "Giải ngân ứng lương",
  prepaid_refunded: "Hoàn tiền trả trước",
};

const STATUS_COLOR = { pending: "warning", approved: "primary", rejected: "danger", paid: "success", cancelled: "default" };
const EXPENSE_STATUS_LABEL = { pending: "Chờ duyệt", approved: "Đã duyệt", rejected: "Từ chối" };

// Trạng thái hoàn tiền cho tài (khoản tài đã ứng túi)
const REIMB_CHIP = {
  pending:          { label: "Chờ hoàn tài",     color: "warning" },
  offset_debt:      { label: "Đã cấn trừ nợ",    color: "success" },
  paid_via_payroll: { label: "Đã hoàn qua lương", color: "success" },
  settled:          { label: "Đã tất toán",       color: "default" },
};
const VOUCHER_STATUS_LABEL = { pending: "Chờ duyệt", approved: "Đã duyệt — chờ chi", rejected: "Từ chối", paid: "Đã chi", cancelled: "Đã huỷ" };

const EMPTY_VOUCHER_FORM = { voucher_type: "", amount: "", payee: "", reason: "", payment_method: "cash" };

/**
 * Màn "Quản lý chi" dùng chung Manager/Accountant — quyền khác nhau qua props:
 *  - canModerateExpense: duyệt/từ chối chi phí tài xế (Manager)
 *  - canModerateVoucher: duyệt/từ chối phiếu chi     (Manager)
 *  - canCreateVoucher:   tạo phiếu chi               (Accountant)
 *  - canPayVoucher:      xác nhận đã chi tiền        (Accountant)
 *  - canCancelVoucher:   huỷ phiếu đã duyệt chưa chi (Accountant)
 * api: { listExpenses, approveExpense?, rejectExpense?, listVouchers,
 *        createVoucher?, approveVoucher?, rejectVoucher?, payVoucher?,
 *        cancelVoucher?, getSummary }
 */
export function SpendingManagement({ api, canModerateExpense, canModerateVoucher, canCreateVoucher, canPayVoucher, canCancelVoucher }) {
  const [tab, setTab] = useState("expenses");
  const [month, setMonth] = useState(NOW.getMonth() + 1);
  const [year, setYear] = useState(NOW.getFullYear());

  // ── Chi phí tài xế ──
  const [expenses, setExpenses] = useState([]);
  const [expenseStats, setExpenseStats] = useState(null);
  const [expenseLoading, setExpenseLoading] = useState(false);
  const [expenseStatus, setExpenseStatus] = useState("");
  const [expenseReimbStatus, setExpenseReimbStatus] = useState("");
  const [expenseType, setExpenseType] = useState("");
  const [expenseSearch, setExpenseSearch] = useState("");
  const [expensePage, setExpensePage] = useState(1);
  const [expensePageSize, setExpensePageSize] = useState(10);
  const [expensePagination, setExpensePagination] = useState({ total: 0, totalPages: 1 });
  const [expenseRejectTarget, setExpenseRejectTarget] = useState(null);
  const [expenseRejectReason, setExpenseRejectReason] = useState("");

  // ── Phiếu chi ──
  const [vouchers, setVouchers] = useState([]);
  const [voucherStats, setVoucherStats] = useState(null);
  const [voucherLoading, setVoucherLoading] = useState(false);
  const [voucherStatus, setVoucherStatus] = useState("");
  const [voucherType, setVoucherType] = useState("");
  const [voucherSearch, setVoucherSearch] = useState("");
  const [voucherPage, setVoucherPage] = useState(1);
  const [voucherPageSize, setVoucherPageSize] = useState(10);
  const [voucherPagination, setVoucherPagination] = useState({ total: 0, totalPages: 1 });
  const [voucherRejectTarget, setVoucherRejectTarget] = useState(null);
  const [voucherRejectReason, setVoucherRejectReason] = useState("");
  const [payTarget, setPayTarget] = useState(null);
  const [payMethod, setPayMethod] = useState("bank_transfer");
  const [payProofFile, setPayProofFile] = useState(null);
  const [voucherCancelTarget, setVoucherCancelTarget] = useState(null);
  const [voucherCancelReason, setVoucherCancelReason] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [voucherForm, setVoucherForm] = useState(EMPTY_VOUCHER_FORM);
  const [proofFile, setProofFile] = useState(null);

  // ── Tổng hợp ──
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const [acting, setActing] = useState(false);

  const loadExpenses = useCallback(async () => {
    setExpenseLoading(true);
    try {
      const res = await api.listExpenses({
        month, year, page: expensePage, limit: expensePageSize,
        ...(expenseStatus ? { status: expenseStatus } : {}),
        ...(expenseReimbStatus ? { reimbursement_status: expenseReimbStatus } : {}),
        ...(expenseType ? { expense_type: expenseType } : {}),
        ...(expenseSearch ? { search: expenseSearch } : {}),
      });
      setExpenses(res.rows || []);
      setExpenseStats(res.stats || null);
      setExpensePagination({ total: res.total ?? 0, totalPages: res.totalPages ?? 1 });
    } catch (e) {
      notify.error(e.message || "Lỗi tải chi phí");
    } finally {
      setExpenseLoading(false);
    }
  }, [api, month, year, expenseStatus, expenseReimbStatus, expenseType, expenseSearch, expensePage, expensePageSize]);

  const loadVouchers = useCallback(async () => {
    setVoucherLoading(true);
    try {
      const res = await api.listVouchers({
        month, year, page: voucherPage, limit: voucherPageSize,
        ...(voucherStatus ? { status: voucherStatus } : {}),
        ...(voucherType ? { voucher_type: voucherType } : {}),
        ...(voucherSearch ? { search: voucherSearch } : {}),
      });
      setVouchers(res.rows || []);
      setVoucherStats(res.stats || null);
      setVoucherPagination({ total: res.total ?? 0, totalPages: res.totalPages ?? 1 });
    } catch (e) {
      notify.error(e.message || "Lỗi tải phiếu chi");
    } finally {
      setVoucherLoading(false);
    }
  }, [api, month, year, voucherStatus, voucherType, voucherSearch, voucherPage, voucherPageSize]);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const res = await api.getSummary({ month, year });
      setSummary(res);
    } catch (e) {
      notify.error(e.message || "Lỗi tải tổng hợp chi");
    } finally {
      setSummaryLoading(false);
    }
  }, [api, month, year]);

  useEffect(() => { if (tab === "expenses") loadExpenses(); }, [tab, loadExpenses]);
  useEffect(() => { if (tab === "vouchers") loadVouchers(); }, [tab, loadVouchers]);
  useEffect(() => { if (tab === "summary") loadSummary(); }, [tab, loadSummary]);
  useEffect(() => { setExpensePage(1); }, [month, year, expenseStatus, expenseReimbStatus, expenseType, expenseSearch]);
  useEffect(() => { setVoucherPage(1); }, [month, year, voucherStatus, voucherType, voucherSearch]);

  // ── Actions: chi phí tài xế ──
  const handleApproveExpense = async (r) => {
    if (!(await confirmDialog({
      title: "Duyệt chi phí",
      description: `Duyệt chi phí ${fmt(r.amount)} cho ${r.driver_name || "tài xế"}?`,
      confirmLabel: "Duyệt",
    }))) return;
    setActing(true);
    try {
      await api.approveExpense(r.id);
      notify.success("Đã duyệt chi phí.");
      loadExpenses();
    } catch (e) {
      notify.error(e.message || "Lỗi duyệt chi phí");
    } finally {
      setActing(false);
    }
  };

  const handleUnapproveExpense = async (r) => {
    if (!(await confirmDialog({
      title: "Gỡ duyệt chi phí",
      description: `Gỡ duyệt khoản ${fmt(r.amount)} của ${r.driver_name || "tài xế"}? Khoản này về trạng thái chờ duyệt và tài xế sẽ sửa/xoá được.`,
      confirmLabel: "Gỡ duyệt",
    }))) return;
    setActing(true);
    try {
      await api.unapproveExpense(r.id);
      notify.success("Đã gỡ duyệt chi phí.");
      loadExpenses();
    } catch (e) {
      notify.error(e.message || "Lỗi gỡ duyệt chi phí");
    } finally {
      setActing(false);
    }
  };

  const handleRejectExpense = async () => {
    if (!expenseRejectReason.trim()) { notify.error("Vui lòng nhập lý do từ chối"); return; }
    setActing(true);
    try {
      await api.rejectExpense(expenseRejectTarget.id, expenseRejectReason.trim());
      setExpenseRejectTarget(null);
      setExpenseRejectReason("");
      notify.success("Đã từ chối chi phí.");
      loadExpenses();
    } catch (e) {
      notify.error(e.message || "Lỗi từ chối chi phí");
    } finally {
      setActing(false);
    }
  };

  // ── Actions: phiếu chi ──
  const handleCreateVoucher = async () => {
    if (!voucherForm.voucher_type) { notify.error("Chọn loại chi"); return; }
    if (!voucherForm.amount || Number(voucherForm.amount) <= 0) { notify.error("Nhập số tiền hợp lệ"); return; }
    if (!voucherForm.payee.trim()) { notify.error("Nhập người/đơn vị nhận tiền"); return; }
    if (!voucherForm.reason.trim()) { notify.error("Nhập lý do chi"); return; }
    setActing(true);
    try {
      const fd = new FormData();
      Object.entries(voucherForm).forEach(([k, v]) => fd.append(k, v));
      if (proofFile) fd.append("proof", proofFile);
      await api.createVoucher(fd);
      setCreateOpen(false);
      setVoucherForm(EMPTY_VOUCHER_FORM);
      setProofFile(null);
      notify.success("Đã tạo phiếu chi.");
      loadVouchers();
    } catch (e) {
      notify.error(e.message || "Lỗi tạo phiếu chi");
    } finally {
      setActing(false);
    }
  };

  const handleApproveVoucher = async (r) => {
    if (!(await confirmDialog({
      title: "Duyệt phiếu chi",
      description: `Duyệt phiếu chi ${fmt(r.amount)} cho ${r.payee || "người nhận"}?`,
      confirmLabel: "Duyệt",
    }))) return;
    setActing(true);
    try {
      await api.approveVoucher(r.id);
      notify.success("Đã duyệt phiếu chi.");
      loadVouchers();
    } catch (e) {
      notify.error(e.message || "Lỗi duyệt phiếu chi");
    } finally {
      setActing(false);
    }
  };

  const handleRejectVoucher = async () => {
    if (!voucherRejectReason.trim()) { notify.error("Vui lòng nhập lý do từ chối"); return; }
    setActing(true);
    try {
      await api.rejectVoucher(voucherRejectTarget.id, voucherRejectReason.trim());
      setVoucherRejectTarget(null);
      setVoucherRejectReason("");
      notify.success("Đã từ chối phiếu chi.");
      loadVouchers();
    } catch (e) {
      notify.error(e.message || "Lỗi từ chối phiếu chi");
    } finally {
      setActing(false);
    }
  };

  const handleCancelVoucher = async () => {
    if (!voucherCancelReason.trim()) { notify.error("Vui lòng nhập lý do huỷ"); return; }
    setActing(true);
    try {
      await api.cancelVoucher(voucherCancelTarget.id, voucherCancelReason.trim());
      setVoucherCancelTarget(null);
      setVoucherCancelReason("");
      notify.success("Đã hủy phiếu chi.");
      loadVouchers();
    } catch (e) {
      notify.error(e.message || "Lỗi huỷ phiếu chi");
    } finally {
      setActing(false);
    }
  };

  const isRefundVoucher = payTarget?.voucher_type === "prepaid_refund";

  const handlePayVoucher = async () => {
    // Phiếu hoàn tiền: bắt buộc đính chứng từ đã chuyển/chi cho khách.
    if (isRefundVoucher && !payProofFile) {
      notify.error("Vui lòng đính ảnh chứng từ đã hoàn tiền cho khách.");
      return;
    }
    setActing(true);
    try {
      if (isRefundVoucher) {
        const fd = new FormData();
        fd.append("payment_method", payMethod);
        if (payProofFile) fd.append("proof", payProofFile);
        await api.payVoucher(payTarget.id, fd);
      } else {
        await api.payVoucher(payTarget.id);
      }
      setPayTarget(null);
      setPayProofFile(null);
      notify.success("Đã xác nhận chi tiền.");
      loadVouchers();
    } catch (e) {
      notify.error(e.message || "Lỗi xác nhận chi");
    } finally {
      setActing(false);
    }
  };

  const maxTrend = Math.max(1, ...(summary?.trend || []).map((t) => Number(t.total_amount)));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <Select selectedKeys={[String(month)]} onSelectionChange={(k) => setMonth(Number([...k][0]))} variant="bordered" size="sm" className="w-28" aria-label="Tháng">
          {MONTHS.map((m) => <SelectItem key={String(m)}>{`Tháng ${m}`}</SelectItem>)}
        </Select>
        <Select selectedKeys={[String(year)]} onSelectionChange={(k) => setYear(Number([...k][0]))} variant="bordered" size="sm" className="w-24" aria-label="Năm">
          {YEARS.map((y) => <SelectItem key={String(y)}>{String(y)}</SelectItem>)}
        </Select>
      </div>

      <div className="bg-white dark:bg-[#161922] rounded-2xl border border-gray-100 dark:border-white/10 shadow-sm p-5">
        {/* Role không có quyền phiếu chi (VD Điều phối) chỉ còn 1 tab — ẩn thanh tab
            cho đỡ thừa vì nhãn tab trùng luôn tiêu đề trang. */}
        <Tabs
          selectedKey={tab}
          onSelectionChange={setTab}
          color="primary"
          classNames={{ tabList: api.listVouchers ? undefined : "hidden" }}
        >
          {/* ─── Tab 1: Chi phí tài xế ─── */}
          <Tab key="expenses" title="Chi phí tài xế">
            <div className="grid grid-cols-4 gap-4 my-4">
              <StatCard label="Chờ duyệt" value={expenseStats?.pending_count || 0} icon={RiWalletLine} border="border-amber-100 dark:border-amber-500/20" lightBg="bg-amber-50 dark:bg-amber-500/10" text="text-amber-600 dark:text-amber-300" gradient="from-amber-500 to-amber-600" />
              <StatCard label="Đã duyệt" value={expenseStats?.approved_count || 0} icon={RiCheckboxCircleLine} border="border-blue-100 dark:border-blue-500/20" lightBg="bg-blue-50 dark:bg-blue-500/10" text="text-blue-600 dark:text-blue-300" gradient="from-blue-500 to-blue-600" />
              <StatCard label="Từ chối" value={expenseStats?.rejected_count || 0} icon={RiCloseCircleLine} border="border-rose-100 dark:border-rose-500/20" lightBg="bg-rose-50 dark:bg-rose-500/10" text="text-rose-600 dark:text-rose-300" gradient="from-rose-500 to-rose-600" />
              <StatCard label="Tổng đã duyệt" value={fmt(expenseStats?.approved_total || 0)} icon={RiHandCoinLine} border="border-emerald-100 dark:border-emerald-500/20" lightBg="bg-emerald-50 dark:bg-emerald-500/10" text="text-emerald-600 dark:text-emerald-300" gradient="from-emerald-500 to-emerald-600" />
            </div>

            {Number(expenseStats?.reimbursable_total || 0) > 0 && (
              <div
                className="mb-4 flex items-center justify-between rounded-xl border border-amber-200 dark:border-amber-500/25 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 cursor-pointer hover:bg-amber-100 transition-colors"
                onClick={() => setExpenseReimbStatus("pending")}
              >
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 text-sm">
                  <RiWalletLine size={16} />
                  <span>Công ty đang nợ tài xế (chi phí đã duyệt, chưa hoàn):</span>
                </div>
                <span className="font-bold text-amber-700 dark:text-amber-300">{fmt(expenseStats?.reimbursable_total || 0)}</span>
              </div>
            )}

            <div className="flex flex-wrap gap-3 mb-4">
              <Select selectedKeys={new Set([expenseStatus])} onSelectionChange={(k) => setExpenseStatus([...k][0] ?? "")} variant="bordered" size="sm" className="w-44" aria-label="Trạng thái">
                <SelectItem key="" textValue="Tất cả trạng thái">Tất cả trạng thái</SelectItem>
                <SelectItem key="pending">Chờ duyệt</SelectItem>
                <SelectItem key="approved">Đã duyệt</SelectItem>
                <SelectItem key="rejected">Từ chối</SelectItem>
              </Select>
              <Select selectedKeys={new Set([expenseReimbStatus])} onSelectionChange={(k) => setExpenseReimbStatus([...k][0] ?? "")} variant="bordered" size="sm" className="w-48" aria-label="Hoàn tài xế">
                <SelectItem key="" textValue="Tất cả — hoàn tài xế">Tất cả — hoàn tài xế</SelectItem>
                <SelectItem key="pending">Chờ hoàn tài</SelectItem>
                <SelectItem key="offset_debt">Đã cấn trừ nợ</SelectItem>
                <SelectItem key="paid_via_payroll">Đã hoàn qua lương</SelectItem>
                <SelectItem key="settled">Đã tất toán</SelectItem>
              </Select>
              <Select selectedKeys={new Set([expenseType])} onSelectionChange={(k) => setExpenseType([...k][0] ?? "")} variant="bordered" size="sm" className="w-52" aria-label="Loại chi phí">
                <SelectItem key="" textValue="Tất cả loại">Tất cả loại</SelectItem>
                {Object.entries(EXPENSE_TYPE_LABEL).map(([k, v]) => <SelectItem key={k} textValue={v}>{v}</SelectItem>)}
              </Select>
              <Input placeholder="Tìm tài xế, biển số..." value={expenseSearch} onValueChange={setExpenseSearch} variant="bordered" size="sm" className="w-56" isClearable />
              <Button variant="flat" size="sm" startContent={<RiRefreshLine size={14} />} onPress={loadExpenses}>Làm mới</Button>
            </div>

            <div className="overflow-x-auto">
            <Table removeWrapper aria-label="Chi phí tài xế" classNames={{ th: "px-4 first:pl-5 last:pr-5", td: "px-4 py-3 first:pl-5 last:pr-5" }}>
              <TableHeader>
                <TableColumn>TÀI XẾ</TableColumn>
                <TableColumn>LOẠI</TableColumn>
                <TableColumn>SỐ TIỀN</TableColumn>
                <TableColumn>NGÀY</TableColumn>
                <TableColumn>CHỨNG TỪ</TableColumn>
                <TableColumn>MÔ TẢ</TableColumn>
                <TableColumn>TRẠNG THÁI</TableColumn>
                <TableColumn>HOÀN TÀI XẾ</TableColumn>
                <TableColumn> </TableColumn>
              </TableHeader>
              <TableBody items={expenses} isLoading={expenseLoading} loadingContent={<Spinner color="primary" />} emptyContent="Không có chi phí nào.">
                {(r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-semibold text-gray-800 dark:text-gray-100 text-sm">{r.driver_name}</span>
                        <span className="text-xs text-gray-400 dark:text-gray-400">{r.vehicle_plate || r.driver_phone}</span>
                      </div>
                    </TableCell>
                    <TableCell>{EXPENSE_TYPE_LABEL[r.expense_type] || r.expense_type}</TableCell>
                    <TableCell><span className="font-semibold">{fmt(r.amount)}</span></TableCell>
                    <TableCell>{fmtDate(r.expense_date)}</TableCell>
                    <TableCell>
                      {(r.receipt_urls || []).length > 0 ? (
                        <div className="flex gap-1">
                          {r.receipt_urls.map((url, idx) => (
                            <a key={idx} href={url} target="_blank" rel="noreferrer">
                              <img src={url} alt="chứng từ" className="w-9 h-9 rounded object-cover border border-gray-200 dark:border-white/10" />
                            </a>
                          ))}
                        </div>
                      ) : <span className="text-xs text-gray-400 dark:text-gray-400">—</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col text-xs text-gray-500 dark:text-gray-400 max-w-[200px]">
                        {r.description && <span className="truncate">{r.description}</span>}
                        {r.reject_reason && <span className="text-rose-500">Lý do: {r.reject_reason}</span>}
                      </div>
                    </TableCell>
                    <TableCell><Chip size="sm" variant="flat" color={STATUS_COLOR[r.status] || "default"}>{EXPENSE_STATUS_LABEL[r.status] || r.status}</Chip></TableCell>
                    <TableCell>
                      {r.reimbursement_status ? (
                        <Chip size="sm" variant="flat" color={REIMB_CHIP[r.reimbursement_status]?.color || "default"} className="text-[10px]">
                          {REIMB_CHIP[r.reimbursement_status]?.label || r.reimbursement_status}
                        </Chip>
                      ) : <span className="text-xs text-gray-400 dark:text-gray-400">—</span>}
                    </TableCell>
                    <TableCell>
                      {canModerateExpense && r.status === "pending" && (
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" color="primary" isDisabled={acting} startContent={<RiCheckLine size={13} />} onPress={() => handleApproveExpense(r)}>Duyệt</Button>
                          <Button size="sm" variant="light" color="danger" startContent={<RiCloseLine size={13} />} onPress={() => { setExpenseRejectTarget(r); setExpenseRejectReason(""); }}>Từ chối</Button>
                        </div>
                      )}
                      {/* Gỡ duyệt: chi phí đã duyệt thì tài xế không sửa được nữa,
                          nên duyệt sai số tiền là bế tắc nếu không có đường lùi này */}
                      {canModerateExpense && api.unapproveExpense && r.status === "approved" && (
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="light" color="warning" isDisabled={acting} startContent={<RiArrowGoBackLine size={13} />} onPress={() => handleUnapproveExpense(r)}>Gỡ duyệt</Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            </div>

            {expenses.length > 0 && (
              <div className="mt-3">
                <PaginationBar page={expensePage} pageSize={expensePageSize} totalItems={expensePagination.total} totalPages={expensePagination.totalPages} onPageChange={setExpensePage} onPageSizeChange={(s) => { setExpensePageSize(s); setExpensePage(1); }} />
              </div>
            )}
          </Tab>

          {/* ─── Tab 2: Phiếu chi — chỉ hiện khi role này có quyền (VD: Coordinator không có) ─── */}
          {api.listVouchers && (
            <Tab key="vouchers" title="Phiếu chi">
            <div className="grid grid-cols-4 gap-4 my-4">
              <StatCard label="Chờ duyệt" value={voucherStats?.pending_count || 0} icon={RiMoneyDollarCircleLine} border="border-amber-100 dark:border-amber-500/20" lightBg="bg-amber-50 dark:bg-amber-500/10" text="text-amber-600 dark:text-amber-300" gradient="from-amber-500 to-amber-600" />
              <StatCard label="Chờ chi" value={voucherStats?.approved_count || 0} icon={RiTimeLine} border="border-blue-100 dark:border-blue-500/20" lightBg="bg-blue-50 dark:bg-blue-500/10" text="text-blue-600 dark:text-blue-300" gradient="from-blue-500 to-blue-600" />
              <StatCard label="Đã chi" value={voucherStats?.paid_count || 0} icon={RiCheckboxCircleLine} border="border-emerald-100 dark:border-emerald-500/20" lightBg="bg-emerald-50 dark:bg-emerald-500/10" text="text-emerald-600 dark:text-emerald-300" gradient="from-emerald-500 to-emerald-600" />
              <StatCard label="Tổng đã chi" value={fmt(voucherStats?.paid_total || 0)} border="border-emerald-100 dark:border-emerald-500/20" lightBg="bg-emerald-50 dark:bg-emerald-500/10" text="text-emerald-600 dark:text-emerald-300" gradient="from-emerald-500 to-emerald-600" />
            </div>

            <div className="flex flex-wrap gap-3 mb-4">
              <Select selectedKeys={new Set([voucherStatus])} onSelectionChange={(k) => setVoucherStatus([...k][0] ?? "")} variant="bordered" size="sm" className="w-48" aria-label="Trạng thái">
                <SelectItem key="" textValue="Tất cả trạng thái">Tất cả trạng thái</SelectItem>
                <SelectItem key="pending">Chờ duyệt</SelectItem>
                <SelectItem key="approved">Đã duyệt — chờ chi</SelectItem>
                <SelectItem key="paid">Đã chi</SelectItem>
                <SelectItem key="rejected">Từ chối</SelectItem>
                <SelectItem key="cancelled">Đã huỷ</SelectItem>
              </Select>
              <Select selectedKeys={new Set([voucherType])} onSelectionChange={(k) => setVoucherType([...k][0] ?? "")} variant="bordered" size="sm" className="w-52" aria-label="Loại chi">
                <SelectItem key="" textValue="Tất cả loại">Tất cả loại</SelectItem>
                {Object.entries(VOUCHER_TYPE_LABEL).map(([k, v]) => <SelectItem key={k} textValue={v}>{v}</SelectItem>)}
              </Select>
              <Input placeholder="Tìm người nhận, lý do..." value={voucherSearch} onValueChange={setVoucherSearch} variant="bordered" size="sm" className="w-56" isClearable />
              <Button variant="flat" size="sm" startContent={<RiRefreshLine size={14} />} onPress={loadVouchers}>Làm mới</Button>
              {canCreateVoucher && (
                <Button color="primary" size="sm" startContent={<RiAddLine size={14} />} onPress={() => setCreateOpen(true)} className="ml-auto">Tạo phiếu chi</Button>
              )}
            </div>

            <div className="overflow-x-auto">
            <Table removeWrapper aria-label="Phiếu chi" classNames={{ th: "px-4 first:pl-5 last:pr-5", td: "px-4 py-3 first:pl-5 last:pr-5" }}>
              <TableHeader>
                <TableColumn>MÃ</TableColumn>
                <TableColumn>LOẠI</TableColumn>
                <TableColumn>SỐ TIỀN</TableColumn>
                <TableColumn>NGƯỜI NHẬN</TableColumn>
                <TableColumn>LÝ DO</TableColumn>
                <TableColumn>HÌNH THỨC</TableColumn>
                <TableColumn>NGƯỜI TẠO</TableColumn>
                <TableColumn>TRẠNG THÁI</TableColumn>
                <TableColumn> </TableColumn>
              </TableHeader>
              <TableBody items={vouchers} isLoading={voucherLoading} loadingContent={<Spinner color="primary" />} emptyContent="Không có phiếu chi nào.">
                {(r) => (
                  <TableRow key={r.id}>
                    <TableCell><span className="text-xs font-mono text-gray-500 dark:text-gray-400">#{r.id}</span></TableCell>
                    <TableCell>{VOUCHER_TYPE_LABEL[r.voucher_type] || r.voucher_type}</TableCell>
                    <TableCell><span className="font-semibold">{fmt(r.amount)}</span></TableCell>
                    <TableCell>{r.payee}</TableCell>
                    <TableCell>
                      <div className="flex flex-col text-xs text-gray-500 dark:text-gray-400 max-w-[220px]">
                        <span className="truncate">{r.reason}</span>
                        {r.rejection_reason && <span className="text-rose-500">Lý do từ chối: {r.rejection_reason}</span>}
                        {r.proof_url && <a href={r.proof_url} target="_blank" rel="noreferrer" className="text-blue-500 underline">Xem chứng từ</a>}
                      </div>
                    </TableCell>
                    <TableCell>{r.payment_method === "bank_transfer" ? "Chuyển khoản" : "Tiền mặt"}</TableCell>
                    <TableCell>
                      <div className="flex flex-col text-xs">
                        <span>{r.created_by_name}</span>
                        <span className="text-gray-400 dark:text-gray-400">{fmtDate(r.created_at)}</span>
                      </div>
                    </TableCell>
                    <TableCell><Chip size="sm" variant="flat" color={STATUS_COLOR[r.status] || "default"}>{VOUCHER_STATUS_LABEL[r.status] || r.status}</Chip></TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        {canModerateVoucher && r.status === "pending" && (
                          <>
                            <Button size="sm" color="primary" isDisabled={acting} startContent={<RiCheckLine size={13} />} onPress={() => handleApproveVoucher(r)}>Duyệt</Button>
                            <Button size="sm" variant="light" color="danger" startContent={<RiCloseLine size={13} />} onPress={() => { setVoucherRejectTarget(r); setVoucherRejectReason(""); }}>Từ chối</Button>
                          </>
                        )}
                        {canPayVoucher && r.status === "approved" && (
                          <Button size="sm" color="success" className="text-white" startContent={<RiMoneyDollarCircleLine size={13} />} onPress={() => { setPayMethod(r.payment_method || "bank_transfer"); setPayProofFile(null); setPayTarget(r); }}>Chi tiền</Button>
                        )}
                        {/* Huỷ chỉ áp dụng cho phiếu đã duyệt mà chưa chi — chưa có bút toán nào để đảo. */}
                        {canCancelVoucher && r.status === "approved" && (
                          <Button size="sm" variant="light" color="danger" startContent={<RiCloseLine size={13} />} onPress={() => { setVoucherCancelTarget(r); setVoucherCancelReason(""); }}>Huỷ</Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            </div>

            {vouchers.length > 0 && (
              <div className="mt-3">
                <PaginationBar page={voucherPage} pageSize={voucherPageSize} totalItems={voucherPagination.total} totalPages={voucherPagination.totalPages} onPageChange={setVoucherPage} onPageSizeChange={(s) => { setVoucherPageSize(s); setVoucherPage(1); }} />
              </div>
            )}
          </Tab>
          )}

          {/* ─── Tab 3: Tổng hợp chi — chỉ hiện khi role này có quyền phiếu chi ─── */}
          {api.getSummary && (
          <Tab key="summary" title="Tổng hợp chi">
            {summaryLoading ? (
              <div className="flex justify-center py-10"><Spinner color="primary" /></div>
            ) : summary && (
              <div className="flex flex-col gap-5 my-4">
                <div className="rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 p-4">
                  <div className="text-sm text-blue-700 dark:text-blue-300">Tổng chi tháng {month}/{year} (từ sổ tài chính, đã trừ bút toán đảo)</div>
                  <div className="text-2xl font-bold text-blue-700 dark:text-blue-300 mt-1">{fmt(summary.grand_total)}</div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Theo loại chi</h4>
                  <div className="overflow-x-auto">
                  <Table removeWrapper aria-label="Chi theo loại" classNames={{ th: "px-4 first:pl-5 last:pr-5", td: "px-4 py-3 first:pl-5 last:pr-5" }}>
                    <TableHeader>
                      <TableColumn>LOẠI CHI</TableColumn>
                      <TableColumn>SỐ GIAO DỊCH</TableColumn>
                      <TableColumn>TỔNG TIỀN</TableColumn>
                    </TableHeader>
                    <TableBody items={summary.by_type || []} emptyContent="Chưa có khoản chi nào trong tháng.">
                      {(r) => (
                        <TableRow key={r.event_type}>
                          <TableCell>{EVENT_LABEL[r.event_type] || r.event_type}</TableCell>
                          <TableCell>{r.tx_count}</TableCell>
                          <TableCell><span className="font-semibold">{fmt(r.total_amount)}</span></TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Xu hướng 6 tháng gần nhất</h4>
                  <div className="flex flex-col gap-2">
                    {(summary.trend || []).map((t) => (
                      <div key={`${t.year}-${t.month}`} className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 dark:text-gray-400 w-16">T{t.month}/{t.year}</span>
                        <div className="flex-1 bg-gray-100 dark:bg-white/10 rounded-full h-5 overflow-hidden">
                          <div className="bg-blue-500 h-full rounded-full" style={{ width: `${Math.max(2, (Number(t.total_amount) / maxTrend) * 100)}%` }} />
                        </div>
                        <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 w-32 text-right">{fmt(t.total_amount)}</span>
                      </div>
                    ))}
                    {!(summary.trend || []).length && <span className="text-sm text-gray-400 dark:text-gray-400">Chưa có dữ liệu.</span>}
                  </div>
                </div>
              </div>
            )}
          </Tab>
          )}
        </Tabs>
      </div>

      {/* Modal: từ chối chi phí tài xế */}
      <Modal isOpen={!!expenseRejectTarget} onOpenChange={(open) => !open && setExpenseRejectTarget(null)} size="sm">
        <ModalContent>
          <ModalHeader>Từ chối chi phí</ModalHeader>
          <ModalBody className="gap-3">
            {expenseRejectTarget && (
              <div className="text-sm text-gray-600 dark:text-gray-300">
                <div>Tài xế: <strong>{expenseRejectTarget.driver_name}</strong></div>
                <div>Loại: <strong>{EXPENSE_TYPE_LABEL[expenseRejectTarget.expense_type]}</strong> — <strong>{fmt(expenseRejectTarget.amount)}</strong></div>
              </div>
            )}
            <Textarea label="Lý do từ chối *" value={expenseRejectReason} onValueChange={setExpenseRejectReason} minRows={3} variant="bordered" />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setExpenseRejectTarget(null)}>Hủy</Button>
            <Button color="danger" isLoading={acting} onPress={handleRejectExpense}>Xác nhận từ chối</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Modal: tạo phiếu chi (Accountant) */}
      <Modal isOpen={createOpen} onOpenChange={(open) => !open && setCreateOpen(false)} size="lg">
        <ModalContent>
          <ModalHeader>Tạo phiếu chi</ModalHeader>
          <ModalBody className="gap-3">
            <Select
              label="Loại chi"
              placeholder="Chọn loại..."
              selectedKeys={voucherForm.voucher_type ? [voucherForm.voucher_type] : []}
              onSelectionChange={(k) => setVoucherForm((p) => ({ ...p, voucher_type: [...k][0] ?? "" }))}
              variant="bordered"
            >
              {Object.entries(CREATABLE_VOUCHER_TYPES).map(([k, v]) => <SelectItem key={k} textValue={v}>{v}</SelectItem>)}
            </Select>
            <NumberInput label="Số tiền (đồng)" minValue={0} step={100000} value={voucherForm.amount || undefined} onValueChange={(v) => setVoucherForm((p) => ({ ...p, amount: v }))} variant="bordered" />
            <Input label="Người / đơn vị nhận tiền" value={voucherForm.payee} onValueChange={(v) => setVoucherForm((p) => ({ ...p, payee: v }))} variant="bordered" />
            <Textarea label="Lý do chi" value={voucherForm.reason} onValueChange={(v) => setVoucherForm((p) => ({ ...p, reason: v }))} minRows={2} variant="bordered" />
            <Select
              label="Hình thức thanh toán"
              selectedKeys={[voucherForm.payment_method]}
              onSelectionChange={(k) => setVoucherForm((p) => ({ ...p, payment_method: [...k][0] ?? "cash" }))}
              variant="bordered"
            >
              <SelectItem key="cash">Tiền mặt</SelectItem>
              <SelectItem key="bank_transfer">Chuyển khoản</SelectItem>
            </Select>
            <div>
              <label className="text-sm text-gray-600 dark:text-gray-300 block mb-1">Ảnh chứng từ (không bắt buộc)</label>
              <input type="file" accept="image/*" onChange={(e) => setProofFile(e.target.files?.[0] || null)} className="text-sm" />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setCreateOpen(false)}>Hủy</Button>
            <Button color="primary" isLoading={acting} onPress={handleCreateVoucher}>Tạo phiếu chi</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Modal: từ chối phiếu chi (Manager) */}
      <Modal isOpen={!!voucherRejectTarget} onOpenChange={(open) => !open && setVoucherRejectTarget(null)} size="sm">
        <ModalContent>
          <ModalHeader>Từ chối phiếu chi</ModalHeader>
          <ModalBody className="gap-3">
            {voucherRejectTarget && (
              <div className="text-sm text-gray-600 dark:text-gray-300">
                <div>Phiếu chi: <strong>#{voucherRejectTarget.id}</strong> — <strong>{fmt(voucherRejectTarget.amount)}</strong></div>
                <div>Người nhận: <strong>{voucherRejectTarget.payee}</strong></div>
              </div>
            )}
            <Textarea label="Lý do từ chối *" value={voucherRejectReason} onValueChange={setVoucherRejectReason} minRows={3} variant="bordered" />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setVoucherRejectTarget(null)}>Hủy</Button>
            <Button color="danger" isLoading={acting} onPress={handleRejectVoucher}>Xác nhận từ chối</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Modal: huỷ phiếu chi đã duyệt (Accountant) */}
      <Modal isOpen={!!voucherCancelTarget} onOpenChange={(open) => !open && setVoucherCancelTarget(null)} size="sm">
        <ModalContent>
          <ModalHeader>Huỷ phiếu chi đã duyệt</ModalHeader>
          <ModalBody className="gap-3">
            {voucherCancelTarget && (
              <>
                <div className="text-sm text-gray-600 dark:text-gray-300">
                  <div>Phiếu chi: <strong>#{voucherCancelTarget.id}</strong> — <strong>{fmt(voucherCancelTarget.amount)}</strong></div>
                  <div>Người nhận: <strong>{voucherCancelTarget.payee}</strong></div>
                  {voucherCancelTarget.approved_by_name && (
                    <div>Người duyệt: <strong>{voucherCancelTarget.approved_by_name}</strong></div>
                  )}
                </div>
                <div className="rounded-lg border border-amber-200 dark:border-amber-500/25 bg-amber-50 dark:bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                  Phiếu không bị xoá — hệ thống lưu lại người huỷ và lý do. Người tạo phiếu và người duyệt đều được thông báo.
                  {voucherCancelTarget.incident_id
                    ? ` Sự cố #${voucherCancelTarget.incident_id} sẽ quay lại trạng thái “đang xử lý” để lập lại khoản đền bù.`
                    : ""}
                </div>
              </>
            )}
            <Textarea label="Lý do huỷ *" value={voucherCancelReason} onValueChange={setVoucherCancelReason} minRows={3} variant="bordered" />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setVoucherCancelTarget(null)}>Đóng</Button>
            <Button color="danger" isLoading={acting} onPress={handleCancelVoucher}>Xác nhận huỷ</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Modal: xác nhận chi tiền (Accountant) */}
      <Modal isOpen={!!payTarget} onOpenChange={(open) => !open && setPayTarget(null)} size="sm">
        <ModalContent>
          <ModalHeader>{isRefundVoucher ? "Hoàn tiền trả trước cho khách" : "Xác nhận chi tiền"}</ModalHeader>
          <ModalBody className="gap-3">
            {payTarget && (
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {isRefundVoucher ? (
                  <>Hoàn <strong>{fmt(payTarget.amount)}</strong> cho khách <strong>{payTarget.payee}</strong>
                  {payTarget.order_id ? <> (đơn #{payTarget.order_id} đã hủy)</> : null}. Chọn hình thức và đính chứng từ đã hoàn tiền.</>
                ) : (
                  <>Xác nhận đã chi <strong>{fmt(payTarget.amount)}</strong> ({payTarget.payment_method === "bank_transfer" ? "chuyển khoản" : "tiền mặt"}) cho <strong>{payTarget.payee}</strong>?
                  Khoản chi sẽ được ghi vào sổ tài chính và không sửa được (chỉ đảo bút toán).</>
                )}
              </p>
            )}
            {isRefundVoucher && (
              <>
                <Select
                  label="Hình thức hoàn" size="sm" variant="bordered"
                  selectedKeys={new Set([payMethod])}
                  onChange={(e) => setPayMethod(e.target.value)}
                >
                  <SelectItem key="bank_transfer" textValue="Chuyển khoản">Chuyển khoản</SelectItem>
                  <SelectItem key="cash" textValue="Tiền mặt">Tiền mặt</SelectItem>
                </Select>
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Ảnh chứng từ đã hoàn *</label>
                  <input
                    type="file" accept="image/*"
                    onChange={(e) => setPayProofFile(e.target.files?.[0] ?? null)}
                    className="block w-full text-xs text-gray-600 dark:text-gray-300 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 dark:file:bg-blue-500/15 file:px-3 file:py-1.5 file:text-blue-600 dark:file:text-blue-300"
                  />
                </div>
              </>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setPayTarget(null)}>Hủy</Button>
            <Button color="success" className="text-white" isLoading={acting} onPress={handlePayVoucher}>Xác nhận đã chi</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
