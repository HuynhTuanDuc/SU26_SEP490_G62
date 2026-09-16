import { useEffect, useMemo, useState } from "react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Input, Textarea } from "@heroui/react";
import { notify } from "../../../components/shared-ui/Toast";
import { managerService } from "../services/manager.service";

const todayVN = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
const fmt = (iso) => (iso ? iso.split("-").reverse().join("/") : "");

// Chấm dứt hợp đồng tài xế — thay cho nút "Khóa" ở dòng tài xế. Ghi ngày làm việc cuối
// cùng và khoá tài khoản NGAY trong cùng một thao tác: khoá mà không có ngày nghỉ việc thì
// bảng lương loại hẳn tài xế (mất trắng lương các ngày đã làm), còn có ngày mà không khoá
// thì tài vẫn đăng nhập được.
export default function TerminateContractModal({ driver, onClose, onDone }) {
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!driver) return;
    setDate(todayVN());
    setReason("");
    setError(null);
  }, [driver]);

  // Xem trước số công kỳ lương cuối: từ mùng 1 (hoặc ngày vào làm nếu cùng tháng) tới
  // ngày làm cuối — để người nhập thấy ngay "nghỉ ngày 20" được tính tới đâu.
  const preview = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const [y, m, d] = date.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const hire = driver?.hire_date;
    const fromDay = hire && hire.slice(0, 7) === date.slice(0, 7) ? Number(hire.slice(8, 10)) : 1;
    return { m, y, fromDay, toDay: d, employed: Math.max(0, d - fromDay + 1), daysInMonth };
  }, [date, driver]);

  const handleSubmit = async () => {
    if (!date) return setError("Vui lòng chọn ngày làm việc cuối cùng.");
    if (date > todayVN()) return setError("Tài khoản bị khoá ngay khi chấm dứt nên ngày làm việc cuối cùng không được sau hôm nay.");
    if (driver?.hire_date && date < driver.hire_date) return setError(`Ngày làm việc cuối cùng không được trước ngày vào làm (${fmt(driver.hire_date)}).`);
    setSaving(true);
    setError(null);
    try {
      const res = await managerService.terminateDriverContract(driver.id, {
        termination_date: date,
        reason: reason.trim() || undefined,
      });
      const extras = [];
      if (res?.released_vehicles?.length) extras.push(`đã gỡ xe ${res.released_vehicles.join(", ")}`);
      if (res?.rejected_advances?.length) extras.push(`huỷ ${res.rejected_advances.length} yêu cầu ứng lương chưa giải ngân`);
      notify.success(
        `Đã chấm dứt hợp đồng ${driver.full_name || ""}${extras.length ? ` — ${extras.join("; ")}` : ""}. Kế toán đã được báo để quyết toán.`,
      );
      onDone?.();
      onClose();
    } catch (err) {
      // Lỗi nghiệp vụ (còn chuyến đang chạy, kỳ lương đã chốt, ngày sai) hiện ngay trong modal
      setError(err.message || "Không thể chấm dứt hợp đồng.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={!!driver} onOpenChange={(open) => !open && !saving && onClose()} size="md">
      <ModalContent>
        <ModalHeader className="flex flex-col items-start gap-0.5">
          <span>Chấm dứt hợp đồng</span>
          <span className="text-xs font-normal text-gray-400 dark:text-gray-400">
            {driver?.full_name}{driver?.hire_date ? ` · vào làm ${fmt(driver.hire_date)}` : ""}
          </span>
        </ModalHeader>
        <ModalBody className="gap-3">
          {error && <p className="text-xs text-rose-500">{error}</p>}
          <Input
            type="date"
            label="Ngày làm việc cuối cùng *"
            value={date}
            onValueChange={setDate}
            variant="bordered"
            min={driver?.hire_date || undefined}
            max={todayVN()}
            description={preview
              ? `Lương tháng ${preview.m}/${preview.y} tính công từ ${preview.fromDay}/${preview.m} đến hết ${preview.toDay}/${preview.m} (${preview.employed}/${preview.daysInMonth} ngày). Từ ngày hôm sau không tính công.`
              : "Tính công đến hết ngày này."}
          />
          <Textarea
            label="Lý do (tuỳ chọn)"
            value={reason}
            onValueChange={setReason}
            variant="bordered"
            minRows={2}
            maxLength={500}
          />
          <ul className="text-xs text-gray-500 dark:text-gray-400 list-disc pl-4 flex flex-col gap-1">
            <li>Tài khoản bị <strong>khoá ngay</strong> — tài xế không đăng nhập app được nữa, không nhận được chuyến mới.</li>
            <li>Xe biên chế (nếu có) được gỡ khỏi tài xế để giao cho người khác.</li>
            <li>Yêu cầu ứng lương chưa giải ngân bị huỷ. Khoản đã giải ngân và công nợ vẫn trừ vào lương kỳ cuối như thường lệ (công nợ theo trần %).</li>
            <li>Phần còn lại sau kỳ lương cuối (nợ chưa trừ hết, ứng lương vượt lương) kế toán thu ở mục <em>Quyết toán nghỉ việc</em>.</li>
            <li>Không được xét thưởng Tết năm nay.</li>
          </ul>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Không chấm dứt được khi tài xế còn chuyến đang chạy, hoặc khi kỳ lương bị ảnh hưởng đã duyệt/đã chi.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={onClose} isDisabled={saving}>Hủy</Button>
          <Button color="danger" isLoading={saving} onPress={handleSubmit}>Chấm dứt hợp đồng</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
