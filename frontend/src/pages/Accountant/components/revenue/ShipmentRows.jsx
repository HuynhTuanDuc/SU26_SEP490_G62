import { Spinner } from "@heroui/react";
import { RiMapPin2Line, RiArrowRightLine, RiTruckLine, RiCheckboxCircleLine, RiTimeLine } from "react-icons/ri";
import { MoneyText } from "../shared/MoneyText";

function ShipmentRow({ shipment }) {
  const pickup   = shipment.pickup_addresses?.[0]?.address ?? "—";
  const delivery = shipment.delivery_address ?? "—";

  // Trạng thái nộp tiền của tài xế: paid / partial / unpaid
  const driverTotal     = Number(shipment.driver_total || 0);
  const driverPaid      = Number(shipment.driver_paid || 0);
  const driverRemaining = Math.max(0, driverTotal - driverPaid);
  const payState = shipment.driver_payment_state
    ?? (driverRemaining <= 0.01 ? "paid" : driverPaid > 0 ? "partial" : "unpaid");

  return (
    <tr className="bg-blue-50/30 border-b border-blue-100/40 last:border-0">
      {}
      <td className="py-3 pl-4" />

      {}
      <td className="py-3 pr-4">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center justify-center w-5 h-5 flex-shrink-0
                           rounded-full bg-blue-100 text-[10px] font-bold text-blue-500">
            {shipment.shipment_index}
          </span>
          <div className="flex items-center gap-1 text-xs text-gray-500 min-w-0">
            <RiMapPin2Line size={11} className="text-green-500 flex-shrink-0" />
            <span className="truncate max-w-[90px]">{pickup}</span>
            <RiArrowRightLine size={11} className="text-gray-300 flex-shrink-0" />
            <RiMapPin2Line size={11} className="text-red-400 flex-shrink-0" />
            <span className="truncate max-w-[90px]">{delivery}</span>
          </div>
        </div>
      </td>

      {}
      <td className="py-3 pr-4" />

      {}
      <td className="py-3 pr-4">
        <div className="flex items-center gap-1.5">
          <RiTruckLine size={12} className="text-gray-400 flex-shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="text-[11px] font-medium text-gray-600 truncate">
              {shipment.driver_name ?? "—"}
            </span>
            {shipment.vehicle_plate && (
              <span className="text-[10px] text-gray-400 font-mono">{shipment.vehicle_plate}</span>
            )}
          </div>
        </div>
      </td>

      {}
      <td className="py-3 pr-4">
        <div className="flex flex-col gap-0.5">
          <MoneyText
            amount={Number(shipment.actual_price || shipment.cargo_fee || 0) + Number(shipment.pass_through_total || 0)}
            className="text-xs font-semibold text-gray-700"
          />
          {Number(shipment.pass_through_total) > 0 && (
            <span className="text-[10px] text-gray-400">
              gồm chi hộ <MoneyText amount={shipment.pass_through_total} />
            </span>
          )}
        </div>
      </td>

      {}
      <td className="py-3 pr-4">
        {driverTotal > 0 ? (
          <div className="flex items-center gap-1">
            {payState === "paid"
              ? <RiCheckboxCircleLine size={13} className="text-emerald-500" />
              : <RiTimeLine size={13} className={payState === "partial" ? "text-orange-500" : "text-amber-500"} />
            }
            <div className="flex flex-col">
              <span className={`text-[11px] font-semibold ${
                payState === "paid" ? "text-emerald-600"
                  : payState === "partial" ? "text-orange-600"
                  : "text-amber-600"
              }`}>
                {payState === "paid" ? "Đã nộp đủ"
                  : payState === "partial" ? "Nộp 1 phần"
                  : "Chưa nộp"}
              </span>
              {payState === "partial" ? (
                <span className="text-[10px] text-gray-400">
                  đã nộp <MoneyText amount={driverPaid} /> · còn <MoneyText amount={driverRemaining} />
                </span>
              ) : (
                <MoneyText amount={driverTotal} className="text-[10px] text-gray-400" />
              )}
            </div>
          </div>
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </td>

      {}
      <td className="py-3 pr-4" />
    </tr>
  );
}

export function ShipmentRows({ shipments, isLoading }) {
  if (isLoading) {
    return (
      <tr>
        <td colSpan={7} className="py-4 text-center bg-blue-50/20">
          <Spinner size="sm" color="primary" />
        </td>
      </tr>
    );
  }

  if (!shipments || shipments.length === 0) {
    return (
      <tr>
        <td colSpan={7} className="py-3 pl-12 text-xs text-gray-400 italic bg-blue-50/20">
          Không có chuyến xe nào.
        </td>
      </tr>
    );
  }

  return shipments.map((s) => <ShipmentRow key={s.id} shipment={s} />);
}
