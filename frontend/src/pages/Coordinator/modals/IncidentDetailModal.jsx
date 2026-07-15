import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button, Select, SelectItem, Textarea, Input,
} from "@heroui/react";

export default function IncidentDetailModal({ open, incident, incidentForm, setIncidentForm, saving, drivers, onClose, onSubmit }) {
  if (!incident) return null;

  const replacementOptions = drivers.filter((driver) => {
    if (!driver?.vehicle_id) return false;
    if (driver.has_active_trip) return false;
    return Number(driver.id) !== Number(incident.current_driver_id || incident.reported_by);
  });

  return (
    <Modal isOpen={open} onOpenChange={(isOpen) => !isOpen && onClose()} size="2xl" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <span className="text-base font-bold text-gray-900">Sự cố #{incident.id}</span>
          <span className="text-xs font-normal text-gray-400">{incident.description || "Không có mô tả."}</span>
        </ModalHeader>
        <ModalBody className="gap-4">
          <div className="grid grid-cols-3 gap-3">
            <Input label="Chuyến" value={incident.shipment_id ? `#${incident.shipment_id}` : "-"} isReadOnly variant="bordered" />
            <Input label="Tài xế báo cáo" value={incident.reported_by_name || "-"} isReadOnly variant="bordered" />
            <Input
              label="Quy tắc doanh thu"
              value={incident.pickup_completed ? "Đã lấy hàng - chia 50/50" : "Chưa lấy hàng - tài xế thay thế nhận 100%"}
              isReadOnly
              variant="bordered"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Select
              label="Trạng thái"
              selectedKeys={[incidentForm.status]}
              onSelectionChange={(keys) => setIncidentForm((prev) => ({ ...prev, status: [...keys][0] }))}
              variant="bordered"
            >
              <SelectItem key="open">Mới tiếp nhận</SelectItem>
              <SelectItem key="investigating">Đang xử lý</SelectItem>
              <SelectItem key="resolved">Đã giải quyết</SelectItem>
              <SelectItem key="closed">Đã đóng</SelectItem>
            </Select>
            <Select
              label="Tài xế thay thế"
              placeholder="Không đổi tài xế"
              selectedKeys={incidentForm.replacement_driver_id ? [incidentForm.replacement_driver_id] : []}
              onSelectionChange={(keys) => setIncidentForm((prev) => ({ ...prev, replacement_driver_id: [...keys][0] ?? "" }))}
              variant="bordered"
            >
              {replacementOptions.map((driver) => (
                <SelectItem key={String(driver.id)}>{`${driver.full_name} - ${driver.plate_number || "Chưa có xe"}`}</SelectItem>
              ))}
            </Select>
            <Input label="Đã thay thế" value={incident.replacement_driver_name || "-"} isReadOnly variant="bordered" />
          </div>

          <Textarea
            label="Phản hồi / ghi chú"
            placeholder="Nhập cách xử lý hoặc lý do điều chuyển"
            value={incidentForm.resolution}
            onValueChange={(v) => setIncidentForm((prev) => ({ ...prev, resolution: v }))}
            minRows={4}
            variant="bordered"
          />
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={onClose}>Đóng</Button>
          <Button color="primary" isLoading={saving} onPress={onSubmit}>Lưu xử lý</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
