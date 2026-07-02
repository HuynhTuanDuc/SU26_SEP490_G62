import { useDeferredValue, useEffect, useState } from "react";
import { Button, Table, message } from "antd";
import { EyeOutlined } from "@ant-design/icons";
import { apiRequest } from "../../services/apiClient";
import IncidentDetailModal from "./components/IncidentDetailModal";
import StatusTag from "./components/StatusTag";

export default function IncidentsPage({ search, refreshKey, onIncidentResolved }) {
  const [incidents, setIncidents] = useState([]);
  const [incidentsLoading, setIncidentsLoading] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [drivers, setDrivers] = useState([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [form, setForm] = useState({ status: "investigating", resolution: "", replacement_driver_id: "" });

  const deferredSearch = useDeferredValue(search);

  const loadIncidents = async (page = pagination.page) => {
    setIncidentsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pagination.limit),
      });
      if (deferredSearch.trim()) params.set("search", deferredSearch.trim());
      const queryString = params.toString();
      const data = await apiRequest(`/api/coordinator/incidents${queryString ? `?${queryString}` : ""}`);
      setIncidents(data.incidents || []);
      if (data.pagination) {
        setIncidentPaginationSafe(data.pagination);
      } else {
        setIncidentPaginationSafe({ page, limit: pagination.limit, total: data.incidents?.length || 0, totalPages: 1 });
      }
    } catch (error) {
      message.error(error.message || "Không thể tải danh sách sự cố.");
    } finally {
      setIncidentsLoading(false);
    }
  };

  const setIncidentPaginationSafe = (next) => setPagination(next);

  useEffect(() => {
    loadIncidents(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deferredSearch, refreshKey]);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiRequest("/api/drivers");
        setDrivers(data.drivers || []);
      } catch {
        message.error("Không thể tải danh sách tài xế.");
      }
    })();
  }, []);

  const closeModal = () => {
    setModalOpen(false);
    setSelectedIncident(null);
    setForm({ status: "investigating", resolution: "", replacement_driver_id: "" });
  };

  const openModal = (incident) => {
    setSelectedIncident(incident);
    setForm({
      status: incident.status === "open" ? "investigating" : incident.status || "investigating",
      resolution: "",
      replacement_driver_id: incident.replacement_driver_id ? String(incident.replacement_driver_id) : "",
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!selectedIncident) return;
    setSaving(true);
    try {
      await apiRequest(`/api/incidents/${selectedIncident.id}/status`, {
        method: "PATCH",
        body: {
          status: form.status,
          resolution: form.resolution || null,
          replacementDriverId: form.replacement_driver_id ? Number(form.replacement_driver_id) : null,
        },
      });
      message.success("Cập nhật sự cố thành công.");
      closeModal();
      loadIncidents();
      onIncidentResolved?.();
    } catch (error) {
      message.error(error.message || "Không thể cập nhật sự cố.");
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      title: "Sự cố",
      key: "incident",
      render: (_, incident) => (
        <div style={{ display: "grid", gap: 4 }}>
          <strong>#{incident.id}</strong>
          <span>{incident.incident_type}</span>
        </div>
      ),
    },
    { title: "Chuyến", dataIndex: "shipment_id", key: "shipment_id", render: (value) => (value ? `#${value}` : "-") },
    { title: "Tài xế báo cáo", dataIndex: "reported_by_name", key: "reported_by_name", render: (value) => value || "-" },
    { title: "Tài xế hiện tại", dataIndex: "current_driver_name", key: "current_driver_name", render: (value) => value || "-" },
    {
      title: "Trạng thái chuyến",
      dataIndex: "shipment_status",
      key: "shipment_status",
      render: (value) => <StatusTag status={value} />,
    },
    { title: "Mốc lấy hàng", dataIndex: "pickup_completed", key: "pickup_completed", render: (value) => (value ? "Đã lấy hàng" : "Chưa lấy hàng") },
    { title: "Quy tắc doanh thu", dataIndex: "pickup_completed", key: "revenue_rule", render: (value) => (value ? "Chia 50/50" : "Tài xế thay thế nhận 100%") },
    {
      title: "Trạng thái sự cố",
      dataIndex: "status",
      key: "status",
      render: (value) => <StatusTag status={value} />,
    },
    {
      title: "Thao tác",
      key: "actions",
      render: (_, incident) => (
        <Button
          className="coordinator-table-icon-btn"
          type="text"
          icon={<EyeOutlined />}
          disabled={incident.status === "closed" || incident.status === "resolved"}
          onClick={() => openModal(incident)}
        >
          Xử lý
        </Button>
      ),
    },
  ];

  return (
    <>
      <section className="hero hero-compact">
        <div>
          <h1>Xử lý sự cố</h1>
          <p>Theo dõi sự cố đang mở, chọn tài xế thay thế và áp dụng quy tắc chia doanh thu theo mốc lấy hàng.</p>
        </div>
        <div className="hero-metrics">
          <div className="upload-hint">{incidentsLoading ? "Đang tải..." : `${incidents.length} sự cố`}</div>
          <div className="upload-hint">{incidents.filter((item) => item.status === "open").length} mới tiếp nhận</div>
          <div className="upload-hint">{incidents.filter((item) => item.pickup_completed).length} đã lấy hàng</div>
        </div>
      </section>

      <section className="orders-panel">
        <div className="panel-head">
          <div>
            <h2>Danh sách sự cố</h2>
            <p>Nếu chưa lấy hàng, doanh thu thuộc về tài xế thay thế. Nếu đã lấy hàng, doanh thu chia 50/50.</p>
          </div>
        </div>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={incidents}
          loading={incidentsLoading}
          pagination={{
            current: pagination.page,
            pageSize: pagination.limit,
            total: pagination.total,
            showSizeChanger: false,
            onChange: (page) => loadIncidents(page),
          }}
          locale={{ emptyText: "Không có sự cố nào phù hợp." }}
          scroll={{ x: true }}
        />
      </section>

      <IncidentDetailModal
        open={modalOpen}
        incident={selectedIncident}
        incidentForm={form}
        setIncidentForm={setForm}
        saving={saving}
        drivers={drivers}
        onClose={closeModal}
        onSubmit={handleSubmit}
      />
    </>
  );
}
