import { useState } from 'react';
import * as ImageManipulator from 'expo-image-manipulator';
import { profileService } from '@/services/profile-service';
import type { UpdateProfilePayload, UserProfile } from '@/types/profile';

type State = { isLoading: boolean; error: string | null };

export function useUpdateProfile(onSuccess?: (profile: Partial<UserProfile>) => void) {
    const [state, setState] = useState<State>({ isLoading: false, error: null });

    const update = async (payload: UpdateProfilePayload) => {
        setState({ isLoading: true, error: null });
        try {
            const { profile } = await profileService.updateMyProfile(payload);
            setState({ isLoading: false, error: null });
            onSuccess?.(profile);
            return { profile, error: null as string | null };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Cập nhật thất bại';
            setState({ isLoading: false, error: message });
            return { profile: null, error: message };
        }
    };

    const updateAvatar = async (photoUri: string) => {
        setState({ isLoading: true, error: null });
        try {
            const compressed = await ImageManipulator.manipulateAsync(
                photoUri,
                [{ resize: { width: 400 } }],
                { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
            );

            const formData = new FormData();
            formData.append('avatar', {
                uri: compressed.uri,
                type: 'image/jpeg',
                name: 'avatar.jpg',
            } as unknown as Blob);

            const { avatar_url } = await profileService.updateAvatar(formData);
            setState({ isLoading: false, error: null });
            onSuccess?.({ avatar_url });
            return avatar_url;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Tải ảnh thất bại';
            setState({ isLoading: false, error: message });
            return null;
        }
    };

    const clearError = () => setState((s) => ({ ...s, error: null }));

    return { ...state, update, updateAvatar, clearError };
}
