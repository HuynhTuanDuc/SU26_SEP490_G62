import { useState, useCallback } from "react";
import { Button, Spinner } from "@heroui/react";
import { RiArrowDownSLine, RiArrowRightSLine, RiInboxLine, RiPencilLine, RiCloseCircleLine, RiEyeLine, RiTimeLine } from "react-icons/ri";
import { StatusBadge } from "../../../components/shared-ui/StatusBadge";
import { PaginationBar } from "../../../components/shared-ui/PaginationBar";
import { RouteStops } from "../../../components/shared-ui/RouteStops";
import { ShipmentSubRows } from "./ShipmentSubRows";
import { canCancelTrip, canEditTrip } from "../utils";
import { money } from "../../../utils/formatNumber";

function OrderRow({ trip, isExpanded, onToggle, onDetail, onEdit, onCancelOrder, onReassignShipment, onCancelShipment, onConfirmPrepaid }) {
  return (
    <>
      <tr
        className={`border-b border-gray-100 dark:border-white/10 transition-colors cursor-pointer ${isExpanded ? "bg-blue-50/40 dark:bg-blue-500/10" : "hover:bg-gray-50/60 dark:hover:bg-white/5"}`}
        onClick={onToggle}
      >
        <td className="py-3.5 pl-5">
          <span className="text-gray-400 dark:text-gray-400">
            {isExpanded ? <RiArrowDownSLine size={17} /> : <RiArrowRightSLine size={17} />}
          </span>
        </td>
        <td className="py-3.5 pr-4">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[15px] font-bold text-gray-800 dark:text-gray-100">
                {trip.customerName || "—"}
              </span>
              {trip.shipmentCount > 1 && (
                <span className="text-[10px] font-semibold text-blue-500 bg-blue-50 dark:bg-blue-500/10 rounded px-1.5 py-0.5">
                  {trip.shipmentCount} chuyến
                </span>
              )}
              {trip.prepaidStatus === "pending" && (
                <button
                  onClick={(e) => { e.stopPropagation(); onConfirmPrepaid(trip); }}
                  className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 rounded px-1.5 py-0.5 hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-colors"
                  title="Đã nhập trả trước, chờ xác nhận tiền thực về"
                >
                  <RiTimeLine size={11} />
                  Chờ xác nhận ứng trước
                </button>
              )}
            </div>
            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">{trip.customerPhone || "—"}</span>
          </div>
        </td>
        <td className="py-3.5 pr-4"><span className="text-xs text-gray-500 dark:text-gray-400">{trip.date || "—"}</span></td>
        <td className="py-3.5 pr-4"><span className="text-xs text-gray-600 dark:text-gray-300">{trip.plate || "—"}</span></td>
        <td className="py-3.5 pr-4"><span className="text-xs text-gray-600 dark:text-gray-300">{trip.driverName || "—"}</span></td>
        <td className="py-3.5 pr-4 overflow-hidden">
          {trip.isMultiShipment ? (
            <span className="text-xs text-gray-500 dark:text-gray-400 truncate block">{trip.route || "—"}</span>
          ) : (
            <RouteStops pickups={trip.pickupAddresses} deliveries={trip.deliveryAddresses} className="text-xs text-gray-500 dark:text-gray-400 min-w-0 max-w-full" />
          )}
        </td>
        <td className="py-3.5 pr-4">
          <div className="flex flex-col">
            <span className="text-sm font-bold text-gray-800 dark:text-gray-100">{money(trip.fare)}</span>
            {trip.trips?.some((s) => s.returning_at) ? (
              <span className="text-[10px] font-semibold text-orange-600 dark:text-orange-300">Có chuyến hoàn hàng · ×2 cước</span>
            ) : null}
          </div>
        </td>
        <td className="py-3.5 pr-4" onClick={(e) => e.stopPropagation()}>
          <StatusBadge status={trip.statusClass} />
        </td>
        <td className="py-3.5 pr-5" onClick={(e) => e.stopPropagation()}>
          <div className="flex gap-1.5 justify-end">
            <Button size="sm" variant="flat" color="default" className="h-8 px-3 text-xs gap-1.5 overflow-visible" onPress={() => onDetail(trip)}>
              <RiEyeLine size={16} className="shrink-0 overflow-visible" />
              <span>Chi tiết</span>
            </Button>
            <Button size="sm" variant="flat" color="primary" className="h-8 px-3 text-xs gap-1.5 overflow-visible" isDisabled={!canEditTrip(trip)} onPress={() => onEdit(trip)}>
              <RiPencilLine size={16} className="shrink-0 overflow-visible" />
              <span>Sửa</span>
            </Button>
            <Button size="sm" variant="flat" color="danger" className="h-8 px-3 text-xs gap-1.5 overflow-visible" isDisabled={!canCancelTrip(trip)} onPress={() => onCancelOrder(trip)}>
              <RiCloseCircleLine size={16} className="shrink-0 overflow-visible" />
              <span>Hủy</span>
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
  onDetail, onEdit, onCancelOrder, onReassignShipment, onCancelShipment, onConfirmPrepaid,
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
        <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-white/10 flex items-center justify-center">
          <RiInboxLine size={26} className="text-gray-400 dark:text-gray-400" />
        </div>
        <p className="text-gray-500 dark:text-gray-400 text-sm">Chưa có đơn hàng. Tạo mới đơn để bắt đầu điều phối.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="rounded-2xl border border-gray-200 dark:border-white/10 overflow-hidden bg-white dark:bg-[#161922]">
        <div className="overflow-x-auto">
        <table className="w-full table-fixed min-w-[1120px]">
          <colgroup>
            <col className="w-10" />
            <col />
            <col className="w-24" />
            <col className="w-24" />
            <col className="w-28" />
            <col className="w-44" />
            <col className="w-32" />
            <col className="w-28" />
            <col className="w-56" />
          </colgroup>
          <thead>
            <tr className="bg-gray-50/80 dark:bg-white/5 border-b border-gray-200 dark:border-white/10">
              {["", "Khách hàng / SĐT", "Ngày", "BKS", "Lái xe", "Hành trình", "Cước xe", "Trạng thái", ""].map((label, i) => (
                <th key={i} className="text-left text-[11px] font-semibold text-gray-400 dark:text-gray-400 uppercase tracking-wider py-3 pr-4 first:pl-5 last:pr-5">
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
                onDetail={onDetail}
                onEdit={onEdit}
                onCancelOrder={onCancelOrder}
                onReassignShipment={onReassignShipment}
                onCancelShipment={onCancelShipment}
                onConfirmPrepaid={onConfirmPrepaid}
              />
            ))}
          </tbody>
        </table>
        </div>
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
