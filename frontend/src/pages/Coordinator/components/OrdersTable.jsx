import { useState, useCallback } from "react";
import { Button, Spinner } from "@heroui/react";
import { RiArrowDownSLine, RiArrowRightSLine, RiInboxLine, RiPencilLine, RiCloseCircleLine } from "react-icons/ri";
import { StatusBadge } from "../../../components/shared-ui/StatusBadge";
import { PaginationBar } from "../../../components/shared-ui/PaginationBar";
import { ShipmentSubRows } from "./ShipmentSubRows";
import { canCancelTrip, canEditTrip, formatCurrency } from "../utils";

function OrderRow({ trip, isExpanded, onToggle, onEdit, onCancelOrder, onReassignShipment, onCancelShipment }) {
  return (
    <>
      <tr
        className={`border-b border-gray-100 transition-colors cursor-pointer ${isExpanded ? "bg-blue-50/40" : "hover:bg-gray-50/60"}`}
        onClick={onToggle}
      >
        <td className="py-3.5 pl-5">
          <span className="text-gray-400">
            {isExpanded ? <RiArrowDownSLine size={17} /> : <RiArrowRightSLine size={17} />}
          </span>
        </td>
        <td className="py-3.5 pr-4">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-gray-800">#{trip.orderId}</span>
              {trip.shipmentCount > 1 && (
                <span className="text-[10px] font-semibold text-blue-500 bg-blue-50 rounded px-1.5 py-0.5">
                  {trip.shipmentCount} chuyến
                </span>
              )}
            </div>
            <span className="text-xs font-medium text-gray-600">{trip.customerName || "—"}</span>
          </div>
        </td>
        <td className="py-3.5 pr-4"><span className="text-xs text-gray-500">{trip.date || "—"}</span></td>
        <td className="py-3.5 pr-4"><span className="text-xs text-gray-600">{trip.plate || "—"}</span></td>
        <td className="py-3.5 pr-4"><span className="text-xs text-gray-600">{trip.driverName || "—"}</span></td>
        <td className="py-3.5 pr-4 max-w-[200px]"><span className="text-xs text-gray-500 truncate block">{trip.route || "—"}</span></td>
        <td className="py-3.5 pr-4"><span className="text-sm font-bold text-gray-800">{formatCurrency(trip.fare)}</span></td>
        <td className="py-3.5 pr-4" onClick={(e) => e.stopPropagation()}>
          <StatusBadge status={trip.statusClass} />
        </td>
        <td className="py-3.5 pr-5" onClick={(e) => e.stopPropagation()}>
          <div className="flex gap-1.5 justify-end">
            <Button size="sm" variant="flat" color="primary" startContent={<RiPencilLine size={13} />} className="h-7 px-3 text-[11px]" isDisabled={!canEditTrip(trip)} onPress={() => onEdit(trip)}>
              Sửa
            </Button>
            <Button size="sm" variant="flat" color="danger" startContent={<RiCloseCircleLine size={13} />} className="h-7 px-3 text-[11px]" isDisabled={!canCancelTrip(trip)} onPress={() => onCancelOrder(trip)}>
              Hủy
            </Button>
          </div>
        </td>
      </tr>

      {isExpanded && (
        <ShipmentSubRows shipments={trip.trips} onReassign={onReassignShipment} onCancel={onCancelShipment} />
      )}
    </>
  );
}

export function OrdersTable({
  trips, loading, pagination, onPageChange,
  onEdit, onCancelOrder, onReassignShipment, onCancelShipment,
}) {
  const [expandedIds, setExpandedIds] = useState(new Set());

  const toggleExpand = useCallback((orderId) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner color="primary" label="Đang tải dữ liệu..." size="lg" />
      </div>
    );
  }

  if (trips.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center">
          <RiInboxLine size={26} className="text-gray-400" />
        </div>
        <p className="text-gray-500 text-sm">Chưa có đơn hàng. Tạo mới đơn để bắt đầu điều phối.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="rounded-2xl border border-gray-200 overflow-hidden bg-white">
        <table className="w-full table-fixed">
          <colgroup>
            <col className="w-10" />
            <col />
            <col className="w-24" />
            <col className="w-24" />
            <col className="w-28" />
            <col className="w-44" />
            <col className="w-32" />
            <col className="w-28" />
            <col className="w-40" />
          </colgroup>
          <thead>
            <tr className="bg-gray-50/80 border-b border-gray-200">
              {["", "Đơn / Khách hàng", "Ngày", "BKS", "Lái xe", "Hành trình", "Cước xe", "Trạng thái", ""].map((label, i) => (
                <th key={i} className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider py-3 pr-4 first:pl-5 last:pr-5">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trips.map((trip) => (
              <OrderRow
                key={trip.id}
                trip={trip}
                isExpanded={expandedIds.has(trip.orderId)}
                onToggle={() => toggleExpand(trip.orderId)}
                onEdit={onEdit}
                onCancelOrder={onCancelOrder}
                onReassignShipment={onReassignShipment}
                onCancelShipment={onCancelShipment}
              />
            ))}
          </tbody>
        </table>
      </div>

      <PaginationBar
        page={pagination.page}
        pageSize={pagination.limit}
        totalItems={pagination.total}
        totalPages={pagination.totalPages}
        onPageChange={onPageChange}
      />
    </div>
  );
}

export default OrdersTable;
