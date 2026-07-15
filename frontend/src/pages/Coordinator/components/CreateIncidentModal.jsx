import { Button, Input, Modal, Select } from "antd";

const INCIDENT_TYPES = [
  { value: "vehicle_breakdown", label: "Sự cố xe" },
  { value: "cargo_damage", label: "Hàng hóa bị hỏng" },
  { value: "road_incident", label: "Đường sá / giao thông" },
  { value: "customer_refusal", label: "Khách từ chối nhận" },
  { value: "traffic_jam", label: "Tắc đường" },
];

const SEVERITY_LEVELS = [
  { value: "low", label: "Thấp" },
  { value: "medium", label: "Trung bình" },
  { value: "high", label: "Cao" },
  { value: "critical", label: "Khẩn cấp" },
];

export default function CreateIncidentModal({ open, form, setForm, saving, onClose, onSubmit }) {
  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={640}
      destroyOnClose
      title="Tạo sự cố thủ công"
    >
      <p style={{ marginTop: -8, color: "#6b7280" }}>
        Dùng khi khách gọi điện báo sự cố, hoặc điều phối/quản lý phát hiện sự cố mà tài xế chưa kịp báo cáo.
      </p>

      <div className="create-form" style={{ paddingTop: 12 }}>
        <div className="form-row form-row-3">
          <label>
            <span>Loại sự cố</span>
            <Select
              style={{ width: "100%" }}
              value={form.incidentType || undefined}
              placeholder="Chọn loại sự cố"
              onChange={(value) => setForm((prev) => ({ ...prev, incidentType: value }))}
              options={INCIDENT_TYPES}
            />
          </label>
          <label>
            <span>Mức độ</span>
            <Select
              style={{ width: "100%" }}
              value={form.severityLevel || "medium"}
              onChange={(value) => setForm((prev) => ({ ...prev, severityLevel: value }))}
              options={SEVERITY_LEVELS}
            />
          </label>
          <label>
            <span>Mã chuyến (nếu có)</span>
            <Input
              value={form.shipmentId || ""}
              placeholder="VD: 100023"
              onChange={(event) => setForm((prev) => ({ ...prev, shipmentId: event.target.value }))}
            />
          </label>
        </div>

        <label className="full-width">
          <span>Mô tả (tối thiểu 10 ký tự)</span>
          <Input.TextArea
            rows={4}
            value={form.description || ""}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            placeholder="Mô tả chi tiết sự cố"
          />
        </label>

        <label className="full-width">
          <span>Vị trí (không bắt buộc)</span>
          <Input
            value={form.location || ""}
            onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))}
            placeholder="VD: Quốc lộ 13, Thủ Đức"
          />
        </label>

        <div className="form-actions">
          <Button type="default" className="coordinator-secondary-btn" onClick={onClose}>
            Đóng
          </Button>
          <Button type="primary" className="coordinator-primary-btn" loading={saving} onClick={onSubmit}>
            Tạo sự cố
          </Button>
        </div>
      </div>
    </Modal>
  );
}
