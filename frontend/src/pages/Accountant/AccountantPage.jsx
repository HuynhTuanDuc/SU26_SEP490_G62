import { lazy, Suspense, useState } from "react";
import { HeroUIProvider } from "@heroui/react";
import {
  RiLineChartLine, RiFileList3Line, RiMoneyDollarCircleLine,
  RiHandCoinLine, RiGiftLine, RiBookOpenLine, RiWalletLine, RiBankCardLine,
  RiHandHeartLine,
  RiCalendarCheckLine, RiTruckLine, RiEqualizerLine, RiCalendarEventLine,
} from "react-icons/ri";
import { TbReportAnalytics } from "react-icons/tb";

import { Sidebar } from "../../components/shared-ui/Sidebar";
import { TopBar } from "./components/layout/TopBar";
import { RevenueView } from "./views/RevenueView";
import { DebtView } from "./views/DebtView";
import { PayrollView } from "./views/PayrollView";
import { ReportView } from "./views/ReportView";
import { BonusView } from "./views/BonusView";
import { LedgerView } from "./views/LedgerView";
import { BankTransferView } from "./views/BankTransferView";
import AttendanceView from "./views/AttendanceView";
import VehiclesView from "./views/VehiclesView";
import BonusRulesView from "../Manager/views/BonusRulesView";
import HolidaysView from "../Manager/views/HolidaysView";
import { ExternalOrderModal } from "./modals/ExternalOrderModal";
import { ImportExcelModal } from "./modals/ImportExcelModal";
import ProfileModal from "../../components/profile/ProfileModal";
import { saveSession } from "../../services/storage";
import { APP_NAME } from "../../constants/brand";

const SpendingView = lazy(() => import("./views/SpendingView"));
const ReimbursementView = lazy(() => import("./views/ReimbursementView"));
const CollectOnBehalfView = lazy(() => import("./views/CollectOnBehalfView"));

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
      // Ngược chiều với Công nợ: ở đây CÔNG TY là bên nợ (tiền thu hộ đang giữ của người bán)
      { key: "collect-on-behalf", label: "Thu hộ (COD)", icon: RiHandHeartLine },
      { key: "bank-transfer", label: "Chuyển khoản", icon: RiBankCardLine },
      { key: "spending", label: "Quản lý chi", icon: RiWalletLine },
      { key: "reimbursement", label: "Hoàn ứng tài xế", icon: RiHandCoinLine },
      { key: "ledger",  label: "Nhật ký tài chính", icon: RiBookOpenLine },
    ],
  },
  {
    label: "Nhân sự & Lương",
    items: [
      { key: "salary",  label: "Bảng lương",        icon: RiMoneyDollarCircleLine },
      { key: "advance", label: "Ứng lương",          icon: RiHandCoinLine },
      { key: "bonus",   label: "Thưởng & Phúc lợi", icon: RiGiftLine },
      { key: "bonus-rules", label: "Quy tắc thưởng", icon: RiEqualizerLine },
      { key: "attendance", label: "Chấm công", icon: RiCalendarCheckLine },
      { key: "holidays", label: "Ngày lễ", icon: RiCalendarEventLine },
    ],
  },
  {
    label: "Vận hành",
    items: [
      { key: "vehicles", label: "Quản lý xe", icon: RiTruckLine },
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
  "bonus-rules": {
    title: "Quy tắc thưởng",
    subtitle: "Tra cứu ngưỡng và số tiền thưởng KPI, thưởng doanh thu theo nhóm xe. Cấu hình do Manager thực hiện.",
    searchPlaceholder: "",
  },
  holidays: {
    title: "Ngày lễ",
    subtitle: "Danh mục ngày lễ hưởng nguyên lương — tài xế đi làm ngày lễ hưởng thêm theo hệ số ở Quy tắc thưởng (mặc định 200%). Manager quản lý danh mục.",
    searchPlaceholder: "",
  },
  report: {
    title: "Báo cáo tổng quan",
    subtitle: "Phân tích doanh thu, công nợ và lương theo kỳ",
    searchPlaceholder: "",
  },
  "bank-transfer": {
    title: "Xác nhận chuyển khoản",
    subtitle: "Tài xế báo khách đã chuyển khoản về công ty — kiểm tra sao kê và xác nhận tiền đã về.",
    searchPlaceholder: "Tìm khách hàng, tài xế, mã đơn...",
  },
  ledger: {
    title: "Nhật ký tài chính",
    subtitle: "Sổ ghi mọi chuyển động tiền trong hệ thống, xuất kỳ kế toán sang MISA",
    searchPlaceholder: "",
  },
  spending: {
    title: "Quản lý chi",
    subtitle: "Tạo phiếu chi, xác nhận chi tiền và đối chiếu chi phí tài xế, tổng hợp mọi khoản chi",
    searchPlaceholder: "",
  },
  "collect-on-behalf": {
    title: "Thu hộ (COD)",
    subtitle: "Tiền hàng công ty thu hộ khi giao — của người bán, không phải doanh thu. Trả lại rồi thì khoản nợ mới đóng.",
    searchPlaceholder: "",
  },
  reimbursement: {
    title: "Hoàn ứng tài xế",
    subtitle: "Trả lại ngay tiền tài xế đã ứng túi (chi hộ khách, xăng, sửa xe, bảo dưỡng) — không phải đợi kỳ lương",
    searchPlaceholder: "",
  },
  attendance: {
    title: "Chấm công tài xế",
    subtitle: "Theo dõi và điều chỉnh chấm công theo tháng — ảnh hưởng trực tiếp tới ngày công tính lương.",
    searchPlaceholder: "",
  },
  vehicles: {
    title: "Tra cứu xe",
    subtitle: "Xem phương tiện, tài xế được gán và trạng thái bảo trì. Việc quản lý xe do Manager thực hiện.",
    searchPlaceholder: "",
  },
};

const VIEW_STORAGE_KEY = "accountant_active_view";

// entity_type (backend gắn vào thông báo) → view của Kế toán.
const NOTIFICATION_VIEW_BY_ENTITY = {
  payroll: "salary",
  salary_advance: "advance",
  salary_advances: "advance",
  driver_bonuses: "bonus",
  bonus_rules: "bonus-rules",
  debts: "debt",
  debt_payments: "debt",
  partner: "debt",
  expenses: "spending",
  payment_vouchers: "spending",
  vehicle: "vehicles",
  vehicle_groups: "vehicles",
  maintenance_record: "vehicles",
  receipt: "revenue",
  receipt_requests: "revenue",
  bank_transfer: "bank-transfer",
  orders: "revenue",
  reports: "report",
};
const VALID_VIEWS = ["report", "revenue", "debt", "bank-transfer", "salary", "advance", "bonus", "bonus-rules", "ledger", "spending", "reimbursement", "collect-on-behalf", "attendance", "holidays", "vehicles"];

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

  // Bấm 1 thông báo → nhảy tới màn liên quan (theo entity_type).
  const handleNotificationSelect = (notification) => {
    const view = NOTIFICATION_VIEW_BY_ENTITY[notification?.entity_type];
    if (view) handleViewChange(view);
  };

  const meta = VIEW_META[activeView] ?? VIEW_META.revenue;

  const primaryAction = activeView === "revenue"
    ? { label: "Nhập đơn ngoài", onPress: () => setShowExternalModal(true) }
    : null;

  const secondaryAction = activeView === "revenue"
    ? { label: "Import Excel", onPress: () => setShowImportModal(true) }
    : null;

  const showSearch = activeView !== "report" && activeView !== "ledger" && activeView !== "spending"
    && activeView !== "reimbursement" && activeView !== "attendance" && activeView !== "vehicles"
    && activeView !== "collect-on-behalf";

  return (
    <HeroUIProvider>
      <div className="flex h-screen bg-gray-50 dark:bg-[#0e1016] overflow-hidden">
        <Sidebar
          navGroups={NAV_GROUPS}
          brandLabel={APP_NAME}
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
            onNotificationSelect={handleNotificationSelect}
          />

          {/* scrollbarGutter stable: luôn chừa chỗ cho thanh cuộn. Không chừa thì mỗi lần
              nội dung dài/ngắn qua mức tràn (mở dòng chi tiết, lọc, đổi trang) thanh cuộn
              hiện rồi mất, kéo cả trang dịch ngang vài px — nhìn như UI bị giật. */}
          <main className="flex-1 overflow-y-auto p-6" style={{ scrollbarGutter: "stable" }}>
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
            {activeView === "bank-transfer" && (
              <BankTransferView search={search} />
            )}
            {activeView === "ledger" && (
              <LedgerView />
            )}
            {activeView === "spending" && (
              <Suspense fallback={<div className="p-6 text-sm text-gray-500">Đang tải quản lý chi...</div>}>
                <SpendingView />
              </Suspense>
            )}
            {activeView === "reimbursement" && (
              <Suspense fallback={<div className="p-6 text-sm text-gray-500">Đang tải hoàn ứng tài xế...</div>}>
                <ReimbursementView />
              </Suspense>
            )}
            {activeView === "collect-on-behalf" && (
              <Suspense fallback={<div className="p-6 text-sm text-gray-500">Đang tải thu hộ...</div>}>
                <CollectOnBehalfView />
              </Suspense>
            )}
            {/* Quy tắc thưởng & ngày lễ do Manager cấu hình — kế toán chỉ tra cứu khi tính lương */}
            {activeView === "bonus-rules" && (
              <BonusRulesView readOnly />
            )}
            {activeView === "attendance" && (
              <AttendanceView />
            )}
            {activeView === "holidays" && (
              <HolidaysView readOnly />
            )}
            {activeView === "vehicles" && (
              <VehiclesView user={currentUser} />
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
