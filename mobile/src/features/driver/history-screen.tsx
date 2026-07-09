import { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { AlertTriangle, CheckCircle, ChevronRight, Clock, Package, XCircle } from 'lucide-react-native';
import { Text, XStack, YStack } from 'tamagui';

import { AppText } from '@/components/app-text';
import { PaginationBar } from '@/components/pagination-bar';
import { ScreenHeader } from '@/components/screen-header';
import { HistorySkeleton } from '@/components/skeleton';
import { TripStatusBadge } from '@/components/trip-status-badge';
import { appTheme } from '@/theme/app-theme';
import { useTripHistory } from '@/hooks/use-trip-history';
import type { OrderHistoryItem } from '@/types/trip';

const fmtDate = (iso: string | null) => {
    if (!iso) return null;
    const d = new Date(iso);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
};

const fmtCurrency = (v: string | null) =>
    v ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(v)) : null;

type Filter = 'all' | 'active' | 'completed' | 'cancelled';

const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all',       label: 'Tất cả' },
    { key: 'active',    label: 'Đang chạy' },
    { key: 'completed', label: 'Hoàn thành' },
    { key: 'cancelled', label: 'Đã hủy' },
];

// orders.derived_status: open | completed | cancelled | partial
// 'active' filter = orders chưa kết thúc (open / partial)
function applyFilter(orders: OrderHistoryItem[], f: Filter): OrderHistoryItem[] {
    if (f === 'all')       return orders;
    if (f === 'completed') return orders.filter(o => o.order_status === 'completed');
    if (f === 'cancelled') return orders.filter(o => o.order_status === 'cancelled');
    if (f === 'active')    return orders.filter(o => o.order_status !== 'completed' && o.order_status !== 'cancelled');
    return orders;
}

function OrderCard({ item }: { item: OrderHistoryItem }) {
    const isCompleted  = item.order_status === 'completed';
    const isCancelled  = item.order_status === 'cancelled';
    const progressText = `${item.completed_legs}/${item.total_legs} chuyến`;
    const dateLabel    = fmtDate(item.first_claimed_at ?? item.created_at);

    return (
        <Pressable
            onPress={() => router.push(`/order/${item.order_id}`)}
            style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
        >
            <YStack
                borderRadius={appTheme.radius.lg}
                borderWidth={1}
                borderColor={appTheme.colors.border}
                backgroundColor={appTheme.colors.surface}
                overflow="hidden"
                marginBottom={10}
            >
                <XStack
                    paddingHorizontal={14} paddingVertical={11}
                    backgroundColor={appTheme.colors.surfaceSoft}
                    alignItems="center" justifyContent="space-between"
                >
                    <XStack alignItems="center" gap={8}>
                        <Text fontSize={13} fontWeight="900" color={appTheme.colors.text}>
                            Đơn #{item.order_id}
                        </Text>
                        <TripStatusBadge status={item.order_status as any} />
                    </XStack>
                    <XStack alignItems="center" gap={6}>
                        <XStack
                            paddingHorizontal={8} paddingVertical={3}
                            borderRadius={8}
                            backgroundColor={isCompleted ? appTheme.colors.successSoft : appTheme.colors.primarySoft}
                        >
                            <Text fontSize={11} fontWeight="700"
                                color={isCompleted ? appTheme.colors.success : appTheme.colors.primary}>
                                {progressText}
                            </Text>
                        </XStack>
                        <ChevronRight size={16} color={appTheme.colors.textMuted} />
                    </XStack>
                </XStack>

                <YStack paddingHorizontal={14} paddingVertical={12} gap={10}>
                    <XStack alignItems="center" gap={8}>
                        <Package size={14} color={appTheme.colors.primary} />
                        <Text fontSize={13} fontWeight="800" color={appTheme.colors.text} flex={1} numberOfLines={1}>
                            {item.cargo_name ?? 'Hàng hóa'}
                        </Text>
                    </XStack>

                    <YStack gap={4}>
                        <XStack alignItems="center" gap={6}>
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: appTheme.colors.success }} />
                            <Text fontSize={12} color={appTheme.colors.textMuted} flex={1} numberOfLines={1}>
                                {item.pickup_address}
                            </Text>
                        </XStack>
                        <View style={{ width: 1.5, height: 10, backgroundColor: appTheme.colors.border, marginLeft: 3.25 }} />
                        <XStack alignItems="center" gap={6}>
                            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: appTheme.colors.primary }} />
                            <Text fontSize={12} color={appTheme.colors.textMuted} flex={1} numberOfLines={1}>
                                {item.delivery_address}
                            </Text>
                        </XStack>
                    </YStack>

                    <XStack justifyContent="space-between" alignItems="center">
                        <XStack alignItems="center" gap={5}>
                            <Clock size={12} color={appTheme.colors.textMuted} />
                            <Text fontSize={11} color={appTheme.colors.textMuted}>{dateLabel}</Text>
                        </XStack>
                        {item.total_estimated_price ? (
                            <Text fontSize={12} fontWeight="800" color={appTheme.colors.text}>
                                {fmtCurrency(item.total_estimated_price)}
                            </Text>
                        ) : null}
                    </XStack>
                </YStack>

                {isCompleted && item.last_completed_at ? (
                    <XStack
                        paddingHorizontal={14} paddingVertical={8}
                        backgroundColor={appTheme.colors.successSoft}
                        alignItems="center" gap={6}
                    >
                        <CheckCircle size={13} color={appTheme.colors.success} />
                        <Text fontSize={11} fontWeight="700" color={appTheme.colors.success}>
                            Hoàn thành lúc {fmtDate(item.last_completed_at)}
                        </Text>
                    </XStack>
                ) : isCancelled ? (
                    <XStack
                        paddingHorizontal={14} paddingVertical={8}
                        backgroundColor="#fee2e2"
                        alignItems="center" gap={6}
                    >
                        <XCircle size={13} color={appTheme.colors.danger} />
                        <Text fontSize={11} fontWeight="700" color={appTheme.colors.danger}>Đơn hàng đã hủy</Text>
                    </XStack>
                ) : null}
            </YStack>
        </Pressable>
    );
}

function Empty({ filter }: { filter: Filter }) {
    const msg = filter === 'completed' ? 'Chưa có đơn hoàn thành'
        : filter === 'active'    ? 'Không có đơn đang chạy'
        : filter === 'cancelled' ? 'Không có đơn đã hủy'
        : 'Chưa có lịch sử đơn hàng';
    return (
        <YStack flex={1} alignItems="center" justifyContent="center" paddingVertical={80} gap={10}>
            <View style={{
                width: 64, height: 64, borderRadius: 24,
                backgroundColor: appTheme.colors.surfaceSoft,
                alignItems: 'center', justifyContent: 'center',
            }}>
                <Clock size={28} color={appTheme.colors.textMuted} />
            </View>
            <AppText variant="bodyStrong" tone="muted">{msg}</AppText>
            <AppText variant="caption" tone="muted">Kéo xuống để làm mới</AppText>
        </YStack>
    );
}

export function HistoryScreen() {
    const { orders, page, totalPages, total, isLoading, error, refresh, goToPage } = useTripHistory();
    const [filter, setFilter] = useState<Filter>('all');
    const listRef = useRef<FlatList>(null);
    const filtered = applyFilter(orders, filter);

    const handlePageChange = useCallback((p: number) => {
        listRef.current?.scrollToOffset({ offset: 0, animated: false });
        void goToPage(p);
        setFilter('all');
    }, [goToPage]);

    return (
        <View style={{ flex: 1, backgroundColor: appTheme.colors.background }}>
            <ScreenHeader title="Lịch sử đơn hàng" />

            <XStack
                paddingHorizontal={appTheme.spacing.screenX}
                paddingVertical={10}
                gap={8}
                backgroundColor={appTheme.colors.surface}
                borderBottomWidth={1}
                borderBottomColor={appTheme.colors.border}
            >
                {FILTERS.map(f => (
                    <Pressable key={f.key} onPress={() => setFilter(f.key)}>
                        <View style={{
                            paddingHorizontal: 14, paddingVertical: 7,
                            borderRadius: 20,
                            backgroundColor: filter === f.key ? appTheme.colors.primary : appTheme.colors.surfaceSoft,
                        }}>
                            <Text
                                fontSize={12} fontWeight="700"
                                color={filter === f.key ? '#fff' : appTheme.colors.textMuted}
                            >
                                {f.label}
                            </Text>
                        </View>
                    </Pressable>
                ))}
                {total > 0 ? (
                    <XStack flex={1} justifyContent="flex-end" alignItems="center">
                        <Text fontSize={11} color={appTheme.colors.textMuted}>
                            {total} đơn
                        </Text>
                    </XStack>
                ) : null}
            </XStack>

            {error ? (
                <XStack
                    paddingHorizontal={appTheme.spacing.screenX}
                    paddingVertical={12}
                    gap={10}
                    backgroundColor="#fee2e2"
                    borderBottomWidth={1}
                    borderBottomColor="#fca5a5"
                    alignItems="flex-start"
                >
                    <AlertTriangle size={16} color={appTheme.colors.danger} style={{ marginTop: 1 }} />
                    <YStack flex={1} gap={2}>
                        <Text fontSize={13} fontWeight="800" color={appTheme.colors.danger}>Lỗi tải dữ liệu</Text>
                        <Text fontSize={12} color={appTheme.colors.danger}>{error}</Text>
                    </YStack>
                    <Pressable onPress={refresh} hitSlop={8}>
                        <Text fontSize={12} fontWeight="700" color={appTheme.colors.danger}>Thử lại</Text>
                    </Pressable>
                </XStack>
            ) : null}

            <FlatList
                ref={listRef}
                data={filtered}
                keyExtractor={item => String(item.order_id)}
                renderItem={({ item }) => <OrderCard item={item} />}
                contentContainerStyle={{
                    paddingHorizontal: appTheme.spacing.screenX,
                    paddingTop: 14,
                    paddingBottom: appTheme.spacing.screenBottom,
                    flexGrow: 1,
                }}
                refreshControl={
                    <RefreshControl
                        refreshing={isLoading}
                        onRefresh={refresh}
                        tintColor={appTheme.colors.primary}
                    />
                }
                ListEmptyComponent={isLoading ? <HistorySkeleton /> : <Empty filter={filter} />}
            />

            <PaginationBar
                page={page}
                totalPages={totalPages}
                total={total}
                totalLabel="đơn hàng"
                onPrev={() => handlePageChange(page - 1)}
                onNext={() => handlePageChange(page + 1)}
                onPage={handlePageChange}
                disabled={isLoading}
            />
        </View>
    );
}

export default HistoryScreen;
