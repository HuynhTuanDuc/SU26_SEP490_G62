import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import "../../styles/PaymentModal.css";

const fmt = (v) => Number(v || 0).toLocaleString("vi-VN");

const DEBT_LABELS = {
  paid: "Đã thu đủ",
  partial: "Thu một phần",
  unpaid: "Chưa thu",
};

const PAYTYPE_LABELS = {
  cash: "Tiền mặt",
  bank_transfer: "CK ngân hàng",
  client_credit: "Khách nợ",
};

const DRIVER_STATUS_LABELS = {
  settled: "Đã nộp",
  holding: "Tài xế giữ",
  pending: "Chưa thanh toán",
};

function labelStatus(status) {
  return DEBT_LABELS[status] || DEBT_LABELS[status === "client_credit" ? "unpaid" : "paid"] || "Chưa rõ";
}

function DebtBadge({ status }) {
  const isDebt = status !== "paid";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 12px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        background: isDebt ? "#fff7ed" : "#f0fdf4",
        color: isDebt ? "#c2410c" : "#16a34a",
        border: `1px solid ${isDebt ? "#fed7aa" : "#bbf7d0"}`,
      }}
    >
      {labelStatus(status)}
    </span>
  );
}

function DriverBadge({ status }) {
  let cfg = { label: "—", color: "#6b7280", bg: "#f3f4f6", border: "#d1d5db" };
  if (status === "settled") cfg = { label: "Đã nộp", color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" };
  else if (status === "holding") cfg = { label: "Tài xế giữ", color: "#d97706", bg: "#fffbeb", border: "#fde68a" };
  else if (status === "pending") cfg = { label: "Chưa thanh toán", color: "#dc2626", bg: "#fef2f2", border: "#fecaca" };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        color: cfg.color,
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
      }}
    >
      {cfg.label}
    </span>
  );
}

function buildTuyenLabels(pickups, deliveryAddress) {
  if (!pickups || pickups.length === 0) {
    return [{ label: "Tuyến Cuối", address: deliveryAddress || "—" }];
  }
  const labels = pickups.map((p, i) => ({ label: `Tuyến ${i + 1}`, address: p.address || "—" }));
  labels.push({ label: "Tuyến Cuối", address: deliveryAddress || "—" });
  return labels;
}

function getBadgeBg(isRed, isGreen) {
  if (isRed) return "#fff7ed";
  if (isGreen) return "#f0fdf4";
  return "#f8fafc";
}

function getBadgeColor(isRed, isGreen) {
  if (isRed) return "#c2410c";
  if (isGreen) return "#16a34a";
  return "#0f172a";
}

export default function OrderDetailModal({ isOpen, onClose, order, apiBase, token, onOpenPayment, onRefresh }) {
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    customer_name: "",
    customer_phone: "",
    customer_company: "",
    cargo_name: "",
    notes: "",
  });
  const [confirmModal, setConfirmModal] = useState(null);
  const [confirmAmount, setConfirmAmount] = useState("");
  const [confirmMethod, setConfirmMethod] = useState("cash");
  const [confirmLoading, setConfirmLoading] = useState(false);

  const debtStatus = order?.debt_status || (order?.payment_type === "client_credit" ? "unpaid" : "paid");
  const totalValue = Number(order?.debt_total || order?.estimated_price || 0);
  const totalPaid = Number(order?.debt_paid || 0);
  const totalDue = Number(order?.debt_remaining || Math.max(totalValue - totalPaid, 0));

  useEffect(() => {
    if (!isOpen || !order) return;
    setLoading(true);
    setIsEditing(false);
    setFormData({
      customer_name: order.customer_name || "",
      customer_phone: order.customer_phone || "",
      customer_company: order.customer_company || "",
      cargo_name: order.cargo_name || "",
      notes: order.notes || "",
    });
    fetch(`${apiBase}/accountant/orders/${order.id}/shipments`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => { setShipments(Array.isArray(data) ? data : []); })
      .catch(() => setShipments([]))
      .finally(() => setLoading(false));
  }, [isOpen, order, apiBase, token]);

  if (!isOpen || !order) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${apiBase}/accountant/orders/${order.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        setIsEditing(false);
        onRefresh?.();
      }
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  const handleOpenConfirmDriver = (shipment) => {
    setConfirmModal(shipment);
    setConfirmAmount(String(shipment.cargo_fee || shipment.driver_total || 0));
    setConfirmMethod("cash");
  };

  const handleConfirmDriver = async () => {
    if (!confirmModal) return;
    setConfirmLoading(true);
    try {
      const res = await fetch(
        `${apiBase}/accountant/orders/${order.id}/shipments/${confirmModal.id}/driver-payment`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            driver_payment_state: "settled",
            amount: Number(confirmAmount),
            payment_method: confirmMethod,
          }),
        }
      );
      if (res.ok) {
        setConfirmModal(null);
        const r = await fetch(`${apiBase}/accountant/orders/${order.id}/shipments`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await r.json();
        setShipments(Array.isArray(data) ? data : []);
        onRefresh?.();
      }
    } catch {
      // silent
    } finally {
      setConfirmLoading(false);
    }
  };

  const stats = [
    { label: "Khách hàng", value: order.customer_name || "Khách lẻ" },
    { label: "SĐT", value: order.customer_phone || "—" },
    { label: "Trạng thái", value: <DebtBadge status={debtStatus} /> },
    { label: "Tổng giá trị", value: `${fmt(totalValue)}đ` },
    { label: "Đã thu", value: `${fmt(totalPaid)}đ`, green: true },
    { label: "Còn nợ", value: `${fmt(totalDue)}đ`, red: totalDue > 0 },
  ];

  return (
    <>
      {confirmModal && (
        <div className="accountant-modal-overlay" onClick={() => setConfirmModal(null)}>
          <div className="accountant-modal-card" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="accountant-modal-header">
              <div>
                <h2>Xác nhận thu tiền tài xế</h2>
                <p>
                  Chuyến #{confirmModal.shipment_index || confirmModal.id} —{" "}
                  {confirmModal.driver_name || "—"} · {confirmModal.vehicle_plate || "—"}
                </p>
              </div>
              <button className="close-btn" onClick={() => setConfirmModal(null)}>×</button>
            </div>
            <div className="accountant-modal-form">
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>Số tiền đã thu (đ)</span>
                  <input
                    type="number"
                    value={confirmAmount}
                    onChange={(e) => setConfirmAmount(e.target.value)}
                    style={{
                      border: "1.5px solid #e2e8f0",
                      borderRadius: 10,
                      padding: "10px 14px",
                      fontSize: 16,
                      fontWeight: 700,
                      color: "#0f172a",
                      outline: "none",
                      width: "100%",
                      boxSizing: "border-box",
                    }}
                  />
                </label>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>Hình thức</span>
                  <select
                    value={confirmMethod}
                    onChange={(e) => setConfirmMethod(e.target.value)}
                    style={{
                      border: "1.5px solid #e2e8f0",
                      borderRadius: 10,
                      padding: "10px 14px",
                      fontSize: 14,
                      color: "#0f172a",
                      outline: "none",
                      width: "100%",
                      boxSizing: "border-box",
                    }}
                  >
                    <option value="cash">Tiền mặt</option>
                    <option value="bank_transfer">Chuyển khoản</option>
                  </select>
                </label>
              </div>
              <div className="accountant-modal-actions">
                <button className="secondary-btn" onClick={() => setConfirmModal(null)}>Hủy</button>
                <button className="primary-btn" onClick={handleConfirmDriver} disabled={confirmLoading}>
                  {confirmLoading ? "Đang xác nhận..." : "Xác nhận đã thu tiền"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div
        className="accountant-modal-overlay"
        role="button"
        tabIndex={0}
        onClick={onClose}
        onKeyDown={(e) => { if (e.key === "Escape" || e.key === "Enter" || e.key === " ") onClose(); }}
      >
        <div
          className="accountant-modal-card"
          role="dialog"
          aria-modal="true"
          style={{ maxWidth: 1040 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="accountant-modal-header">
            <div>
              <h2>Chi tiết đơn hàng #{order.id}</h2>
              <p>Ngày tạo: {order.created_at ? new Date(order.created_at).toLocaleDateString("vi-VN") : "—"}</p>
            </div>
            <button className="close-btn" onClick={onClose} aria-label="Đóng">×</button>
          </div>

          <div style={{ display: "flex", gap: 8, padding: "0 28px 16px", borderBottom: "1px solid #f1f5f9", flexWrap: "wrap" }}>
            {isEditing ? (
              <>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{ padding: "7px 16px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1 }}
                >
                  {saving ? "Đang lưu..." : "Lưu thay đổi"}
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  style={{ padding: "7px 16px", background: "#f1f5f9", color: "#475569", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                >
                  Hủy
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setIsEditing(true)}
                  style={{ padding: "7px 16px", background: "#1d4ed8", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                >
                  Chỉnh sửa
                </button>
                {(debtStatus === "unpaid" || debtStatus === "partial") && (
                  <button
                    onClick={() => { onClose(); onOpenPayment?.(order); }}
                    style={{ padding: "7px 16px", background: "#1d4ed8", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                  >
                    Ghi thu công nợ
                  </button>
                )}
                <button
                  onClick={() => { onClose(); onOpenPayment?.(order); }}
                  style={{ padding: "7px 16px", background: "#f1f5f9", color: "#475569", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                >
                  Lịch sử thu
                </button>
              </>
            )}
          </div>

          <div className="detail-modal-body">
            <div className="detail-stats-row">
              {stats.map((item) => {
                const bg = getBadgeBg(item.red, item.green);
                const color = getBadgeColor(item.red, item.green);
                return (
                  <div key={item.label} style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: "12px 14px", background: bg }}>
                    <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color }}>
                      {item.value}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="detail-section">
              <div className="detail-section-header">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                Thông tin chung
              </div>
              <div className="detail-section-body">
                {isEditing ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>Tên khách hàng</label>
                        <input
                          type="text"
                          value={formData.customer_name}
                          onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                          style={{
                            width: "100%",
                            padding: "8px 12px",
                            border: "1.5px solid #e2e8f0",
                            borderRadius: 8,
                            fontSize: 14,
                            color: "#0f172a",
                            outline: "none",
                            boxSizing: "border-box",
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>Số điện thoại</label>
                        <input
                          type="text"
                          value={formData.customer_phone}
                          onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                          style={{
                            width: "100%",
                            padding: "8px 12px",
                            border: "1.5px solid #e2e8f0",
                            borderRadius: 8,
                            fontSize: 14,
                            color: "#0f172a",
                            outline: "none",
                            boxSizing: "border-box",
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>Công ty</label>
                      <input
                        type="text"
                        value={formData.customer_company}
                        onChange={(e) => setFormData({ ...formData, customer_company: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          border: "1.5px solid #e2e8f0",
                          borderRadius: 8,
                          fontSize: 14,
                          color: "#0f172a",
                          outline: "none",
                          boxSizing: "border-box",
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>Hàng hóa</label>
                      <input
                        type="text"
                        value={formData.cargo_name}
                        onChange={(e) => setFormData({ ...formData, cargo_name: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          border: "1.5px solid #e2e8f0",
                          borderRadius: 8,
                          fontSize: 14,
                          color: "#0f172a",
                          outline: "none",
                          boxSizing: "border-box",
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>Ghi chú</label>
                      <textarea
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        rows={3}
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          border: "1.5px solid #e2e8f0",
                          borderRadius: 8,
                          fontSize: 14,
                          color: "#0f172a",
                          outline: "none",
                          boxSizing: "border-box",
                          resize: "vertical",
                          fontFamily: "inherit",
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="detail-info-grid">
                    <span className="info-label">Khách hàng</span>
                    <span className="info-value">{order.customer_name || "Khách lẻ"}</span>
                    <span className="info-label">Công ty</span>
                    <span className="info-value">{order.customer_company || "—"}</span>
                    <span className="info-label">SĐT</span>
                    <span className="info-value">{order.customer_phone || "—"}</span>
                    <span className="info-label">Hàng hóa</span>
                    <span className="info-value">{order.cargo_name || "Hàng hóa tổng hợp"}</span>
                    <span className="info-label">Ghi chú</span>
                    <span className="info-value">{order.notes || "Không có"}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="detail-section">
              <div className="detail-section-header">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/>
                  <rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>
                </svg>
                Danh sách chuyến xe
                {loading && <span style={{ marginLeft: 8, color: "#94a3b8", fontWeight: 400 }}>— đang tải...</span>}
              </div>
              <div className="detail-section-body">
                <div className="shipments-list">
                  {loading && (
                    <div style={{ textAlign: "center", color: "#94a3b8", padding: 24 }}>Đang tải chuyến xe...</div>
                  )}
                  {!loading && shipments.length === 0 && (
                    <div style={{ textAlign: "center", color: "#94a3b8", padding: 24 }}>Chưa có chuyến nào.</div>
                  )}
                  {!loading && shipments.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      {shipments.map((s) => {
                        const pickups = Array.isArray(s.pickup_addresses) ? s.pickup_addresses.filter(Boolean) : [];
                        const cargoFee = Number(s.cargo_fee || 0);
                        const actualPrice = Number(s.actual_price || 0);
                        const driverDebtStatus = s.driver_payment_state || null;
                        const driverState = driverDebtStatus === 'paid' ? 'settled'
                          : driverDebtStatus === 'unpaid' ? 'holding'
                          : driverDebtStatus === 'partial' ? 'pending'
                          : 'pending';
                        const driverTotal = s.driver_total;
                        const driverPaid = s.driver_paid || 0;
                        const driverRemaining = driverTotal != null ? Math.max(driverTotal - driverPaid, 0) : null;
                        const tuyến = buildTuyenLabels(pickups, s.delivery_address);
                        const isLast = tuyến.length - 1;
                        const expenses = s.expenses || {};
                        const totalExpenses = Number(s.total_expenses || 0);
                        const hasExpenseBreakdown = Object.values(expenses).some((v) => v > 0);

                        return (
                          <div key={s.id} className="shipment-card">
                            <div className="shipment-card-header">
                              <div className="shipment-card-index">
                                <span className="leg-badge">{s.shipment_index || 1}</span>
                                {s.cargo_name || order.cargo_name || "Hàng hóa"}
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <DriverBadge status={driverState} />
                                <div className="shipment-card-fee">
                                  <div className="fee-main">{fmt(cargoFee)}đ</div>
                                  <div className="fee-breakdown">{PAYTYPE_LABELS[s.payment_type] || "—"}</div>
                                </div>
                              </div>
                            </div>
                            <div className="shipment-card-body">
                              <div className="shipment-grid">
                                <div className="shipment-field" style={{ gridColumn: "1 / -1" }}>
                                  <div className="field-label">Hành trình tuyến</div>
                                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                    {tuyến.map((t, i) => {
                                      const isFinal = i === isLast;
                                      const badgeBg = isFinal ? "#f0fdf4" : "#eff6ff";
                                      const badgeColor = isFinal ? "#16a34a" : "#2563eb";
                                      const badgeBorder = isFinal ? "#bbf7d0" : "#bfdbfe";
                                      return (
                                        <div key={`${s.id}-${t.label}-${i}`} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13 }}>
                                          <span style={{
                                            display: "inline-flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            minWidth: 80,
                                            padding: "2px 8px",
                                            borderRadius: 6,
                                            fontSize: 11,
                                            fontWeight: 700,
                                            background: badgeBg,
                                            color: badgeColor,
                                            border: `1px solid ${badgeBorder}`,
                                            flexShrink: 0,
                                          }}>
                                            {t.label}
                                          </span>
                                          <span style={{ color: "#334155", wordBreak: "break-word" }}>{t.address}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                                <div className="shipment-field">
                                  <div className="field-label">Tài xế</div>
                                  <div className="field-value">{s.driver_name || "—"}</div>
                                </div>
                                <div className="shipment-field">
                                  <div className="field-label">Biển số</div>
                                  <div className="field-value" style={{ fontFamily: "monospace" }}>{s.vehicle_plate || "—"}</div>
                                </div>
                                <div className="shipment-field">
                                  <div className="field-label">Khối lượng</div>
                                  <div className="field-value">{fmt(s.cargo_weight || 0)} kg</div>
                                </div>
                              </div>

                              {/* Financial section */}
                              <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid #f1f5f9" }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                                  Thông tin tài chính
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                                  {/* Thực thu */}
                                  <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "10px 12px" }}>
                                    <div style={{ fontSize: 11, color: "#2563eb", fontWeight: 700, marginBottom: 4 }}>Thực thu</div>
                                    <div style={{ fontSize: 15, fontWeight: 700, color: "#1e40af" }}>{fmt(actualPrice)}đ</div>
                                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Cước xe: {fmt(cargoFee)}đ</div>
                                  </div>

                                  {/* Chi phí chuyến */}
                                  <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10, padding: "10px 12px" }}>
                                    <div style={{ fontSize: 11, color: "#c2410c", fontWeight: 700, marginBottom: 4 }}>Chi phí chuyến</div>
                                    <div style={{ fontSize: 15, fontWeight: 700, color: "#9a3412" }}>{fmt(totalExpenses)}đ</div>
                                    {hasExpenseBreakdown && (
                                      <div style={{ fontSize: 11, color: "#64748b", marginTop: 4, display: "flex", flexDirection: "column", gap: 2 }}>
                                        {expenses.fuel > 0 && <span>Xăng dầu: {fmt(expenses.fuel)}đ</span>}
                                        {expenses.toll > 0 && <span>BOT / Phà / Vé bến / Hầm: {fmt(expenses.toll)}đ</span>}
                                        {expenses.parking > 0 && <span>Đỗ xe / Bến bãi: {fmt(expenses.parking)}đ</span>}
                                        {expenses.repair > 0 && <span>Sửa chữa: {fmt(expenses.repair)}đ</span>}
                                        {expenses.maintenance > 0 && <span>Bảo dưỡng: {fmt(expenses.maintenance)}đ</span>}
                                        {expenses.other > 0 && <span>Khác: {fmt(expenses.other)}đ</span>}
                                      </div>
                                    )}
                                  </div>

                                  {/* Tài xế thanh toán */}
                                  <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "10px 12px", gridColumn: "1 / -1" }}>
                                    <div style={{ fontSize: 11, color: "#16a34a", fontWeight: 700, marginBottom: 4 }}>Thanh toán tài xế</div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                                      <div>
                                        <div style={{ fontSize: 11, color: "#64748b" }}>Tổng</div>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: "#15803d" }}>{driverTotal != null ? `${fmt(driverTotal)}đ` : "—"}</div>
                                      </div>
                                      <div>
                                        <div style={{ fontSize: 11, color: "#64748b" }}>Đã thu</div>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: "#15803d" }}>{fmt(driverPaid)}đ</div>
                                      </div>
                                      <div>
                                        <div style={{ fontSize: 11, color: "#64748b" }}>Còn lại</div>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: driverRemaining > 0 ? "#dc2626" : "#15803d" }}>
                                          {driverRemaining != null ? `${fmt(driverRemaining)}đ` : "—"}
                                        </div>
                                      </div>
                                      <div style={{ marginLeft: "auto" }}>
                                        <DriverBadge status={driverState} />
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid #f1f5f9", display: "flex", justifyContent: "flex-end" }}>
                                {driverState === "pending" || driverState === "holding" ? (
                                  <button
                                    onClick={() => handleOpenConfirmDriver(s)}
                                    style={{
                                      padding: "7px 16px",
                                      background: driverState === "holding" ? "#d97706" : "#3b82f6",
                                      color: "#fff",
                                      border: "none",
                                      borderRadius: 8,
                                      fontSize: 12,
                                      fontWeight: 700,
                                      cursor: "pointer",
                                    }}
                                  >
                                    {driverState === "holding" ? "Xác nhận thu tiền tài xế" : "Đánh dấu đã thu tiền"}
                                  </button>
                                ) : (
                                  <span style={{ fontSize: 12, color: "#16a34a", fontWeight: 700 }}>
                                    ✓ Đã xác nhận thu tiền tài xế
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

DebtBadge.propTypes = { status: PropTypes.string };
DriverBadge.propTypes = { status: PropTypes.string };

OrderDetailModal.propTypes = {
  isOpen: PropTypes.bool,
  onClose: PropTypes.func,
  order: PropTypes.object,
  apiBase: PropTypes.string,
  token: PropTypes.string,
  onOpenPayment: PropTypes.func,
  onRefresh: PropTypes.func,
};
