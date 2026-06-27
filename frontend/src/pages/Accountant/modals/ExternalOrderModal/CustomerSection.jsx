import { Input } from "@heroui/react";

export function CustomerSection({ name, onNameChange, phone, onPhoneChange, company, onCompanyChange, errors }) {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        Thông tin khách hàng
      </span>
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Tên khách hàng"
          placeholder="Nguyễn Văn A"
          value={name}
          onValueChange={onNameChange}
          isRequired
          isInvalid={!!errors?.customer_name}
          errorMessage={errors?.customer_name}
        />
        <Input
          label="Số điện thoại"
          placeholder="0901234567"
          value={phone}
          onValueChange={onPhoneChange}
          isRequired
          isInvalid={!!errors?.customer_phone}
          errorMessage={errors?.customer_phone}
        />
      </div>
      <Input
        label="Công ty / Đối tác"
        placeholder="Tuỳ chọn"
        value={company}
        onValueChange={onCompanyChange}
      />
    </div>
  );
}
