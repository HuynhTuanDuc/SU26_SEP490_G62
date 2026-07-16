import React from "react";
import { ConfigProvider } from "antd";
import viVN from "antd/locale/vi_VN";
import LoadingScreen from "../components/LoadingScreen";
import ForceChangePasswordScreen from "../components/ForceChangePasswordScreen";
import { useAuthSession } from "../hooks/useAuthSession";
import ManagerPage from "../pages/Manager/ManagerPage";
import AccountantPage from "../pages/Accountant/AccountantPage";
import CoordinatorPage from "../pages/Coordinator/CoordinatorPage";
import LoginPage from "../pages/auth/LoginPage";
import { appTheme } from "../styles/theme";
import "../styles/global.css";

export default function App() {
  const { user, loading, setSession, refreshSession, logout } = useAuthSession();

  const renderPage = () => {
    if (loading) return <LoadingScreen label="Đang tải..." />;
    if (!user) return <LoginPage onLoginSuccess={setSession} />;
    if (user.must_change_password) {
      return <ForceChangePasswordScreen user={user} onChanged={refreshSession} onLogout={logout} />;
    }
    if (user.role === "manager") return <ManagerPage user={user} onLogout={logout} />;
    if (user.role === "coordinator") return <CoordinatorPage user={user} onLogout={logout} />;
    if (user.role === "accountant") return <AccountantPage user={user} onLogout={logout} />;
    return <LoadingScreen label="Không có trang cho vai trò này." />;
  };

  return (
    <ConfigProvider theme={appTheme} locale={viVN}>
      {renderPage()}
    </ConfigProvider>
  );
}
