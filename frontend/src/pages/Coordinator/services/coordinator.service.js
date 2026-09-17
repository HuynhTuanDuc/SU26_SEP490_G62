import { apiRequest } from "../../../services/apiClient";

const BASE = "/api/coordinator";

export const coordinatorService = {
  // ─── Dashboard ────────────────────────────────────────────────────────────
  getDashboard: () => apiRequest(`${BASE}/dashboard`),

  // ─── Orders / Trips ───────────────────────────────────────────────────────
  getOrders: (params) => apiRequest(`/api/orders?${new URLSearchParams(params)}`),
  createOrder: (data) => apiRequest("/api/orders", { method: "POST", body: data }),
  // Gợi ý khách cũ theo phần đầu SĐT (chuẩn hoá + prefix) — trả { customers: [...] }
  findCustomerByPhone: (phone, signal) =>
    apiRequest(`/api/orders/customer-by-phone?phone=${encodeURIComponent(phone)}`, { signal }),
  updateOrder: (orderId, data) => apiRequest(`/api/orders/${orderId}`, { method: "PATCH", body: data }),
  cancelOrder: (orderId, reason) => apiRequest(`/api/orders/${orderId}`, { method: "DELETE", body: { reason } }),

  // ─── Tiền trả trước: xác nhận / từ chối ──────────────────────────────────
  listPendingPrepaid: () => apiRequest("/api/orders/prepaid/pending"),
  // formData: { payment_method, proof (file) }
  confirmPrepaid: (orderId, formData) =>
    apiRequest(`/api/orders/${orderId}/prepaid/confirm`, { method: "PATCH", body: formData }),
  rejectPrepaid: (orderId) =>
    apiRequest(`/api/orders/${orderId}/prepaid/reject`, { method: "PATCH" }),
  importOrders: (file) => {
    const formData = new FormData();
    formData.append("file", file);
    return apiRequest("/api/orders/import", { method: "POST", body: formData });
  },

  cancelShipment: (shipmentId, reason) =>
    apiRequest(`${BASE}/trips/${shipmentId}/cancel`, { method: "PATCH", body: { reason } }),
  reassignShipment: (shipmentId, toDriverId) =>
    apiRequest(`${BASE}/trips/${shipmentId}/reassign`, { method: "PATCH", body: { toDriverId } }),

  // Xử lý chuyến giao thất bại (làm từ màn Sự cố): 'redeliver' (giao lại) | 'return' (hoàn hàng).
  // Hoàn hàng thì chuyến tự tính GẤP ĐÔI cước — không có tùy chọn tiền nào để chọn.
  resolveFailedShipment: (shipmentId, { action }) =>
    apiRequest(`${BASE}/trips/${shipmentId}/resolve-failed`, {
      method: "POST",
      body: { action },
    }),

  // Gán trước nhiều chuyến của CÙNG một đơn cho 1 tài xế (chạy tuần tự).
  // vehicleId tùy chọn — bỏ trống thì backend dùng xe biên chế của tài. Truyền vào thì
  // dùng đúng xe đó, kể cả khác nhóm xe của đơn (cước vẫn theo nhóm ghi trong đơn).
  assignOrderShipments: (orderId, { shipmentIds, driverId, vehicleId = null }) =>
    apiRequest(`${BASE}/orders/${orderId}/assign-driver`, {
      method: "POST",
      body: { shipment_ids: shipmentIds, driver_id: driverId, vehicle_id: vehicleId },
    }),
  getTripPool: (params) => apiRequest(`${BASE}/trip-pool?${new URLSearchParams(params)}`),

  // ─── Lookups ──────────────────────────────────────────────────────────────
  getVehicleGroups: () => apiRequest(`${BASE}/vehicle-groups`),
  // Xe đang sẵn sàng nhận chuyến, KHÔNG lọc theo nhóm xe. order_id để chừa lại xe đã
  // gắn sẵn vào chuyến của chính đơn đang gán.
  getAssignableVehicles: (params = {}) =>
    apiRequest(`${BASE}/assignable-vehicles?${new URLSearchParams(params)}`),
  getDrivers: () => apiRequest("/api/drivers"),
  getPartners: () => apiRequest(`${BASE}/partners`),

  // ─── Attendance (chấm công) ────────────────────────────────────────────────
  getAttendanceGrid: (params = {}) => apiRequest(`/api/attendance/grid?${new URLSearchParams(params)}`),
  markAttendance: (data) => apiRequest("/api/attendance", { method: "POST", body: data }),
  clearAttendance: (driverId, workDate) => apiRequest(`/api/attendance/${driverId}/${workDate}`, { method: "DELETE" }),

  // ─── Incidents ────────────────────────────────────────────────────────────
  getIncidents: (params) => apiRequest(`${BASE}/incidents?${new URLSearchParams(params)}`),
  updateIncidentStatus: (id, data) => apiRequest(`/api/incidents/${id}/status`, { method: "PATCH", body: data }),
  createIncidentByStaff: (data) => apiRequest("/api/incidents/staff", { method: "POST", body: data }),
  // Outcome duy nhất cho sự cố "hàng hóa hư hại": hủy dứt điểm chuyến gắn với sự cố
  // (cho phép hủy dù đã lấy hàng). Backend tự đóng sự cố + tính lại trạng thái đơn.
  cancelDamagedShipment: (incidentId, reason) =>
    apiRequest(`/api/incidents/${incidentId}/cancel-shipment`, {
      method: "POST",
      body: { reason },
    }),

  // ─── Receipts ─────────────────────────────────────────────────────────────
  getReceiptRequests: (params) => apiRequest(`${BASE}/receipt-requests?${new URLSearchParams(params)}`),
  getReceiptRequestDetail: (id) => apiRequest(`${BASE}/receipt-requests/${id}`),
  approveReceiptRequest: (id, data) => apiRequest(`${BASE}/receipt-requests/${id}/approve`, { method: "POST", body: data }),
  rejectReceiptRequest: (id, notes) => apiRequest(`${BASE}/receipt-requests/${id}/reject`, { method: "POST", body: { notes } }),

  // ─── Chi phí tài xế (coordinator là người duyệt/từ chối duy nhất) ────────
  getSpendingExpenses: (params = {}) => apiRequest(`${BASE}/expenses?${new URLSearchParams(params)}`),
  approveExpense: (id) => apiRequest(`${BASE}/expenses/${id}/approve`, { method: "PATCH" }),
  rejectExpense: (id, reason) => apiRequest(`${BASE}/expenses/${id}/reject`, { method: "PATCH", body: { reason } }),
  // Gỡ duyệt: đưa chi phí đã duyệt về chờ duyệt để tài xế sửa lại
  unapproveExpense: (id) => apiRequest(`${BASE}/expenses/${id}/unapprove`, { method: "PATCH" }),

  // ─── Customers (shared with Manager) ─────────────────────────────────────
  getCustomers: (params) => apiRequest(`/api/customers?${new URLSearchParams(params)}`),
  createCustomer: (data) => apiRequest("/api/customers", { method: "POST", body: data }),
  updateCustomer: (id, data) => apiRequest(`/api/customers/${id}`, { method: "PUT", body: data }),
  deleteCustomer: (id) => apiRequest(`/api/customers/${id}`, { method: "DELETE" }),

  // ─── KPI / Leaderboard (shared with Manager) ─────────────────────────────
  getAllDriversKPI: (params) => apiRequest(`/api/kpi/all?${new URLSearchParams(params)}`),
  getLeaderboardByGroup: (vehicleGroupId, params) =>
    apiRequest(`/api/kpi/leaderboard/group/${vehicleGroupId}?${new URLSearchParams(params)}`),
  // Đổi nhóm xe cố định là độc quyền Manager — coordinator chỉ đọc lịch sử
  // (ai đổi, lúc nào, KPI kỳ nào đã cập nhật theo).
  getDriverGroupHistory: (driverId) =>
    apiRequest(`/api/kpi/driver/${driverId}/vehicle-group/history`),
};

export default coordinatorService;
