export const getTodayStr = () => new Date().toISOString().slice(0, 10);

export const emptyForm = () => ({
  date: getTodayStr(),
  customer_name: "",
  customer_phone: "",
  cargo_name: "",
  cargo_weight_kg: "",
  prepaid_amount: "",
  note: "",
  is_partner: false,
  partner_name: "",
  trips: [{ vehicle_group_id: "", plate: "", distance: "", pickup_address: "", delivery_address: "", pickup_addresses: [""], delivery_addresses: [""] }],
});

export const requiredFields = [
  { key: "date", label: "Ngày tháng" },
  { key: "customer_phone", label: "SĐT" },
  { key: "cargo_weight_kg", label: "Khối lượng" },
];

export const normalizeNumericText = (value) => String(value ?? "").replace(/,/g, "").trim();
export const normalizeDistanceText = (value) => normalizeNumericText(value).replace(/km$/i, "").trim();
export const isFiniteNumber = (value) => Number.isFinite(Number(value));

export const formatDateForInput = (dateStr) => {
  if (!dateStr) return "";
  const parts = String(dateStr).split('/');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
  const date = new Date(dateStr);
  if (!Number.isNaN(date.getTime())) {
    return date.toISOString().slice(0, 10);
  }
  return "";
};

export const normalizeStatus = (status) => String(status ?? "").trim().toLowerCase();
export const formatCurrency = (value) => `${Number(value || 0).toLocaleString("vi-VN")} đ`;
export const formatNotificationTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("vi-VN");
};

export const expenseTypeOptions = [
  { value: "toll",    label: "Phí cầu đường (khách chịu)" },
  { value: "parking", label: "Phí đỗ xe (khách chịu)" },
  { value: "etc",     label: "Phí ETC (khách chịu)" },
  { value: "fuel",    label: "Xăng dầu / nhiên liệu (cty chịu)" },
  { value: "repair",  label: "Sửa xe (cty chịu)" },
];
export const newReceiptExpense = () => ({
  expense_type: "toll",
  amount: "",
  description: "",
});
export const emptyReceiptForm = () => ({
  notes: "",
  expenses: [],
});

export const STATUS_QUERY = {
  all: "",
  new: "available",
  waiting: "claimed,picking,loaded,transit,arrived,returning",
};
export const ORDER_STATUS_FILTERS = [
  { label: "Tất cả", value: "all" },
  { label: "Mới", value: "new" },
  { label: "Đang xử lý", value: "waiting" },
];
export const canCancelTrip = (trip) => {
  const statuses = Array.isArray(trip.trips) && trip.trips.length > 0
    ? trip.trips.map((item) => normalizeStatus(item.status))
    : [normalizeStatus(trip.status)];
  return Boolean(trip.orderId) && statuses.some((status) => !["completed", "cancelled", "failed"].includes(status));
};
export const canEditTrip = (trip) => {
  const statuses = Array.isArray(trip.trips) && trip.trips.length > 0
    ? trip.trips.map((item) => normalizeStatus(item.status))
    : [normalizeStatus(trip.status)];
  return Boolean(trip.orderId) && statuses.some((status) => !["completed", "cancelled"].includes(status));
};
export const shouldHighlightNoCheckIn = (trip) => {
  const hasCheckInMarker = /(?:^|\|)\s*Chấm công\s*:/i.test(String(trip.notes ?? ""));
  return hasCheckInMarker && !String(trip.checkIn ?? "").trim();
};

export const getDistinctValues = (items, key) => [
  ...new Set(items.map((item) => String(item?.[key] ?? "").trim()).filter(Boolean)),
];

export const getSummaryValue = (items, key, emptyLabel = "-") => {
  const values = getDistinctValues(items, key);
  if (values.length === 0) return emptyLabel;
  if (values.length === 1) return values[0];
  return `${values.length} khác nhau`;
};

export const getOrderStatusLabel = (order, trips) => {
  if (!Array.isArray(trips) || trips.length <= 1) {
    return trips?.[0]?.status || order.status || order.first_shipment_status || order.order_status || "-";
  }
  const statuses = getDistinctValues(trips, "status");
  if (statuses.length === 1) return statuses[0];
  return `${statuses.length} trạng thái`;
};

export const firstStop = (trip, key, fallbackKey) => {
  const list = Array.isArray(trip?.[key]) ? trip[key].map((value) => String(value ?? "").trim()).filter(Boolean) : [];
  if (list.length > 0) return list[0];
  return String(trip?.[fallbackKey] ?? "").trim();
};

export const lastStop = (trip, key, fallbackKey) => {
  const list = Array.isArray(trip?.[key]) ? trip[key].map((value) => String(value ?? "").trim()).filter(Boolean) : [];
  if (list.length > 0) return list[list.length - 1];
  return String(trip?.[fallbackKey] ?? "").trim();
};

export const resolveFareValue = (...values) => {
  for (const value of values) {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue) && numericValue > 0) return numericValue;
  }
  return 0;
};

export function buildTripFromOrder(order) {
  const sourceTrips = Array.isArray(order.trips) && order.trips.length > 0 ? order.trips : [];
  const trips = sourceTrips.length > 0 ? sourceTrips.map((trip, index) => ({
    shipment_id: trip.shipment_id || "",
    shipment_index: trip.shipment_index || index + 1,
    trip_code: trip.trip_code || "",
    vehicle_group_id: trip.vehicle_group_id || "",
    owner_driver_id: trip.owner_driver_id || "",
    vehicle_id: trip.vehicle_id || "",
    plate: trip.plate || "",
    distance: trip.distance ?? "",
    arrived_at: trip.arrived_at || "",
    pickup_address: trip.pickup_address || "",
    delivery_address: trip.delivery_address || "",
    pickup_addresses: Array.isArray(trip.pickup_addresses) ? trip.pickup_addresses : (trip.pickup_address ? [trip.pickup_address] : []),
    delivery_addresses: Array.isArray(trip.delivery_addresses) ? trip.delivery_addresses : (trip.delivery_address ? [trip.delivery_address] : []),
    fare: resolveFareValue(trip.actual_price, trip.fare),
    status: trip.status || "",
    driverName: trip.driverName || "",
  })) : [{
    shipment_id: order.shipment_id || "",
    shipment_index: 1,
    trip_code: order.trip_code || "",
    vehicle_group_id: order.vehicle_group_id || "",
    owner_driver_id: order.owner_driver_id || "",
    vehicle_id: order.vehicle_id || "",
    plate: order.plate_number || "",
    distance: order.estimated_distance_km || "",
    arrived_at: order.arrived_at || "",
    pickup_address: order.pickup_address || "",
    delivery_address: order.delivery_address || "",
    pickup_addresses: Array.isArray(order.pickup_addresses) ? order.pickup_addresses : (order.pickup_address ? [order.pickup_address] : []),
    delivery_addresses: Array.isArray(order.delivery_addresses) ? order.delivery_addresses : (order.delivery_address ? [order.delivery_address] : []),
    fare: resolveFareValue(order.total_actual_price, order.estimated_price, order.total_estimated_price),
    status: order.status || "",
    driverName: order.driver_name || "",
  }];

  const firstTrip = trips[0] || {};
  const pickupAddress = firstStop(firstTrip, "pickup_addresses", "pickup_address") || order.pickup_address || "";
  const deliveryAddress = firstStop(firstTrip, "delivery_addresses", "delivery_address") || order.delivery_address || "";
  const arrivedAt = firstTrip.arrived_at || order.arrived_at;
  const date = (arrivedAt ? new Date(arrivedAt).toLocaleDateString('vi-VN') : "");

  const totalDistance = trips.reduce((sum, t) => sum + (Number(t.distance) || 0), 0);
  const totalFare = trips.reduce((sum, t) => sum + resolveFareValue(t.fare), 0);
  const isMultiShipment = trips.length > 1;

  return {
    id: `#${order.id}`,
    orderId: order.id,
    rowType: "order",
    shipmentCount: trips.length,
    orderStatus: order.order_status || order.derived_status || "",
    statusLabel: getOrderStatusLabel(order, trips),
    date,
    dateInput: arrivedAt ? String(arrivedAt).substring(0, 10) : (order.created_at ? String(order.created_at).substring(0, 10) : ""),
    checkIn: "",
    plate: isMultiShipment ? `${trips.length} chuyến` : (firstTrip.plate || order.plate_number || ""),
    driverId: firstTrip.owner_driver_id || order.owner_driver_id || "",
    vehicleGroupId: firstTrip.vehicle_group_id || order.vehicle_group_id || "",
    driverName: isMultiShipment ? getSummaryValue(trips, "driverName", "Chưa gán") : (firstTrip.driverName || order.driver_name || ""),
    customerName: order.customer_name || "",
    customerPhone: order.customer_phone || "",
    cargoName: order.cargo_name || "",
    cargoWeightKg: order.cargo_weight_kg || "",
    prepaidAmount: order.prepaid_amount || "",
    pickupAddress,
    deliveryAddress,
    route: isMultiShipment
      ? `${trips.length} chuyến - mở chi tiết để xem từng chuyến`
      : (pickupAddress && deliveryAddress ? `${pickupAddress} - ${deliveryAddress}` : order.cargo_name || ""),
    distance: totalDistance || order.estimated_distance_km || "",
    fare: resolveFareValue(totalFare, order.total_actual_price, order.estimated_price, order.total_estimated_price),
    status: getOrderStatusLabel(order, trips),
    statusClass: isMultiShipment ? "partial" : normalizeStatus(firstTrip.status || order.status || order.first_shipment_status || order.order_status),
    notes: order.notes,
    is_partner: !!order.partner_name,
    partner_name: order.partner_name || "",
    trips,
  };
}
