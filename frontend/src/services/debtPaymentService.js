import { apiRequest } from './apiClient';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:9999';

const getToken = () => localStorage.getItem('token');

/**
 * Preview phân bổ thanh toán - xem trước sẽ chia tiền vào đâu
 */
export const previewDebtAllocation = async (personType, personId, amount) => {
  return apiRequest('/accountant/debts/payment/preview', {
    method: 'POST',
    body: { personType, personId, amount },
    token: getToken(),
  });
};

/**
 * Phân bổ thanh toán - ghi thu tiền và tự động chia vào các khoản nợ
 */
export const allocateDebtPayment = async (personType, personId, amount, paymentMethod = 'cash', notes = '') => {
  return apiRequest('/accountant/debts/payment/allocate', {
    method: 'POST',
    body: { personType, personId, amount, paymentMethod, notes },
    token: getToken(),
  });
};

/**
 * Ghi thu cho 1 shipment cụ thể
 */
export const paymentByShipment = async (shipmentId, amount, paymentMethod = 'cash', notes = '') => {
  return apiRequest('/accountant/debts/payment/by-shipment', {
    method: 'POST',
    body: { shipmentId, amount, paymentMethod, notes },
    token: getToken(),
  });
};

/**
 * Ghi thu cho 1 debt cụ thể
 */
export const paymentByDebt = async (debtId, amount, paymentMethod = 'cash', notes = '') => {
  return apiRequest('/accountant/debts/payment/by-debt', {
    method: 'POST',
    body: { debtId, amount, paymentMethod, notes },
    token: getToken(),
  });
};

/**
 * Lấy chi tiết công nợ theo person
 */
export const getDebtsByPerson = async (personType, personId) => {
  return apiRequest(`/accountant/debts/person/${personType}/${personId}`, {
    token: getToken(),
  });
};

/**
 * Lấy danh sách công nợ đã gộp theo person
 */
export const getGroupedDebts = async (params = {}) => {
  const query = new URLSearchParams();
  if (params.debt_type) query.set('debt_type', params.debt_type);
  if (params.status) query.set('status', params.status);
  if (params.customer) query.set('customer', params.customer);
  if (params.driver) query.set('driver', params.driver);
  if (params.page) query.set('page', params.page);
  if (params.limit) query.set('limit', params.limit);

  return apiRequest(`/accountant/debts/grouped?${query}`, {
    token: getToken(),
  });
};
