import { useRef, useState } from "react";
import { Button, Input } from "antd";
import { PlusOutlined, SearchOutlined } from "@ant-design/icons";
import "../../styles/Coordinator.css";
import { useRoleRealtime } from "../../hooks/useRoleRealtime";
import AppHeader from "../../components/layout/AppHeader";
import AppSidebar from "../../components/layout/AppSidebar";
import { saveSession } from "../../services/storage";
import { C } from "../../styles/theme";
import OrdersPage from "./OrdersPage";
import IncidentsPage from "./IncidentsPage";
import ReceiptsPage from "./ReceiptsPage";

const SEARCH_PLACEHOLDER = {
  orders: "Tên sản phẩm, điểm lấy hàng, giao hàng, tài xế, trạng thái",
  incidents: "Tìm theo mã sự cố, chuyến, tài xế, mô tả",
  receipts: "Tìm theo đơn, tài xế, khách hàng, trạng thái",
};

export default function CoordinatorPage({ user, onLogout }) {
  const [currentUser, setCurrentUser] = useState(user);
  const [activeView, setActiveView] = useState("orders");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [orderSearchQuery, setOrderSearchQuery] = useState("");
  const [incidentSearchQuery, setIncidentSearchQuery] = useState("");
  const [receiptSearchQuery, setReceiptSearchQuery] = useState("");

  const [ordersRefreshKey, setOrdersRefreshKey] = useState(0);
  const [incidentsRefreshKey, setIncidentsRefreshKey] = useState(0);
  const [receiptsRefreshKey, setReceiptsRefreshKey] = useState(0);

  const ordersPageRef = useRef(null);

  useRoleRealtime(currentUser, {
    onMessage: (payload) => {
      if (!payload?.type) return;

      if (payload.type === "coordinator.orders.changed") {
        setOrdersRefreshKey((k) => k + 1);
      }
      if (payload.type === "coordinator.incidents.changed") {
        setIncidentsRefreshKey((k) => k + 1);
      }
      if (
        payload.type === "coordinator.receipt_requests.changed" ||
        payload.type === "notification.created"
      ) {
        setReceiptsRefreshKey((k) => k + 1);
      }
    },
  });

  const handleLogout = () => {
    onLogout?.();
  };

  const handleProfileUpdated = (nextProfile) => {
    const mergedUser = { ...currentUser, ...nextProfile };
    setCurrentUser(mergedUser);
    saveSession({ user: mergedUser });
  };

  const activeSearchQuery = activeView === "receipts"
    ? receiptSearchQuery
    : activeView === "incidents"
      ? incidentSearchQuery
      : orderSearchQuery;

  const handleSearchQueryChange = (value) => {
    if (activeView === "receipts") {
      setReceiptSearchQuery(value);
      return;
    }
    if (activeView === "incidents") {
      setIncidentSearchQuery(value);
      return;
    }
    setOrderSearchQuery(value);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", background: C.surface }}>
      <AppSidebar
        user={currentUser}
        activeTab={activeView}
        onTabChange={setActiveView}
        collapsed={sidebarCollapsed}
        onCollapse={setSidebarCollapsed}
      />

      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <AppHeader
          user={currentUser}
          onLogout={handleLogout}
          onProfileUpdated={handleProfileUpdated}
        />

        <section style={{ padding: 24, flex: 1, overflow: "auto" }}>
          <div className="coordinator-shell coordinator-content-shell">
            <header className="topbar">
              <Input
                size="large"
                allowClear
                prefix={<SearchOutlined />}
                className="coordinator-search-input"
                value={activeSearchQuery}
                onChange={(event) => handleSearchQueryChange(event.target.value)}
                placeholder={SEARCH_PLACEHOLDER[activeView]}
              />
              <div className="topbar-actions">
                {activeView === "orders" && (
                  <Button
                    className="coordinator-primary-btn"
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => ordersPageRef.current?.openCreateModal()}
                  >
                    Tạo mới
                  </Button>
                )}
              </div>
            </header>

            {activeView === "orders" && (
              <OrdersPage ref={ordersPageRef} search={orderSearchQuery} refreshKey={ordersRefreshKey} />
            )}
            {activeView === "incidents" && (
              <IncidentsPage
                search={incidentSearchQuery}
                refreshKey={incidentsRefreshKey}
                onIncidentResolved={() => setOrdersRefreshKey((k) => k + 1)}
              />
            )}
            {activeView === "receipts" && (
              <ReceiptsPage
                search={receiptSearchQuery}
                refreshKey={receiptsRefreshKey}
                onReceiptPublished={() => setOrdersRefreshKey((k) => k + 1)}
              />
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
