import { useState } from "react";
import { HeroUIProvider } from "@heroui/react";
import "../../styles/accountant.css";

import { Sidebar } from "./components/layout/Sidebar";
import { TopBar } from "./components/layout/TopBar";
import { RevenueView } from "./views/RevenueView";
import { DebtView } from "./views/DebtView";
import { PayrollView } from "./views/PayrollView";
import { ReportView } from "./views/ReportView";
import { ExternalOrderModal } from "./modals/ExternalOrderModal";
import ProfileModal from "../../components/profile/ProfileModal";
import { saveSession } from "../../services/storage";

const VIEW_META = {
  revenue: {
    title: "Quản lý doanh thu",
    subtitle: "Theo dõi phiếu thu, doanh thu từ các đơn hàng hoàn thành",
    searchPlaceholder: "Tìm khách hàng, SĐT, mã đơn...",
  },
  debt: {
    title: "Quản lý công nợ",
    subtitle: "Theo dõi và xử lý công nợ khách hàng, tài xế",
    searchPlaceholder: "Tìm tên người nợ...",
  },
  salary: {
    title: "Bảng lương",
    subtitle: "Xem và xác nhận phiếu lương tài xế theo tháng",
    searchPlaceholder: "Tìm tài xế...",
  },
  advance: {
    title: "Ứng lương",
    subtitle: "Giải ngân yêu cầu ứng lương đã được manager duyệt",
    searchPlaceholder: "Tìm tài xế...",
  },
  report: {
    title: "Báo cáo tổng quan",
    subtitle: "Phân tích doanh thu, công nợ và lương theo kỳ",
    searchPlaceholder: "",
  },
};

export default function AccountantPage({ user, onLogout }) {
  const [currentUser, setCurrentUser] = useState(user);
  const [activeView, setActiveView] = useState("revenue");
  const [search, setSearch] = useState("");

  const [showExternalModal, setShowExternalModal] = useState(false);
  const [revenueRefreshKey, setRevenueRefreshKey] = useState(0);
  const [profileOpen, setProfileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const handleProfileUpdated = (nextProfile) => {
    const merged = { ...currentUser, ...nextProfile };
    setCurrentUser(merged);
    saveSession({ user: merged });
  };

  const handleOrderCreated = () => {
    setShowExternalModal(false);
    setRevenueRefreshKey((k) => k + 1);
  };

  const handleViewChange = (view) => {
    setActiveView(view);
    setSearch("");
  };

  const meta = VIEW_META[activeView] ?? VIEW_META.revenue;

  const primaryAction = activeView === "revenue"
    ? { label: "Nhập đơn ngoài", onPress: () => setShowExternalModal(true) }
    : null;

  const showSearch = activeView !== "report";

  return (
    <HeroUIProvider>
      <div className="flex h-screen bg-gray-50 overflow-hidden">
        <Sidebar
          activeView={activeView}
          onViewChange={handleViewChange}
          user={currentUser}
          onLogout={onLogout}
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
            {activeView === "revenue" && (
              <RevenueView refreshKey={revenueRefreshKey} search={search} />
            )}
            {activeView === "debt" && (
              <DebtView search={search} />
            )}
            {activeView === "salary" && (
              <PayrollView defaultTab="payroll" />
            )}
            {activeView === "advance" && (
              <PayrollView defaultTab="advance" />
            )}
            {activeView === "report" && (
              <ReportView />
            )}
          </main>
        </div>
      </div>

      <ExternalOrderModal
        isOpen={showExternalModal}
        onClose={() => setShowExternalModal(false)}
        onOrderCreated={handleOrderCreated}
      />

      <ProfileModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        onProfileUpdated={handleProfileUpdated}
      />
    </HeroUIProvider>
  );
}
