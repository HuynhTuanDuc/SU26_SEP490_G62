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

// RETURNING → COMPLETED: ảnh hoàn hàng tuỳ chọn
export function useReturnComplete(onSuccess?: (trip: ActiveTrip) => void) {
    const [state, setState] = useState<State>({ isUploading: false, error: null });

    const completeReturn = async (tripId: number, photoUri?: string | null) => {
        setState({ isUploading: true, error: null });
        try {
            let formData: FormData | null = null;
            if (photoUri) {
                const compressed = await compress(photoUri);
                formData = new FormData();
                formData.append('proof', { uri: compressed, type: 'image/jpeg', name: 'return.jpg' } as unknown as Blob);
            }
            const { trip } = await tripService.returnComplete(tripId, formData);
            setState({ isUploading: false, error: null });
            onSuccess?.(trip);
            return trip;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Không thể hoàn thành hoàn hàng';
            setState({ isUploading: false, error: message });
            return null;
        }
    };

    const clearError = () => setState(s => ({ ...s, error: null }));
    return { ...state, completeReturn, clearError };
}
