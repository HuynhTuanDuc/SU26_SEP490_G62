import React from "react";
import PropTypes from "prop-types";

const fmt = (v) => Number(v || 0).toLocaleString("vi-VN");

const DEBT_STATUS = {
  paid:    { label: "Đã thu đủ",   color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
  partial: { label: "Thu 1 phần", color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
  unpaid:  { label: "Chưa thu",    color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
};

const ORDER_STATUS = {
  open:         { label: "Mới tạo",        color: "#64748b", bg: "#f8fafc", border: "#cbd5e1" },
  assigned:     { label: "Đã điều phối",   color: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe" },
  in_progress:  { label: "Đang vận chuyển", color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
  completed:    { label: "Hoàn thành",     color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
  cancelled:    { label: "Đã hủy",          color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
};

function OrderCard({ order, onOpenPayment, onOpenDetail }) {
  // Debt status (trạng thái công nợ)
  const debtStatus =
    order.debt_status ||
    (order.payment_type === "client_credit" ? "unpaid" : "paid");
  const debtCfg = DEBT_STATUS[debtStatus] || DEBT_STATUS.paid;

  // Order status (trạng thái đơn hàng)
  const orderStatus = order.status || "open";
  const orderCfg = ORDER_STATUS[orderStatus] || ORDER_STATUS.open;

  // Doanh thu = SUM(order_shipments.actual_price)
  const revenue = Number(order.actual_price || 0);
  // Ước tính = SUM(order_shipments.estimated_price)
  const estimated = Number(order.estimated_price || 0);
  // Thực thu = SUM(confirmed debt_payments) cho đơn này
  const collected = Number(order.debt_paid || 0);
  // Còn nợ = revenue - collected
  const remaining = revenue - collected;

  const hasDiff = estimated > 0 && Math.abs(estimated - revenue) > 0.01;
  const shipmentCount = Number(order.shipment_count) || 0;

  const orderDate = order.created_at
    ? new Date(order.created_at).toLocaleDateString("vi-VN", {
        day: "2-digit", month: "2-digit", year: "numeric",
      })
    : "—";

  return (
    <div
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: 10,
        marginBottom: 8,
        overflow: "hidden",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      {/* Main row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "60px 90px 1fr 1fr 100px 70px 110px 110px 90px 80px 140px",
          gap: 8,
          alignItems: "center",
          padding: "12px 16px",
          background: "#fff",
          userSelect: "none",
          minWidth: 1000,
        }}
      >
        {/* ID */}
        <span style={{ fontWeight: 700, color: "#1e40af", fontSize: 13, whiteSpace: "nowrap" }}>
          #{order.id}
        </span>

        {/* Ngày */}
        <span style={{ fontSize: 11, color: "#64748b", whiteSpace: "nowrap" }}>{orderDate}</span>

        {/* Khách hàng */}
        <div style={{ overflow: "hidden" }}>
          <div style={{ fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }}>
            {order.customer_name || "Khách lẻ"}
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {order.customer_phone || ""}
          </div>
        </div>

        {/* Hàng hóa */}
        <span style={{ fontSize: 11, color: "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={order.cargo_name}>
          {order.cargo_name || "—"}
        </span>

        {/* Trạng thái đơn */}
        <span style={{ textAlign: "center" }}>
          <span style={{
            display: "inline-block",
            padding: "2px 8px",
            borderRadius: 999,
            fontSize: 10,
            fontWeight: 700,
            color: orderCfg.color,
            background: orderCfg.bg,
            border: `1px solid ${orderCfg.border}`,
            whiteSpace: "nowrap",
          }}>
            {orderCfg.label}
          </span>
        </span>

        {/* Chuyến */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
          <span style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 22, height: 22, borderRadius: "50%",
            background: "#e5eeff", color: "#00236f", fontWeight: 700, fontSize: 11,
          }}>
            {shipmentCount}
          </span>
        </div>

        {/* Doanh thu */}
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 1 }}>Doanh thu</div>
          <div
            title={hasDiff ? `Ước tính: ${fmt(estimated)}đ` : ""}
            style={{
              fontWeight: 700, color: "#0f172a", fontSize: 13,
              cursor: hasDiff ? "help" : "default",
            }}
          >
            {fmt(revenue)}đ
          </div>
          {hasDiff && (
            <div style={{ fontSize: 10, color: "#94a3b8", textDecoration: "line-through" }}>
              {fmt(estimated)}đ
            </div>
          )}
        </div>

        {/* Thực thu */}
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 1 }}>Thực thu</div>
          <div style={{ fontWeight: 700, color: "#16a34a", fontSize: 13 }}>
            {fmt(collected)}đ
          </div>
        </div>

        {/* Còn nợ */}
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 1 }}>Còn nợ</div>
          <div style={{
            fontWeight: remaining > 0 ? 700 : 500,
            color: remaining > 0 ? "#dc2626" : "#16a34a",
            fontSize: 13,
          }}>
            {fmt(Math.max(remaining, 0))}đ
          </div>
        </div>

        {/* Trạng thái công nợ */}
        <span style={{ textAlign: "center" }}>
          <span style={{
            display: "inline-block",
            padding: "2px 8px",
            borderRadius: 999,
            fontSize: 10,
            fontWeight: 700,
            color: debtCfg.color,
            background: debtCfg.bg,
            border: `1px solid ${debtCfg.border}`,
            whiteSpace: "nowrap",
          }}>
            {debtCfg.label}
          </span>
        </span>

        {/* Hành động */}
        <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
          <button
            onClick={() => onOpenPayment?.(order)}
            style={{
              padding: "5px 10px",
              background: debtStatus === "paid" ? "#f1f5f9" : "#1d4ed8",
              color: debtStatus === "paid" ? "#475569" : "#fff",
              border: "none", borderRadius: 6,
              fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            {debtStatus === "paid" ? "Lịch sử" : "Ghi thu"}
          </button>
          <button
            onClick={() => onOpenDetail?.(order)}
            style={{
              padding: "5px 10px",
              background: "#1d4ed8", color: "#fff",
              border: "none", borderRadius: 6,
              fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            Chi tiết
          </button>
        </div>
      </div>
    </div>
  );
}

OrderCard.propTypes = {
  order: PropTypes.object,
  onOpenPayment: PropTypes.func,
  onOpenDetail: PropTypes.func,
};

export default function RevenueTable({ orders, loading, pagination, apiBase, token, onPageChange, onOpenPayment, onOpenDetail }) {
  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>
        Đang tải dữ liệu...
      </div>
    );
  }

  if (!orders || orders.length === 0) {
    return (
      <div style={{ padding: 60, textAlign: "center" }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" style={{ marginBottom: 12 }}>
          <circle cx="12" cy="12" r="10"/><path d="M8 12h8"/>
        </svg>
        <p style={{ color: "#64748b", margin: 0 }}>Không có đơn hàng nào.</p>
      </div>
    );
  }

  return (
    <>
      <div style={{ overflowX: "auto" }}>
        {/* Table header bar */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "60px 90px 1fr 1fr 100px 70px 110px 110px 90px 80px 140px",
            gap: 8,
            padding: "10px 16px",
            background: "#f8fafc",
            borderBottom: "2px solid #e2e8f0",
            fontSize: 11,
            fontWeight: 700,
            color: "#64748b",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            minWidth: 1000,
          }}
        >
          <span>ID</span>
          <span>Ngày</span>
          <span>Khách hàng</span>
          <span>Hàng hóa</span>
          <span style={{ textAlign: "center" }}>Trạng thái</span>
          <span style={{ textAlign: "center" }}>Chuyến</span>
          <span style={{ textAlign: "right" }}>Doanh thu</span>
          <span style={{ textAlign: "right" }}>Thực thu</span>
          <span style={{ textAlign: "right" }}>Còn nợ</span>
          <span style={{ textAlign: "center" }}>Công nợ</span>
          <span style={{ textAlign: "center" }}>Hành động</span>
        </div>

        {/* Order cards */}
        {orders.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            onOpenPayment={onOpenPayment}
            onOpenDetail={onOpenDetail}
          />
        ))}
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px 0 0",
            borderTop: "1px solid #e2e8f0",
            marginTop: 8,
          }}
        >
          <span style={{ fontSize: 12, color: "#64748b" }}>
            Trang {pagination.currentPage} / {pagination.totalPages} — {pagination.totalItems} đơn
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => onPageChange?.(pagination.currentPage - 1)}
              disabled={pagination.currentPage <= 1}
              style={{
                padding: "6px 14px",
                background: pagination.currentPage <= 1 ? "#f1f5f9" : "#fff",
                color: pagination.currentPage <= 1 ? "#cbd5e1" : "#475569",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
                cursor: pagination.currentPage <= 1 ? "not-allowed" : "pointer",
              }}
            >
              ← Trước
            </button>
            {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
              .filter(
                (p) =>
                  p === 1 ||
                  p === pagination.totalPages ||
                  Math.abs(p - pagination.currentPage) <= 1,
              )
              .map((p, idx, arr) => (
                <React.Fragment key={p}>
                  {idx > 0 && arr[idx - 1] !== p - 1 && (
                    <span style={{ color: "#cbd5e1", padding: "0 4px", fontSize: 13 }}>…</span>
                  )}
                  <button
                    onClick={() => onPageChange?.(p)}
                    style={{
                      padding: "6px 12px",
                      background: p === pagination.currentPage ? "#1d4ed8" : "#fff",
                      color: p === pagination.currentPage ? "#fff" : "#475569",
                      border: "1px solid",
                      borderColor: p === pagination.currentPage ? "#1d4ed8" : "#e2e8f0",
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {p}
                  </button>
                </React.Fragment>
              ))}
            <button
              onClick={() => onPageChange?.(pagination.currentPage + 1)}
              disabled={pagination.currentPage >= pagination.totalPages}
              style={{
                padding: "6px 14px",
                background: pagination.currentPage >= pagination.totalPages ? "#f1f5f9" : "#fff",
                color: pagination.currentPage >= pagination.totalPages ? "#cbd5e1" : "#475569",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
                cursor: pagination.currentPage >= pagination.totalPages ? "not-allowed" : "pointer",
              }}
            >
              Sau →
            </button>
          </div>
        </div>
      )}
    </>
  );
}

RevenueTable.propTypes = {
  orders: PropTypes.array,
  loading: PropTypes.bool,
  pagination: PropTypes.object,
  apiBase: PropTypes.string,
  token: PropTypes.string,
  onPageChange: PropTypes.func,
  onOpenPayment: PropTypes.func,
  onOpenDetail: PropTypes.func,
};
