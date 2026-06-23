import React, { useState, useEffect } from "react";
import { apiRequest } from "../../services/apiClient";
import "../../styles/IncidentPage.css";
import { message } from "antd";
import AppSidebar from "../../components/layout/AppSidebar";
import AppHeader from "../../components/layout/AppHeader";
import IncidentModal, { StatusModal } from "../../features/coordinator/incidentModal";


export default function IncidentPage({ user, onLogout }) {
    const [incidents, setIncidents] = useState([]);
    const [drivers, setDrivers] = useState([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [loading, setLoading] = useState(true);

    // Modal state
    const [selectedIncident, setSelectedIncident] = useState(null);
    const [replacementDriverId, setReplacementDriverId] = useState("");
    const [incidentModalOpen, setIncidentModalOpen] = useState(false);
    const [isDispatching, setIsDispatching] = useState(false);
    const [statusModalOpen, setStatusModalOpen] = useState(false);
    const [newStatus, setNewStatus] = useState("");
    useEffect(() => {
        fetchIncidents();
        // fetchDrivers();
    }, []);

    //Tải danh sách sự cố từ API
    const fetchIncidents = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem("token");
            if (!token) {
                message.error("Vui lòng đăng nhập lại");
                return;
            }
            const res = await apiRequest("/api/incidents", { token });
            setIncidents(res.incidents || []);
        } catch (err) {
            console.error("Tải danh danh sự cố thất bại khi fetch", err);
        } finally {
            setLoading(false);
        }
    }

    // const fetchDrivers = async () => {
    //     try {
    //         const res = await apiRequest("/drivers");
    //         setDrivers(res.drivers || []);
    //     } catch (err) {
    //         console.error("Failed to fetch drivers", err);
    //     }
    // };
    const handleStatusModal = (incident) => {
        setSelectedIncident(incident);
        setNewStatus(incident.status);
        setStatusModalOpen(true);
    }

    const handleOpenDispatchModal = (incident) => {
        setSelectedIncident(incident);
        setReplacementDriverId("");
        setIsModalOpen(true);
    };
    const handleUpdateStatus = async () => {
        try {
            const token = localStorage.getItem("token");

            await apiRequest(
                `/api/incidents/${selectedIncident.id}/status`,
                {
                    method: "PATCH",
                    token,
                    body: {
                        status: newStatus
                    }
                }
            );

            message.success("Cập nhật trạng thái thành công");

            setStatusModalOpen(false);

            fetchIncidents();
        } catch (err) {
            message.error("Không thể cập nhật trạng thái: ", err);
        }
    };

    // const handleDispatch = async () => {
    //     if (!replacementDriverId) {
    //         message.warning("Vui lòng chọn tài xế thay thế");
    //         return;
    //     }

    //     const selectedDriver = drivers.find(d => String(d.profile_id) === String(replacementDriverId));
    //     if (!selectedDriver || !selectedDriver.vehicle_id) {
    //         message.error("Tài xế được chọn chưa được gán xe");
    //         return;
    //     }

    //     setIsDispatching(true);
    //     try {
    //         await apiRequest(`/incidents/${selectedIncident.id}/reassign`, {
    //             method: 'POST',
    //             body: {
    //                 replacementDriverId: selectedDriver.profile_id,
    //                 replacementVehicleId: selectedDriver.vehicle_id
    //             }
    //         });
    //         message.success("Điều phối xe thay thế thành công");
    //         setIsModalOpen(false);
    //         fetchIncidents(); // Refresh the list
    //     } catch (err) {
    //         message.error(err.message || "Lỗi khi điều phối");
    //     } finally {
    //         setIsDispatching(false);
    //     }
    // };
    const handleDispatch = async () => {
        if (!replacementDriverId) {
            message.warning("Vui lòng chọn tài xế thay thế");
            return;
        }

        const selectedDriver = drivers.find(d => String(d.profile_id) === String(replacementDriverId))
    }


    const filteredIncidents = incidents.filter(inc => {
        const query = searchQuery.toLowerCase();
        return (
            (inc.description || "").toLowerCase().includes(query) ||
            (inc.full_name || "").toLowerCase().includes(query) ||
            (inc.incident_type || "").toLowerCase().includes(query)
        );
    });

    // const openCount = incidents.filter(i => i.status === 'open' || i.status === 'investigating').length;

    // const formatType = (type) => {
    //     const map = {
    //         vehicle_breakdown: 'Sự cố xe',
    //         cargo_damage: 'Hàng hóa bị hỏng',
    //         road_incident: 'Đường sá / giao thông',
    //         customer_refusal: 'Khách từ chối nhận',
    //         traffic_jam: 'Tắc đường',
    //         other: 'Khác'
    //     };
    //     return map[type] || type;
    // };

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
    }

    return (

        //     {isModalOpen && (
        //         <div className="modal-overlay">
        //             <div className="modal-content">
        //                 <h2>Điều phối xe thay thế</h2>
        //                 <p className="modal-desc">
        //                     Chọn tài xế và xe thay thế cho chuyến #{selectedIncident?.shipment_id} (Tài xế cũ: {selectedIncident?.full_name})
        //                 </p>

        //                 <div className="form-group">
        //                     <label>Chọn tài xế thay thế</label>
        //                     <select 
        //                         value={replacementDriverId}
        //                         onChange={(e) => setReplacementDriverId(e.target.value)}
        //                         className="driver-select"
        //                     >
        //                         <option value="">-- Chọn tài xế --</option>
        //                         {drivers.filter(d => String(d.profile_id) !== String(selectedIncident?.reported_by) && d.vehicle_id).map(d => (
        //                             <option key={d.profile_id} value={d.profile_id}>
        //                                 {d.full_name} - Xe {d.plate_number || d.vehicle_id}
        //                             </option>
        //                         ))}
        //                     </select>
        //                 </div>

        //                 <div className="modal-actions">
        //                     <button className="btn-cancel" onClick={() => setIsModalOpen(false)}>Hủy</button>
        //                     <button 
        //                         className="btn-confirm" 
        //                         onClick={handleDispatch}
        //                         disabled={isDispatching || !replacementDriverId}
        //                     >
        //                         {isDispatching ? "Đang xử lý..." : "Xác nhận điều phối"}
        //                     </button>
        //                 </div>
        //             </div>
        //         </div>
        //     )}
        // </main>

        <main className="content incident-page">
            <IncidentModal
                open={incidentModalOpen}
                onClose={() => setIncidentModalOpen(false)}
            />
            <StatusModal
                open={statusModalOpen}
                newStatus={newStatus}
                setNewStatus={setNewStatus}
                handleUpdateStatus={handleUpdateStatus}
                setStatusModalOpen={setStatusModalOpen}
            />

            <section className="hero">
                <div className="search-box">
                    <span className="search-icon">⌕</span>

                </div>
            </section>
            <header className="incident-topbar">
                <h1>Danh sách sự cố khẩn cấp</h1>

            </header>
            <div className="incident-stats-row">

            </div>
            <div className="incident-main-content">
                <div className="list-card full-width">
                    <div className="card-title">
                        Danh sách chi tiết
                    </div>

                    {loading ? (
                        <div className="">Đang tải dữ liệu ... </div>
                    ) : (
                        <table className="incident-table">
                            <thead>
                                <tr>
                                    <th>Chuyến</th>
                                    <th>Lái xe hiện tại</th>
                                    <th>Loại sự cố</th>
                                    <th>Mô tả</th>
                                    <th>Vị trí</th>
                                    <th>Trạng thái</th>
                                    <th>Thao tác</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredIncidents.length === 0 ? (
                                    <tr>Không có sự cố nào hiện tại</tr>
                                ) : filteredIncidents.map((inc) => (
                                    <tr key={inc.id}>
                                        <td>
                                            <div>
                                                <span>#{inc.shipment_id}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <div>
                                                <div className="driver-avatar">
                                                    {(inc.full_name || "?").charAt(0).toUpperCase()}
                                                </div>
                                                <span>{inc.full_name || "N/A"}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <div className={`incident-type-badge ${inc.severity_level === 'high' || inc.severity_level === 'critical' ? 'type-servere' : 'type-warning'}`}>
                                                {formatType(inc.incident_type)}
                                            </div>
                                        </td>
                                        <td>
                                            {inc.description}
                                        </td>
                                        <td>
                                            <div>
                                                {inc.location && <small>{inc.location}</small>}
                                            </div>
                                        </td>
                                        <td>
                                            <div>
                                                <span>{inc.status === 'resolved' || inc.status === 'closed' ? 'Đã giải quyết' : 'Đang chờ xử lý'}</span>
                                            </div>
                                        </td>
                                        <td>
                                            {(inc.status === 'open' || inc.status === 'investigating') && (
                                                <div>
                                                    <button
                                                        className="btn-dispatch"
                                                        onClick={() => handleOpenDispatchModal(inc)}
                                                    >
                                                        Điều phối xe thay thế
                                                    </button>
                                                    <button
                                                        className="btn-resolve"
                                                        onClick={() => handleStatusModal(inc)}
                                                    >
                                                        Cập nhật trạng thái
                                                    </button>
                                                </div>
                                            )
                                            }
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )
                    }
                </div>
            </div>
        </main>
    );
}