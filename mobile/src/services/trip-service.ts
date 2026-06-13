import { apiClient } from '@/lib/api-client';
import type {
    ActiveTripResponse,
    CancelDeliveryResponse,
    ClaimTripResponse,
    CompleteTripResponse,
    ReceiptRequest,
    ReleaseTripResponse,
    TripPoolResponse,
    TripStatus,
    UpdateStatusResponse,
} from '@/types/trip';

export const tripService = {
    getPool: (page = 1, limit = 5, vehicleGroupId?: number) => {
        const q = new URLSearchParams({ page: String(page), limit: String(limit) });
        if (vehicleGroupId) q.set('vehicleGroupId', String(vehicleGroupId));
        return apiClient.get<TripPoolResponse>(`/api/trips/pool?${q}`);
    },

    getActiveTrip: () => apiClient.get<ActiveTripResponse>('/api/trips/active'),

    claim: (shipmentId: number) =>
        apiClient.post<ClaimTripResponse>(`/api/trips/${shipmentId}/claim`, {}),

    getPoolShipmentDetail: (shipmentId: number) =>
        apiClient.get<import('@/types/trip').TripPoolItem>(`/api/trips/pool-shipment/${shipmentId}`),

    updateStatus: (tripId: number, status: TripStatus, reason?: string) =>
        apiClient.patch<UpdateStatusResponse>(`/api/trips/${tripId}/status`, { status, reason }),

    // ARRIVED → COMPLETED: upload ảnh xác nhận giao hàng (BR-015/016/017)
    completeWithProof: (tripId: number, formData: FormData) =>
        apiClient.postForm<CompleteTripResponse>(`/api/trips/${tripId}/complete`, formData),

    // PICKING → TRANSIT: upload ảnh lấy hàng bắt buộc (BR-013/014)
    submitLoadingProof: (tripId: number, formData: FormData) =>
        apiClient.postForm<UpdateStatusResponse>(`/api/trips/${tripId}/start-transit`, formData),

    // RETURNING → COMPLETED: hoàn hàng với ảnh tuỳ chọn
    returnComplete: (tripId: number, formData: FormData) =>
        apiClient.postForm<CompleteTripResponse>(`/api/trips/${tripId}/return-complete`, formData),

    // TH3: Báo khách chưa trả → tạo customer debt
    markUnpaid: (tripId: number, amount: number, notes?: string) =>
        apiClient.post<{ message: string; debt: object }>(`/api/trips/${tripId}/mark-unpaid`, { amount, notes }),

    // TH2: Ghi nhận khách trả tiền mặt → tạo driver debt
    recordPayment: (tripId: number, formData: FormData) =>
        apiClient.postForm<{ message: string; payment: object; debt: object }>(`/api/trips/${tripId}/payment`, formData),

    cancelDelivery: (tripId: number, reason: string) =>
        apiClient.post<CancelDeliveryResponse>(`/api/trips/${tripId}/cancel-delivery`, { reason }),

    releaseTrip: (tripId: number, reason?: string) =>
        apiClient.post<ReleaseTripResponse>(`/api/trips/${tripId}/release`, { reason }),

    getOrderHistory: (page = 1, limit = 20) =>
        apiClient.get<import('@/types/trip').OrderHistoryResponse>(`/api/trips/history?page=${page}&limit=${limit}`),

    getPoolOrderDetail: (orderId: number) =>
        apiClient.get<import('@/types/trip').PoolOrderDetail>(`/api/trips/pool/${orderId}`),

    getOrderDetail: (orderId: number) =>
        apiClient.get<import('@/types/trip').OrderDetailResponse>(`/api/trips/orders/${orderId}`),

    getShipmentExpenses: (shipmentId: number) =>
        apiClient.get<import('@/types/trip').ExpenseListResponse>(`/api/expenses/shipment/${shipmentId}`),

    createExpense: (formData: FormData) =>
        apiClient.postForm<import('@/types/trip').CreateExpenseResponse>('/api/expenses', formData),

    // Trạng thái tài chính chuyến — trip_value, cash_collected, remaining...
    getPaymentSummary: (tripId: number) =>
        apiClient.get<import('@/types/trip').PaymentSummary>(`/api/trips/${tripId}/payment-summary`),

    // Danh sách ghi nhận tiền mặt của chuyến
    getShipmentPayments: (tripId: number) =>
        apiClient.get<{ payments: import('@/types/trip').ShipmentPayment[] }>(`/api/trips/${tripId}/payments`),

    // Sửa ghi nhận tiền mặt (amount + thay ảnh nếu có)
    updatePayment: (tripId: number, paymentId: number, formData: FormData) =>
        apiClient.patchForm<{ message: string; payment: import('@/types/trip').ShipmentPayment }>(
            `/api/trips/${tripId}/payments/${paymentId}`, formData,
        ),

    // Yêu cầu tạo phiếu thu (driver → coordinator) — chỉ 1 lần mỗi chuyến
    requestReceipt: (tripId: number, actualKm?: number) =>
        apiClient.post<{ message: string; request: ReceiptRequest }>(
            `/api/trips/${tripId}/request-receipt`,
            { actual_km: actualKm ?? null },
        ),

    // Lấy trạng thái yêu cầu phiếu thu hiện tại của chuyến
    getReceiptRequest: (tripId: number) =>
        apiClient.get<{ request: ReceiptRequest | null }>(`/api/trips/${tripId}/receipt-request`),
};
