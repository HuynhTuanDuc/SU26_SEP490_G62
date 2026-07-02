import { forwardRef, useDeferredValue, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { Button, DatePicker, Input, Segmented, Table, Tag, message } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { apiRequest } from "../../services/apiClient";
import OrderFormModal from "./components/OrderFormModal";
import StatusTag from "./components/StatusTag";
import {
  ORDER_STATUS_FILTERS,
  STATUS_QUERY,
  buildTripFromOrder,
  canCancelTrip,
  emptyForm,
  formatCurrency,
  formatDateForInput,
  isFiniteNumber,
  lastStop,
  firstStop,
  normalizeDistanceText,
  normalizeNumericText,
  requiredFields,
  resolveFareValue,
  shouldHighlightNoCheckIn,
} from "./utils";

const { RangePicker } = DatePicker;

const OrdersPage = forwardRef(function OrdersPage({ search, refreshKey }, ref) {
  const [trips, setTrips] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [activeTab, setActiveTab] = useState("all");
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [expandedRowKeys, setExpandedRowKeys] = useState([]);

  const [drivers, setDrivers] = useState([]);
  const [vehicleGroups, setVehicleGroups] = useState([]);
  const [partners, setPartners] = useState([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState({});

  const deferredSearch = useDeferredValue(search);

  const loadOrders = async (page = pagination.page) => {
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pagination.limit),
      });
      if (deferredSearch.trim()) params.set("search", deferredSearch.trim().replace(/\s+/g, " "));
      if (STATUS_QUERY[activeTab]) params.set("status", STATUS_QUERY[activeTab]);
      if (dateFromFilter) params.set("dateFrom", dateFromFilter);
      if (dateToFilter) params.set("dateTo", dateToFilter);
      if (customerFilter.trim()) params.set("customer", customerFilter.trim());

      const data = await apiRequest(`/api/orders?${params.toString()}`);
      const dbTrips = (data.orders || []).map(buildTripFromOrder);
      setTrips(dbTrips);
      setPagination(data.pagination || { page, limit: pagination.limit, total: dbTrips.length, totalPages: 1 });
    } catch (error) {
      message.error(error.message || "Không thể load danh sách đơn.");
    }
  };

  useEffect(() => {
    loadOrders(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, customerFilter, dateFromFilter, dateToFilter, deferredSearch, refreshKey]);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiRequest("/api/coordinator/vehicle-groups");
        setVehicleGroups(data.vehicleGroups || []);
      } catch {
        message.error("Không thể tải danh sách nhóm xe/BKS.");
      }
    })();
    (async () => {
      try {
        const data = await apiRequest("/api/drivers");
        setDrivers(data.drivers || []);
      } catch {
        message.error("Không thể tải danh sách tài xế.");
      }
    })();
    (async () => {
      try {
        const data = await apiRequest("/api/coordinator/partners");
        setPartners(data.partners || []);
      } catch {
        message.error("Không thể tải danh sách đối tác.");
      }
    })();
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
      if (!String(form[key] ?? "").trim()) {
        nextErrors[key] = `${label} là bắt buộc.`;
      }
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
      if (!pickupAddress) {
        nextErrors[`trip_${index}_pickup_address`] = "Điểm lấy hàng là bắt buộc.";
      }
      if (!deliveryAddress) {
        nextErrors[`trip_${index}_delivery_address`] = "Điểm giao hàng là bắt buộc.";
      }
    });

    return nextErrors;
  };

  const buildOrderPayload = () => {
    const normalizedTrips = form.trips.map((trip) => {
      const pickupAddresses = (Array.isArray(trip.pickup_addresses) ? trip.pickup_addresses : [trip.pickup_address])
        .map((value) => String(value || "").trim())
        .filter(Boolean);
      const deliveryAddresses = (Array.isArray(trip.delivery_addresses) ? trip.delivery_addresses : [trip.delivery_address])
        .map((value) => String(value || "").trim())
        .filter(Boolean);

      return {
        vehicle_group_id: Number(trip.vehicle_group_id),
        plate: String(trip.plate || "").trim(),
        distance: Number(normalizeDistanceText(trip.distance)),
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

  const handleCreateOrder = async (event) => {
    event.preventDefault();

    const nextErrors = validateOrderForm();
    setFormErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setCreating(true);
    try {
      const payload = buildOrderPayload();
      const method = editingTrip ? "PATCH" : "POST";
      const path = editingTrip ? `/api/orders/${editingTrip.orderId}` : "/api/orders";
      const data = await apiRequest(path, { method, body: payload });
      message.success(data.message || (editingTrip ? "Cập nhật đơn hàng thành công." : "Tạo đơn hàng thành công."));
      closeOrderModal();
      await loadOrders(editingTrip ? pagination.page : 1);
    } catch (error) {
      message.error(error.message || "Không thể lưu đơn hàng.");
    } finally {
      setCreating(false);
    }
  };

  const handleCancelOrder = async (trip) => {
    if (!trip?.orderId) return;
    const confirmed = window.confirm(`Bạn có chắc muốn hủy đơn #${trip.orderId}?`);
    if (!confirmed) return;

    try {
      const data = await apiRequest(`/api/orders/${trip.orderId}`, {
        method: "DELETE",
        body: { reason: "Coordinator cancelled order" },
      });
      message.success(data.message || "Hủy đơn hàng thành công.");
      await loadOrders(pagination.page);
    } catch (error) {
      message.error(error.message || "Không thể hủy đơn hàng.");
    }
  };

  function getAvailablePlates(vehicleGroupId) {
    const group = vehicleGroups.find((item) => String(item.id) === String(vehicleGroupId));
    return Array.isArray(group?.vehicles) ? group.vehicles : [];
  }

  function getTripFare(trip) {
    const group = vehicleGroups.find((item) => String(item.id) === String(trip?.vehicle_group_id));
    const distance = Number(normalizeDistanceText(trip?.distance));
    if (!group || !Number.isFinite(distance) || distance <= 0) return 0;
    return distance * Number(group.price_per_km || 0);
  }

  const totalFare = useMemo(
    () => form.trips.reduce((sum, trip) => sum + resolveFareValue(getTripFare(trip)), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form.trips, vehicleGroups],
  );

  const updateField = (key, value) => {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "is_partner" && !value) {
        next.partner_name = "";
      }
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
        if (key === "pickup_address") {
          nextTrip.pickup_addresses = [value, ...(trip.pickup_addresses || []).slice(1)];
        }
        if (key === "delivery_address") {
          nextTrip.delivery_addresses = [value, ...(trip.delivery_addresses || []).slice(1)];
        }
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
      trips: [
        ...current.trips,
        {
          vehicle_group_id: "",
          plate: "",
          distance: "",
          pickup_address: "",
          delivery_address: "",
          pickup_addresses: [""],
          delivery_addresses: [""],
        },
      ],
    }));
  };

  const removeTrip = (tripIndex) => {
    setForm((current) => {
      if (current.trips.length <= 1) return current;
      return {
        ...current,
        trips: current.trips.filter((_, index) => index !== tripIndex),
      };
    });
  };

  const columns = [
    { title: "Mã đơn", dataIndex: "orderId", key: "orderId", render: (value) => `#${value}` },
    { title: "Ngày", dataIndex: "date", key: "date", render: (value) => value || "-" },
    { title: "BKS", dataIndex: "plate", key: "plate", render: (value) => value || "-" },
    { title: "Lái xe", dataIndex: "driverName", key: "driverName", render: (value) => value || "-" },
    { title: "Khách hàng", dataIndex: "customerName", key: "customerName", render: (value) => value || "-" },
    { title: "Hàng hóa", dataIndex: "cargoName", key: "cargoName", render: (value) => value || "-" },
    { title: "Hành trình", dataIndex: "route", key: "route", render: (value) => value || "-" },
    { title: "Km", dataIndex: "distance", key: "distance", render: (value) => (value ? `${value} km` : "-") },
    { title: "Cước xe", dataIndex: "fare", key: "fare", render: (value) => formatCurrency(value) },
    { title: "Ghi chú", dataIndex: "notes", key: "notes", render: (value) => value || "-" },
    {
      title: "Trạng thái",
      dataIndex: "statusLabel",
      key: "status",
      render: (value, record) => <StatusTag status={record.statusClass || value}>{value}</StatusTag>,
    },
    {
      title: "Thao tác",
      key: "actions",
      render: (_, trip) => (
        <div className="table-actions">
          <Button className="coordinator-table-icon-btn" type="text" onClick={() => openEditModal(trip)}>
            Sửa
          </Button>
          <Button
            className="coordinator-table-icon-btn coordinator-table-icon-btn-danger"
            type="text"
            danger
            disabled={!canCancelTrip(trip)}
            onClick={() => handleCancelOrder(trip)}
          >
            Hủy
          </Button>
        </div>
      ),
    },
  ];

  const subShipmentColumns = [
    { title: "Chuyến", dataIndex: "shipment_index", key: "shipment_index", render: (value, s) => `Chuyến ${value || s.shipment_id}` },
    { title: "Ngày", dataIndex: "arrived_at", key: "arrived_at", render: (value) => (value ? new Date(value).toLocaleDateString("vi-VN") : "-") },
    { title: "BKS", dataIndex: "plate", key: "plate", render: (value) => value || "-" },
    { title: "Lái xe", dataIndex: "driverName", key: "driverName", render: (value) => value || "-" },
    {
      title: "Hành trình",
      key: "route",
      render: (_, shipment) => `${firstStop(shipment, "pickup_addresses", "pickup_address") || "-"} - ${lastStop(shipment, "delivery_addresses", "delivery_address") || "-"}`,
    },
    { title: "Km", dataIndex: "distance", key: "distance", render: (value) => (value ? `${value} km` : "-") },
    { title: "Cước xe", dataIndex: "fare", key: "fare", render: (value) => formatCurrency(value) },
    { title: "Trạng thái", dataIndex: "status", key: "status", render: (value) => <StatusTag status={value} /> },
  ];

  return (
    <>
      <section className="hero">
        <div>
          <h1>Điều phối đơn hàng</h1>
          <p>Theo dõi đơn hàng, lọc nhanh và tạo chuyến mới ngay trong một màn hình.</p>
        </div>
        <div className="filters order-filters">
          <label className="filter-field filter-field-daterange">
            <span>Khoảng ngày</span>
            <RangePicker
              value={[dateFromFilter ? dayjs(dateFromFilter) : null, dateToFilter ? dayjs(dateToFilter) : null]}
              onChange={(_, [from, to]) => {
                setDateFromFilter(from || "");
                setDateToFilter(to || "");
              }}
            />
          </label>
          <label className="filter-field filter-field-customer">
            <span>Khách hàng</span>
            <Input
              value={customerFilter}
              onChange={(event) => setCustomerFilter(event.target.value)}
              placeholder="Lọc theo khách hàng"
            />
          </label>
          <Button
            style={{ marginTop: 20 }}
            type="default"
            icon={<ReloadOutlined />}
            className="coordinator-secondary-btn"
            onClick={() => {
              setDateFromFilter("");
              setDateToFilter("");
              setCustomerFilter("");
            }}
          >
            Xóa lọc
          </Button>
          <Segmented
            style={{ minHeight: 35 }}
            className="coordinator-status-segmented"
            options={ORDER_STATUS_FILTERS}
            value={activeTab}
            onChange={setActiveTab}
          />
        </div>
      </section>

      <section className="orders-panel">
        <div className="panel-head">
          <div>
            <h2>Danh sách đơn hàng</h2>
            <p>Hiển thị đơn hàng đang điều phối để dễ theo dõi và cập nhật.</p>
          </div>
          <div className="upload-hint">{pagination.total ? `${pagination.total} đơn` : `${trips.length} đơn`}</div>
        </div>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={trips}
          rowClassName={(trip) => (shouldHighlightNoCheckIn(trip) ? "row-no-checkin" : "")}
          expandable={{
            expandedRowKeys,
            onExpandedRowsChange: (keys) => setExpandedRowKeys(keys),
            rowExpandable: (trip) => Array.isArray(trip.trips) && trip.trips.length > 1,
            expandedRowRender: (trip) => (
              <Table
                rowKey={(s, index) => s.shipment_id || index}
                columns={subShipmentColumns}
                dataSource={trip.trips}
                pagination={false}
                size="small"
              />
            ),
          }}
          pagination={{
            current: pagination.page,
            pageSize: pagination.limit,
            total: pagination.total,
            showSizeChanger: false,
            onChange: (page) => loadOrders(page),
          }}
          locale={{ emptyText: "Chưa có đơn hàng. Tạo mới đơn để bắt đầu điều phối." }}
          scroll={{ x: true }}
        />
      </section>

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
      />
    </>
  );
});

export default OrdersPage;
