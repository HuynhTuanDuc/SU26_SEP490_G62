import { useState } from 'react';
import * as ImageManipulator from 'expo-image-manipulator';
import { tripService } from '@/services/trip-service';
import type { ActiveTrip } from '@/types/trip';

type State = { isUploading: boolean; error: string | null };

async function compress(uri: string): Promise<string> {
    const r = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1200 } }],
        { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG },
    );
    return r.uri;
}

// PICKING → TRANSIT: ảnh lấy hàng bắt buộc (BR-013/014)
export function useLoadingProof(onSuccess?: (trip: ActiveTrip) => void) {
    const [state, setState] = useState<State>({ isUploading: false, error: null });

    const submitLoadingProof = async (tripId: number, photoUri: string) => {
        setState({ isUploading: true, error: null });
        try {
            const compressed = await compress(photoUri);
            const formData = new FormData();
            formData.append('proof', { uri: compressed, type: 'image/jpeg', name: 'loading.jpg' } as unknown as Blob);
            const { trip } = await tripService.submitLoadingProof(tripId, formData);
            setState({ isUploading: false, error: null });
            onSuccess?.(trip);
            return trip;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Không thể xác nhận lấy hàng';
            setState({ isUploading: false, error: message });
            return null;
        }
    };

    const clearError = () => setState(s => ({ ...s, error: null }));
    return { ...state, submitLoadingProof, clearError };
}
