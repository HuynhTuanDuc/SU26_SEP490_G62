import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import {
  Button, Input, Select, SelectItem, Spinner, Pagination,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
} from "@heroui/react";
import { RiPhoneLine, RiBuildingLine, RiArrowDownSLine, RiArrowRightSLine } from "react-icons/ri";
import { apiRequest } from "../../services/apiClient";
import { DebtBadge, STATUS_CFG, DEBT_TYPE_CFG } from "./components/debt/DebtBadge";

const fmt = (v) => Number(v || 0).toLocaleString("vi-VN");

const DEBT_TYPE_OPTIONS = [
  { key: "all",      label: "Tất cả"    },
  { key: "customer", label: "Khách nợ"  },
  { key: "driver",   label: "Tài xế nợ" },
];
const STATUS_OPTIONS = [
  { key: "all",     label: "Tất cả"         },
  { key: "unpaid",  label: "Chưa thanh toán" },
  { key: "partial", label: "Thu một phần"    },
  { key: "paid",    label: "Đã thanh toán"   },
];
const PAYMENT_METHOD_OPTIONS = [
  { key: "cash",          label: "Tiền mặt"    },
  { key: "bank_transfer", label: "Chuyển khoản" },
  { key: "offset",        label: "Bù trừ"      },
];

// Shared table header/cell class
const TH = "px-3.5 py-3 text-left text-[11px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap";
const TD = "px-3.5 py-3 text-sm";

export default function DebtTable({ onDebtPayment }) {
  const [debts, setDebts]               = useState([]);
  const [groupedDebts, setGroupedDebts] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [pagination, setPagination]     = useState({ currentPage: 1, totalPages: 1, totalItems: 0 });
  const [stats, setStats]               = useState({ byType: {}, totalRemaining: 0 });
  const [viewMode, setViewMode]         = useState("grouped");
  const [expandedRows, setExpandedRows] = useState({});
  const [personDebts, setPersonDebts]   = useState({});
  const [loadingPersonDebts, setLoadingPersonDebts] = useState({});

  const [debtTypeFilter, setDebtTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter]     = useState("all");
  const [customerSearch, setCustomerSearch] = useState("");
  const [driverSearch, setDriverSearch]     = useState("");

  const [itemPayment, setItemPayment]             = useState(null);
  const [itemPaymentAmount, setItemPaymentAmount] = useState("");
  const [itemPaymentMethod, setItemPaymentMethod] = useState("cash");
  const [itemPaymentNotes, setItemPaymentNotes]   = useState("");
  const [itemPaymentError, setItemPaymentError]   = useState("");
  const [itemPaymentLoading, setItemPaymentLoading] = useState(false);

  const apiDebtType = debtTypeFilter === "all" ? "" : debtTypeFilter;
  const apiStatus   = statusFilter   === "all" ? "" : statusFilter;

  const fetchDebts = async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 20 });
      if (apiDebtType)           params.set("debt_type", apiDebtType);
      if (apiStatus)             params.set("status", apiStatus);
      if (customerSearch.trim()) params.set("customer", customerSearch.trim());
      if (driverSearch.trim())   params.set("driver", driverSearch.trim());
      const data = await apiRequest(`/accountant/debts?${params}`);
      setDebts(data.debts || []);
      setPagination({ currentPage: data.currentPage, totalPages: data.totalPages, totalItems: data.totalItems });
    } catch (err) {
      console.error("Không tải được công nợ:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchGroupedDebts = async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 20 });
      if (apiDebtType)           params.set("debt_type", apiDebtType);
      if (apiStatus)             params.set("status", apiStatus);
      if (customerSearch.trim()) params.set("customer", customerSearch.trim());
      if (driverSearch.trim())   params.set("driver", driverSearch.trim());
      const data = await apiRequest(`/accountant/debts/grouped?${params}`);
      setGroupedDebts(data.debts || []);
      setPagination({ currentPage: data.currentPage, totalPages: data.totalPages, totalItems: data.totalPersons });
    } catch (err) {
      console.error("Không tải được công nợ nhóm:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const data = await apiRequest("/accountant/debts/stats");
      setStats(data);
    } catch (err) {
      console.error("Không tải được thống kê:", err);
    }
  };

  const fetchPersonDebts = async (personType, personKey, customerIds, driverId) => {
    setLoadingPersonDebts((prev) => ({ ...prev, [personKey]: true }));
    try {
      let path;
      if (personType === "driver" && driverId) {
        path = `/accountant/debts/person/driver/${driverId}`;
      } else if (customerIds?.length > 0) {
        const primaryId = customerIds.find((id) => id != null);
        if (!primaryId) return;
        path = `/accountant/debts/person/customer/${primaryId}?customer_ids=${customerIds.join(",")}`;
      } else {
        return;
      }
      const data = await apiRequest(path);
      setPersonDebts((prev) => ({ ...prev, [personKey]: data.debts || [] }));
    } catch (err) {
      console.error("Không tải chi tiết công nợ:", err);
    } finally {
      setLoadingPersonDebts((prev) => ({ ...prev, [personKey]: false }));
    }
  };

  useEffect(() => {
    if (viewMode === "detail") fetchDebts(1);
    else fetchGroupedDebts(1);
    fetchStats();
  }, [debtTypeFilter, statusFilter, viewMode]);

  const runFetch = (page = 1) => viewMode === "detail" ? fetchDebts(page) : fetchGroupedDebts(page);
  const handlePageChange   = (page) => { runFetch(page); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const handleSearch       = () => runFetch(1);
  const handleClearFilters = () => {
    setDebtTypeFilter("all"); setStatusFilter("all"); setCustomerSearch(""); setDriverSearch("");
    setTimeout(() => runFetch(1), 0);
  };
  const refreshCurrentView = () => { runFetch(pagination.currentPage || 1); fetchStats(); };

  const openItemPayment = (debt, context = {}) => {
    setItemPayment({ ...debt, remaining: Number(debt.remaining || 0), personKey: context.personKey || null, personType: context.personType || debt.debt_type, customerIds: context.customerIds || null, driverId: context.driverId || null });
    setItemPaymentAmount(""); setItemPaymentMethod("cash"); setItemPaymentNotes(""); setItemPaymentError("");
  };

  const closeItemPayment = () => {
    if (itemPaymentLoading) return;
    setItemPayment(null); setItemPaymentAmount(""); setItemPaymentNotes(""); setItemPaymentError("");
  };

  const submitItemPayment = async () => {
    const amount    = Number(itemPaymentAmount);
    const remaining = Number(itemPayment?.remaining || 0);
    if (!itemPayment) return;
    if (!amount || amount <= 0) { setItemPaymentError("Vui lòng nhập số tiền thu lớn hơn 0."); return; }
    if (amount > remaining + 0.01) { setItemPaymentError(`Số tiền không được lớn hơn số còn nợ (${fmt(remaining)}đ).`); return; }
    try {
      setItemPaymentLoading(true); setItemPaymentError("");
      await apiRequest("/accountant/debts/payment/by-debt", {
        method: "POST",
        body: { debtId: itemPayment.id, amount, paymentMethod: itemPaymentMethod, notes: itemPaymentNotes.trim() || `Thu tiền khoản nợ #${itemPayment.id}` },
      });
      if (itemPayment.personKey) {
        await fetchPersonDebts(itemPayment.personType, itemPayment.personKey, itemPayment.customerIds, itemPayment.driverId);
      }
      refreshCurrentView();
      setItemPayment(null); setItemPaymentAmount(""); setItemPaymentNotes(""); setItemPaymentError("");
    } catch (err) {
      setItemPaymentError(err.message || "Ghi nhận thu tiền thất bại.");
    } finally {
      setItemPaymentLoading(false);
    }
  };

  const toggleExpand = (debt, key) => {
    if (expandedRows[key]) {
      setExpandedRows((prev) => { const n = { ...prev }; delete n[key]; return n; });
    } else {
      setExpandedRows((prev) => ({ ...prev, [key]: true }));
      if (!personDebts[key]) fetchPersonDebts(debt.debt_type, key, debt.customer_ids, debt.driver_id);
    }
  };

  const customerStats = stats.byType?.customer;
  const driverStats   = stats.byType?.driver;

  return (
    <div className="flex flex-col gap-5">
      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Tổng nợ khách"    amount={customerStats?.total_remaining || 0} count={customerStats?.count || 0} color="text-violet-600" />
        <StatCard label="Tổng nợ tài xế"   amount={driverStats?.total_remaining   || 0} count={driverStats?.count   || 0} color="text-orange-500" />
        <StatCard label="Tổng còn phải thu" amount={stats.totalRemaining || 0} count={(customerStats?.count || 0) + (driverStats?.count || 0)} color="text-red-500" />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 p-4 bg-gray-50 border border-gray-200 rounded-xl items-end">
        {/* View toggle */}
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Chế độ xem</span>
          <div className="flex gap-1">
            {[["grouped", "Nhóm theo người"], ["detail", "Chi tiết"]].map(([mode, lbl]) => (
              <Button
                key={mode}
                size="sm"
                variant={viewMode === mode ? "solid" : "bordered"}
                color={viewMode === mode ? "primary" : "default"}
                onPress={() => setViewMode(mode)}
                className="text-[12px]"
              >{lbl}</Button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Loại nợ</span>
          <Select
            size="sm" variant="bordered"
            selectedKeys={[debtTypeFilter]}
            onChange={(e) => setDebtTypeFilter(e.target.value || "all")}
            className="min-w-[130px]"
          >
            {DEBT_TYPE_OPTIONS.map((o) => <SelectItem key={o.key}>{o.label}</SelectItem>)}
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Trạng thái</span>
          <Select
            size="sm" variant="bordered"
            selectedKeys={[statusFilter]}
            onChange={(e) => setStatusFilter(e.target.value || "all")}
            className="min-w-[160px]"
          >
            {STATUS_OPTIONS.map((o) => <SelectItem key={o.key}>{o.label}</SelectItem>)}
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Tìm khách hàng</span>
          <Input
            size="sm" variant="bordered"
            value={customerSearch}
            onValueChange={setCustomerSearch}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Tên, công ty, SĐT..."
            className="w-44"
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Tìm tài xế</span>
          <Input
            size="sm" variant="bordered"
            value={driverSearch}
            onValueChange={setDriverSearch}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Tên tài xế..."
            className="w-36"
          />
        </div>

        <Button size="sm" color="primary" onPress={handleSearch}>Tìm kiếm</Button>
        <Button size="sm" variant="bordered" onPress={handleClearFilters}>Xóa lọc</Button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner color="primary" label="Đang tải công nợ..." />
        </div>
      ) : viewMode === "grouped" ? (
        <GroupedDebtView
          debts={groupedDebts} expandedRows={expandedRows} personDebts={personDebts}
          loadingPersonDebts={loadingPersonDebts} toggleExpand={toggleExpand}
          pagination={pagination} onPageChange={handlePageChange}
          onDebtPayment={onDebtPayment} onDebtItemPayment={openItemPayment}
        />
      ) : (
        <DetailDebtView
          debts={debts} pagination={pagination}
          onPageChange={handlePageChange} onDebtItemPayment={openItemPayment}
        />
      )}

      {/* Per-debt payment modal */}
      <Modal isOpen={!!itemPayment} onClose={closeItemPayment} size="md">
        <ModalContent>
          {(onClose) => {
            const remaining  = Number(itemPayment?.remaining || 0);
            const debtorName = itemPayment?.debt_type === "driver"
              ? itemPayment?.driver_name   || "Tài xế"
              : itemPayment?.customer_name || "Khách hàng";
            return (
              <>
                <ModalHeader className="flex flex-col gap-0.5">
                  <span className="text-base font-extrabold">Thu tiền chuyến</span>
                  <span className="text-[12px] font-normal text-gray-400">
                    Debt #{itemPayment?.id} · Chuyến #{itemPayment?.shipment_id || "—"} · {debtorName}
                  </span>
                </ModalHeader>

                <ModalBody>
                  {/* Summary */}
                  <div className="grid grid-cols-3 gap-2 p-3 bg-gray-50 rounded-xl border border-gray-200">
                    {[["Tổng nợ", itemPayment?.total_amount, "text-gray-800"], ["Đã trả", itemPayment?.paid_amount, "text-green-600"], ["Còn nợ", remaining, "text-red-500"]].map(([lbl, val, cls]) => (
                      <div key={lbl} className="text-center">
                        <div className="text-[11px] font-bold text-gray-400 uppercase">{lbl}</div>
                        <div className={`text-[15px] font-extrabold ${cls}`}>{fmt(val)}đ</div>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-[1fr_160px] gap-3 mt-1">
                    <Input
                      size="sm" variant="bordered" type="number"
                      label="Số tiền thu" placeholder={`Tối đa ${fmt(remaining)}đ`}
                      value={itemPaymentAmount}
                      onValueChange={(v) => { setItemPaymentAmount(v); setItemPaymentError(""); }}
                      min={1} max={remaining}
                    />
                    <Select
                      size="sm" variant="bordered" label="Hình thức"
                      selectedKeys={[itemPaymentMethod]}
                      onChange={(e) => setItemPaymentMethod(e.target.value)}
                    >
                      {PAYMENT_METHOD_OPTIONS.map((o) => <SelectItem key={o.key}>{o.label}</SelectItem>)}
                    </Select>
                  </div>

                  <Input
                    size="sm" variant="bordered" label="Ghi chú"
                    placeholder="Ghi chú cho lần thu này..."
                    value={itemPaymentNotes}
                    onValueChange={setItemPaymentNotes}
                  />

                  {itemPaymentError && (
                    <p className="text-danger text-sm font-semibold">{itemPaymentError}</p>
                  )}
                </ModalBody>

                <ModalFooter>
                  <Button variant="bordered" onPress={onClose} isDisabled={itemPaymentLoading}>Hủy</Button>
                  <Button color="success" onPress={submitItemPayment} isLoading={itemPaymentLoading} isDisabled={!itemPaymentAmount}>
                    Xác nhận thu
                  </Button>
                </ModalFooter>
              </>
            );
          }}
        </ModalContent>
      </Modal>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, amount, count, color }) {
  return (
    <div className="border border-gray-200 rounded-2xl p-4 bg-gray-50">
      <div className="text-[11px] text-gray-400 font-bold uppercase tracking-wider mb-1.5">{label}</div>
      <div className={`text-[22px] font-extrabold ${color}`}>{fmt(amount)}đ</div>
      <div className="text-[12px] text-gray-400 mt-0.5">{count} khoản nợ</div>
    </div>
  );
}

// ─── Detail View ──────────────────────────────────────────────────────────────
function DetailDebtView({ debts, pagination, onPageChange, onDebtItemPayment }) {
  if (debts.length === 0) {
    return <EmptyState text="Không có khoản công nợ nào phù hợp." />;
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="bg-gray-50 border-b-2 border-gray-200">
              {["Loại","Người nợ","Thông tin liên hệ","Đơn / Chuyến","Tổng nợ","Đã trả","Còn nợ","Hạn","Trạng thái","Ghi chú",""].map((h) => (
                <th key={h} className={TH}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {debts.map((debt) => {
              const total     = Number(debt.total_amount || 0);
              const paid      = Number(debt.paid_amount  || 0);
              const remaining = Number(debt.remaining    || 0);
              const typeCfg   = DEBT_TYPE_CFG[debt.debt_type] || DEBT_TYPE_CFG.customer;
              const statusCfg = STATUS_CFG[debt.computed_status || "unpaid"] || STATUS_CFG.unpaid;
              const name      = debt.debt_type === "driver" ? debt.driver_name || "—" : debt.customer_name || "—";
              const contactItems = debt.debt_type !== "driver"
                ? [
                    debt.customer_phone && { icon: RiPhoneLine, text: debt.customer_phone },
                    debt.customer_company && { icon: RiBuildingLine, text: debt.customer_company },
                  ].filter(Boolean)
                : [];
              const contact = contactItems.length > 0
                ? (
                  <span className="flex flex-col gap-0.5">
                    {contactItems.map(({ icon: Icon, text }, i) => (
                      <span key={i} className="flex items-center gap-1">
                        <Icon size={11} className="shrink-0 text-gray-400" />{text}
                      </span>
                    ))}
                  </span>
                )
                : "—";
              const orderRef  = debt.order_id ? `#${debt.order_id}${debt.shipment_id ? ` / #${debt.shipment_id}` : ""}` : "—";
              const dueDate   = debt.due_date ? new Date(debt.due_date).toLocaleDateString("vi-VN") : "—";

              return (
                <tr key={debt.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className={TD}><DebtBadge label={typeCfg.label} color={typeCfg.color} /></td>
                  <td className={`${TD} font-semibold max-w-[160px]`}>{name}</td>
                  <td className={`${TD} text-gray-400 text-[12px] max-w-[200px]`}>{contact}</td>
                  <td className={`${TD} font-mono text-[12px] text-gray-400`}>{orderRef}</td>
                  <td className={`${TD} font-bold text-right`}>{fmt(total)}đ</td>
                  <td className={`${TD} font-bold text-green-600 text-right`}>{fmt(paid)}đ</td>
                  <td className={`${TD} font-bold text-right ${remaining > 0 ? "text-red-500" : "text-green-600"}`}>{fmt(remaining)}đ</td>
                  <td className={`${TD} text-gray-400 text-[12px]`}>{dueDate}</td>
                  <td className={TD}><DebtBadge label={statusCfg.label} color={statusCfg.color} /></td>
                  <td className={`${TD} text-gray-400 text-[12px] max-w-[180px] truncate`}>{debt.notes || "—"}</td>
                  <td className={`${TD} text-center`}>
                    {remaining > 0 && (
                      <Button size="sm" color="success" variant="flat" onPress={() => onDebtItemPayment?.(debt)} className="text-[11px] h-6 min-w-0 px-2.5">Thu</Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pagination.totalPages > 1 && (
        <div className="flex justify-center">
          <Pagination total={pagination.totalPages} page={pagination.currentPage} onChange={onPageChange} color="primary" size="sm" showControls />
        </div>
      )}
    </div>
  );
}

// ─── Grouped View ─────────────────────────────────────────────────────────────
function GroupedDebtView({ debts, expandedRows, personDebts, loadingPersonDebts, toggleExpand, pagination, onPageChange, onDebtPayment, onDebtItemPayment }) {
  if (debts.length === 0) {
    return <EmptyState text="Không có công nợ nào phù hợp." />;
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {debts.map((debt) => {
          const key          = `${debt.debt_type}-${debt.customer_ids?.[0] || debt.driver_id}`;
          const isExpanded   = !!expandedRows[key];
          const typeCfg      = DEBT_TYPE_CFG[debt.debt_type] || DEBT_TYPE_CFG.customer;
          const statusCfg    = STATUS_CFG[debt.computed_status || "unpaid"] || STATUS_CFG.unpaid;
          const personName   = debt.debt_type === "driver" ? debt.driver_name || "—" : debt.customer_name || "—";
          const personPhone  = debt.debt_type === "driver" ? debt.driver_phone || "" : debt.customer_phone || "";
          const totalRemaining = Number(debt.total_remaining || 0);

          return (
            <div key={key} className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
              {/* Summary row */}
              <div
                className={`flex items-center px-4 py-3 gap-3 cursor-pointer transition-colors ${isExpanded ? "bg-gray-50" : "hover:bg-gray-50/60"}`}
                onClick={() => toggleExpand(debt, key)}
              >
                <span className="text-gray-400 w-4 flex-shrink-0 flex items-center">
                  {isExpanded
                    ? <RiArrowDownSLine size={16} />
                    : <RiArrowRightSLine size={16} />}
                </span>

                <DebtBadge label={typeCfg.label} color={typeCfg.color} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-800">{personName}</span>
                    <span className="text-[12px] text-gray-400">({debt.debt_count} chuyến)</span>
                  </div>
                  {personPhone && (
                    <div className="text-[12px] text-gray-400 mt-0.5 font-mono flex items-center gap-1">
                      <RiPhoneLine size={11} className="shrink-0" />{personPhone}
                    </div>
                  )}
                </div>

                <div className="text-right min-w-[160px]">
                  <div className="text-[11px] text-gray-400">Còn nợ</div>
                  <div className={`text-base font-bold ${totalRemaining > 0 ? "text-red-500" : "text-green-600"}`}>{fmt(totalRemaining)}đ</div>
                  <div className="text-[11px] text-gray-300">Tổng: {fmt(debt.total_amount)}đ · Đã trả: {fmt(debt.total_paid)}đ</div>
                </div>

                <DebtBadge label={statusCfg.label} color={statusCfg.color} />

                {totalRemaining > 0 && onDebtPayment && (
                  <Button
                    size="sm" color="success" variant="flat"
                    onPress={(e) => { onDebtPayment({ type: debt.debt_type, id: debt.debt_type === "driver" ? debt.driver_id : debt.customer_ids?.[0], name: personName, phone: personPhone, remaining: totalRemaining }); }}
                    onClick={(e) => e.stopPropagation()}
                  >Thu tiền</Button>
                )}
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="border-t border-gray-200">
                  {loadingPersonDebts[key] ? (
                    <div className="flex justify-center py-5">
                      <Spinner size="sm" color="primary" label="Đang tải chi tiết..." />
                    </div>
                  ) : (
                    <div className="p-3 overflow-x-auto">
                      <table className="w-full border-collapse text-[12px]">
                        <thead>
                          <tr className="bg-gray-50">
                            {["Khách hàng","SĐT","Đơn","Chuyến","Hàng hóa","Tổng nợ","Đã trả","Còn nợ","Trạng thái","Ghi chú",""].map((h) => (
                              <th key={h} className="px-2.5 py-2 text-left text-[11px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(personDebts[key] || []).map((d) => {
                            const dRemaining = Number(d.remaining || 0);
                            const dStatusCfg = STATUS_CFG[d.computed_status || "unpaid"] || STATUS_CFG.unpaid;
                            return (
                              <tr key={d.id} className="border-b border-gray-50 hover:bg-gray-50/40 transition-colors">
                                <td className="px-2.5 py-2 font-semibold">{d.customer_name || d.driver_name || "—"}</td>
                                <td className="px-2.5 py-2 font-mono text-[11px]">{d.customer_phone || d.driver_phone || "—"}</td>
                                <td className="px-2.5 py-2 font-mono">#{d.order_id}</td>
                                <td className="px-2.5 py-2 font-mono">#{d.shipment_id}</td>
                                <td className="px-2.5 py-2 max-w-[150px] truncate text-gray-500" title={d.order_cargo_name}>{d.order_cargo_name || "—"}</td>
                                <td className="px-2.5 py-2 font-semibold text-right">{fmt(d.total_amount)}đ</td>
                                <td className="px-2.5 py-2 text-green-600 text-right">{fmt(d.paid_amount)}đ</td>
                                <td className={`px-2.5 py-2 font-bold text-right ${dRemaining > 0 ? "text-red-500" : "text-green-600"}`}>{fmt(Math.max(dRemaining, 0))}đ</td>
                                <td className="px-2.5 py-2"><DebtBadge label={dStatusCfg.label} color={dStatusCfg.color} /></td>
                                <td className="px-2.5 py-2 text-gray-400 max-w-[150px] truncate" title={d.notes}>{d.notes || "—"}</td>
                                <td className="px-2.5 py-2">
                                  {dRemaining > 0 && (
                                    <Button size="sm" color="success" variant="flat" className="text-[11px] h-6 min-w-0 px-2.5"
                                      onPress={() => onDebtItemPayment?.(d, { personKey: key, personType: debt.debt_type, customerIds: debt.customer_ids, driverId: debt.driver_id })}
                                    >Thu</Button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {pagination.totalPages > 1 && (
        <div className="flex justify-between items-center">
          <span className="text-[12px] text-gray-400">Trang {pagination.currentPage} / {pagination.totalPages} — {pagination.totalItems} người</span>
          <Pagination total={pagination.totalPages} page={pagination.currentPage} onChange={onPageChange} color="primary" size="sm" showControls />
        </div>
      )}
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-gray-400">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="10"/><path d="M8 12h8"/>
      </svg>
      <p className="m-0 text-sm">{text}</p>
    </div>
  );
}

DebtTable.propTypes = { onDebtPayment: PropTypes.func };
