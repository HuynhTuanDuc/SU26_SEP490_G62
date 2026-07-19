import { forwardRef, useDeferredValue, useEffect, useImperativeHandle, useMemo, useState } from "react";
import {
  Button, Input, Tabs, Tab,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Select, SelectItem, Textarea,
} from "@heroui/react";
import { RiRefreshLine } from "react-icons/ri";
import OrderFormModal from "../modals/OrderFormModal";
import { OrdersTable } from "../components/OrdersTable";
import { coordinatorService } from "../services/coordinator.service";
import {
  ORDER_STATUS_FILTERS,
  STATUS_QUERY,
  buildTripFromOrder,
  emptyForm,
  formatDateForInput,
  isFiniteNumber,
  normalizeDistanceText,
  normalizeNumericText,
  requiredFields,
  resolveFareValue,
} from "../utils";

const OrdersView = forwardRef(function OrdersView({ search, refreshKey }, ref) {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [activeTab, setActiveTab] = useState("all");
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [sortBy, setSortBy] = useState("");

  const [drivers, setDrivers] = useState([]);
  const [vehicleGroups, setVehicleGroups] = useState([]);
  const [partners, setPartners] = useState([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState({});

  const [reassignTarget, setReassignTarget] = useState(null);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [reassignBusy, setReassignBusy] = useState(false);

  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelBusy, setCancelBusy] = useState(false);

  const deferredSearch = useDeferredValue(search);

  const loadOrders = async (page = pagination.page) => {
    setLoading(true);
    try {
      const params = {
        page: String(page),
        limit: String(pagination.limit),
      };
      if (deferredSearch.trim()) params.search = deferredSearch.trim().replace(/\s+/g, " ");
      if (STATUS_QUERY[activeTab]) params.status = STATUS_QUERY[activeTab];
      if (dateFromFilter) params.dateFrom = dateFromFilter;
      if (dateToFilter) params.dateTo = dateToFilter;
      if (customerFilter.trim()) params.customer = customerFilter.trim();
      if (sortBy) params.sort = sortBy;

      const data = await coordinatorService.getOrders(params);
      const dbTrips = (data.orders || []).map(buildTripFromOrder);
      setTrips(dbTrips);
      setPagination(data.pagination || { page, limit: pagination.limit, total: dbTrips.length, totalPages: 1 });
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, customerFilter, dateFromFilter, dateToFilter, sortBy, deferredSearch, refreshKey]);

  useEffect(() => {
    coordinatorService.getVehicleGroups().then((data) => setVehicleGroups(data.vehicleGroups || [])).catch(() => {});
    coordinatorService.getDrivers().then((data) => setDrivers(data.drivers || [])).catch(() => {});
    coordinatorService.getPartners().then((data) => setPartners(data.partners || [])).catch(() => {});
  }, []);

  const closeOrderModal = () => {
    setCreateOpen(false);
    setEditingTrip(null);
    setForm(emptyForm());
    setFormErrors({});
  };

  const openCreateModal = () => {
    setEditingTrip(null);
    setForm(emptyForm());
    setFormErrors({});
    setCreateOpen(true);
  };

  useImperativeHandle(ref, () => ({ openCreateModal }));

  const openEditModal = (trip) => {
    const mappedTrips = Array.isArray(trip?.trips) && trip.trips.length > 0
      ? trip.trips.map((shipment) => {
        const pickupAddresses = Array.isArray(shipment.pickup_addresses) && shipment.pickup_addresses.length > 0
          ? shipment.pickup_addresses
          : [shipment.pickup_address || ""];
        const deliveryAddresses = Array.isArray(shipment.delivery_addresses) && shipment.delivery_addresses.length > 0
          ? shipment.delivery_addresses
          : [shipment.delivery_address || ""];
        return {
          vehicle_group_id: shipment.vehicle_group_id || trip.vehicleGroupId || "",
          plate: shipment.plate || "",
          distance: shipment.distance ?? "",
          price: shipment.fare || "",
          pickup_address: pickupAddresses[0] || shipment.pickup_address || "",
          delivery_address: deliveryAddresses[0] || shipment.delivery_address || "",
          pickup_addresses: pickupAddresses,
          delivery_addresses: deliveryAddresses,
        };
      })
      : [{
        vehicle_group_id: trip.vehicleGroupId || "",
        plate: trip.plate || "",
        distance: trip.distance ?? "",
        price: trip.fare || "",
        pickup_address: trip.pickupAddress || "",
        delivery_address: trip.deliveryAddress || "",
        pickup_addresses: [trip.pickupAddress || ""],
        delivery_addresses: [trip.deliveryAddress || ""],
      }];

    setEditingTrip(trip);
    setForm({
      date: formatDateForInput(trip.dateInput || trip.date),
      customer_name: trip.customerName || "",
      customer_phone: trip.customerPhone || "",
      cargo_name: trip.cargoName || "",
      cargo_weight_kg: trip.cargoWeightKg || "",
      prepaid_amount: trip.prepaidAmount || "",
      note: trip.notes || "",
      is_partner: !!trip.is_partner,
      partner_name: trip.partner_name || "",
      trips: mappedTrips,
    });
    setFormErrors({});
    setCreateOpen(true);
  };

  const validateOrderForm = () => {
    const nextErrors = {};
    const trimmedPhone = String(form.customer_phone || "").replace(/\s+/g, "");
    const normalizedWeight = normalizeNumericText(form.cargo_weight_kg);

    requiredFields.forEach(({ key, label }) => {
      if (!String(form[key] ?? "").trim()) nextErrors[key] = `${label} là bắt buộc.`;
    });

    if (trimmedPhone && !/^\d{7,15}$/.test(trimmedPhone)) {
      nextErrors.customer_phone = "Số điện thoại không hợp lệ.";
    }
    if (normalizedWeight && (!isFiniteNumber(normalizedWeight) || Number(normalizedWeight) < 0)) {
      nextErrors.cargo_weight_kg = "Khối lượng phải là số hợp lệ.";
    }
    if (normalizeNumericText(form.prepaid_amount) && (!isFiniteNumber(normalizeNumericText(form.prepaid_amount)) || Number(normalizeNumericText(form.prepaid_amount)) < 0)) {
      nextErrors.prepaid_amount = "Số tiền ứng trước phải là số không âm.";
    }
    if (form.is_partner && !String(form.partner_name || "").trim()) {
      nextErrors.partner_name = "Vui lòng chọn đối tác.";
    }

    form.trips.forEach((trip, index) => {
      const normalizedDistance = normalizeDistanceText(trip.distance);
      if (!normalizedDistance) {
        nextErrors[`trip_${index}_distance`] = "Quãng đường là bắt buộc.";
      } else if (!isFiniteNumber(normalizedDistance) || Number(normalizedDistance) <= 0) {
        nextErrors[`trip_${index}_distance`] = "Quãng đường phải lớn hơn 0.";
      }
      const pickupAddress = String(trip.pickup_address || trip.pickup_addresses?.[0] || "").trim();
      const deliveryAddress = String(trip.delivery_address || trip.delivery_addresses?.[0] || "").trim();
      if (!pickupAddress) nextErrors[`trip_${index}_pickup_address`] = "Điểm lấy hàng là bắt buộc.";
      if (!deliveryAddress) nextErrors[`trip_${index}_delivery_address`] = "Điểm giao hàng là bắt buộc.";
    });

    return nextErrors;
  };

  const buildOrderPayload = () => {
    const normalizedTrips = form.trips.map((trip) => {
      const pickupAddresses = (Array.isArray(trip.pickup_addresses) ? trip.pickup_addresses : [trip.pickup_address])
        .map((value) => String(value || "").trim()).filter(Boolean);
      const deliveryAddresses = (Array.isArray(trip.delivery_addresses) ? trip.delivery_addresses : [trip.delivery_address])
        .map((value) => String(value || "").trim()).filter(Boolean);

      const manualPrice = normalizeNumericText(trip.price);

      return {
        vehicle_group_id: Number(trip.vehicle_group_id),
        plate: String(trip.plate || "").trim(),
        distance: Number(normalizeDistanceText(trip.distance)),
        price: manualPrice ? Number(manualPrice) : null,
        pickup_address: pickupAddresses[0] || "",
        delivery_address: deliveryAddresses[0] || "",
        pickup_addresses: pickupAddresses,
        delivery_addresses: deliveryAddresses,
      };
    });

    const firstTrip = normalizedTrips[0] || {};

    return {
      date: form.date,
      customer_name: String(form.customer_name || "").trim(),
      customer_phone: String(form.customer_phone || "").trim(),
      cargo_name: String(form.cargo_name || "").trim(),
      cargo_weight_kg: normalizeNumericText(form.cargo_weight_kg) ? Number(normalizeNumericText(form.cargo_weight_kg)) : "",
      prepaid_amount: normalizeNumericText(form.prepaid_amount) ? Number(normalizeNumericText(form.prepaid_amount)) : 0,
      notes: String(form.note || "").trim(),
      is_partner: !!form.is_partner,
      partner_name: form.is_partner ? String(form.partner_name || "").trim() : "",
      pickup_address: firstTrip.pickup_address || "",
      delivery_address: firstTrip.delivery_address || "",
      trips: normalizedTrips,
    };
  };

  const handleCreateOrder = async () => {
    const nextErrors = validateOrderForm();
    setFormErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setCreating(true);
    try {
      const payload = buildOrderPayload();
      if (editingTrip) {
        await coordinatorService.updateOrder(editingTrip.orderId, payload);
      } else {
        await coordinatorService.createOrder(payload);
      }
      closeOrderModal();
      await loadOrders(editingTrip ? pagination.page : 1);
    } catch (error) {
      alert(error.message || "Không thể lưu đơn hàng.");
    } finally {
      setCreating(false);
    }
  };

  const handleCancelOrder = async (trip) => {
    if (!trip?.orderId) return;
    const confirmed = window.confirm(`Bạn có chắc muốn hủy đơn #${trip.orderId}?`);
    if (!confirmed) return;
    try {
      await coordinatorService.cancelOrder(trip.orderId, "Coordinator cancelled order");
      await loadOrders(pagination.page);
    } catch (error) {
      alert(error.message || "Không thể hủy đơn hàng.");
    }
  };

  const closeReassignModal = () => { setReassignTarget(null); setSelectedDriver(null); };
  const closeCancelModal = () => { setCancelTarget(null); setCancelReason(""); };

  const submitReassignShipment = async () => {
    if (!reassignTarget || !selectedDriver) return;
    setReassignBusy(true);
    try {
      await coordinatorService.reassignShipment(reassignTarget, Number(selectedDriver));
      closeReassignModal();
      await loadOrders(pagination.page);
    } catch (error) {
      alert(error.message || "Không thể điều chuyển chuyến.");
    } finally {
      setReassignBusy(false);
    }
  };

  const submitCancelShipment = async () => {
    if (!cancelTarget || !cancelReason.trim()) return;
    setCancelBusy(true);
    try {
      await coordinatorService.cancelShipment(cancelTarget, cancelReason.trim());
      closeCancelModal();
      await loadOrders(pagination.page);
    } catch (error) {
      alert(error.message || "Không thể hủy chuyến.");
    } finally {
      setCancelBusy(false);
    }
  };

  function getAvailablePlates(vehicleGroupId) {
    const group = vehicleGroups.find((item) => String(item.id) === String(vehicleGroupId));
    return Array.isArray(group?.vehicles) ? group.vehicles : [];
  }

  // Giá gợi ý = quãng đường × đơn giá nhóm xe — coordinator có thể ghi đè bằng trip.price
  function getSuggestedFare(trip) {
    const group = vehicleGroups.find((item) => String(item.id) === String(trip?.vehicle_group_id));
    const distance = Number(normalizeDistanceText(trip?.distance));
    if (!group || !Number.isFinite(distance) || distance <= 0) return 0;
    return distance * Number(group.price_per_km || 0);
  }

  function getTripFare(trip) {
    const manual = Number(trip?.price);
    if (Number.isFinite(manual) && manual > 0) return manual;
    return getSuggestedFare(trip);
  }

  const totalFare = useMemo(
    () => form.trips.reduce((sum, trip) => sum + resolveFareValue(getTripFare(trip)), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form.trips, vehicleGroups],
  );

  const updateField = (key, value) => {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "is_partner" && !value) next.partner_name = "";
      return next;
    });
    setFormErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const updateTripField = (tripIndex, key, value) => {
    setForm((current) => ({
      ...current,
      trips: current.trips.map((trip, index) => {
        if (index !== tripIndex) return trip;
        const nextTrip = { ...trip, [key]: value };
        if (key === "pickup_address") nextTrip.pickup_addresses = [value, ...(trip.pickup_addresses || []).slice(1)];
        if (key === "delivery_address") nextTrip.delivery_addresses = [value, ...(trip.delivery_addresses || []).slice(1)];
        return nextTrip;
      }),
    }));
    setFormErrors((current) => {
      const errorKey = `trip_${tripIndex}_${key}`;
      if (!current[errorKey]) return current;
      const next = { ...current };
      delete next[errorKey];
      return next;
    });
  };

  const updateTripStopList = (tripIndex, key, stopIndex, value) => {
    setForm((current) => ({
      ...current,
      trips: current.trips.map((trip, index) => {
        if (index !== tripIndex) return trip;
        const source = Array.isArray(trip[key]) && trip[key].length > 0 ? [...trip[key]] : [""];
        source[stopIndex] = value;
        return {
          ...trip,
          [key]: source,
          ...(key === "pickup_addresses" && stopIndex === 0 ? { pickup_address: value } : {}),
          ...(key === "delivery_addresses" && stopIndex === 0 ? { delivery_address: value } : {}),
        };
      }),
    }));
  };

  const addTripStop = (tripIndex, key) => {
    setForm((current) => ({
      ...current,
      trips: current.trips.map((trip, index) => {
        if (index !== tripIndex) return trip;
        const source = Array.isArray(trip[key]) ? trip[key] : [];
        return { ...trip, [key]: [...source, ""] };
      }),
    }));
  };

  const removeTripStop = (tripIndex, key, stopIndex) => {
    setForm((current) => ({
      ...current,
      trips: current.trips.map((trip, index) => {
        if (index !== tripIndex) return trip;
        const source = Array.isArray(trip[key]) ? trip[key] : [];
        const nextStops = source.filter((_, currentStopIndex) => currentStopIndex !== stopIndex);
        const normalizedStops = nextStops.length > 0 ? nextStops : [""];
        return {
          ...trip,
          [key]: normalizedStops,
          ...(key === "pickup_addresses" ? { pickup_address: normalizedStops[0] || "" } : {}),
          ...(key === "delivery_addresses" ? { delivery_address: normalizedStops[0] || "" } : {}),
        };
      }),
    }));
  };

  const addTrip = () => {
    setForm((current) => ({
      ...current,
      trips: [...current.trips, {
        vehicle_group_id: "", plate: "", distance: "", price: "",
        pickup_address: "", delivery_address: "",
        pickup_addresses: [""], delivery_addresses: [""],
      }],
    }));
  };

  const removeTrip = (tripIndex) => {
    setForm((current) => {
      if (current.trips.length <= 1) return current;
      return { ...current, trips: current.trips.filter((_, index) => index !== tripIndex) };
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-wrap items-end gap-3">
        <Input type="date" label="Từ ngày" value={dateFromFilter} onValueChange={setDateFromFilter} variant="bordered" size="sm" className="w-40" />
        <Input type="date" label="Đến ngày" value={dateToFilter} onValueChange={setDateToFilter} variant="bordered" size="sm" className="w-40" />
        <Input label="Khách hàng" placeholder="Lọc theo khách hàng" value={customerFilter} onValueChange={setCustomerFilter} variant="bordered" size="sm" className="w-56" />
        <Select label="Sắp xếp" selectedKeys={new Set([sortBy])} onSelectionChange={(keys) => setSortBy([...keys][0] ?? "")} variant="bordered" size="sm" className="w-48">
          <SelectItem key="" textValue="Mới nhất">Mới nhất</SelectItem>
          <SelectItem key="oldest" textValue="Cũ nhất">Cũ nhất</SelectItem>
          <SelectItem key="value-desc" textValue="Giá trị cao nhất">Giá trị cao nhất</SelectItem>
          <SelectItem key="value-asc" textValue="Giá trị thấp nhất">Giá trị thấp nhất</SelectItem>
        </Select>
        <Button
          variant="flat"
          size="sm"
          startContent={<RiRefreshLine size={14} />}
          onPress={() => { setDateFromFilter(""); setDateToFilter(""); setCustomerFilter(""); setSortBy(""); }}
        >
          Xóa lọc
        </Button>
        <div className="ml-auto">
          <Tabs selectedKey={activeTab} onSelectionChange={setActiveTab} color="primary" size="sm">
            {ORDER_STATUS_FILTERS.map((f) => <Tab key={f.value} title={f.label} />)}
          </Tabs>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <div className="text-sm font-bold text-gray-800">Danh sách đơn hàng</div>
            <div className="text-xs text-gray-400">Bấm vào 1 dòng để xem các chuyến bên trong đơn (nếu có nhiều chuyến).</div>
          </div>
          <span className="text-xs text-gray-400">{pagination.total ? `${pagination.total} đơn` : `${trips.length} đơn`}</span>
        </div>

        <OrdersTable
          trips={trips}
          loading={loading}
          pagination={pagination}
          onPageChange={(page) => loadOrders(page)}
          onEdit={openEditModal}
          onCancelOrder={handleCancelOrder}
          onReassignShipment={(shipmentId) => setReassignTarget(shipmentId)}
          onCancelShipment={(shipmentId) => setCancelTarget(shipmentId)}
        />
      </div>

      <OrderFormModal
        open={createOpen}
        editingTrip={editingTrip}
        form={form}
        formErrors={formErrors}
        vehicleGroups={vehicleGroups}
        partners={partners}
        creating={creating}
        totalFare={totalFare}
        onClose={closeOrderModal}
        onSubmit={handleCreateOrder}
        updateField={updateField}
        updateTripField={updateTripField}
        updateTripStopList={updateTripStopList}
        addTripStop={addTripStop}
        removeTripStop={removeTripStop}
        addTrip={addTrip}
        removeTrip={removeTrip}
        getAvailablePlates={getAvailablePlates}
        getTripFare={getTripFare}
        getSuggestedFare={getSuggestedFare}
      />

      <Modal isOpen={!!reassignTarget} onOpenChange={(isOpen) => !isOpen && closeReassignModal()} size="sm">
        <ModalContent>
          <ModalHeader>Điều chuyển chuyến #{reassignTarget}</ModalHeader>
          <ModalBody>
            <Select
              label="Tài xế thay thế"
              placeholder="Chọn tài xế"
              selectedKeys={selectedDriver ? [selectedDriver] : []}
              onSelectionChange={(keys) => setSelectedDriver([...keys][0] ?? null)}
              variant="bordered"
            >
              {drivers.map((d) => <SelectItem key={String(d.id)}>{d.full_name || d.name}</SelectItem>)}
            </Select>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={closeReassignModal}>Đóng</Button>
            <Button color="primary" isDisabled={!selectedDriver} isLoading={reassignBusy} onPress={submitReassignShipment}>
              Điều chuyển
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={!!cancelTarget} onOpenChange={(isOpen) => !isOpen && closeCancelModal()} size="sm">
        <ModalContent>
          <ModalHeader>Hủy chuyến #{cancelTarget}</ModalHeader>
          <ModalBody>
            <Textarea
              label="Lý do hủy chuyến"
              placeholder="Bắt buộc nhập lý do"
              value={cancelReason}
              onValueChange={setCancelReason}
              minRows={3}
              variant="bordered"
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={closeCancelModal}>Đóng</Button>
            <Button color="danger" isDisabled={!cancelReason.trim()} isLoading={cancelBusy} onPress={submitCancelShipment}>
              Hủy chuyến
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
});

export default OrdersView;
