import { useState, useEffect } from "react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Input, Select, SelectItem, Textarea, Image } from "@heroui/react";

const MAINTENANCE_TYPES = [
  { value: "scheduled", label: "Định kỳ" },
  { value: "repair", label: "Sửa chữa" },
  { value: "inspection", label: "Kiểm tra" },
  { value: "emergency", label: "Khẩn cấp" },
];

const SEVERITY_LEVELS = [
  { value: "low", label: "Thấp" },
  { value: "medium", label: "Trung bình" },
  { value: "high", label: "Cao" },
  { value: "critical", label: "Khẩn cấp" },
];

const normalizeBillPics = (value) => (Array.isArray(value) ? value.filter((v) => typeof v === "string" && v.trim()) : []);

export function SendToMaintenanceModal({ open, vehicle, driverOptions, loadingDrivers, onClose, onSubmit }) {
  const [form, setForm] = useState({ maintenance_type: "scheduled", description: "", maintenance_date: new Date().toISOString().slice(0, 10), performed_by: "" });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        maintenance_type: "scheduled",
        description: "",
        maintenance_date: new Date().toISOString().slice(0, 10),
        performed_by: vehicle?.assigned_driver_id ? String(vehicle.assigned_driver_id) : "",
      });
      setError(null);
    }
  }, [open, vehicle]);

  const handleOk = async () => {
    if (!form.description.trim()) return setError("Mô tả là bắt buộc.");
    if (!form.performed_by) return setError("Vui lòng chọn tài xế thực hiện.");
    setSaving(true);
    try {
      await onSubmit({ ...form, performed_by: Number(form.performed_by) });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={open} onOpenChange={(isOpen) => !isOpen && onClose()} size="lg">
      <ModalContent>
        <ModalHeader>Gửi xe {vehicle?.plate_number} đi bảo dưỡng</ModalHeader>
        <ModalBody className="gap-4">
          {error && <p className="text-xs text-rose-500">{error}</p>}
          <Select label="Loại bảo dưỡng *" selectedKeys={[form.maintenance_type]} onSelectionChange={(k) => setForm((p) => ({ ...p, maintenance_type: [...k][0] }))} variant="bordered">
            {MAINTENANCE_TYPES.map((t) => <SelectItem key={t.value}>{t.label}</SelectItem>)}
          </Select>
          <Textarea label="Mô tả *" value={form.description} onValueChange={(v) => setForm((p) => ({ ...p, description: v }))} minRows={3} variant="bordered" />
          <Input type="date" label="Ngày bảo dưỡng *" value={form.maintenance_date} onValueChange={(v) => setForm((p) => ({ ...p, maintenance_date: v }))} variant="bordered" />
          <Select
            label="Người thực hiện *"
            placeholder="Chọn tài xế"
            selectedKeys={form.performed_by ? [form.performed_by] : []}
            onSelectionChange={(k) => setForm((p) => ({ ...p, performed_by: [...k][0] ?? "" }))}
            isLoading={loadingDrivers}
            variant="bordered"
          >
            {driverOptions.map((d) => (
              <SelectItem key={String(d.id)} isDisabled={!d.is_maintenance_eligible}>
                {`${d.full_name} - ${d.email}${d.is_selected_vehicle_driver ? " (tài xế được gán)" : ""}${d.has_active_shipment ? " - đang giao hàng" : ""}${d.has_unverified_maintenance ? " - đang bảo dưỡng khác" : ""}`}
              </SelectItem>
            ))}
          </Select>
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={onClose}>Hủy</Button>
          <Button color="primary" isLoading={saving} onPress={handleOk}>Xác nhận</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export function VerifyMaintenanceModal({ open, vehicle, onClose, onSubmit }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const pending = vehicle?.active_maintenance_status === "pending_verification";

  useEffect(() => { if (open) { setNote(""); setError(null); } }, [open]);

  const handleOk = async () => {
    if (!note.trim()) return setError("Ghi chú xác nhận là bắt buộc.");
    setSaving(true);
    try {
      await onSubmit({ verification_note: note });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const images = normalizeBillPics(vehicle?.active_maintenance_bill_pics);

  return (
    <Modal isOpen={open} onOpenChange={(isOpen) => !isOpen && onClose()} size="lg">
      <ModalContent>
        <ModalHeader>Xác nhận bảo dưỡng {vehicle?.plate_number}</ModalHeader>
        <ModalBody className="gap-4">
          {error && <p className="text-xs text-rose-500">{error}</p>}
          <div>
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Ảnh hóa đơn</div>
            {images.length > 0 ? (
              <div className="flex gap-2 flex-wrap">
                {images.map((url, i) => <Image key={i} src={url} width={100} height={100} className="object-cover rounded-lg" />)}
              </div>
            ) : (
              <p className="text-xs text-gray-400">Chưa có ảnh hóa đơn.</p>
            )}
          </div>
          <Textarea label="Ghi chú xác nhận *" value={note} onValueChange={setNote} minRows={3} variant="bordered" />
          {!pending && <p className="text-xs text-amber-600">Bảo dưỡng này vẫn đang chờ tài xế tải ảnh hóa đơn và đánh dấu hoàn tất.</p>}
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={onClose}>Hủy</Button>
          <Button color="primary" isDisabled={!pending} isLoading={saving} onPress={handleOk}>Xác nhận</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export function MarkBrokenModal({ open, vehicle, onClose, onSubmit }) {
  const [form, setForm] = useState({ failure_type: "", severity_level: "medium", description: "", note: "" });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setForm({ failure_type: "", severity_level: "medium", description: "", note: "" }); setError(null); } }, [open]);

  const handleOk = async () => {
    if (!form.failure_type.trim()) return setError("Loại hỏng hóc là bắt buộc.");
    if (!form.description.trim()) return setError("Mô tả là bắt buộc.");
    setSaving(true);
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={open} onOpenChange={(isOpen) => !isOpen && onClose()} size="lg">
      <ModalContent>
        <ModalHeader>Đánh dấu {vehicle?.plate_number} bị hỏng</ModalHeader>
        <ModalBody className="gap-4">
          {error && <p className="text-xs text-rose-500">{error}</p>}
          <Input label="Loại hỏng hóc *" placeholder="engine_failure" value={form.failure_type} onValueChange={(v) => setForm((p) => ({ ...p, failure_type: v }))} variant="bordered" />
          <Select label="Mức độ *" selectedKeys={[form.severity_level]} onSelectionChange={(k) => setForm((p) => ({ ...p, severity_level: [...k][0] }))} variant="bordered">
            {SEVERITY_LEVELS.map((s) => <SelectItem key={s.value}>{s.label}</SelectItem>)}
          </Select>
          <Textarea label="Mô tả *" value={form.description} onValueChange={(v) => setForm((p) => ({ ...p, description: v }))} minRows={3} variant="bordered" />
          <Textarea label="Ghi chú" value={form.note} onValueChange={(v) => setForm((p) => ({ ...p, note: v }))} minRows={2} variant="bordered" />
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={onClose}>Hủy</Button>
          <Button color="danger" isLoading={saving} onPress={handleOk}>Xác nhận</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export function RestoreVehicleModal({ open, vehicle, onClose, onSubmit }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setNote(""); setError(null); } }, [open]);

  const handleOk = async () => {
    if (!note.trim()) return setError("Ghi chú xử lý là bắt buộc.");
    setSaving(true);
    try {
      await onSubmit({ resolution_note: note });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={open} onOpenChange={(isOpen) => !isOpen && onClose()} size="md">
      <ModalContent>
        <ModalHeader>Khôi phục xe {vehicle?.plate_number}</ModalHeader>
        <ModalBody className="gap-4">
          {error && <p className="text-xs text-rose-500">{error}</p>}
          <Textarea label="Ghi chú xử lý *" value={note} onValueChange={setNote} minRows={3} variant="bordered" />
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={onClose}>Hủy</Button>
          <Button color="primary" isLoading={saving} onPress={handleOk}>Khôi phục</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export function RetireVehicleModal({ open, vehicle, onClose, onSubmit }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setNote(""); setError(null); } }, [open]);

  const handleOk = async () => {
    if (!note.trim()) return setError("Ghi chú thu hồi là bắt buộc.");
    setSaving(true);
    try {
      await onSubmit({ note });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={open} onOpenChange={(isOpen) => !isOpen && onClose()} size="md">
      <ModalContent>
        <ModalHeader>Thu hồi xe {vehicle?.plate_number}</ModalHeader>
        <ModalBody className="gap-4">
          {error && <p className="text-xs text-rose-500">{error}</p>}
          <Textarea label="Ghi chú thu hồi *" value={note} onValueChange={setNote} minRows={3} variant="bordered" />
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={onClose}>Hủy</Button>
          <Button color="danger" isLoading={saving} onPress={handleOk}>Thu hồi</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
