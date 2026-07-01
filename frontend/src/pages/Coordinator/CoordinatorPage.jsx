import React, { useDeferredValue, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../services/apiClient";
import { useRoleRealtime } from "../../hooks/useRoleRealtime";
import "../../styles/Coordinator.css";
import { Button, Input, Segmented, Tooltip, Typography, message as toast, Pagination } from "antd";
import {
  CloseOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FileTextOutlined,
  MinusOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import AppHeader from "../../components/layout/AppHeader";
import AppSidebar from "../../components/layout/AppSidebar";
import { saveSession } from "../../services/storage";
import { C } from "../../styles/theme";

const { Title, Text } = Typography;

//Đặt yêu cầu cho empty form 
const getTodayStr = () => new Date().toISOString().slice(0, 10);

const emptyForm = () => ({
  date: getTodayStr(),
  customer_name: "",
  customer_phone: "",
  cargo_name: "",
  cargo_weight_kg: "",
  prepaid_amount: "",
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
const formatNotificationTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("vi-VN");
};

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
const ORDER_STATUS_FILTERS = [
  { label: "Tat ca", value: "all" },
  { label: "Moi", value: "new" },
  { label: "Dang xu ly", value: "waiting" },
];
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
    prepaidAmount: order.prepaid_amount || "",
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
  const [orderSearchQuery, setOrderSearchQuery] = useState("");
  const [receiptSearchQuery, setReceiptSearchQuery] = useState("");
  const [trips, setTrips] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState(null);
  const [creating, setCreating] = useState(false);
  const [drivers, setDrivers] = useState([]);
  const [incidentSearchQuery, setIncidentSearchQuery] = useState("");
  const [incidents, setIncidents] = useState([]);
  const [incidentsLoading, setIncidentsLoading] = useState(false);
  const [incidentModalOpen, setIncidentModalOpen] = useState(false);
  const [incidentSaving, setIncidentSaving] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [incidentForm, setIncidentForm] = useState({ status: "investigating", resolution: "", replacement_driver_id: "" });
  const [vehicleGroups, setVehicleGroups] = useState([]);
  const [partners, setPartners] = useState([]);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");
  const [form, setForm] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [receiptPagination, setReceiptPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [incidentPagination, setIncidentPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [receiptRequests, setReceiptRequests] = useState([]);
  const [receiptRequestsLoading, setReceiptRequestsLoading] = useState(false);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [receiptDetailLoading, setReceiptDetailLoading] = useState(false);
  const [receiptPublishing, setReceiptPublishing] = useState(false);
  const [receiptRejectingId, setReceiptRejectingId] = useState(null);
  const [selectedReceiptDetail, setSelectedReceiptDetail] = useState(null);
  const [receiptForm, setReceiptForm] = useState(emptyReceiptForm);
  const [receiptKindFilter, setReceiptKindFilter] = useState("all");
  const [receiptStatusFilter, setReceiptStatusFilter] = useState("all");
  const [receiptDateFromFilter, setReceiptDateFromFilter] = useState("");
  const [receiptDateToFilter, setReceiptDateToFilter] = useState("");

  const toggleRow = (orderId) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const deferredOrderSearchQuery = useDeferredValue(orderSearchQuery);
  const deferredReceiptSearchQuery = useDeferredValue(receiptSearchQuery);
  const deferredIncidentSearchQuery = useDeferredValue(incidentSearchQuery);




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
      if (deferredOrderSearchQuery.trim()) params.set("search", deferredOrderSearchQuery.trim().replace(/\s+/g, " "));
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
    if (activeView !== "orders") return;
    loadOrders(1);
  }, [activeView, activeTab, customerFilter, dateFromFilter, dateToFilter, deferredOrderSearchQuery]);

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
    const loadDrivers = async () => {
      try {
        const data = await apiRequest("/api/drivers");
        setDrivers(data.drivers || []);
      } catch (error) {
        setMessage("Khong the tai danh sach tai xe.");
        setMessageType("error");
      }
    };

    loadDrivers();
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

  const loadReceiptRequests = async (page = receiptPagination.page) => {
    setReceiptRequestsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(receiptPagination.limit),
      });
      if (receiptKindFilter !== "all") params.set("kind", receiptKindFilter);
      if (receiptStatusFilter !== "all") params.set("status", receiptStatusFilter);
      if (deferredReceiptSearchQuery.trim()) params.set("search", deferredReceiptSearchQuery.trim());
      if (receiptDateFromFilter) params.set("dateFrom", receiptDateFromFilter);
      if (receiptDateToFilter) params.set("dateTo", receiptDateToFilter);

      const queryString = params.toString();
      const data = await apiRequest(`/api/coordinator/receipt-requests${queryString ? `?${queryString}` : ""}`);
      setReceiptRequests(data.requests || []);
      if (data.pagination) {
        setReceiptPagination(data.pagination);
      } else {
        setReceiptPagination({ page, limit: receiptPagination.limit, total: data.requests?.length || 0, totalPages: 1 });
      }
    } catch (error) {
      setMessage(error.message || "Không thể tải danh sách yêu cầu phiếu thu.");
      setMessageType("error");
    } finally {
      setReceiptRequestsLoading(false);
    }
  };

  useEffect(() => {
    if (activeView !== "receipts") return;
    loadReceiptRequests(1);
  }, [activeView, receiptKindFilter, receiptStatusFilter, receiptDateFromFilter, receiptDateToFilter, deferredReceiptSearchQuery]);

  const loadIncidents = async (page = incidentPagination.page) => {
    setIncidentsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(incidentPagination.limit),
      });
      if (deferredIncidentSearchQuery.trim()) params.set("search", deferredIncidentSearchQuery.trim());
      const queryString = params.toString();
      const data = await apiRequest(`/api/coordinator/incidents${queryString ? `?${queryString}` : ""}`);
      setIncidents(data.incidents || []);
      if (data.pagination) {
        setIncidentPagination(data.pagination);
      } else {
        setIncidentPagination({ page, limit: incidentPagination.limit, total: data.incidents?.length || 0, totalPages: 1 });
      }
    } catch (error) {
      setMessage(error.message || "Khong the tai danh sach su co.");
      setMessageType("error");
    } finally {
      setIncidentsLoading(false);
    }
  };

  useEffect(() => {
    if (activeView !== "incidents") return;
    loadIncidents(1);
  }, [activeView, deferredIncidentSearchQuery]);

  useRoleRealtime(currentUser, {
    onMessage: (payload) => {
      if (!payload?.type) return;

      if (
        activeView === "receipts" &&
        (
          payload.type === "coordinator.receipt_requests.changed" ||
          payload.type === "notification.created"
        )
      ) {
        loadReceiptRequests();
      }

      if (activeView === "orders" && payload.type === "coordinator.orders.changed") {
        loadOrders(pagination.page);
      }

      if (activeView === "incidents" && payload.type === "coordinator.incidents.changed") {
        loadIncidents();
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

  const resetReceiptFilters = () => {
    setReceiptKindFilter("all");
    setReceiptStatusFilter("all");
    setReceiptDateFromFilter("");
    setReceiptDateToFilter("");
  };

  const closeReceiptModal = () => {
    setReceiptModalOpen(false);
    setSelectedReceiptDetail(null);
    setReceiptForm(emptyReceiptForm());
  };

  const closeIncidentModal = () => {
    setIncidentModalOpen(false);
    setSelectedIncident(null);
    setIncidentForm({ status: "investigating", resolution: "", replacement_driver_id: "" });
  };

  const openIncidentModal = (incident) => {
    setSelectedIncident(incident);
    setIncidentForm({
      status: incident.status === "open" ? "investigating" : incident.status || "investigating",
      resolution: "",
      replacement_driver_id: incident.replacement_driver_id ? String(incident.replacement_driver_id) : "",
    });
    setIncidentModalOpen(true);
  };

  const handleIncidentSubmit = async () => {
    if (!selectedIncident) return;
    setIncidentSaving(true);
    try {
      await apiRequest(`/api/incidents/${selectedIncident.id}/status`, {
        method: "PATCH",
        body: {
          status: incidentForm.status,
          resolution: incidentForm.resolution || null,
          replacementDriverId: incidentForm.replacement_driver_id ? Number(incidentForm.replacement_driver_id) : null,
        },
      });
      setMessage("Cap nhat su co thanh cong.");
      setMessageType("success");
      closeIncidentModal();
      loadIncidents();
      loadOrders(pagination.page);
    } catch (error) {
      setMessage(error.message || "Khong the cap nhat su co.");
      setMessageType("error");
    } finally {
      setIncidentSaving(false);
    }
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
      await Promise.all([loadReceiptRequests(), loadOrders(pagination.page)]);
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
      await Promise.all([loadReceiptRequests()]);
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
  const selectedReceiptStatus = normalizeStatus(selectedReceiptDetail?.request?.status);
  const isReceiptReadonly = ["approved", "rejected"].includes(selectedReceiptStatus);
  const receiptSummary = useMemo(() => {
    const approved = receiptRequests.filter((item) => normalizeStatus(item.status) === "approved").length;
    const pending = receiptRequests.filter((item) => ["pending", "processing"].includes(normalizeStatus(item.status))).length;
    return {
      total: receiptRequests.length,
      approved,
      pending,
    };
  }, [receiptRequests]);

  const filteredTrips = trips;
  const totalFare = useMemo(
    () => form.trips.reduce((sum, trip) => sum + resolveFareValue(getTripFare(trip)), 0),
    [form.trips, vehicleGroups],
  );

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
        nextErrors[key] = `${label} la bat buoc.`;
      }
    });

    if (trimmedPhone && !/^\d{7,15}$/.test(trimmedPhone)) {
      nextErrors.customer_phone = "So dien thoai khong hop le.";
    }

    if (normalizedWeight && (!isFiniteNumber(normalizedWeight) || Number(normalizedWeight) < 0)) {
      nextErrors.cargo_weight_kg = "Khoi luong phai la so hop le.";
    }

    if (normalizeNumericText(form.prepaid_amount) && (!isFiniteNumber(normalizeNumericText(form.prepaid_amount)) || Number(normalizeNumericText(form.prepaid_amount)) < 0)) {
      nextErrors.prepaid_amount = "So tien ung truoc phai la so khong am.";
    }

    if (form.is_partner && !String(form.partner_name || "").trim()) {
      nextErrors.partner_name = "Vui long chon doi tac.";
    }

    form.trips.forEach((trip, index) => {
      if (!String(trip.vehicle_group_id || "").trim()) {
        nextErrors[`trip_${index}_vehicle_group_id`] = "Vui long chon nhom xe.";
      }
      if (!String(trip.plate || "").trim()) {
        nextErrors[`trip_${index}_plate`] = "Vui long chon BKS.";
      }

      const normalizedDistance = normalizeDistanceText(trip.distance);
      if (!normalizedDistance) {
        nextErrors[`trip_${index}_distance`] = "Quang duong la bat buoc.";
      } else if (!isFiniteNumber(normalizedDistance) || Number(normalizedDistance) <= 0) {
        nextErrors[`trip_${index}_distance`] = "Quang duong phai lon hon 0.";
      }

      const pickupAddress = String(trip.pickup_address || trip.pickup_addresses?.[0] || "").trim();
      const deliveryAddress = String(trip.delivery_address || trip.delivery_addresses?.[0] || "").trim();
      if (!pickupAddress) {
        nextErrors[`trip_${index}_pickup_address`] = "Diem lay hang la bat buoc.";
      }
      if (!deliveryAddress) {
        nextErrors[`trip_${index}_delivery_address`] = "Diem giao hang la bat buoc.";
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
      setMessage(data.message || (editingTrip ? "Cap nhat don hang thanh cong." : "Tao don hang thanh cong."));
      setMessageType("success");
      closeOrderModal();
      await loadOrders(editingTrip ? pagination.page : 1);
    } catch (error) {
      setMessage(error.message || "Khong the luu don hang.");
      setMessageType("error");
    } finally {
      setCreating(false);
    }
  };

  const handleCancelOrder = async (trip) => {
    if (!trip?.orderId) return;
    const confirmed = window.confirm(`Ban co chac muon huy don #${trip.orderId}?`);
    if (!confirmed) return;

    try {
      const data = await apiRequest(`/api/orders/${trip.orderId}`, {
        method: "DELETE",
        body: { reason: "Coordinator cancelled order" },
      });
      setMessage(data.message || "Huy don hang thanh cong.");
      setMessageType("success");
      await loadOrders(pagination.page);
    } catch (error) {
      setMessage(error.message || "Khong the huy don hang.");
      setMessageType("error");
    }
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
            Xoa loc
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
                <th>Hang hoa</th>
                <th>Hanh trinh</th>
                <th>Km</th>
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
                          <Tooltip title={expandedRows.has(trip.id) ? "Thu gon" : "Mo rong"}>
                            <Button
                              onClick={() => toggleRow(trip.id)}
                              className="coordinator-table-icon-btn"
                              type="text"
                              size="small"
                              icon={expandedRows.has(trip.id) ? <MinusOutlined /> : <PlusOutlined />}
                            />
                          </Tooltip>
                        )}
                        <span className="trip-id">#{trip.orderId}</span>
                      </td>
                      <td>{trip.date || "-"}</td>
                      <td>{trip.plate || "-"}</td>
                      <td>{trip.driverName || "-"}</td>
                      <td>{trip.customerName || "-"}</td>
                      <td className="table-cargo-cell">{trip.cargoName || "-"}</td>
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
                          <Tooltip title="Chinh sua don">
                            <Button
                              className="coordinator-table-icon-btn"
                              type="text"
                              icon={<EditOutlined />}
                              onClick={() => openEditModal(trip)}
                            />
                          </Tooltip>
                          <Tooltip title="Huy don">
                            <Button
                              className="coordinator-table-icon-btn coordinator-table-icon-btn-danger"
                              type="text"
                              danger
                              icon={<CloseOutlined />}
                              disabled={!canCancelTrip(trip)}
                              onClick={() => handleCancelOrder(trip)}
                            />
                          </Tooltip>
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

          {pagination.total > 0 && (
            <div className="pagination-container" style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
              <Pagination
                current={pagination.page}
                pageSize={pagination.limit}
                total={pagination.total}
                onChange={(page) => loadOrders(page)}
                showSizeChanger={false}
              />
            </div>
          )}
        </div>
      </section>
    </>
  );

  const renderIncidentsPanel = () => {
    const replacementOptions = drivers.filter((driver) => {
      if (!driver?.vehicle_id) return false;
      if (driver.has_active_trip) return false;
      if (!selectedIncident) return true;
      return Number(driver.id) !== Number(selectedIncident.current_driver_id || selectedIncident.reported_by);
    });

    return (
      <>
        <section className="hero hero-compact">
          <div>
            <h1>Xu ly su co</h1>
            <p>Theo doi su co dang mo, chon tai xe thay the va ap dung quy tac chia doanh thu theo moc lay hang.</p>
          </div>
          <div className="hero-metrics">
            <div className="upload-hint">{incidentsLoading ? "Dang tai..." : `${incidents.length} su co`}</div>
            <div className="upload-hint">{incidents.filter((item) => item.status === "open").length} moi tiep nhan</div>
            <div className="upload-hint">{incidents.filter((item) => item.pickup_completed).length} da lay hang</div>
          </div>
        </section>

        <section className="orders-panel">
          <div className="panel-head">
            <div>
              <h2>Incident queue</h2>
              <p>Neu chua lay hang, doanh thu thuoc ve tai xe thay the. Neu da lay hang, doanh thu chia 50/50.</p>
            </div>
          </div>

          <div className="table-wrap">
            <table className="orders-table">
              <thead>
                <tr>
                  <th>Su co</th>
                  <th>Chuyen</th>
                  <th>Tai xe bao cao</th>
                  <th>Tai xe hien tai</th>
                  <th>Trang thai chuyen</th>
                  <th>Moc lay hang</th>
                  <th>Quy tac doanh thu</th>
                  <th>Trang thai su co</th>
                  <th>Thao tac</th>
                </tr>
              </thead>
              <tbody>
                {incidentsLoading ? (
                  <tr>
                    <td colSpan="9" className="empty-table-cell">Dang tai du lieu su co...</td>
                  </tr>
                ) : incidents.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="empty-table-cell">Khong co su co nao phu hop.</td>
                  </tr>
                ) : (
                  incidents.map((incident) => (
                    <tr key={incident.id}>
                      <td>
                        <div style={{ display: "grid", gap: 4 }}>
                          <strong>#{incident.id}</strong>
                          <span>{incident.incident_type}</span>
                        </div>
                      </td>
                      <td>{incident.shipment_id ? `#${incident.shipment_id}` : "-"}</td>
                      <td>{incident.reported_by_name || "-"}</td>
                      <td>{incident.current_driver_name || "-"}</td>
                      <td>
                        <span className={`trip-status status-${normalizeStatus(incident.shipment_status)}`}>
                          {incident.shipment_status || "-"}
                        </span>
                      </td>
                      <td>{incident.pickup_completed ? "Da lay hang" : "Chua lay hang"}</td>
                      <td>{incident.pickup_completed ? "Chia 50/50" : "Tai xe thay the nhan 100%"}</td>
                      <td>
                        <span className={`trip-status status-${normalizeStatus(incident.status)}`}>
                          {incident.status || "-"}
                        </span>
                      </td>
                      <td>
                        <div className="table-actions">
                          <Tooltip title="Xu ly su co">
                            <Button
                              className="coordinator-table-icon-btn"
                              type="text"
                              icon={<EyeOutlined />}
                              disabled={
                                incident.status === "closed" ||
                                incident.status === "resolved"
                              }
                              onClick={() => openIncidentModal(incident)}
                            />
                          </Tooltip>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {incidentPagination.total > 0 && (
              <div className="pagination-container" style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
                <Pagination
                  current={incidentPagination.page}
                  pageSize={incidentPagination.limit}
                  total={incidentPagination.total}
                  onChange={(page) => loadIncidents(page)}
                  showSizeChanger={false}
                />
              </div>
            )}
          </div>
        </section>

        {incidentModalOpen && selectedIncident && (
          <section className="modal-backdrop" onClick={closeIncidentModal}>
            <div className="modal-card" onClick={(event) => event.stopPropagation()}>
              <div className="panel-head" style={{ padding: "16px 24px", borderBottom: "1px solid #e0e6ed", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h2>{`Su co #${selectedIncident.id}`}</h2>
                  <p>{selectedIncident.description || "Khong co mo ta."}</p>
                </div>
                <Button
                  className="coordinator-modal-close-btn"
                  type="text"
                  icon={<CloseOutlined />}
                  onClick={closeIncidentModal}
                />
              </div>

              <div className="create-form" style={{ paddingTop: 20 }}>
                <div className="sheet-caption full">Thong tin xu ly</div>

                <div className="form-row form-row-3">
                  <label>
                    <span>Chuyen</span>
                    <input value={selectedIncident.shipment_id ? `#${selectedIncident.shipment_id}` : "-"} disabled />
                  </label>
                  <label>
                    <span>Tai xe bao cao</span>
                    <input value={selectedIncident.reported_by_name || "-"} disabled />
                  </label>
                  <label>
                    <span>Quy tac doanh thu</span>
                    <input value={selectedIncident.pickup_completed ? "Da lay hang - chia 50/50" : "Chua lay hang - tai xe thay the nhan 100%"} disabled />
                  </label>
                </div>

                <div className="form-row form-row-3">
                  <label>
                    <span>Trang thai</span>
                    <select
                      value={incidentForm.status}
                      onChange={(event) => setIncidentForm((prev) => ({ ...prev, status: event.target.value }))}
                    >
                      <option value="open">open</option>
                      <option value="investigating">investigating</option>
                      <option value="resolved">resolved</option>
                      <option value="closed">closed</option>
                    </select>
                  </label>
                  <label>
                    <span>Tai xe thay the</span>
                    <select
                      value={incidentForm.replacement_driver_id}
                      onChange={(event) => setIncidentForm((prev) => ({ ...prev, replacement_driver_id: event.target.value }))}
                    >
                      <option value="">Khong doi tai xe</option>
                      {replacementOptions.map((driver) => (
                        <option key={driver.id} value={driver.id}>
                          {`${driver.full_name} - ${driver.plate_number || "Chua co xe"}`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Da thay the</span>
                    <input value={selectedIncident.replacement_driver_name || "-"} disabled />
                  </label>
                </div>

                <label className="full-width">
                  <span>Phan hoi / ghi chu</span>
                  <textarea
                    rows={4}
                    value={incidentForm.resolution}
                    onChange={(event) => setIncidentForm((prev) => ({ ...prev, resolution: event.target.value }))}
                    placeholder="Nhap cach xu ly hoac ly do dieu chuyen"
                  />
                </label>

                <div className="form-actions">
                  <Button type="default" className="coordinator-secondary-btn" onClick={closeIncidentModal}>
                    Dong
                  </Button>
                  <Button type="primary" className="coordinator-primary-btn" loading={incidentSaving} onClick={handleIncidentSubmit}>
                    Luu xu ly
                  </Button>
                </div>
              </div>
            </div>
          </section>
        )}
      </>
    );
  };

  const renderReceiptManagement = () => (
    <>
      <section className="hero hero-compact">
        <div>
          <h1>Quan ly phieu thu</h1>
          <p>Theo doi yeu cau, phiếu thu da tao va loc nhanh theo trang thai, ngay va khach hang.</p>
        </div>
        <div className="hero-metrics">
          <div className="upload-hint">{receiptRequestsLoading ? "Dang tai..." : `${receiptSummary.total} ban ghi`}</div>
          <div className="upload-hint">{receiptSummary.approved} phieu thu da tao</div>
          <div className="upload-hint">{receiptSummary.pending} yeu cau cho xu ly</div>
        </div>
        <div className="filters order-filters receipt-filters">
          <label className="filter-field">
            <span>Loai</span>
            <select value={receiptKindFilter} onChange={(event) => setReceiptKindFilter(event.target.value)}>
              <option value="all">Tat ca</option>
              <option value="requests">Yeu cau cho xu ly</option>
              <option value="receipts">Phieu thu da tao</option>
              <option value="rejected">Da tu choi</option>
            </select>
          </label>
          <label className="filter-field">
            <span>Trang thai</span>
            <select value={receiptStatusFilter} onChange={(event) => setReceiptStatusFilter(event.target.value)}>
              <option value="all">Tat ca</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
          <label className="filter-field">
            <span>Tu ngay</span>
            <input
              type="date"
              value={receiptDateFromFilter}
              onChange={(event) => setReceiptDateFromFilter(event.target.value)}
            />
          </label>
          <label className="filter-field">
            <span>Den ngay</span>
            <input
              type="date"
              value={receiptDateToFilter}
              min={receiptDateFromFilter || undefined}
              onChange={(event) => setReceiptDateToFilter(event.target.value)}
            />
          </label>
          <Button
            style={{ marginTop: 20 }}
            type="default"
            icon={<ReloadOutlined />}
            className="coordinator-secondary-btn"
            onClick={resetReceiptFilters}
          >
            Xoa loc
          </Button>
        </div>
      </section>

      <section className="orders-panel">
        <div className="panel-head">
          <div>
            <h2>Receipt requests & receipts</h2>
            <p>Tai xe gui yeu cau, coordinator xu ly va xem lai cac phieu thu da tao ngay tai day.</p>
          </div>
        </div>

        <div className="table-wrap">
          <table className="orders-table">
            <thead>
              <tr>
                <th>Loai</th>
                <th>Request</th>
                <th>Ngay</th>
                <th>Don</th>
                <th>Chuyen</th>
                <th>Khach hang</th>
                <th>Tai xe</th>
                <th>KM thuc te</th>
                <th>So tien</th>
                <th>Trang thai</th>
                <th>Thao tac</th>
              </tr>
            </thead>
            <tbody>
              {receiptRequestsLoading ? (
                <tr>
                  <td colSpan="11" className="empty-table-cell">Dang tai du lieu phieu thu...</td>
                </tr>
              ) : receiptRequests.length === 0 ? (
                <tr>
                  <td colSpan="11" className="empty-table-cell">Khong co ban ghi phu hop voi bo loc hien tai.</td>
                </tr>
              ) : (
                receiptRequests.map((request) => (
                  <tr key={request.id}>
                    <td>
                      <span className="receipt-table-kind">
                        {request.record_kind === "receipt" ? "Phieu thu" : "Yeu cau"}
                      </span>
                    </td>
                    <td>#{request.id}</td>
                    <td>{formatNotificationTime(request.receipt_created_at || request.requested_at)}</td>
                    <td>#{request.order_id}</td>
                    <td>{request.shipment_id ? `#${request.shipment_id}` : `${request.shipment_count || 0} chuyen`}</td>
                    <td>{request.customer_name || "-"}</td>
                    <td>{request.driver_name || "-"}</td>
                    <td>{Number(request.total_actual_distance_km || 0) > 0 ? `${request.total_actual_distance_km} km` : "-"}</td>
                    <td>{formatCurrency(request.record_kind === "receipt" ? request.receipt_amount : resolveFareValue(request.actual_price, request.estimated_price))}</td>
                    <td>
                      <span className={`trip-status status-${normalizeStatus(request.status)}`}>
                        {request.status}
                      </span>
                    </td>
                    <td>
                      <div className="table-actions">
                        {normalizeStatus(request.status) === "approved" ? (
                          <Button
                            className="coordinator-primary-btn"
                            type="primary"
                            icon={<EyeOutlined />}
                            onClick={() => openReceiptModal(request.id)}
                          >
                            Xem phieu thu
                          </Button>
                        ) : normalizeStatus(request.status) === "rejected" ? (
                          <Tooltip title="Xem chi tiet">
                            <Button
                              className="coordinator-table-icon-btn"
                              type="text"
                              icon={<EyeOutlined />}
                              onClick={() => openReceiptModal(request.id)}
                            />
                          </Tooltip>
                        ) : (
                          <>
                            <Button
                              className="coordinator-primary-btn"
                              type="primary"
                              icon={<FileTextOutlined />}
                              onClick={() => openReceiptModal(request.id)}
                            >
                              Tao phieu thu
                            </Button>
                            <Tooltip title="Tu choi yeu cau">
                              <Button
                                className="coordinator-table-icon-btn coordinator-table-icon-btn-danger"
                                type="text"
                                danger
                                loading={receiptRejectingId === request.id}
                                icon={receiptRejectingId === request.id ? null : <CloseOutlined />}
                                onClick={() => rejectReceiptRequest(request.id)}
                              />
                            </Tooltip>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {receiptPagination.total > 0 && (
            <div className="pagination-container" style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
              <Pagination
                current={receiptPagination.page}
                pageSize={receiptPagination.limit}
                total={receiptPagination.total}
                onChange={(page) => loadReceiptRequests(page)}
                showSizeChanger={false}
              />
            </div>
          )}
        </div>
      </section>
    </>
  );

  const pageTitleMap = {
    orders: "Dieu phoi don hang",
    incidents: "Xu ly su co",
    receipts: "Quan ly phieu thu",
  };

  const pageSubtitleMap = {
    orders: "",
    incidents: "Giam sat su co dang mo va dieu chuyen tai xe theo quy tac doanh thu cua chuyen.",
    receipts: "Xu ly yeu cau, xem phieu thu da tao va doi soat thong tin thu tien.",
  };
  const activeSearchQuery = activeView === "receipts"
    ? receiptSearchQuery
    : activeView === "incidents"
      ? incidentSearchQuery
      : orderSearchQuery;
  const handleSearchQueryChange = (value) => {
    if (activeView === "receipts") {
      setReceiptSearchQuery(value);
      return;
    }
    if (activeView === "incidents") {
      setIncidentSearchQuery(value);
      return;
    }
    setOrderSearchQuery(value);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", background: C.surface }}>
      <AppSidebar
        user={currentUser}
        activeTab={activeView}
        onTabChange={setActiveView}
        collapsed={sidebarCollapsed}
        onCollapse={setSidebarCollapsed}
      />

      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <AppHeader
          user={currentUser}
          onLogout={handleLogout}
          onProfileUpdated={handleProfileUpdated}
        />

        <section style={{ padding: 24, flex: 1, overflow: "auto" }}>
          <div className="coordinator-shell coordinator-content-shell">
            {/* <div style={{ marginBottom: 20 }}>
              <Title level={3} style={{ margin: 0, color: C.onSurface }}>
                {pageTitleMap[activeView] || "Coordinator"}
              </Title>
              <Text style={{ color: C.onSurfaceVariant }}>
                {pageSubtitleMap[activeView] || "Dieu huong va theo doi nghiep vu coordinator."}
              </Text>
            </div> */}

            <header className="topbar">
              <Input
                size="large"
                allowClear
                prefix={<SearchOutlined />}
                className="coordinator-search-input"
                value={activeSearchQuery}
                onChange={(event) => handleSearchQueryChange(event.target.value)}
                placeholder={activeView === "receipts"
                  ? "Tim theo don, tai xe, khach hang, trang thai"
                  : activeView === "incidents"
                    ? "Tim theo ma su co, chuyen, tai xe, mo ta"
                    : "Ten san pham, diem lay hang, giao hang, tai xe, trang thai"}
              />
              <div className="topbar-actions">
                {activeView === "orders" && (
                  <Button className="coordinator-primary-btn" type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
                    Tao moi
                  </Button>
                )}
              </div>
            </header>

            {activeView === "orders"
              ? renderOrdersPanel()
              : activeView === "incidents"
                ? renderIncidentsPanel()
                : renderReceiptManagement()}
          </div>
        </section>

        {createOpen && (
          <section className="modal-backdrop" onClick={closeOrderModal}>
            <div className="modal-card" onClick={(event) => event.stopPropagation()}>
              <div className="panel-head" style={{ padding: "16px 24px", borderBottom: "1px solid #e0e6ed", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h2>{editingTrip ? `Chỉnh sửa đơn #${editingTrip.orderId}` : "Tạo đơn"}</h2>
                  <p>{editingTrip ? "Cập nhật thông tin đơn hàng để điều phối chính xác." : "Fill the form based on the Excel sheet structure."}</p>
                </div>
                <Button
                  className="coordinator-modal-close-btn"
                  type="text"
                  icon={<CloseOutlined />}
                  onClick={closeOrderModal}
                />
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

                <div className="form-row form-row-1">
                  <label>
                    <span>Khách trả trước</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.prepaid_amount}
                      onChange={(event) => updateField("prepaid_amount", event.target.value)}
                      placeholder="VD: 500000"
                      className={formErrors.prepaid_amount ? "input-error" : ""}
                    />
                    {formErrors.prepaid_amount && (
                      <div className="field-error">{formErrors.prepaid_amount}</div>
                    )}
                  </label>
                </div>

                <div className="form-row full" style={{ marginTop: 12, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Button
                    type={form.is_partner ? "primary" : "default"}
                    className={form.is_partner ? "coordinator-primary-btn" : "coordinator-secondary-btn"}
                    onClick={() => updateField("is_partner", !form.is_partner)}
                  >
                    Đơn từ đối tác liên kết
                  </Button>
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
                        <Button
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          className="coordinator-danger-text-btn"
                          onClick={() => removeTrip(index)}
                        >
                          Xóa
                        </Button>
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
                        {(trip.pickup_addresses || [trip.pickup_address]).slice(1).map((address, extraIndex) => {
                          const stopIndex = extraIndex + 1;
                          return (
                            <div key={`pickup-${stopIndex}`} style={{ display: 'flex', gap: 8 }}>
                              <input
                                value={address || ""}
                                onChange={(e) => updateTripStopList(index, 'pickup_addresses', stopIndex, e.target.value)}
                                placeholder={stopIndex === 0 ? 'Điểm lấy hàng' : `Điểm lấy #${stopIndex + 1}`}
                                style={{ flex: 1, border: '1px solid #cfd6e6', borderRadius: 14, padding: '11px 12px', font: 'inherit', background: '#fff', boxSizing: 'border-box' }}
                              />
                              <Button
                                type="text"
                                danger
                                icon={<CloseOutlined />}
                                className="coordinator-stop-remove-btn"
                                onClick={() => removeTripStop(index, 'pickup_addresses', stopIndex)}
                              />
                            </div>
                          );
                        })}
                        <Button type="dashed" className="coordinator-dashed-btn" onClick={() => addTripStop(index, 'pickup_addresses')}>
                          <PlusOutlined /> Thêm điểm lấy
                        </Button>
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
                        {(trip.delivery_addresses || [trip.delivery_address]).slice(1).map((address, extraIndex) => {
                          const stopIndex = extraIndex + 1;
                          return (
                            <div key={`delivery-${stopIndex}`} style={{ display: 'flex', gap: 8 }}>
                              <input
                                value={address || ""}
                                onChange={(e) => updateTripStopList(index, 'delivery_addresses', stopIndex, e.target.value)}
                                placeholder={stopIndex === 0 ? 'Điểm giao hàng' : `Điểm giao #${stopIndex + 1}`}
                                style={{ flex: 1, border: '1px solid #cfd6e6', borderRadius: 14, padding: '11px 12px', font: 'inherit', background: '#fff', boxSizing: 'border-box' }}
                              />
                              <Button
                                type="text"
                                danger
                                icon={<CloseOutlined />}
                                className="coordinator-stop-remove-btn"
                                onClick={() => removeTripStop(index, 'delivery_addresses', stopIndex)}
                              />
                            </div>
                          );
                        })}
                        <Button type="dashed" className="coordinator-dashed-btn" onClick={() => addTripStop(index, 'delivery_addresses')}>
                          <PlusOutlined /> Thêm điểm giao
                        </Button>
                      </div>
                    </div>
                    <div style={{ fontSize: 13, color: '#18227f', fontWeight: 600 }}>
                      Cước xe: {Number(getTripFare(trip) || 0).toLocaleString('vi-VN')} đ
                    </div>
                  </div>
                ))}

                <div className="full" style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
                  <Button
                    type="dashed"
                    className="coordinator-dashed-btn"
                    onClick={addTrip}
                  >
                    <PlusOutlined /> Thêm chuyến
                  </Button>
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
                  <Button type="default" className="coordinator-secondary-btn" onClick={closeOrderModal}>
                    Cancel
                  </Button>
                  <Button type="primary" className="coordinator-primary-btn" htmlType="submit" loading={creating}>
                    {creating ? (editingTrip ? "Updating..." : "Creating...") : (editingTrip ? "Update" : "Create")}
                  </Button>
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
                  <h2>{isReceiptReadonly ? "Chi tiet phieu thu" : "Tao phieu thu"}</h2>
                  <p>
                    {selectedReceiptDetail?.request
                      ? `Yêu cầu #${selectedReceiptDetail.request.id} · Đơn #${selectedReceiptDetail.order?.id}`
                      : "Đang tải thông tin yêu cầu phiếu thu"}
                  </p>
                </div>
                <Button
                  className="coordinator-modal-close-btn"
                  type="text"
                  icon={<CloseOutlined />}
                  onClick={closeReceiptModal}
                />
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
                      <div className="sheet-caption full">{isReceiptReadonly ? "Thong tin phieu thu" : "Publish"}</div>
                      <div className="receipt-expense-head">
                        <div>
                          <strong>Chi phí đơn hàng</strong>
                          <p>{isReceiptReadonly
                            ? "Xem lai chi phi da ghi nhan va tong hop phieu thu."
                            : "Quan ly toan bo chi phi cua don hang va them khoan moi ngay ben duoi."}</p>
                        </div>
                        {!isReceiptReadonly && (
                          <Button type="primary" className="coordinator-primary-btn" icon={<PlusOutlined />} onClick={addReceiptExpense}>
                            Them chi phi
                          </Button>
                        )}
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

                        {!isReceiptReadonly && receiptForm.expenses.map((expense, index) => (
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
                            <Button
                              type="text"
                              danger
                              icon={<CloseOutlined />}
                              className="coordinator-table-icon-btn coordinator-table-icon-btn-danger"
                              onClick={() => removeReceiptExpense(index)}
                            />
                          </div>
                        ))}
                      </div>

                      <div className="receipt-notes-card">
                        <div className="receipt-field-head">
                          <div>
                            <span className="receipt-info-label">Ghi chú phiếu thu</span>
                            <strong>Thông tin nội bộ cho coordinator</strong>
                          </div>
                          <span className="receipt-field-chip">{isReceiptReadonly ? (selectedReceiptDetail?.request?.status || "-") : "Optional"}</span>
                        </div>
                        <textarea
                          className="receipt-notes-textarea"
                          value={isReceiptReadonly ? (selectedReceiptDetail?.request?.coordinator_notes || "") : receiptForm.notes}
                          onChange={(event) => updateReceiptField("notes", event.target.value)}
                          readOnly={isReceiptReadonly}
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
                    <Button type="default" className="coordinator-secondary-btn" onClick={closeReceiptModal}>
                      Đóng
                    </Button>
                    {!isReceiptReadonly && (
                      <Button type="primary" className="coordinator-primary-btn" loading={receiptPublishing} onClick={publishReceipt}>
                        {receiptPublishing ? "Đang publish..." : "Publish receipt"}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );

}

