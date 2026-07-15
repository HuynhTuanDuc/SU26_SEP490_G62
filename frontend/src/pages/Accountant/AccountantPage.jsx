import { useState } from "react";
import { HeroUIProvider } from "@heroui/react";
import {
  RiLineChartLine, RiFileList3Line, RiMoneyDollarCircleLine,
  RiHandCoinLine, RiGiftLine, RiBookOpenLine,
} from "react-icons/ri";
import { TbReportAnalytics } from "react-icons/tb";
import "../../styles/accountant.css";

import { Sidebar } from "../../components/shared-ui/Sidebar";
import { TopBar } from "./components/layout/TopBar";
import { RevenueView } from "./views/RevenueView";
import { DebtView } from "./views/DebtView";
import { PayrollView } from "./views/PayrollView";
import { ReportView } from "./views/ReportView";
import { BonusView } from "./views/BonusView";
import { LedgerView } from "./views/LedgerView";
import { ExternalOrderModal } from "./modals/ExternalOrderModal";
import { ImportExcelModal } from "./modals/ImportExcelModal";
import ProfileModal from "../../components/profile/ProfileModal";
import { saveSession } from "../../services/storage";

const NAV_GROUPS = [
  {
    label: "Tổng quan",
    items: [
      { key: "report", label: "Báo cáo", icon: TbReportAnalytics },
    ],
  },
  {
    label: "Tài chính",
    items: [
      { key: "revenue", label: "Doanh thu", icon: RiLineChartLine },
      { key: "debt",    label: "Công nợ",  icon: RiFileList3Line },
      { key: "ledger",  label: "Nhật ký tài chính", icon: RiBookOpenLine },
    ],
  },
  {
    label: "Nhân sự & Lương",
    items: [
      { key: "salary",  label: "Bảng lương",        icon: RiMoneyDollarCircleLine },
      { key: "advance", label: "Ứng lương",          icon: RiHandCoinLine },
      { key: "bonus",   label: "Thưởng & Phúc lợi", icon: RiGiftLine },
    ],
  },
];

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
  bonus: {
    title: "Thưởng & Phúc lợi",
    subtitle: "Chi trả thưởng Tết, sinh nhật, kết hôn, tang gia và thưởng đặc biệt",
    searchPlaceholder: "Tìm tài xế...",
  },
  report: {
    title: "Báo cáo tổng quan",
    subtitle: "Phân tích doanh thu, công nợ và lương theo kỳ",
    searchPlaceholder: "",
  },
  ledger: {
    title: "Nhật ký tài chính",
    subtitle: "Sổ ghi mọi chuyển động tiền trong hệ thống, xuất kỳ kế toán sang MISA",
    searchPlaceholder: "",
  },
};

const VIEW_STORAGE_KEY = "accountant_active_view";
const VALID_VIEWS = ["report", "revenue", "debt", "salary", "advance", "bonus", "ledger"];

// Nhớ trang đang đứng — reload/quay lại không bị đưa về trang khác; mặc định Báo cáo
const getInitialView = () => {
  try {
    const saved = localStorage.getItem(VIEW_STORAGE_KEY);
    if (saved && VALID_VIEWS.includes(saved)) return saved;
  } catch { /* localStorage bị chặn thì dùng mặc định */ }
  return "report";
};

export default function AccountantPage({ user, onLogout }) {
  const [currentUser, setCurrentUser] = useState(user);
  const [activeView, setActiveView] = useState(getInitialView);
  const [search, setSearch] = useState("");

  const [showExternalModal, setShowExternalModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
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
    try { localStorage.setItem(VIEW_STORAGE_KEY, view); } catch { /* ignore */ }
  };

  const meta = VIEW_META[activeView] ?? VIEW_META.revenue;

  const primaryAction = activeView === "revenue"
    ? { label: "Nhập đơn ngoài", onPress: () => setShowExternalModal(true) }
    : null;

  const secondaryAction = activeView === "revenue"
    ? { label: "Import Excel", onPress: () => setShowImportModal(true) }
    : null;

  const showSearch = activeView !== "report" && activeView !== "ledger";

  return (
    <HeroUIProvider>
      <div className="flex h-screen bg-gray-50 overflow-hidden">
        <Sidebar
          navGroups={NAV_GROUPS}
          brandLabel="LogisCount"
          brandSubLabel="Kế toán"
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
            secondaryAction={secondaryAction}
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
            {activeView === "bonus" && (
              <BonusView search={search} />
            )}
            {activeView === "report" && (
              <ReportView />
            )}
            {activeView === "ledger" && (
              <LedgerView />
            )}
          </main>
        </div>
      </div>

      <ExternalOrderModal
        isOpen={showExternalModal}
        onClose={() => setShowExternalModal(false)}
        onOrderCreated={handleOrderCreated}
      />

      <ImportExcelModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImported={() => setRevenueRefreshKey((k) => k + 1)}
      />

      <ProfileModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        onProfileUpdated={handleProfileUpdated}
      />
    </HeroUIProvider>
  );
}
