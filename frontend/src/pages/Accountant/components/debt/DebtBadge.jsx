import { Chip } from "@heroui/react";

export const STATUS_CFG = {
  paid:    { label: "Đã thanh toán",   color: "success"   },
  partial: { label: "Thu một phần",    color: "warning"   },
  unpaid:  { label: "Chưa thanh toán", color: "danger"    },
};

export const DEBT_TYPE_CFG = {
  customer: { label: "Khách nợ",  color: "secondary" },
  driver:   { label: "Tài xế nợ", color: "warning"   },
};

export function DebtBadge({ label, color = "default" }) {
  return (
    <Chip size="sm" color={color} variant="flat" className="text-[11px] h-5">
      {label}
    </Chip>
  );
}
