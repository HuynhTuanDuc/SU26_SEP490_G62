import React, { useDeferredValue, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../services/apiClient";
import "../../styles/Coordinator.css";
import { message as toast } from "antd";

const emptyForm = {
  date: "",
  driver_id: "",
  plate: "",
  customer_name: "",
  customer_phone: "",
  cargo_name: "",
  cargo_weight_kg: "",
  distance: "",
  pickup_address: "",
  delivery_address: "",
  delivery_addresses: "",
  estimated_price: "",
  vehicle_group_id: "",
  note: "",
};

const requiredFields = [
  { key: "date", label: "Ngày tháng" },
  
  
  { key: "customer_name", label: "Khách hàng" },
  { key: "cargo_weight_kg", label: "Khối lượng" },
  { key: "pickup_address", label: "Điểm lấy hàng" },
  { key: "delivery_address", label: "Điểm giao hàng" },
];

const normalizeNumericText = (value) => String(value ?? "").replace(/,/g, "").trim();
const normalizeDistanceText = (value) => normalizeNumericText(value).replace(/km$/i, "").trim();
const isFiniteNumber = (value) => Number.isFinite(Number(value));

const normalizeStatus = (status) => String(status ?? "").trim().toLowerCase();
const STATUS_TABS = {
  all: null,
  new: new Set(["available"]),
  waiting: new Set(["claimed", "picking", "loaded", "transit", "arrived", "returning"]),
};
const canCancelTrip = (trip) => {
  const status = normalizeStatus(trip.status);
  return Boolean(trip.orderId) && !["completed", "cancelled", "failed"].includes(status);
};
const shouldHighlightNoCheckIn = (trip) => {
  const hasCheckInMarker = /(?:^|\|)\s*Chấm công\s*:/i.test(String(trip.notes ?? ""));
  return hasCheckInMarker && !String(trip.checkIn ?? "").trim();
};



const splitRoute = (route) => {
  const text = String(route ?? "").trim();
  if (!text) return { pickup: "", delivery: "" };
  const parts = text.split(/\s+-\s+/);
  if (parts.length < 2) return { pickup: text, delivery: "" };
  return { pickup: parts[0].trim(), delivery: parts.slice(1).join(" - ").trim() };
};






function extractDriverName(notes) {
  const match = String(notes ?? "").match(/L(?:ái|ai) xe:\s*([^|]+)/i);
  return match?.[1]?.trim() || "";
}

function extractDistance(notes) {
  const match = String(notes ?? "").match(/Quãng đường:\s*([^|]+)/i);
  return match?.[1]?.trim() || "";
}

function buildTripFromOrder(order) {
  const pickupAddress = order.pickup_address ||  "";
  const deliveryAddress = order.delivery_address ||  "";
  const date = (order.created_at ? new Date(order.created_at).toLocaleDateString('vi-VN') : "");

  return {
    id: `#${order.id}-${order.shipment_id || 1}`,
    orderId: order.id,
    shipmentId: order.shipment_id,
    date,
    dateInput: order.created_at,
    checkIn:  "",
    plate: order.plate_number || "",
    driverId: order.owner_driver_id || "",
    vehicleGroupId: order.vehicle_group_id || "",
    driverName: order.driver_name ||  "",
    customerName: order.customer_name || "",
    customerPhone: order.customer_phone ||  "",
    cargoName: order.cargo_name || "",
    cargoWeightKg: order.cargo_weight_kg || "",
    pickupAddress,
    deliveryAddress,
    route:  (pickupAddress && deliveryAddress ? `${pickupAddress} - ${deliveryAddress}` : order.cargo_name || ""),
    distance: extractDistance(order.notes),
    fare: order.estimated_price || order.total_estimated_price || 0,
    status: order.status,
    notes: order.notes,
  };
}

export default function CoordinatorPage({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [trips, setTrips] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState(null);
  const [creating, setCreating] = useState(false);
  const [drivers, setDrivers] = useState([]);
  const [vehicleGroups, setVehicleGroups] = useState([]);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");
  const [form, setForm] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");

  const deferredSearchQuery = useDeferredValue(searchQuery);


  

  useEffect(() => {
  if (!message) return;

  switch (messageType) {
    case "success":
      toast.success(message);
      break;
    case "error":
      toast.error(message);
      break;
    case "warning":
      toast.warning(message);
      break;
    default:
      toast.info(message);
  }

  setMessage("");
}, [message, messageType]);
  useEffect(() => {
    const loadOrders = async () => { 
      try {
        const token = localStorage.getItem("token");
        const data = await apiRequest("/api/orders", { token });
        const dbTrips = (data.orders || []).map(buildTripFromOrder);
        setTrips(dbTrips);
      } catch (error) {
        setMessage(error.message || "Không thể load danh sách đơn.");
        setMessageType("error");
      }
    };

    loadOrders();
  }, []);

  useEffect(() => {
    const loadVehicleOptions = async () => {
      try {
        const token = localStorage.getItem("token");
        const data = await apiRequest("/api/coordinator/vehicle-options", { token });
        setVehicleGroups(data.vehicleGroups || []);
      } catch (error) {
        setMessage("Unable to load vehicle options.");
        setMessageType("error");
      }
    };

    loadVehicleOptions();
  }, []);

  useEffect(() => {
    if (!message) return undefined;

    const timer = window.setTimeout(() => {
      setMessage("");
      setMessageType("info");
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [message]);

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
      return;
    }

    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.reload();
  };

  const filteredTrips = useMemo(() => {
    const query = deferredSearchQuery.trim().toLowerCase();
    const customer = customerFilter.trim().toLowerCase();

    return trips.filter((trip) => {
      const normalizedStatus = normalizeStatus(trip.status);
      const allowedStatuses = STATUS_TABS[activeTab];
      const matchesTab = !allowedStatuses || allowedStatuses.has(normalizedStatus);

      if (!matchesTab) return false;

      const tripDate = trip.dateInput || formatDateForInput(trip.date);
      if (dateFromFilter && (!tripDate || tripDate < dateFromFilter)) return false;
      if (dateToFilter && (!tripDate || tripDate > dateToFilter)) return false;

      if (customer && !String(trip.customerName || "").toLowerCase().includes(customer)) {
        return false;
      }

      if (!query) return true;

      return [
        trip.id,
        trip.orderId,
        trip.cargoName,
        trip.pickupAddress,
        trip.deliveryAddress,
        trip.route,
        trip.driverName,
        trip.customerName,
        trip.status,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [activeTab, customerFilter, dateFromFilter, dateToFilter, deferredSearchQuery, trips]);

  

  const validateForm = () => {
    const errors = {};

    requiredFields.forEach(({ key, label }) => {
      const value = String(form[key] ?? "").trim();
      if (!value) {
        errors[key] = `${label} là bắt buộc`;
      }
    });

    if (form.date) {
      const selectedDate = new Date(`${form.date}T00:00:00`);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (Number.isNaN(selectedDate.getTime())) {
        errors.date = "Ngày không hợp lệ";
      } else if (!editingTrip && selectedDate < today) {
        errors.date = "Ngày không được trước hôm nay";
      }
    }

    const phoneDigits = String(form.customer_phone ?? "").replace(/\D/g, "");
    if (form.customer_phone && !/^0\d{9,10}$/.test(phoneDigits)) {
      errors.customer_phone = "SĐT phải bắt đầu bằng 0 và có 10-11 chữ số";
    }

    const weight = normalizeNumericText(form.cargo_weight_kg);
    if (weight && (!isFiniteNumber(weight) || Number(weight) <= 0)) {
      errors.cargo_weight_kg = "Khối lượng phải là số lớn hơn 0";
    }



    const distance = normalizeDistanceText(form.distance);
    if (distance && (!isFiniteNumber(distance) || Number(distance) <= 0)) {
      errors.distance = "Quãng đường phải là số lớn hơn 0";
    }

    const estimatedPrice = normalizeNumericText(form.estimated_price);
    if (estimatedPrice && (!isFiniteNumber(estimatedPrice) || Number(estimatedPrice) < 0)) {
      errors.estimated_price = "Cước xe phải là số không âm";
    }

    setFormErrors(errors);
    return errors;
  };

  const updateField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (formErrors[key]) {
      setFormErrors((currentErrors) => {
        const nextErrors = { ...currentErrors };
        delete nextErrors[key];
        return nextErrors;
      });
    }
  };

  const selectedVehicleGroup = useMemo(() => vehicleGroups.find((group) => String(group.id) === String(form.vehicle_group_id)), [form.vehicle_group_id, vehicleGroups]);

  const plateOptions = useMemo(() => {
    if (!form.vehicle_group_id) return vehicleGroups.flatMap((group) => group.vehicles || []);
    return selectedVehicleGroup?.vehicles || [];
  }, [form.vehicle_group_id, selectedVehicleGroup, vehicleGroups]);

  useEffect(() => {
    const distance = normalizeDistanceText(form.distance);
    const pricePerKm = Number(selectedVehicleGroup?.price_per_km || 0);
    if (!distance || !isFiniteNumber(distance) || Number(distance) <= 0 || !pricePerKm) return;
    const nextPrice = Math.round(Number(distance) * pricePerKm);
    setForm((current) => (String(current.estimated_price) === String(nextPrice) ? current : { ...current, estimated_price: String(nextPrice) }));
  }, [form.distance, selectedVehicleGroup]);

  const handleExcelImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setMessage("");
    setMessageType("info");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const token = localStorage.getItem("token");
      const data = await apiRequest("/api/coordinator/import-excel", {
        method: "POST",
        token,
        body: formData,
      });

      setMessage(`Imported ${data.rows?.length || 0} rows from Excel.`);
      setMessageType("success");

      // Reload orders from database to show the newly imported ones reactively
      const updatedData = await apiRequest("/api/orders", { token });
      const dbTrips = (updatedData.orders || []).map(buildTripFromOrder);
      setTrips(dbTrips);
    } catch (err) {
      setMessage(err.message || "Unable to import Excel file.");
      setMessageType("error");
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  };

  const openCreateModal = () => {
    setEditingTrip(null);
    setForm(emptyForm);
    setFormErrors({});
    setCreateOpen(true);
  };

  const openEditModal = (trip) => {
    const routeAddresses = splitRoute(trip.route);
    setEditingTrip(trip);
    setForm({
      date: trip.dateInput || formatDateForInput(trip.date),
      driver_id: "",
      plate: trip.plate || "",
      customer_name: trip.customerName || "",
      customer_phone: trip.customerPhone || "",
      cargo_name: trip.cargoName || "",
      cargo_weight_kg: trip.cargoWeightKg || "",
      distance: trip.distance || "",
      pickup_address: trip.pickupAddress || routeAddresses.pickup,
      delivery_address: trip.deliveryAddress || routeAddresses.delivery,
      delivery_addresses: trip.deliveryAddress || routeAddresses.delivery,
      estimated_price: trip.fare || "",
      vehicle_group_id: trip.vehicleGroupId ? String(trip.vehicleGroupId) : "",
      note: trip.notes || "",
    });
    setFormErrors({});
    setCreateOpen(true);
  };

  const closeOrderModal = () => {
    setCreateOpen(false);
    setEditingTrip(null);
    setForm(emptyForm);
    setFormErrors({});
  };

  const handleCancelOrder = async (trip) => {
    if (!canCancelTrip(trip)) return;

    const confirmed = window.confirm(`Bạn có chắc muốn hủy đơn #${trip.orderId}?`);
    if (!confirmed) return;

    try {
      const token = localStorage.getItem("token");
      const data = await apiRequest(`/api/orders/${trip.orderId}`, {
        method: "DELETE",
        token,
        body: { reason: "Coordinator cancelled order" },
      });
      const cancelledTrip = buildTripFromOrder(data.order);
      setTrips((currentTrips) => currentTrips.map((item) => (
        item.orderId === cancelledTrip.orderId ? cancelledTrip : item
      )));
      setMessage(data.message || "Đã hủy đơn hàng.");
      setMessageType("success");
    } catch (err) {
      setMessage(err.message || "Không thể hủy đơn hàng.");
      setMessageType("error");
    }
  };

  const handleCreateOrder = async (event) => {
    event.preventDefault();
    setMessage("");
    setMessageType("info");

    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setMessage("Vui lòng kiểm tra các trường bắt buộc.");
      setMessageType("error");
      return;
    }

    setCreating(true);

    try {
      const token = localStorage.getItem("token");
      const selectedPlate = form.plate || editingTrip?.plate || "";
      const selectedVehicleGroupId = form.vehicle_group_id || editingTrip?.vehicleGroupId || "";

      const payload = {
        date: form.date,
        plate: selectedPlate,
        driver_id: "",
        customer_name: form.customer_name,
        customer_phone: form.customer_phone,
        cargo_name: form.cargo_name,
        cargo_weight_kg: form.cargo_weight_kg,
        pickup_address: form.pickup_address,
        delivery_address: form.delivery_address,
        delivery_addresses: form.delivery_addresses || form.delivery_address,
        distance: form.distance,
        estimated_price: form.estimated_price,
        vehicle_group_id: selectedVehicleGroupId,
        notes: form.note,
      };

      const data = await apiRequest(editingTrip ? `/api/orders/${editingTrip.orderId}` : "/api/orders", {
        method: editingTrip ? "PATCH" : "POST",
        token,
        body: payload,
      });

      const savedTrip = buildTripFromOrder(data.order);
      setTrips((currentTrips) => editingTrip
        ? currentTrips.map((trip) => ((trip.shipmentId && savedTrip.shipmentId ? trip.shipmentId === savedTrip.shipmentId : trip.orderId === savedTrip.orderId) ? savedTrip : trip))
        : [savedTrip, ...currentTrips.filter((trip) => trip.orderId !== savedTrip.orderId)]
      );

      setCreateOpen(false);
      setEditingTrip(null);
      setMessage(data.message || (editingTrip ? "Order updated successfully." : "Order created successfully."));
      setMessageType("success");
      setForm(emptyForm);
      setFormErrors({});
    } catch (err) {
      setMessage(err.message || "Unable to create order.");
      setMessageType("error");
    } finally {
      setCreating(false);
    }
  };
  
  return (
    <div className={`coordinator-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar">
        <div>
          <div className="brand">
            <div className="brand-mark">L</div>
            {!sidebarCollapsed && (
              <div>
                <div className="brand-name">Logistics HQ</div>
                <div className="brand-sub">Coordinator dashboard</div>
              </div>
            )}
          </div>
          <button
            className="sidebar-toggle"
            type="button"
            onClick={() => setSidebarCollapsed((value) => !value)}
            aria-label={sidebarCollapsed ? "Mở rộng sidebar" : "Thu gọn sidebar"}
            title={sidebarCollapsed ? "Mở rộng sidebar" : "Thu gọn sidebar"}
          >
            {sidebarCollapsed ? "›" : "‹"}
          </button>
          <nav className="nav">
            <button className="nav-item active"><span className="nav-icon">☰</span><span className="nav-label">Đơn hàng</span></button>
            {/* <button className="nav-item">Map</button>
            <button className="nav-item">Drivers</button>
            <button className="nav-item">Reports</button> */}
          </nav>
        </div>
        <button className="nav-item nav-footer" onClick={handleLogout}>
          <span className="nav-icon">⇥</span><span className="nav-label">Đăng xuất</span>
        </button>
      </aside>

      <main className="content">
        <header className="topbar">
          <div className="search-box">
            <span className="search-icon">⌕</span>
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Tên sản phẩm, điểm lấy hàng, giao hàng, tài xế, trạng thái"
            />
          </div>
          <div className="topbar-actions">
            <label className="import-btn">
              {importing ? "Importing..." : "+ Import Excel"}
              <input type="file" accept=".xlsx,.xls" onChange={handleExcelImport} hidden />
            </label>
            <button className="primary-btn" onClick={openCreateModal}>
              + Tạo mới
            </button>
            <div className="top-profile">
              <button
                className="avatar profile-trigger"
                type="button"
                onClick={() => setProfileMenuOpen((value) => !value)}
                title={user?.email}
              >
                {user?.full_name?.[0] || "A"}
              </button>
              {profileMenuOpen && (
                <div className="profile-menu">
                  <div className="profile-menu-name">{user?.full_name || user?.email || "Coordinator"}</div>
                  <div className="profile-menu-email">{user?.email}</div>
                  <button type="button" onClick={handleLogout}>Đăng xuất</button>
                </div>
              )}
            </div>
          </div>
        </header>

        <section className="hero">
          {/* <div>
            <h1>Danh sách đơn hàng</h1>
            <p>Manage and dispatch active transport trips.</p>
          </div> */}
          <div></div>
          <div className="filters order-filters">
            <label className="filter-field">
              <span>Từ ngày</span>
              <input
                type="date"
                value={dateFromFilter}
                onChange={(event) => setDateFromFilter(event.target.value)}
              />
            </label>
            <label className="filter-field">
              <span>Đến ngày</span>
              <input
                type="date"
                value={dateToFilter}
                min={dateFromFilter || undefined}
                onChange={(event) => setDateToFilter(event.target.value)}
              />
            </label>
            <label className="filter-field filter-field-customer">
              <span>Khách hàng</span>
              <input
                value={customerFilter}
                onChange={(event) => setCustomerFilter(event.target.value)}
                placeholder="Lọc theo khách hàng"
              />
            </label>
            <button
              type="button"
              className="filter"
              onClick={() => {
                setDateFromFilter("");
                setDateToFilter("");
                setCustomerFilter("");
              }}
            >
              Xóa lọc
            </button>
            <button
              className={activeTab === "all" ? "filter active" : "filter"}
              onClick={() => setActiveTab("all")}
            >
              Tất cả
            </button>
            <button
              className={activeTab === "new" ? "filter active" : "filter"}
              onClick={() => setActiveTab("new")}
            >
              Mới
            </button>
            <button
              className={activeTab === "waiting" ? "filter active" : "filter"}
              onClick={() => setActiveTab("waiting")}
            >
              Đang xử lý
            </button>
          </div>
        </section>

        {createOpen && (
          <section className="modal-backdrop" onClick={closeOrderModal}>
            <div className="modal-card" onClick={(event) => event.stopPropagation()}>
              <div className="panel-head">
                <div>
                  <h2>{editingTrip ? `Chỉnh sửa đơn #${editingTrip.orderId}` : "Tạo đơn"}</h2>
                  <p>{editingTrip ? "Cập nhật thông tin đơn hàng để điều phối chính xác." : "Fill the form based on the Excel sheet structure."}</p>
                </div>
                <button className="ghost-btn" type="button" onClick={closeOrderModal}>
                  x
                </button>
              </div>

              <form className="create-form" onSubmit={handleCreateOrder}>
                <div className="sheet-caption full">Thông tin đơn hàng</div>

                <div className="form-row form-row-3">
                  <label>
                    <span>Ngày tháng</span>
                    <input
                      type="date"
                      value={form.date}
                      onChange={(event) => updateField("date", event.target.value)}
                      min={editingTrip ? undefined : new Date().toISOString().slice(0, 10)}
                      className={formErrors.date ? "input-error" : ""}
                    />
                    {formErrors.date && <div className="field-error">{formErrors.date}</div>}
                  </label>
                  <label>
                    <span>BKS</span>
                    <select
                      value={form.plate}
                      onChange={(event) => {
                        const plate = event.target.value;
                        const vehicle = vehicleGroups
                          .flatMap((group) => group.vehicles || [])
                          .find((item) => item.plate_number === plate);
                        updateField("plate", plate);
                        if (vehicle?.vehicle_group_id) {
                          updateField("vehicle_group_id", String(vehicle.vehicle_group_id));
                        }
                      }}
                    >
                      <option value="">Chọn BKS</option>
                      {plateOptions.map((vehicle) => (
                        <option key={vehicle.id} value={vehicle.plate_number}>
                          {vehicle.plate_number}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Nhóm xe</span>
                    <select
                      value={form.vehicle_group_id}
                      onChange={(event) => {
                          updateField("vehicle_group_id", event.target.value);
                          updateField("plate", "");
                        }}
                      className={formErrors.vehicle_group_id ? "input-error" : ""}
                    >
                      <option value="">Chọn nhóm xe</option>
                      {vehicleGroups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name} - {Number(group.price_per_km || 0).toLocaleString("vi-VN")} đ/km
                        </option>
                      ))}
                    </select>
                    {formErrors.vehicle_group_id && (
                      <div className="field-error">{formErrors.vehicle_group_id}</div>
                    )}
                  </label>
                </div>

                <div className="form-row form-row-3">
                  <label>
                    <span>SĐT</span>
                    <input
                      value={form.customer_phone}
                      onChange={(event) => updateField("customer_phone", event.target.value)}
                      className={formErrors.customer_phone ? "input-error" : ""}
                    />
                    {formErrors.customer_phone && (
                      <div className="field-error">{formErrors.customer_phone}</div>
                    )}
                  </label>
                  <label>
                    <span>Khách hàng</span>
                    <input
                      value={form.customer_name}
                      onChange={(event) => updateField("customer_name", event.target.value)}
                      className={formErrors.customer_name ? "input-error" : ""}
                    />
                    {formErrors.customer_name && (
                      <div className="field-error">{formErrors.customer_name}</div>
                    )}
                  </label>
                  <label>
                    <span>Sản phẩm</span>
                    <input
                      value={form.cargo_name}
                      onChange={(event) => updateField("cargo_name", event.target.value)}
                      placeholder="Không bắt buộc"
                    />
                  </label>
                </div>

                <div className="form-row form-row-note">
                  
                </div>

                <div className="form-row form-row-2">
                  <label>
                    <span>Khối lượng</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.cargo_weight_kg}
                      onChange={(event) => updateField("cargo_weight_kg", event.target.value)}
                      className={formErrors.cargo_weight_kg ? "input-error" : ""}
                    />
                    {formErrors.cargo_weight_kg && (
                      <div className="field-error">{formErrors.cargo_weight_kg}</div>
                    )}
                  </label>
                  <label>
                    <span>Quãng đường</span>
                    <input
                      value={form.distance}
                      onChange={(event) => updateField("distance", event.target.value)}
                      placeholder="VD: 120 km"
                      className={formErrors.distance ? "input-error" : ""}
                    />
                    {formErrors.distance && (
                      <div className="field-error">{formErrors.distance}</div>
                    )}
                  </label>
                </div>

                <div className="form-row form-row-2">
                  <label>
                    <span>Cước xe</span>
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      value={form.estimated_price}
                      onChange={(event) => updateField("estimated_price", event.target.value)}
                      readOnly
                      className={formErrors.estimated_price ? "input-error" : ""}
                    />
                    {formErrors.estimated_price && (
                      <div className="field-error">{formErrors.estimated_price}</div>
                    )}
                  </label>
                </div>

                <div className="form-row form-row-2">
                  <label>
                    <span>Điểm lấy hàng</span>
                    <input
                      value={form.pickup_address}
                      onChange={(event) => updateField("pickup_address", event.target.value)}
                      className={formErrors.pickup_address ? "input-error" : ""}
                    />
                    {formErrors.pickup_address && (
                      <div className="field-error">{formErrors.pickup_address}</div>
                    )}
                  </label>
                  <label>
                    <span>Điểm giao hàng</span>
                    <textarea
                      value={form.delivery_addresses || form.delivery_address}
                      onChange={(event) => {
                        updateField("delivery_addresses", event.target.value);
                        updateField("delivery_address", event.target.value.split(/\n|;/).map((item) => item.trim()).filter(Boolean)[0] || "");
                      }}
                      placeholder="Mỗi điểm giao hàng một dòng"
                      className={formErrors.delivery_address ? "input-error" : ""}
                    />
                    {formErrors.delivery_address && (
                      <div className="field-error">{formErrors.delivery_address}</div>
                    )}
                  </label>
                </div>

                <div className="form-row form-row-note">
                  <label>
                    <span>Ghi chú</span>
                    <textarea
                      value={form.note}
                      onChange={(event) => updateField("note", event.target.value)}
                    />
                  </label>
                </div>
                {Object.keys(formErrors).length > 0 && (
                  <div className="full field-error field-error-box">
                    {Object.entries(formErrors).map(([key, error]) => (
                      <div key={key}>{error}</div>
                    ))}
                  </div>
                )}

                <div className="form-actions full">
                  <button type="button" className="filter" onClick={closeOrderModal}>
                    Cancel
                  </button>
                  <button type="submit" className="primary-btn" disabled={creating}>
                    {creating ? (editingTrip ? "Updating..." : "Creating...") : (editingTrip ? "Update" : "Create")}
                  </button>
                </div>
              </form>
            </div>
          </section>
        )}

        

        <section className="orders-panel">
          <div className="panel-head">
            <div>
              <h2>Danh sách chuyến</h2>
              <p>Hiển thị đơn hàng dạng bảng để dễ theo dõi và điều phối.</p>
            </div>
          </div>

          <div className="table-wrap">
            <table className="orders-table">
              <thead>
                <tr>
                  <th>Mã đơn</th>
                  <th>Ngày</th>
                  <th>BKS</th>
                  <th>Lái xe</th>
                  <th>Khách hàng</th>
                  <th>Hành trình</th>
                  <th>Quãng đường</th>
                  <th>Cước xe</th>
                  <th>Ghi chú</th>
                  <th>Trạng thái</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredTrips.length === 0 ? (
                  <tr>
                    <td colSpan="11" className="empty-table-cell">
                      No orders yet. Create an order or import an Excel file to load data.
                    </td>
                  </tr>
                ) : (
                  filteredTrips.map((trip) => (
                    <tr key={trip.id} className={shouldHighlightNoCheckIn(trip) ? "row-no-checkin" : ""}>
                      <td>
                        <span className="trip-id">
                          #{trip.orderId || String(trip.id).replace(/^tmp-/, "")}
                        </span>
                      </td>
                      <td>{trip.date || "-"}</td>
                      <td>{trip.plate || "-"}</td>
                      <td>{trip.driverName || "Unassigned"}</td>
                      <td>{trip.customerName || "-"}</td>
                      <td className="table-route-cell">{trip.route || "-"}</td>
                      <td>{trip.distance || "-"}</td>
                      <td>
                        {typeof trip.fare === "number"
                          ? trip.fare.toLocaleString("vi-VN") + " đ"
                          : trip.fare || "-"}
                      </td>
                      <td className="table-address-cell">{trip.notes}</td>
                      <td>
                        <span className={`trip-status status-${(trip.status || "").toLowerCase()}`}>
                          {trip.status}
                        </span>
                      </td>
                      <td>
                        <div className="table-actions">
                          <button className="table-edit-btn" type="button" aria-label="Edit order" onClick={() => openEditModal(trip)}>
                            ✎
                          </button>
                          <button
                            className="table-cancel-btn"
                            type="button"
                            aria-label="Cancel order"
                            title="Hủy đơn"
                            disabled={!canCancelTrip(trip)}
                            onClick={() => handleCancelOrder(trip)}
                          >
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          
        </section>

      </main>
    </div>
  );
  
}
