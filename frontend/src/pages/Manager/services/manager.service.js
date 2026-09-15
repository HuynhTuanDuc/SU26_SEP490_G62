import { apiRequest } from "../../../services/apiClient";

const BASE = "/api/manager";

export const managerService = {
  // ─── Dashboard ────────────────────────────────────────────────────────────
  getDashboard: () => apiRequest(`${BASE}/dashboard`),
  getReportOverview: (months, granularity) => apiRequest(`${BASE}/reports/overview?months=${months}&granularity=${granularity}`),
  getBusinessReport: (year, month) => apiRequest(`${BASE}/reports/business?year=${year}&month=${month}`),
  listReportPeriods: () => apiRequest(`${BASE}/reports/periods`),
  getReportPeriodPreflight: (year, month) => apiRequest(`${BASE}/reports/periods/preflight?year=${year}&month=${month}`),
  signOffReportPeriod: (year, month, note) => apiRequest(`${BASE}/reports/periods/sign-off`, { method: "POST", body: { year, month, note } }),

  // ─── Salary advances ──────────────────────────────────────────────────────
  getSalaryAdvances: (params = {}) => apiRequest(`${BASE}/salary-advances?${new URLSearchParams(params)}`),
  approveSalaryAdvance: (id) => apiRequest(`${BASE}/salary-advances/${id}/approve`, { method: "PATCH" }),
  rejectSalaryAdvance: (id, reason) => apiRequest(`${BASE}/salary-advances/${id}/reject`, { method: "PATCH", body: { reason } }),

  // ─── Debt repayments ──────────────────────────────────────────────────────
  getDebtRepayments: () => apiRequest(`${BASE}/debt-repayments`),
  confirmDebtRepayment: (id) => apiRequest(`${BASE}/debt-repayments/${id}/confirm`, { method: "PATCH" }),
  rejectDebtRepayment: (id, reason) => apiRequest(`${BASE}/debt-repayments/${id}/reject`, { method: "PATCH", body: { reason } }),

  // ─── Receipt requests (read-only) ────────────────────────────────────────
  getReceiptRequests: () => apiRequest(`${BASE}/receipt-requests`),

  // ─── Company info ─────────────────────────────────────────────────────────
  getCompanyInfo: () => apiRequest("/api/company/info"),
  updateCompanyInfo: (payload) => apiRequest("/api/company/info", { method: "PUT", body: payload }),
  uploadBankQr: (file) => {
    const formData = new FormData();
    formData.append("qr", file);
    return apiRequest("/api/company/bank-qr", { method: "POST", body: formData });
  },

  // ─── Partners ─────────────────────────────────────────────────────────────
  getPartners: (search = "", { page = 1, limit = 10, hasDebt = "", sort = "" } = {}) => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set("search", search);
    if (hasDebt) params.set("hasDebt", hasDebt);
    if (sort) params.set("sort", sort);
    return apiRequest(`${BASE}/partners?${params}`);
  },
  createPartner: (payload) => apiRequest(`${BASE}/partners`, { method: "POST", body: payload }),
  updatePartner: (id, payload) => apiRequest(`${BASE}/partners/${id}`, { method: "PUT", body: payload }),
  // Chỉ theo dõi — thu tiền đối tác do Kế toán ghi nhận ở màn Công nợ
  getPartnerDebts: (id) => apiRequest(`${BASE}/partners/${id}/debts`),

  // ─── Payroll ──────────────────────────────────────────────────────────────
  getPayrolls: (params = {}) => apiRequest(`${BASE}/payrolls?${new URLSearchParams(params)}`),
  reviewPayroll: (id) => apiRequest(`${BASE}/payrolls/${id}/review`, { method: "PATCH" }),
  revertPayroll: (id, reason) => apiRequest(`${BASE}/payrolls/${id}/revert`, { method: "PATCH", body: { reason: reason || undefined } }),

  // ─── Bonus ────────────────────────────────────────────────────────────────
  getBonuses: (params = {}) => apiRequest(`/api/bonuses?${new URLSearchParams(params)}`),
  getBonusStats: (year) => apiRequest(`/api/bonuses/stats?year=${year}`),
  getBonusStaffLookup: () => apiRequest("/api/bonuses/staff-lookup"),
  previewTetBonuses: (year) => apiRequest(`/api/bonuses/tet/preview?year=${year}`),
  generateTetBonuses: (year) => apiRequest("/api/bonuses/tet/generate", { method: "POST", body: { year } }),
  createBonus: (data) => apiRequest("/api/bonuses", { method: "POST", body: data }),
  approveBonus: (id, adjustedAmount) => apiRequest(`/api/bonuses/${id}/approve`, {
    method: "PATCH",
    body: adjustedAmount != null ? { amount: adjustedAmount } : {},
  }),
  rejectBonus: (id, reason) => apiRequest(`/api/bonuses/${id}/reject`, { method: "PATCH", body: { reason } }),

  // ─── Bonus rules ──────────────────────────────────────────────────────────
  getBonusRules: (params = {}) => apiRequest(`/api/bonus-rules?${new URLSearchParams(params)}`),
  createBonusRule: (data) => apiRequest("/api/bonus-rules", { method: "POST", body: data }),
  updateBonusRule: (id, data) => apiRequest(`/api/bonus-rules/${id}`, { method: "PUT", body: data }),
  deleteBonusRule: (id) => apiRequest(`/api/bonus-rules/${id}`, { method: "DELETE" }),

  // ─── Attendance (chấm công) ────────────────────────────────────────────────
  getAttendanceGrid: (params = {}) => apiRequest(`/api/attendance/grid?${new URLSearchParams(params)}`),
  markAttendance: (data) => apiRequest("/api/attendance", { method: "POST", body: data }),
  clearAttendance: (driverId, workDate) => apiRequest(`/api/attendance/${driverId}/${workDate}`, { method: "DELETE" }),

  // ─── Holidays ─────────────────────────────────────────────────────────────
  getHolidays: (year) => apiRequest(`/api/admin/holidays?year=${year}`),
  createHoliday: (payload) => apiRequest("/api/admin/holidays", { method: "POST", body: payload }),
  deleteHoliday: (dateKey) => apiRequest(`/api/admin/holidays/${dateKey}`, { method: "DELETE" }),

  // ─── Users ────────────────────────────────────────────────────────────────
  getUsers: () => apiRequest("/api/admin/users"),
  createUser: (payload) => apiRequest("/api/admin/users", { method: "POST", body: payload }),
  updateUser: (id, payload) => apiRequest(`/api/admin/users/${id}`, { method: "PUT", body: payload }),
  // Hồ sơ công việc tài xế: { hire_date, termination_date } — termination_date null = đang làm
  updateDriverEmployment: (id, payload) => apiRequest(`/api/admin/users/${id}/employment`, { method: "PATCH", body: payload }),
  // Chấm dứt hợp đồng tài xế: { termination_date, reason? } — khoá tài khoản ngay
  terminateDriverContract: (id, payload) => apiRequest(`/api/admin/users/${id}/terminate`, { method: "POST", body: payload }),
  toggleUserStatus: (id, isActive) => apiRequest(`/api/admin/users/${id}/status`, { method: "PATCH", body: { is_active: isActive } }),
  resetUserPassword: (id) => apiRequest(`/api/admin/users/${id}/reset-password`, { method: "POST" }),
  getDriverList: () => apiRequest("/api/admin/users?role=driver&limit=200"),
  getDrivers: () => apiRequest("/api/drivers"),

  // ─── Vehicle groups ───────────────────────────────────────────────────────
  // includeHidden: màn Quản lý xe cần thấy cả nhóm đã ẩn để bỏ ẩn lại
  getVehicleGroups: (includeHidden = false) =>
    apiRequest(`/api/admin/vehicle-groups${includeHidden ? "?include_hidden=1" : ""}`),
  getVehicleGroupDetail: (id) => apiRequest(`/api/admin/vehicle-groups/${id}`),
  createVehicleGroup: (payload) => apiRequest("/api/admin/vehicle-groups", { method: "POST", body: payload }),
  updateVehicleGroup: (id, payload) => apiRequest(`/api/admin/vehicle-groups/${id}`, { method: "PUT", body: payload }),
  deleteVehicleGroup: (id) => apiRequest(`/api/admin/vehicle-groups/${id}`, { method: "DELETE" }),
  restoreVehicleGroup: (id) => apiRequest(`/api/admin/vehicle-groups/${id}/restore`, { method: "POST" }),

  // ─── Vehicles ─────────────────────────────────────────────────────────────
  getVehicles: (params = {}) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") search.set(k, String(v)); });
    return apiRequest(`/api/admin/vehicles?${search.toString()}`);
  },
  getVehicleDetail: (id) => apiRequest(`/api/admin/vehicles/${id}`),
  createVehicle: (payload) => apiRequest("/api/admin/vehicles", { method: "POST", body: payload }),
  updateVehicle: (id, payload) => apiRequest(`/api/admin/vehicles/${id}`, { method: "PUT", body: payload }),
  getVehicleAssignmentHistory: (id) => apiRequest(`/api/admin/vehicles/${id}/assignment-history`),
  assignVehicleDriver: (id, driverId) => apiRequest(`/api/admin/vehicles/${id}/driver-assignment`, { method: "PATCH", body: { assigned_driver_id: driverId ?? null } }),
  getDriverOptions: (vehicleId) => apiRequest(`/api/admin/vehicles/driver-options${vehicleId ? `?vehicle_id=${vehicleId}` : ""}`),

  // Vehicle lifecycle
  sendVehicleToMaintenance: (id, payload) => apiRequest(`/api/admin/vehicles/${id}/send-to-maintenance`, { method: "POST", body: payload }),
  verifyVehicleMaintenance: (id, payload = {}) => apiRequest(`/api/admin/vehicles/${id}/verify-maintenance`, { method: "POST", body: payload }),
  // mode: 'redo' (bắt tài xế làm lại chứng từ) | 'cancel' (huỷ hẳn, xe về hoạt động)
  rejectVehicleMaintenance: (id, payload = {}) => apiRequest(`/api/admin/vehicles/${id}/reject-maintenance`, { method: "POST", body: payload }),
  markVehicleBroken: (id, payload) => apiRequest(`/api/admin/vehicles/${id}/mark-broken`, { method: "POST", body: payload }),
  restoreVehicle: (id, payload = {}) => apiRequest(`/api/admin/vehicles/${id}/restore`, { method: "POST", body: payload }),
  retireVehicle: (id, payload = {}) => apiRequest(`/api/admin/vehicles/${id}/retire`, { method: "POST", body: payload }),

  // Kết quả máy đọc hóa đơn bảo dưỡng (giúp manager đối chiếu bằng dữ liệu thay vì
  // căng mắt vào ảnh). recordId = vehicle.active_maintenance_id.
  getMaintenanceReceipts: (recordId) => apiRequest(`/api/admin/maintenance/${recordId}/receipts`),
  reviewReceiptExtraction: (id, payload) => apiRequest(`/api/admin/receipt-extractions/${id}/review`, { method: "POST", body: payload }),

  // Maintenance requests (driver-submitted)
  getMaintenanceRequests: () => apiRequest("/api/admin/maintenance-requests"),
  approveMaintenanceRequest: (id, payload = {}) => apiRequest(`/api/admin/maintenance-requests/${id}/approve`, { method: "POST", body: payload }),
  rejectMaintenanceRequest: (id, payload) => apiRequest(`/api/admin/maintenance-requests/${id}/reject`, { method: "POST", body: payload }),

  // ─── Customers (shared with Coordinator) ─────────────────────────────────
  getCustomers: (params) => apiRequest(`/api/customers?${new URLSearchParams(params)}`),
  createCustomer: (data) => apiRequest("/api/customers", { method: "POST", body: data }),
  updateCustomer: (id, data) => apiRequest(`/api/customers/${id}`, { method: "PUT", body: data }),
  deleteCustomer: (id) => apiRequest(`/api/customers/${id}`, { method: "DELETE" }),

  // ─── KPI / Leaderboard (shared with Coordinator) ─────────────────────────
  getVehicleGroupsForKpi: () => apiRequest(`${BASE}/vehicle-groups`),
  getAllDriversKPI: (params) => apiRequest(`/api/kpi/all?${new URLSearchParams(params)}`),
  getLeaderboardByGroup: (vehicleGroupId, params) => apiRequest(`/api/kpi/leaderboard/group/${vehicleGroupId}?${new URLSearchParams(params)}`),
  updateDriverVehicleGroup: (driverId, vehicleGroupId, reason) =>
    apiRequest(`/api/kpi/driver/${driverId}/vehicle-group`, { method: "PATCH", body: { vehicleGroupId, reason } }),
  // Lịch sử đổi nhóm cố định — ai đổi, lúc nào, KPI kỳ nào đã cập nhật theo
  getDriverGroupHistory: (driverId) =>
    apiRequest(`/api/kpi/driver/${driverId}/vehicle-group/history`),

  // ─── Incidents (shared with Coordinator) ─────────────────────────────────
  getIncidents: (params = {}) => apiRequest(`${BASE}/incidents?${new URLSearchParams(params)}`),
  updateIncidentStatus: (id, data) => apiRequest(`/api/incidents/${id}/status`, { method: "PATCH", body: data }),
  createIncidentByStaff: (data) => apiRequest("/api/incidents/staff", { method: "POST", body: data }),

  // ─── Trips / expenses (shared with Coordinator) ──────────────────────────
  getTripPool: (params = {}) => apiRequest(`${BASE}/trip-pool?${new URLSearchParams(params)}`),
  cancelShipment: (shipmentId, reason) => apiRequest(`${BASE}/trips/${shipmentId}/cancel`, { method: "PATCH", body: { reason } }),
  reassignShipment: (shipmentId, toDriverId) => apiRequest(`${BASE}/trips/${shipmentId}/reassign`, { method: "PATCH", body: { toDriverId } }),

  // ─── Quản lý chi (chi phí tài xế + phiếu chi + tổng hợp) ─────────────────
  getSpendingExpenses: (params = {}) => apiRequest(`${BASE}/expenses?${new URLSearchParams(params)}`),
  getVouchers: (params = {}) => apiRequest(`${BASE}/vouchers?${new URLSearchParams(params)}`),
  approveVoucher: (id) => apiRequest(`${BASE}/vouchers/${id}/approve`, { method: "PATCH" }),
  rejectVoucher: (id, reason) => apiRequest(`${BASE}/vouchers/${id}/reject`, { method: "PATCH", body: { reason } }),
  getSpendingSummary: (params = {}) => apiRequest(`${BASE}/spending-summary?${new URLSearchParams(params)}`),
};

export default managerService;
