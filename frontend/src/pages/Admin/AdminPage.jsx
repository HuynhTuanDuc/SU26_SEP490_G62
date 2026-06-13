import React, { useState } from "react";
import { Typography } from "antd";
import AppHeader from "../../components/layout/AppHeader";
import AppSidebar from "../../components/layout/AppSidebar";
import UserList from "../../features/admin/UserList";
import VehicleList from "../../features/admin/VehicleList";
import { C } from "../../styles/theme";
import "../../styles/admin/Admin.css";

const { Title, Text } = Typography;

export default function AdminPage({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState("users");
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
      return;
    }

    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.reload();
  };

  const pageTitleMap = {
    users: "Quan ly nguoi dung",
    vehicles: "Quan ly xe",
  };

  const pageSubtitleMap = {
    users: "Quan ly tai khoan, vai tro va trang thai truy cap.",
    vehicles: "Theo doi phuong tien, tai xe duoc gan va trang thai bao tri.",
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", background: C.surface }}>
      <AppSidebar
        user={user}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        collapsed={collapsed}
        onCollapse={setCollapsed}
      />

      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <AppHeader user={user} onLogout={handleLogout} />

        <section style={{ padding: 24, flex: 1, overflow: "auto" }}>
          <div style={{ marginBottom: 20 }}>
            <Title level={3} style={{ margin: 0, color: C.onSurface }}>
              {pageTitleMap[activeTab] || "Trang chu"}
            </Title>
            <Text style={{ color: C.onSurfaceVariant }}>
              {pageSubtitleMap[activeTab] || "Chon mot chuc nang tu thanh dieu huong."}
            </Text>
          </div>

          {activeTab === "users" && <UserList />}
          {activeTab === "vehicles" && <VehicleList />}
        </section>
      </main>
    </div>
  );
}
