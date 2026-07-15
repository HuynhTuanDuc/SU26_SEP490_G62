import { apiRequest } from "../../../services/apiClient";

const BASE = "/api/coordinator";

export const coordinatorService = {
  // ─── Dashboard ────────────────────────────────────────────────────────────
  getDashboard: () => apiRequest(`${BASE}/dashboard`),

  // ─── Orders / Trips ───────────────────────────────────────────────────────
  getOrders: (params) => apiRequest(`/api/orders?${new URLSearchParams(params)}`),
  createOrder: (data) => apiRequest("/api/orders", { method: "POST", body: data }),
  updateOrder: (orderId, data) => apiRequest(`/api/orders/${orderId}`, { method: "PATCH", body: data }),
  cancelOrder: (orderId, reason) => apiRequest(`/api/orders/${orderId}`, { method: "DELETE", body: { reason } }),
  importOrders: (file) => {
    const formData = new FormData();
    formData.append("file", file);
    return apiRequest("/api/orders/import", { method: "POST", body: formData });
  },

  cancelShipment: (shipmentId, reason) =>
    apiRequest(`${BASE}/trips/${shipmentId}/cancel`, { method: "PATCH", body: { reason } }),
  reassignShipment: (shipmentId, toDriverId) =>
    apiRequest(`${BASE}/trips/${shipmentId}/reassign`, { method: "PATCH", body: { toDriverId } }),
  getTripPool: (params) => apiRequest(`${BASE}/trip-pool?${new URLSearchParams(params)}`),

  // ─── Lookups ──────────────────────────────────────────────────────────────
  getVehicleGroups: () => apiRequest(`${BASE}/vehicle-groups`),
  getDrivers: () => apiRequest("/api/drivers"),
  getPartners: () => apiRequest(`${BASE}/partners`),

  // ─── Incidents ────────────────────────────────────────────────────────────
  getIncidents: (params) => apiRequest(`${BASE}/incidents?${new URLSearchParams(params)}`),
  updateIncidentStatus: (id, data) => apiRequest(`/api/incidents/${id}/status`, { method: "PATCH", body: data }),
  createIncidentByStaff: (data) => apiRequest("/api/incidents/staff", { method: "POST", body: data }),

  // ─── Receipts ─────────────────────────────────────────────────────────────
  getReceiptRequests: (params) => apiRequest(`${BASE}/receipt-requests?${new URLSearchParams(params)}`),
  getReceiptRequestDetail: (id) => apiRequest(`${BASE}/receipt-requests/${id}`),
  approveReceiptRequest: (id, data) => apiRequest(`${BASE}/receipt-requests/${id}/approve`, { method: "POST", body: data }),
  rejectReceiptRequest: (id, notes) => apiRequest(`${BASE}/receipt-requests/${id}/reject`, { method: "POST", body: { notes } }),
  scanReceiptExpenses: (id) => apiRequest(`${BASE}/receipt-requests/${id}/scan-expenses`),

  // ─── Customers (shared with Manager) ─────────────────────────────────────
  getCustomers: (params) => apiRequest(`/api/customers?${new URLSearchParams(params)}`),
  createCustomer: (data) => apiRequest("/api/customers", { method: "POST", body: data }),
  updateCustomer: (id, data) => apiRequest(`/api/customers/${id}`, { method: "PUT", body: data }),
  deleteCustomer: (id) => apiRequest(`/api/customers/${id}`, { method: "DELETE" }),

  // ─── KPI / Leaderboard (shared with Manager) ─────────────────────────────
  getAllDriversKPI: (params) => apiRequest(`/api/kpi/all?${new URLSearchParams(params)}`),
  getLeaderboardByGroup: (vehicleGroupId, params) =>
    apiRequest(`/api/kpi/leaderboard/group/${vehicleGroupId}?${new URLSearchParams(params)}`),
};

export default coordinatorService;
