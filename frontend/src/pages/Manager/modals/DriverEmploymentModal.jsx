import { useEffect, useState } from "react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Input } from "@heroui/react";
import { notify } from "../../../components/shared-ui/Toast";
import { managerService } from "../services/manager.service";

// Hồ sơ công việc của tài xế — ngày vào làm / ngày nghỉ việc (ngày làm việc cuối cùng).
// Hai mốc này quyết định bảng lương, chấm công và thưởng Tết tính công trong khoảng nào.
//
// Cho nghỉ việc KHÔNG làm ở đây mà qua nút "Chấm dứt HĐ" (ghi ngày + khoá tài khoản cùng
// lúc). Ô ngày nghỉ việc ở đây chỉ hiện khi đã có ngày, để sửa ngày ghi nhầm hoặc xoá đi
// khi chấm dứt nhầm.
export default function DriverEmploymentModal({ driver, onClose, onSaved }) {
  const [hireDate, setHireDate] = useState("");
  const [terminationDate, setTerminationDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const hasTermination = Boolean(driver?.termination_date);

  useEffect(() => {
    if (!driver) return;
    setHireDate(driver.hire_date || "");
    setTerminationDate(driver.termination_date || "");
    setError(null);
  }, [driver]);

  const handleSave = async () => {
    if (!hireDate) return setError("Vui lòng chọn ngày vào làm.");
    if (terminationDate && terminationDate < hireDate) return setError("Ngày nghỉ việc không được trước ngày vào làm.");
    setSaving(true);
    setError(null);
    try {
      await managerService.updateDriverEmployment(driver.id, {
        hire_date: hireDate,
        // Chưa có ngày nghỉ việc thì không gửi — backend giữ nguyên
        ...(hasTermination ? { termination_date: terminationDate || null } : {}),
      });
      notify.success(
        hasTermination && !terminationDate
          ? "Đã huỷ ngày nghỉ việc. Mở khoá tài khoản ở danh sách nếu tài xế quay lại làm."
          : "Đã cập nhật hồ sơ công việc.",
      );
      onSaved?.();
      onClose();
    } catch (err) {
      // Lỗi nghiệp vụ (kỳ lương đã chốt, ngày sai) hiện ngay trong modal để sửa tiếp
      setError(err.message || "Không thể cập nhật hồ sơ công việc.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={!!driver} onOpenChange={(open) => !open && onClose()} size="md">
      <ModalContent>
        <ModalHeader className="flex flex-col items-start gap-0.5">
          <span>Hồ sơ công việc</span>
          <span className="text-xs font-normal text-gray-400 dark:text-gray-400">{driver?.full_name}</span>
        </ModalHeader>
        <ModalBody className="gap-3">
          {error && <p className="text-xs text-rose-500">{error}</p>}
          <Input
            type="date"
            label="Ngày vào làm *"
            value={hireDate}
            onValueChange={setHireDate}
            variant="bordered"
            description="Tháng vào làm chỉ tính công từ ngày này."
          />
          {hasTermination ? (
            <div className="flex items-start gap-2">
              <Input
                type="date"
                label="Ngày làm việc cuối cùng"
                value={terminationDate}
                onValueChange={setTerminationDate}
                variant="bordered"
                className="flex-1"
                description={terminationDate
                  ? "Chỉ sửa khi ghi nhầm ngày. Xoá = huỷ chấm dứt hợp đồng (tài xế quay lại làm)."
                  : "Sẽ huỷ ngày nghỉ việc khi lưu — nhớ mở khoá tài khoản nếu tài xế quay lại làm."}
              />
              {terminationDate && (
                <Button variant="light" size="sm" className="mt-3" onPress={() => setTerminationDate("")}>Xoá</Button>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-white/5 rounded-lg px-3 py-2">
              Tài xế đang làm việc. Cho nghỉ việc bằng nút <strong>Chấm dứt HĐ</strong> ở danh sách — ngày làm việc cuối cùng và khoá tài khoản được ghi cùng lúc.
            </p>
          )}
          <ul className="text-xs text-gray-500 dark:text-gray-400 list-disc pl-4 flex flex-col gap-1">
            <li>Lương tháng vào làm / nghỉ việc chỉ tính công trong thời gian làm việc; phụ cấp điện thoại và BHXH chia theo số ngày làm.</li>
            <li>Tài xế có ngày nghỉ việc trước 31/12 không được xét thưởng Tết năm đó.</li>
            <li>Không sửa được nếu kỳ lương bị ảnh hưởng đã duyệt/đã chi — trả phiếu lương về &quot;Chờ duyệt&quot; trước.</li>
          </ul>
          {hasTermination && driver?.is_active && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Tài khoản đang mở dù đã có ngày nghỉ việc — tài xế đăng nhập được nhưng không nhận được chuyến sau ngày làm cuối.
            </p>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={onClose}>Hủy</Button>
          <Button color="primary" isLoading={saving} onPress={handleSave}>Lưu lại</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
