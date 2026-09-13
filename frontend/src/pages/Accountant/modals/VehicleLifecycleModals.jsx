import { useState, useEffect } from "react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Input, Select, SelectItem, Textarea, Image } from "@heroui/react";
import {
  RiToolsLine, RiFileTextLine, RiUserLine,
  RiErrorWarningFill, RiAlertLine, RiErrorWarningLine, RiCloseLine,
} from "react-icons/ri";
import { notify } from "../../../components/shared-ui/Toast";
import { money } from "../../../utils/formatNumber";

const ic = (Icon) => <Icon size={16} className="text-gray-400 dark:text-gray-400 shrink-0" />;

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

// Nhãn lý do bấm-là-xong. Bắt manager gõ tay mỗi lần từ chối chỉ tạo ra những
// dòng "khong hop le" vô nghĩa; nhãn cố định vừa nhanh vừa thống kê được.
const REJECT_REASON_PRESETS = [
  "Hóa đơn khống",
  "Số tiền không khớp hóa đơn",
  "Ảnh mờ / không đọc được",
  "Hóa đơn không phải của xe này",
];

const showFormError = (setError, message) => {
  setError(message);
  notify.error(message);
};

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
    if (!form.performed_by) return showFormError(setError, "Vui lòng chọn tài xế thực hiện.");
    setSaving(true);
    try {
      await onSubmit({ ...form, performed_by: Number(form.performed_by) });
    } catch (err) {
      showFormError(setError, err.message || "Không thể gửi xe đi bảo dưỡng.");
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
          <Select label="Loại bảo dưỡng *" selectedKeys={[form.maintenance_type]} onSelectionChange={(k) => setForm((p) => ({ ...p, maintenance_type: [...k][0] }))} variant="bordered" startContent={ic(RiToolsLine)}>
            {MAINTENANCE_TYPES.map((t) => <SelectItem key={t.value}>{t.label}</SelectItem>)}
          </Select>
          <Textarea label="Mô tả" placeholder="Không bắt buộc" value={form.description} onValueChange={(v) => setForm((p) => ({ ...p, description: v }))} minRows={3} variant="bordered" startContent={ic(RiFileTextLine)} />
          <Input type="date" label="Ngày bảo dưỡng *" value={form.maintenance_date} onValueChange={(v) => setForm((p) => ({ ...p, maintenance_date: v }))} variant="bordered" />
          <Select
            label="Người thực hiện *"
            placeholder="Chọn tài xế"
            selectedKeys={form.performed_by ? [form.performed_by] : []}
            onSelectionChange={(k) => setForm((p) => ({ ...p, performed_by: [...k][0] ?? "" }))}
            isLoading={loadingDrivers}
            variant="bordered"
            startContent={ic(RiUserLine)}
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

export function VerifyMaintenanceModal({ open, vehicle, onClose, onSubmit, onReject }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  // Đối trọng của nút xác nhận: hóa đơn khống / số tiền sai phải có đường từ chối,
  // nếu không chỉ còn cách duyệt bừa hoặc để bản ghi treo vĩnh viễn.
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const pending = vehicle?.active_maintenance_status === "pending_verification";

  useEffect(() => {
    if (open) { setNote(""); setError(null); setRejecting(false); setRejectReason(""); }
  }, [open]);

  const handleOk = async () => {
    setSaving(true);
    try {
      await onSubmit({ verification_note: note });
    } catch (err) {
      showFormError(setError, err.message || "Không thể xác nhận bảo dưỡng.");
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async (mode) => {
    // Lý do vẫn bắt buộc (tài xế phải biết sửa gì, và đây là vết kiểm toán), nhưng
    // manager không phải gõ tay: bấm một nhãn có sẵn là đủ.
    if (!rejectReason.trim()) return showFormError(setError, "Chọn một lý do có sẵn hoặc tự ghi lý do.");
    setSaving(true);
    try {
      await onReject({ mode, reason: rejectReason.trim() });
    } catch (err) {
      showFormError(setError, err.message || "Không thể từ chối bảo dưỡng.");
    } finally {
      setSaving(false);
    }
  };

  const images = normalizeBillPics(vehicle?.active_maintenance_bill_pics);
  const cost = Number(vehicle?.active_maintenance_cost);

  return (
    <Modal isOpen={open} onOpenChange={(isOpen) => !isOpen && onClose()} size="lg">
      <ModalContent>
        <ModalHeader>Xác nhận bảo dưỡng {vehicle?.plate_number}</ModalHeader>
        <ModalBody className="gap-4">
          {error && <p className="text-xs text-rose-500">{error}</p>}
          <div>
            <div className="text-xs font-bold text-gray-400 dark:text-gray-400 uppercase tracking-wider mb-2">
              Ảnh hóa đơn {images.length > 0 ? "— bấm để xem ảnh gốc" : ""}
            </div>
            {images.length > 0 ? (
              <div className="flex gap-3 flex-wrap">
                {images.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer">
                    <Image src={url} width={100} height={100} className="object-cover rounded-lg" />
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 dark:text-gray-400">Chưa có ảnh hóa đơn.</p>
            )}
          </div>
          <div>
            <div className="text-xs font-bold text-gray-400 dark:text-gray-400 uppercase tracking-wider mb-1">Chi phí tài xế khai</div>
            <p className="text-sm font-bold text-gray-800 dark:text-gray-100">
              {Number.isFinite(cost) && cost > 0 ? `${money(cost)}` : "Chưa khai"}
            </p>
            <p className="text-[11px] text-gray-400 dark:text-gray-400 mt-1">
              Số tiền này đã được đối chiếu tự động với hóa đơn khi tài xế bấm hoàn tất.
              Việc còn lại là mắt người: hóa đơn có thật và đúng của xe này không.
            </p>
          </div>
          {rejecting ? (
            <div className="flex flex-col gap-2">
              <div className="text-xs font-bold text-gray-400 dark:text-gray-400 uppercase tracking-wider">Lý do từ chối</div>
              <div className="flex gap-2 flex-wrap">
                {REJECT_REASON_PRESETS.map((preset) => (
                  <Button
                    key={preset}
                    size="sm"
                    variant={rejectReason === preset ? "solid" : "bordered"}
                    color={rejectReason === preset ? "danger" : "default"}
                    onPress={() => { setRejectReason(preset); setError(null); }}
                  >
                    {preset}
                  </Button>
                ))}
              </div>
              <Textarea
                placeholder="Hoặc tự ghi lý do khác"
                value={rejectReason}
                onValueChange={(v) => { setRejectReason(v); setError(null); }}
                minRows={2}
                variant="bordered"
                startContent={ic(RiErrorWarningLine)}
              />
            </div>
          ) : (
            <Textarea label="Ghi chú xác nhận" placeholder="Không bắt buộc" value={note} onValueChange={setNote} minRows={3} variant="bordered" startContent={ic(RiFileTextLine)} />
          )}
          {rejecting && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {pending && (
                <>
                  <b>Yêu cầu làm lại</b>: xoá hóa đơn và chi phí đã khai, xe vẫn ở trạng thái bảo dưỡng, tài xế phải chụp và nhập lại.
                  <br />
                </>
              )}
              <b>Huỷ bảo dưỡng</b>: đóng bản ghi, xe trở lại hoạt động, tài xế muốn bảo dưỡng phải gửi yêu cầu mới.
            </p>
          )}
          {!pending && <p className="text-xs text-amber-600 dark:text-amber-300">Bảo dưỡng này vẫn đang chờ tài xế tải ảnh hóa đơn và đánh dấu hoàn tất. Chưa xác nhận được, nhưng vẫn huỷ được nếu mở nhầm hoặc tài xế bỏ dở.</p>}
        </ModalBody>
        <ModalFooter>
          {rejecting ? (
            <>
              <Button variant="flat" isDisabled={saving} onPress={() => { setRejecting(false); setError(null); }}>Quay lại</Button>
              {/* Làm lại chứng từ chỉ có nghĩa khi tài xế đã nộp; huỷ thì lúc nào cũng cần —
                  không có nó, đợt bảo dưỡng mở nhầm sẽ giam xe ở trạng thái bảo dưỡng. */}
              {pending && (
                <Button color="warning" variant="flat" isLoading={saving} onPress={() => handleReject("redo")}>Yêu cầu làm lại</Button>
              )}
              <Button color="danger" isLoading={saving} onPress={() => handleReject("cancel")}>Huỷ bảo dưỡng</Button>
            </>
          ) : (
            <>
              <Button variant="flat" onPress={onClose}>Đóng</Button>
              <Button color="danger" variant="flat" startContent={<RiCloseLine size={16} />} onPress={() => { setRejecting(true); setError(null); }}>
                {pending ? "Từ chối" : "Huỷ bảo dưỡng"}
              </Button>
              <Button color="primary" isDisabled={!pending} isLoading={saving} onPress={handleOk}>Xác nhận</Button>
            </>
          )}
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
    if (!form.failure_type.trim()) return showFormError(setError, "Loại hỏng hóc là bắt buộc.");
    if (!form.description.trim()) return showFormError(setError, "Mô tả là bắt buộc.");
    setSaving(true);
    try {
      await onSubmit(form);
    } catch (err) {
      showFormError(setError, err.message || "Không thể đánh dấu xe bị hỏng.");
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
          <Input label="Loại hỏng hóc *" placeholder="engine_failure" value={form.failure_type} onValueChange={(v) => setForm((p) => ({ ...p, failure_type: v }))} variant="bordered" startContent={ic(RiErrorWarningFill)} />
          <Select label="Mức độ *" selectedKeys={[form.severity_level]} onSelectionChange={(k) => setForm((p) => ({ ...p, severity_level: [...k][0] }))} variant="bordered" startContent={ic(RiAlertLine)}>
            {SEVERITY_LEVELS.map((s) => <SelectItem key={s.value}>{s.label}</SelectItem>)}
          </Select>
          <Textarea label="Mô tả *" value={form.description} onValueChange={(v) => setForm((p) => ({ ...p, description: v }))} minRows={3} variant="bordered" startContent={ic(RiFileTextLine)} />
          <Textarea label="Ghi chú" value={form.note} onValueChange={(v) => setForm((p) => ({ ...p, note: v }))} minRows={2} variant="bordered" startContent={ic(RiFileTextLine)} />
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
    if (!note.trim()) return showFormError(setError, "Ghi chú xử lý là bắt buộc.");
    setSaving(true);
    try {
      await onSubmit({ resolution_note: note });
    } catch (err) {
      showFormError(setError, err.message || "Không thể khôi phục xe.");
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
          <Textarea label="Ghi chú xử lý *" value={note} onValueChange={setNote} minRows={3} variant="bordered" startContent={ic(RiFileTextLine)} />
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
    if (!note.trim()) return showFormError(setError, "Ghi chú thu hồi là bắt buộc.");
    setSaving(true);
    try {
      await onSubmit({ note });
    } catch (err) {
      showFormError(setError, err.message || "Không thể thu hồi xe.");
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
          <Textarea label="Ghi chú thu hồi *" value={note} onValueChange={setNote} minRows={3} variant="bordered" startContent={ic(RiFileTextLine)} />
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={onClose}>Hủy</Button>
          <Button color="danger" isLoading={saving} onPress={handleOk}>Thu hồi</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
