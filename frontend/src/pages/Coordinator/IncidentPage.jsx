import React, { useState, useEffect } from "react";
import { apiRequest } from "../../services/apiClient";
import "../../styles/IncidentPage.css";
import { message } from "antd";

export default function IncidentPage({ user, onLogout }) {
    const [incidents, setIncidents] = useState([]);
    const [drivers, setDrivers] = useState([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [loading, setLoading] = useState(true);

    // Modal state
    const [selectedIncident, setSelectedIncident] = useState(null);
    const [replacementDriverId, setReplacementDriverId] = useState("");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isDispatching, setIsDispatching] = useState(false);

    useEffect(() => {
        fetchIncidents();
        fetchDrivers();
    }, []);

    const fetchIncidents = async () => {
        setLoading(true);
        try {
            const res = await apiRequest("/incidents");
            setIncidents(res.incidents || []);
        } catch (err) {
            console.error("Failed to fetch incidents", err);
        } finally {
            setLoading(false);
        }
    };

    const fetchDrivers = async () => {
        try {
            const res = await apiRequest("/drivers");
            setDrivers(res.drivers || []);
        } catch (err) {
            console.error("Failed to fetch drivers", err);
        }
    };

    const handleOpenDispatchModal = (incident) => {
        setSelectedIncident(incident);
        setReplacementDriverId("");
        setIsModalOpen(true);
    };

    const handleDispatch = async () => {
        if (!replacementDriverId) {
            message.warning("Vui lòng chọn tài xế thay thế");
            return;
        }

        const selectedDriver = drivers.find(d => String(d.profile_id) === String(replacementDriverId));
        if (!selectedDriver || !selectedDriver.vehicle_id) {
            message.error("Tài xế được chọn chưa được gán xe");
            return;
        }

        setIsDispatching(true);
        try {
            await apiRequest(`/incidents/${selectedIncident.id}/reassign`, {
                method: 'POST',
                body: {
                    replacementDriverId: selectedDriver.profile_id,
                    replacementVehicleId: selectedDriver.vehicle_id
                }
            });
            message.success("Điều phối xe thay thế thành công");
            setIsModalOpen(false);
            fetchIncidents(); // Refresh the list
        } catch (err) {
            message.error(err.message || "Lỗi khi điều phối");
        } finally {
            setIsDispatching(false);
        }
    };

    const filteredIncidents = incidents.filter(inc => {
        const query = searchQuery.toLowerCase();
        return (
            (inc.description || "").toLowerCase().includes(query) ||
            (inc.full_name || "").toLowerCase().includes(query) ||
            (inc.incident_type || "").toLowerCase().includes(query)
        );
    });

    const openCount = incidents.filter(i => i.status === 'open' || i.status === 'investigating').length;

    const formatType = (type) => {
        const map = {
            vehicle_breakdown: 'Sự cố xe',
            cargo_damage: 'Hàng hóa bị hỏng',
            road_incident: 'Đường sá / giao thông',
            customer_refusal: 'Khách từ chối nhận',
            traffic_jam: 'Tắc đường',
            other: 'Khác'
        };
        return map[type] || type;
    };

    return (
        <main className="content incident-page">
            <header className="incident-topbar">
                <h1 className="incident-title">Danh Sách Sự Cố Khẩn Cấp</h1>
                <div className="incident-topbar-actions">
                    <div className="incident-search">
                        <span className="search-icon">⌕</span>
                        <input
                            type="text"
                            placeholder="Tìm kiếm..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <button className="btn-icon">🔔</button>
                    <button className="btn-icon">❔</button>
                    <button className="emergency-btn">
                        🛡️ Emergency Protocol
                    </button>
                </div>
            </header>

            <div className="incident-stats-row">
                <div className="incident-stats-left">
                    <div className="stat-card alert">
                        <div className="stat-icon">⚠️</div>
                        <div className="stat-info">
                            <span>Tổng sự cố</span>
                            <strong>{incidents.length}</strong>
                        </div>
                    </div>
                    <div className="stat-card warning">
                        <div className="stat-icon">🚧</div>
                        <div className="stat-info">
                            <span>Đang xử lý</span>
                            <strong>{openCount}</strong>
                        </div>
                    </div>
                </div>
            </div>

            <div className="incident-main-content">
                <div className="list-card full-width">
                    <div className="card-header">
                        <div className="card-title">Danh sách chi tiết</div>
                        <div className="live-badge">LIVE UPDATE</div>
                    </div>
                    
                    {loading ? (
                        <div className="p-8 text-center text-gray-500">Đang tải dữ liệu...</div>
                    ) : (
                        <table className="incident-table">
                            <thead>
                                <tr>
                                    <th>CHUYẾN ĐI</th>
                                    <th>TÀI XẾ HIỆN TẠI</th>
                                    <th>LOẠI SỰ CỐ</th>
                                    <th>TRẠNG THÁI</th>
                                    <th>THAO TÁC</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredIncidents.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" className="text-center p-8 text-gray-500">Không có sự cố nào</td>
                                    </tr>
                                ) : filteredIncidents.map((inc) => (
                                    <tr key={inc.id}>
                                        <td>
                                            <div className="location-info">
                                                <span>Chuyến #{inc.shipment_id || "N/A"}</span>
                                                <small>{new Date(inc.created_at).toLocaleString()}</small>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="driver-info">
                                                <div className="driver-avatar">
                                                    {(inc.full_name || "?").charAt(0).toUpperCase()}
                                                </div>
                                                <span>{inc.full_name || "N/A"}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <div className={`incident-type-badge ${inc.severity_level === 'high' || inc.severity_level === 'critical' ? 'type-severe' : 'type-warning'}`}>
                                                {formatType(inc.incident_type)}
                                            </div>
                                        </td>
                                        <td>
                                            <div className="location-info">
                                                <span>{inc.status === 'resolved' || inc.status === 'closed' ? 'Đã giải quyết' : 'Đang chờ xử lý'}</span>
                                                {inc.location && <small>📍 {inc.location}</small>}
                                            </div>
                                        </td>
                                        <td>
                                            {(inc.status === 'open' || inc.status === 'investigating') && (
                                                <button 
                                                    className="btn-dispatch"
                                                    onClick={() => handleOpenDispatchModal(inc)}
                                                >
                                                    Điều phối xe thay thế
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {isModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h2>Điều phối xe thay thế</h2>
                        <p className="modal-desc">
                            Chọn tài xế và xe thay thế cho chuyến #{selectedIncident?.shipment_id} (Tài xế cũ: {selectedIncident?.full_name})
                        </p>
                        
                        <div className="form-group">
                            <label>Chọn tài xế thay thế</label>
                            <select 
                                value={replacementDriverId}
                                onChange={(e) => setReplacementDriverId(e.target.value)}
                                className="driver-select"
                            >
                                <option value="">-- Chọn tài xế --</option>
                                {drivers.filter(d => String(d.profile_id) !== String(selectedIncident?.reported_by) && d.vehicle_id).map(d => (
                                    <option key={d.profile_id} value={d.profile_id}>
                                        {d.full_name} - Xe {d.plate_number || d.vehicle_id}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="modal-actions">
                            <button className="btn-cancel" onClick={() => setIsModalOpen(false)}>Hủy</button>
                            <button 
                                className="btn-confirm" 
                                onClick={handleDispatch}
                                disabled={isDispatching || !replacementDriverId}
                            >
                                {isDispatching ? "Đang xử lý..." : "Xác nhận điều phối"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}