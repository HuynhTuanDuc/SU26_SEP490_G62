import { Button, Input, Modal, Select } from "antd";

export default function IncidentDetailModal({
  open,
  incident,
  incidentForm,
  setIncidentForm,
  saving,
  drivers,
  onClose,
  onSubmit,
}) {
  if (!open || !incident) return null;

  const replacementOptions = drivers.filter((driver) => {
    if (!driver?.vehicle_id) return false;
    if (driver.has_active_trip) return false;
    return Number(driver.id) !== Number(incident.current_driver_id || incident.reported_by);
  });

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={760}
      destroyOnClose
      title={`Sự cố #${incident.id}`}
    >
      <p style={{ marginTop: -8, color: "#6b7280" }}>{incident.description || "Không có mô tả."}</p>

      <div className="create-form" style={{ paddingTop: 12 }}>
        <div className="sheet-caption full">Thông tin xử lý</div>

        <div className="form-row form-row-3">
          <label>
            <span>Chuyến</span>
            <Input value={incident.shipment_id ? `#${incident.shipment_id}` : "-"} disabled />
          </label>
          <label>
            <span>Tài xế báo cáo</span>
            <Input value={incident.reported_by_name || "-"} disabled />
          </label>
          <label>
            <span>Quy tắc doanh thu</span>
            <Input
              value={incident.pickup_completed ? "Đã lấy hàng - chia 50/50" : "Chưa lấy hàng - tài xế thay thế nhận 100%"}
              disabled
            />
          </label>
        </div>

        <div className="form-row form-row-3">
          <label>
            <span>Trạng thái</span>
            <Select
              style={{ width: "100%" }}
              value={incidentForm.status}
              onChange={(value) => setIncidentForm((prev) => ({ ...prev, status: value }))}
              options={[
                { value: "open", label: "open" },
                { value: "investigating", label: "investigating" },
                { value: "resolved", label: "resolved" },
                { value: "closed", label: "closed" },
              ]}
            />
          </label>
          <label>
            <span>Tài xế thay thế</span>
            <Select
              style={{ width: "100%" }}
              value={incidentForm.replacement_driver_id || undefined}
              placeholder="Không đổi tài xế"
              allowClear
              onChange={(value) => setIncidentForm((prev) => ({ ...prev, replacement_driver_id: value || "" }))}
              options={replacementOptions.map((driver) => ({
                value: String(driver.id),
                label: `${driver.full_name} - ${driver.plate_number || "Chưa có xe"}`,
              }))}
            />
          </label>
          <label>
            <span>Đã thay thế</span>
            <Input value={incident.replacement_driver_name || "-"} disabled />
          </label>
        </div>

        <label className="full-width">
          <span>Phản hồi / ghi chú</span>
          <Input.TextArea
            rows={4}
            value={incidentForm.resolution}
            onChange={(event) => setIncidentForm((prev) => ({ ...prev, resolution: event.target.value }))}
            placeholder="Nhập cách xử lý hoặc lý do điều chuyển"
          />
        </label>

        <div className="form-actions">
          <Button type="default" className="coordinator-secondary-btn" onClick={onClose}>
            Đóng
          </Button>
          <Button type="primary" className="coordinator-primary-btn" loading={saving} onClick={onSubmit}>
            Lưu xử lý
          </Button>
        </div>
      </div>
    </Modal>
  );
}
