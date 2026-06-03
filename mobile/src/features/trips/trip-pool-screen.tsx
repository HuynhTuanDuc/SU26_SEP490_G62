import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AlertTriangle, Inbox } from 'lucide-react-native';
import { Text, XStack, YStack } from 'tamagui';

import { AppText } from '@/components/app-text';
import { ScreenHeader } from '@/components/screen-header';
import { TripPoolSkeleton } from '@/components/skeleton';
import { TripCard } from '@/components/trip-card';
import { VehicleGroupFilter } from '@/components/vehicle-group-filter';
import { appTheme } from '@/theme/app-theme';
import type { TripPoolItem } from '@/types/trip';
import { useActiveTrip } from '@/hooks/use-active-trip';
import { useClaimTrip } from '@/hooks/use-claim-trip';
import { useTripPool } from '@/hooks/use-trip-pool';
import { useConfirm, useToast } from '@/providers/ui-provider';

export function TripPoolScreen() {
    const {
        trips,
        totalCount,
        vehicleGroups,
        groupFilter,
        setGroupFilter,
        isLoading,
        isLoadingMore,
        hasMore,
        refresh,
        loadMore,
        removeOrder,
    } = useTripPool();

    const { trip: activeTrip } = useActiveTrip();
    const hasActiveTrip = activeTrip !== null;

    const [claimingId, setClaimingId] = useState<number | null>(null);
    const { showConfirm } = useConfirm();
    const { showToast }   = useToast();
    const { claim }       = useClaimTrip();

    const handleClaim = useCallback(
        async (trip: TripPoolItem) => {
            if (hasActiveTrip) {
                showToast({ type: 'warning', message: 'Bạn đang có đơn hàng đang thực hiện' });
                return;
            }
            if (claimingId !== null) return; // block nếu đang xử lý claim khác

            const ok = await showConfirm({
                title:        'Nhận đơn hàng',
                message:      `Đơn #${trip.order_id} — ${trip.total_legs} chuyến\n${trip.pickup_address} → ${trip.delivery_address}`,
                confirmLabel: 'Nhận đơn hàng',
            });
            if (!ok) return;

            // Xóa ngay khỏi danh sách (optimistic) trước khi gọi API
            removeOrder(trip.order_id);
            setClaimingId(trip.order_id);

            const result = await claim(trip.order_id);
            setClaimingId(null);

            if (result.ok) {
                showToast({ type: 'success', message: `Đã nhận đơn hàng #${trip.order_id}` });
                router.push('/active-trip');
            } else if (result.alreadyClaimed) {
                showToast({ type: 'warning', message: 'Đơn hàng này đã được tài xế khác nhận' });
                refresh(false); // sync lại, không hiện spinner
            } else {
                showToast({ type: 'error', message: result.message });
                refresh(false);
            }
        },
        [hasActiveTrip, claimingId, claim, removeOrder, refresh, showConfirm, showToast],
    );

    const filterLabel = groupFilter !== null
        ? (vehicleGroups.find((g) => g.id === groupFilter)?.name ?? '')
        : null;

    const countLabel = isLoading && trips.length === 0
        ? null
        : filterLabel
            ? `${totalCount} đơn — ${filterLabel}`
            : `${totalCount} đơn hàng`;

    return (
        <View style={{ flex: 1, backgroundColor: appTheme.colors.background }}>
            <StatusBar style="dark" />
            <ScreenHeader title="Đơn hàng có sẵn" showBack />

            {/* Filter chips */}
            <View style={{ paddingTop: 12, paddingBottom: 4 }}>
                <VehicleGroupFilter
                    groups={vehicleGroups}
                    selected={groupFilter}
                    onSelect={setGroupFilter}
                />
            </View>

            <ScrollView
                style={{ flex: 1 }}
                scrollEventThrottle={200}
                onScroll={({ nativeEvent }) => {
                    const distanceFromBottom = nativeEvent.contentSize.height
                        - nativeEvent.layoutMeasurement.height
                        - nativeEvent.contentOffset.y;
                    if (distanceFromBottom < 220 && hasMore) loadMore();
                }}
                contentContainerStyle={{
                    paddingHorizontal: appTheme.spacing.screenX,
                    paddingTop: 10,
                    paddingBottom: appTheme.spacing.screenBottom,
                    gap: 14,
                }}
                refreshControl={
                    <RefreshControl
                        refreshing={isLoading}
                        onRefresh={() => refresh(true)}
                        tintColor={appTheme.colors.primary}
                    />
                }
            >
                {/* Count label */}
                {countLabel ? (
                    <AppText variant="caption" tone="muted">{countLabel}</AppText>
                ) : null}

                {/* Active trip warning banner */}
                {hasActiveTrip ? (
                    <XStack
                        padding={12}
                        borderRadius={appTheme.radius.sm}
                        backgroundColor={appTheme.colors.warningSoft}
                        borderWidth={1}
                        borderColor={appTheme.colors.warningBorder}
                        gap={8}
                        alignItems="center"
                    >
                        <AlertTriangle size={16} color={appTheme.colors.warningText} />
                        <YStack flex={1}>
                            <Text fontSize={12} fontWeight="900" color={appTheme.colors.warningText}>
                                Bạn đang có đơn hàng đang thực hiện
                            </Text>
                            <Text fontSize={11} color={appTheme.colors.warningTextMuted}>
                                Hoàn thành tất cả chuyến trong đơn để nhận đơn mới
                            </Text>
                        </YStack>
                    </XStack>
                ) : null}

                {/* Skeleton — first load */}
                {isLoading && trips.length === 0 ? <TripPoolSkeleton /> : null}

                {/* Empty state */}
                {!isLoading && trips.length === 0 ? (
                    <YStack alignItems="center" justifyContent="center" paddingVertical={64} gap={12}>
                        <XStack
                            width={64} height={64} borderRadius={24}
                            backgroundColor={appTheme.colors.surfaceSoft}
                            alignItems="center" justifyContent="center"
                        >
                            <Inbox size={30} color={appTheme.colors.textMuted} />
                        </XStack>
                        <YStack alignItems="center" gap={4}>
                            <AppText variant="bodyStrong" tone="muted">
                                {filterLabel ? `Không có đơn cho "${filterLabel}"` : 'Chưa có chuyến nào'}
                            </AppText>
                            <AppText variant="caption" tone="muted">Kéo để làm mới danh sách</AppText>
                        </YStack>
                    </YStack>
                ) : null}

                {/* Trip cards */}
                {trips.map((trip) => (
                    <TripCard
                        key={trip.order_id}
                        trip={trip}
                        onPress={() => router.push(`/pool-order/${trip.order_id}`)}
                        onClaim={() => handleClaim(trip)}
                        isClaimLoading={claimingId === trip.order_id}
                        claimDisabled={hasActiveTrip || claimingId !== null}
                    />
                ))}

                {isLoadingMore ? (
                    <XStack alignItems="center" justifyContent="center" gap={8} paddingVertical={12}>
                        <ActivityIndicator color={appTheme.colors.primary} />
                        <AppText variant="caption" tone="muted">Đang tải thêm...</AppText>
                    </XStack>
                ) : null}
            </ScrollView>
        </View>
    );
}
