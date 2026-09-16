import { useState } from "react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Select, SelectItem } from "@heroui/react";
import { RiMoneyDollarCircleLine, RiCloseCircleLine } from "react-icons/ri";
import { notify } from "./Toast";
import { confirmDialog } from "./confirm";
import { money } from "../../utils/formatNumber";

const fmt = (n) => money(n ?? 0);

/**
 * Modal xác nhận / từ chối tiền khách trả trước — dùng chung cho Điều phối và Kế toán.
 * order: { id, prepaidAmount|prepaid_amount, customerName|customer_name }
 * api: { confirmPrepaid(orderId, formData), rejectPrepaid(orderId) }
 * onDone: gọi lại sau khi xác nhận/từ chối thành công để nơi gọi tự refetch danh sách.
 */
export function PrepaidConfirmModal({ order, api, onClose, onDone }) {
  const [method, setMethod] = useState("bank_transfer");
  const [proofFile, setProofFile] = useState(null);
  const [acting, setActing] = useState(false);

  if (!order) return null;
  const amount = order.prepaidAmount ?? order.prepaid_amount ?? 0;
  const customerName = order.customerName ?? order.customer_name ?? "khách hàng";

  const handleConfirm = async () => {
    if (!proofFile) {
      notify.error("Vui lòng đính ảnh chứng từ đã nhận tiền.");
      return;
    }
    setActing(true);
    try {
      const fd = new FormData();
      fd.append("payment_method", method);
      fd.append("proof", proofFile);
      await api.confirmPrepaid(order.id, fd);
      notify.success("Đã xác nhận tiền trả trước — ghi vào sổ tài chính.");
      onDone?.();
      onClose?.();
    } catch (e) {
      notify.error(e.message || "Lỗi xác nhận tiền trả trước");
    } finally {
      setActing(false);
    }
  };

  const handleReject = async () => {
    if (!(await confirmDialog({
      title: "Hủy khoản trả trước",
      description: `Xác nhận khách CHƯA chuyển ${fmt(amount)} — khoản này sẽ bị xoá khỏi đơn #${order.id} và KHÔNG ghi sổ.`,
      confirmLabel: "Hủy khoản này",
      danger: true,
    }))) return;
    setActing(true);
    try {
      await api.rejectPrepaid(order.id);
      notify.success("Đã hủy khoản trả trước (chưa ghi sổ).");
      onDone?.();
      onClose?.();
    } catch (e) {
      notify.error(e.message || "Lỗi hủy khoản trả trước");
    } finally {
      setActing(false);
    }
  };

  return (
    <Modal isOpen={!!order} onOpenChange={(open) => !open && onClose?.()} size="sm" placement="center">
      <ModalContent>
        <ModalHeader>Xác nhận tiền trả trước</ModalHeader>
        <ModalBody className="gap-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Đơn #{order.id} — khách <strong>{customerName}</strong> báo trả trước <strong>{fmt(amount)}</strong>.
            Xác nhận khi tiền đã thực sự về (chọn kênh + đính chứng từ), hoặc hủy nếu khách chưa chuyển.
          </p>
          <Select
            label="Kênh nhận tiền" size="sm" variant="bordered"
            selectedKeys={new Set([method])}
            onChange={(e) => setMethod(e.target.value)}
          >
            <SelectItem key="bank_transfer" textValue="Chuyển khoản">Chuyển khoản</SelectItem>
            <SelectItem key="cash" textValue="Tiền mặt">Tiền mặt</SelectItem>
          </Select>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Ảnh chứng từ đã nhận *</label>
            <input
              type="file" accept="image/*"
              onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
              className="block w-full text-xs text-gray-600 dark:text-gray-300 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 dark:file:bg-blue-500/15 file:px-3 file:py-1.5 file:text-blue-600 dark:file:text-blue-300"
            />
          </div>
        </ModalBody>
        <ModalFooter className="flex-wrap gap-2">
          <Button variant="flat" color="danger" isDisabled={acting} startContent={<RiCloseCircleLine size={15} />} onPress={handleReject}>
            Khách chưa chuyển
          </Button>
          <div className="flex-1" />
          <Button variant="flat" onPress={onClose} isDisabled={acting}>Đóng</Button>
          <Button color="success" className="text-white" isLoading={acting} startContent={!acting && <RiMoneyDollarCircleLine size={15} />} onPress={handleConfirm}>
            Xác nhận đã nhận
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export default PrepaidConfirmModal;
