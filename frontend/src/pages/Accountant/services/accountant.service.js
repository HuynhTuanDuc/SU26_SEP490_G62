import { apiRequest } from "../../../services/apiClient";

const BASE = "/accountant";

export const accountantService = {

  getFinanceStats: () =>
    apiRequest(`${BASE}/finance/stats`),

  // ─── Tiền trả trước: xác nhận / từ chối (Kế toán + Điều phối đều được xác nhận) ──
  listPendingPrepaid: () => apiRequest("/api/orders/prepaid/pending"),
  // formData: { payment_method, proof (file) }
  confirmPrepaid: (orderId, formData) =>
    apiRequest(`/api/orders/${orderId}/prepaid/confirm`, { method: "PATCH", body: formData }),
  rejectPrepaid: (orderId) =>
    apiRequest(`/api/orders/${orderId}/prepaid/reject`, { method: "PATCH" }),

  getVehicleGroupsForKpi: () =>
    apiRequest(`${BASE}/vehicle-groups`),

  // Đổi nhóm xe cố định là độc quyền Manager — kế toán chỉ đọc lịch sử để đối chiếu
  // KPI khi tính lương (ai đổi, lúc nào, KPI kỳ nào đã cập nhật theo).
  getDriverGroupHistory: (driverId) =>
    apiRequest(`/api/kpi/driver/${driverId}/vehicle-group/history`),

  getOrders: (params) =>
    apiRequest(`${BASE}/orders?${new URLSearchParams(params)}`),

  getOrderShipments: (orderId) =>
    apiRequest(`${BASE}/orders/${orderId}/shipments`),

  createOrder: (data) =>
    apiRequest(`${BASE}/orders`, { method: "POST", body: data }),

  // Đối chiếu trước khi import: mỗi dòng khớp khách nào / tạo khách mới / trùng tên,
  // và đã từng import chưa. Chỉ đọc, không tạo gì.
  previewImport: (orders) =>
    apiRequest(`${BASE}/orders/import/preview`, { method: "POST", body: { orders } }),

  // allowDuplicates = true khi kế toán đã xem danh sách dòng trùng và vẫn muốn nhập lại
  importOrders: (orders, allowDuplicates = false) =>
    apiRequest(`${BASE}/orders/import`, {
      method: "POST",
      body: { orders, allow_duplicates: allowDuplicates },
    }),

  updateOrder: (orderId, data) =>
    apiRequest(`${BASE}/orders/${orderId}`, { method: "PUT", body: data }),

  getLookup: () =>
    apiRequest(`${BASE}/orders/lookup`),

  // Danh sách đối tác (cho đơn đối tác) — { partners: [{id, company_name, ...}] }
  getPartners: () =>
    apiRequest(`${BASE}/orders/partners`),

  // Gợi ý khách cũ theo phần đầu SĐT (chuẩn hoá + prefix) — trả { customers: [...] }
  findCustomerByPhone: (phone, signal) =>
    apiRequest(`${BASE}/orders/customer-by-phone?phone=${encodeURIComponent(phone)}`, { signal }),

  exportOrdersReport: (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.search) params.set("search", filters.search);
    if (filters.debt_status) params.set("debt_status", filters.debt_status);
    if (filters.customer) params.set("customer", filters.customer);
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
    return apiRequest(`${BASE}/orders/export?${params}`);
  },

  getCustomerDebt: (orderId) =>
    apiRequest(`${BASE}/orders/${orderId}/customer-debt`),

  getPayments: (orderId) =>
    apiRequest(`${BASE}/orders/${orderId}/payments`),

  createPayment: (orderId, data) =>
    apiRequest(`${BASE}/orders/${orderId}/payments`, {
      method: "POST",
      body: data,
    }),

  confirmDriverPayment: (orderId, shipmentId, data) =>
    apiRequest(
      `${BASE}/orders/${orderId}/shipments/${shipmentId}/driver-payment`,
      { method: "POST", body: data }
    ),

  // Chuyển toàn bộ số dư còn lại của 1 công nợ khách hàng sang công nợ tài xế mới
  transferDebtToDriver: (debtId, driverId, notes) =>
    apiRequest(`${BASE}/debts/${debtId}/transfer-to-driver`, {
      method: "POST",
      body: { driverId, notes: notes || undefined },
    }),

  getDebts: (params) =>
    apiRequest(`${BASE}/debts?${new URLSearchParams(params)}`),

  getDebtStats: () =>
    apiRequest(`${BASE}/debts/stats`),

  getDebtsGrouped: () =>
    apiRequest(`${BASE}/debts/grouped`),

  getDebtsByPerson: (personType, personId) =>
    apiRequest(`${BASE}/debts/person/${personType}/${personId}`),

  // ─── Công nợ khai tay (nợ có từ trước khi dùng phần mềm) ───
  searchDebtOwners: (type, q = "") =>
    apiRequest(`${BASE}/debts/owners?type=${type}&q=${encodeURIComponent(q)}`),

  createManualDebt: (data) =>
    apiRequest(`${BASE}/debts/manual`, { method: "POST", body: data }),

  updateManualDebt: (debtId, data) =>
    apiRequest(`${BASE}/debts/manual/${debtId}`, { method: "PUT", body: data }),

  deleteManualDebt: (debtId) =>
    apiRequest(`${BASE}/debts/manual/${debtId}`, { method: "DELETE" }),

  previewAllocation: (data) =>
    apiRequest(`${BASE}/debts/payment/preview`, { method: "POST", body: data }),

  allocatePayment: (data) =>
    apiRequest(`${BASE}/debts/payment/allocate`, { method: "POST", body: data }),

  paymentByShipment: (data) =>
    apiRequest(`${BASE}/debts/payment/by-shipment`, {
      method: "POST",
      body: data,
    }),

  paymentByDebt: (data) =>
    apiRequest(`${BASE}/debts/payment/by-debt`, { method: "POST", body: data }),

  // ─── Tài xế báo nộp tiền — hàng chờ xác nhận ─────────────────────────────────
  getPendingRepayments: () =>
    apiRequest("/api/debts/repayments/pending"),

  confirmRepayment: (paymentId) =>
    apiRequest(`/api/debts/repayments/${paymentId}/confirm`, { method: "PATCH" }),

  rejectRepayment: (paymentId, reason) =>
    apiRequest(`/api/debts/repayments/${paymentId}/reject`, {
      method: "PATCH",
      body: { reason },
    }),

  getReportOverview: (months = 6, granularity = "month") =>
    apiRequest(`${BASE}/reports/overview?months=${months}&granularity=${granularity}`),

  // Thông tin công ty (header phiếu lương) — mọi vai trò đã đăng nhập đều đọc được
  getCompanyInfo: () => apiRequest("/api/company/info"),

  getPayrolls: (params) =>
    apiRequest(`${BASE}/payroll?${new URLSearchParams(params)}`),

  generatePayrolls: (month, year) =>
    apiRequest(`${BASE}/payroll/generate`, { method: "POST", body: { month, year } }),

  confirmPayroll: (id) =>
    apiRequest(`${BASE}/payroll/${id}/confirm`, { method: "PATCH" }),

  markPayrollPaid: (id) =>
    apiRequest(`${BASE}/payroll/${id}/pay`, { method: "PATCH" }),

  // Trả phiếu lương về 'pending' để tính lại (kèm lý do)
  revertPayroll: (id, reason) =>
    apiRequest(`${BASE}/payroll/${id}/revert`, { method: "PATCH", body: { reason: reason || undefined } }),

  // Điều chỉnh tay: thưởng thêm (+) / khấu trừ thêm (−), tự đưa phiếu về pending để duyệt lại
  adjustPayroll: (id, { manual_bonus, manual_deduction, note }) =>
    apiRequest(`${BASE}/payroll/${id}/adjust`, {
      method: "PATCH",
      body: { manual_bonus, manual_deduction, note: note || undefined },
    }),

  getSalaryAdvances: (params) =>
    apiRequest(`${BASE}/payroll/advances?${new URLSearchParams(params)}`),

  disburseAdvance: (id, notes) =>
    apiRequest(`${BASE}/payroll/advances/${id}/disburse`, {
      method: "PATCH",
      body: { notes },
    }),

  // Tài xế đã chấm dứt hợp đồng + các khoản còn phải quyết toán
  getTerminationSettlements: () =>
    apiRequest(`${BASE}/payroll/settlements`),

  // ─── Bonus & Welfare ───────────────────────────────────────────────────────
  getBonuses: (params) =>
    apiRequest(`/api/bonuses?${new URLSearchParams(params)}`),

  getBonusStats: (year) =>
    apiRequest(`/api/bonuses/stats${year ? `?year=${year}` : ""}`),

  createBonus: (data) =>
    apiRequest("/api/bonuses", { method: "POST", body: data }),

  payBonus: (id) =>
    apiRequest(`/api/bonuses/${id}/pay`, { method: "PATCH" }),

  getBonusStaffLookup: () =>
    apiRequest("/api/bonuses/staff-lookup"),

  getPendingBankTransfers: (params) =>
    apiRequest(`${BASE}/receipts/bank-transfer?${new URLSearchParams(params)}`),

  confirmBankTransfer: (receiptId, notes, actualAmount) =>
    apiRequest(`${BASE}/receipts/${receiptId}/confirm-bank-transfer`, {
      method: "POST",
      body: { notes, actual_amount: actualAmount },
    }),

  // ─── Nhật ký tài chính (financial ledger) ────────────────────────────────────
  getLedger: (params) =>
    apiRequest(`${BASE}/ledger?${new URLSearchParams(params)}`),

  getLedgerStats: (params) =>
    apiRequest(`${BASE}/ledger/stats?${new URLSearchParams(params)}`),

  // Trả về CSV text — caller tự tạo blob download
  exportLedgerPeriod: (from, to) =>
    apiRequest(`${BASE}/ledger/export`, { method: "POST", body: { from, to } }),

  // Hủy xác nhận khoản nộp tiền đã confirmed (nợ hồi phục + tự đảo sổ)
  voidRepayment: (paymentId, reason) =>
    apiRequest(`/api/debts/repayments/${paymentId}/void`, {
      method: "PATCH",
      body: { reason },
    }),

  // Lịch sử thanh toán công nợ toàn cục (khách + tài xế), có lọc/phân trang
  getDebtPaymentHistory: (params = {}) =>
    apiRequest(`${BASE}/debts/payment/history?${new URLSearchParams(params)}`),

  // ─── Quản lý chi (chi phí tài xế + phiếu chi + tổng hợp) ────────────────────
  getSpendingExpenses: (params = {}) =>
    apiRequest(`${BASE}/expenses?${new URLSearchParams(params)}`),

  getVouchers: (params = {}) =>
    apiRequest(`${BASE}/vouchers?${new URLSearchParams(params)}`),

  // data là FormData (có thể kèm file 'proof')
  createVoucher: (formData) =>
    apiRequest(`${BASE}/vouchers`, { method: "POST", body: formData }),

  // formData (tuỳ chọn) kèm file 'proof' + payment_method — dùng cho phiếu hoàn tiền
  payVoucher: (id, formData = null) =>
    apiRequest(`${BASE}/vouchers/${id}/pay`, { method: "PATCH", body: formData ?? undefined }),

  // Huỷ phiếu đã duyệt nhưng chưa chi — quyền của kế toán, không cần Manager duyệt lại.
  cancelVoucher: (id, reason) =>
    apiRequest(`${BASE}/vouchers/${id}/cancel`, { method: "PATCH", body: { reason } }),

  getSpendingSummary: (params = {}) =>
    apiRequest(`${BASE}/spending-summary?${new URLSearchParams(params)}`),

  // ─── Hoàn ứng tài xế ────────────────────────────────────────────────────────
  // Chi trả ngay khoản tài đã ứng tiền túi, không đợi kỳ lương. Phiếu tạo ra vẫn phải
  // qua Manager duyệt rồi kế toán mới chi (dùng lại payVoucher).
  getPendingReimbursements: () =>
    apiRequest(`${BASE}/reimbursements`),

  createReimbursementVoucher: (body) =>
    apiRequest(`${BASE}/reimbursements`, { method: "POST", body }),

  // ─── Thu hộ (COD) — tiền công ty đang giữ hộ người bán ────────────────────
  // Ngược chiều với công nợ: ở đây CÔNG TY là bên nợ.
  getCollectOnBehalf: (params = {}) =>
    apiRequest(`${BASE}/collect-on-behalf?${new URLSearchParams(params)}`),

  createCollectOnBehalfReturn: (orderId, body) =>
    apiRequest(`${BASE}/collect-on-behalf/${orderId}/return`, { method: "POST", body }),

  // ─── Chấm công (attendance) ───────────────────────────────────────────────
  getAttendanceGrid: (params = {}) =>
    apiRequest(`/api/attendance/grid?${new URLSearchParams(params)}`),

  markAttendance: (data) =>
    apiRequest("/api/attendance", { method: "POST", body: data }),

  clearAttendance: (driverId, workDate) =>
    apiRequest(`/api/attendance/${driverId}/${workDate}`, { method: "DELETE" }),

  // ─── Nhóm xe ──────────────────────────────────────────────────────────────
  // includeHidden: màn Quản lý xe cần thấy cả nhóm đã ẩn để bỏ ẩn lại
  getVehicleGroups: (includeHidden = false) =>
    apiRequest(`/api/admin/vehicle-groups${includeHidden ? "?include_hidden=1" : ""}`),

  getVehicleGroupDetail: (id) => apiRequest(`/api/admin/vehicle-groups/${id}`),

  createVehicleGroup: (payload) =>
    apiRequest("/api/admin/vehicle-groups", { method: "POST", body: payload }),

  updateVehicleGroup: (id, payload) =>
    apiRequest(`/api/admin/vehicle-groups/${id}`, { method: "PUT", body: payload }),

  deleteVehicleGroup: (id) =>
    apiRequest(`/api/admin/vehicle-groups/${id}`, { method: "DELETE" }),

  restoreVehicleGroup: (id) =>
    apiRequest(`/api/admin/vehicle-groups/${id}/restore`, { method: "POST" }),

  // ─── Quản lý xe + gán tài xế ────────────────────────────────────────────────
  getVehicles: (params = {}) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") search.set(k, String(v)); });
    return apiRequest(`/api/admin/vehicles?${search.toString()}`);
  },

  getVehicleDetail: (id) => apiRequest(`/api/admin/vehicles/${id}`),

  createVehicle: (payload) =>
    apiRequest("/api/admin/vehicles", { method: "POST", body: payload }),

  updateVehicle: (id, payload) =>
    apiRequest(`/api/admin/vehicles/${id}`, { method: "PUT", body: payload }),

  getVehicleAssignmentHistory: (id) =>
    apiRequest(`/api/admin/vehicles/${id}/assignment-history`),

  assignVehicleDriver: (id, driverId) =>
    apiRequest(`/api/admin/vehicles/${id}/driver-assignment`, {
      method: "PATCH",
      body: { assigned_driver_id: driverId ?? null },
    }),

  getDriverOptions: (vehicleId) =>
    apiRequest(`/api/admin/vehicles/driver-options${vehicleId ? `?vehicle_id=${vehicleId}` : ""}`),

  // Vehicle lifecycle
  sendVehicleToMaintenance: (id, payload) =>
    apiRequest(`/api/admin/vehicles/${id}/send-to-maintenance`, { method: "POST", body: payload }),

  verifyVehicleMaintenance: (id, payload = {}) =>
    apiRequest(`/api/admin/vehicles/${id}/verify-maintenance`, { method: "POST", body: payload }),

  // mode: 'redo' (bắt tài xế làm lại chứng từ) | 'cancel' (huỷ hẳn, xe về hoạt động)
  rejectVehicleMaintenance: (id, payload = {}) =>
    apiRequest(`/api/admin/vehicles/${id}/reject-maintenance`, { method: "POST", body: payload }),

  markVehicleBroken: (id, payload) =>
    apiRequest(`/api/admin/vehicles/${id}/mark-broken`, { method: "POST", body: payload }),

  restoreVehicle: (id, payload = {}) =>
    apiRequest(`/api/admin/vehicles/${id}/restore`, { method: "POST", body: payload }),

  retireVehicle: (id, payload = {}) =>
    apiRequest(`/api/admin/vehicles/${id}/retire`, { method: "POST", body: payload }),

  // Maintenance requests (driver-submitted)
  getMaintenanceRequests: () => apiRequest("/api/admin/maintenance-requests"),

  approveMaintenanceRequest: (id, payload = {}) =>
    apiRequest(`/api/admin/maintenance-requests/${id}/approve`, { method: "POST", body: payload }),

  rejectMaintenanceRequest: (id, payload) =>
    apiRequest(`/api/admin/maintenance-requests/${id}/reject`, { method: "POST", body: payload }),
};
