import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button, Select, SelectItem, Input, Textarea,
} from "@heroui/react";

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
    <Modal isOpen={open} onOpenChange={(isOpen) => !isOpen && onClose()} size="2xl" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <span className="text-base font-bold text-gray-900">Tạo sự cố thủ công</span>
          <span className="text-xs font-normal text-gray-400">
            Dùng khi khách gọi điện báo sự cố, hoặc điều phối/quản lý phát hiện sự cố mà tài xế chưa kịp báo cáo.
          </span>
        </ModalHeader>
        <ModalBody className="gap-4">
          <div className="grid grid-cols-3 gap-3">
            <Select
              label="Loại sự cố"
              placeholder="Chọn loại sự cố"
              selectedKeys={form.incidentType ? [form.incidentType] : []}
              onSelectionChange={(keys) => setForm((prev) => ({ ...prev, incidentType: [...keys][0] }))}
              variant="bordered"
            >
              {INCIDENT_TYPES.map((t) => <SelectItem key={t.value}>{t.label}</SelectItem>)}
            </Select>
            <Select
              label="Mức độ"
              selectedKeys={[form.severityLevel || "medium"]}
              onSelectionChange={(keys) => setForm((prev) => ({ ...prev, severityLevel: [...keys][0] }))}
              variant="bordered"
            >
              {SEVERITY_LEVELS.map((s) => <SelectItem key={s.value}>{s.label}</SelectItem>)}
            </Select>
            <Input
              label="Mã chuyến (nếu có)"
              placeholder="VD: 100023"
              value={form.shipmentId || ""}
              onValueChange={(v) => setForm((prev) => ({ ...prev, shipmentId: v }))}
              variant="bordered"
            />
          </div>

          <Textarea
            label="Mô tả (tối thiểu 10 ký tự)"
            value={form.description || ""}
            onValueChange={(v) => setForm((prev) => ({ ...prev, description: v }))}
            minRows={4}
            variant="bordered"
          />

          <Input
            label="Vị trí (không bắt buộc)"
            placeholder="VD: Quốc lộ 13, Thủ Đức"
            value={form.location || ""}
            onValueChange={(v) => setForm((prev) => ({ ...prev, location: v }))}
            variant="bordered"
          />
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={onClose}>Đóng</Button>
          <Button color="primary" isLoading={saving} onPress={onSubmit}>Tạo sự cố</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
