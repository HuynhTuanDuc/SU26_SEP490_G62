import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Input, Textarea } from "@heroui/react";

export default function PartnerFormModal({ open, editing, form, setForm, saving, onClose, onSubmit }) {
  const update = (key) => (value) => setForm((p) => ({ ...p, [key]: value }));

  return (
    <Modal isOpen={open} onOpenChange={(isOpen) => !isOpen && onClose()} size="3xl" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader>{editing ? "Cập nhật đối tác" : "Thêm đối tác"}</ModalHeader>
        <ModalBody className="gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Tên công ty *" value={form.company_name} onValueChange={update("company_name")} variant="bordered" />
            <Input label="Tên viết tắt" value={form.short_name} onValueChange={update("short_name")} variant="bordered" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Người liên hệ" value={form.contact_person} onValueChange={update("contact_person")} variant="bordered" />
            <Input label="Số điện thoại" value={form.phone} onValueChange={update("phone")} variant="bordered" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Email" value={form.email} onValueChange={update("email")} variant="bordered" />
            <Input label="Hạn thanh toán (ngày)" type="number" min="0" value={form.payment_term_days} onValueChange={update("payment_term_days")} variant="bordered" />
          </div>
          <Textarea label="Địa chỉ" value={form.address} onValueChange={update("address")} minRows={2} variant="bordered" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Mã số thuế" value={form.tax_code} onValueChange={update("tax_code")} variant="bordered" />
            <Input label="Số đăng ký kinh doanh" value={form.business_registration_number} onValueChange={update("business_registration_number")} variant="bordered" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Ngân hàng" value={form.bank_name} onValueChange={update("bank_name")} variant="bordered" />
            <Input label="Số tài khoản" value={form.bank_account_number} onValueChange={update("bank_account_number")} variant="bordered" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Chủ tài khoản" value={form.bank_account_name} onValueChange={update("bank_account_name")} variant="bordered" />
            <Input label="Ghi chú" value={form.notes} onValueChange={update("notes")} variant="bordered" />
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={onClose}>Hủy</Button>
          <Button color="primary" isLoading={saving} onPress={onSubmit}>{editing ? "Lưu thay đổi" : "Tạo đối tác"}</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
