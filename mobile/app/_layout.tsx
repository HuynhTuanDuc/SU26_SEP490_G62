import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { TamaguiProvider } from 'tamagui';

import tamaguiConfig from '../tamagui.config';
import { AuthProvider } from '@/providers/auth-provider';
import { NotificationsProvider } from '@/providers/notifications-provider';
import { UIProvider } from '@/providers/ui-provider';
import { useRegisterPushToken } from '@/hooks/use-register-push-token';

// Đăng ký push token (FCM/APNs) sau khi đăng nhập — tách component riêng vì hook
// cần đọc useAuthSession(), phải render bên trong <AuthProvider>.
function PushTokenRegistrar() {
  useRegisterPushToken();
  return null;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    GoogleSansRegular: require('../assets/fonts/Google_Sans/static/GoogleSans-Regular.ttf'),
    GoogleSansMedium: require('../assets/fonts/Google_Sans/static/GoogleSans-Medium.ttf'),
    GoogleSansSemiBold: require('../assets/fonts/Google_Sans/static/GoogleSans-SemiBold.ttf'),
    GoogleSansBold: require('../assets/fonts/Google_Sans/static/GoogleSans-Bold.ttf'),
  });

  if (!fontsLoaded) return null;

  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
      <UIProvider>
        <AuthProvider>
          <PushTokenRegistrar />
          <NotificationsProvider>
            <Stack screenOptions={{ headerShown: false }} />
          </NotificationsProvider>
        </AuthProvider>
      </UIProvider>
    </TamaguiProvider>
  );
}
