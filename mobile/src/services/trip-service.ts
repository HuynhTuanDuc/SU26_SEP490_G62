import { apiClient } from '@/lib/api-client';
import type {
    ActiveTripResponse,
    CancelDeliveryResponse,
    ClaimTripResponse,
    CompleteTripResponse,
    ReleaseTripResponse,
    TripPoolResponse,
    TripStatus,
    UpdateStatusResponse,
} from '@/types/trip';

export const tripService = {
    getPool: (page = 1, limit = 20, vehicleGroupId?: number | null) => {
        const params = new URLSearchParams({ page: String(page), limit: String(limit) });
        if (vehicleGroupId) params.set('vehicleGroupId', String(vehicleGroupId));
        return apiClient.get<TripPoolResponse>(`/api/trips/pool?${params.toString()}`);
    },

    getActiveTrip: () => apiClient.get<ActiveTripResponse>('/api/trips/active'),

    claim: (tripId: number) =>
        apiClient.post<ClaimTripResponse>(`/api/trips/${tripId}/claim`, {}),

    updateStatus: (tripId: number, status: TripStatus) =>
        apiClient.patch<UpdateStatusResponse>(`/api/trips/${tripId}/status`, { status }),

    completeWithProof: (tripId: number, formData: FormData) =>
        apiClient.postForm<CompleteTripResponse>(`/api/trips/${tripId}/complete`, formData),

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
};
