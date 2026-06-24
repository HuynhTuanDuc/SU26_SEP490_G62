import React, { useState } from "react";
import AppHeader from "../../components/layout/AppHeader";
import AppSidebar from "../../components/layout/AppSidebar";
import OrdersPage from "./OrdersPage";
import IncidentPage from "./IncidentPage";
import "../../styles/Coordinator.css";

export default function Coordinator({ user, onLogout }) {
    const [page, setPage] = useState("orders");
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    return (


        <div className={`coordinator-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
            <AppSidebar
                user={user}
                activeTab={page}
                onTabChange={setPage}
                collapsed={sidebarCollapsed}
                onCollapse={setSidebarCollapsed}
            />

            <div className="main-area">
                <AppHeader
                    user={user}
                    onLogout={onLogout}
                />
                {page === "incidents" && <IncidentPage />}
                {page === "orders" && <OrdersPage />}
            </div>

        </div>
    );
}
