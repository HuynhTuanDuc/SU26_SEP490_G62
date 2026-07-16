import { useEffect, useState } from "react";
import { Button, Spinner, Select, SelectItem, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell } from "@heroui/react";
import { RiEyeLine, RiAddLine } from "react-icons/ri";
import { StatusBadge } from "../../../components/shared-ui/StatusBadge";
import IncidentDetailModal from "../../Coordinator/modals/IncidentDetailModal";
import CreateIncidentModal from "../../Coordinator/modals/CreateIncidentModal";
import { incidentTypeLabel } from "../../Coordinator/utils";
import { managerService } from "../services/manager.service";

const EMPTY_CREATE_FORM = { incidentType: "", severityLevel: "medium", shipmentId: "", description: "", location: "" };

const STATUS_FILTER_OPTIONS = [
  { value: "", label: "Tất cả trạng thái" },
  { value: "open", label: "Mới tiếp nhận" },
  { value: "investigating", label: "Đang xử lý" },
  { value: "resolved", label: "Đã giải quyết" },
  { value: "closed", label: "Đã đóng" },
];

const SEVERITY_FILTER_OPTIONS = [
  { value: "", label: "Tất cả mức độ" },
  { value: "low", label: "Thấp" },
  { value: "medium", label: "Trung bình" },
  { value: "high", label: "Cao" },
  { value: "critical", label: "Khẩn cấp" },
];

const SORT_OPTIONS = [
  { value: "newest", label: "Mới nhất" },
  { value: "oldest", label: "Cũ nhất" },
  { value: "severity", label: "Mức độ nghiêm trọng" },
];

export default function IncidentsView() {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [drivers, setDrivers] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [sortBy, setSortBy] = useState("newest");

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [form, setForm] = useState({ status: "investigating", resolution: "", replacement_driver_id: "" });

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM);

  const loadIncidents = async (page = pagination.page) => {
    setLoading(true);
    try {
      const params = { page: String(page), limit: String(pagination.limit), sort: sortBy };
      if (statusFilter) params.status = statusFilter;
      if (severityFilter) params.severity_level = severityFilter;
      const data = await managerService.getIncidents(params);
      setIncidents(data.incidents || []);
      setPagination(data.pagination || { page, limit: pagination.limit, total: data.incidents?.length || 0, totalPages: 1 });
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIncidents(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, severityFilter, sortBy]);

  useEffect(() => {
    managerService.getDrivers().then((data) => setDrivers(data.drivers || [])).catch(() => {});
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
      await managerService.updateIncidentStatus(selectedIncident.id, {
        status: form.status,
        resolution: form.resolution || null,
        replacementDriverId: form.replacement_driver_id ? Number(form.replacement_driver_id) : null,
      });
      closeModal();
      loadIncidents();
    } catch (error) {
      alert(error.message || "Không thể cập nhật sự cố.");
    } finally {
      setSaving(false);
    }
  };

  const closeCreateModal = () => {
    setCreateOpen(false);
    setCreateForm(EMPTY_CREATE_FORM);
  };

  const handleCreateIncident = async () => {
    if (!createForm.incidentType) {
      alert("Vui lòng chọn loại sự cố.");
      return;
    }
    if (!createForm.description?.trim() || createForm.description.trim().length < 10) {
      alert("Mô tả phải có ít nhất 10 ký tự.");
      return;
    }
    setCreating(true);
    try {
      await managerService.createIncidentByStaff({
        shipmentId: createForm.shipmentId?.trim() || null,
        incidentType: createForm.incidentType,
        severityLevel: createForm.severityLevel,
        description: createForm.description.trim(),
        location: createForm.location?.trim() || null,
      });
      closeCreateModal();
      loadIncidents();
    } catch (error) {
      alert(error.message || "Không thể tạo sự cố.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <Button color="primary" size="sm" startContent={<RiAddLine size={16} />} onPress={() => setCreateOpen(true)} className="h-9 font-medium px-4">
          Tạo sự cố
        </Button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 gap-3 flex-wrap">
          <div>
            <div className="text-sm font-bold text-gray-800">Danh sách sự cố</div>
            <div className="text-xs text-gray-400">Nếu chưa lấy hàng, doanh thu thuộc về tài xế thay thế. Nếu đã lấy hàng, doanh thu chia 50/50.</div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select
              size="sm"
              variant="bordered"
              className="w-44"
              selectedKeys={new Set([statusFilter])}
              onSelectionChange={(keys) => setStatusFilter([...keys][0] ?? "")}
            >
              {STATUS_FILTER_OPTIONS.map((o) => (
                <SelectItem key={o.value} textValue={o.label}>{o.label}</SelectItem>
              ))}
            </Select>
            <Select
              size="sm"
              variant="bordered"
              className="w-40"
              selectedKeys={new Set([severityFilter])}
              onSelectionChange={(keys) => setSeverityFilter([...keys][0] ?? "")}
            >
              {SEVERITY_FILTER_OPTIONS.map((o) => (
                <SelectItem key={o.value} textValue={o.label}>{o.label}</SelectItem>
              ))}
            </Select>
            <Select
              size="sm"
              variant="bordered"
              className="w-44"
              placeholder="Sắp xếp"
              selectedKeys={new Set([sortBy])}
              onSelectionChange={(keys) => setSortBy([...keys][0] ?? "newest")}
            >
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} textValue={o.label}>{o.label}</SelectItem>
              ))}
            </Select>
            <span className="text-xs text-gray-400 whitespace-nowrap">{incidents.length} sự cố · {incidents.filter((i) => i.status === "open").length} mới tiếp nhận</span>
          </div>
        </div>

        <div className="overflow-x-auto">
        <Table
          removeWrapper
          aria-label="Danh sách sự cố"
          classNames={{ th: "px-4 first:pl-5 last:pr-5", td: "px-4 py-3 first:pl-5 last:pr-5" }}
          bottomContent={
            pagination.totalPages > 1 ? (
              <div className="flex justify-center py-3">
                <div className="flex gap-1">
                  {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      onClick={() => loadIncidents(p)}
                      className={`w-7 h-7 rounded-lg text-xs font-medium ${p === pagination.page ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-100"}`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            ) : null
          }
        >
          <TableHeader>
            <TableColumn>SỰ CỐ</TableColumn>
            <TableColumn>CHUYẾN</TableColumn>
            <TableColumn>TÀI XẾ BÁO CÁO</TableColumn>
            <TableColumn>TÀI XẾ HIỆN TẠI</TableColumn>
            <TableColumn>MỐC LẤY HÀNG</TableColumn>
            <TableColumn>TRẠNG THÁI</TableColumn>
            <TableColumn> </TableColumn>
          </TableHeader>
          <TableBody
            items={incidents}
            isLoading={loading}
            loadingContent={<Spinner color="primary" />}
            emptyContent="Không có sự cố nào phù hợp."
          >
            {(incident) => (
              <TableRow key={incident.id}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-semibold text-gray-800">#{incident.id}</span>
                    <span className="text-xs text-gray-400">{incidentTypeLabel(incident.incident_type)}</span>
                  </div>
                </TableCell>
                <TableCell>{incident.shipment_id ? `#${incident.shipment_id}` : "-"}</TableCell>
                <TableCell>{incident.reported_by_name || "-"}</TableCell>
                <TableCell>{incident.current_driver_name || "-"}</TableCell>
                <TableCell>{incident.pickup_completed ? "Đã lấy hàng" : "Chưa lấy hàng"}</TableCell>
                <TableCell><StatusBadge status={incident.status} /></TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="light"
                    startContent={<RiEyeLine size={14} />}
                    isDisabled={incident.status === "closed" || incident.status === "resolved"}
                    onPress={() => openModal(incident)}
                  >
                    Xử lý
                  </Button>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        </div>
      </div>

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

      <CreateIncidentModal
        open={createOpen}
        form={createForm}
        setForm={setCreateForm}
        saving={creating}
        onClose={closeCreateModal}
        onSubmit={handleCreateIncident}
      />
    </div>
  );
}
