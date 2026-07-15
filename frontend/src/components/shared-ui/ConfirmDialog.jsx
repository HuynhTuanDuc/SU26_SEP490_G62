import { useEffect, useState } from "react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Textarea } from "@heroui/react";

/**
 * Modal xác nhận dùng chung — thay cho window.confirm()/window.prompt().
 * requireReason=true sẽ hiện ô nhập lý do bắt buộc trước khi cho phép xác nhận.
 */
export function ConfirmDialog({
  open,
  title = "Xác nhận",
  description,
  requireReason = false,
  reasonLabel = "Lý do",
  confirmLabel = "Xác nhận",
  cancelLabel = "Đóng",
  danger = false,
  loading = false,
  onConfirm,
  onClose,
}) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  const canConfirm = !requireReason || reason.trim().length > 0;

  return (
    <Modal isOpen={open} onOpenChange={(isOpen) => !isOpen && onClose?.()} placement="center">
      <ModalContent>
        <ModalHeader className="text-base font-bold text-gray-900">{title}</ModalHeader>
        <ModalBody>
          {description && <p className="text-sm text-gray-500">{description}</p>}
          {requireReason && (
            <Textarea
              label={reasonLabel}
              value={reason}
              onValueChange={setReason}
              minRows={3}
              variant="bordered"
            />
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={onClose}>{cancelLabel}</Button>
          <Button
            color={danger ? "danger" : "primary"}
            isDisabled={!canConfirm}
            isLoading={loading}
            onPress={() => onConfirm?.(reason.trim())}
          >
            {confirmLabel}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export default ConfirmDialog;
