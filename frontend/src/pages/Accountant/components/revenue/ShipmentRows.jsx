import { Spinner } from "@heroui/react";
import { RiMapPin2Line, RiArrowRightLine, RiTruckLine, RiCheckboxCircleLine, RiTimeLine } from "react-icons/ri";
import { MoneyText } from "../shared/MoneyText";

function ShipmentRow({ shipment }) {
  const pickup   = shipment.pickup_addresses?.[0]?.address ?? "—";
  const delivery = shipment.delivery_address ?? "—";
  const settled  = shipment.driver_payment_state === "cleared" || shipment.driver_payment_state === "settled";

  return (
    <tr className="bg-blue-50/30 border-b border-blue-100/40 last:border-0">
      {/* Index badge */}
      <td className="pl-10 py-3 w-9">
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full
                         bg-blue-100 text-[10px] font-bold text-blue-500">
          {shipment.shipment_index}
        </span>
      </td>

      {/* Route */}
      <td className="py-3 pr-4">
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <RiMapPin2Line size={11} className="text-green-500 flex-shrink-0" />
          <span className="truncate max-w-[110px]">{pickup}</span>
          <RiArrowRightLine size={11} className="text-gray-300 flex-shrink-0" />
          <RiMapPin2Line size={11} className="text-red-400 flex-shrink-0" />
          <span className="truncate max-w-[110px]">{delivery}</span>
        </div>
      </td>

      {/* Date spacer */}
      <td className="py-3 w-28" />

      {/* Driver / Vehicle */}
      <td className="py-3 pr-4 w-16">
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

      {/* Cước */}
      <td className="py-3 pr-4">
        <MoneyText
          amount={shipment.actual_price || shipment.cargo_fee}
          className="text-xs font-semibold text-gray-700"
        />
      </td>

      {/* Driver state */}
      <td className="py-3 pr-4">
        {shipment.driver_total ? (
          <div className="flex items-center gap-1">
            {settled
              ? <RiCheckboxCircleLine size={13} className="text-emerald-500" />
              : <RiTimeLine size={13} className="text-amber-500" />
            }
            <div className="flex flex-col">
              <span className={`text-[11px] font-semibold ${settled ? "text-emerald-600" : "text-amber-600"}`}>
                {settled ? "Đã nộp" : "Chưa nộp"}
              </span>
              <MoneyText amount={shipment.driver_total} className="text-[10px] text-gray-400" />
            </div>
          </div>
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </td>

      {/* Empty actions col */}
      <td className="py-3 w-20" />
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
        <td colSpan={7} className="py-3 pl-10 text-xs text-gray-400 italic bg-blue-50/20">
          Không có chuyến xe nào.
        </td>
      </tr>
    );
  }

  return shipments.map((s) => <ShipmentRow key={s.id} shipment={s} />);
}
