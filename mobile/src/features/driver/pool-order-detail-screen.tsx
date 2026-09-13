import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Layers, MapPin, Package, Weight, XCircle } from 'lucide-react-native';
import { Text, XStack, YStack } from 'tamagui';

import { AppText }             from '@/components/app-text';
import { LifecycleActionButton } from '@/components/lifecycle-action-button';
import { PoolOrderDetailSkeleton } from '@/components/skeleton';
import { ScreenHeader }        from '@/components/screen-header';
import { appTheme }            from '@/theme/app-theme';
import { useActiveTrip }       from '@/hooks/use-active-trip';
import { useClaimTrip }        from '@/hooks/use-claim-trip';
import { tripService }         from '@/services/trip-service';
import { useConfirm, useToast } from '@/providers/ui-provider';
import type { TripPoolItem }   from '@/types/trip';
import { money } from '@/lib/format-number';


const fmtWeight = (kg: string | null) => {
    if (!kg) return null;
    const n = parseFloat(kg);
    return n >= 1000 ? `${(n / 1000).toFixed(1)} tấn` : `${n} kg`;
};

export default function PoolOrderDetailScreen() {
    const { id }     = useLocalSearchParams<{ id: string }>();
    const shipmentId = Number(id);

    const [data,      setData]      = useState<TripPoolItem | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error,     setError]     = useState<string | null>(null);

    const { trip: activeTrip }                   = useActiveTrip();
    const hasActiveTrip                           = activeTrip !== null;
    const { showConfirm }                         = useConfirm();
    const { showToast }                           = useToast();
    const { isLoading: isClaiming, claim }        = useClaimTrip();

    const load = useCallback(async () => {
        if (!shipmentId) return;
        setIsLoading(true);
        setError(null);
        try {
            const detail = await tripService.getPoolShipmentDetail(shipmentId);
            setData(detail);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Không thể tải thông tin chuyến');
        } finally {
            setIsLoading(false);
        }
    }, [shipmentId]);

    useEffect(() => { void load(); }, [load]);

    // Kéo-xuống làm mới (không bật skeleton như load).
    const [refreshing, setRefreshing] = useState(false);
    const onRefresh = useCallback(async () => {
        if (!shipmentId) return;
        setRefreshing(true);
        try {
            const detail = await tripService.getPoolShipmentDetail(shipmentId);
            setData(detail);
            setError(null);
        } catch { /* giữ data cũ nếu lỗi */ } finally {
            setRefreshing(false);
        }
    }, [shipmentId]);

    const handleClaim = async () => {
        if (!data) return;
        if (hasActiveTrip) {
            showToast({ type: 'warning', message: 'Bạn đang có chuyến đang thực hiện' });
            return;
        }
        const ok = await showConfirm({
            title:        'Nhận chuyến',
            message:      `Đơn #${data.order_id} — Chuyến ${data.shipment_index}/${data.total_order_legs}\n${data.pickup_address} → ${data.delivery_address}`,
            confirmLabel: 'Nhận chuyến này',
        });
        if (!ok) return;

        const result = await claim(shipmentId);
        if (result.ok) {
            showToast({ type: 'success', message: `Đã nhận chuyến ${data.shipment_index} của đơn #${data.order_id}!` });
            router.replace('/active-trip');
        } else if (result.sameOrder) {
            showToast({ type: 'warning', message: result.message });
            router.back();
        } else if (result.alreadyClaimed) {
            showToast({ type: 'warning', message: 'Chuyến này đã được tài xế khác nhận' });
            router.back();
        } else {
            showToast({ type: 'error', message: result.message });
        }
    };

    if (isLoading) {
        return (
            <View style={{ flex: 1, backgroundColor: appTheme.colors.background }}>
                <ScreenHeader title="Chi tiết chuyến" showBack />
                <ScrollView style={{ flex: 1 }} scrollEnabled={false}
                    contentContainerStyle={{ paddingBottom: appTheme.spacing.screenBottom }}>
                    <PoolOrderDetailSkeleton />
                </ScrollView>
            </View>
        );
    }

    if (error || !data) {
        return (
            <View style={{ flex: 1, backgroundColor: appTheme.colors.background }}>
                <ScreenHeader title="Chi tiết chuyến" showBack />
                <YStack flex={1} alignItems="center" justifyContent="center" padding={24} gap={12}>
                    <XCircle size={36} color={appTheme.colors.danger} />
                    <AppText variant="bodyStrong" tone="muted">
                        {error ?? 'Chuyến không còn khả dụng'}
                    </AppText>
                    <AppText variant="caption" tone="muted">
                        Chuyến này có thể đã được tài xế khác nhận rồi
                    </AppText>
                </YStack>
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: appTheme.colors.background }}>
            <ScreenHeader
                title={`Đơn #${data.order_id} — Chuyến ${data.shipment_index}/${data.total_order_legs}`}
                showBack
            />

            <ScrollView
                style={{ flex: 1 }}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={appTheme.colors.primary}
                        colors={[appTheme.colors.primary]}
                    />
                }
                contentContainerStyle={{
                    paddingHorizontal: appTheme.spacing.screenX,
                    paddingTop: 16,
                    paddingBottom: 100,
                    gap: 14,
                }}
                showsVerticalScrollIndicator={false}
            >
                {/* ── Order context ── */}
                <YStack
                    borderRadius={appTheme.radius.lg} borderWidth={1}
                    borderColor={appTheme.colors.border} backgroundColor={appTheme.colors.surface}
                    overflow="hidden"
                >
                    <XStack paddingHorizontal={16} paddingVertical={11} backgroundColor={appTheme.colors.surfaceSoft}
                        alignItems="center" justifyContent="space-between">
                        <Text fontSize={12} fontWeight="900" color={appTheme.colors.textMuted}>THÔNG TIN HÀNG HÓA</Text>
                        {/* Leg badge */}
                        <XStack paddingHorizontal={10} paddingVertical={4}
                            borderRadius={appTheme.radius.pill}
                            backgroundColor={appTheme.colors.primarySoft}
                            gap={4} alignItems="center"
                        >
                            <Layers size={11} color={appTheme.colors.primary} />
                            <Text fontSize={11} fontWeight="900" color={appTheme.colors.primary}>
                                Chuyến {data.shipment_index}/{data.total_order_legs}
                            </Text>
                        </XStack>
                    </XStack>

                    <YStack padding={16} gap={10}>
                        <XStack alignItems="center" gap={10}>
                            <Package size={18} color={appTheme.colors.primary} />
                            <Text fontSize={16} fontWeight="900" color={appTheme.colors.text} flex={1}>
                                {data.cargo_name ?? 'Hàng hóa'}
                            </Text>
                        </XStack>

                        <XStack justifyContent="space-between" paddingTop={4}>
                            {data.cargo_weight_kg ? (
                                <YStack alignItems="center" flex={1} gap={3}>
                                    <XStack alignItems="center" gap={5}>
                                        <Weight size={13} color={appTheme.colors.primary} />
                                        <Text fontSize={16} fontWeight="900" color={appTheme.colors.primary}>
                                            {fmtWeight(data.cargo_weight_kg)}
                                        </Text>
                                    </XStack>
                                    <Text fontSize={11} color={appTheme.colors.textMuted}>Trọng lượng</Text>
                                </YStack>
                            ) : null}

                            {data.estimated_price ? (
                                <>
                                    <View style={{ width: 1, backgroundColor: appTheme.colors.border }} />
                                    <YStack alignItems="center" flex={1} gap={3}>
                                        <Text fontSize={13} fontWeight="900" color={appTheme.colors.text}
                                            numberOfLines={1} adjustsFontSizeToFit>
                                            {money(data.estimated_price)}
                                        </Text>
                                        <Text fontSize={11} color={appTheme.colors.textMuted}>Giá trị</Text>
                                    </YStack>
                                </>
                            ) : null}
                        </XStack>

                        {data.payment_type ? (
                            <XStack padding={10} borderRadius={10}
                                backgroundColor={appTheme.colors.surfaceSoft}
                                borderWidth={1} borderColor={appTheme.colors.border}
                                alignItems="center" justifyContent="space-between"
                            >
                                <Text fontSize={12} color={appTheme.colors.textMuted}>Thanh toán</Text>
                                <Text fontSize={12} fontWeight="800" color={appTheme.colors.text}>{data.payment_type}</Text>
                            </XStack>
                        ) : null}

                        {data.order_notes ? (
                            <XStack padding={10} borderRadius={10}
                                backgroundColor={appTheme.colors.surfaceSoft}
                                borderWidth={1} borderColor={appTheme.colors.border}>
                                <Text fontSize={12} color={appTheme.colors.textMuted} flex={1}>{data.order_notes}</Text>
                            </XStack>
                        ) : null}
                    </YStack>
                </YStack>

                {/* ── Route ── */}
                <YStack
                    borderRadius={appTheme.radius.lg} borderWidth={1}
                    borderColor={appTheme.colors.border} backgroundColor={appTheme.colors.surface}
                    overflow="hidden"
                >
                    <XStack paddingHorizontal={16} paddingVertical={11} backgroundColor={appTheme.colors.surfaceSoft}>
                        <Text fontSize={12} fontWeight="900" color={appTheme.colors.textMuted}>TUYẾN ĐƯỜNG</Text>
                    </XStack>
                    <YStack padding={14} gap={10}>
                        <XStack gap={10} alignItems="flex-start">
                            <XStack width={28} height={28} borderRadius={10}
                                backgroundColor={appTheme.colors.successSoft}
                                alignItems="center" justifyContent="center" marginTop={1}>
                                <MapPin size={14} color={appTheme.colors.success} />
                            </XStack>
                            <YStack flex={1} gap={1}>
                                <Text fontSize={11} color={appTheme.colors.textMuted} fontWeight="700">ĐIỂM LẤY HÀNG</Text>
                                <Text fontSize={13} color={appTheme.colors.text} lineHeight={18}>{data.pickup_address}</Text>
                            </YStack>
                        </XStack>
                        <XStack height={1} backgroundColor={appTheme.colors.border} marginLeft={38} />
                        <XStack gap={10} alignItems="flex-start">
                            <XStack width={28} height={28} borderRadius={10}
                                backgroundColor={appTheme.colors.primarySoft}
                                alignItems="center" justifyContent="center" marginTop={1}>
                                <MapPin size={14} color={appTheme.colors.primary} />
                            </XStack>
                            <YStack flex={1} gap={1}>
                                <Text fontSize={11} color={appTheme.colors.textMuted} fontWeight="700">ĐIỂM GIAO HÀNG</Text>
                                <Text fontSize={13} color={appTheme.colors.text} lineHeight={18}>{data.delivery_address}</Text>
                            </YStack>
                        </XStack>
                    </YStack>
                </YStack>

                {/* ── Notes ── */}
                {data.notes ? (
                    <XStack padding={14} borderRadius={appTheme.radius.lg}
                        backgroundColor={appTheme.colors.warningSoft}
                        borderWidth={1} borderColor={appTheme.colors.warningBorder}>
                        <Text fontSize={13} color={appTheme.colors.warningText} flex={1}>{data.notes}</Text>
                    </XStack>
                ) : null}
            </ScrollView>

            {/* ── Sticky claim button ── */}
            <View style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                paddingHorizontal: appTheme.spacing.screenX,
                paddingBottom: appTheme.spacing.screenBottom,
                paddingTop: 12,
                backgroundColor: appTheme.colors.surface,
                borderTopWidth: 1,
                borderTopColor: appTheme.colors.border,
            }}>
                {hasActiveTrip ? (
                    <YStack gap={6}>
                        <LifecycleActionButton
                            label="Đang có chuyến khác"
                            tone="secondary"
                            onPress={() => {}}
                            disabled
                        />
                        <Text fontSize={11} color={appTheme.colors.textMuted} textAlign="center">
                            Hoàn thành chuyến hiện tại trước khi nhận chuyến mới
                        </Text>
                    </YStack>
                ) : (
                    <LifecycleActionButton
                        label={isClaiming ? 'Đang nhận...' : 'Nhận chuyến này'}
                        tone="primary"
                        onPress={handleClaim}
                        isLoading={isClaiming}
                    />
                )}
            </View>
        </View>
    );
}
