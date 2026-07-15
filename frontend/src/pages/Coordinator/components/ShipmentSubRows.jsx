import { Button } from "@heroui/react";
import { RiMapPin2Line, RiArrowRightLine, RiTruckLine, RiUserSharedLine, RiCloseCircleLine } from "react-icons/ri";
import { StatusBadge } from "../../../components/shared-ui/StatusBadge";
import { firstStop, lastStop, formatCurrency } from "../utils";

const SHIPMENT_CANCELLABLE = ["available", "claimed", "picking", "transit", "arrived", "returning", "failed"];

function ShipmentSubRow({ shipment, onReassign, onCancel }) {
  const pickup = firstStop(shipment, "pickup_addresses", "pickup_address") || "—";
  const delivery = lastStop(shipment, "delivery_addresses", "delivery_address") || "—";

  return (
    <tr className="bg-blue-50/30 border-b border-blue-100/40 last:border-0">
      <td className="py-3 pl-5" />
      <td className="py-3 pr-4">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center justify-center w-5 h-5 flex-shrink-0 rounded-full bg-blue-100 text-[10px] font-bold text-blue-500">
            {shipment.shipment_index}
          </span>
          <div className="flex items-center gap-1 text-xs text-gray-500 min-w-0">
            <RiMapPin2Line size={11} className="text-green-500 flex-shrink-0" />
            <span className="truncate max-w-[140px]">{pickup}</span>
            <RiArrowRightLine size={11} className="text-gray-300 flex-shrink-0" />
            <RiMapPin2Line size={11} className="text-red-400 flex-shrink-0" />
            <span className="truncate max-w-[140px]">{delivery}</span>
          </div>
        </div>
      </td>
      <td className="py-3 pr-4">
        <div className="flex items-center gap-1.5">
          <RiTruckLine size={12} className="text-gray-400 flex-shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="text-[11px] font-medium text-gray-600 truncate">{shipment.driverName || "—"}</span>
            {shipment.plate && <span className="text-[10px] text-gray-400 font-mono">{shipment.plate}</span>}
          </div>
        </div>
      </td>
      <td className="py-3 pr-4">
        <span className="text-xs text-gray-500">{shipment.distance ? `${shipment.distance} km` : "—"}</span>
      </td>
      <td className="py-3 pr-4">
        <span className="text-xs font-semibold text-gray-700">{formatCurrency(shipment.fare)}</span>
      </td>
      <td className="py-3 pr-4">
        <StatusBadge status={shipment.status} />
      </td>
      <td className="py-3 pr-5">
        <div className="flex gap-1 justify-end">
          <Button
            size="sm"
            variant="flat"
            color="primary"
            startContent={<RiUserSharedLine size={13} />}
            className="h-7 px-2 text-[11px]"
            isDisabled={!shipment.driverName || !SHIPMENT_CANCELLABLE.includes(shipment.status)}
            onPress={() => onReassign(shipment.shipment_id)}
          >
            Điều chuyển
          </Button>
          <Button
            size="sm"
            variant="flat"
            color="danger"
            startContent={<RiCloseCircleLine size={13} />}
            className="h-7 px-2 text-[11px]"
            isDisabled={!SHIPMENT_CANCELLABLE.includes(shipment.status)}
            onPress={() => onCancel(shipment.shipment_id)}
          >
            Hủy
          </Button>
        </div>
      </td>
    </tr>
  );
}

export function ShipmentSubRows({ shipments, onReassign, onCancel }) {
  if (!shipments || shipments.length === 0) {
    return (
      <tr>
        <td colSpan={7} className="py-3 pl-12 text-xs text-gray-400 italic bg-blue-50/20">
          Không có chuyến xe nào.
        </td>
      </tr>
    );
  }

  return shipments.map((s) => (
    <ShipmentSubRow key={s.shipment_id} shipment={s} onReassign={onReassign} onCancel={onCancel} />
  ));
}

export default ShipmentSubRows;
