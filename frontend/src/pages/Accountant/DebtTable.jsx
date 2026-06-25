import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";

const fmt = (v) => Number(v || 0).toLocaleString("vi-VN");

const STATUS_CFG = {
  paid:    { label: "Đã thanh toán",   color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
  partial: { label: "Thu một phần",     color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
  unpaid:  { label: "Chưa thanh toán",  color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
};

const DEBT_TYPE_CFG = {
  customer: { label: "Khách nợ",    color: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe" },
  driver:   { label: "Tài xế nợ",   color: "#ea580c", bg: "#fff7ed", border: "#fed7aa" },
};

export default function DebtTable({ apiBase, token, onDebtPayment }) {
  const [debts, setDebts] = useState([]);
  const [groupedDebts, setGroupedDebts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ currentPage: 1, totalPages: 1, totalItems: 0 });
  const [stats, setStats] = useState({ byType: {}, totalRemaining: 0 });

  // View mode: 'detail' | 'grouped'
  const [viewMode, setViewMode] = useState("grouped");

  // Expanded rows (for grouped view)
  const [expandedRows, setExpandedRows] = useState({});

  // Detail view data for expanded row
  const [personDebts, setPersonDebts] = useState({});
  const [loadingPersonDebts, setLoadingPersonDebts] = useState({});

  // Filters
  const [debtTypeFilter, setDebtTypeFilter] = useState(""); // "" | "customer" | "driver"
  const [statusFilter, setStatusFilter] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [driverSearch, setDriverSearch] = useState("");
  const [itemPayment, setItemPayment] = useState(null);
  const [itemPaymentAmount, setItemPaymentAmount] = useState("");
  const [itemPaymentMethod, setItemPaymentMethod] = useState("cash");
  const [itemPaymentNotes, setItemPaymentNotes] = useState("");
  const [itemPaymentError, setItemPaymentError] = useState("");
  const [itemPaymentLoading, setItemPaymentLoading] = useState(false);

  const fetchDebts = async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 20 });
      if (debtTypeFilter) params.set("debt_type", debtTypeFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (customerSearch.trim()) params.set("customer", customerSearch.trim());
      if (driverSearch.trim()) params.set("driver", driverSearch.trim());

      const res = await fetch(`${apiBase}/accountant/debts?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDebts(data.debts || []);
        setPagination({
          currentPage: data.currentPage,
          totalPages: data.totalPages,
          totalItems: data.totalItems,
        });
      }
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
      if (debtTypeFilter) params.set("debt_type", debtTypeFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (customerSearch.trim()) params.set("customer", customerSearch.trim());
      if (driverSearch.trim()) params.set("driver", driverSearch.trim());

      const res = await fetch(`${apiBase}/accountant/debts/grouped?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setGroupedDebts(data.debts || []);
        setPagination({
          currentPage: data.currentPage,
          totalPages: data.totalPages,
          totalItems: data.totalPersons,
        });
      }
    } catch (err) {
      console.error("Không tải được công nợ nhóm:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(`${apiBase}/accountant/debts/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Không tải được thống kê công nợ:", err);
    }
  };

  const fetchPersonDebts = async (personType, personKey, customerIds, driverId) => {
    setLoadingPersonDebts((prev) => ({ ...prev, [personKey]: true }));
    try {
      let url;
      if (personType === "driver" && driverId) {
        url = `${apiBase}/accountant/debts/person/driver/${driverId}`;
      } else if (customerIds && customerIds.length > 0) {
        // Lấy personId đầu tiên từ customerIds để match route :personId
        const primaryId = customerIds.find(id => id != null);
        if (primaryId) {
          url = `${apiBase}/accountant/debts/person/customer/${primaryId}?customer_ids=${customerIds.join(",")}`;
        } else {
          setLoadingPersonDebts((prev) => ({ ...prev, [personKey]: false }));
          return;
        }
      } else {
        setLoadingPersonDebts((prev) => ({ ...prev, [personKey]: false }));
        return;
      }
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPersonDebts((prev) => ({ ...prev, [personKey]: data.debts || [] }));
      }
    } catch (err) {
      console.error("Không tải chi tiết công nợ:", err);
    } finally {
      setLoadingPersonDebts((prev) => ({ ...prev, [personKey]: false }));
    }
  };

  useEffect(() => {
    if (viewMode === "detail") {
      fetchDebts(1);
    } else {
      fetchGroupedDebts(1);
    }
    fetchStats();
  }, [debtTypeFilter, statusFilter, viewMode]);

  const handlePageChange = (page) => {
    if (viewMode === "detail") {
      fetchDebts(page);
    } else {
      fetchGroupedDebts(page);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSearch = () => {
    if (viewMode === "detail") {
      fetchDebts(1);
    } else {
      fetchGroupedDebts(1);
    }
  };

  const handleClearFilters = () => {
    setDebtTypeFilter("");
    setStatusFilter("");
    setCustomerSearch("");
    setDriverSearch("");
    setTimeout(() => {
      if (viewMode === "detail") {
        fetchDebts(1);
      } else {
        fetchGroupedDebts(1);
      }
    }, 0);
  };

  const refreshCurrentView = () => {
    if (viewMode === "detail") {
      fetchDebts(pagination.currentPage || 1);
    } else {
      fetchGroupedDebts(pagination.currentPage || 1);
    }
    fetchStats();
  };

  const openItemPayment = (debt, context = {}) => {
    const remaining = Number(debt.remaining || 0);
    setItemPayment({
      ...debt,
      remaining,
      personKey: context.personKey || null,
      personType: context.personType || debt.debt_type,
      customerIds: context.customerIds || null,
      driverId: context.driverId || null,
    });
    setItemPaymentAmount("");
    setItemPaymentMethod("cash");
    setItemPaymentNotes("");
    setItemPaymentError("");
  };

  const closeItemPayment = () => {
    if (itemPaymentLoading) return;
    setItemPayment(null);
    setItemPaymentAmount("");
    setItemPaymentNotes("");
    setItemPaymentError("");
  };

  const submitItemPayment = async () => {
    const amount = Number(itemPaymentAmount);
    const remaining = Number(itemPayment?.remaining || 0);

    if (!itemPayment) return;
    if (!amount || amount <= 0) {
      setItemPaymentError("Vui lòng nhập số tiền thu lớn hơn 0.");
      return;
    }
    if (amount > remaining + 0.01) {
      setItemPaymentError(`Số tiền thu không được lớn hơn số còn nợ (${fmt(remaining)}đ).`);
      return;
    }

    try {
      setItemPaymentLoading(true);
      setItemPaymentError("");
      const response = await fetch(`${apiBase}/accountant/debts/payment/by-debt`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          debtId: itemPayment.id,
          amount,
          paymentMethod: itemPaymentMethod,
          notes: itemPaymentNotes.trim() || `Thu tiền khoản nợ #${itemPayment.id}`,
        }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.details || result.message || result.error || "Ghi nhận thu tiền thất bại.");
      }

      const reloadDetails = itemPayment.personKey
        ? fetchPersonDebts(
            itemPayment.personType,
            itemPayment.personKey,
            itemPayment.customerIds,
            itemPayment.driverId
          )
        : Promise.resolve();

      refreshCurrentView();
      await reloadDetails;
      setItemPayment(null);
      setItemPaymentAmount("");
      setItemPaymentNotes("");
      setItemPaymentError("");
    } catch (err) {
      setItemPaymentError(err.message || "Ghi nhận thu tiền thất bại.");
    } finally {
      setItemPaymentLoading(false);
    }
  };

  const toggleExpand = (debt, key) => {
    if (expandedRows[key]) {
      setExpandedRows((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } else {
      setExpandedRows((prev) => ({ ...prev, [key]: true }));
      const personType = debt.debt_type;
      const personKey = `${debt.debt_type}-${debt.customer_ids?.[0] || debt.driver_id}`;
      if (!personDebts[key]) {
        fetchPersonDebts(personType, key, debt.customer_ids, debt.driver_id);
      }
    }
  };

  // Build stat cards from stats.byType
  const customerStats = stats.byType?.customer;
  const driverStats = stats.byType?.driver;

  return (
    <div>
      {/* Stat summary row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
        <DebtStatCard
          label="Tổng nợ khách"
          amount={customerStats?.total_remaining || 0}
          count={customerStats?.count || 0}
          color="#7c3aed"
        />
        <DebtStatCard
          label="Tổng nợ tài xế"
          amount={driverStats?.total_remaining || 0}
          count={driverStats?.count || 0}
          color="#ea580c"
        />
        <DebtStatCard
          label="Tổng còn phải thu"
          amount={stats.totalRemaining || 0}
          count={(customerStats?.count || 0) + (driverStats?.count || 0)}
          color="#dc2626"
        />
      </div>

      {/* Filter bar */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          marginBottom: 16,
          padding: "14px 16px",
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          alignItems: "flex-end",
        }}
      >
        {/* View mode toggle */}
        <FilterGroup label="Chế độ xem">
          <div style={{ display: "flex", gap: 4 }}>
            <button
              onClick={() => setViewMode("grouped")}
              style={{
                ...viewModeBtnStyle,
                background: viewMode === "grouped" ? "#1d4ed8" : "#fff",
                color: viewMode === "grouped" ? "#fff" : "#475569",
                borderColor: viewMode === "grouped" ? "#1d4ed8" : "#e2e8f0",
              }}
            >
              Nhóm theo người
            </button>
            <button
              onClick={() => setViewMode("detail")}
              style={{
                ...viewModeBtnStyle,
                background: viewMode === "detail" ? "#1d4ed8" : "#fff",
                color: viewMode === "detail" ? "#fff" : "#475569",
                borderColor: viewMode === "detail" ? "#1d4ed8" : "#e2e8f0",
              }}
            >
              Chi tiết
            </button>
          </div>
        </FilterGroup>

        <FilterGroup label="Loại nợ">
          <select
            value={debtTypeFilter}
            onChange={(e) => { setDebtTypeFilter(e.target.value); }}
            style={selectStyle}
          >
            <option value="">Tất cả</option>
            <option value="customer">Khách nợ</option>
            <option value="driver">Tài xế nợ</option>
          </select>
        </FilterGroup>

        <FilterGroup label="Trạng thái">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={selectStyle}
          >
            <option value="">Tất cả</option>
            <option value="unpaid">Chưa thanh toán</option>
            <option value="partial">Thu một phần</option>
            <option value="paid">Đã thanh toán</option>
          </select>
        </FilterGroup>

        <FilterGroup label="Tìm khách hàng">
          <input
            type="text"
            value={customerSearch}
            onChange={(e) => setCustomerSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Tên, công ty, SĐT..."
            style={{ ...inputStyle, width: 160 }}
          />
        </FilterGroup>

        <FilterGroup label="Tìm tài xế">
          <input
            type="text"
            value={driverSearch}
            onChange={(e) => setDriverSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Tên tài xế..."
            style={{ ...inputStyle, width: 140 }}
          />
        </FilterGroup>

        <button
          onClick={handleSearch}
          style={{ ...btnStyle, background: "#1d4ed8", color: "#fff", border: "none" }}
        >
          Tìm kiếm
        </button>
        <button
          onClick={handleClearFilters}
          style={{ ...btnStyle, background: "#f1f5f9", color: "#475569" }}
        >
          Xóa lọc
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>
          Đang tải dữ liệu công nợ...
        </div>
      ) : viewMode === "grouped" ? (
        <GroupedDebtView
          debts={groupedDebts}
          expandedRows={expandedRows}
          personDebts={personDebts}
          loadingPersonDebts={loadingPersonDebts}
          toggleExpand={toggleExpand}
          pagination={pagination}
          handlePageChange={handlePageChange}
          onDebtPayment={onDebtPayment}
          onDebtItemPayment={openItemPayment}
        />
      ) : (
        <DetailDebtView
          debts={debts}
          pagination={pagination}
          handlePageChange={handlePageChange}
          onDebtItemPayment={openItemPayment}
        />
      )}

      <DebtItemPaymentModal
        debt={itemPayment}
        amount={itemPaymentAmount}
        paymentMethod={itemPaymentMethod}
        notes={itemPaymentNotes}
        error={itemPaymentError}
        loading={itemPaymentLoading}
        onAmountChange={(value) => {
          setItemPaymentAmount(value);
          setItemPaymentError("");
        }}
        onPaymentMethodChange={setItemPaymentMethod}
        onNotesChange={setItemPaymentNotes}
        onClose={closeItemPayment}
        onSubmit={submitItemPayment}
      />
    </div>
  );
}

function FilterGroup({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function DebtStatCard({ label, amount, count, color }) {
  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 14, padding: "14px 16px", background: "#f8fafc" }}>
      <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color }}>
        {fmt(amount)}đ
      </div>
      <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
        {count} khoản nợ
      </div>
    </div>
  );
}

// Component view chi tiết từng khoản nợ (giữ nguyên bảng cũ)
function DetailDebtView({ debts, pagination, handlePageChange, onDebtItemPayment }) {
  if (debts.length === 0) {
    return (
      <div style={{ padding: 60, textAlign: "center" }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" style={{ marginBottom: 12 }}>
          <circle cx="12" cy="12" r="10"/><path d="M8 12h8"/>
        </svg>
        <p style={{ color: "#64748b", margin: 0 }}>Không có khoản công nợ nào phù hợp.</p>
      </div>
    );
  }

  return (
    <>
      <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid #e2e8f0" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
              {[
                "Loại",
                "Người nợ",
                "Thông tin liên hệ",
                "Đơn / Chuyến",
                "Tổng nợ",
                "Đã trả",
                "Còn nợ",
                "Hạn",
                "Trạng thái",
                "Ghi chú",
                "Thao tác",
              ].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {debts.map((debt) => {
              const total = Number(debt.total_amount || 0);
              const paid = Number(debt.paid_amount || 0);
              const remaining = Number(debt.remaining || 0);
              const typeCfg = DEBT_TYPE_CFG[debt.debt_type] || DEBT_TYPE_CFG.customer;
              const statusKey = debt.computed_status || "unpaid";
              const statusCfg = STATUS_CFG[statusKey] || STATUS_CFG.unpaid;

              const debtorName =
                debt.debt_type === "driver"
                  ? debt.driver_name || "—"
                  : debt.customer_name || "—";
              const debtorContact =
                debt.debt_type === "driver"
                  ? ""
                  : [
                      debt.customer_phone && `📞 ${debt.customer_phone}`,
                      debt.customer_company && `🏢 ${debt.customer_company}`,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—";

              const orderRef = debt.order_id
                ? `#${debt.order_id}${debt.shipment_id ? ` / #${debt.shipment_id}` : ""}`
                : "—";

              const dueDate = debt.due_date
                ? new Date(debt.due_date).toLocaleDateString("vi-VN")
                : "—";

              return (
                <tr key={debt.id} style={trStyle}>
                  <td style={tdStyle}>{renderBadge(typeCfg.label, typeCfg.color, typeCfg.bg, typeCfg.border)}</td>
                  <td style={{ ...tdStyle, fontWeight: 600, maxWidth: 160 }}>{debtorName}</td>
                  <td style={{ ...tdStyle, color: "#475569", fontSize: 12, maxWidth: 200 }}>{debtorContact || "—"}</td>
                  <td style={{ ...tdStyle, color: "#64748b", fontFamily: "monospace", fontSize: 12 }}>{orderRef}</td>
                  <td style={{ ...tdStyle, fontWeight: 700, textAlign: "right" }}>{fmt(total)}đ</td>
                  <td style={{ ...tdStyle, fontWeight: 700, color: "#16a34a", textAlign: "right" }}>{fmt(paid)}đ</td>
                  <td style={{ ...tdStyle, fontWeight: remaining > 0 ? 700 : 500, color: remaining > 0 ? "#dc2626" : "#16a34a", textAlign: "right" }}>{fmt(remaining)}đ</td>
                  <td style={{ ...tdStyle, color: "#475569", fontSize: 12 }}>{dueDate}</td>
                  <td style={tdStyle}>{renderBadge(statusCfg.label, statusCfg.color, statusCfg.bg, statusCfg.border)}</td>
                  <td style={{ ...tdStyle, color: "#64748b", fontSize: 12, maxWidth: 180 }}>{debt.notes || "—"}</td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    {remaining > 0 ? (
                      <button
                        type="button"
                        onClick={() => onDebtItemPayment?.(debt)}
                        style={itemPayBtnStyle}
                      >
                        Thu
                      </button>
                    ) : (
                      <span style={{ color: "#94a3b8", fontSize: 12 }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <PaginationControls pagination={pagination} handlePageChange={handlePageChange} itemLabel="khoản nợ" />
    </>
  );
}

// Component view nhóm theo người
function GroupedDebtView({ debts, expandedRows, personDebts, loadingPersonDebts, toggleExpand, pagination, handlePageChange, onDebtPayment, onDebtItemPayment }) {
  if (debts.length === 0) {
    return (
      <div style={{ padding: 60, textAlign: "center" }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" style={{ marginBottom: 12 }}>
          <circle cx="12" cy="12" r="10"/><path d="M8 12h8"/>
        </svg>
        <p style={{ color: "#64748b", margin: 0 }}>Không có công nợ nào phù hợp.</p>
      </div>
    );
  }

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {debts.map((debt) => {
          const key = `${debt.debt_type}-${debt.customer_ids?.[0] || debt.driver_id}`;
          const isExpanded = !!expandedRows[key];
          const typeCfg = DEBT_TYPE_CFG[debt.debt_type] || DEBT_TYPE_CFG.customer;
          const statusKey = debt.computed_status || "unpaid";
          const statusCfg = STATUS_CFG[statusKey] || STATUS_CFG.unpaid;

          const personName =
            debt.debt_type === "driver"
              ? debt.driver_name || "—"
              : debt.customer_name || "—";
          const personPhone =
            debt.debt_type === "driver"
              ? debt.driver_phone || ""
              : debt.customer_phone || "";
          const personContact = personPhone ? `📞 ${personPhone}` : "";

          const totalRemaining = Number(debt.total_remaining || 0);

          return (
            <div key={key} style={{ border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
              {/* Header row */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "12px 16px",
                  background: isExpanded ? "#f8fafc" : "#fff",
                  cursor: "pointer",
                  gap: 12,
                }}
                onClick={() => toggleExpand(debt, key)}
              >
                {/* Expand icon */}
                <span style={{ fontSize: 14, color: "#64748b", width: 20 }}>
                  {isExpanded ? "▼" : "▶"}
                </span>

                {/* Type badge */}
                {renderBadge(typeCfg.label, typeCfg.color, typeCfg.bg, typeCfg.border)}

                {/* Person info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: "#0f172a", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14 }}>{personName}</span>
                    <span style={{ color: "#64748b", fontWeight: 400, fontSize: 12 }}>
                      ({debt.debt_count} chuyến)
                    </span>
                  </div>
                  {personPhone && (
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                      <span>📞</span>
                      <span style={{ fontFamily: "monospace" }}>{personPhone}</span>
                    </div>
                  )}
                </div>

                {/* Amounts */}
                <div style={{ textAlign: "right", minWidth: 200 }}>
                  <div style={{ fontSize: 12, color: "#64748b" }}>Còn nợ</div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: totalRemaining > 0 ? "#dc2626" : "#16a34a" }}>
                    {fmt(totalRemaining)}đ
                  </div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>
                    Tổng: {fmt(Number(debt.total_amount))}đ · Đã trả: {fmt(Number(debt.total_paid))}đ
                  </div>
                </div>

                {/* Status */}
                {renderBadge(statusCfg.label, statusCfg.color, statusCfg.bg, statusCfg.border)}

                {/* Action: Thu tiền */}
                {totalRemaining > 0 && onDebtPayment && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDebtPayment({
                        type: debt.debt_type,
                        id: debt.debt_type === 'driver' ? debt.driver_id : (debt.customer_ids?.[0]),
                        name: personName,
                        phone: personPhone,
                        remaining: totalRemaining,
                      });
                    }}
                    style={{
                      padding: '6px 12px',
                      background: '#16a34a',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Thu tiền
                  </button>
                )}
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div style={{ borderTop: "1px solid #e2e8f0", background: "#fff" }}>
                  {loadingPersonDebts[key] ? (
                    <div style={{ padding: 20, textAlign: "center", color: "#64748b" }}>Đang tải chi tiết...</div>
                  ) : (
                    <div style={{ padding: 12, overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                          <tr style={{ background: "#f8fafc" }}>
                            {["Khách hàng", "SĐT", "Đơn", "Chuyến", "Hàng hóa", "Tổng nợ", "Đã trả", "Còn nợ", "Trạng thái", "Ghi chú", "Thao tác"].map((h) => (
                              <th key={h} style={{ ...thStyle, fontSize: 11, padding: "8px 10px" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(personDebts[key] || []).map((d) => {
                            const dTotal = Number(d.total_amount || 0);
                            const dPaid = Number(d.paid_amount || 0);
                            const dRemaining = Number(d.remaining || 0);
                            const dStatus = d.computed_status || "unpaid";
                            const dStatusCfg = STATUS_CFG[dStatus] || STATUS_CFG.unpaid;

                            return (
                              <tr key={d.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                <td style={{ ...tdStyle, fontWeight: 600, color: "#0f172a" }}>
                                  {d.customer_name || d.driver_name || "—"}
                                </td>
                                <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 11 }}>
                                  {d.customer_phone || d.driver_phone || "—"}
                                </td>
                                <td style={{ ...tdStyle, fontFamily: "monospace" }}>#{d.order_id}</td>
                                <td style={{ ...tdStyle, fontFamily: "monospace" }}>#{d.shipment_id}</td>
                                <td style={{ ...tdStyle, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={d.order_cargo_name}>
                                  {d.order_cargo_name || "—"}
                                </td>
                                <td style={{ ...tdStyle, fontWeight: 600, textAlign: "right" }}>{fmt(dTotal)}đ</td>
                                <td style={{ ...tdStyle, color: "#16a34a", textAlign: "right" }}>{fmt(dPaid)}đ</td>
                                <td style={{ ...tdStyle, fontWeight: dRemaining > 0 ? 700 : 500, color: dRemaining > 0 ? "#dc2626" : "#16a34a", textAlign: "right" }}>{fmt(Math.max(dRemaining, 0))}đ</td>
                                <td style={tdStyle}>{renderBadge(dStatusCfg.label, dStatusCfg.color, dStatusCfg.bg, dStatusCfg.border)}</td>
                                <td style={{ ...tdStyle, color: "#64748b", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={d.notes}>
                                  {d.notes || "—"}
                                </td>
                                <td style={{ ...tdStyle, textAlign: "center" }}>
                                  {dRemaining > 0 ? (
                                    <button
                                      type="button"
                                      onClick={() => onDebtItemPayment?.(d, {
                                        personKey: key,
                                        personType: debt.debt_type,
                                        customerIds: debt.customer_ids,
                                        driverId: debt.driver_id,
                                      })}
                                      style={itemPayBtnStyle}
                                    >
                                      Thu
                                    </button>
                                  ) : (
                                    <span style={{ color: "#94a3b8", fontSize: 12 }}>—</span>
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
      <PaginationControls pagination={pagination} handlePageChange={handlePageChange} itemLabel="người" />
    </>
  );
}

function PaginationControls({ pagination, handlePageChange, itemLabel }) {
  if (pagination.totalPages <= 1) return null;

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 0 0" }}>
      <span style={{ fontSize: 12, color: "#64748b" }}>
        Trang {pagination.currentPage} / {pagination.totalPages} — {pagination.totalItems} {itemLabel}
      </span>
      <div style={{ display: "flex", gap: 6 }}>
        <button
          onClick={() => handlePageChange(pagination.currentPage - 1)}
          disabled={pagination.currentPage <= 1}
          style={{
            ...pageBtnStyle,
            opacity: pagination.currentPage <= 1 ? 0.5 : 1,
            cursor: pagination.currentPage <= 1 ? "not-allowed" : "pointer",
          }}
        >
          ← Trước
        </button>
        {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
          .filter((p) => p === 1 || p === pagination.totalPages || Math.abs(p - pagination.currentPage) <= 2)
          .map((p, idx, arr) => (
            <React.Fragment key={p}>
              {idx > 0 && arr[idx - 1] !== p - 1 && <span style={{ color: "#cbd5e1", padding: "0 2px" }}>…</span>}
              <button
                onClick={() => handlePageChange(p)}
                style={{
                  ...pageBtnStyle,
                  background: p === pagination.currentPage ? "#1d4ed8" : "#fff",
                  color: p === pagination.currentPage ? "#fff" : "#475569",
                  borderColor: p === pagination.currentPage ? "#1d4ed8" : "#e2e8f0",
                }}
              >
                {p}
              </button>
            </React.Fragment>
          ))}
        <button
          onClick={() => handlePageChange(pagination.currentPage + 1)}
          disabled={pagination.currentPage >= pagination.totalPages}
          style={{
            ...pageBtnStyle,
            opacity: pagination.currentPage >= pagination.totalPages ? 0.5 : 1,
            cursor: pagination.currentPage >= pagination.totalPages ? "not-allowed" : "pointer",
          }}
        >
          Sau →
        </button>
      </div>
    </div>
  );
}

function DebtItemPaymentModal({
  debt,
  amount,
  paymentMethod,
  notes,
  error,
  loading,
  onAmountChange,
  onPaymentMethodChange,
  onNotesChange,
  onClose,
  onSubmit,
}) {
  if (!debt) return null;

  const remaining = Number(debt.remaining || 0);
  const debtorName = debt.debt_type === "driver"
    ? debt.driver_name || "Tài xế"
    : debt.customer_name || "Khách hàng";

  return (
    <div
      style={modalOverlayStyle}
      onClick={onClose}
    >
      <div
        style={modalCardStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={modalHeaderStyle}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>Thu tiền chuyến</div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
              Debt #{debt.id} · Chuyến #{debt.shipment_id || "—"} · {debtorName}
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={loading} style={modalCloseBtnStyle}>×</button>
        </div>

        <div style={{ padding: 16 }}>
          <div style={modalDebtSummaryStyle}>
            <div>
              <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Tổng nợ</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>{fmt(debt.total_amount)}đ</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Đã trả</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#16a34a" }}>{fmt(debt.paid_amount)}đ</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Còn nợ</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#dc2626" }}>{fmt(remaining)}đ</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 180px", gap: 12, marginTop: 16 }}>
            <div>
              <label style={modalLabelStyle}>Số tiền thu</label>
              <input
                type="number"
                min="1"
                max={remaining}
                value={amount}
                onChange={(e) => onAmountChange(e.target.value)}
                placeholder={`Tối đa ${fmt(remaining)}đ`}
                style={modalInputStyle}
              />
            </div>
            <div>
              <label style={modalLabelStyle}>Hình thức</label>
              <select
                value={paymentMethod}
                onChange={(e) => onPaymentMethodChange(e.target.value)}
                style={modalInputStyle}
              >
                <option value="cash">Tiền mặt</option>
                <option value="bank_transfer">Chuyển khoản</option>
                <option value="offset">Bù trừ</option>
              </select>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={modalLabelStyle}>Ghi chú</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="Ghi chú cho lần thu này..."
              style={modalInputStyle}
            />
          </div>

          {error && (
            <div style={modalErrorStyle}>{error}</div>
          )}
        </div>

        <div style={modalFooterStyle}>
          <button type="button" onClick={onClose} disabled={loading} style={modalSecondaryBtnStyle}>
            Hủy
          </button>
          <button type="button" onClick={onSubmit} disabled={loading || !amount} style={modalPrimaryBtnStyle}>
            {loading ? "Đang xử lý..." : "Xác nhận thu"}
          </button>
        </div>
      </div>
    </div>
  );
}

function renderBadge(label, color, bg, border) {
  return (
    <span style={{
      display: "inline-block",
      padding: "3px 10px",
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 700,
      color,
      background: bg,
      border: `1px solid ${border}`,
      whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}

const thStyle = {
  padding: "12px 14px",
  textAlign: "left",
  fontWeight: 700,
  color: "#475569",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  whiteSpace: "nowrap",
};

const tdStyle = {
  padding: "12px 14px",
};

const trStyle = {
  borderBottom: "1px solid #f1f5f9",
  transition: "background 0.15s",
};

const selectStyle = {
  border: "1.5px solid #e2e8f0",
  borderRadius: 8,
  padding: "7px 10px",
  fontSize: 13,
  color: "#0f172a",
  background: "#fff",
  outline: "none",
  minWidth: 120,
};

const inputStyle = {
  border: "1.5px solid #e2e8f0",
  borderRadius: 8,
  padding: "7px 10px",
  fontSize: 13,
  color: "#0f172a",
  background: "#fff",
  outline: "none",
};

const btnStyle = {
  borderRadius: 8,
  padding: "7px 16px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  transition: "background 0.15s",
};

const pageBtnStyle = {
  padding: "6px 12px",
  background: "#fff",
  color: "#475569",
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 700,
};

const viewModeBtnStyle = {
  borderRadius: 6,
  padding: "6px 12px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  transition: "all 0.15s",
};

const itemPayBtnStyle = {
  padding: "5px 10px",
  background: "#16a34a",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  fontSize: 11,
  fontWeight: 800,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const modalOverlayStyle = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  background: "rgba(15, 23, 42, 0.42)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
};

const modalCardStyle = {
  width: "min(560px, 100%)",
  background: "#fff",
  borderRadius: 12,
  boxShadow: "0 24px 80px rgba(15, 23, 42, 0.28)",
  overflow: "hidden",
};

const modalHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "14px 16px",
  borderBottom: "1px solid #e2e8f0",
  background: "#f8fafc",
};

const modalCloseBtnStyle = {
  width: 32,
  height: 32,
  border: "none",
  borderRadius: 8,
  background: "transparent",
  color: "#64748b",
  cursor: "pointer",
  fontSize: 24,
  lineHeight: "28px",
};

const modalDebtSummaryStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 10,
  padding: 12,
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 10,
};

const modalLabelStyle = {
  display: "block",
  marginBottom: 6,
  fontSize: 12,
  fontWeight: 700,
  color: "#475569",
};

const modalInputStyle = {
  width: "100%",
  height: 38,
  boxSizing: "border-box",
  border: "1.5px solid #cbd5e1",
  borderRadius: 8,
  padding: "0 10px",
  fontSize: 14,
  color: "#0f172a",
  outline: "none",
  background: "#fff",
};

const modalErrorStyle = {
  marginTop: 12,
  padding: "9px 10px",
  borderRadius: 8,
  background: "#fef2f2",
  color: "#dc2626",
  fontSize: 13,
  fontWeight: 700,
};

const modalFooterStyle = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  padding: "12px 16px",
  borderTop: "1px solid #e2e8f0",
};

const modalSecondaryBtnStyle = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#475569",
  fontWeight: 700,
  cursor: "pointer",
};

const modalPrimaryBtnStyle = {
  padding: "8px 16px",
  borderRadius: 8,
  border: "none",
  background: "#16a34a",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

DebtTable.propTypes = {
  apiBase: PropTypes.string,
  token: PropTypes.string,
  onDebtPayment: PropTypes.func,
};
