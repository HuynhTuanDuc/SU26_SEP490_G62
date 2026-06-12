import React, { useDeferredValue, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../services/apiClient";
import "../../styles/Coordinator.css";
import { message as toast } from "antd";

//Đặt yêu cầu cho empty form 
const getTodayStr = () => new Date().toISOString().slice(0, 10);

const emptyForm = () => ({
  date: getTodayStr(),
  customer_name: "",
  customer_phone: "",
  cargo_name: "",
  cargo_weight_kg: "",
  note: "",
  is_partner: false,
  partner_name: "",
  partner_fee: "",
  trips: [{ vehicle_group_id: "", plate: "", distance: "", pickup_address: "", delivery_address: "" }]
});

const requiredFields = [
  { key: "date", label: "Ngày tháng" },
  { key: "customer_phone", label: "SĐT" },
  { key: "cargo_weight_kg", label: "Khối lượng" },
];

const normalizeNumericText = (value) => String(value ?? "").replace(/,/g, "").trim();
const normalizeDistanceText = (value) => normalizeNumericText(value).replace(/km$/i, "").trim();
const isFiniteNumber = (value) => Number.isFinite(Number(value));

const formatDateForInput = (dateStr) => {
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

const normalizeStatus = (status) => String(status ?? "").trim().toLowerCase();
const STATUS_TABS = {
  all: null,
  new: new Set(["available"]),
  waiting: new Set(["claimed", "picking", "loaded", "transit", "arrived", "returning"]),
};
const STATUS_QUERY = {
  all: "",
  new: "available",
  waiting: "claimed,picking,loaded,transit,arrived,returning",
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
  const match = String(notes ?? "").match(/Qu(?:ã|a)ng đường:\s*([^|]+)/i);
  return match?.[1]?.trim() || "";
}

function buildTripFromOrder(order) {
  const pickupAddress = order.pickup_address || "";
  const deliveryAddress = order.delivery_address || "";
  const arrivedAt = order.arrived_at;
  const date = (arrivedAt ? new Date(arrivedAt).toLocaleDateString('vi-VN') : "");

  const trips = Array.isArray(order.trips) && order.trips.length > 0 ? order.trips : [{
    vehicle_group_id: order.vehicle_group_id || "",
    plate: order.plate_number || "",
    distance: order.estimated_distance_km || "",
    pickup_address: pickupAddress,
    delivery_address: deliveryAddress
  }];

  const totalDistance = trips.reduce((sum, t) => sum + (Number(t.distance) || 0), 0);

  return {
    id: `#${order.id}`,
    orderId: order.id,
    date,
    dateInput: order.arrived_at ? String(order.arrived_at).substring(0, 10) : (order.created_at ? String(order.created_at).substring(0, 10) : ""),
    checkIn: "",
    plate: order.plate_number || "",
    driverId: order.owner_driver_id || "",
    vehicleGroupId: order.vehicle_group_id || "",
    driverName: order.driver_name || "",
    customerName: order.customer_name || "",
    customerPhone: order.customer_phone || "",
    cargoName: order.cargo_name || "",
    cargoWeightKg: order.cargo_weight_kg || "",
    pickupAddress,
    deliveryAddress,
    route: (pickupAddress && deliveryAddress ? `${pickupAddress} - ${deliveryAddress}` : order.cargo_name || ""),
    distance: totalDistance || order.estimated_distance_km || "",
    fare: order.estimated_price || order.total_estimated_price || 0,
    status: order.status,
    notes: order.notes,
    is_partner: !!order.partner_name,
    partner_name: order.partner_name || "",
    partner_fee: order.total_actual_price || "",
    trips,
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
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });

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
  const loadOrders = async (page = pagination.page) => {
    try {
      const token = localStorage.getItem("token");
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pagination.limit),
      });
      if (deferredSearchQuery.trim()) params.set("search", deferredSearchQuery.trim());
      if (STATUS_QUERY[activeTab]) params.set("status", STATUS_QUERY[activeTab]);
      if (dateFromFilter) params.set("dateFrom", dateFromFilter);
      if (dateToFilter) params.set("dateTo", dateToFilter);
      if (customerFilter.trim()) params.set("customer", customerFilter.trim());

      const data = await apiRequest(`/api/orders?${params.toString()}`, { token });
      const dbTrips = (data.orders || []).map(buildTripFromOrder);
      setTrips(dbTrips);
      setPagination(data.pagination || { page, limit: pagination.limit, total: dbTrips.length, totalPages: 1 });
    } catch (error) {
      setMessage(error.message || "Không thể load danh sách đơn.");
      setMessageType("error");
    }
  };

  useEffect(() => {
    loadOrders(1);
  }, [activeTab, customerFilter, dateFromFilter, dateToFilter, deferredSearchQuery]);

  useEffect(() => {
    const loadVehicleGroups = async () => {
      try {
        const token = localStorage.getItem("token");
        const data = await apiRequest("/api/coordinator/vehicle-groups", { token });
        setVehicleGroups(data.vehicleGroups || []);
      } catch (error) {
        setMessage("Không thể tải danh sách nhóm xe/BKS.");
        setMessageType("error");
      }
    };

    loadVehicleGroups();
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

    if (form.trips && form.trips.length > 0) {
      form.trips.forEach((trip, index) => {
        if (!trip.vehicle_group_id) errors[`trip_${index}_vehicle_group_id`] = `Nhóm xe chuyến ${index + 1} là bắt buộc`;
        if (!String(trip.plate || "").trim()) errors[`trip_${index}_plate`] = `BKS chuyến ${index + 1} là bắt buộc`;
        if (!String(trip.pickup_address || "").trim()) errors[`trip_${index}_pickup_address`] = `Điểm lấy hàng chuyến ${index + 1} là bắt buộc`;
        if (!String(trip.delivery_address || "").trim()) errors[`trip_${index}_delivery_address`] = `Điểm giao hàng chuyến ${index + 1} là bắt buộc`;
        const dist = normalizeNumericText(trip.distance);
        if (!dist) {
          errors[`trip_${index}_distance`] = `Quãng đường chuyến ${index + 1} là bắt buộc`;
        } else if (!isFiniteNumber(dist) || Number(dist) <= 0) {
          errors[`trip_${index}_distance`] = `Quãng đường chuyến ${index + 1} phải > 0`;
        }
      });
    } else {
      errors.trips = "Cần ít nhất một chuyến xe";
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

  const updateTripField = (index, key, value) => {
    setForm((current) => {
      const updatedTrips = current.trips.map((trip, i) =>
        i === index ? { ...trip, [key]: value } : trip
      );
      return { ...current, trips: updatedTrips };
    });
    const errKey = `trip_${index}_${key}`;
    if (formErrors[errKey]) {
      setFormErrors((cur) => { const n = { ...cur }; delete n[errKey]; return n; });
    }
  };

  const addTrip = () => {
    setForm((current) => ({ //current là state hiện tại của form, dùng setForm thì current = form 
      ...current,//Tạo object mới có thông tin từ form 
      //sau đó ghi đè trips. Lấy trip  hiện tại, tạo thêm trips từ {}, rỗng vẫn tạo 
      trips: [...current.trips, { vehicle_group_id: "", plate: "", distance: "", pickup_address: "", delivery_address: "" }]
    }));
  };

  const removeTrip = (index) => {
    setForm((current) => ({
      ...current,
      trips: current.trips.filter((_, i) => i !== index)
    }));
  };

  const getAvailablePlates = (vehicleGroupId) =>
    vehicleGroups.find((g) => String(g.id) === String(vehicleGroupId))?.vehicles || [];

  const getTripFare = (trip) => {
    const group = vehicleGroups.find((g) => String(g.id) === String(trip.vehicle_group_id));
    const dist = Number(normalizeDistanceText(trip.distance));
    const pricePerKm = Number(group?.price_per_km || 0);
    if (!Number.isFinite(dist) || dist <= 0 || !Number.isFinite(pricePerKm) || pricePerKm <= 0) return "";
    return String(Math.round(dist * pricePerKm));
  };

  const totalFare = useMemo(() => {
    if (!form.trips) return 0;
    return form.trips.reduce((sum, trip) => {
      const f = getTripFare(trip);
      return sum + (f ? Number(f) : 0);
    }, 0);
  }, [form.trips, vehicleGroups]);

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
      await loadOrders(1);
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
    setForm(emptyForm());
    setFormErrors({});
    setCreateOpen(true);
  };

  const openEditModal = (trip) => {
    const routeAddresses = splitRoute(trip.route);
    const driver = drivers.find((item) => String(item.id) === String(trip.driverId));
    setEditingTrip(trip);
    setForm({
      date: trip.dateInput || formatDateForInput(trip.date),
      driver_id: trip.driverId ? String(trip.driverId) : "",
      plate: trip.plate || "",
      customer_name: trip.customerName || "",
      customer_phone: trip.customerPhone || "",
      cargo_name: trip.cargoName || "",
      cargo_weight_kg: trip.cargoWeightKg || "",
      distance: trip.distance || "",
      trips: trip.trips?.length > 0 ? trip.trips.map((t) => ({
        ...t,
        pickup_address: t.pickup_address || trip.pickupAddress || routeAddresses.pickup || "",
        delivery_address: t.delivery_address || trip.deliveryAddress || routeAddresses.delivery || "",
      })) : [{
        vehicle_group_id: trip.vehicleGroupId ? String(trip.vehicleGroupId) : (driver?.vehicle_group_id ? String(driver.vehicle_group_id) : ""),
        plate: trip.plate || "",
        distance: trip.distance || "",
        pickup_address: trip.pickupAddress || routeAddresses.pickup || "",
        delivery_address: trip.deliveryAddress || routeAddresses.delivery || "",
      }],
      note: trip.notes || "",
    });
    setFormErrors({});
    setCreateOpen(true);
  };

  const closeOrderModal = () => {
    setCreateOpen(false);
    setEditingTrip(null);
    setForm(emptyForm());
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
      const payload = {
        date: form.date,
        customer_name: form.customer_name,
        customer_phone: form.customer_phone,
        cargo_name: form.cargo_name,
        cargo_weight_kg: form.cargo_weight_kg,
        pickup_address: form.trips[0]?.pickup_address || "",
        delivery_address: form.trips[0]?.delivery_address || "",
        arrived_at: form.date,
        notes: form.note,
        is_partner: form.is_partner,
        partner_name: form.is_partner ? form.partner_name : null,
        partner_fee: form.is_partner ? form.partner_fee : null,
        trips: form.trips,
      };

      const data = await apiRequest(editingTrip ? `/api/orders/${editingTrip.orderId}` : "/api/orders", {
        method: editingTrip ? "PATCH" : "POST",
        token,
        body: payload,
      });

      const savedTrip = buildTripFromOrder(data.order);
      await loadOrders(editingTrip ? pagination.page : 1);

      setCreateOpen(false);
      setEditingTrip(null);
      setMessage(data.message || (editingTrip ? "Order updated successfully." : "Order created successfully."));
      setMessageType("success");
      setForm(emptyForm());
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
                    <span>Ngày giao hàng</span>
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
                </div>

                <div className="form-row form-row-2">
                  <label>
                    <span>Hàng hóa</span>
                    <input
                      value={form.cargo_name}
                      onChange={(event) => updateField("cargo_name", event.target.value)}
                      placeholder="Không bắt buộc"
                    />
                  </label>

                  <label>
                    <span>Khối lượng (kg)</span>
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
                </div>

                <div className="sheet-caption full" style={{ marginTop: 12 }}>Tùy chọn đối tác</div>
                <div className="form-row full" style={{ marginBottom: 16 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: '#2a3144', fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={form.is_partner}
                      onChange={(e) => updateField("is_partner", e.target.checked)}
                      style={{ width: 18, height: 18 }}
                    />
                    Tạo cho đối tác
                  </label>
                </div>

                {form.is_partner && (
                  <div className="form-row form-row-2">
                    <label>
                      <span>Bên liên kết (Tên đối tác)</span>
                      <input
                        value={form.partner_name}
                        onChange={(event) => updateField("partner_name", event.target.value)}
                        placeholder="Nhập tên bên liên kết"
                      />
                    </label>
                    <label>
                      <span>Cước phí đối tác</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.partner_fee}
                        onChange={(event) => updateField("partner_fee", event.target.value)}
                        placeholder="Ví dụ: 500000"
                      />
                    </label>
                  </div>
                )}

                <div className="sheet-caption full" style={{ marginTop: 12 }}>Chuyến xe</div>

                {form.trips && form.trips.map((trip, index) => (
                  <div key={index} className="trip-row full" style={{
                    border: '1px solid #dde2f3',
                    borderRadius: 16,
                    padding: '14px 16px',
                    background: '#f8f9ff',
                    display: 'grid',
                    gap: 12,
                    position: 'relative'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <strong style={{ color: '#18227f', fontSize: 13 }}>Chuyến {index + 1}</strong>
                      {form.trips.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeTrip(index)}
                          style={{ border: 'none', background: '#fee2e2', color: '#b91c1c', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}
                        >
                          Xóa
                        </button>
                      )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                      <label style={{ display: 'grid', gap: 6, fontSize: 14, color: '#2a3144' }}>
                        <span>Nhóm xe</span>
                        <select
                          value={trip.vehicle_group_id}
                          onChange={(e) => {
                            updateTripField(index, 'vehicle_group_id', e.target.value);
                            updateTripField(index, 'plate', '');
                          }}
                          className={formErrors[`trip_${index}_vehicle_group_id`] ? 'input-error' : ''}
                          style={{ width: '100%', border: '1px solid #cfd6e6', borderRadius: 14, padding: '13px 14px', font: 'inherit', background: '#fff', outline: 'none', boxSizing: 'border-box' }}
                        >
                          <option value="">Chọn nhóm xe</option>
                          {vehicleGroups.map((group) => (
                            <option key={group.id} value={group.id}>{group.name}</option>
                          ))}
                        </select>
                        {formErrors[`trip_${index}_vehicle_group_id`] && (
                          <div className="field-error">{formErrors[`trip_${index}_vehicle_group_id`]}</div>
                        )}
                      </label>

                      <label style={{ display: 'grid', gap: 6, fontSize: 14, color: '#2a3144' }}>
                        <span>BKS</span>
                        <select
                          value={trip.plate}
                          onChange={(e) => updateTripField(index, 'plate', e.target.value)}
                          disabled={!trip.vehicle_group_id}
                          className={formErrors[`trip_${index}_plate`] ? 'input-error' : ''}
                          style={{ width: '100%', border: '1px solid #cfd6e6', borderRadius: 14, padding: '13px 14px', font: 'inherit', background: '#fff', outline: 'none', boxSizing: 'border-box' }}
                        >
                          <option value="">{trip.vehicle_group_id ? 'Chọn BKS' : 'Chọn nhóm xe trước'}</option>
                          {getAvailablePlates(trip.vehicle_group_id).map((v) => (
                            <option key={v.id} value={v.plate_number}>{v.plate_number}</option>
                          ))}
                        </select>
                        {formErrors[`trip_${index}_plate`] && (
                          <div className="field-error">{formErrors[`trip_${index}_plate`]}</div>
                        )}
                      </label>

                      <label style={{ display: 'grid', gap: 6, fontSize: 14, color: '#2a3144' }}>
                        <span>Quãng đường (km)</span>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={trip.distance}
                          onChange={(e) => updateTripField(index, 'distance', e.target.value)}
                          placeholder="VD: 120"
                          className={formErrors[`trip_${index}_distance`] ? 'input-error' : ''}
                          style={{ width: '100%', border: '1px solid #cfd6e6', borderRadius: 14, padding: '13px 14px', font: 'inherit', background: '#fff', outline: 'none', boxSizing: 'border-box' }}
                        />
                        {formErrors[`trip_${index}_distance`] && (
                          <div className="field-error">{formErrors[`trip_${index}_distance`]}</div>
                        )}
                      </label>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 4 }}>
                      <label style={{ display: 'grid', gap: 6, fontSize: 14, color: '#2a3144' }}>
                        <span>Điểm lấy hàng</span>
                        <input
                          value={trip.pickup_address || ""}
                          onChange={(e) => updateTripField(index, 'pickup_address', e.target.value)}
                          placeholder="Địa chỉ lấy hàng"
                          className={formErrors[`trip_${index}_pickup_address`] ? 'input-error' : ''}
                          style={{ width: '100%', border: '1px solid #cfd6e6', borderRadius: 14, padding: '13px 14px', font: 'inherit', background: '#fff', outline: 'none', boxSizing: 'border-box' }}
                        />
                        {formErrors[`trip_${index}_pickup_address`] && (
                          <div className="field-error">{formErrors[`trip_${index}_pickup_address`]}</div>
                        )}
                      </label>

                      <label style={{ display: 'grid', gap: 6, fontSize: 14, color: '#2a3144' }}>
                        <span>Điểm giao hàng</span>
                        <input
                          value={trip.delivery_address || ""}
                          onChange={(e) => updateTripField(index, 'delivery_address', e.target.value)}
                          placeholder="Địa chỉ giao hàng"
                          className={formErrors[`trip_${index}_delivery_address`] ? 'input-error' : ''}
                          style={{ width: '100%', border: '1px solid #cfd6e6', borderRadius: 14, padding: '13px 14px', font: 'inherit', background: '#fff', outline: 'none', boxSizing: 'border-box' }}
                        />
                        {formErrors[`trip_${index}_delivery_address`] && (
                          <div className="field-error">{formErrors[`trip_${index}_delivery_address`]}</div>
                        )}
                      </label>
                    </div>
                    {getTripFare(trip) && (
                      <div style={{ fontSize: 13, color: '#18227f', fontWeight: 600 }}>
                        Cước: {Number(getTripFare(trip)).toLocaleString('vi-VN')} đ
                      </div>
                    )}
                  </div>
                ))}

                <div className="full" style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
                  <button
                    type="button"
                    onClick={addTrip}
                    style={{ border: '1px dashed #18227f', background: '#eef1ff', color: '#18227f', borderRadius: 14, padding: '10px 20px', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}
                  >
                    + Thêm chuyến
                  </button>
                  {totalFare > 0 && (
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#0f1d70' }}>
                      Tổng cước: {totalFare.toLocaleString('vi-VN')} đ
                    </div>
                  )}
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

          <div className="pagination-bar">
            <button
              type="button"
              className="filter"
              disabled={pagination.page <= 1}
              onClick={() => loadOrders(pagination.page - 1)}
            >
              Trước
            </button>
            <span>
              Trang {pagination.page} / {pagination.totalPages} · {pagination.total} đơn
            </span>
            <button
              type="button"
              className="filter"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => loadOrders(pagination.page + 1)}
            >
              Sau
            </button>
          </div>
        </section>

      </main>
    </div>
  );

}
