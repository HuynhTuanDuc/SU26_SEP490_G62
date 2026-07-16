import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { RiCheckLine, RiCloseLine } from "react-icons/ri";
import { apiRequest } from "../../services/apiClient";

const fmt = (v) => Number(v || 0).toLocaleString("vi-VN");

const PAYTYPE_LABELS = {
  cash: "Tiền mặt",
  bank_transfer: "CK ngân hàng",
  client_credit: "Khách nợ",
};

const DRIVER_STATE_LABELS = {
  settled: { label: "Đã nộp", color: "#16a34a", bg: "#f0fdf4" },
  holding: { label: "TX giữ", color: "#d97706", bg: "#fffbeb" },
  pending: { label: "Chưa xác nhận", color: "#64748b", bg: "#f8fafc" },
};

function ConfirmDriverModal({ shipment, onConfirm, onClose }) {
  const [amount, setAmount] = useState(String(shipment?.cargo_fee || 0));
  const [method, setMethod] = useState("cash");

  if (!shipment) return null;

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "rgba(15, 23, 42, 0.6)",
      backdropFilter: "blur(4px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
    }}
    onClick={onClose}
    >
      <div style={{
        background: "#fff",
        borderRadius: 16,
        padding: 24,
        maxWidth: 400,
        width: "100%",
        boxShadow: "0 25px 80px rgba(15, 23, 42, 0.35)",
      }}
      onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#0f172a" }}>
            Xác nhận thu tiền tài xế
          </h3>
          <button onClick={onClose} style={{
            width: 32,
            height: 32,
            background: "#f1f5f9",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
          }}>
            <RiCloseLine size={18} />
          </button>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 6 }}>
            Số tiền (đ)
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "2px solid #e2e8f0",
              borderRadius: 8,
              fontSize: 16,
              fontWeight: 700,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 6 }}>
            Hình thức
          </label>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "2px solid #e2e8f0",
              borderRadius: 8,
              fontSize: 14,
              outline: "none",
              boxSizing: "border-box",
            }}
          >
            <option value="cash">Tiền mặt</option>
            <option value="bank_transfer">Chuyển khoản</option>
          </select>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{
            flex: 1,
            padding: "10px",
            background: "#f1f5f9",
            border: "none",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 700,
            color: "#475569",
            cursor: "pointer",
          }}>
            Hủy
          </button>
          <button
            onClick={() => onConfirm(Number(amount), method)}
            style={{
              flex: 1,
              padding: "10px",
              background: "#16a34a",
              border: "none",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              color: "#fff",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <RiCheckLine size={15} /> Xác nhận
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OrderDetailModal({
  isOpen,
  onClose,
  order,
  onOpenPayment,
  onRefresh,
}) {
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
  const [confirmDriver, setConfirmDriver] = useState(null);

  const totalRevenue = shipments.reduce((sum, s) => sum + Number(s.cargo_fee || s.actual_price || 0), 0);

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

    apiRequest(`/accountant/orders/${order.id}/shipments`)
      .then((data) => setShipments(Array.isArray(data) ? data : []))
      .catch(() => setShipments([]))
      .finally(() => setLoading(false));
  }, [isOpen, order]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiRequest(`/accountant/orders/${order.id}`, {
        method: "PUT",
        body: formData,
      });
      setIsEditing(false);
      onRefresh?.();
    } catch {

    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDriver = async (amount, method) => {
    if (!confirmDriver) return;
    try {
      await apiRequest(
        `/accountant/orders/${order.id}/shipments/${confirmDriver.id}/driver-payment`,
        {
          method: "POST",
          body: { driver_payment_state: "settled", amount, payment_method: method },
        }
      );
      setConfirmDriver(null);
      const data = await apiRequest(`/accountant/orders/${order.id}/shipments`);
      setShipments(Array.isArray(data) ? data : []);
      onRefresh?.();
    } catch {

    }
  };

  if (!isOpen || !order) return null;

  const orderDate = order.created_at
    ? new Date(order.created_at).toLocaleDateString("vi-VN")
    : "—";

  return (
    <>
      {confirmDriver && (
        <ConfirmDriverModal
          shipment={confirmDriver}
          onConfirm={handleConfirmDriver}
          onClose={() => setConfirmDriver(null)}
        />
      )}

      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15, 23, 42, 0.6)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 999,
          padding: 20,
        }}
        onClick={onClose}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: 12,
            maxWidth: 800,
            width: "100%",
            maxHeight: "calc(100vh - 80px)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            boxShadow: "0 25px 80px rgba(15, 23, 42, 0.35)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {}
          <div style={{
            padding: "16px 20px",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#0f172a" }}>
                Đơn #{order.id}
              </h2>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>
                {orderDate} • {shipments.length} chuyến
              </p>
            </div>
            <button
              onClick={onClose}
              style={{
                width: 32,
                height: 32,
                background: "#f1f5f9",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              <RiCloseLine size={18} />
            </button>
          </div>

          {}
          <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
            {}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              marginBottom: 20,
            }}>
              <div>
                <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, textTransform: "uppercase", marginBottom: 2 }}>
                  Khách hàng
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>
                  {order.customer_name || "Khách lẻ"}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, textTransform: "uppercase", marginBottom: 2 }}>
                  SĐT
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", fontFamily: "monospace" }}>
                  {order.customer_phone || "—"}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, textTransform: "uppercase", marginBottom: 2 }}>
                  Công ty
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>
                  {order.customer_company || "—"}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, textTransform: "uppercase", marginBottom: 2 }}>
                  Hàng hóa
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>
                  {order.cargo_name || "—"}
                </div>
              </div>
            </div>

            {}
            <div>
              <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
                DANH SÁCH CHUYẾN ({shipments.length})
              </h3>

              {loading ? (
                <div style={{ textAlign: "center", padding: 30, color: "#64748b" }}>
                  Đang tải...
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {shipments.map((s) => {
                    const cargoFee = Number(s.cargo_fee || s.actual_price || 0);
                    const driverState = s.driver_payment_state || "pending";
                    const driverStateCfg = DRIVER_STATE_LABELS[driverState] || DRIVER_STATE_LABELS.pending;
                    const pickupAddrs = Array.isArray(s.pickup_addresses)
                      ? s.pickup_addresses.map(a => typeof a === 'string' ? a : a?.address)
                      : [];
                    const deliveryAddrs = Array.isArray(s.delivery_addresses)
                      ? s.delivery_addresses.map(a => typeof a === 'string' ? a : a?.address)
                      : (typeof s.delivery_address === 'string' ? [s.delivery_address] : (s.delivery_address?.address ? [s.delivery_address.address] : []));
                    const deliveryAddr = deliveryAddrs.join(" → ");

                    return (
                      <div key={s.id} style={{
                        border: "1px solid #e2e8f0",
                        borderRadius: 10,
                        overflow: "hidden",
                        background: "#fff",
                      }}>
                        {}
                        <div style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "12px 14px",
                          background: "#f8fafc",
                          borderBottom: "1px solid #e2e8f0",
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{
                              width: 24,
                              height: 24,
                              background: "#1e40af",
                              color: "#fff",
                              borderRadius: "50%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 12,
                              fontWeight: 700,
                            }}>
                              {s.shipment_index || 1}
                            </span>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                                {s.driver_name || "—"}
                              </div>
                              <div style={{ fontSize: 11, color: "#64748b" }}>
                                {s.vehicle_plate || "—"}
                              </div>
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <span style={{
                              padding: "3px 8px",
                              background: driverStateCfg.bg,
                              color: driverStateCfg.color,
                              borderRadius: 999,
                              fontSize: 11,
                              fontWeight: 700,
                            }}>
                              {driverStateCfg.label}
                            </span>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>
                                {fmt(cargoFee)}đ
                              </div>
                              <div style={{ fontSize: 10, color: "#64748b" }}>
                                {PAYTYPE_LABELS[s.payment_type] || "—"}
                              </div>
                            </div>
                          </div>
                        </div>

                        {}
                        <div style={{ padding: 12 }}>
                          {}
                          <div style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>
                              Hành trình
                            </div>
                            <div style={{ fontSize: 12, color: "#475569" }}>
                              {pickupAddrs.length > 0
                                ? pickupAddrs.join(" → ")
                                : "—"
                              }
                              {pickupAddrs.length > 0 && deliveryAddr ? " → " : ""}
                              {deliveryAddr || ""}
                            </div>
                          </div>

                          {}
                          {(driverState === "holding" || driverState === "pending") && (
                            <button
                              onClick={() => setConfirmDriver(s)}
                              style={{
                                padding: "6px 12px",
                                background: driverState === "holding" ? "#d97706" : "#3b82f6",
                                color: "#fff",
                                border: "none",
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              Xác nhận tài xế đã nộp
                            </button>
                          )}

                          {driverState === "settled" && (
                            <span style={{
                              fontSize: 12,
                              fontWeight: 700,
                              color: "#16a34a",
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                            }}>
                              <RiCheckLine size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />
                              Đã xác nhận thu tiền
                            </span>
                          )}
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
    </>
  );
}

OrderDetailModal.propTypes = {
  isOpen: PropTypes.bool,
  onClose: PropTypes.func,
  order: PropTypes.object,

  onOpenPayment: PropTypes.func,
  onRefresh: PropTypes.func,
};
