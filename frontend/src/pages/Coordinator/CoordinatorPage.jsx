import React, { useDeferredValue, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../services/apiClient";
import "../../styles/Coordinator.css";
import AppSidebar from "../../components/layout/AppSidebar";
import { message as toast } from "antd";
import {
  getTodayStr,
  canCancelTrip,
  formatCurrency,
  formatDateForInput,
  isFiniteNumber,
  normalizeNumericText,
  normalizeStatus,
  resolveFareValue
} from "../../features/coordinator/coordinatorValidates";
import ProfileModal from "../../components/profile/ProfileModal";
import { getStoredToken, saveSession } from "../../services/storage";

import {
  emptyForm,
  newReceiptExpense,
  emptyReceiptForm,
  requiredFields,
  expenseTypeOptions,
  STATUS_TABS,
  STATUS_QUERY,
} from "../../features/coordinator/coordinatorContanstants";

import {
  splitRoute,
  getDistinctValues,
  getSummaryValue,
  getOrderStatusLabel,
  buildTripFromOrder
} from "../../features/coordinator/ordersMapping";

import OrderModal from "../../features/coordinator/orderModal";

export default function CoordinatorPage({ user, onLogout }) {
  const [currentUser, setCurrentUser] = useState(user);
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
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [receiptRequests, setReceiptRequests] = useState([]);
  const [receiptRequestsLoading, setReceiptRequestsLoading] = useState(false);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [receiptDetailLoading, setReceiptDetailLoading] = useState(false);
  const [receiptPublishing, setReceiptPublishing] = useState(false);
  const [selectedReceiptDetail, setSelectedReceiptDetail] = useState(null);
  const [receiptForm, setReceiptForm] = useState(emptyReceiptForm);

  const toggleRow = (orderId) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

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

  const loadReceiptRequests = async () => {
    setReceiptRequestsLoading(true);
    try {
      const token = localStorage.getItem("token");
      const data = await apiRequest("/api/coordinator/receipt-requests", { token });
      setReceiptRequests(data.requests || []);
    } catch (error) {
      setMessage(error.message || "Không thể tải danh sách yêu cầu phiếu thu.");
      setMessageType("error");
    } finally {
      setReceiptRequestsLoading(false);
    }
  };

  useEffect(() => {
    loadReceiptRequests();
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

  const handleProfileUpdated = (nextProfile) => {
    const mergedUser = { ...currentUser, ...nextProfile };
    setCurrentUser(mergedUser);
    saveSession({ token: getStoredToken(), user: mergedUser });
  };

  const filteredTrips = useMemo(() => {
    const query = deferredSearchQuery.trim().toLowerCase();
    const customer = customerFilter.trim().toLowerCase();

    return trips.filter((trip) => {
      const shipmentStatuses = Array.isArray(trip.trips) && trip.trips.length > 0
        ? trip.trips.map((item) => normalizeStatus(item.status))
        : [normalizeStatus(trip.status)];

      const allowedStatuses = STATUS_TABS[activeTab];
      const matchesTab = !allowedStatuses || shipmentStatuses.some((status) => allowedStatuses.has(status));//!null = true, kiểm tra status của trip 

      if (!matchesTab) return false;

      const shipmentDates = Array.isArray(trip.trips) && trip.trips.length > 0
        ? trip.trips
          .map((item) => (item.arrived_at ? String(item.arrived_at).substring(0, 10) : ""))
          .filter(Boolean)
        : [];

      const candidateDates = shipmentDates.length > 0
        ? shipmentDates
        : [trip.dateInput || formatDateForInput(trip.date)].filter(Boolean);
      if ((dateFromFilter || dateToFilter) && !candidateDates.some((date) => (
        (!dateFromFilter || date >= dateFromFilter) && (!dateToFilter || date <= dateToFilter)
      ))) return false;

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
    const group = vehicleGroups.find((g) => String(g.id) === String(trip.vehicle_group_id)); //lấy nhóm xe 
    const dist = Number(trip.distance);
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

  const closeReceiptModal = () => {
    setReceiptModalOpen(false);
    setSelectedReceiptDetail(null);
    setReceiptForm(emptyReceiptForm());
  };

  const openReceiptModal = async (requestId) => {
    setReceiptModalOpen(true);
    setReceiptDetailLoading(true);
    setSelectedReceiptDetail(null);

    try {
      const token = localStorage.getItem("token");
      const detail = await apiRequest(`/api/coordinator/receipt-requests/${requestId}`, { token });
      setSelectedReceiptDetail(detail);

      setReceiptForm({
        notes: detail?.request?.coordinator_notes || "",
        expenses: [],
      });
    } catch (error) {
      setMessage(error.message || "Không thể tải chi tiết yêu cầu phiếu thu.");
      setMessageType("error");
      closeReceiptModal();
    } finally {
      setReceiptDetailLoading(false);
    }
  };

  const updateReceiptField = (key, value) => {
    setReceiptForm((current) => ({ ...current, [key]: value }));
  };

  const addReceiptExpense = () => {
    setReceiptForm((current) => ({
      ...current,
      expenses: [...current.expenses, newReceiptExpense()],
    }));
  };

  const updateReceiptExpense = (index, key, value) => {
    setReceiptForm((current) => ({
      ...current,
      expenses: current.expenses.map((expense, expenseIndex) => (
        expenseIndex === index ? { ...expense, [key]: value } : expense
      )),
    }));
  };

  const updateReceiptExpenseShipment = (index, value) => {
    setReceiptForm((current) => ({
      ...current,
      expenses: current.expenses.map((expense, expenseIndex) => (
        expenseIndex === index ? { ...expense, shipment_id: value } : expense
      )),
    }));
  };

  const removeReceiptExpense = (index) => {
    setReceiptForm((current) => ({
      ...current,
      expenses: current.expenses.filter((_, expenseIndex) => expenseIndex !== index),
    }));
  };

  const publishReceipt = async () => {
    if (!selectedReceiptDetail?.request?.id) return;

    setReceiptPublishing(true);
    try {
      const token = localStorage.getItem("token");
      const payload = {
        notes: receiptForm.notes,
        expenses: receiptForm.expenses
          .filter((expense) => String(expense.amount || "").trim() !== "")
          .map((expense) => ({
            expense_type: expense.expense_type,
            amount: Number(expense.amount),
            description: expense.description,
            shipment_id: expense.shipment_id || null,
          })),
      };

      const data = await apiRequest(`/api/coordinator/receipt-requests/${selectedReceiptDetail.request.id}/approve`, {
        method: "POST",
        token,
        body: payload,
      });

      setMessage(data.message || "Đã tạo phiếu thu thành công.");
      setMessageType("success");
      closeReceiptModal();
      await Promise.all([loadReceiptRequests(), loadOrders(pagination.page)]);
    } catch (error) {
      setMessage(error.message || "Không thể tạo phiếu thu.");
      setMessageType("error");
    } finally {
      setReceiptPublishing(false);
    }
  };

  const receiptShipments = selectedReceiptDetail?.shipments || (selectedReceiptDetail?.shipment ? [selectedReceiptDetail.shipment] : []);
  const receiptPrimaryShipment = selectedReceiptDetail?.shipment || receiptShipments[0] || null;
  const receiptActualRevenue = useMemo(
    () => receiptShipments.reduce(
      (sum, shipment) => sum + Number(shipment.actual_revenue || shipment.actual_price || 0),
      0,
    ),
    [receiptShipments],
  );
  const orderPassThroughExpenses = useMemo(() => (
    [...(selectedReceiptDetail?.expenses || []), ...receiptForm.expenses]
      .filter((expense) => ["parking", "toll", "depreciation"].includes(String(expense.expense_type || "").trim()))
      .reduce((sum, expense) => sum + Number(expense.amount || 0), 0)
  ), [receiptForm.expenses, selectedReceiptDetail]);
  const receiptFinalPrice = receiptActualRevenue + orderPassThroughExpenses;
  const formatRouteLabel = (shipment) => {
    if (!shipment) return "-";
    const pickup = shipment.pickup_address || shipment.stops?.find((stop) => stop.stop_type === "pickup")?.address || "-";
    const delivery = shipment.delivery_address || shipment.stops?.find((stop) => stop.stop_type === "delivery")?.address || "-";
    return `${pickup} → ${delivery}`;
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
      <AppSidebar
        user={user}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        collapsed={sidebarCollapsed}
        onCollapse={setSidebarCollapsed}
      />

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
            {/* <label className="import-btn">
              {importing ? "Importing..." : "+ Import Excel"}
              <input type="file" accept=".xlsx,.xls" onChange={handleExcelImport} hidden />
            </label> */}
            <button className="primary-btn" onClick={openCreateModal}>
              + Tạo mới
            </button>
            <div className="top-profile">
              <button
                className="profile-trigger"
                type="button"
                onClick={() => setProfileMenuOpen((value) => !value)}
                title={currentUser?.email}
              >
                <span
                  className="avatar"
                  style={currentUser?.avatar_url ? {
                    backgroundImage: `url(${currentUser.avatar_url})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  } : undefined}
                >
                  {currentUser?.avatar_url ? '' : (currentUser?.full_name?.[0] || "A")}
                </span>
                <span className="profile-trigger-copy">
                  <span className="profile-trigger-name">{currentUser?.full_name || "Coordinator"}</span>
                  <span className="profile-trigger-role">Coordinator</span>
                </span>
                <svg className="profile-trigger-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {profileMenuOpen && (
                <div className="profile-menu">
                  <div className="profile-menu-name">{currentUser?.full_name || currentUser?.email || "Coordinator"}</div>
                  <div className="profile-menu-email">{currentUser?.email}</div>
                  <button type="button" onClick={() => { setProfileMenuOpen(false); setProfileModalOpen(true); }}>Ho so ca nhan</button>
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

        <OrderModal
          open={createOpen}
          editingTrip={editingTrip}
          form={form}
          formErrors={formErrors}
          vehicleGroups={vehicleGroups}
          creating={creating}
          totalFare={totalFare}

          updateField={updateField}
          updateTripField={updateTripField}
          addTrip={addTrip}
          removeTrip={removeTrip}
          getAvailablePlates={getAvailablePlates}
          getTripFare={getTripFare}

          closeOrderModal={closeOrderModal}
          handleCreateOrder={handleCreateOrder}
        />

        {receiptModalOpen && (
          <section className="modal-backdrop" onClick={closeReceiptModal}>
            <div className="modal-card receipt-modal-card" onClick={(event) => event.stopPropagation()}>
              <div className="panel-head">
                <div>
                  <h2>Tạo phiếu thu</h2>
                  <p>
                    {selectedReceiptDetail?.request
                      ? `Yêu cầu #${selectedReceiptDetail.request.id} · Đơn #${selectedReceiptDetail.order?.id}`
                      : "Đang tải thông tin yêu cầu phiếu thu"}
                  </p>
                </div>
                <button className="ghost-btn" type="button" onClick={closeReceiptModal}>
                  x
                </button>
              </div>

              {receiptDetailLoading || !selectedReceiptDetail ? (
                <div className="receipt-loading">Đang tải chi tiết phiếu thu...</div>
              ) : (
                <div className="receipt-layout">
                  <div className="receipt-overview-grid">
                    <div className="receipt-section">
                      <div className="sheet-caption full">Customer</div>
                      <div className="receipt-info-grid">
                        <div>
                          <span className="receipt-info-label">Khách hàng</span>
                          <strong>{selectedReceiptDetail.customer?.full_name || "Khách lẻ"}</strong>
                        </div>
                        <div>
                          <span className="receipt-info-label">Số điện thoại</span>
                          <strong>{selectedReceiptDetail.customer?.phone || "-"}</strong>
                        </div>
                        <div>
                          <span className="receipt-info-label">Công ty</span>
                          <strong>{selectedReceiptDetail.customer?.company_name || "-"}</strong>
                        </div>
                        <div>
                          <span className="receipt-info-label">Tài xế</span>
                          <strong>{selectedReceiptDetail.request?.driver_name || "-"}</strong>
                        </div>
                        <div>
                          <span className="receipt-info-label">Đơn hàng</span>
                          <strong>#{selectedReceiptDetail.order?.id || "-"}</strong>
                        </div>
                        <div>
                          <span className="receipt-info-label">Số chuyến</span>
                          <strong>{receiptShipments.length || 0}</strong>
                        </div>
                      </div>
                    </div>

                    <div className="receipt-section">
                      <div className="sheet-caption full">Order's info</div>
                      <div className="receipt-info-grid">
                        <div>
                          <span className="receipt-info-label">Hàng hóa</span>
                          <strong>{selectedReceiptDetail.order?.cargo_name || "-"}</strong>
                        </div>
                        <div>
                          <span className="receipt-info-label">Khối lượng</span>
                          <strong>{selectedReceiptDetail.order?.cargo_weight_kg ? `${selectedReceiptDetail.order.cargo_weight_kg} kg` : "-"}</strong>
                        </div>
                      </div>

                      <div className="receipt-shipments-stack">
                        {receiptShipments.map((shipment) => (
                          <div key={shipment.id} className="receipt-shipment-card">
                            <div className="receipt-shipment-head">
                              <strong>Chuyến #{shipment.id} · {shipment.shipment_index || "-"}</strong>
                              <span className={`trip-status status-${normalizeStatus(shipment.status)}`}>{shipment.status || "-"}</span>
                            </div>
                            <div className="receipt-info-grid">
                              <div>
                                <span className="receipt-info-label">Tài xế</span>
                                <strong>{shipment.driver_name || "-"}</strong>
                              </div>
                              <div>
                                <span className="receipt-info-label">Biển số</span>
                                <strong>{shipment.plate_number || "-"}</strong>
                              </div>
                              <div>
                                <span className="receipt-info-label">Nhóm xe</span>
                                <strong>{shipment.vehicle_group_name || "-"}</strong>
                              </div>
                              <div>
                                <span className="receipt-info-label">Đơn giá/km</span>
                                <strong>{formatCurrency(shipment.price_per_km)}</strong>
                              </div>
                              <div>
                                <span className="receipt-info-label">KM thực tế</span>
                                <strong>{shipment.actual_km ? `${shipment.actual_km} km` : "-"}</strong>
                              </div>
                              <div>
                                <span className="receipt-info-label">Doanh thu</span>
                                <strong>{formatCurrency(shipment.actual_revenue || shipment.actual_price || 0)}</strong>
                              </div>
                              <div>
                                <span className="receipt-info-label">Lộ trình</span>
                                <strong>{formatRouteLabel(shipment)}</strong>
                              </div>
                              <div>
                                <span className="receipt-info-label">Chi phí chuyến</span>
                                <strong>{formatCurrency(shipment.total_expenses)}</strong>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="receipt-section">
                      <div className="sheet-caption full">Publish</div>
                      <div className="receipt-expense-head">
                        <div>
                          <strong>Chi phí đơn hàng</strong>
                          <p>Quản lý toàn bộ chi phí của đơn hàng và thêm khoản mới ngay bên dưới.</p>
                        </div>
                        <button type="button" className="assign-btn" onClick={addReceiptExpense}>
                          + Thêm chi phí
                        </button>
                      </div>
                      <div className="receipt-expense-list">
                        {(selectedReceiptDetail.expenses || []).map((expense) => (
                          <div key={expense.id} className="receipt-expense-item readonly">
                            <div>
                              <strong>{expenseTypeOptions.find((option) => option.value === expense.expense_type)?.label || expense.expense_type}</strong>
                              <span>
                                {expense.description || "Chi phí đã ghi nhận"}
                                {expense.shipment_id ? ` · Chuyến #${expense.shipment_id}` : ""}
                              </span>
                            </div>
                            <strong>{formatCurrency(expense.amount)}</strong>
                          </div>
                        ))}

                        {receiptForm.expenses.map((expense, index) => (
                          <div key={`expense-${index}`} className="receipt-expense-editor">
                            <div className="receipt-expense-editor-grid">
                              <label>
                                <span className="receipt-info-label">Chuyến</span>
                                <select
                                  value={expense.shipment_id || receiptPrimaryShipment?.id || ""}
                                  onChange={(event) => updateReceiptExpenseShipment(index, event.target.value)}
                                >
                                  {receiptShipments.map((shipment) => (
                                    <option key={shipment.id} value={shipment.id}>
                                      {`Chuyến #${shipment.id} · ${shipment.plate_number || shipment.driver_name || "Chưa gán"}`}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                <span className="receipt-info-label">Loại chi phí</span>
                                <select
                                  value={expense.expense_type}
                                  onChange={(event) => updateReceiptExpense(index, "expense_type", event.target.value)}
                                >
                                  {expenseTypeOptions.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                <span className="receipt-info-label">Số tiền</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={expense.amount}
                                  onChange={(event) => updateReceiptExpense(index, "amount", event.target.value)}
                                  placeholder="0"
                                />
                              </label>
                              <label className="receipt-expense-note-field">
                                <span className="receipt-info-label">Mô tả</span>
                                <input
                                  value={expense.description}
                                  onChange={(event) => updateReceiptExpense(index, "description", event.target.value)}
                                  placeholder="Ví dụ: BOT, gửi xe, khấu hao chuyến..."
                                />
                              </label>
                            </div>
                            <button type="button" className="table-cancel-btn" onClick={() => removeReceiptExpense(index)}>
                              ×
                            </button>
                          </div>
                        ))}
                      </div>

                      <div className="receipt-notes-card">
                        <div className="receipt-field-head">
                          <div>
                            <span className="receipt-info-label">Ghi chú phiếu thu</span>
                            <strong>Thông tin nội bộ cho nhân viên điều phối</strong>
                          </div>
                          <span className="receipt-field-chip">Optional</span>
                        </div>
                        <textarea
                          className="receipt-notes-textarea"
                          value={receiptForm.notes}
                          onChange={(event) => updateReceiptField("notes", event.target.value)}
                          placeholder="Ví dụ: đối soát theo km thực tế, thêm chi phí cầu đường..."
                        />
                      </div>

                      <div className="receipt-summary-card emphasis">
                        <div>
                          <span>Chuyến dùng để chốt phiếu thu</span>
                          <strong>{receiptPrimaryShipment ? `#${receiptPrimaryShipment.id} · ${receiptPrimaryShipment.plate_number || receiptPrimaryShipment.driver_name || "-"}` : "-"}</strong>
                        </div>
                        <div>
                          <span>Tổng thu</span>
                          <strong>{formatCurrency(receiptFinalPrice)}</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="form-actions full">
                    <button type="button" className="filter" onClick={closeReceiptModal}>
                      Đóng
                    </button>
                    <button type="button" className="primary-btn" disabled={receiptPublishing} onClick={publishReceipt}>
                      {receiptPublishing ? "Đang publish..." : "Publish receipt"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}



        <section className="orders-panel">
          <div className="panel-head">
            <div>
              <h2>Yêu cầu phiếu thu</h2>
              <p>Lái xe gửi yêu cầu tạo phiếu thu, điều phối kiểm tra và tạo hóa đơn.</p>
            </div>
            <div className="upload-hint">
              {receiptRequestsLoading ? "Đang tải..." : `${receiptRequests.length} yêu cầu`}
            </div>
          </div>

          <div className="table-wrap" style={{ marginBottom: 24 }}>
            <table className="orders-table">
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Đơn</th>
                  <th>Chuyến</th>
                  <th>Khách hàng</th>
                  <th>Tài xế</th>
                  <th>KM thực tế</th>
                  <th>Cước</th>
                  <th>Trạng thái</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {receiptRequestsLoading ? (
                  <tr>
                    <td colSpan="9" className="empty-table-cell">Đang tải yêu cầu phiếu thu...</td>
                  </tr>
                ) : receiptRequests.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="empty-table-cell">Chưa có yêu cầu phiếu thu đang chờ xử lý.</td>
                  </tr>
                ) : (
                  receiptRequests.map((request) => (
                    <tr key={request.id}>
                      <td>#{request.id}</td>
                      <td>#{request.order_id}</td>
                      <td>{request.shipment_id ? `#${request.shipment_id}` : `${request.shipment_count || 0} chuyến`}</td>
                      <td>{request.customer_name || "-"}</td>
                      <td>{request.driver_name || "-"}</td>
                      <td>{Number(request.total_actual_distance_km || 0) > 0 ? `${request.total_actual_distance_km} km` : "-"}</td>
                      <td>{formatCurrency(resolveFareValue(request.actual_price, request.estimated_price))}</td>
                      <td>
                        <span className={`trip-status status-${normalizeStatus(request.status)}`}>
                          {request.status}
                        </span>
                      </td>
                      <td>
                        <button
                          className="assign-btn"
                          type="button"
                          onClick={() => openReceiptModal(request.id)}
                        >
                          Tạo phiếu thu
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="panel-head">
            <div>
              <h2>Danh sách đơn hàng</h2>
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
                    <React.Fragment key={trip.id}>
                      <tr>
                        <td>
                          {trip.trips && trip.trips.length > 1 && (
                            <button
                              onClick={() => toggleRow(trip.id)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', marginRight: 8, color: '#18227f', fontWeight: 'bold' }}
                            >
                              {expandedRows.has(trip.id) ? '▼' : '▶'}
                            </button>
                          )}
                          <span className="trip-id">
                            #{trip.orderId || String(trip.id).replace(/^tmp-/, "")}
                          </span>
                        </td>
                        <td>{trip.date || "-"}</td>
                        <td>{trip.plate || "-"}</td>
                        <td>{trip.driverName || "Chưa gán"}</td>
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
                          <span className={`trip-status status-${trip.statusClass || normalizeStatus(trip.status)}`}>
                            {trip.statusLabel || trip.status}
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

                      {expandedRows.has(trip.id) && trip.trips && trip.trips.length > 1 && trip.trips.map((subTrip, idx) => (
                        <tr key={`${trip.id}-sub-${idx}`} style={{ backgroundColor: '#f9faff' }}>
                          <td style={{ paddingLeft: 40, color: '#6b7280', fontSize: 13 }}>↳ Chuyến {idx + 1}</td>
                          <td style={{ color: '#6b7280', fontSize: 13 }}>-</td>
                          <td style={{ color: '#6b7280', fontSize: 13 }}>{subTrip.plate || "-"}</td>
                          <td style={{ color: '#6b7280', fontSize: 13 }}>{subTrip.driverName || "Chưa gán"}</td>
                          <td style={{ color: '#6b7280', fontSize: 13 }}>{trip.customerName}</td>
                          <td className="table-route-cell" style={{ color: '#6b7280', fontSize: 13 }}>
                            {subTrip.pickup_address && subTrip.delivery_address ? `${subTrip.pickup_address} - ${subTrip.delivery_address}` : "-"}
                          </td>
                          <td style={{ color: '#6b7280', fontSize: 13 }}>{subTrip.distance || "-"}</td>
                          <td style={{ color: '#6b7280', fontSize: 13 }}>
                            {typeof subTrip.fare === "number"
                              ? subTrip.fare.toLocaleString("vi-VN") + " đ"
                              : subTrip.fare || "-"}
                          </td>
                          <td className="table-address-cell" style={{ color: '#6b7280', fontSize: 13 }}>-</td>
                          <td>
                            <span className={`trip-status status-${normalizeStatus(subTrip.status || trip.status)}`}>
                              {subTrip.status || trip.status}
                            </span>
                          </td>
                          <td></td>
                        </tr>
                      ))}
                    </React.Fragment>
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

        <ProfileModal
          open={profileModalOpen}
          onClose={() => setProfileModalOpen(false)}
          onProfileUpdated={handleProfileUpdated}
        />
      </main>
    </div>
  );

}
