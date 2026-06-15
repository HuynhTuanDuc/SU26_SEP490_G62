import { useCallback, useState } from 'react';
import {
    ActivityIndicator, FlatList, Pressable, RefreshControl,
    StyleSheet, View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Receipt, ArrowRight, Buildings, User } from 'phosphor-react-native';
import { Text, XStack, YStack } from 'tamagui';

import { ScreenHeader }  from '@/components/screen-header';
import { AppText }       from '@/components/app-text';
import { appTheme }      from '@/theme/app-theme';
import { tripService }   from '@/services/trip-service';
import type { DriverReceiptSummary, PaymentType } from '@/types/trip';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtMoney = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return '—';
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(v));
};

const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const PAYMENT_LABEL: Record<PaymentType, string> = {
    cash_collected: 'Tiền mặt',
    bank_transfer:  'Chuyển khoản',
    client_credit:  'Công nợ',
    qr_transfer:    'QR Code',
};

const PAYMENT_COLOR: Record<PaymentType, string> = {
    cash_collected: appTheme.colors.success,
    bank_transfer:  appTheme.colors.statusTransit,
    client_credit:  appTheme.colors.warning,
    qr_transfer:    appTheme.colors.primary,
};

// ─── Receipt card ─────────────────────────────────────────────────────────────

function ReceiptCard({ item }: { item: DriverReceiptSummary }) {
    const paymentColor = PAYMENT_COLOR[item.payment_type] ?? appTheme.colors.textMuted;

    return (
        <Pressable
            onPress={() => router.push(`/receipt-detail?receiptId=${item.receipt_id}`)}
            style={styles.card}
        >
            <XStack alignItems="flex-start" gap={12}>
                {/* Icon */}
                <View style={[styles.iconWrap, { backgroundColor: `${paymentColor}18` }]}>
                    <Receipt size={22} color={paymentColor} weight="fill" />
                </View>

                {/* Content */}
                <YStack flex={1} gap={5}>
                    <XStack justifyContent="space-between" alignItems="center">
                        <Text fontSize={13} fontWeight="700" color={appTheme.colors.text}>
                            Đơn #{item.order_id}
                        </Text>
                        <Text fontSize={15} fontWeight="900" color={paymentColor}>
                            {fmtMoney(item.amount)}
                        </Text>
                    </XStack>

                    {item.cargo_name ? (
                        <Text fontSize={12} color={appTheme.colors.textMuted} numberOfLines={1}>
                            {item.cargo_name}
                        </Text>
                    ) : null}

                    <XStack gap={6} alignItems="center">
                        {item.customer_company ? (
                            <XStack gap={4} alignItems="center" flex={1}>
                                <Buildings size={12} color={appTheme.colors.textMuted} />
                                <Text fontSize={11} color={appTheme.colors.textMuted} numberOfLines={1} flex={1}>
                                    {item.customer_company}
                                </Text>
                            </XStack>
                        ) : item.customer_name ? (
                            <XStack gap={4} alignItems="center" flex={1}>
                                <User size={12} color={appTheme.colors.textMuted} />
                                <Text fontSize={11} color={appTheme.colors.textMuted} numberOfLines={1} flex={1}>
                                    {item.customer_name}
                                </Text>
                            </XStack>
                        ) : null}
                    </XStack>

                    <XStack justifyContent="space-between" alignItems="center">
                        <View style={[styles.badge, { backgroundColor: `${paymentColor}18` }]}>
                            <Text fontSize={10} fontWeight="700" color={paymentColor}>
                                {PAYMENT_LABEL[item.payment_type] ?? item.payment_type}
                            </Text>
                        </View>
                        <Text fontSize={11} color={appTheme.colors.textMuted}>
                            {fmtDate(item.collected_at)}
                        </Text>
                    </XStack>
                </YStack>

                <ArrowRight size={16} color={appTheme.colors.textMuted} style={{ marginTop: 2 }} />
            </XStack>
        </Pressable>
    );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function ReceiptsListScreen() {
    const [receipts,    setReceipts]    = useState<DriverReceiptSummary[]>([]);
    const [isLoading,   setIsLoading]   = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const load = useCallback(async (refresh = false) => {
        if (refresh) setIsRefreshing(true);
        else         setIsLoading(true);
        try {
            const { receipts: data } = await tripService.getDriverReceipts();
            setReceipts(data);
        } catch {
            // keep existing data on error
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, []);

    useFocusEffect(useCallback(() => { void load(); }, [load]));

    if (isLoading) {
        return (
            <View style={{ flex: 1, backgroundColor: appTheme.colors.background }}>
                <ScreenHeader title="Phiếu thu" />
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={appTheme.colors.primary} />
                </View>
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: appTheme.colors.background }}>
            <ScreenHeader title="Phiếu thu" />

            <FlatList
                data={receipts}
                keyExtractor={(item) => String(item.receipt_id)}
                renderItem={({ item }) => <ReceiptCard item={item} />}
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
                    <YStack alignItems="center" gap={12} paddingVertical={60}>
                        <Receipt size={48} color={appTheme.colors.textMuted} weight="thin" />
                        <AppText variant="body" tone="muted" textAlign="center">
                            Chưa có phiếu thu nào được tạo.{'\n'}
                            Hoàn thành chuyến hàng để nhận phiếu thu từ coordinator.
                        </AppText>
                    </YStack>
                }
            />
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    list: {
        padding: 16,
        gap: 10,
    },
    emptyContainer: {
        flexGrow: 1,
        padding: 16,
    },
    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    card: {
        backgroundColor: appTheme.colors.surface,
        borderWidth: 1,
        borderColor: appTheme.colors.border,
        borderRadius: appTheme.radius.lg,
        padding: 14,
        marginBottom: 10,
    },
    iconWrap: {
        width: 44,
        height: 44,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    badge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
    },
});
