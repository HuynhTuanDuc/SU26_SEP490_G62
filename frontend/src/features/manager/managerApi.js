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
