import { useEffect, useState } from "react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Input, Select, SelectItem, NumberInput } from "@heroui/react";
import { RiInformationLine } from "react-icons/ri";
import { managerService } from "../services/manager.service";

const EMPTY_FORM = {
  plate_number: "", vehicle_group_id: "", brand: "", model: "",
  load_capacity_kg: null, manufacture_year: null, purchase_date: "", assigned_driver_id: "",
};

export default function VehicleFormModal({ open, editingVehicle, vehicleGroups, onClose, onSubmit }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState(null);
  const [driverOptions, setDriverOptions] = useState([]);
  const [loadingDrivers, setLoadingDrivers] = useState(false);
  const canEditDriverAssignment = !editingVehicle || editingVehicle.status === "active";

  useEffect(() => {
    if (!open) return;
    setLoadingDrivers(true);
    managerService.getDriverOptions(editingVehicle?.id)
      .then((data) => setDriverOptions(data.drivers || []))
      .catch((err) => alert(err.message))
      .finally(() => setLoadingDrivers(false));
  }, [editingVehicle?.id, open]);

  useEffect(() => {
    if (!open) return;
    if (editingVehicle) {
      setForm({
        plate_number: editingVehicle.plate_number,
        vehicle_group_id: String(editingVehicle.vehicle_group_id),
        brand: editingVehicle.brand || "",
        model: editingVehicle.model || "",
        load_capacity_kg: editingVehicle.load_capacity_kg ? Number(editingVehicle.load_capacity_kg) : null,
        manufacture_year: editingVehicle.manufacture_year || null,
        purchase_date: editingVehicle.purchase_date || "",
        assigned_driver_id: editingVehicle.assigned_driver_id ? String(editingVehicle.assigned_driver_id) : "",
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setError(null);
  }, [editingVehicle, open]);

  const handleOk = () => {
    if (!form.plate_number.trim()) return setError("Biển số xe là bắt buộc.");
    if (!form.vehicle_group_id) return setError("Vui lòng chọn nhóm xe.");
    const currentYear = new Date().getFullYear();
    if (form.manufacture_year && form.manufacture_year > currentYear) return setError("Năm sản xuất không được ở tương lai.");
    setError(null);
    onSubmit({
      ...form,
      vehicle_group_id: Number(form.vehicle_group_id),
      assigned_driver_id: form.assigned_driver_id ? Number(form.assigned_driver_id) : null,
    });
  };

  return (
    <Modal isOpen={open} onOpenChange={(isOpen) => !isOpen && onClose()} size="2xl" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader>{editingVehicle ? "Cập nhật xe" : "Thêm xe mới"}</ModalHeader>
        <ModalBody className="gap-4">
          {error && <p className="text-xs text-rose-500">{error}</p>}
          {editingVehicle && (
            <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 flex items-center gap-2 text-xs text-blue-700">
              <RiInformationLine size={16} />
              Trạng thái vòng đời xe (bảo trì, hỏng, thu hồi...) quản lý qua nút thao tác ở danh sách xe, không sửa ở đây.
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input label="Biển số *" placeholder="51H-12345" value={form.plate_number} onValueChange={(v) => setForm((p) => ({ ...p, plate_number: v }))} variant="bordered" />
            <Select
              label="Nhóm xe *"
              selectedKeys={form.vehicle_group_id ? [form.vehicle_group_id] : []}
              onSelectionChange={(k) => setForm((p) => ({ ...p, vehicle_group_id: [...k][0] ?? "" }))}
              variant="bordered"
            >
              {vehicleGroups.map((g) => <SelectItem key={String(g.id)}>{`${g.name} (#${g.id})`}</SelectItem>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Hãng xe" placeholder="Hyundai" value={form.brand} onValueChange={(v) => setForm((p) => ({ ...p, brand: v }))} variant="bordered" />
            <Input label="Dòng xe" placeholder="Porter" value={form.model} onValueChange={(v) => setForm((p) => ({ ...p, model: v }))} variant="bordered" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumberInput label="Tải trọng (kg)" minValue={0.01} value={form.load_capacity_kg} onValueChange={(v) => setForm((p) => ({ ...p, load_capacity_kg: v }))} variant="bordered" />
            <NumberInput label="Năm sản xuất" minValue={1900} formatOptions={{ useGrouping: false }} value={form.manufacture_year} onValueChange={(v) => setForm((p) => ({ ...p, manufacture_year: v }))} variant="bordered" />
          </div>
          <Input type="date" label="Ngày mua" value={form.purchase_date} onValueChange={(v) => setForm((p) => ({ ...p, purchase_date: v }))} variant="bordered" />
          <Select
            label="Tài xế được gán"
            placeholder="Chọn tài xế"
            selectedKeys={form.assigned_driver_id ? [form.assigned_driver_id] : []}
            onSelectionChange={(k) => setForm((p) => ({ ...p, assigned_driver_id: [...k][0] ?? "" }))}
            isDisabled={!canEditDriverAssignment}
            isLoading={loadingDrivers}
            variant="bordered"
          >
            {driverOptions.map((d) => (
              <SelectItem key={String(d.id)} isDisabled={!d.is_assignable}>
                {`${d.full_name} - ${d.email}${d.current_vehicle_plate ? ` (${d.current_vehicle_plate})` : ""}${d.has_active_shipment ? " - đang giao hàng" : ""}${d.has_unverified_maintenance ? " - chờ xác nhận bảo dưỡng" : ""}${d.is_assignable ? "" : " - không khả dụng"}`}
              </SelectItem>
            ))}
          </Select>
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={onClose}>Hủy</Button>
          <Button color="primary" onPress={handleOk}>Lưu</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
