import { Tag } from "antd";
import { normalizeStatus } from "../utils";

const COLOR_BY_STATUS = {
  available: "blue",
  claimed: "gold",
  picking: "gold",
  loaded: "gold",
  transit: "processing",
  arrived: "cyan",
  returning: "orange",
  completed: "success",
  cancelled: "default",
  failed: "error",
  partial: "purple",
  open: "error",
  investigating: "gold",
  resolved: "success",
  closed: "default",
  pending: "gold",
  processing: "processing",
  approved: "success",
  rejected: "error",
};

export default function StatusTag({ status, children }) {
  const key = normalizeStatus(status);
  return (
    <Tag color={COLOR_BY_STATUS[key] || "default"} style={{ margin: 0 }}>
      {children ?? status ?? "-"}
    </Tag>
  );
}
