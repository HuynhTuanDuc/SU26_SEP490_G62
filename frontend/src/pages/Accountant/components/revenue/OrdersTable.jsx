import { useState, useCallback } from "react";
import { Button, Pagination, Spinner, Chip } from "@heroui/react";
import {
  RiArrowDownSLine, RiArrowRightSLine, RiBankCard2Line, RiEyeLine,
  RiShipLine, RiInboxLine,
} from "react-icons/ri";
import { MoneyText } from "../shared/MoneyText";
import { ShipmentRows } from "./ShipmentRows";

const DEBT_STATUS_CHIP = {
  paid:    { label: "Đã thu đủ",    color: "success" },
  partial: { label: "Thu một phần", color: "warning" },
  unpaid:  { label: "Chưa thu",     color: "danger"  },
};

function OrderRow({ order, isExpanded, onToggle, shipments, isLoadingShipments, onPayment, onDetail }) {
  const date = order.created_at
    ? new Date(order.created_at).toLocaleDateString("vi-VN", {
        day: "2-digit", month: "2-digit", year: "numeric",
      })
    : "—";

  const debtChip = DEBT_STATUS_CHIP[order.debt_status];

  return (
    <>
      <tr
        className={`border-b border-gray-100 transition-colors cursor-pointer
                   ${isExpanded ? "bg-blue-50/40" : "hover:bg-gray-50/60"}`}
        onClick={onToggle}
      >
        {/* Expand */}
        <td className="py-3.5 pl-4 w-10">
          <span className="text-gray-400">
            {isExpanded
              ? <RiArrowDownSLine size={17} />
              : <RiArrowRightSLine size={17} />
            }
          </span>
        </td>

        {/* Order + Customer */}
        <td className="py-3.5 pr-4">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-gray-800">#{order.id}</span>
              {order.cargo_name && (
                <span className="text-xs text-gray-400 font-normal">{order.cargo_name}</span>
              )}
            </div>
            <span className="text-xs font-medium text-gray-600">{order.customer_name ?? "—"}</span>
            {order.customer_phone && (
              <span className="text-[11px] text-gray-400 font-mono">{order.customer_phone}</span>
            )}
          </div>
        </td>

        {/* Date */}
        <td className="py-3.5 pr-4 w-28">
          <span className="text-xs text-gray-500">{date}</span>
        </td>

        {/* Trips */}
        <td className="py-3.5 pr-4 w-16 text-center">
          <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-600">
            <RiShipLine size={12} className="text-gray-400" />
            {order.shipment_count ?? 0}
          </span>
        </td>

        {/* Revenue */}
        <td className="py-3.5 pr-4">
          <div className="flex flex-col gap-0.5">
            <MoneyText
              amount={order.actual_price || order.estimated_price}
              className="text-sm font-bold text-gray-800"
            />
            {order.actual_price == null && Number(order.estimated_price) > 0 && (
              <span className="text-[10px] text-gray-400 italic">ước tính</span>
            )}
          </div>
        </td>

        {/* Debt status */}
        <td className="py-3.5 pr-4" onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-col gap-1">
            {debtChip && (
              <Chip size="sm" color={debtChip.color} variant="flat" className="text-[11px] h-5">
                {debtChip.label}
              </Chip>
            )}
            {Number(order.driver_debt_remaining) > 0 && (
              <span className="text-[10px] text-amber-600 font-medium">
                TX giữ: <MoneyText amount={order.driver_debt_remaining} />
              </span>
            )}
          </div>
        </td>

        {/* Actions */}
        <td className="py-3.5 pr-4 w-20" onClick={(e) => e.stopPropagation()}>
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="flat"
              isIconOnly
              title="Xem chi tiết"
              className="h-7 w-7 min-w-7 bg-gray-100 text-gray-500 hover:bg-gray-200"
              onPress={() => onDetail(order)}
            >
              <RiEyeLine size={14} />
            </Button>
            <Button
              size="sm"
              color="primary"
              variant="flat"
              isIconOnly
              title="Ghi nhận thanh toán"
              className="h-7 w-7 min-w-7"
              onPress={() => onPayment(order)}
            >
              <RiBankCard2Line size={14} />
            </Button>
          </div>
        </td>
      </tr>

      {isExpanded && (
        <ShipmentRows
          orderId={order.id}
          shipments={shipments}
          isLoading={isLoadingShipments}
        />
      )}
    </>
  );
}

export function OrdersTable({
  orders,
  loading,
  page,
  meta,
  onPageChange,
  shipmentCache,
  isLoadingShipments,
  onExpandOrder,
  onPayment,
  onDetail,
}) {
  const [expandedIds, setExpandedIds] = useState(new Set());

  const toggleExpand = useCallback((order) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(order.id)) {
        next.delete(order.id);
      } else {
        next.add(order.id);
        onExpandOrder(order);
      }
      return next;
    });
  }, [onExpandOrder]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner color="primary" label="Đang tải dữ liệu..." size="lg" />
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center">
          <RiInboxLine size={26} className="text-gray-400" />
        </div>
        <p className="text-gray-500 text-sm">Không có đơn hàng nào.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-gray-200 overflow-hidden bg-white shadow-sm">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50/80 border-b border-gray-200">
              {[
                { label: "",                 cls: "w-10" },
                { label: "Đơn / Khách hàng" },
                { label: "Ngày tạo",         cls: "w-28" },
                { label: "Chuyến",           cls: "w-16 text-center" },
                { label: "Doanh thu" },
                { label: "Trạng thái" },
                { label: "",                 cls: "w-20" },
              ].map(({ label, cls }, i) => (
                <th
                  key={i}
                  className={`text-left text-[11px] font-semibold text-gray-400 uppercase
                             tracking-wider py-3 pr-4 first:pl-4 ${cls ?? ""}`}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <OrderRow
                key={order.id}
                order={order}
                isExpanded={expandedIds.has(order.id)}
                onToggle={() => toggleExpand(order)}
                shipments={shipmentCache[order.id]}
                isLoadingShipments={isLoadingShipments(order.id)}
                onPayment={onPayment}
                onDetail={onDetail}
              />
            ))}
          </tbody>
        </table>
      </div>

      {meta.totalPages > 1 && (
        <div className="flex justify-center">
          <Pagination
            total={meta.totalPages}
            page={page}
            onChange={onPageChange}
            color="primary"
            size="sm"
            showControls
            classNames={{ wrapper: "shadow-sm" }}
          />
        </div>
      )}
    </div>
  );
}
