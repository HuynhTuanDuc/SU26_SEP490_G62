import { useRef, useState } from "react";
import { HeroUIProvider } from "@heroui/react";
import {
  RiTruckLine,
  RiAlertLine,
  RiFileList3Line,
  RiUserSearchLine,
  RiTrophyLine,
  RiDashboardLine,
} from "react-icons/ri";
import "../../styles/shared-ui.css";

import { Sidebar } from "../../components/shared-ui/Sidebar";
import { TopBar } from "../../components/shared-ui/TopBar";
import { useRoleRealtime } from "../../hooks/useRoleRealtime";
import { saveSession } from "../../services/storage";
import ProfileModal from "../../components/profile/ProfileModal";

import DashboardView from "./views/DashboardView";
import OrdersView from "./views/OrdersView";
import IncidentsView from "./views/IncidentsView";
import ReceiptsView from "./views/ReceiptsView";
import CustomersView from "./views/CustomersView";
import KpiView from "./views/KpiView";

const NAV_GROUPS = [
  {
    label: "Tổng quan",
    items: [
      { key: "dashboard", label: "Tổng quan", icon: RiDashboardLine },
    ],
  },
  {
    label: "Vận hành",
    items: [
      { key: "orders", label: "Đơn hàng", icon: RiTruckLine },
      { key: "incidents", label: "Sự cố", icon: RiAlertLine },
      { key: "receipts", label: "Phiếu thu", icon: RiFileList3Line },
      { key: "customers", label: "Khách hàng", icon: RiUserSearchLine },
      { key: "kpi", label: "KPI & Xếp hạng", icon: RiTrophyLine },
    ],
  },
];

const VIEW_META = {
  dashboard: {
    title: "Tổng quan điều phối",
    subtitle: "Số đơn/trip đang xử lý, sự cố mở và phiếu thu chờ duyệt.",
    searchPlaceholder: "",
  },
  orders: {
    title: "Quản lý đơn hàng",
    subtitle: "Theo dõi đơn hàng, lọc nhanh và tạo chuyến mới ngay trong một màn hình.",
    searchPlaceholder: "Tên sản phẩm, điểm lấy hàng, giao hàng, tài xế, trạng thái",
  },
  incidents: {
    title: "Xử lý sự cố",
    subtitle: "Theo dõi sự cố đang mở, chọn tài xế thay thế và áp dụng quy tắc chia doanh thu.",
    searchPlaceholder: "Tìm theo mã sự cố, chuyến, tài xế, mô tả",
  },
  receipts: {
    title: "Quản lý phiếu thu",
    subtitle: "Theo dõi yêu cầu, phiếu thu đã tạo và lọc nhanh theo trạng thái, ngày, khách hàng.",
    searchPlaceholder: "Tìm theo đơn, tài xế, khách hàng, trạng thái",
  },
  customers: {
    title: "Quản lý khách hàng",
    subtitle: "Quản lý thông tin khách hàng thuê vận chuyển.",
    searchPlaceholder: "",
  },
  kpi: {
    title: "KPI & Xếp hạng",
    subtitle: "Theo dõi KPI và bảng xếp hạng của toàn bộ tài xế theo tháng, theo nhóm xe.",
    searchPlaceholder: "",
  },
};

const VIEW_STORAGE_KEY = "coordinator_active_view";
const VALID_VIEWS = Object.keys(VIEW_META);

const getInitialView = () => {
  try {
    const saved = localStorage.getItem(VIEW_STORAGE_KEY);
    if (saved && VALID_VIEWS.includes(saved)) return saved;
  } catch { /* localStorage bị chặn thì dùng mặc định */ }
  return "dashboard";
};

export default function CoordinatorPage({ user, onLogout }) {
  const [currentUser, setCurrentUser] = useState(user);
  const [activeView, setActiveView] = useState(getInitialView);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [search, setSearch] = useState("");

  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0);
  const [ordersRefreshKey, setOrdersRefreshKey] = useState(0);
  const [incidentsRefreshKey, setIncidentsRefreshKey] = useState(0);
  const [receiptsRefreshKey, setReceiptsRefreshKey] = useState(0);

  const ordersViewRef = useRef(null);
  const incidentsViewRef = useRef(null);

  useRoleRealtime(currentUser, {
    onMessage: (payload) => {
      if (!payload?.type) return;
      if (payload.type === "coordinator.orders.changed") {
        setOrdersRefreshKey((k) => k + 1);
        setDashboardRefreshKey((k) => k + 1);
      }
      if (payload.type === "coordinator.incidents.changed") {
        setIncidentsRefreshKey((k) => k + 1);
        setDashboardRefreshKey((k) => k + 1);
      }
      if (payload.type === "coordinator.receipt_requests.changed" || payload.type === "notification.created") {
        setReceiptsRefreshKey((k) => k + 1);
        setDashboardRefreshKey((k) => k + 1);
      }
    },
  });

  const handleViewChange = (view) => {
    setActiveView(view);
    setSearch("");
    try { localStorage.setItem(VIEW_STORAGE_KEY, view); } catch { /* ignore */ }
  };

  const handleLogout = () => onLogout?.();

  const handleProfileUpdated = (nextProfile) => {
    const merged = { ...currentUser, ...nextProfile };
    setCurrentUser(merged);
    saveSession({ user: merged });
  };

  const meta = VIEW_META[activeView] ?? VIEW_META.dashboard;
  const showSearch = activeView === "orders" || activeView === "incidents" || activeView === "receipts";

  const primaryAction = activeView === "orders"
    ? { label: "Tạo đơn", onPress: () => ordersViewRef.current?.openCreateModal() }
    : activeView === "incidents"
      ? { label: "Tạo sự cố", onPress: () => incidentsViewRef.current?.openCreateModal() }
      : null;

  return (
    <HeroUIProvider>
      <div className="flex h-screen bg-gray-50 overflow-hidden">
        <Sidebar
          navGroups={NAV_GROUPS}
          brandLabel="LogisCount"
          brandSubLabel="Điều phối"
          activeView={activeView}
          onViewChange={handleViewChange}
          user={currentUser}
          onLogout={handleLogout}
          onProfile={() => setProfileOpen(true)}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((v) => !v)}
        />

        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <TopBar
            title={meta.title}
            subtitle={meta.subtitle}
            search={showSearch ? search : undefined}
            onSearchChange={showSearch ? setSearch : undefined}
            searchPlaceholder={meta.searchPlaceholder}
            primaryAction={primaryAction}
          />

          <main className="flex-1 overflow-y-auto p-6">
            {activeView === "dashboard" && <DashboardView refreshKey={dashboardRefreshKey} />}
            {activeView === "orders" && (
              <OrdersView ref={ordersViewRef} search={search} refreshKey={ordersRefreshKey} />
            )}
            {activeView === "incidents" && (
              <IncidentsView
                ref={incidentsViewRef}
                search={search}
                refreshKey={incidentsRefreshKey}
                onIncidentResolved={() => setOrdersRefreshKey((k) => k + 1)}
              />
            )}
            {activeView === "receipts" && (
              <ReceiptsView
                search={search}
                refreshKey={receiptsRefreshKey}
                onReceiptPublished={() => setOrdersRefreshKey((k) => k + 1)}
              />
            )}
            {activeView === "customers" && <CustomersView />}
            {activeView === "kpi" && <KpiView />}
          </main>
        </div>
      </div>

      <ProfileModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        onProfileUpdated={handleProfileUpdated}
      />
    </HeroUIProvider>
  );
}
