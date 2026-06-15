import React from "react";
import PropTypes from "prop-types";

const fmt = (v) => Number(v || 0).toLocaleString("vi-VN");

const DEBT_STATUS = {
  paid: { label: "Đã thu đủ", color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
  partial: { label: "Thu một phần", color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
  unpaid: { label: "Chưa thu", color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
};

function OrderCard({ order, onOpenPayment, onOpenDetail }) {
  const debtStatus =
    order.debt_status ||
    (order.payment_type === "client_credit" ? "unpaid" : "paid");
  const statusCfg = DEBT_STATUS[debtStatus] || DEBT_STATUS.paid;

  // Giá trị thực tế (SUM order_shipments.actual_price) — là giá trị CHÍNH
  const actual = Number(order.actual_price || 0);
  // Giá trị ước tính (SUM order_shipments.estimated_price) — chỉ để tham khảo
  const estimated = Number(order.estimated_price || 0);
  // Tiền đã thu (SUM confirmed debt_payments cho debt thuộc đơn này)
  const paid = Number(order.debt_paid || 0);
  // Tiền còn nợ = actual - paid (công thức tổng quát, kể cả cash/bank)
  const remaining = Number(order.debt_remaining ?? Math.max(actual - paid, 0));
  const shipmentCount = Number(order.shipment_count) || 0;
  // Có chênh lệch giữa ước tính và thực tế không
  const hasDiff = estimated > 0 && Math.abs(estimated - actual) > 0.01;

  const orderDate = order.created_at
    ? new Date(order.created_at).toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
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
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "60px 90px 1fr 120px 140px 70px 110px 110px 100px 120px",
          gap: 12,
          alignItems: "center",
          padding: "12px 16px",
          background: "#fff",
          userSelect: "none",
        }}
      >
        <span
          style={{
            fontWeight: 700,
            color: "#1e40af",
            fontSize: 13,
            whiteSpace: "nowrap",
          }}
        >
          #{order.id}
        </span>

        <span style={{ fontSize: 11, color: "#64748b", whiteSpace: "nowrap" }}>{orderDate}</span>

        <div style={{ overflow: "hidden" }}>
          <div style={{ fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {order.customer_name || "Khách lẻ"}
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>{order.customer_company || ""}</div>
        </div>

        <span style={{ fontFamily: "monospace", fontSize: 12, color: "#475569" }}>{order.customer_phone || "—"}</span>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 26,
              height: 26,
              borderRadius: "50%",
              background: "#e5eeff",
              color: "#00236f",
              fontWeight: 700,
              fontSize: 12,
            }}
          >
            {shipmentCount}
          </span>
          <span style={{ fontSize: 12, color: "#64748b" }}>chuyến</span>
        </div>

        <div
          title={hasDiff ? `Ước tính: ${fmt(estimated)}đ` : ""}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            cursor: hasDiff ? "help" : "default",
          }}
        >
          <span style={{ fontWeight: 700, color: "#0f172a", fontSize: 13 }}>
            {fmt(actual)}đ
          </span>
          {hasDiff && (
            <span style={{ fontSize: 10, color: "#94a3b8", textDecoration: "line-through" }}>
              {fmt(estimated)}đ
            </span>
          )}
        </div>
        <span style={{ fontWeight: 700, color: "#16a34a", textAlign: "right", fontSize: 13 }}>
          {fmt(paid)}đ
        </span>
        <span
          style={{
            fontWeight: remaining > 0 ? 700 : 500,
            color: remaining > 0 ? "#dc2626" : "#16a34a",
            textAlign: "right",
            fontSize: 13,
          }}
        >
          {fmt(remaining)}đ
        </span>

        <span style={{ textAlign: "center" }}>
          <span
            style={{
              display: "inline-block",
              padding: "3px 10px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
              color: statusCfg.color,
              background: statusCfg.bg,
              border: `1px solid ${statusCfg.border}`,
              whiteSpace: "nowrap",
            }}
          >
            {statusCfg.label}
          </span>
        </span>

        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
          {(debtStatus === "unpaid" || debtStatus === "partial") ? (
            <button
              onClick={() => onOpenPayment?.(order)}
              style={{
                padding: "5px 10px",
                background: "#1d4ed8",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Ghi thu
            </button>
          ) : (
            <button
              onClick={() => onOpenPayment?.(order)}
              style={{
                padding: "5px 10px",
                background: "#f1f5f9",
                color: "#475569",
                border: "none",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Lịch sử
            </button>
          )}
          <button
            onClick={() => onOpenDetail?.(order)}
            style={{
              padding: "5px 10px",
              background: "#1d4ed8",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Xem chi tiết
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
            gridTemplateColumns: "60px 90px 1fr 120px 140px 70px 110px 110px 100px 120px",
            gap: 12,
            padding: "10px 16px",
            background: "#f8fafc",
            borderBottom: "2px solid #e2e8f0",
            fontSize: 11,
            fontWeight: 700,
            color: "#64748b",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          <span>ID</span>
          <span>Ngày</span>
          <span>Khách hàng</span>
          <span>SĐT</span>
          <span>Chuyến</span>
          <span style={{ textAlign: "right" }} title="Giá trị thực tế (SUM order_shipments.actual_price)">Tổng giá trị</span>
          <span style={{ textAlign: "right" }}>Đã thu</span>
          <span style={{ textAlign: "right" }}>Còn nợ</span>
          <span style={{ textAlign: "center" }}>Trạng thái</span>
          <span style={{ textAlign: "right" }}>Hành động</span>
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
