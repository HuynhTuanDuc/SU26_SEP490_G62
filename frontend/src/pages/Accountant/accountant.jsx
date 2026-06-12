import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import OrderFormModal from "./OrderFormModal";
import PaymentModal from "./PaymentModal";
import RevenueTable from "./RevenueTable";
import DebtTable from "./DebtTable";
import OrderDetailModal from "./OrderDetailModal";
import "../../styles/Orders.css";

export default function Accountant({ user, onLogout }) {
  const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:9999";
  const token = localStorage.getItem("token");

  // ── Active sidebar view ──────────────────────────────────────
  const [activeView, setActiveView] = useState("revenue"); // "revenue" | "debt"

  // ── Revenue (orders) state ───────────────────────────────────
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeStatusFilter, setActiveStatusFilter] = useState("all");
  const [debtFilter, setDebtFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // ── Modals ────────────────────────────────────────────────────
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedOrderForPayment, setSelectedOrderForPayment] = useState(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedOrderForDetail, setSelectedOrderForDetail] = useState(null);
  const [isOrderDetailOpen, setIsOrderDetailOpen] = useState(false);

  // ── Stats ─────────────────────────────────────────────────────
  const [stats, setStats] = useState({
    total_revenue: 0,
    total_collected: 0,
    total_receivables: 0,
    pending_payments_count: 0
  });

  // ── Fetch finance stats ────────────────────────────────────────
  const fetchStats = async () => {
    try {
      const response = await fetch(`${API_BASE}/accountant/finance/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Không thể tải số liệu thống kê tài chính:", err);
    }
  };

  // ── Fetch orders (table) ──────────────────────────────────────
  const fetchOrders = async (page = 1) => {
    setLoadingOrders(true);
    try {
      const params = new URLSearchParams({ page, limit: 20 });
      if (activeStatusFilter !== "all") params.set("status", activeStatusFilter);
      if (searchTerm.trim()) params.set("search", searchTerm.trim());

      const response = await fetch(`${API_BASE}/accountant/orders?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) throw new Error("Không thể tải danh sách đơn hàng.");

      const data = await response.json();

      if (data?.orders) {
        setOrders(data.orders);
        setTotalPages(data.totalPages || 1);
        setTotalItems(data.totalItems || data.orders.length);
      } else {
        setOrders(Array.isArray(data) ? data : []);
        setTotalPages(1);
        setTotalItems(Array.isArray(data) ? data.length : 0);
      }
    } catch (err) {
      console.error("Lỗi:", err);
    } finally {
      setLoadingOrders(false);
    }
  };

  // Client-side debt filter on orders
  const filteredOrders = orders.filter(order => {
    if (debtFilter === "all") return true;
    const orderDebtStatus = order.debt_status
      || (order.payment_type === "client_credit" ? "unpaid" : "paid");
    return orderDebtStatus === debtFilter;
  });

  // ── Effects ────────────────────────────────────────────────────
  useEffect(() => {
    setCurrentPage(1);
  }, [activeStatusFilter, searchTerm, debtFilter]);

  useEffect(() => {
    fetchOrders(currentPage);
  }, [currentPage, activeStatusFilter, searchTerm]);

  useEffect(() => {
    fetchStats();
  }, []);

  const refreshData = () => {
    fetchOrders(currentPage);
    fetchStats();
  };

  // ── Handlers ──────────────────────────────────────────────────
  const handlePageChange = (page) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleOpenPayment = (order) => {
    setSelectedOrderForPayment(order);
    setIsPaymentModalOpen(true);
  };

  // ── Pagination meta ────────────────────────────────────────────
  const pagination = {
    currentPage,
    totalPages,
    totalItems,
    limit: 20,
  };

  return (
    <div className="dashboard-layout accountant-dashboard">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <svg className="brand-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
          <span className="brand-name">Finance HQ</span>
        </div>

        <nav className="sidebar-nav">
          <button
            className={`nav-item ${activeView === "revenue" ? "active" : ""}`}
            onClick={() => setActiveView("revenue")}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
            <span>Quản lý doanh thu</span>
          </button>

          <button
            className={`nav-item ${activeView === "debt" ? "active" : ""}`}
            onClick={() => setActiveView("debt")}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
            <span>Quản lý công nợ</span>
          </button>

          <button className="nav-item" onClick={() => alert("Báo cáo tài chính đang phát triển!")}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            <span>Báo cáo doanh thu</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <button className="profile-btn" onClick={onLogout} title="Đăng xuất">
            <div className="profile-avatar">
              {user?.full_name ? user.full_name.charAt(0) : "A"}
            </div>
            <div className="profile-info">
              <span className="profile-name">{user?.full_name || "Trần Kế Toán"}</span>
              <span className="profile-role">Kế toán (Thu)</span>
            </div>
            <svg className="logout-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </aside>

      {/* Main Container */}
      <main className="main-content">
        {/* Header */}
        <header className="main-header">
          <div className="search-bar">
            <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder={
                activeView === "revenue"
                  ? "Tìm khách hàng, SĐT, ID đơn..."
                  : "Tìm người nợ..."
              }
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="header-actions">
            {activeView === "revenue" && (
              <button className="create-order-btn" onClick={() => setIsModalOpen(true)}>
                <span className="plus">+</span> Nhập đơn ngoài
              </button>
            )}
            <button className="icon-btn notification-bell" title="Thông báo" onClick={() => alert("Không có thông báo mới.")}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              <span className="notification-badge"></span>
            </button>
            <div className="user-avatar" title={user?.email}>H</div>
          </div>
        </header>

        {/* Content */}
        <div className="content-body">

          {/* ── REVENUE VIEW ─────────────────────────────────────── */}
          {activeView === "revenue" && (
            <>
              <div className="page-header">
                <div>
                  <h2>Quản lý doanh thu</h2>
                  <p>Theo dõi doanh thu, ghi nhận phiếu thu từ các đơn hàng.</p>
                </div>
              </div>

              {/* Stats */}
              <div className="finance-stats-grid">
                <div className="finance-stat-card glass-blue">
                  <div className="stat-card-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                    </svg>
                  </div>
                  <div className="stat-card-info">
                    <span className="stat-card-label">Tổng doanh thu dự tính</span>
                    <span className="stat-card-value">{Number(stats.total_revenue).toLocaleString()}đ</span>
                  </div>
                </div>

                <div className="finance-stat-card glass-green">
                  <div className="stat-card-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                  </div>
                  <div className="stat-card-info">
                    <span className="stat-card-label">Thực thu</span>
                    <span className="stat-card-value text-green">{Number(stats.total_collected).toLocaleString()}đ</span>
                  </div>
                </div>

                <div className="finance-stat-card glass-red">
                  <div className="stat-card-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                  </div>
                  <div className="stat-card-info">
                    <span className="stat-card-label">Công nợ phải thu</span>
                    <span className="stat-card-value text-red">{Number(stats.total_receivables).toLocaleString()}đ</span>
                  </div>
                </div>

                <div className="finance-stat-card glass-gold">
                  <div className="stat-card-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                  </div>
                  <div className="stat-card-info">
                    <span className="stat-card-label">Số đơn chưa thu đủ</span>
                    <span className="stat-card-value">{stats.pending_payments_count} đơn</span>
                  </div>
                </div>
              </div>

              {/* Filters */}
              <div className="filter-row">
                <div className="filter-tabs">
                  {[
                    { key: "all", label: "Tất cả công nợ" },
                    { key: "unpaid", label: "Chưa thanh toán" },
                    { key: "partial", label: "Thu một phần" },
                    { key: "paid", label: "Đã thu đủ" },
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      className={`filter-tab ${debtFilter === key ? "active" : ""}`}
                      onClick={() => setDebtFilter(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="filter-subtabs">
                  <select
                    className="select-status-filter"
                    value={activeStatusFilter}
                    onChange={(e) => setActiveStatusFilter(e.target.value)}
                  >
                    <option value="all">Tất cả trạng thái</option>
                    <option value="open">Mới tạo</option>
                    <option value="assigned">Đã điều phối</option>
                    <option value="in_progress">Đang vận chuyển</option>
                    <option value="completed">Đã giao hàng</option>
                    <option value="cancelled">Đã hủy</option>
                  </select>
                </div>
              </div>

              {/* Table */}
              <RevenueTable
                orders={filteredOrders}
                loading={loadingOrders}
                pagination={pagination}
                apiBase={API_BASE}
                token={token}
                onPageChange={handlePageChange}
                onOpenPayment={handleOpenPayment}
                onOpenDetail={(order) => {
                  setSelectedOrderForDetail(order);
                  setIsOrderDetailOpen(true);
                }}
              />
            </>
          )}

          {/* ── DEBT VIEW ────────────────────────────────────────── */}
          {activeView === "debt" && (
            <>
              <div className="page-header">
                <div>
                  <h2>Quản lý công nợ</h2>
                  <p>Theo dõi công nợ từ khách hàng và tài xế, lọc theo từng đối tượng.</p>
                </div>
              </div>

              {/* Debt Table */}
              <DebtTable apiBase={API_BASE} token={token} />
            </>
          )}
        </div>
      </main>

      {/* Floating Action Button */}
      {activeView === "revenue" && (
        <button
          className="floating-action-btn"
          onClick={() => setIsModalOpen(true)}
          title="Nhập đơn ngoài mới"
        >
          <span className="plus">+</span> Nhập đơn ngoài
        </button>
      )}

      {/* Modals */}
      <OrderFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onOrderCreated={refreshData}
      />

      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => {
          setIsPaymentModalOpen(false);
          setSelectedOrderForPayment(null);
        }}
        order={selectedOrderForPayment}
        onPaymentRecorded={refreshData}
      />

      <OrderDetailModal
        isOpen={isOrderDetailOpen}
        onClose={() => {
          setIsOrderDetailOpen(false);
          setSelectedOrderForDetail(null);
        }}
        order={selectedOrderForDetail}
      />
    </div>
  );
}

Accountant.propTypes = {
  user: PropTypes.shape({
    full_name: PropTypes.string,
    email: PropTypes.string,
  }),
  onLogout: PropTypes.func,
};
