const STATUS_STYLES = {
  // trip / shipment lifecycle
  available:      "bg-blue-50 text-blue-600",
  claimed:        "bg-amber-50 text-amber-600",
  picking:        "bg-amber-50 text-amber-600",
  loaded:         "bg-amber-50 text-amber-600",
  transit:        "bg-sky-50 text-sky-600",
  arrived:        "bg-cyan-50 text-cyan-600",
  returning:      "bg-orange-50 text-orange-600",
  completed:      "bg-emerald-50 text-emerald-600",
  cancelled:      "bg-gray-100 text-gray-500",
  failed:         "bg-rose-50 text-rose-600",
  partial:        "bg-purple-50 text-purple-600",

  // incident lifecycle
  open:           "bg-rose-50 text-rose-600",
  investigating:  "bg-amber-50 text-amber-600",
  resolved:       "bg-emerald-50 text-emerald-600",
  closed:         "bg-gray-100 text-gray-500",

  // receipt / approval lifecycle
  pending:        "bg-amber-50 text-amber-600",
  processing:     "bg-sky-50 text-sky-600",
  approved:       "bg-emerald-50 text-emerald-600",
  rejected:       "bg-rose-50 text-rose-600",
  reviewed:       "bg-sky-50 text-sky-600",
  paid:           "bg-violet-50 text-violet-600",

  // severity level (sự cố)
  low:            "bg-gray-100 text-gray-500",
  medium:         "bg-amber-50 text-amber-600",
  high:           "bg-orange-50 text-orange-600",
  critical:       "bg-rose-50 text-rose-600",
};

const STATUS_LABELS = {
  // trip / shipment lifecycle
  available:      "Chưa nhận",
  claimed:        "Đã nhận",
  picking:        "Đang lấy hàng",
  loaded:         "Đã lấy hàng",
  transit:        "Đang vận chuyển",
  arrived:        "Đã đến nơi",
  returning:      "Đang hoàn hàng",
  completed:      "Hoàn thành",
  cancelled:      "Đã hủy",
  failed:         "Thất bại",
  partial:        "Nhiều trạng thái",

  // incident lifecycle
  open:           "Mới tiếp nhận",
  investigating:  "Đang xử lý",
  resolved:       "Đã giải quyết",
  closed:         "Đã đóng",

  // receipt / approval lifecycle
  pending:        "Chờ duyệt",
  processing:     "Đang xử lý",
  approved:       "Đã duyệt",
  rejected:       "Đã từ chối",
  reviewed:       "Đã xác nhận",
  paid:           "Đã chi",

  // severity level (sự cố)
  low:            "Thấp",
  medium:         "Trung bình",
  high:           "Cao",
  critical:       "Khẩn cấp",
};

const normalize = (status) => String(status ?? "").trim().toLowerCase();

/**
 * Badge trạng thái dùng chung — luôn hiển thị tiếng Việt.
 * Truyền `status` là đủ; không cần children (children chỉ dùng khi cần ghi đè hiển thị đặc biệt).
 */
export function StatusBadge({ status, children }) {
  const key = normalize(status);
  const style = STATUS_STYLES[key] || "bg-gray-100 text-gray-500";
  const label = STATUS_LABELS[key] ?? status ?? "-";
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold ${style}`}>
      {children ?? label}
    </span>
  );
}

export default StatusBadge;
