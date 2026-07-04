import { apiClient } from '@/lib/api-client';
import type {
    ActiveTripResponse,
    CancelDeliveryResponse,
    ClaimTripResponse,
    CompleteTripResponse,
    ReleaseTripResponse,
    RequestOrderReceiptResponse,
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

    getPendingReceiptOrder: () =>
        apiClient.get<{ order: import('@/types/trip').PendingReceiptOrder | null }>('/api/trips/pending-receipt'),

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

    markUnpaid: (tripId: number, amount: number, notes?: string) =>
        apiClient.post<{ message: string; debt: object }>(`/api/trips/${tripId}/mark-unpaid`, { amount, notes }),

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

    arriveAtStop: (shipmentId: number, stopId: number) =>
        apiClient.patch<{ message: string; stop: import('@/types/trip').TripStop }>(
            `/api/trips/${shipmentId}/stops/${stopId}/arrive`, {},
        ),

    completeStop: (shipmentId: number, stopId: number, photoUri?: string) => {
        if (photoUri) {
            const fd = new FormData();
            fd.append('proof', { uri: photoUri, name: 'proof.jpg', type: 'image/jpeg' } as unknown as Blob);
            return apiClient.patchForm<{ message: string; stop: import('@/types/trip').TripStop }>(
                `/api/trips/${shipmentId}/stops/${stopId}/complete`, fd,
            );
        }
        return apiClient.patch<{ message: string; stop: import('@/types/trip').TripStop }>(
            `/api/trips/${shipmentId}/stops/${stopId}/complete`, {},
        );
    },

    getShipmentExpenses: (shipmentId: number) =>
        apiClient.get<import('@/types/trip').ExpenseListResponse>(`/api/expenses/shipment/${shipmentId}`),

    createExpense: (formData: FormData) =>
        apiClient.postForm<import('@/types/trip').CreateExpenseResponse>('/api/expenses', formData),

    getPaymentSummary: (tripId: number) =>
        apiClient.get<import('@/types/trip').PaymentSummary>(`/api/trips/${tripId}/payment-summary`),

    getShipmentPayments: (tripId: number) =>
        apiClient.get<{ payments: import('@/types/trip').ShipmentPayment[] }>(`/api/trips/${tripId}/payments`),

    updatePayment: (tripId: number, paymentId: number, formData: FormData) =>
        apiClient.patchForm<{ message: string; payment: import('@/types/trip').ShipmentPayment }>(
            `/api/trips/${tripId}/payments/${paymentId}`, formData,
        ),

    requestOrderReceipt: (orderId: number, body: { shipment_id: number; actual_km: number }) =>
        apiClient.post<RequestOrderReceiptResponse>(
            `/api/orders/${orderId}/request-receipt`, body,
        ),

    // Lấy trạng thái yêu cầu phiếu thu cấp Order
    getOrderReceiptRequest: (orderId: number) =>
        apiClient.get<{ request: import('@/types/trip').OrderReceiptRequest | null }>(
            `/api/orders/${orderId}/receipt-request`,
        ),

    // Phiếu thu đã được coordinator tạo — driver xem + show cho khách
    getDriverReceipts: (page = 1, limit = 20) =>
        apiClient.get<{ receipts: import('@/types/trip').DriverReceiptSummary[] }>(
            `/api/trips/receipts?page=${page}&limit=${limit}`,
        ),

    getDriverReceiptDetail: (receiptId: number) =>
        apiClient.get<{ receipt: import('@/types/trip').DriverReceiptDetail }>(
            `/api/trips/receipts/${receiptId}`,
        ),

    recordReceiptCollection: (receiptId: number, formData: FormData) =>
        apiClient.postForm<{ message: string }>(
            `/api/trips/receipts/${receiptId}/record-collection`,
            formData,
        ),

    resubmitReceiptRequest: (orrId: number, driverNotes?: string) =>
        apiClient.post<{ message: string }>(
            `/api/trips/receipt-request/${orrId}/resubmit`,
            { driver_notes: driverNotes ?? null },
        ),

    updateExpense: (expenseId: number, formData: FormData) =>
        apiClient.patchForm<{ message: string }>(
            `/api/expenses/${expenseId}`,
            formData,
        ),

    getCompanyInfo: () =>
        apiClient.get<{ info: import('@/types/trip').CompanyInfo }>('/api/company/info'),
};
