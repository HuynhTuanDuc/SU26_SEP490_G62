import React from "react";
import PropTypes from "prop-types";

const fmt = (v) => Number(v || 0).toLocaleString("vi-VN");

const COLLECTION_STATUS = {
  paid:    { label: "Đã thu đủ",  color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0", icon: "✓" },
  partial: { label: "Thu 1 phần", color: "#d97706", bg: "#fffbeb", border: "#fde68a", icon: "◐" },
  unpaid:  { label: "Chưa thu",   color: "#dc2626", bg: "#fef2f2", border: "#fecaca", icon: "○" },
};

// Format date
function formatDate(dateStr) {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  return date.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// Determine collection status from order data
function getCollectionStatus(order) {
  // If there is explicit debt_status from API, use it
  if (order.debt_status && COLLECTION_STATUS[order.debt_status]) {
    return order.debt_status;
  }
  // Fallback: if driver or customer debt remaining > 0 => not fully collected
  const driverDebt = Number(order.driver_debt_remaining || 0);
  const customerDebt = Number(order.debt_remaining || 0);
  if (driverDebt <= 0 && customerDebt <= 0) return "paid";
  const totalDebt = driverDebt + customerDebt;
  const revenue = Number(order.actual_price || 0);
  if (revenue > 0 && totalDebt < revenue) return "partial";
  return "unpaid";
}

// Grid column template — 11 columns
const GRID_COLS = "68px 78px 1fr 130px 88px 46px 100px 100px 100px 100px 64px";

// Money cell with colored amount
function MoneyCell({ amount, color, emptyColor = "#cbd5e1" }) {
  const hasValue = Number(amount || 0) > 0;
  return (
    <div style={{
      fontSize: 12,
      fontWeight: hasValue ? 700 : 500,
      color: hasValue ? color : emptyColor,
      textAlign: "right",
      fontVariantNumeric: "tabular-nums",
      letterSpacing: "-0.01em",
    }}>
      {hasValue ? `${fmt(amount)}đ` : "—"}
    </div>
  );
}

function OrderRow({ order, onOpenDetail }) {
  const revenue = Number(order.actual_price || 0);
  const shipmentCount = Number(order.shipment_count) || 0;
  const companyReceived = Number(order.company_received || 0);
  const driverDebt = Number(order.driver_debt_remaining || 0);
  const customerDebt = Number(order.debt_remaining || 0);
  const statusKey = getCollectionStatus(order);
  const statusCfg = COLLECTION_STATUS[statusKey] || COLLECTION_STATUS.unpaid;

  return (
    <div
      style={{
        borderBottom: "1px solid #f1f5f9",
        background: "#fff",
        transition: "all 0.15s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "#f8fafc";
        e.currentTarget.style.boxShadow = "inset 3px 0 0 #1E2B88";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "#fff";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: GRID_COLS,
          gap: 0,
          alignItems: "center",
          padding: "14px 16px",
          cursor: "pointer",
        }}
        onClick={() => onOpenDetail?.(order)}
      >
        {/* ID */}
        <div style={{
          fontWeight: 700,
          color: "#1E2B88",
          fontSize: 13,
          fontFamily: "'Inter', monospace",
        }}>
          #{order.id}
        </div>

        {/* Ngày */}
        <div style={{ fontSize: 11, color: "#64748b", fontVariantNumeric: "tabular-nums" }}>
          {formatDate(order.created_at)}
        </div>

        {/* Khách hàng */}
        <div style={{ overflow: "hidden", paddingRight: 8 }}>
          <div style={{
            fontWeight: 600,
            color: "#0f172a",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontSize: 13,
            lineHeight: "1.3",
          }}>
            {order.customer_name || "Khách lẻ"}
          </div>
          {order.customer_phone && (
            <div style={{
              fontSize: 10,
              color: "#94a3b8",
              fontFamily: "monospace",
              letterSpacing: "0.03em",
            }}>
              {order.customer_phone}
            </div>
          )}
        </div>

        {/* Hàng hóa */}
        <div style={{
          overflow: "hidden",
          paddingRight: 6,
        }}>
          <div style={{
            fontSize: 11,
            color: order.cargo_name ? "#475569" : "#cbd5e1",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontWeight: 500,
          }}>
            {order.cargo_name || "—"}
          </div>
        </div>

        {/* Thu đủ? — Badge */}
        <div style={{ textAlign: "center" }}>
          <span style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
            padding: "3px 8px",
            borderRadius: 999,
            fontSize: 10,
            fontWeight: 700,
            color: statusCfg.color,
            background: statusCfg.bg,
            border: `1px solid ${statusCfg.border}`,
            whiteSpace: "nowrap",
            letterSpacing: "0.01em",
          }}>
            <span style={{ fontSize: 9 }}>{statusCfg.icon}</span>
            {statusCfg.label}
          </span>
        </div>

        {/* Chuyến */}
        <div style={{ textAlign: "center" }}>
          <span style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 24,
            height: 24,
            borderRadius: "50%",
            background: "#e0e7ff",
            color: "#1E2B88",
            fontWeight: 700,
            fontSize: 11,
          }}>
            {shipmentCount}
          </span>
        </div>

        {/* Doanh thu */}
        <div style={{
          textAlign: "right",
          paddingRight: 10,
          borderRight: "1px solid #f1f5f9",
        }}>
          <div style={{
            fontWeight: 800,
            color: "#0f172a",
            fontSize: 13,
            fontVariantNumeric: "tabular-nums",
          }}>
            {fmt(revenue)}đ
          </div>
        </div>

        {/* Đã thu về */}
        <MoneyCell amount={companyReceived} color="#16a34a" />

        {/* Tài xế nợ */}
        <MoneyCell amount={driverDebt} color="#d97706" />

        {/* Khách Nợ */}
        <MoneyCell amount={customerDebt} color="#dc2626" />

        {/* Hành động */}
        <div style={{ textAlign: "center" }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetail?.(order);
            }}
            style={{
              padding: "5px 10px",
              background: "#1E2B88",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              transition: "all 0.15s",
              letterSpacing: "0.01em",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#151e62";
              e.currentTarget.style.transform = "scale(1.04)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#1E2B88";
              e.currentTarget.style.transform = "scale(1)";
            }}
          >
            Chi tiết
          </button>
        </div>
      </div>
    </div>
  );
}

OrderRow.propTypes = {
  order: PropTypes.object,
  onOpenDetail: PropTypes.func,
};

export default function RevenueTable({
  orders,
  loading,
  pagination,
  apiBase,
  token,
  onPageChange,
  onOpenPayment,
  onOpenDetail
}) {
  if (loading) {
    return (
      <div style={{
        padding: 60,
        textAlign: "center",
        color: "#64748b",
        background: "#fff",
        borderRadius: 14,
        border: "1px solid #e2e8f0",
      }}>
        <div style={{ marginBottom: 12 }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#1E2B88" strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}>
            <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
            <path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
          </svg>
        </div>
        <span style={{ fontWeight: 600 }}>Đang tải dữ liệu...</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!orders || orders.length === 0) {
    return (
      <div style={{
        padding: 60,
        textAlign: "center",
        background: "#fff",
        borderRadius: 14,
        border: "1px solid #e2e8f0",
      }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" style={{ marginBottom: 12 }}>
          <circle cx="12" cy="12" r="10" />
          <path d="M8 12h8" />
        </svg>
        <p style={{ color: "#64748b", margin: 0, fontWeight: 600 }}>Không có đơn hàng nào.</p>
      </div>
    );
  }

  // Calculate totals for summary
  const totals = orders.reduce((acc, o) => {
    acc.revenue += Number(o.actual_price || 0);
    acc.company += Number(o.company_received || 0);
    acc.driver += Number(o.driver_debt_remaining || 0);
    acc.customer += Number(o.debt_remaining || 0);
    return acc;
  }, { revenue: 0, company: 0, driver: 0, customer: 0 });

  return (
    <>
      {/* Summary Cards */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 16,
        marginBottom: 20,
      }}>
        {/* Tổng doanh thu */}
        <div style={{
          background: "linear-gradient(135deg, #ffffff 0%, #eef1ff 100%)",
          borderRadius: 14,
          padding: "16px 20px",
          border: "1px solid #e2e8f0",
          borderLeft: "4px solid #1E2B88",
          transition: "transform 0.2s, box-shadow 0.2s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "translateY(-2px)";
          e.currentTarget.style.boxShadow = "0 8px 20px rgba(30, 43, 136, 0.08)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow = "none";
        }}
        >
          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
            Tổng doanh thu
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#1E2B88" }}>{fmt(totals.revenue)}đ</div>
        </div>

        {/* Đã thu về */}
        <div style={{
          background: "linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)",
          borderRadius: 14,
          padding: "16px 20px",
          border: "1px solid #e2e8f0",
          borderLeft: "4px solid #16a34a",
          transition: "transform 0.2s, box-shadow 0.2s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "translateY(-2px)";
          e.currentTarget.style.boxShadow = "0 8px 20px rgba(22, 163, 74, 0.08)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow = "none";
        }}
        >
          <div style={{ fontSize: 11, color: "#16a34a", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
            ✓ Đã thu về
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#16a34a" }}>{fmt(totals.company)}đ</div>
        </div>

        {/* Tài xế nợ */}
        <div style={{
          background: "linear-gradient(135deg, #ffffff 0%, #fffbeb 100%)",
          borderRadius: 14,
          padding: "16px 20px",
          border: "1px solid #e2e8f0",
          borderLeft: "4px solid #d97706",
          transition: "transform 0.2s, box-shadow 0.2s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "translateY(-2px)";
          e.currentTarget.style.boxShadow = "0 8px 20px rgba(217, 119, 6, 0.08)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow = "none";
        }}
        >
          <div style={{ fontSize: 11, color: "#d97706", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
            🚗 Tài xế nợ
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#d97706" }}>{fmt(totals.driver)}đ</div>
        </div>

        {/* Khách Nợ */}
        <div style={{
          background: "linear-gradient(135deg, #ffffff 0%, #fef2f2 100%)",
          borderRadius: 14,
          padding: "16px 20px",
          border: "1px solid #e2e8f0",
          borderLeft: "4px solid #dc2626",
          transition: "transform 0.2s, box-shadow 0.2s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "translateY(-2px)";
          e.currentTarget.style.boxShadow = "0 8px 20px rgba(220, 38, 38, 0.08)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow = "none";
        }}
        >
          <div style={{ fontSize: 11, color: "#dc2626", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
            📋 Khách Nợ
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#dc2626" }}>{fmt(totals.customer)}đ</div>
        </div>
      </div>

      {/* Table */}
      <div style={{
        borderRadius: 14,
        border: "1px solid #e2e8f0",
        overflow: "hidden",
        background: "#fff",
        boxShadow: "0 4px 16px rgba(15, 23, 42, 0.03)",
      }}>
        {/* Table Header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: GRID_COLS,
            gap: 0,
            padding: "12px 16px",
            background: "linear-gradient(180deg, #f8f9ff 0%, #f1f4ff 100%)",
            borderBottom: "2px solid #e0e7ff",
            fontSize: 10,
            fontWeight: 700,
            color: "#475569",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          <span>ID</span>
          <span>Ngày</span>
          <span>Khách hàng</span>
          <span>Hàng hóa</span>
          <span style={{ textAlign: "center" }}>Thu đủ?</span>
          <span style={{ textAlign: "center" }}>Chuyến</span>
          <span style={{ textAlign: "right", paddingRight: 10 }}>Doanh thu</span>
          <span style={{ textAlign: "right" }}>Đã thu về</span>
          <span style={{ textAlign: "right" }}>TX nợ</span>
          <span style={{ textAlign: "right" }}>Khách nợ</span>
          <span></span>
        </div>

        {/* Order rows */}
        {orders.map((order) => (
          <OrderRow
            key={order.id}
            order={order}
            onOpenDetail={onOpenDetail}
          />
        ))}

        {/* Table footer — totals */}
        <div style={{
          display: "grid",
          gridTemplateColumns: GRID_COLS,
          gap: 0,
          padding: "12px 16px",
          background: "#f8f9ff",
          borderTop: "2px solid #e0e7ff",
          fontSize: 12,
          fontWeight: 800,
        }}>
          <span></span>
          <span></span>
          <span></span>
          <span></span>
          <span></span>
          <span style={{ textAlign: "center", color: "#64748b", fontSize: 10, fontWeight: 700 }}>
            {orders.length} đơn
          </span>
          <div style={{
            textAlign: "right",
            paddingRight: 10,
            borderRight: "1px solid #e0e7ff",
            color: "#0f172a",
            fontSize: 13,
          }}>
            {fmt(totals.revenue)}đ
          </div>
          <div style={{ textAlign: "right", color: "#16a34a", fontSize: 12 }}>
            {fmt(totals.company)}đ
          </div>
          <div style={{ textAlign: "right", color: "#d97706", fontSize: 12 }}>
            {totals.driver > 0 ? `${fmt(totals.driver)}đ` : "—"}
          </div>
          <div style={{ textAlign: "right", color: "#dc2626", fontSize: 12 }}>
            {totals.customer > 0 ? `${fmt(totals.customer)}đ` : "—"}
          </div>
          <span></span>
        </div>
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px 0 0",
          }}
        >
          <span style={{ fontSize: 13, color: "#64748b", fontWeight: 500 }}>
            Trang {pagination.currentPage} / {pagination.totalPages} — {pagination.totalItems} đơn hàng
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => onPageChange?.(pagination.currentPage - 1)}
              disabled={pagination.currentPage <= 1}
              style={{
                padding: "8px 16px",
                background: "#fff",
                color: pagination.currentPage <= 1 ? "#cbd5e1" : "#1E2B88",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
                cursor: pagination.currentPage <= 1 ? "not-allowed" : "pointer",
                transition: "all 0.15s",
              }}
            >
              ← Trước
            </button>
            {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === pagination.totalPages || Math.abs(p - pagination.currentPage) <= 2)
              .map((p, idx, arr) => (
                <React.Fragment key={p}>
                  {idx > 0 && arr[idx - 1] !== p - 1 && (
                    <span style={{ color: "#cbd5e1", padding: "0 4px", fontSize: 13, lineHeight: "36px" }}>…</span>
                  )}
                  <button
                    onClick={() => onPageChange?.(p)}
                    style={{
                      padding: "8px 14px",
                      background: p === pagination.currentPage ? "#1E2B88" : "#fff",
                      color: p === pagination.currentPage ? "#fff" : "#475569",
                      border: "1px solid",
                      borderColor: p === pagination.currentPage ? "#1E2B88" : "#e2e8f0",
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                      transition: "all 0.15s",
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
                padding: "8px 16px",
                background: "#fff",
                color: pagination.currentPage >= pagination.totalPages ? "#cbd5e1" : "#1E2B88",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
                cursor: pagination.currentPage >= pagination.totalPages ? "not-allowed" : "pointer",
                transition: "all 0.15s",
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
