import { useCallback, useState } from 'react';
import { tripService } from '@/services/trip-service';
import type { ReceiptRequest } from '@/types/trip';

type RequestState = { isLoading: boolean; error: string | null };

export function useReceiptRequest(onSuccess?: (req: ReceiptRequest) => void) {
    const [state, setState] = useState<RequestState>({ isLoading: false, error: null });

    const request = async (tripId: number, actualKm?: number) => {
        setState({ isLoading: true, error: null });
        try {
            const { request: req } = await tripService.requestReceipt(tripId, actualKm);
            setState({ isLoading: false, error: null });
            onSuccess?.(req);
            return req;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Không thể gửi yêu cầu tạo phiếu thu';
            setState({ isLoading: false, error: message });
            return null;
        }
    };

    const clearError = useCallback(() => setState(s => ({ ...s, error: null })), []);
    return { ...state, request, clearError };
}

type LoadState = { receiptRequest: ReceiptRequest | null; isLoadingReq: boolean };

export function useLoadReceiptRequest(tripId: number | null) {
    const [state, setState] = useState<LoadState>({ receiptRequest: null, isLoadingReq: false });

    const load = useCallback(async () => {
        if (!tripId) return;
        setState(s => ({ ...s, isLoadingReq: true }));
        try {
            const { request } = await tripService.getReceiptRequest(tripId);
            setState({ receiptRequest: request, isLoadingReq: false });
        } catch {
            setState(s => ({ ...s, isLoadingReq: false }));
        }
    }, [tripId]);

    return { ...state, loadReceiptRequest: load };
}
