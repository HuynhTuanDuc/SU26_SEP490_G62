import React, { useDeferredValue, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../services/apiClient";
import { useRoleRealtime } from "../../hooks/useRoleRealtime";
import "../../styles/Coordinator.css";
import { message as toast } from "antd";
import ProfileModal from "../../components/profile/ProfileModal";
import { saveSession } from "../../services/storage";

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
  trips: [{ vehicle_group_id: "", plate: "", distance: "", pickup_address: "", delivery_address: "", pickup_addresses: [""], delivery_addresses: [""] }]
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
const formatCurrency = (value) => `${Number(value || 0).toLocaleString("vi-VN")} đ`;
const expenseTypeOptions = [
  { value: "fuel", label: "Nhiên liệu" },
  { value: "toll", label: "Cầu đường" },
  { value: "parking", label: "Đỗ xe" },
  { value: "repair", label: "Sửa chữa" },
  { value: "maintenance", label: "Bảo dưỡng" },
  { value: "depreciation", label: "Khấu hao" },
  { value: "other", label: "Khác" },
];
const newReceiptExpense = () => ({
  expense_type: "fuel",
  amount: "",
  description: "",
});
const emptyReceiptForm = () => ({
  notes: "",
  expenses: [],
});
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
  const statuses = Array.isArray(trip.trips) && trip.trips.length > 0
    ? trip.trips.map((item) => normalizeStatus(item.status))
    : [normalizeStatus(trip.status)];
  return Boolean(trip.orderId) && statuses.some((status) => !["completed", "cancelled", "failed"].includes(status));
};
const shouldHighlightNoCheckIn = (trip) => {
  const hasCheckInMarker = /(?:^|\|)\s*Chấm công\s*:/i.test(String(trip.notes ?? ""));
  return hasCheckInMarker && !String(trip.checkIn ?? "").trim();
};



const getDistinctValues = (items, key) => [
  ...new Set(items.map((item) => String(item?.[key] ?? "").trim()).filter(Boolean)),
];

const getSummaryValue = (items, key, emptyLabel = "-") => {
  const values = getDistinctValues(items, key);
  if (values.length === 0) return emptyLabel;
  if (values.length === 1) return values[0];
  return `${values.length} khac nhau`;
};

const getOrderStatusLabel = (order, trips) => {
  if (!Array.isArray(trips) || trips.length <= 1) {
    return trips?.[0]?.status || order.status || order.first_shipment_status || order.order_status || "-";
  }
  const statuses = getDistinctValues(trips, "status");
  if (statuses.length === 1) return statuses[0];
  return `${statuses.length} trang thai`;
};

const splitRoute = (route) => {
  const text = String(route ?? "").trim();
  if (!text) return { pickup: "", delivery: "" };
  const parts = text.split(/\s+-\s+/);
  if (parts.length < 2) return { pickup: text, delivery: "" };
  return { pickup: parts[0].trim(), delivery: parts.slice(1).join(" - ").trim() };
};

const firstStop = (trip, key, fallbackKey) => {
  const list = Array.isArray(trip?.[key]) ? trip[key].map((value) => String(value ?? "").trim()).filter(Boolean) : [];
  if (list.length > 0) return list[0];
  return String(trip?.[fallbackKey] ?? "").trim();
};

const lastStop = (trip, key, fallbackKey) => {
  const list = Array.isArray(trip?.[key]) ? trip[key].map((value) => String(value ?? "").trim()).filter(Boolean) : [];
  if (list.length > 0) return list[list.length - 1];
  return String(trip?.[fallbackKey] ?? "").trim();
};






function extractDriverName(notes) {
  const match = String(notes ?? "").match(/L(?:ái|ai) xe:\s*([^|]+)/i);
  return match?.[1]?.trim() || "";
}

function extractDistance(notes) {
  const match = String(notes ?? "").match(/Qu(?:ã|a)ng đường:\s*([^|]+)/i);
  return match?.[1]?.trim() || "";
}

const resolveFareValue = (...values) => {
  for (const value of values) {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue) && numericValue > 0) return numericValue;
  }
  return 0;
};

function buildTripFromOrder(order) {
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
    plate: isMultiShipment ? `${trips.length} chuyen` : (firstTrip.plate || order.plate_number || ""),
    driverId: firstTrip.owner_driver_id || order.owner_driver_id || "",
    vehicleGroupId: firstTrip.vehicle_group_id || order.vehicle_group_id || "",
    driverName: isMultiShipment ? getSummaryValue(trips, "driverName", "Chua gan") : (firstTrip.driverName || order.driver_name || ""),
    customerName: order.customer_name || "",
    customerPhone: order.customer_phone || "",
    cargoName: order.cargo_name || "",
    cargoWeightKg: order.cargo_weight_kg || "",
    pickupAddress,
    deliveryAddress,
    route: isMultiShipment
      ? `${trips.length} chuyen - mo chi tiet de xem tung chuyen`
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

export default function CoordinatorPage({ user, onLogout }) {
  const [currentUser, setCurrentUser] = useState(user);
  const [activeView, setActiveView] = useState("orders");
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [trips, setTrips] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState(null);
  const [creating, setCreating] = useState(false);
  const [drivers, setDrivers] = useState([]);
  const [vehicleGroups, setVehicleGroups] = useState([]);
  const [partners, setPartners] = useState([]);
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
  const [receiptRejectingId, setReceiptRejectingId] = useState(null);
  const [selectedReceiptDetail, setSelectedReceiptDetail] = useState(null);
  const [receiptForm, setReceiptForm] = useState(emptyReceiptForm);
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const [notificationMenuOpen, setNotificationMenuOpen] = useState(false);

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
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pagination.limit),
      });
      if (deferredSearchQuery.trim()) params.set("search", deferredSearchQuery.trim());
      if (STATUS_QUERY[activeTab]) params.set("status", STATUS_QUERY[activeTab]);
      if (dateFromFilter) params.set("dateFrom", dateFromFilter);
      if (dateToFilter) params.set("dateTo", dateToFilter);
      if (customerFilter.trim()) params.set("customer", customerFilter.trim());

      const data = await apiRequest(`/api/orders?${params.toString()}`);
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
        const data = await apiRequest("/api/coordinator/vehicle-groups");
        setVehicleGroups(data.vehicleGroups || []);
      } catch (error) {
        setMessage("Không thể tải danh sách nhóm xe/BKS.");
        setMessageType("error");
      }
    };

    loadVehicleGroups();
  }, []);

  useEffect(() => {
    const loadPartners = async () => {
      try {
        const data = await apiRequest("/api/coordinator/partners");
        setPartners(data.partners || []);
      } catch (error) {
        setMessage("Không thể tải danh sách đối tác.");
        setMessageType("error");
      }
    };

    loadPartners();
  }, []);

  const loadNotifications = async () => {
    setNotificationsLoading(true);
    try {
      const data = await apiRequest("/api/notifications?limit=10&page=1");
      setNotifications(data.notifications || []);
      setNotificationUnreadCount(Number(data.unreadCount || 0));
    } catch (error) {
      setMessage(error.message || "Khong the tai thong bao.");
      setMessageType("error");
    } finally {
      setNotificationsLoading(false);
    }
  };

  const loadReceiptRequests = async () => {
    setReceiptRequestsLoading(true);
    try {
      const data = await apiRequest("/api/coordinator/receipt-requests");
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
    loadNotifications();
  }, []);

  useRoleRealtime(currentUser, {
    onMessage: (payload) => {
      if (!payload?.type) return;

      if (payload.type === "notification.created") {
        setNotificationUnreadCount((current) => current + 1);
        loadNotifications();
      }

      if (payload.type === "notification.read" || payload.type === "notification.read_all") {
        loadNotifications();
      }

      if (
        payload.type === "coordinator.receipt_requests.changed" ||
        payload.type === "notification.created"
      ) {
        loadReceiptRequests();
      }

      if (
        payload.type === "coordinator.orders.changed" ||
        payload.type === "coordinator.receipt_requests.changed"
      ) {
        loadOrders(pagination.page);
      }
    },
  });

  useEffect(() => {
    if (!message) return undefined;

    const timer = window.setTimeout(() => {
      setMessage("");
      setMessageType("info");
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [message]);

  const handleLogout = () => {
    onLogout?.();
  };

  const handleProfileUpdated = (nextProfile) => {
    const mergedUser = { ...currentUser, ...nextProfile };
    setCurrentUser(mergedUser);
    saveSession({ user: mergedUser });
  };

  const handleOpenNotifications = async () => {
    const nextOpen = !notificationMenuOpen;
    setNotificationMenuOpen(nextOpen);
    if (!nextOpen) return;

    await loadNotifications();
    if (notificationUnreadCount > 0) {
      try {
        await apiRequest("/api/notifications/read-all", { method: "PATCH" });
        setNotificationUnreadCount(0);
        setNotifications((current) => current.map((item) => ({ ...item, is_read: true })));
      } catch (error) {
        setMessage(error.message || "Khong the danh dau da doc.");
        setMessageType("error");
      }
    }
  };

  const formatNotificationTime = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("vi-VN");
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
      const detail = await apiRequest(`/api/coordinator/receipt-requests/${requestId}`);
      setSelectedReceiptDetail(detail);
      setReceiptForm({
        notes: detail?.request?.coordinator_notes || "",
        expenses: [],
      });
    } catch (error) {
      setMessage(error.message || "Khong the tai chi tiet yeu cau phieu thu.");
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
        body: payload,
      });

      setMessage(data.message || "Da tao phieu thu thanh cong.");
      setMessageType("success");
      closeReceiptModal();
      await Promise.all([loadReceiptRequests(), loadOrders(pagination.page), loadNotifications()]);
    } catch (error) {
      setMessage(error.message || "Khong the tao phieu thu.");
      setMessageType("error");
    } finally {
      setReceiptPublishing(false);
    }
  };

  const rejectReceiptRequest = async (requestId) => {
    const reason = window.prompt("Nhap ly do tu choi yeu cau phieu thu:");
    if (reason === null) return;

    setReceiptRejectingId(requestId);
    try {
      const data = await apiRequest(`/api/coordinator/receipt-requests/${requestId}/reject`, {
        method: "POST",
        body: { notes: reason.trim() },
      });
      setMessage(data.message || "Da tu choi yeu cau phieu thu.");
      setMessageType("success");
      await Promise.all([loadReceiptRequests(), loadNotifications()]);
    } catch (error) {
      setMessage(error.message || "Khong the tu choi yeu cau phieu thu.");
      setMessageType("error");
    } finally {
      setReceiptRejectingId(null);
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
    return `${pickup} -> ${delivery}`;
  };

    const renderOrdersPanel = () => (
    <>
      <section className="hero">
        <div>
          <h1>Dieu phoi don hang</h1>
          <p>Theo doi don hang, loc nhanh va tao chuyen moi ngay trong mot man hinh.</p>
        </div>
        <div className="filters order-filters">
          <label className="filter-field">
            <span>Tu ngay</span>
            <input
              type="date"
              value={dateFromFilter}
              onChange={(event) => setDateFromFilter(event.target.value)}
            />
          </label>
          <label className="filter-field">
            <span>Den ngay</span>
            <input
              type="date"
              value={dateToFilter}
              min={dateFromFilter || undefined}
              onChange={(event) => setDateToFilter(event.target.value)}
            />
          </label>
          <label className="filter-field filter-field-customer">
            <span>Khach hang</span>
            <input
              value={customerFilter}
              onChange={(event) => setCustomerFilter(event.target.value)}
              placeholder="Loc theo khach hang"
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
            Xoa loc
          </button>
          <button
            className={activeTab === "all" ? "filter active" : "filter"}
            onClick={() => setActiveTab("all")}
          >
            Tat ca
          </button>
          <button
            className={activeTab === "new" ? "filter active" : "filter"}
            onClick={() => setActiveTab("new")}
          >
            Moi
          </button>
          <button
            className={activeTab === "waiting" ? "filter active" : "filter"}
            onClick={() => setActiveTab("waiting")}
          >
            Dang xu ly
          </button>
        </div>
      </section>

      <section className="orders-panel">
        <div className="panel-head">
          <div>
            <h2>Danh sach don hang</h2>
            <p>Hien thi don hang dang dieu phoi de de theo doi va cap nhat.</p>
          </div>
          <div className="upload-hint">
            {pagination.total ? `${pagination.total} don` : `${filteredTrips.length} don`}
          </div>
        </div>

        <div className="table-wrap">
          <table className="orders-table">
            <thead>
              <tr>
                <th>Ma don</th>
                <th>Ngay</th>
                <th>BKS</th>
                <th>Lai xe</th>
                <th>Khach hang</th>
                <th>Hanh trinh</th>
                <th>Quang duong</th>
                <th>Cuoc xe</th>
                <th>Ghi chu</th>
                <th>Trang thai</th>
                <th>Thao tac</th>
              </tr>
            </thead>
            <tbody>
              {filteredTrips.length === 0 ? (
                <tr>
                  <td colSpan="11" className="empty-table-cell">
                    Chua co don hang. Tao moi don de bat dau dieu phoi.
                  </td>
                </tr>
              ) : (
                filteredTrips.map((trip) => (
                  <React.Fragment key={trip.id}>
                    <tr className={shouldHighlightNoCheckIn(trip) ? "row-no-checkin" : ""}>
                      <td>
                        {trip.trips && trip.trips.length > 1 && (
                          <button
                            onClick={() => toggleRow(trip.id)}
                            className="expand-btn"
                            type="button"
                            title={expandedRows.has(trip.id) ? "Thu gon" : "Mo rong"}
                          >
                            {expandedRows.has(trip.id) ? "-" : "+"}
                          </button>
                        )}
                        <span className="trip-id">#{trip.orderId}</span>
                      </td>
                      <td>{trip.date || "-"}</td>
                      <td>{trip.plate || "-"}</td>
                      <td>{trip.driverName || "-"}</td>
                      <td>{trip.customerName || "-"}</td>
                      <td className="table-route-cell">{trip.route || "-"}</td>
                      <td>{trip.distance ? `${trip.distance} km` : "-"}</td>
                      <td>{formatCurrency(trip.fare)}</td>
                      <td className="table-address-cell">{trip.notes || "-"}</td>
                      <td>
                        <span className={`trip-status status-${normalizeStatus(trip.statusClass || trip.status)}`}>
                          {trip.statusLabel || trip.status || "-"}
                        </span>
                      </td>
                      <td>
                        <div className="table-actions">
                          <button className="table-edit-btn" type="button" onClick={() => openEditModal(trip)}>
                            E
                          </button>
                          <button
                            className="table-cancel-btn"
                            type="button"
                            disabled={!canCancelTrip(trip)}
                            onClick={() => handleCancelOrder(trip)}
                          >
                            X
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedRows.has(trip.id) && trip.trips?.length > 1 && trip.trips.map((shipment, index) => (
                      <tr key={`${trip.id}-shipment-${shipment.shipment_id || index}`} className="trip-subrow">
                        <td>{`Chuyen ${shipment.shipment_index || index + 1}`}</td>
                        <td>{shipment.arrived_at ? new Date(shipment.arrived_at).toLocaleDateString("vi-VN") : "-"}</td>
                        <td>{shipment.plate || "-"}</td>
                        <td>{shipment.driverName || "-"}</td>
                        <td>{trip.customerName || "-"}</td>
                        <td className="table-route-cell">
                          {`${firstStop(shipment, "pickup_addresses", "pickup_address") || "-"} - ${lastStop(shipment, "delivery_addresses", "delivery_address") || "-"}`}
                        </td>
                        <td>{shipment.distance ? `${shipment.distance} km` : "-"}</td>
                        <td>{formatCurrency(shipment.fare)}</td>
                        <td className="table-address-cell">{shipment.trip_code || "-"}</td>
                        <td>
                          <span className={`trip-status status-${normalizeStatus(shipment.status)}`}>
                            {shipment.status || "-"}
                          </span>
                        </td>
                        <td>-</td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );

  const renderReceiptManagement = () => (
    <>
      <section className="hero hero-compact">
        <div>
          <h1>Quan ly phieu thu</h1>
          <p>Tap trung xu ly yeu cau phieu thu va theo doi thong tin moi tu tai xe.</p>
        </div>
        <div className="hero-metrics">
          <div className="upload-hint">{receiptRequestsLoading ? "Dang tai..." : `${receiptRequests.length} yeu cau`}</div>
          <div className="upload-hint">{notificationUnreadCount} thong bao moi</div>
        </div>
      </section>

      <section className="orders-panel">
        <div className="panel-head">
          <div>
            <h2>Receipt requests</h2>
            <p>Tai xe gui yeu cau tao phieu thu, Coordinator kiem tra va publish tai day.</p>
          </div>
        </div>

        <div className="table-wrap">
          <table className="orders-table">
            <thead>
              <tr>
                <th>Request</th>
                <th>Don</th>
                <th>Chuyen</th>
                <th>Khach hang</th>
                <th>Tai xe</th>
                <th>KM thuc te</th>
                <th>Cuoc</th>
                <th>Trang thai</th>
                <th>Thao tac</th>
              </tr>
            </thead>
            <tbody>
              {receiptRequestsLoading ? (
                <tr>
                  <td colSpan="9" className="empty-table-cell">Dang tai yeu cau phieu thu...</td>
                </tr>
              ) : receiptRequests.length === 0 ? (
                <tr>
                  <td colSpan="9" className="empty-table-cell">Chua co yeu cau phieu thu dang cho xu ly.</td>
                </tr>
              ) : (
                receiptRequests.map((request) => (
                  <tr key={request.id}>
                    <td>#{request.id}</td>
                    <td>#{request.order_id}</td>
                    <td>{request.shipment_id ? `#${request.shipment_id}` : `${request.shipment_count || 0} chuyen`}</td>
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
                      <div className="table-actions">
                        <button
                          className="assign-btn"
                          type="button"
                          onClick={() => openReceiptModal(request.id)}
                        >
                          Tao phieu thu
                        </button>
                        <button
                          className="table-cancel-btn"
                          type="button"
                          disabled={receiptRejectingId === request.id}
                          onClick={() => rejectReceiptRequest(request.id)}
                        >
                          {receiptRejectingId === request.id ? "..." : "X"}
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
    </>
  );

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
            aria-label={sidebarCollapsed ? "Mo rong sidebar" : "Thu gon sidebar"}
            title={sidebarCollapsed ? "Mo rong sidebar" : "Thu gon sidebar"}
          >
            {sidebarCollapsed ? ">" : "<"}
          </button>
          <nav className="nav">
            <button className={`nav-item ${activeView === "orders" ? "active" : ""}`} type="button" onClick={() => setActiveView("orders")}>
              <span className="nav-icon">O</span><span className="nav-label">Don hang</span>
            </button>
            <button className={`nav-item ${activeView === "receipts" ? "active" : ""}`} type="button" onClick={() => setActiveView("receipts")}>
              <span className="nav-icon">R</span><span className="nav-label">Phieu thu</span>
            </button>
          </nav>
        </div>
        <button className="nav-item nav-footer" onClick={handleLogout}>
          <span className="nav-icon">L</span><span className="nav-label">Dang xuat</span>
        </button>
      </aside>

      <main className="content">
        <header className="topbar">
          <div className="search-box">
            <span className="search-icon">?</span>
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={activeView === "receipts"
                ? "Tim theo don, tai xe, khach hang, trang thai"
                : "Ten san pham, diem lay hang, giao hang, tai xe, trang thai"}
            />
          </div>
          <div className="topbar-actions">
            {activeView === "orders" && (
              <button className="primary-btn" onClick={openCreateModal}>
                + Tao moi
              </button>
            )}
            <div className="notification-wrap">
              <button className="icon-btn notification-btn" type="button" onClick={handleOpenNotifications} title="Thong bao">
                <span>Bell</span>
                {notificationUnreadCount > 0 && <span className="notification-count">{notificationUnreadCount > 9 ? "9+" : notificationUnreadCount}</span>}
              </button>
              {notificationMenuOpen && (
                <div className="notification-menu">
                  <div className="notification-menu-head">
                    <strong>Thong bao Coordinator</strong>
                    <span>{notificationUnreadCount} moi</span>
                  </div>
                  <div className="notification-menu-list">
                    {notificationsLoading ? (
                      <div className="notification-empty">Dang tai thong bao...</div>
                    ) : notifications.length === 0 ? (
                      <div className="notification-empty">Chua co thong bao.</div>
                    ) : (
                      notifications.map((notification) => (
                        <div key={notification.id} className={`notification-item ${notification.is_read ? "" : "unread"}`}>
                          <strong>{notification.title}</strong>
                          <p>{notification.message || "-"}</p>
                          <span>{formatNotificationTime(notification.created_at)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
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
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  } : undefined}
                >
                  {currentUser?.avatar_url ? "" : (currentUser?.full_name?.[0] || "A")}
                </span>
                <span className="profile-trigger-copy">
                  <span className="profile-trigger-name">{currentUser?.full_name || "Coordinator"}</span>
                  <span className="profile-trigger-role">Coordinator</span>
                </span>
              </button>
              {profileMenuOpen && (
                <div className="profile-menu">
                  <div className="profile-menu-name">{currentUser?.full_name || currentUser?.email || "Coordinator"}</div>
                  <div className="profile-menu-email">{currentUser?.email}</div>
                  <button type="button" onClick={() => { setProfileMenuOpen(false); setProfileModalOpen(true); }}>Ho so ca nhan</button>
                  <button type="button" onClick={handleLogout}>Dang xuat</button>
                </div>
              )}
            </div>
          </div>
        </header>

        {activeView === "orders" ? renderOrdersPanel() : renderReceiptManagement()}

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

                <div className="form-row full" style={{ marginTop: 12, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button
                    type="button"
                    onClick={() => updateField("is_partner", !form.is_partner)}
                    style={{
                      border: '1px solid #cfd6e6',
                      background: form.is_partner ? '#18227f' : '#fff',
                      color: form.is_partner ? '#fff' : '#2a3144',
                      borderRadius: 14,
                      padding: '11px 14px',
                      cursor: 'pointer',
                      font: 'inherit',
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Đơn từ đối tác liên kết
                  </button>
                </div>

                {form.is_partner && (
                  <div className="form-row full" style={{ marginBottom: 16 }}>
                    <label style={{ display: 'grid', gap: 6, fontSize: 14, color: '#2a3144' }}>
                      <span>Đối tác</span>
                      <select
                        value={form.partner_name}
                        onChange={(event) => updateField("partner_name", event.target.value)}
                        style={{ width: '100%', border: '1px solid #cfd6e6', borderRadius: 14, padding: '13px 14px', font: 'inherit', background: '#fff', outline: 'none', boxSizing: 'border-box' }}
                      >
                        <option value="">Chọn đối tác</option>
                        {partners.map((partner) => (
                          <option key={partner.id} value={partner.company_name}>
                            {partner.contact_person ? `${partner.company_name} - ${partner.contact_person}` : partner.company_name}
                          </option>
                        ))}
                      </select>
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
                          {trip.plate && !getAvailablePlates(trip.vehicle_group_id).some((v) => v.plate_number === trip.plate) && (
                            <option value={trip.plate}>{trip.plate}</option>
                          )}
                          {getAvailablePlates(trip.vehicle_group_id).map((v) => (
                            <option key={v.id} value={v.plate_number}>
                              {v.assigned_driver_name ? `${v.plate_number} - ${v.assigned_driver_name}` : v.plate_number}
                            </option>
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
                      <div style={{ display: 'grid', gap: 8 }}>
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
                        {(trip.pickup_addresses || [trip.pickup_address]).map((address, stopIndex) => (
                          <div key={`pickup-${stopIndex}`} style={{ display: 'flex', gap: 8 }}>
                            <input
                              value={address || ""}
                              onChange={(e) => updateTripStopList(index, 'pickup_addresses', stopIndex, e.target.value)}
                              placeholder={stopIndex === 0 ? 'Điểm lấy hàng' : `Điểm lấy #${stopIndex + 1}`}
                              style={{ flex: 1, border: '1px solid #cfd6e6', borderRadius: 14, padding: '11px 12px', font: 'inherit', background: '#fff', boxSizing: 'border-box' }}
                            />
                            <button type="button" onClick={() => removeTripStop(index, 'pickup_addresses', stopIndex)} style={{ border: 'none', background: '#fee2e2', color: '#b91c1c', borderRadius: 10, padding: '0 12px', cursor: 'pointer' }}>×</button>
                          </div>
                        ))}
                        <button type="button" onClick={() => addTripStop(index, 'pickup_addresses')} style={{ alignSelf: 'start', border: '1px dashed #18227f', background: '#eef1ff', color: '#18227f', borderRadius: 12, padding: '8px 12px', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                          + Thêm điểm lấy
                        </button>
                      </div>

                      <div style={{ display: 'grid', gap: 8 }}>
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
                        {(trip.delivery_addresses || [trip.delivery_address]).map((address, stopIndex) => (
                          <div key={`delivery-${stopIndex}`} style={{ display: 'flex', gap: 8 }}>
                            <input
                              value={address || ""}
                              onChange={(e) => updateTripStopList(index, 'delivery_addresses', stopIndex, e.target.value)}
                              placeholder={stopIndex === 0 ? 'Điểm giao hàng' : `Điểm giao #${stopIndex + 1}`}
                              style={{ flex: 1, border: '1px solid #cfd6e6', borderRadius: 14, padding: '11px 12px', font: 'inherit', background: '#fff', boxSizing: 'border-box' }}
                            />
                            <button type="button" onClick={() => removeTripStop(index, 'delivery_addresses', stopIndex)} style={{ border: 'none', background: '#fee2e2', color: '#b91c1c', borderRadius: 10, padding: '0 12px', cursor: 'pointer' }}>×</button>
                          </div>
                        ))}
                        <button type="button" onClick={() => addTripStop(index, 'delivery_addresses')} style={{ alignSelf: 'start', border: '1px dashed #18227f', background: '#eef1ff', color: '#18227f', borderRadius: 12, padding: '8px 12px', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                          + Thêm điểm giao
                        </button>
                      </div>
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
                            <strong>Thông tin nội bộ cho coordinator</strong>
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


        <ProfileModal
          open={profileModalOpen}
          onClose={() => setProfileModalOpen(false)}
          onProfileUpdated={handleProfileUpdated}
        />
      </main>
    </div>
  );

}
