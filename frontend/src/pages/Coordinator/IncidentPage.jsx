    import AppSidebar from "../../components/layout/AppSidebar";
    import { useState, useEffect } from "react";
    import { apiRequest } from "../../services/apiClient";
    import OrdersPage from "./OrdersPage";
    export default function IncidentPage({ user, onLogout }) {
        const [incidents, setIncidents] = useState([]);
        const [page, setPage] = useState(incidents);
        const [sideBarCollapsed, setSideBarCollapsed] = useState(false);

        <div className={`coordinator-shell ${sideBarCollapsed ? "sidebar-collapsed" : ""}`}>
            <AppSidebar
                user={user}
                activeTab={page}
                onTabChange={setPage}
                collapsed={sideBarCollapsed}
                onCollapse={setSideBarCollapsed}
            />
            {page === "orders" && <OrdersPage />}
            
        </div>
        return (

            <div className="flex h-screen">



                <div className="flex-1 p-6">
                    <h1 className="text-2xl font-bold mb-4">Incidents</h1>
                </div>
            </div>
        );
    }