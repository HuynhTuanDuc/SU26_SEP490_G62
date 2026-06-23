import React, { useState, useEffect } from "react";
import { apiRequest, apiBaseUrl } from "../../services/apiClient";
import "../../styles/IncidentPage.css";
import { message } from "antd";
import { StatusModal } from "../../features/coordinator/incidentModal";

export default function IncidentPage({ user, onLogout }) {
    const [incidents, setIncidents] = useState([]);
    const [drivers, setDrivers] = useState([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [loading, setLoading] = useState(true);

    // Pagination state
    const [page, setPage] = useState(1);
    const [limit] = useState(10);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);

    // Filter state
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");

    // Modal state for dispatching replacement vehicle
    const [selectedIncident, setSelectedIncident] = useState(null);
    const [replacementDriverId, setReplacementDriverId] = useState("");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isDispatching, setIsDispatching] = useState(false);

    // Modal state for updating incident status
    const [statusModalOpen, setStatusModalOpen] = useState(false);
    const [newStatus, setNewStatus] = useState("");
    const [resolutionNote, setResolutionNote] = useState("");

    useEffect(() => {
        fetchIncidents();
    }, [page, fromDate, toDate]); // Re-fetch when pagination or dates change

    useEffect(() => {
        fetchDrivers();
    }, []);

    // Fetch all incidents from the backend with pagination and filters
    const fetchIncidents = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem("token");
            if (!token) {
                message.error("Vui lòng đăng nhập lại");
                return;
            }

            // Build query parameters
            let query = `?page=${page}&limit=${limit}`;
            if (fromDate) query += `&fromDate=${fromDate}`;
            if (toDate) query += `&toDate=${toDate}`;

            const res = await apiRequest(`/api/incidents${query}`, { token });
            setIncidents(res.incidents || []);
            if (res.pagination) {
                setTotalPages(res.pagination.totalPages || 1);
                setTotalItems(res.pagination.total || 0);
            }
        } catch (err) {
            console.error("Tải danh sách sự cố thất bại", err);
        } finally {
            setLoading(false);
        }
    };

    // Fetch available drivers to assign replacement vehicles
    const fetchDrivers = async () => {
        try {
            const token = localStorage.getItem("token");
            const res = await apiRequest("/api/drivers", { token });
            let fetchedDrivers = res.drivers || [];
            
            // Validate and format drivers
            // Sort drivers by BKS (Biển Kiểm Soát / plate_number) as requested
            fetchedDrivers.sort((a, b) => {
                const plateA = a.plate_number || "";
                const plateB = b.plate_number || "";
                return plateA.localeCompare(plateB);
            });
            
            setDrivers(fetchedDrivers);
        } catch (err) {
            console.error("Failed to fetch drivers", err);
        }
    };

    // Open status update modal
    const handleStatusModal = (incident) => {
        setSelectedIncident(incident);
        setNewStatus(incident.status);
        // Reset resolution note or load existing one if available
        setResolutionNote(incident.resolution_note || ""); 
        setStatusModalOpen(true);
    };

    // Open dispatch replacement modal
    const handleOpenDispatchModal = (incident) => {
        setSelectedIncident(incident);
        setReplacementDriverId("");
        setIsModalOpen(true);
    };

    // Submit status update
    const handleUpdateStatus = async () => {
        try {
            const token = localStorage.getItem("token");
            await apiRequest(
                `/api/incidents/${selectedIncident.id}/status`,
                {
                    method: "PATCH",
                    token,
                    body: {
                        status: newStatus,
                        resolution: resolutionNote // Gửi resolution_note
                    }
                }
            );

            message.success("Cập nhật trạng thái thành công");
            setStatusModalOpen(false);
            fetchIncidents();
        } catch (err) {
            message.error("Không thể cập nhật trạng thái: " + err.message);
        }
    };

    // Submit dispatch reassignment
    const handleDispatch = async () => {
        // Validation for selecting a driver
        if (!replacementDriverId) {
            message.warning("Vui lòng chọn tài xế và xe thay thế (BKS).");
            return;
        }

        const selectedDriver = drivers.find(d => String(d.id) === String(replacementDriverId));
        // Validation to ensure driver actually has a vehicle assigned
        if (!selectedDriver || !selectedDriver.vehicle_id) {
            message.error("Tài xế được chọn hiện chưa có xe được gán. Vui lòng chọn tài xế khác.");
            return;
        }

        setIsDispatching(true);
        try {
            const token = localStorage.getItem("token");
            await apiRequest(`/api/incidents/${selectedIncident.id}/reassign`, {
                method: 'POST',
                token,
                body: {
                    replacementDriverId: selectedDriver.id,
                    replacementVehicleId: selectedDriver.vehicle_id
                }
            });
            message.success("Điều phối xe thay thế thành công");
            setIsModalOpen(false);
            fetchIncidents(); // Refresh the list after successful dispatch
        } catch (err) {
            message.error(err.message || "Lỗi khi điều phối xe");
        } finally {
            setIsDispatching(false);
        }
    };

    // Logic to resolve avatar URL correctly based on backend path
    const getAvatarSrc = (url) => {
        if (!url) return null;
        if (/^https?:\/\//i.test(url)) return url;
        return `${apiBaseUrl}${url}`;
    };

    // Filter incidents based on search query (frontend search for description/type)
    const filteredIncidents = incidents.filter(inc => {
        const query = searchQuery.toLowerCase();
        return (
            (inc.description || "").toLowerCase().includes(query) ||
            (inc.full_name || "").toLowerCase().includes(query) ||
            (inc.incident_type || "").toLowerCase().includes(query)
        );
    });

    const openCount = incidents.filter(i => i.status === 'open' || i.status === 'investigating').length;

    // Format incident type for display
    const formatType = (type) => {
        const map = {
            vehicle_breakdown: 'Sự cố xe',
            cargo_damage: 'Hàng hóa bị hỏng',
            road_incident: 'Tai nạn',
            customer_refusal: 'Khách từ chối nhận',
            traffic_jam: 'Tắc đường',
            other: 'Khác'
        };
        return map[type] || type;
    };

    return (
        <main className="content incident-page">
            <StatusModal
                open={statusModalOpen}
                newStatus={newStatus}
                setNewStatus={setNewStatus}
                resolutionNote={resolutionNote}
                setResolutionNote={setResolutionNote}
                handleUpdateStatus={handleUpdateStatus}
                setStatusModalOpen={setStatusModalOpen}
            />

            <header className="incident-topbar" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h1 className="incident-title" style={{ margin: 0 }}>Danh Sách Sự Cố Khẩn Cấp</h1>
                    <div className="incident-topbar-actions" style={{ display: 'flex', gap: '16px' }}>
                        <div className="incident-search">
                            <span className="search-icon">⌕</span>
                            <input
                                type="text"
                                placeholder="Tìm kiếm nhanh..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>
                </div>
                
                {/* Lọc theo ngày như OrderPage */}
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center', background: 'white', padding: '16px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <label style={{ fontSize: '14px', fontWeight: '500', color: '#4b5563' }}>Từ ngày:</label>
                        <input 
                            type="date" 
                            value={fromDate}
                            onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
                            style={{ padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                        />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <label style={{ fontSize: '14px', fontWeight: '500', color: '#4b5563' }}>Đến ngày:</label>
                        <input 
                            type="date" 
                            value={toDate}
                            onChange={(e) => { setToDate(e.target.value); setPage(1); }}
                            style={{ padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                        />
                    </div>
                    {(fromDate || toDate) && (
                        <button 
                            onClick={() => { setFromDate(""); setToDate(""); setPage(1); }}
                            className="btn-secondary"
                            style={{ padding: '6px 12px' }}
                        >
                            Xóa bộ lọc
                        </button>
                    )}
                </div>
            </header>

            <div className="incident-stats-row">
                <div className="incident-stats-left">
                    <div className="stat-card alert">
                        <div className="stat-icon">⚠️</div>
                        <div className="stat-info">
                            <span>Tổng sự cố hiện tại</span>
                            <strong>{totalItems}</strong>
                        </div>
                    </div>
                    <div className="stat-card warning">
                        <div className="stat-icon">🚧</div>
                        <div className="stat-info">
                            <span>Đang chờ / Đang xử lý</span>
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
                        <div className="text-center" style={{ padding: '2rem', color: '#6b7280' }}>Đang tải dữ liệu...</div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table className="incident-table">
                                <thead>
                                    <tr>
                                        <th>CHUYẾN ĐI</th>
                                        <th>TÀI XẾ HIỆN TẠI</th>
                                        <th>LOẠI SỰ CỐ</th>
                                        <th>VỊ TRÍ</th>
                                        <th>MÔ TẢ</th>
                                        <th>GHI CHÚ GIẢI QUYẾT</th>
                                        <th>TRẠNG THÁI</th>
                                        <th>THAO TÁC</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredIncidents.length === 0 ? (
                                        <tr>
                                            <td colSpan="8" style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>Không có sự cố nào</td>
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
                                                    {inc.avatar_url ? (
                                                        <img 
                                                            src={getAvatarSrc(inc.avatar_url)} 
                                                            alt={inc.full_name} 
                                                            style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }}
                                                        />
                                                    ) : (
                                                        <div className="driver-avatar">
                                                            {(inc.full_name || "?").charAt(0).toUpperCase()}
                                                        </div>
                                                    )}
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
                                                    {inc.location ? <small>📍 {inc.location}</small> : 'N/A'}
                                                </div>
                                            </td>
                                            <td>
                                                {inc.description}
                                            </td>
                                            <td>
                                                {inc.resolution_note || "-"}
                                            </td>
                                            <td>
                                                <div className="location-info">
                                                    <span>{inc.status === 'resolved' || inc.status === 'closed' ? 'Đã giải quyết' : 'Đang chờ xử lý'}</span>
                                                </div>
                                            </td>
                                            <td>
                                                {(inc.status === 'open' || inc.status === 'investigating') && (
                                                    <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
                                                        <button 
                                                            className="btn-dispatch"
                                                            onClick={() => handleOpenDispatchModal(inc)}
                                                        >
                                                            Điều phối xe thay thế
                                                        </button>
                                                        <button
                                                            className="btn-secondary"
                                                            onClick={() => handleStatusModal(inc)}
                                                        >
                                                            Cập nhật trạng thái
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            
                            {/* Pagination Controls */}
                            {totalPages > 1 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderTop: '1px solid #e5e7eb', marginTop: '16px' }}>
                                    <div style={{ fontSize: '14px', color: '#6b7280' }}>
                                        Hiển thị trang {page} / {totalPages} (Tổng {totalItems} sự cố)
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button 
                                            className="btn-secondary"
                                            disabled={page <= 1}
                                            onClick={() => setPage(p => Math.max(1, p - 1))}
                                        >
                                            Trước
                                        </button>
                                        <button 
                                            className="btn-secondary"
                                            disabled={page >= totalPages}
                                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                        >
                                            Tiếp
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Modal for Reassigning Vehicle (Điều phối xe thay thế) */}
            {isModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h2>Điều phối xe thay thế</h2>
                        <p className="modal-desc">
                            Chọn xe theo <strong>BKS</strong> cho chuyến #{selectedIncident?.shipment_id} 
                            (Tài xế cũ: {selectedIncident?.full_name})
                        </p>
                        
                        <div className="form-group">
                            <label>Chọn xe (Biển kiểm soát)</label>
                            <select 
                                value={replacementDriverId}
                                onChange={(e) => setReplacementDriverId(e.target.value)}
                                className="driver-select"
                            >
                                <option value="">-- Chọn BKS (Xe) --</option>
                                {drivers
                                    .filter(d => String(d.id) !== String(selectedIncident?.reported_by) && d.vehicle_id)
                                    .map(d => (
                                        <option key={d.id} value={d.id}>
                                            BKS: {d.plate_number || "Không có BKS"} - Tài xế: {d.full_name} 
                                        </option>
                                    ))
                                }
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