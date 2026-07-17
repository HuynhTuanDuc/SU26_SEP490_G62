import { useState } from "react";
import { HeroUIProvider } from "@heroui/react";
import {
  RiDashboardLine,
  RiBuilding2Line,
  RiUserSearchLine,
  RiUserSettingsLine,
  RiTruckLine,
  RiAlertLine,
  RiMoneyDollarCircleLine,
  RiGiftLine,
  RiEqualizerLine,
  RiTrophyLine,
  RiCalendarLine,
  RiCalendarCheckLine,
} from "react-icons/ri";
import "../../styles/shared-ui.css";

import { Sidebar } from "../../components/shared-ui/Sidebar";
import { TopBar } from "../../components/shared-ui/TopBar";
import { saveSession } from "../../services/storage";
import ProfileModal from "../../components/profile/ProfileModal";

import DashboardView from "./views/DashboardView";
import PartnersView from "./views/PartnersView";
import CustomersView from "./views/CustomersView";
import UsersView from "./views/UsersView";
import VehiclesView from "./views/VehiclesView";
import IncidentsView from "./views/IncidentsView";
import PayrollView from "./views/PayrollView";
import BonusView from "./views/BonusView";
import BonusRulesView from "./views/BonusRulesView";
import KpiView from "./views/KpiView";
import HolidaysView from "./views/HolidaysView";
import AttendanceView from "./views/AttendanceView";
import SpendingView from "./views/SpendingView";

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
      { key: "partners", label: "Đối tác", icon: RiBuilding2Line },
      { key: "customers", label: "Khách hàng", icon: RiUserSearchLine },
      { key: "vehicles", label: "Quản lý xe", icon: RiTruckLine },
      { key: "incidents", label: "Sự cố", icon: RiAlertLine },
      { key: "spending", label: "Quản lý chi", icon: RiMoneyDollarCircleLine },
      { key: "kpi", label: "KPI & Xếp hạng", icon: RiTrophyLine },
    ],
  },
  {
    label: "Nhân sự & Lương",
    items: [
      { key: "users", label: "Người dùng", icon: RiUserSettingsLine },
      { key: "attendance", label: "Chấm công", icon: RiCalendarCheckLine },
      { key: "payroll", label: "Duyệt lương", icon: RiMoneyDollarCircleLine },
      { key: "bonus", label: "Thưởng & Phúc lợi", icon: RiGiftLine },
      { key: "bonus-rules", label: "Quy tắc thưởng", icon: RiEqualizerLine },
      { key: "holidays", label: "Ngày lễ", icon: RiCalendarLine },
    ],
  },
];

const VIEW_META = {
  dashboard: { title: "Tổng quan quản lý", subtitle: "Phê duyệt, công nợ, phiếu thu và thông tin công ty trên cùng một luồng vận hành." },
  partners: { title: "Quản lý đối tác", subtitle: "Quản lý thông tin đối tác và theo dõi công nợ nếu đối tác đang tồn đọng thanh toán." },
  customers: { title: "Quản lý khách hàng", subtitle: "Quản lý thông tin khách hàng thuê vận chuyển." },
  users: { title: "Quản lý người dùng", subtitle: "Quản lý tài khoản, vai trò và trạng thái truy cập." },
  vehicles: { title: "Quản lý xe", subtitle: "Theo dõi phương tiện, tài xế được gán và trạng thái bảo trì." },
  incidents: { title: "Xử lý sự cố", subtitle: "Xem và xử lý sự cố tài xế báo cáo, điều chuyển tài xế thay thế khi cần." },
  payroll: { title: "Duyệt lương tài xế", subtitle: "Xác nhận bảng lương tài xế trước khi kế toán chi trả." },
  bonus: { title: "Thưởng & Phúc lợi", subtitle: "Duyệt thưởng Tết, phúc lợi kết hôn/tang gia/sinh nhật và thưởng đặc biệt." },
  "bonus-rules": { title: "Quy tắc thưởng", subtitle: "Cấu hình ngưỡng và số tiền thưởng KPI, thưởng doanh thu theo từng nhóm xe." },
  kpi: { title: "KPI & Xếp hạng", subtitle: "Theo dõi KPI và bảng xếp hạng của toàn bộ tài xế theo tháng, theo nhóm xe." },
  holidays: { title: "Quản lý ngày lễ", subtitle: "Danh mục ngày lễ hưởng nguyên lương — tài xế đi làm ngày lễ được tính 200% lương." },
  spending: { title: "Quản lý chi", subtitle: "Duyệt chi phí tài xế, duyệt phiếu chi và theo dõi tổng hợp mọi khoản chi của công ty." },
  attendance: { title: "Chấm công tài xế", subtitle: "Theo dõi và điều chỉnh chấm công theo tháng — ảnh hưởng trực tiếp tới ngày công tính lương." },
};

const VIEW_STORAGE_KEY = "manager_active_view";
const VALID_VIEWS = Object.keys(VIEW_META);

const getInitialView = () => {
  try {
    const saved = localStorage.getItem(VIEW_STORAGE_KEY);
    if (saved && VALID_VIEWS.includes(saved)) return saved;
  } catch { /* localStorage bị chặn thì dùng mặc định */ }
  return "dashboard";
};

export default function ManagerPage({ user, onLogout }) {
  const [currentUser, setCurrentUser] = useState(user);
  const [activeView, setActiveView] = useState(getInitialView);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const handleViewChange = (view) => {
    setActiveView(view);
    try { localStorage.setItem(VIEW_STORAGE_KEY, view); } catch { /* ignore */ }
  };

  const handleLogout = () => onLogout?.();

  const handleProfileUpdated = (nextProfile) => {
    const merged = { ...currentUser, ...nextProfile };
    setCurrentUser(merged);
    saveSession({ user: merged });
  };

  const meta = VIEW_META[activeView] ?? VIEW_META.dashboard;

  return (
    <HeroUIProvider>
      <div className="flex h-screen bg-gray-50 overflow-hidden">
        <Sidebar
          navGroups={NAV_GROUPS}
          brandLabel="LogisCount"
          brandSubLabel="Quản lý"
          activeView={activeView}
          onViewChange={handleViewChange}
          user={currentUser}
          onLogout={handleLogout}
          onProfile={() => setProfileOpen(true)}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((v) => !v)}
        />

        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <TopBar title={meta.title} subtitle={meta.subtitle} />

          <main className="flex-1 overflow-y-auto p-6">
            {activeView === "dashboard" && <DashboardView user={currentUser} />}
            {activeView === "partners" && <PartnersView user={currentUser} />}
            {activeView === "customers" && <CustomersView />}
            {activeView === "users" && <UsersView user={currentUser} />}
            {activeView === "attendance" && <AttendanceView />}
            {activeView === "vehicles" && <VehiclesView user={currentUser} />}
            {activeView === "incidents" && <IncidentsView />}
            {activeView === "payroll" && <PayrollView />}
            {activeView === "bonus" && <BonusView />}
            {activeView === "bonus-rules" && <BonusRulesView />}
            {activeView === "kpi" && <KpiView />}
            {activeView === "holidays" && <HolidaysView />}
            {activeView === "spending" && <SpendingView />}
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
