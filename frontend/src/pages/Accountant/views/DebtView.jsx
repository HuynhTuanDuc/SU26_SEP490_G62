import { useState, useCallback, useMemo, useEffect } from "react";
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
  RiFileList3Line, RiListCheck2,
  RiHistoryLine, RiRefreshLine,
  RiArrowLeftRightLine,
} from "react-icons/ri";
import { MoneyText } from "../components/shared/MoneyText";
import { PaginationBar } from "../components/shared/PaginationBar";
import { useDebts } from "../hooks/useDebts";
import { accountantService } from "../services/accountant.service";

const VND = (n) => Number(n || 0).toLocaleString("vi-VN") + "đ";

const STATUS_OPTIONS = [
  { key: "all",     label: "Tất cả" },
  { key: "unpaid",  label: "Chưa thu" },
  { key: "partial", label: "Thu 1 phần" },
  { key: "paid",    label: "Đã thu đủ" },
];

const SORT_OPTIONS = [
  { key: "remaining_desc", label: "Công nợ cao nhất" },
  { key: "remaining_asc",  label: "Công nợ thấp nhất" },
  { key: "overdue_first",  label: "Quá hạn trước" },
];

const STATUS_CHIP = {
  unpaid:  { label: "Chưa thu",     color: "danger"  },
  partial: { label: "Thu 1 phần",   color: "warning" },
  paid:    { label: "Đã thu đủ",    color: "success" },
};

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

const REPAY_METHOD_LABEL = {
  cash:          "Tiền mặt",
  bank_transfer: "Chuyển khoản",
  offset:        "Cấn trừ",
};

// ─── Hàng chờ tài xế / khách báo nộp tiền ─────────────────────────────────────
function PendingRepaymentsPanel({ onChanged, onCountChange }) {
  const [items, setItems]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [actingId, setActingId]     = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [lightboxUrl, setLightboxUrl]   = useState(null);
  const [error, setError]           = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    accountantService.getPendingRepayments()
      .then((data) => {
        const rows = data.repayments ?? [];
        setItems(rows);
        onCountChange?.(rows.length);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [onCountChange]);

  useEffect(() => { load(); }, [load]);

  const handleConfirm = async (item) => {
    setActingId(item.id);
    setError(null);
    try {
      await accountantService.confirmRepayment(item.id);
      load();
      onChanged?.();
    } catch (err) {
      setError(err.message ?? "Xác nhận thất bại");
    } finally {
      setActingId(null);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) { setError("Cần nhập lý do từ chối"); return; }
    setActingId(rejectTarget.id);
    setError(null);
    try {
      await accountantService.rejectRepayment(rejectTarget.id, rejectReason.trim());
      setRejectTarget(null);
      setRejectReason("");
      load();
      onChanged?.();
    } catch (err) {
      setError(err.message ?? "Từ chối thất bại");
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <RiTimeLine size={16} className="text-amber-500" />
        <span className="text-sm font-bold text-amber-700">
          Báo nộp tiền chờ xác nhận {items.length > 0 && `(${items.length})`}
        </span>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-3"><Spinner size="sm" /></div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-2">
          <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
            <RiCheckboxCircleLine size={18} className="text-green-400" />
          </div>
          <p className="text-xs text-gray-400">Không có báo nộp tiền nào đang chờ.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 max-h-[560px] overflow-y-auto pr-1">
          {items.map((item) => (
            <div key={item.id}
              className="flex items-center gap-3 bg-white rounded-xl border border-amber-100 px-4 py-3">
              {/* Ảnh chứng từ */}
              {item.receipt_url ? (
                <button
                  onClick={() => setLightboxUrl(item.receipt_url)}
                  className="w-12 h-12 rounded-lg overflow-hidden border border-gray-200 flex-shrink-0 hover:ring-2 hover:ring-blue-400"
                >
                  <img src={item.receipt_url} alt="Chứng từ" className="w-full h-full object-cover" />
                </button>
              ) : (
                <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <RiFileList3Line size={18} className="text-gray-300" />
                </div>
              )}

              {/* Nội dung */}
              <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-800 truncate">{item.driver_name}</span>
                  <Chip size="sm" variant="flat"
                    color={item.debt_type === "driver" ? "warning" : "primary"}
                    className="text-[10px] h-4">
                    {item.debt_type === "driver" ? "Tài xế nộp quỹ" : "Khách thanh toán"}
                  </Chip>
                </div>
                <span className="text-[11px] text-gray-400">
                  Nợ #{item.debt_id}{item.cargo_name ? ` · ${item.cargo_name}` : ""}
                  {" · "}{REPAY_METHOD_LABEL[item.payment_method] ?? item.payment_method ?? "—"}
                  {item.paid_at ? ` · ${new Date(item.paid_at).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}
                </span>
                {item.notes && <span className="text-[11px] text-gray-400 italic truncate">{item.notes}</span>}
              </div>

              <MoneyText amount={item.amount} className="text-sm font-bold text-gray-800 flex-shrink-0" />

              {/* Thao tác */}
              <div className="flex gap-2 flex-shrink-0">
                <Button size="sm" color="success" variant="flat"
                  isLoading={actingId === item.id}
                  onPress={() => handleConfirm(item)}
                  startContent={actingId !== item.id && <RiCheckboxCircleLine size={14} />}>
                  Xác nhận
                </Button>
                <Button size="sm" color="danger" variant="light"
                  isDisabled={actingId === item.id}
                  onPress={() => { setRejectTarget(item); setRejectReason(""); }}>
                  Từ chối
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox ảnh chứng từ */}
      {lightboxUrl && (
        <div className="fixed inset-0 bg-black/80 z-[999] flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} alt="Chứng từ" className="max-w-full max-h-full rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {/* Modal từ chối */}
      <Modal isOpen={Boolean(rejectTarget)} onClose={() => setRejectTarget(null)} size="sm">
        <ModalContent>
          <ModalHeader className="text-base">
            Từ chối báo nộp tiền{rejectTarget ? ` — ${rejectTarget.driver_name}` : ""}
          </ModalHeader>
          <ModalBody>
            <Input
              label="Lý do từ chối"
              value={rejectReason}
              onValueChange={setRejectReason}
              placeholder="VD: ảnh chứng từ không rõ, số tiền không khớp..."
              isRequired
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setRejectTarget(null)}>Huỷ</Button>
            <Button color="danger" onPress={handleReject}
              isLoading={actingId === rejectTarget?.id}
              isDisabled={!rejectReason.trim()}>
              Từ chối
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

// ─── Lịch sử thanh toán công nợ (toàn cục, khách + tài xế) ────────────────────
const PAY_STATUS_CHIP = {
  pending:   { label: "Chờ xác nhận", color: "warning" },
  confirmed: { label: "Đã xác nhận",  color: "success" },
  rejected:  { label: "Từ chối",      color: "danger"  },
  voided:    { label: "Đã hủy",       color: "default" },
};

const NOW = new Date();
const HIST_MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const HIST_YEARS = [NOW.getFullYear(), NOW.getFullYear() - 1, NOW.getFullYear() - 2];

function PaymentHistoryPanel() {
  const [rows, setRows]         = useState([]);
  const [stats, setStats]       = useState(null);
  const [loading, setLoading]   = useState(true);
  const [personType, setPersonType] = useState("");
  const [status, setStatus]     = useState("");
  const [method, setMethod]     = useState("");
  const [month, setMonth]       = useState("");
  const [year, setYear]         = useState(String(NOW.getFullYear()));
  const [histSearch, setHistSearch] = useState("");
  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });

  const load = useCallback(() => {
    setLoading(true);
    accountantService.getDebtPaymentHistory({
      page, limit: pageSize,
      ...(personType ? { person_type: personType } : {}),
      ...(status ? { status } : {}),
      ...(method ? { method } : {}),
      ...(month ? { month } : {}),
      ...(year ? { year } : {}),
      ...(histSearch ? { search: histSearch } : {}),
    })
      .then((res) => {
        setRows(res.rows ?? []);
        setStats(res.stats ?? null);
        setPagination({ total: res.total ?? 0, totalPages: res.totalPages ?? 1 });
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [personType, status, method, month, year, histSearch, page, pageSize]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [personType, status, method, month, year, histSearch]);

  const fmtDateTime = (v) =>
    v ? new Date(v).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

  return (
    <div className="flex flex-col gap-4">
      {/* Thống kê theo bộ lọc hiện tại */}
      <div className="grid grid-cols-3 gap-4">
        <DebtStatCard
          label="Đã thu (xác nhận)"
          value={stats?.confirmed_total ?? 0}
          sub={stats ? `${stats.confirmed_count} lần thanh toán` : ""}
          icon={RiCheckboxCircleLine}
          gradient="from-emerald-500 to-emerald-600"
          lightBg="bg-emerald-50" text="text-emerald-600" border="border-emerald-100"
        />
        <DebtStatCard
          label="Khách hàng đã trả"
          value={stats?.customer_confirmed_total ?? 0}
          icon={RiGroupLine}
          gradient="from-blue-500 to-blue-600"
          lightBg="bg-blue-50" text="text-blue-600" border="border-blue-100"
        />
        <DebtStatCard
          label="Tài xế đã nộp"
          value={stats?.driver_confirmed_total ?? 0}
          sub={stats?.pending_count > 0 ? `${stats.pending_count} khoản đang chờ xác nhận` : ""}
          icon={RiTruckLine}
          gradient="from-amber-500 to-amber-600"
          lightBg="bg-amber-50" text="text-amber-600" border="border-amber-100"
        />
      </div>

      {/* Bộ lọc */}
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label="Đối tượng" placeholder="Tất cả đối tượng" size="sm" className="w-40"
          selectedKeys={new Set([personType])} onChange={(e) => setPersonType(e.target.value)}>
          <SelectItem key="" textValue="Tất cả đối tượng">Tất cả đối tượng</SelectItem>
          <SelectItem key="customer" textValue="Khách hàng">Khách hàng</SelectItem>
          <SelectItem key="driver" textValue="Tài xế">Tài xế</SelectItem>
        </Select>
        <Select aria-label="Trạng thái" placeholder="Tất cả trạng thái" size="sm" className="w-40"
          selectedKeys={new Set([status])} onChange={(e) => setStatus(e.target.value)}>
          <SelectItem key="" textValue="Tất cả trạng thái">Tất cả trạng thái</SelectItem>
          <SelectItem key="confirmed" textValue="Đã xác nhận">Đã xác nhận</SelectItem>
          <SelectItem key="pending" textValue="Chờ xác nhận">Chờ xác nhận</SelectItem>
          <SelectItem key="rejected" textValue="Từ chối">Từ chối</SelectItem>
          <SelectItem key="voided" textValue="Đã hủy">Đã hủy</SelectItem>
        </Select>
        <Select aria-label="Hình thức" placeholder="Mọi hình thức" size="sm" className="w-40"
          selectedKeys={new Set([method])} onChange={(e) => setMethod(e.target.value)}>
          <SelectItem key="" textValue="Mọi hình thức">Mọi hình thức</SelectItem>
          <SelectItem key="cash" textValue="Tiền mặt">Tiền mặt</SelectItem>
          <SelectItem key="bank_transfer" textValue="Chuyển khoản">Chuyển khoản</SelectItem>
          <SelectItem key="offset" textValue="Cấn trừ lương">Cấn trừ lương</SelectItem>
        </Select>
        <Select aria-label="Tháng" placeholder="Cả năm" size="sm" className="w-32"
          selectedKeys={new Set([month])} onChange={(e) => setMonth(e.target.value)}>
          <SelectItem key="" textValue="Cả năm">Cả năm</SelectItem>
          {HIST_MONTHS.map((m) => <SelectItem key={String(m)} textValue={`Tháng ${m}`}>{`Tháng ${m}`}</SelectItem>)}
        </Select>
        <Select aria-label="Năm" size="sm" className="w-28"
          selectedKeys={new Set([year])} onChange={(e) => setYear(e.target.value)}>
          {HIST_YEARS.map((y) => <SelectItem key={String(y)} textValue={String(y)}>{String(y)}</SelectItem>)}
        </Select>
        <Input aria-label="Tìm kiếm" placeholder="Tìm tên khách / tài xế..." size="sm" className="w-52"
          value={histSearch} onValueChange={setHistSearch} isClearable />
        <Button variant="flat" size="sm" startContent={<RiRefreshLine size={14} />} onPress={load}>Làm mới</Button>
      </div>

      {/* Bảng lịch sử */}
      <div className="rounded-2xl border border-gray-200 overflow-hidden bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Spinner color="primary" size="lg" /></div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center">
              <RiHistoryLine size={22} className="text-gray-300" />
            </div>
            <p className="text-gray-500 text-sm">Chưa có lần thanh toán nào khớp bộ lọc.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full" style={{ minWidth: 980 }}>
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-200">
                {["Thời điểm", "Người thanh toán", "Khoản nợ", "Số tiền", "Hình thức", "Trạng thái", "Người xác nhận", "Ghi chú"].map((h, idx) => (
                  <th key={idx} className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider py-3 px-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const chip = PAY_STATUS_CHIP[r.status] ?? { label: r.status, color: "default" };
                return (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50/60">
                    <td className="py-3 px-4 text-xs text-gray-500 whitespace-nowrap">{fmtDateTime(r.paid_at)}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <Chip size="sm" variant="flat" color={r.debt_type === "driver" ? "warning" : "primary"} className="text-[10px] h-4">
                          {r.debt_type === "driver" ? "Tài xế" : "Khách"}
                        </Chip>
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-gray-800">{r.person_name ?? "—"}</span>
                          {r.person_phone && <span className="text-[10px] text-gray-400 font-mono">{r.person_phone}</span>}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-500 whitespace-nowrap">
                      Nợ #{r.debt_id}{r.order_id ? ` · Đơn #${r.order_id}` : ""}
                      <div className="text-[10px] text-gray-400">Tổng nợ {VND(r.debt_total)}</div>
                    </td>
                    <td className="py-3 px-4"><span className="text-sm font-bold text-gray-800">{VND(r.amount)}</span></td>
                    <td className="py-3 px-4 text-xs text-gray-600">{REPAY_METHOD_LABEL[r.payment_method] ?? r.payment_method ?? "—"}</td>
                    <td className="py-3 px-4">
                      <Chip size="sm" variant="flat" color={chip.color} className="text-[10px] h-5">{chip.label}</Chip>
                      {r.status === "rejected" && r.reject_reason && (
                        <div className="text-[10px] text-rose-500 mt-0.5 max-w-[160px] truncate">{r.reject_reason}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-600">{r.confirmed_by_name ?? "—"}</td>
                    <td className="py-3 px-4 text-[11px] text-gray-400 italic max-w-[180px] truncate">{r.notes ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {!loading && rows.length > 0 && (
        <PaginationBar
          page={page}
          pageSize={pageSize}
          totalItems={pagination.total}
          totalPages={pagination.totalPages}
          onPageChange={setPage}
          onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
        />
      )}
    </div>
  );
}

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
        personType:    person.debt_type,
        personId:      person_id,
        amount:        num,
        paymentMethod: [...method][0],
        notes:         notes.trim() || undefined,
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

// ─── Chuyển công nợ khách hàng sang công nợ tài xế (tái phân loại khoản phải thu,
// không phải giao dịch tiền thật — Nợ 1388 / Có 131) ───────────────────────────
function TransferDebtModal({ debt, onClose, onDone }) {
  const [drivers, setDrivers]   = useState([]);
  const [driverId, setDriverId] = useState(new Set([]));
  const [notes, setNotes]       = useState("");
  const [loadingDrivers, setLoadingDrivers] = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState(null);

  useEffect(() => {
    accountantService.getLookup()
      .then((data) => setDrivers(data.drivers ?? []))
      .catch(() => setDrivers([]))
      .finally(() => setLoadingDrivers(false));
  }, []);

  const handleSubmit = async () => {
    const selectedId = [...driverId][0];
    if (!selectedId) { setError("Vui lòng chọn tài xế nhận công nợ."); return; }
    setSaving(true); setError(null);
    try {
      await accountantService.transferDebtToDriver(debt.id, Number(selectedId), notes.trim());
      onDone();
      onClose();
    } catch (err) {
      setError(err.message ?? "Chuyển công nợ thất bại.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} size="sm">
      <ModalContent>
        <ModalHeader className="flex items-center gap-2 pb-2">
          <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
            <RiArrowLeftRightLine size={16} className="text-amber-600" />
          </div>
          <div>
            <p className="text-base font-bold">Chuyển công nợ sang tài xế</p>
            <p className="text-xs font-normal text-gray-400">Nợ #{debt?.id}</p>
          </div>
        </ModalHeader>

        <ModalBody className="gap-3">
          <div className="flex flex-col gap-0.5 bg-orange-50 rounded-xl p-3">
            <span className="text-[10px] text-orange-400 font-semibold uppercase tracking-wide">
              Toàn bộ số dư còn lại sẽ được chuyển
            </span>
            <MoneyText amount={debt?.remaining} className="text-lg font-bold text-orange-600" />
          </div>

          <p className="text-xs text-gray-500">
            Đây là bút toán tái phân loại khoản phải thu (Nợ 1388 / Có 131), <strong>không phải</strong> khách
            hoặc tài xế đã trả tiền thật. Khoản nợ khách hàng này sẽ tất toán, thay bằng 1 khoản nợ tài xế mới
            cùng số tiền — tài xế sau đó nộp tiền theo đúng luồng công nợ tài xế thông thường.
          </p>

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 p-3 rounded-lg">
              <RiAlertLine size={13} />
              {error}
            </div>
          )}

          <Select
            label="Tài xế nhận công nợ"
            placeholder="Chọn tài xế..."
            isLoading={loadingDrivers}
            selectedKeys={driverId}
            onSelectionChange={setDriverId}
          >
            {drivers.map((d) => (
              <SelectItem key={String(d.id)} textValue={d.full_name}>
                {d.full_name}{d.plate_number ? ` · ${d.plate_number}` : ""}
              </SelectItem>
            ))}
          </Select>

          <Input
            label="Ghi chú (tuỳ chọn)"
            placeholder="Lý do chuyển công nợ..."
            value={notes}
            onValueChange={setNotes}
            classNames={{ inputWrapper: "bg-white" }}
          />
        </ModalBody>

        <ModalFooter>
          <Button variant="light" onPress={onClose} isDisabled={saving}>Huỷ</Button>
          <Button color="warning" onPress={handleSubmit} isLoading={saving}
            startContent={!saving && <RiArrowLeftRightLine size={15} />}>
            Chuyển công nợ
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

function DebtDetailRow({ d, onTransfer }) {
  const overdue = isOverdue(d.due_date);
  const status  = d.computed_status;

  return (
    <tr className="bg-orange-50/20 border-b border-orange-100/30">
      {}
      <td className="py-2.5 pl-4" />

      {}
      <td className="py-2.5 pr-4 overflow-hidden">
        <div className="flex items-start gap-2">
          <span className="text-[10px] text-orange-400 font-bold shrink-0 mt-0.5">#{d.id}</span>
          <div className="flex flex-col gap-0.5 overflow-hidden">
            <span className="text-xs font-medium text-gray-700 truncate">
              {d.order_id ? `Đơn #${d.order_id}` : "—"}
              {d.order_cargo_name ? ` · ${d.order_cargo_name}` : ""}
            </span>
            {d.notes && (
              <span className="text-[10px] text-gray-400 italic truncate">{d.notes}</span>
            )}
          </div>
        </div>
      </td>

      {}
      <td className="py-2.5 pr-4 text-center">
        <div className="flex flex-col gap-0.5 items-center">
          <span className="text-[10px] text-gray-400">
            {d.created_at ? new Date(d.created_at).toLocaleDateString("vi-VN") : "—"}
          </span>
          {d.due_date && (
            <span className={`text-[10px] font-medium ${overdue ? "text-red-500" : "text-gray-400"}`}>
              Hạn: {new Date(d.due_date).toLocaleDateString("vi-VN")}
              {overdue && <RiAlertLine size={10} className="inline text-red-500 ml-0.5 align-middle" />}
            </span>
          )}
        </div>
      </td>

      {}
      <td className="py-2.5 pr-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-bold text-red-500">{VND(d.remaining)}</span>
          <span className="text-[10px] text-gray-400">/ {VND(d.total_amount)}</span>
        </div>
      </td>

      {}
      <td className="py-2.5 pr-4">
        {STATUS_CHIP[status] && (
          <Chip size="sm" color={STATUS_CHIP[status].color} variant="flat" className="text-[10px] h-5">
            {STATUS_CHIP[status].label}
          </Chip>
        )}
      </td>

      {}
      <td className="py-2.5 pr-4" onClick={(e) => e.stopPropagation()}>
        {status !== "paid" && onTransfer && (
          <Button
            size="sm" color="warning" variant="flat" isIconOnly
            title="Chuyển sang công nợ tài xế"
            className="h-7 w-7 min-w-7"
            onPress={() => onTransfer(d)}
          >
            <RiArrowLeftRightLine size={13} />
          </Button>
        )}
      </td>
    </tr>
  );
}

function PersonRow({ person, onPay, onTransfer, refreshKey }) {
  const [expanded, setExpanded] = useState(false);
  const [debts, setDebts]       = useState(null);
  const [loading, setLoading]   = useState(false);

  const { name, phone, person_id } = getPersonInfo(person);
  const chipProps = STATUS_CHIP[person.computed_status];

  const loadDebts = useCallback(async () => {
    if (!person_id) return;
    setLoading(true);
    try {
      const data = await accountantService.getDebtsByPerson(person.debt_type, person_id);
      setDebts(Array.isArray(data?.debts) ? data.debts : []);
    } catch {
      setDebts([]);
    } finally {
      setLoading(false);
    }
  }, [person, person_id]);

  const toggle = useCallback(() => {
    const next = !expanded;
    setExpanded(next);
    if (next && debts === null) loadDebts();
  }, [expanded, debts, loadDebts]);

  // Sau khi chuyển công nợ (hoặc ghi nhận thanh toán) thành công, danh sách khoản nợ chi
  // tiết đã mở của dòng này cần nạp lại — chỉ đổi identity của `person` (từ refetch() ở
  // component cha) không tự làm mất state debts cục bộ đang cache ở đây.
  useEffect(() => {
    if (expanded && refreshKey !== undefined) loadDebts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  return (
    <>
      <tr
        className={`border-b border-gray-100 cursor-pointer transition-colors
                   ${expanded ? "bg-orange-50/40" : "hover:bg-gray-50/60"}`}
        onClick={toggle}
      >
        {}
        <td className="py-3.5 pl-4">
          <span className="text-gray-400">
            {expanded ? <RiArrowDownSLine size={17} /> : <RiArrowRightSLine size={17} />}
          </span>
        </td>

        {}
        <td className="py-3.5 pr-4 overflow-hidden">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold text-gray-800 truncate">{name}</span>
            {phone && <span className="text-xs text-gray-400 font-mono">{phone}</span>}
            {person.debt_type === "customer" && person.customer_company && (
              <span className="text-[11px] text-gray-400 truncate">{person.customer_company}</span>
            )}
          </div>
        </td>

        {}
        <td className="py-3.5 pr-4 text-center">
          <span className="text-xs text-gray-500">{person.debt_count ?? 0} khoản</span>
        </td>

        {}
        <td className="py-3.5 pr-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-bold text-red-600">{VND(person.total_remaining)}</span>
            <span className="text-[10px] text-gray-400">/ {VND(person.total_amount)}</span>
          </div>
        </td>

        {}
        <td className="py-3.5 pr-4">
          {chipProps && (
            <Chip size="sm" color={chipProps.color} variant="flat" className="text-[10px] h-5">
              {chipProps.label}
            </Chip>
          )}
          {isOverdue(person.earliest_due_date) && person.computed_status !== "paid" && (
            <p className="text-[10px] text-red-500 mt-0.5 font-medium flex items-center gap-0.5">
              <RiAlertLine size={10} />Quá hạn
            </p>
          )}
        </td>

        {}
        <td className="py-3.5 pr-4" onClick={(e) => e.stopPropagation()}>
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
          <DebtDetailRow
            key={d.id}
            d={d}
            onTransfer={person.debt_type === "customer" ? onTransfer : undefined}
          />
        ))
      )}
    </>
  );
}

export function DebtView({ search = "" }) {
  const {
    stats, statsLoading,
    debtType, setDebtType,
    customerDebts, driverDebts,
    groupedLoading,
    refetch,
  } = useDebts();

  const [payPerson, setPayPerson]           = useState(null);
  const [transferTarget, setTransferTarget] = useState(null);
  const [debtsRefreshKey, setDebtsRefreshKey] = useState(0);
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy]             = useState("remaining_desc");
  const [tab, setTab] = useState("debts");
  const [pendingCount, setPendingCount] = useState(0);

  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const list = debtType === "customer" ? customerDebts : driverDebts;

  const filteredList = useMemo(() => {
    const rows = list.filter((person) => {
      const { name, phone } = getPersonInfo(person);
      if (search && (
        !name.toLowerCase().includes(search.toLowerCase()) &&
        !(phone ?? "").includes(search)
      )) return false;
      if (statusFilter !== "all" && person.computed_status !== statusFilter) return false;
      return true;
    });
    const sorted = [...rows];
    if (sortBy === "remaining_asc") {
      sorted.sort((a, b) => Number(a.total_remaining || 0) - Number(b.total_remaining || 0));
    } else if (sortBy === "overdue_first") {
      sorted.sort((a, b) => {
        const aDue = a.earliest_due_date ? new Date(a.earliest_due_date).getTime() : Infinity;
        const bDue = b.earliest_due_date ? new Date(b.earliest_due_date).getTime() : Infinity;
        return aDue - bDue;
      });
    } else {
      sorted.sort((a, b) => Number(b.total_remaining || 0) - Number(a.total_remaining || 0));
    }
    return sorted;
  }, [list, search, statusFilter, sortBy]);

  useEffect(() => { setPage(1); }, [debtType, statusFilter, sortBy, search]);

  const totalItems = filteredList.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage   = Math.min(page, totalPages);
  const pagedList  = filteredList.slice((safePage - 1) * pageSize, safePage * pageSize);

  const handlePageSizeChange = (size) => { setPageSize(size); setPage(1); };

  const unpaidCount  = list.filter((d) => d.computed_status === "unpaid").length;
  const partialCount = list.filter((d) => d.computed_status === "partial").length;

  return (
    <div className="flex flex-col gap-5">

      {/* Tab chuyển giữa Công nợ và Báo nộp tiền chờ xác nhận */}
      <div className="flex gap-1 bg-white border border-gray-100 rounded-2xl p-1.5 shadow-sm w-fit">
        <button
          onClick={() => setTab("debts")}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all
            ${tab === "debts" ? "bg-blue-600 text-white shadow-sm" : "text-gray-500 hover:bg-gray-50"}`}
        >
          <RiListCheck2 size={15} />
          Công nợ
        </button>
        <button
          onClick={() => setTab("pending")}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all
            ${tab === "pending" ? "bg-blue-600 text-white shadow-sm" : "text-gray-500 hover:bg-gray-50"}`}
        >
          <RiTimeLine size={15} />
          Chờ xác nhận
          {pendingCount > 0 && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tab === "pending" ? "bg-white/20" : "bg-amber-100 text-amber-600"}`}>
              {pendingCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab("history")}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all
            ${tab === "history" ? "bg-blue-600 text-white shadow-sm" : "text-gray-500 hover:bg-gray-50"}`}
        >
          <RiHistoryLine size={15} />
          Lịch sử thanh toán
        </button>
      </div>

      {/* Giữ panel luôn mount để đếm số lượng chính xác trên tab, chỉ ẩn/hiện bằng CSS */}
      <div className={tab === "pending" ? "" : "hidden"}>
        <PendingRepaymentsPanel onChanged={refetch} onCountChange={setPendingCount} />
      </div>

      {tab === "history" && <PaymentHistoryPanel />}

      {tab === "debts" && (
      <>
      {}
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

      {}
      <div className="flex items-center justify-between flex-wrap gap-3">
        {}
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

        {}
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

        <Select
          aria-label="Sắp xếp"
          placeholder="Sắp xếp"
          size="sm"
          className="w-48"
          selectedKeys={new Set([sortBy])}
          onChange={(e) => setSortBy(e.target.value)}
        >
          {SORT_OPTIONS.map(({ key, label }) => (
            <SelectItem key={key} textValue={label}>{label}</SelectItem>
          ))}
        </Select>
      </div>

      {}
      <div className="rounded-2xl border border-gray-200 overflow-hidden bg-white shadow-sm">
        {groupedLoading ? (
          <div className="flex items-center justify-center py-20">
            <Spinner color="primary" label="Đang tải..." size="lg" />
          </div>
        ) : filteredList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-2xl bg-green-50 flex items-center justify-center">
              <RiCheckboxCircleLine size={22} className="text-green-400" />
            </div>
            <p className="text-gray-500 text-sm">Không có công nợ nào.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full" style={{ tableLayout: "fixed", minWidth: 900 }}>
            <colgroup>
              <col style={{ width: 40 }} />
              <col />
              <col style={{ width: 88 }} />
              <col style={{ width: 152 }} />
              <col style={{ width: 112 }} />
              <col style={{ width: 44 }} />
            </colgroup>
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-200">
                {[
                  { label: "",              cls: "pl-4" },
                  { label: "Tên / Liên hệ" },
                  { label: "Số khoản",      cls: "text-center" },
                  { label: "Còn lại / Tổng" },
                  { label: "Trạng thái" },
                  { label: "" },
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
              {pagedList.map((p, i) => (
                <PersonRow
                  key={`${p.debt_type}-${p.driver_id ?? p.customer_ids?.[0]}-${i}`}
                  person={p}
                  onPay={setPayPerson}
                  onTransfer={setTransferTarget}
                  refreshKey={debtsRefreshKey}
                />
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {}
      {!groupedLoading && filteredList.length > 0 && (
        <PaginationBar
          page={safePage}
          pageSize={pageSize}
          totalItems={totalItems}
          totalPages={totalPages}
          onPageChange={setPage}
          onPageSizeChange={handlePageSizeChange}
        />
      )}
      </>
      )}

      {payPerson && (
        <PayDebtModal
          person={payPerson}
          onClose={() => setPayPerson(null)}
          onDone={refetch}
        />
      )}

      {transferTarget && (
        <TransferDebtModal
          debt={transferTarget}
          onClose={() => setTransferTarget(null)}
          onDone={() => { refetch(); setDebtsRefreshKey((k) => k + 1); }}
        />
      )}
    </div>
  );
}
