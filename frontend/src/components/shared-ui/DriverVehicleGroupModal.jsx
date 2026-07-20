import { useEffect, useState } from "react";
import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button, Select, SelectItem,
} from "@heroui/react";

/**
 * Sửa nhóm xe KPI cố định của tài xế (BR: gắn chết 1 nhóm, không tự đổi theo xe hiện tại).
 * Dùng chung cho Manager/Coordinator (màn KPI, chi tiết xe) và Accountant (màn Bảng lương).
 */
export function DriverVehicleGroupModal({ open, driver, vehicleGroups, onSave, onClose }) {
  const [vehicleGroupId, setVehicleGroupId] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && driver) setVehicleGroupId(driver.vehicle_group_id ? String(driver.vehicle_group_id) : null);
  }, [open, driver]);

  if (!driver) return null;

  const handleSave = async () => {
    if (!vehicleGroupId) return;
    setSaving(true);
    try {
      await onSave(driver.driver_id, Number(vehicleGroupId));
      onClose();
    } catch (e) {
      alert(e.message || "Lỗi cập nhật nhóm xe KPI");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={open} onOpenChange={(isOpen) => !isOpen && onClose()} size="sm">
      <ModalContent>
        <ModalHeader className="flex flex-col gap-0.5">
          <span>Sửa nhóm xe KPI</span>
          <span className="text-xs font-normal text-gray-400">{driver.driver_name}</span>
        </ModalHeader>
        <ModalBody className="gap-3">
          <p className="text-xs text-gray-500">
            Nhóm xe này dùng để tính KPI/doanh thu/xếp hạng cố định cho tài xế — không tự đổi
            dù tài chạy tạm xe nhóm khác (điều chuyển sự cố...). Chỉ đổi khi tài chuyển hẳn sang nhóm xe khác lâu dài.
          </p>
          <Select
            label="Nhóm xe KPI"
            selectedKeys={vehicleGroupId ? [vehicleGroupId] : []}
            onSelectionChange={(keys) => setVehicleGroupId([...keys][0] ?? null)}
            variant="bordered"
          >
            {(vehicleGroups || []).map((g) => (
              <SelectItem key={String(g.id)}>{g.name}</SelectItem>
            ))}
          </Select>
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={onClose} isDisabled={saving}>Hủy</Button>
          <Button color="primary" onPress={handleSave} isLoading={saving} isDisabled={!vehicleGroupId}>Lưu</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export default DriverVehicleGroupModal;
