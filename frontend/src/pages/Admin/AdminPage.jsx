import React, { useState } from "react";
import { Typography } from "antd";
import AppHeader from "../../components/layout/AppHeader";
import AppSidebar from "../../components/layout/AppSidebar";
import UserList from "../../features/admin/UserList";
import VehicleList from "../../features/admin/VehicleList";
import ManagerDashboard from "../../features/manager/ManagerDashboard";
import PartnerManagement from "../../features/manager/PartnerManagement";
import ManagerPayrollPage from "../../features/manager/ManagerPayrollPage";
import ManagerBonusPage from "../../features/manager/ManagerBonusPage";
import HolidayManagement from "../../features/manager/HolidayManagement";
import { C } from "../../styles/theme";
import "../../styles/admin/Admin.css";
import { saveSession } from "../../services/storage";

const { Title, Text } = Typography;

export default function AdminPage({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState("partners");
  const [collapsed, setCollapsed] = useState(false);
  const [currentUser, setCurrentUser] = useState(user);

  const handleProfileUpdated = (nextProfile) => {
    const mergedUser = { ...currentUser, ...nextProfile };
    setCurrentUser(mergedUser);
    saveSession({ user: mergedUser });
  };

  const handleLogout = () => {
    onLogout?.();
  };

  const pageTitleMap = {
    partners:  "Quản lý đối tác",
    dashboard: "Tổng quan manager",
    users:     "Quản lý người dùng",
    vehicles:  "Quản lý xe",
    payroll:   "Duyệt lương tài xế",
    bonus:     "Thưởng & Phúc lợi",
    holidays:  "Quản lý ngày lễ",
  };

  const pageSubtitleMap = {
    partners:  "Quản lý thông tin đối tác và theo dõi công nợ nếu đối tác đang tồn đọng thanh toán.",
    dashboard: "Theo dõi phê duyệt, công nợ, phiếu thu và thông tin công ty trên cùng một luồng vận hành.",
    users:     "Quản lý tài khoản, vai trò và trạng thái truy cập.",
    vehicles:  "Theo dõi phương tiện, tài xế được gán và trạng thái bảo trì.",
    payroll:   "Xác nhận bảng lương tài xế trước khi kế toán chi trả.",
    bonus:     "Duyệt thưởng Tết, phúc lợi kết hôn/tang gia/sinh nhật và thưởng đặc biệt.",
    holidays:  "Danh mục ngày lễ hưởng nguyên lương — tài xế đi làm ngày lễ được tính 200% lương.",
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", background: C.surface }}>
      <AppSidebar
        user={currentUser}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        collapsed={collapsed}
        onCollapse={setCollapsed}
      />

      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <AppHeader user={currentUser} onLogout={handleLogout} onProfileUpdated={handleProfileUpdated} />

        <section style={{ padding: 24, flex: 1, overflow: "auto" }}>
          <div style={{ marginBottom: 20 }}>
            <Title level={3} style={{ margin: 0, color: C.onSurface }}>
              {pageTitleMap[activeTab] || "Trang chủ"}
            </Title>
            <Text style={{ color: C.onSurfaceVariant }}>
              {pageSubtitleMap[activeTab] || "Chọn một chức năng từ thanh điều hướng."}
            </Text>
          </div>

          {activeTab === "partners"  && <PartnerManagement user={currentUser} />}
          {activeTab === "dashboard" && <ManagerDashboard  user={currentUser} />}
          {activeTab === "users"     && <UserList           user={currentUser} />}
          {activeTab === "vehicles"  && <VehicleList        user={currentUser} />}
          {activeTab === "payroll"   && <ManagerPayrollPage />}
          {activeTab === "bonus"     && <ManagerBonusPage   />}
          {activeTab === "holidays"  && <HolidayManagement  />}
        </section>
      </main>
    </div>
  );
}
