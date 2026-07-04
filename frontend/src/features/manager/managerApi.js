import { apiRequest } from "../../services/apiClient";

export function fetchManagerDashboard() {
  return apiRequest("/api/manager/dashboard");
}

export function fetchManagerSalaryAdvances(params = {}) {
  const searchParams = new URLSearchParams();
  if (params.status) searchParams.set("status", params.status);
  if (params.limit) searchParams.set("limit", String(params.limit));
  const suffix = searchParams.toString() ? `?${searchParams.toString()}` : "";
  return apiRequest(`/api/manager/salary-advances${suffix}`);
}

export function approveManagerSalaryAdvance(id) {
  return apiRequest(`/api/manager/salary-advances/${id}/approve`, { method: "PATCH" });
}

export function rejectManagerSalaryAdvance(id, reason) {
  return apiRequest(`/api/manager/salary-advances/${id}/reject`, {
    method: "PATCH",
    body: { reason },
  });
}

export function fetchManagerDebtRepayments() {
  return apiRequest("/api/manager/debt-repayments");
}

export function confirmManagerDebtRepayment(id) {
  return apiRequest(`/api/manager/debt-repayments/${id}/confirm`, { method: "PATCH" });
}

export function rejectManagerDebtRepayment(id, reason) {
  return apiRequest(`/api/manager/debt-repayments/${id}/reject`, {
    method: "PATCH",
    body: { reason },
  });
}

export function fetchManagerReceiptRequests() {
  return apiRequest("/api/manager/receipt-requests");
}

export function fetchCompanyInfo() {
  return apiRequest("/api/company/info");
}

export function updateCompanyInfo(payload) {
  return apiRequest("/api/company/info", {
    method: "PUT",
    body: payload,
  });
}

export function fetchManagerPartners(search = "") {
  const suffix = search ? `?search=${encodeURIComponent(search)}` : "";
  return apiRequest(`/api/manager/partners${suffix}`);
}

export function createManagerPartner(payload) {
  return apiRequest("/api/manager/partners", {
    method: "POST",
    body: payload,
  });
}

export function updateManagerPartner(id, payload) {
  return apiRequest(`/api/manager/partners/${id}`, {
    method: "PUT",
    body: payload,
  });
}

export function fetchManagerPartnerDebts(id) {
  return apiRequest(`/api/manager/partners/${id}/debts`);
}

export function fetchManagerPayrolls(params = {}) {
  const q = new URLSearchParams();
  if (params.month)  q.set("month",  String(params.month));
  if (params.year)   q.set("year",   String(params.year));
  if (params.status) q.set("status", params.status);
  if (params.search) q.set("search", params.search);
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return apiRequest(`/api/manager/payrolls${suffix}`);
}

export function reviewManagerPayroll(id) {
  return apiRequest(`/api/manager/payrolls/${id}/review`, { method: "PATCH" });
}

export function fetchManagerBonuses(params = {}) {
  const q = new URLSearchParams();
  if (params.year)   q.set("year",   String(params.year));
  if (params.type)   q.set("type",   params.type);
  if (params.status) q.set("status", params.status);
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return apiRequest(`/api/bonuses${suffix}`);
}

export function fetchManagerBonusStats(year) {
  return apiRequest(`/api/bonuses/stats?year=${year}`);
}

export function previewTetBonuses(year) {
  return apiRequest(`/api/bonuses/tet/preview?year=${year}`);
}

export function generateTetBonuses(year) {
  return apiRequest("/api/bonuses/tet/generate", { method: "POST", body: { year } });
}

export function createManagerBonus(data) {
  return apiRequest("/api/bonuses", { method: "POST", body: data });
}

export function approveManagerBonus(id, adjustedAmount) {
  return apiRequest(`/api/bonuses/${id}/approve`, {
    method: "PATCH",
    body: adjustedAmount != null ? { adjusted_amount: adjustedAmount } : {},
  });
}

export function rejectManagerBonus(id, reason) {
  return apiRequest(`/api/bonuses/${id}/reject`, { method: "PATCH", body: { reason } });
}

export function fetchDriverList() {
  return apiRequest("/api/admin/users?role=driver&limit=200");
}
