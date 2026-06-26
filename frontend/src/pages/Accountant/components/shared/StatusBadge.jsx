import { Chip } from "@heroui/react";

const DEBT_CONFIG = {
  paid:    { label: "Đã thu", color: "success" },
  partial: { label: "Thu một phần", color: "warning" },
  unpaid:  { label: "Chưa thu", color: "danger" },
};

const DRIVER_DEBT_CONFIG = {
  cleared:     { label: "Đã nộp", color: "success" },
  partial:     { label: "Nộp một phần", color: "warning" },
  outstanding: { label: "Chưa nộp", color: "danger" },
};

/**
 * @param {{ type: 'debt' | 'driver_debt', status: string }} props
 */
export function StatusBadge({ type = "debt", status }) {
  const cfg = type === "driver_debt"
    ? DRIVER_DEBT_CONFIG[status]
    : DEBT_CONFIG[status];

  if (!cfg) return null;

  return (
    <Chip size="sm" color={cfg.color} variant="flat">
      {cfg.label}
    </Chip>
  );
}
