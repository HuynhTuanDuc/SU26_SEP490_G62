import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button } from "@heroui/react";
import { StatusBadge } from "../../../components/shared-ui/StatusBadge";

const formatDateTime = (value) => {
  if (!value) return "Chưa có";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("vi-VN");
};

const MAINTENANCE_ACTIONS = new Set(["send_to_maintenance", "complete_maintenance"]);
const INCIDENT_ACTIONS = new Set(["mark_broken", "restore_vehicle"]);

function HistoryTimeline({ items, emptyText }) {
  if (!items || items.length === 0) return <p className="text-xs text-gray-400">{emptyText}</p>;
  return (
    <div className="flex flex-col gap-3">
      {items.map((item, idx) => (
        <div key={idx} className="flex gap-3">
          <div className="flex flex-col items-center pt-1">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            {idx < items.length - 1 && <span className="w-px flex-1 bg-gray-200 mt-1" />}
          </div>
          <div className="pb-3">
            <div className="text-sm font-semibold text-gray-800">{item.action_type}</div>
            <div className="text-xs text-gray-500">{String(item.from_status || "").toUpperCase()} → {String(item.to_status || "").toUpperCase()}</div>
            <div className="text-xs text-gray-400">{item.created_by_name || "Manager"} · {formatDateTime(item.created_at)}</div>
            {item.note && <div className="text-xs text-gray-600 mt-0.5">{item.note}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

function AssignmentTimeline({ items }) {
  if (!items || items.length === 0) return <p className="text-xs text-gray-400">Chưa có lịch sử gán xe (chỉ ghi từ khi tính năng được bật).</p>;
  return (
    <div className="flex flex-col gap-3">
      {items.map((item, idx) => (
        <div key={idx} className="flex gap-3">
          <div className="flex flex-col items-center pt-1">
            <span className={`w-2 h-2 rounded-full ${item.action === "assign" ? "bg-emerald-500" : "bg-rose-500"}`} />
            {idx < items.length - 1 && <span className="w-px flex-1 bg-gray-200 mt-1" />}
          </div>
          <div className="pb-3">
            <div className="text-sm font-semibold text-gray-800">
              {item.action === "assign"
                ? `Gán tài xế: ${item.driver_name || `#${item.driver_id}`}`
                : `Bỏ gán tài xế: ${item.previous_driver_name || (item.previous_driver_id ? `#${item.previous_driver_id}` : "—")}`}
            </div>
            <div className="text-xs text-gray-400">{formatDateTime(item.created_at)}{item.created_by_name ? ` · bởi ${item.created_by_name}` : ""}</div>
            {item.note && <div className="text-xs text-gray-500 mt-0.5">{item.note}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function VehicleDetailModal({ open, vehicle, assignmentHistory, onClose }) {
  if (!vehicle) return null;

  const maintenanceHistory = (vehicle.status_history || []).filter((i) => MAINTENANCE_ACTIONS.has(i.action_type));
  const incidentHistory = (vehicle.status_history || []).filter((i) => INCIDENT_ACTIONS.has(i.action_type));

  return (
    <Modal isOpen={open} onOpenChange={(isOpen) => !isOpen && onClose()} size="3xl" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader>Xe: {vehicle.plate_number}</ModalHeader>
        <ModalBody className="gap-5">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-xs text-gray-400 block">Trạng thái</span><StatusBadge status={vehicle.status} /></div>
            <div><span className="text-xs text-gray-400 block">Nhóm xe</span><strong>{vehicle.vehicle_group_name}</strong></div>
            <div><span className="text-xs text-gray-400 block">Đơn giá/km</span><strong>{Number(vehicle.price_per_km).toLocaleString()}</strong></div>
            <div><span className="text-xs text-gray-400 block">Hãng / Dòng xe</span><strong>{[vehicle.brand, vehicle.model].filter(Boolean).join(" ") || "Chưa cập nhật"}</strong></div>
            <div><span className="text-xs text-gray-400 block">Tải trọng</span><strong>{vehicle.load_capacity_kg ? `${vehicle.load_capacity_kg} kg` : "Chưa cập nhật"}</strong></div>
            <div><span className="text-xs text-gray-400 block">Năm sản xuất</span><strong>{vehicle.manufacture_year || "Chưa cập nhật"}</strong></div>
            <div><span className="text-xs text-gray-400 block">Tài xế được gán</span><strong>{vehicle.assigned_driver_name ? `${vehicle.assigned_driver_name} (${vehicle.assigned_driver_email})` : "Chưa gán"}</strong></div>
            <div><span className="text-xs text-gray-400 block">Bảo dưỡng đang mở</span><strong>{vehicle.active_maintenance_id ? `#${vehicle.active_maintenance_id} · ${vehicle.active_maintenance_type}` : "Không có"}</strong></div>
            <div><span className="text-xs text-gray-400 block">Sự cố hỏng đang mở</span><strong>{vehicle.active_failure_id ? `#${vehicle.active_failure_id} · ${vehicle.active_failure_type}` : "Không có"}</strong></div>
            <div><span className="text-xs text-gray-400 block">Cập nhật lần cuối</span><strong>{formatDateTime(vehicle.updated_at)}</strong></div>
          </div>

          <div>
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Lịch sử bảo dưỡng</div>
            <HistoryTimeline items={maintenanceHistory} emptyText="Chưa có lịch sử bảo dưỡng." />
          </div>
          <div>
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Lịch sử sự cố</div>
            <HistoryTimeline items={incidentHistory} emptyText="Chưa có lịch sử sự cố." />
          </div>
          <div>
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Lịch sử gán tài xế</div>
            <AssignmentTimeline items={assignmentHistory} />
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={onClose}>Đóng</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
