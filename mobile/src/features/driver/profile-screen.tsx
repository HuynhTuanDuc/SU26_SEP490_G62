import { ActivityIndicator, Alert, Image, Pressable, ScrollView, View } from 'react-native';
import { Camera, ChevronRight, LogOut, Settings, Shield, User, Wrench } from 'lucide-react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Text, XStack, YStack } from 'tamagui';

import { ScreenHeader } from '@/components/screen-header';
import { AppText } from '@/components/app-text';
import { ProfileSkeleton } from '@/components/skeleton';
import { appTheme } from '@/theme/app-theme';
import { useLogout } from '@/hooks/use-logout';
import { useProfile } from '@/hooks/use-profile';
import { useUpdateProfile } from '@/hooks/use-update-profile';

type MenuRowProps = {
    icon: React.ReactNode;
    label: string;
    onPress: () => void;
    danger?: boolean;
    loading?: boolean;
};

function MenuRow({ icon, label, onPress, danger, loading }: MenuRowProps) {
    return (
        <Pressable onPress={onPress} disabled={loading}>
            {({ pressed }) => (
                <XStack
                    alignItems="center"
                    gap={12}
                    paddingVertical={14}
                    paddingHorizontal={16}
                    backgroundColor={pressed ? appTheme.colors.surfaceSoft : appTheme.colors.surface}
                    opacity={loading ? 0.6 : 1}
                >
                    <XStack
                        width={36} height={36} borderRadius={12}
                        backgroundColor={danger ? appTheme.colors.dangerSoft : appTheme.colors.primarySoft}
                        alignItems="center" justifyContent="center"
                    >
                        {icon}
                    </XStack>
                    <Text flex={1} fontSize={14} fontWeight="700"
                        color={danger ? appTheme.colors.danger : appTheme.colors.text}>
                        {label}
                    </Text>
                    {loading
                        ? <ActivityIndicator size="small" color={appTheme.colors.danger} />
                        : <ChevronRight size={16} color={appTheme.colors.textMuted} />}
                </XStack>
            )}
        </Pressable>
    );
}

export function ProfileScreen() {
    const { profile, isLoading, refresh } = useProfile();
    const { confirmLogout, isLoggingOut } = useLogout();
    const { isLoading: avatarLoading, updateAvatar } = useUpdateProfile(() => refresh());

    const handlePickAvatar = async () => {
        Alert.alert('Cập nhật ảnh đại diện', 'Chọn nguồn ảnh', [
            {
                text: 'Chụp ảnh',
                onPress: async () => {
                    const result = await ImagePicker.launchCameraAsync({ quality: 0.85, allowsEditing: true, aspect: [1, 1] });
                    if (!result.canceled && result.assets[0]) await updateAvatar(result.assets[0].uri);
                },
            },
            {
                text: 'Chọn từ thư viện',
                onPress: async () => {
                    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.85, allowsEditing: true, aspect: [1, 1] });
                    if (!result.canceled && result.assets[0]) await updateAvatar(result.assets[0].uri);
                },
            },
            { text: 'Hủy', style: 'cancel' },
        ]);
    };

    const handleOpenProfile = () => {
        if (!profile) return;
        router.push({ pathname: '/edit-profile', params: { data: JSON.stringify(profile) } });
    };

    return (
        <View style={{ flex: 1, backgroundColor: appTheme.colors.background }}>
            <ScreenHeader title="Hồ sơ & Cài đặt" />
            <ScrollView contentContainerStyle={{ paddingBottom: appTheme.spacing.screenBottom }}>

                {isLoading ? <ProfileSkeleton /> : <>
                    {/* Avatar + tên */}
                    <YStack alignItems="center" paddingVertical={28} gap={12}>
                        <Pressable onPress={handlePickAvatar} style={{ position: 'relative' }}>
                            {profile?.avatar_url ? (
                                <Image source={{ uri: profile.avatar_url }}
                                    style={{ width: 80, height: 80, borderRadius: 28 }} />
                            ) : (
                                <XStack width={80} height={80} borderRadius={28}
                                    backgroundColor={appTheme.colors.primarySoft}
                                    alignItems="center" justifyContent="center">
                                    <User size={36} color={appTheme.colors.primary} />
                                </XStack>
                            )}
                            <XStack position="absolute" bottom={0} right={0}
                                width={26} height={26} borderRadius={13}
                                backgroundColor={appTheme.colors.primary}
                                alignItems="center" justifyContent="center"
                                borderWidth={2} borderColor={appTheme.colors.background}>
                                {avatarLoading
                                    ? <ActivityIndicator size="small" color={appTheme.colors.surface} />
                                    : <Camera size={13} color={appTheme.colors.surface} />}
                            </XStack>
                        </Pressable>

                        <YStack alignItems="center" gap={2}>
                            <AppText variant="bodyStrong">{profile?.full_name ?? '—'}</AppText>
                            <AppText variant="caption" tone="muted">{profile?.email ?? '—'}</AppText>
                            <XStack marginTop={4} paddingHorizontal={10} paddingVertical={3}
                                borderRadius={appTheme.radius.pill}
                                backgroundColor={appTheme.colors.primarySoft}>
                                <Text fontSize={11} fontWeight="800" color={appTheme.colors.primary}>
                                    {profile?.role?.toUpperCase() ?? ''}
                                </Text>
                            </XStack>
                        </YStack>
                    </YStack>

                    {/* Tài khoản */}
                    <YStack marginHorizontal={appTheme.spacing.screenX} borderRadius={appTheme.radius.lg}
                        borderWidth={1} borderColor={appTheme.colors.border} overflow="hidden" marginBottom={14}>
                        <XStack paddingHorizontal={16} paddingVertical={10} backgroundColor={appTheme.colors.surfaceSoft}>
                            <Text fontSize={11} fontWeight="900" color={appTheme.colors.textMuted}>TÀI KHOẢN</Text>
                        </XStack>
                        <MenuRow icon={<User size={17} color={appTheme.colors.primary} />}
                            label="Thông tin cá nhân" onPress={handleOpenProfile} />
                        <XStack height={1} backgroundColor={appTheme.colors.border} marginLeft={64} />
                        <MenuRow icon={<Shield size={17} color={appTheme.colors.primary} />}
                            label="Đổi mật khẩu" onPress={() => router.push('/change-password')} />
                    </YStack>

                    {/* Công việc */}
                    <YStack marginHorizontal={appTheme.spacing.screenX} borderRadius={appTheme.radius.lg}
                        borderWidth={1} borderColor={appTheme.colors.border} overflow="hidden" marginBottom={14}>
                        <XStack paddingHorizontal={16} paddingVertical={10} backgroundColor={appTheme.colors.surfaceSoft}>
                            <Text fontSize={11} fontWeight="900" color={appTheme.colors.textMuted}>CÔNG VIỆC</Text>
                        </XStack>
                        <MenuRow icon={<Wrench size={17} color={appTheme.colors.warning} />}
                            label="Bảo dưỡng xe" onPress={() => router.push('/maintenance')} />
                    </YStack>

                    {/* Hệ thống */}
                    <YStack marginHorizontal={appTheme.spacing.screenX} borderRadius={appTheme.radius.lg}
                        borderWidth={1} borderColor={appTheme.colors.border} overflow="hidden" marginBottom={14}>
                        <XStack paddingHorizontal={16} paddingVertical={10} backgroundColor={appTheme.colors.surfaceSoft}>
                            <Text fontSize={11} fontWeight="900" color={appTheme.colors.textMuted}>HỆ THỐNG</Text>
                        </XStack>
                        <MenuRow icon={<Settings size={17} color={appTheme.colors.primary} />}
                            label="Cài đặt ứng dụng" onPress={() => {}} />
                    </YStack>

                    {/* Đăng xuất */}
                    <YStack marginHorizontal={appTheme.spacing.screenX} borderRadius={appTheme.radius.lg}
                        borderWidth={1} borderColor={appTheme.colors.dangerBorder} overflow="hidden">
                        <MenuRow icon={<LogOut size={17} color={appTheme.colors.danger} />}
                            label="Đăng xuất" onPress={confirmLogout} danger loading={isLoggingOut} />
                    </YStack>
                </>}
            </ScrollView>
        </View>
    );
}

export default ProfileScreen;
