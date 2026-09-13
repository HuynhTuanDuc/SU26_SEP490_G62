import { Chip, Image } from "@heroui/react";
import { RiImageLine } from "react-icons/ri";
import { money } from "../../utils/formatNumber";

// Lịch sử bảo dưỡng của 1 xe kèm ẢNH HÓA ĐƠN tài xế đã tải lên. Dùng chung cho màn
// Quản lý xe của Manager và Accountant — trước đây chỉ xem được ảnh ở modal xác nhận
// (tức chỉ đợt đang chờ xác nhận), nên chứng từ của các đợt đã xong không ai soi lại được.

const TYPE_LABEL = {
  scheduled: "Bảo dưỡng định kỳ",
  repair: "Sửa chữa",
  inspection: "Kiểm tra",
  emergency: "Khẩn cấp",
};

// Nhãn riêng cho maintenance_records: không dùng StatusBadge vì ở đó 'open' mang nghĩa
// của sự cố ("Mới tiếp nhận"), còn ở đây 'open' là "đang bảo dưỡng".
const STATUS_CHIP = {
  requested: { label: "Chờ duyệt yêu cầu", color: "default" },
  open: { label: "Đang bảo dưỡng", color: "warning" },
  pending_verification: { label: "Chờ xác nhận", color: "primary" },
  completed: { label: "Đã xác nhận", color: "success" },
  rejected: { label: "Đã huỷ / từ chối", color: "danger" },
};

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("vi-VN");
};

const formatCost = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? `${money(amount)}` : "Chưa khai";
};

const normalizeBillPics = (value) =>
  (Array.isArray(value) ? value : []).filter((item) => typeof item === "string" && item.trim());

export function MaintenanceRecordsPanel({ records, emptyText = "Chưa có đợt bảo dưỡng nào." }) {
  if (!records || records.length === 0) {
    return <p className="text-xs text-gray-400 dark:text-gray-400">{emptyText}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {records.map((record) => {
        const images = normalizeBillPics(record.bill_pics);
        const chip = STATUS_CHIP[record.status] || { label: record.status, color: "default" };
        return (
          <div key={record.id} className="rounded-xl border border-gray-100 dark:border-white/10 p-3 flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                  #{record.id} · {TYPE_LABEL[record.maintenance_type] || record.maintenance_type}
                </div>
                <div className="text-xs text-gray-400 dark:text-gray-400">
                  {formatDate(record.maintenance_date)}
                  {record.performed_by_name ? ` · Tài xế: ${record.performed_by_name}` : ""}
                  {record.verified_by_name ? ` · Xác nhận: ${record.verified_by_name}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Chip size="sm" variant="flat" color={chip.color}>{chip.label}</Chip>
                <strong className="text-sm text-gray-800 dark:text-gray-100">{formatCost(record.cost)}</strong>
              </div>
            </div>

            {record.description && (
              <p className="text-xs text-gray-600 dark:text-gray-300">{record.description}</p>
            )}
            {record.request_reason && (
              <p className="text-xs text-gray-500 dark:text-gray-400">Lý do tài xế gửi: {record.request_reason}</p>
            )}
            {record.reject_reason && (
              <p className="text-xs text-rose-500">Lý do từ chối / huỷ: {record.reject_reason}</p>
            )}

            {images.length > 0 ? (
              <div>
                <div className="text-[11px] text-gray-400 dark:text-gray-400 mb-1">
                  Ảnh hóa đơn tài xế tải lên ({images.length}) — bấm để xem ảnh gốc
                </div>
                <div className="flex gap-2 flex-wrap">
                  {images.map((url, idx) => (
                    <a key={idx} href={url} target="_blank" rel="noreferrer">
                      <Image
                        src={url}
                        width={80}
                        height={80}
                        className="object-cover rounded-lg border border-gray-100 dark:border-white/10"
                      />
                    </a>
                  ))}
                </div>
              </div>
            ) : (
              <Chip size="sm" variant="flat" startContent={<RiImageLine size={12} />}>Chưa có ảnh hóa đơn</Chip>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default MaintenanceRecordsPanel;
