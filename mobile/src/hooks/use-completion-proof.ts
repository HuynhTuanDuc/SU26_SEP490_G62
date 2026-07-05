import { useState } from 'react';
import * as ImageManipulator from 'expo-image-manipulator';
import { tripService } from '@/services/trip-service';
import type { ActiveTrip } from '@/types/trip';

type State = {
    isUploading: boolean;
    error: string | null;
};

async function compressImage(uri: string): Promise<string> {
    const result = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1200 } }],
        { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG },
    );
    return result.uri;
}

export function useCompletionProof(onSuccess?: (completedTrip: ActiveTrip) => void) {
    const [state, setState] = useState<State>({ isUploading: false, error: null });

    // proofUri — ảnh xác nhận giao hàng (bắt buộc, BR-015/016/017)
    // Ảnh biên lai được chụp riêng ở màn hình receipt-request (BR-008A/B)
    const completeWithProof = async (tripId: number, proofUri: string) => {
        setState({ isUploading: true, error: null });
        try {
            const compressedProof = await compressImage(proofUri);

            const formData = new FormData();
            formData.append('proof', {
                uri: compressedProof,
                type: 'image/jpeg',
                name: 'proof.jpg',
            } as unknown as Blob);

            const result = await tripService.completeWithProof(tripId, formData);
            setState({ isUploading: false, error: null });
            onSuccess?.(result.trip);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Không thể hoàn thành chuyến';
            setState({ isUploading: false, error: message });
        }
    };

    const clearError = () => setState((s) => ({ ...s, error: null }));

    return { ...state, completeWithProof, clearError };
}
