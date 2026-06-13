import { useEffect } from 'react';
import {
    AlertOctagon, Banknote, Bell, CalendarOff,
    Package, PackageCheck,
    TriangleAlert, Truck,
} from 'lucide-react-native';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { ScrollView, Text, XStack, YStack } from 'tamagui';

import { AppButton } from '@/components/app-button';
import { ActiveTripBannerSkeleton, StatRowSkeleton } from '@/components/skeleton';
import { StatCard } from '@/components/stat-card';
import { TripStatusBadge } from '@/components/trip-status-badge';
import { appTheme } from '@/theme/app-theme';
import { useActiveTrip }   from '@/hooks/use-active-trip';
import { useHomeSummary }  from '@/hooks/use-home-summary';
import { useNotifications } from '@/hooks/use-notifications';
import { useProfile }      from '@/hooks/use-profile';
import { useTripStats }    from '@/hooks/use-trip-stats';
import type { TripStatus } from '@/types/trip';

// ─── Active trip banner ───────────────────────────────────────────────────────

function ActiveTripBanner({
    trip,
    isLoading,
    onPress,
}: {
    trip: import('@/types/trip').ActiveTrip | null;
    isLoading: boolean;
    onPress: () => void;
}) {
    if (isLoading) return <ActiveTripBannerSkeleton />;

    if (!trip) {
        return (
            <Pressable onPress={() => router.push('/trip-pool')} style={{ borderRadius: appTheme.radius.xl }}>
                <YStack
                    padding="$5" borderRadius={appTheme.radius.xl}
                    borderWidth={1.5} borderColor={appTheme.colors.border}
                    borderStyle="dashed" alignItems="center" justifyContent="center"
                    gap="$2" minHeight={100}
                >
                    <XStack
                        width={48} height={48} borderRadius={18}
                        backgroundColor={appTheme.colors.primarySoft}
                        alignItems="center" justifyContent="center"
                    >
                        <Package size={24} color={appTheme.colors.primary} />
                    </XStack>
                    <Text fontSize={14} fontWeight="900" color={appTheme.colors.primary}>
                        Chưa có chuyến — Nhận chuyến ngay
                    </Text>
                    <Text fontSize={12} color={appTheme.colors.textMuted}>
                        Xem danh sách chuyến phù hợp với xe của bạn
                    </Text>
                </YStack>
            </Pressable>
        );
    }

    return (
        <Pressable onPress={onPress} style={{ borderRadius: appTheme.radius.xl }}>
            <YStack
                gap="$4" padding="$5" borderRadius={appTheme.radius.xl}
                backgroundColor={appTheme.colors.primary} overflow="hidden"
            >
                <XStack
                    position="absolute" right={-36} top={-40}
                    width={132} height={132} borderRadius={66}
                    backgroundColor="rgba(255,255,255,0.12)"
                />

                <XStack alignItems="center" justifyContent="space-between">
                    <XStack alignItems="center" gap="$3" flex={1}>
                        <XStack
                            width={48} height={48} borderRadius={18}
                            alignItems="center" justifyContent="center"
                            backgroundColor="rgba(255,255,255,0.18)"
                        >
                            <Truck size={24} color={appTheme.colors.surface} />
                        </XStack>
                        <YStack flex={1} gap={2}>
                            <Text fontSize={12} fontWeight="900" color="rgba(255,255,255,0.75)">
                                ĐƠN #{trip.order_id} — CHUYẾN {trip.shipment_index}/{trip.max_shipment_index}
                            </Text>
                            <Text fontSize={18} fontWeight="900" color={appTheme.colors.surface} lineHeight={24}>
                                {trip.cargo_name ?? 'Hàng hóa'}
                            </Text>
                        </YStack>
                    </XStack>
                    <TripStatusBadge status={trip.status as TripStatus} />
                </XStack>

                <XStack gap="$3">
                    <YStack flex={1} gap={2}>
                        <Text fontSize={11} color="rgba(255,255,255,0.65)">ĐIỂM LẤY</Text>
                        <Text fontSize={13} fontWeight="800" color={appTheme.colors.surface} numberOfLines={1}>
                            {trip.pickup_address}
                        </Text>
                    </YStack>
                    <YStack flex={1} gap={2}>
                        <Text fontSize={11} color="rgba(255,255,255,0.65)">ĐIỂM GIAO</Text>
                        <Text fontSize={13} fontWeight="800" color={appTheme.colors.surface} numberOfLines={1}>
                            {trip.delivery_address}
                        </Text>
                    </YStack>
                </XStack>

                <AppButton tone="secondary" onPress={onPress}>
                    Xem chi tiết chuyến
                </AppButton>
            </YStack>
        </Pressable>
    );
}

// ─── Quick action grid item ───────────────────────────────────────────────────

type ActionItem = {
    route: string;
    onPress?: () => void;
    icon: React.ReactNode;
    label: string;
    sub: string;
    iconBg: string;
};

function GridAction({ item }: { item: ActionItem }) {
    return (
        <Pressable
            onPress={item.onPress ?? (() => router.push(item.route as never))}
            style={({ pressed }) => [s.gridCard, pressed && { opacity: 0.75 }]}
        >
            <View style={[s.gridIcon, { backgroundColor: item.iconBg }]}>
                {item.icon}
            </View>
            <Text fontSize={13} fontWeight="900" color={appTheme.colors.text} numberOfLines={1}>
                {item.label}
            </Text>
            <Text fontSize={11} color={appTheme.colors.textMuted} numberOfLines={2} lineHeight={15}>
                {item.sub}
            </Text>
        </Pressable>
    );
}

// ─── Home screen ──────────────────────────────────────────────────────────────

export function DriverHomeScreen() {
    const insets = useSafeAreaInsets();
    const { profile, isLoading: profileLoading } = useProfile();
    const { stats } = useTripStats();
    const { unreadCount } = useNotifications();
    const { debt_remaining, open_incident_count, reload: reloadSummary } = useHomeSummary();
    const { trip: activeTrip, isLoading: tripLoading } = useActiveTrip();

    // Load summary on mount
    useEffect(() => { reloadSummary(); }, [reloadSummary]);

    const displayName = profileLoading ? '...' : (profile?.full_name ?? 'Tài xế');

    const handleReportIncident = () => {
        if (!activeTrip) {
            Alert.alert('Không có chuyến đang thực hiện', 'Bạn cần có chuyến đang hoạt động để báo sự cố.');
            return;
        }
        router.push({ pathname: '/report-incident', params: { shipmentId: String(activeTrip.id) } });
    };

    const GRID_ACTIONS: ActionItem[] = [
        {
            route: '/trip-pool',
            icon: <PackageCheck size={24} color={appTheme.colors.primary} />,
            label: 'Nhận chuyến',
            sub: 'Danh sách chuyến phù hợp',
            iconBg: appTheme.colors.primarySoft,
        },
        {
            route: '/debt',
            icon: <Banknote size={24} color={appTheme.colors.danger} />,
            label: 'Công nợ',
            sub: 'Nộp tiền thu hộ về cty',
            iconBg: appTheme.colors.dangerSoft,
        },
        {
            route: '/leave',
            icon: <CalendarOff size={24} color={appTheme.colors.warning} />,
            label: 'Nghỉ phép',
            sub: 'Đăng ký ngày nghỉ',
            iconBg: appTheme.colors.warningSoft,
        },
        {
            route: '/report-incident',
            onPress: handleReportIncident,
            icon: <TriangleAlert size={24} color="#EA580C" />,
            label: 'Báo sự cố',
            sub: 'Tai nạn, hỏng xe...',
            iconBg: '#FFF7ED',
        },
    ];

    return (
        <>
            <StatusBar style="dark" />
            <ScrollView
                flex={1}
                backgroundColor={appTheme.colors.background}
                contentContainerStyle={{
                    flexGrow: 1,
                    paddingHorizontal: appTheme.spacing.screenX,
                    paddingTop: insets.top + 8,
                    paddingBottom: appTheme.spacing.screenBottom,
                    gap: 20,
                }}
            >
                {/* Header */}
                <XStack alignItems="center" justifyContent="space-between">
                    <YStack gap={2}>
                        <Text fontSize={13} color={appTheme.colors.textMuted}>Xin chào</Text>
                        <Text fontSize={24} lineHeight={30} fontWeight="900" color={appTheme.colors.text}>
                            {displayName}
                        </Text>
                    </YStack>

                    {/* Notification bell */}
                    <Pressable
                        onPress={() => router.push('/notifications')}
                        style={s.bellBtn}
                    >
                        <Bell size={21} color={appTheme.colors.primary} />
                        {unreadCount > 0 ? (
                            <View style={s.badge}>
                                <Text style={s.badgeText}>
                                    {unreadCount > 99 ? '99+' : String(unreadCount)}
                                </Text>
                            </View>
                        ) : null}
                    </Pressable>
                </XStack>

                {/* Active trip */}
                <ActiveTripBanner
                    trip={activeTrip}
                    isLoading={tripLoading}
                    onPress={() => router.push('/active-trip')}
                />

                {/* Stats */}
                {stats ? (
                    <XStack gap="$3" flexWrap="wrap">
                        <StatCard value={String(stats.today_total)}    label="Chuyến hôm nay" />
                        <StatCard value={String(stats.today_completed)} label="Hoàn thành" />
                        <StatCard value={String(stats.month_completed)} label="HT tháng này" />
                    </XStack>
                ) : (
                    <StatRowSkeleton />
                )}

                {/* Finance summary — BR spec §5 */}
                {debt_remaining > 0 ? (
                    <Pressable onPress={() => router.push('/debt')} style={{ borderRadius: appTheme.radius.lg }}>
                        <XStack
                            padding={16} borderRadius={appTheme.radius.lg}
                            backgroundColor={appTheme.colors.dangerSoft}
                            borderWidth={1.5} borderColor={appTheme.colors.dangerBorder}
                            alignItems="center" gap={12}
                        >
                            <XStack
                                width={42} height={42} borderRadius={14}
                                backgroundColor={appTheme.colors.danger + '22'}
                                alignItems="center" justifyContent="center"
                            >
                                <Banknote size={20} color={appTheme.colors.danger} />
                            </XStack>
                            <YStack flex={1} gap={2}>
                                <Text fontSize={13} fontWeight="900" color={appTheme.colors.dangerText}>
                                    Còn công nợ chưa nộp
                                </Text>
                                <Text fontSize={12} color={appTheme.colors.dangerText}>
                                    {debt_remaining.toLocaleString('vi-VN')}₫ — Nhấn để xử lý
                                </Text>
                            </YStack>
                        </XStack>
                    </Pressable>
                ) : null}

                {/* Incident summary — BR spec §5 */}
                {open_incident_count > 0 ? (
                    <Pressable onPress={() => router.push('/incident-history')} style={{ borderRadius: appTheme.radius.lg }}>
                        <XStack
                            padding={16} borderRadius={appTheme.radius.lg}
                            backgroundColor="#FFF7ED"
                            borderWidth={1.5} borderColor="#FDBA74"
                            alignItems="center" gap={12}
                        >
                            <XStack
                                width={42} height={42} borderRadius={14}
                                backgroundColor="#EA580C22"
                                alignItems="center" justifyContent="center"
                            >
                                <AlertOctagon size={20} color="#EA580C" />
                            </XStack>
                            <YStack flex={1} gap={2}>
                                <Text fontSize={13} fontWeight="900" color="#EA580C">
                                    {open_incident_count} sự cố đang mở
                                </Text>
                                <Text fontSize={12} color="#EA580C">
                                    Đang chờ điều phối viên xử lý
                                </Text>
                            </YStack>
                        </XStack>
                    </Pressable>
                ) : null}

                {/* Quick actions — 2-col grid */}
                <YStack gap={10}>
                    <Text fontSize={15} fontWeight="900" color={appTheme.colors.text}>
                        Thao tác nhanh
                    </Text>
                    <XStack gap={10} flexWrap="wrap">
                        {GRID_ACTIONS.map((item) => (
                            <GridAction key={item.route} item={item} />
                        ))}
                    </XStack>
                </YStack>

            </ScrollView>
        </>
    );
}

const GRID_CARD_SIZE = '47%' as const;

const s = StyleSheet.create({
    bellBtn: {
        width: 46,
        height: 46,
        borderRadius: 18,
        backgroundColor: appTheme.colors.primarySoft,
        alignItems: 'center',
        justifyContent: 'center',
    },
    badge: {
        position: 'absolute',
        top: 6,
        right: 6,
        minWidth: 17,
        height: 17,
        borderRadius: 9,
        backgroundColor: appTheme.colors.danger,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 3,
        borderWidth: 1.5,
        borderColor: appTheme.colors.background,
    },
    badgeText: {
        fontSize: 9,
        fontWeight: '700',
        color: '#fff',
        lineHeight: 13,
    },
    gridCard: {
        width: GRID_CARD_SIZE,
        backgroundColor: appTheme.colors.surface,
        borderRadius: appTheme.radius.lg,
        borderWidth: 1,
        borderColor: appTheme.colors.border,
        padding: 14,
        gap: 8,
    },
    gridIcon: {
        width: 48,
        height: 48,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
