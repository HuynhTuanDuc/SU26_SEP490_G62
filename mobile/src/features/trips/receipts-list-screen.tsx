import { useCallback, useState } from 'react';
import {
    FlatList, Pressable, RefreshControl,
    StyleSheet, View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { ArrowRight, Buildings, Receipt, Truck, User, Warning } from 'phosphor-react-native';
import { Text, XStack, YStack } from 'tamagui';

import { ScreenHeader }       from '@/components/screen-header';
import { AppText }            from '@/components/app-text';
import { SimpleListSkeleton } from '@/components/skeleton';
import { appTheme }           from '@/theme/app-theme';
import { tripService }        from '@/services/trip-service';
import type { DriverReceiptSummary, ReceiptRequestStatus } from '@/types/trip';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtMoney = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return '—';
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(v));
};

const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });


// Tính badge dựa trên TOÀN BỘ trạng thái luồng
function getReceiptBadge(item: DriverReceiptSummary): { label: string; color: string; bg: string } {
    const s = item.request_status;
    if (s === 'rejected')   return { label: 'Bị từ chối',              color: '#DC2626', bg: '#FEE2E2' };
    if (s === 'pending')    return { label: 'Chờ coordinator duyệt',   color: '#B45309', bg: '#FEF3C7' };
    if (s === 'processing') return { label: 'Đang xử lý',              color: '#1D4ED8', bg: '#DBEAFE' };
    // approved — phân biệt driver đã xác nhận thanh toán chưa
    if (s === 'approved' && item.payment_type) {
        const map: Record<string, { label: string; color: string }> = {
            cash_collected: { label: 'Đã thu tiền mặt',    color: appTheme.colors.success },
            bank_transfer:  { label: 'Khách đã chuyển khoản', color: appTheme.colors.statusTransit },
            client_credit:  { label: 'Khách đang nợ',      color: appTheme.colors.warning },
            qr_transfer:    { label: 'Đã nhận QR',         color: appTheme.colors.primary },
        };
        const m = map[item.payment_type] ?? { label: 'Đã xác nhận', color: appTheme.colors.success };
        return { label: m.label, color: m.color, bg: `${m.color}18` };
    }
    if (s === 'approved')   return { label: 'Chờ xác nhận thanh toán', color: '#B45309', bg: '#FEF3C7' };
    // fallback (null / unknown)
    return { label: 'Chờ duyệt', color: '#B45309', bg: '#FEF3C7' };
}

// ─── Receipt card ─────────────────────────────────────────────────────────────

function ReceiptCard({ item }: { item: DriverReceiptSummary }) {
    const isRejected = item.request_status === 'rejected';
    const statusCfg  = getReceiptBadge(item);

    return (
        <Pressable
            onPress={() => router.push(`/receipt-detail?receiptId=${item.receipt_id}`)}
            style={({ pressed }) => [
                styles.card,
                isRejected && styles.cardRejected,
                pressed && { opacity: 0.85 },
            ]}
        >
            {/* Rejected highlight bar */}
            {isRejected ? <View style={styles.rejectedBar} /> : null}

            <XStack alignItems="flex-start" gap={12}>
                {/* Icon */}
                <View style={[styles.iconWrap, { backgroundColor: `${statusCfg.color}18` }]}>
                    {isRejected
                        ? <Warning size={22} color="#DC2626" weight="fill" />
                        : <Receipt size={22} color={statusCfg.color} weight="fill" />}
                </View>

                {/* Content */}
                <YStack flex={1} gap={5}>
                    <XStack justifyContent="space-between" alignItems="center">
                        <Text fontSize={13} fontWeight="700" color={appTheme.colors.text}>
                            Đơn #{item.order_id}
                        </Text>
                        <Text fontSize={15} fontWeight="900" color={statusCfg.color}>
                            {fmtMoney(item.amount)}
                        </Text>
                    </XStack>

                    {item.cargo_name ? (
                        <Text fontSize={12} color={appTheme.colors.textMuted} numberOfLines={1}>
                            {item.cargo_name}
                        </Text>
                    ) : null}

                    {item.customer_company || item.customer_name ? (
                        <XStack gap={4} alignItems="center">
                            {item.customer_company
                                ? <Buildings size={12} color={appTheme.colors.textMuted} />
                                : <User size={12} color={appTheme.colors.textMuted} />}
                            <Text fontSize={11} color={appTheme.colors.textMuted} numberOfLines={1} flex={1}>
                                {item.customer_company ?? item.customer_name}
                            </Text>
                        </XStack>
                    ) : null}

                    {/* Rejection reason preview */}
                    {isRejected && item.rejection_reason ? (
                        <Text fontSize={11} color="#DC2626" numberOfLines={1} opacity={0.85}>
                            Lý do: {item.rejection_reason}
                        </Text>
                    ) : null}

                    <XStack justifyContent="space-between" alignItems="center">
                        {/* Status badge */}
                        <View style={[styles.badge, { backgroundColor: statusCfg.bg }]}>
                            <Text fontSize={10} fontWeight="700" color={statusCfg.color}>
                                {statusCfg.label}
                            </Text>
                        </View>

                        <XStack alignItems="center" gap={6}>
                            {/* Payment type badge (chỉ khi approved) */}
                            {item.request_status === 'approved' && item.payment_type ? (
                                <View style={[styles.badge, { backgroundColor: `${paymentColor}18` }]}>
                                    <Text fontSize={10} fontWeight="700" color={paymentColor}>
                                        {PAYMENT_LABEL[item.payment_type]}
                                    </Text>
                                </View>
                            ) : null}
                            <Text fontSize={11} color={appTheme.colors.textMuted}>
                                {fmtDate(item.collected_at)}
                            </Text>
                        </XStack>
                    </XStack>
                </YStack>

                <ArrowRight size={16} color={appTheme.colors.textMuted} style={{ marginTop: 2 }} />
            </XStack>
        </Pressable>
    );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function ReceiptsListScreen() {
    const [receipts,     setReceipts]     = useState<DriverReceiptSummary[]>([]);
    const [isLoading,    setIsLoading]    = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const load = useCallback(async (refresh = false) => {
        if (refresh) setIsRefreshing(true);
        else         setIsLoading(true);
        try {
            const { receipts: data } = await tripService.getDriverReceipts();
            // Rejected/pending trước, approved sau
            const sorted = [...data].sort((a, b) => {
                const priority: Record<ReceiptRequestStatus, number> = {
                    rejected: 0, pending: 1, processing: 2, approved: 3,
                };
                const pa = priority[a.request_status] ?? 9;
                const pb = priority[b.request_status] ?? 9;
                if (pa !== pb) return pa - pb;
                return new Date(b.collected_at).getTime() - new Date(a.collected_at).getTime();
            });
            setReceipts(sorted);
        } catch {
            // keep existing on error
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, []);

    useFocusEffect(useCallback(() => { void load(); }, [load]));

    const rejectedCount = receipts.filter(r => r.request_status === 'rejected').length;

    if (isLoading) {
        return (
            <View style={{ flex: 1, backgroundColor: appTheme.colors.background }}>
                <ScreenHeader title="Phiếu thu" />
                <View style={styles.list}><SimpleListSkeleton count={5} /></View>
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: appTheme.colors.background }}>
            <ScreenHeader title="Phiếu thu" />

            {/* Banner cảnh báo có yêu cầu bị từ chối */}
            {rejectedCount > 0 ? (
                <View style={styles.warnBanner}>
                    <Warning size={14} color="#92400E" weight="fill" />
                    <Text fontSize={12} fontWeight="700" color="#92400E" flex={1}>
                        Bạn có {rejectedCount} yêu cầu bị từ chối — nhấn vào để xem và gửi lại.
                    </Text>
                </View>
            ) : null}

            <FlatList
                data={receipts}
                keyExtractor={(item) => `${item.request_status}-${item.receipt_id}`}
                renderItem={({ item }) => <ReceiptCard item={item} />}
                ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
                contentContainerStyle={receipts.length === 0 ? styles.emptyContainer : styles.list}
                refreshControl={
                    <RefreshControl
                        refreshing={isRefreshing}
                        onRefresh={() => void load(true)}
                        colors={[appTheme.colors.primary]}
                        tintColor={appTheme.colors.primary}
                    />
                }
                ListEmptyComponent={
                    <YStack alignItems="center" gap={16} paddingVertical={60} paddingHorizontal={24}>
                        <View style={styles.emptyIcon}>
                            <Receipt size={40} color={appTheme.colors.textMuted} weight="thin" />
                        </View>
                        <YStack gap={6} alignItems="center">
                            <Text fontSize={15} fontWeight="700" color={appTheme.colors.text}>
                                Chưa có phiếu thu
                            </Text>
                            <AppText variant="caption" tone="muted" textAlign="center">
                                Hoàn thành chuyến hàng thu tiền mặt{'\n'}để nhận phiếu thu từ coordinator.
                            </AppText>
                        </YStack>
                        <Pressable style={styles.emptyBtn} onPress={() => router.push('/(tabs)/history')}>
                            <XStack gap={8} alignItems="center">
                                <Truck size={16} color={appTheme.colors.primary} />
                                <Text fontSize={13} fontWeight="700" color={appTheme.colors.primary}>
                                    Xem lịch sử chuyến
                                </Text>
                            </XStack>
                        </Pressable>
                    </YStack>
                }
            />
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    list:           { padding: 16 },
    emptyContainer: { flexGrow: 1, padding: 16 },
    warnBanner:     {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: '#FEF3C7',
        paddingHorizontal: 16, paddingVertical: 10,
        borderBottomWidth: 1, borderBottomColor: '#FDE68A',
    },
    card: {
        backgroundColor: appTheme.colors.surface,
        borderWidth: 1, borderColor: appTheme.colors.border,
        borderRadius: appTheme.radius.lg,
        padding: 14, overflow: 'hidden',
    },
    cardRejected:   { borderColor: '#FECACA', backgroundColor: '#FFFAFA' },
    rejectedBar:    { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: '#DC2626' },
    iconWrap:       { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    badge:          { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
    emptyIcon:      {
        width: 80, height: 80, borderRadius: 24,
        backgroundColor: appTheme.colors.surfaceSoft,
        alignItems: 'center', justifyContent: 'center',
    },
    emptyBtn:       {
        paddingHorizontal: 24, paddingVertical: 12,
        borderRadius: appTheme.radius.lg, borderWidth: 1.5,
        borderColor: appTheme.colors.primary,
        backgroundColor: `${appTheme.colors.primary}10`,
    },
});
