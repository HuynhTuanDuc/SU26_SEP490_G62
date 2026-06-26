import { apiRequest } from "../../../services/apiClient";

const BASE = "/accountant";

export const accountantService = {
  // ── Finance ──────────────────────────────────────────────────────────
  getFinanceStats: () =>
    apiRequest(`${BASE}/finance/stats`),

  // ── Orders ───────────────────────────────────────────────────────────
  getOrders: (params) =>
    apiRequest(`${BASE}/orders?${new URLSearchParams(params)}`),

  getOrderShipments: (orderId) =>
    apiRequest(`${BASE}/orders/${orderId}/shipments`),

  createOrder: (data) =>
    apiRequest(`${BASE}/orders`, { method: "POST", body: data }),

  importOrders: (orders) =>
    apiRequest(`${BASE}/orders/import`, { method: "POST", body: { orders } }),

  updateOrder: (orderId, data) =>
    apiRequest(`${BASE}/orders/${orderId}`, { method: "PUT", body: data }),

  getLookup: () =>
    apiRequest(`${BASE}/orders/lookup`),

  // ── Payments ─────────────────────────────────────────────────────────
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

  // ── Debts ────────────────────────────────────────────────────────────
  getDebts: (params) =>
    apiRequest(`${BASE}/debts?${new URLSearchParams(params)}`),

  getDebtStats: () =>
    apiRequest(`${BASE}/debts/stats`),

  getDebtsGrouped: () =>
    apiRequest(`${BASE}/debts/grouped`),

  getDebtsByPerson: (personType, personId) =>
    apiRequest(`${BASE}/debts/person/${personType}/${personId}`),

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

  // ── Reports ──────────────────────────────────────────────────────────
  getReportOverview: (months = 6) =>
    apiRequest(`${BASE}/reports/overview?months=${months}`),

  // ── Payroll ──────────────────────────────────────────────────────────
  getPayrolls: (params) =>
    apiRequest(`${BASE}/payroll?${new URLSearchParams(params)}`),

  generatePayrolls: (month, year) =>
    apiRequest(`${BASE}/payroll/generate`, { method: "POST", body: { month, year } }),

  confirmPayroll: (id) =>
    apiRequest(`${BASE}/payroll/${id}/confirm`, { method: "PATCH" }),

  markPayrollPaid: (id) =>
    apiRequest(`${BASE}/payroll/${id}/pay`, { method: "PATCH" }),

  // ── Salary Advances ──────────────────────────────────────────────────
  getSalaryAdvances: (params) =>
    apiRequest(`${BASE}/payroll/advances?${new URLSearchParams(params)}`),

  disburseAdvance: (id, notes) =>
    apiRequest(`${BASE}/payroll/advances/${id}/disburse`, {
      method: "PATCH",
      body: { notes },
    }),
};
