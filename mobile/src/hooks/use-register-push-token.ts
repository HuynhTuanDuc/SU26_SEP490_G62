import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

import { profileService } from '@/services/profile-service';
import { useAuthSession } from '@/providers/auth-provider';

// Không set handler này thì notification đến lúc app đang mở sẽ không hiện gì cả
// (mặc định expo-notifications im lặng khi app foreground).
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList:   true,
        shouldPlaySound:  true,
        shouldSetBadge:   false,
    }),
});

// Đăng ký device push token (FCM/APNs) lên backend sau khi đăng nhập, để nhận
// thông báo cả khi app đang đóng/khoá máy (khác với kênh WebSocket chỉ hoạt động
// lúc app đang mở). Im lặng bỏ qua mọi lỗi — đây là tính năng phụ, không được phép
// làm crash hay chặn luồng chính của app (đặc biệt khi Firebase project chưa được
// cấu hình — google-services.json / GoogleService-Info.plist / APNs key).
export function useRegisterPushToken() {
    const { status } = useAuthSession();
    const registeredRef = useRef(false);

    useEffect(() => {
        if (status !== 'authenticated' || registeredRef.current) return;
        registeredRef.current = true;

        (async () => {
            try {
                if (!Device.isDevice) return; // simulator/emulator không có push token thật

                const { status: existing } = await Notifications.getPermissionsAsync();
                let finalStatus = existing;
                if (existing !== 'granted') {
                    const { status: requested } = await Notifications.requestPermissionsAsync();
                    finalStatus = requested;
                }
                if (finalStatus !== 'granted') return;

                if (Platform.OS === 'android') {
                    await Notifications.setNotificationChannelAsync('default', {
                        name: 'Mặc định',
                        importance: Notifications.AndroidImportance.HIGH,
                    });
                }

                const { data: token } = await Notifications.getDevicePushTokenAsync();
                if (!token) return;

                await profileService.registerDeviceToken(token, Platform.OS === 'ios' ? 'ios' : 'android');
            } catch {
                // Chưa cấu hình Firebase/APNs, hoặc thiết bị/emulator không hỗ trợ push — bỏ qua.
            }
        })();
    }, [status]);
}
