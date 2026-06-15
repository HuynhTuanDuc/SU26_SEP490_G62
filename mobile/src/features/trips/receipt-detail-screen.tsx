import { useEffect, useState } from 'react';
import {
    ActivityIndicator, ScrollView, StyleSheet, View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Receipt, MapPin, Truck, User, Ruler } from 'phosphor-react-native';
import { Text, XStack, YStack } from 'tamagui';

import { ScreenHeader } from '@/components/screen-header';
import { AppText }      from '@/components/app-text';
import { appTheme }     from '@/theme/app-theme';
import { tripService }  from '@/services/trip-service';
import type { DriverReceiptDetail, PaymentType } from '@/types/trip';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtMoney = (v: string | number | null | undefined) => {
    if (v === null || v === undefined || Number(v) === 0) return '—';
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(v));
};

const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('vi-VN', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
};

const PAYMENT_LABEL: Record<PaymentType, string> = {
    cash_collected: 'Tiền mặt (Driver thu)',
    bank_transfer:  'Chuyển khoản ngân hàng',
    client_credit:  'Ghi công nợ',
    qr_transfer:    'QR Code',
};

const PAYMENT_COLOR: Record<PaymentType, string> = {
    cash_collected: appTheme.colors.success,
    bank_transfer:  appTheme.colors.statusTransit,
    client_credit:  appTheme.colors.warning,
    qr_transfer:    appTheme.colors.primary,
};

// ─── Section divider ──────────────────────────────────────────────────────────

function Divider() {
    return <View style={styles.divider} />;
}

// ─── Row with label + value ───────────────────────────────────────────────────

function Row({ label, value, bold }: { label: string; value: string | null | undefined; bold?: boolean }) {
    if (!value) return null;
    return (
        <XStack justifyContent="space-between" alignItems="flex-start" gap={12} paddingVertical={3}>
            <Text fontSize={12} color={appTheme.colors.textMuted} flex={1}>{label}</Text>
            <Text
                fontSize={12}
                fontWeight={bold ? '700' : '400'}
                color={appTheme.colors.text}
                flex={2}
                textAlign="right"
                numberOfLines={3}
            >
                {value}
            </Text>
        </XStack>
    );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function ReceiptDetailScreen() {
    const { receiptId } = useLocalSearchParams<{ receiptId: string }>();
    const id = Number(receiptId);

    const [receipt,   setReceipt]   = useState<DriverReceiptDetail | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error,     setError]     = useState<string | null>(null);

    useEffect(() => {
        if (!id) { setError('ID phiếu thu không hợp lệ'); setIsLoading(false); return; }
        setIsLoading(true);
        tripService.getDriverReceiptDetail(id)
            .then(({ receipt: data }) => setReceipt(data))
            .catch((err) => setError(err instanceof Error ? err.message : 'Không thể tải phiếu thu'))
            .finally(() => setIsLoading(false));
    }, [id]);

    if (isLoading) {
        return (
            <View style={{ flex: 1, backgroundColor: appTheme.colors.background }}>
                <ScreenHeader title="Chi tiết phiếu thu" showBack />
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={appTheme.colors.primary} />
                </View>
            </View>
        );
    }

    if (error || !receipt) {
        return (
            <View style={{ flex: 1, backgroundColor: appTheme.colors.background }}>
                <ScreenHeader title="Chi tiết phiếu thu" showBack />
                <View style={styles.center}>
                    <AppText variant="body" tone="muted" textAlign="center">
                        {error ?? 'Không tìm thấy phiếu thu'}
                    </AppText>
                </View>
            </View>
        );
    }

    const paymentColor = PAYMENT_COLOR[receipt.payment_type] ?? appTheme.colors.primary;
    const kmDisplay = receipt.actual_distance_km
        ? `${Number(receipt.actual_distance_km).toLocaleString('vi-VN')} km`
        : receipt.estimated_distance_km
            ? `${Number(receipt.estimated_distance_km).toLocaleString('vi-VN')} km (ước tính)`
            : null;

    return (
        <View style={{ flex: 1, backgroundColor: '#F0F4FF' }}>
            <ScreenHeader title="Phiếu thu" showBack />

            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

                {/* ── Phiếu thu card ─────────────────────────────────── */}
                <View style={styles.receiptCard}>

                    {/* Header */}
                    <YStack alignItems="center" gap={6} paddingBottom={16}>
                        <View style={[styles.receiptIconWrap, { backgroundColor: `${paymentColor}18` }]}>
                            <Receipt size={32} color={paymentColor} weight="fill" />
                        </View>
                        <Text fontSize={11} fontWeight="700" color={appTheme.colors.textMuted} letterSpacing={2}>
                            PHIẾU THU VẬN CHUYỂN
                        </Text>
                        <Text fontSize={13} color={appTheme.colors.textMuted}>
                            #{String(receipt.receipt_id).padStart(6, '0')} · {fmtDate(receipt.collected_at)}
                        </Text>
                    </YStack>

                    <Divider />

                    {/* Amount — large display */}
                    <YStack alignItems="center" paddingVertical={20} gap={6}>
                        <Text fontSize={11} fontWeight="700" color={appTheme.colors.textMuted} letterSpacing={1}>
                            SỐ TIỀN THANH TOÁN
                        </Text>
                        <Text fontSize={34} fontWeight="900" color={paymentColor}>
                            {fmtMoney(receipt.amount)}
                        </Text>
                        <View style={[styles.paymentBadge, { backgroundColor: `${paymentColor}18` }]}>
                            <Text fontSize={12} fontWeight="700" color={paymentColor}>
                                {PAYMENT_LABEL[receipt.payment_type] ?? receipt.payment_type}
                            </Text>
                        </View>
                    </YStack>

                    <Divider />

                    {/* Customer info */}
                    <YStack gap={6} paddingVertical={14}>
                        <XStack gap={6} alignItems="center" paddingBottom={4}>
                            <User size={14} color={appTheme.colors.primary} weight="fill" />
                            <Text fontSize={11} fontWeight="900" color={appTheme.colors.primary} letterSpacing={0.5}>
                                KHÁCH HÀNG
                            </Text>
                        </XStack>
                        <Row label="Tên"          value={receipt.customer_name} bold />
                        <Row label="Công ty"      value={receipt.customer_company} />
                        <Row label="Điện thoại"   value={receipt.customer_phone} />
                        <Row label="Địa chỉ"      value={receipt.customer_address} />
                    </YStack>

                    <Divider />

                    {/* Order + route */}
                    <YStack gap={6} paddingVertical={14}>
                        <XStack gap={6} alignItems="center" paddingBottom={4}>
                            <MapPin size={14} color={appTheme.colors.primary} weight="fill" />
                            <Text fontSize={11} fontWeight="900" color={appTheme.colors.primary} letterSpacing={0.5}>
                                ĐƠN HÀNG #{receipt.order_id}
                            </Text>
                        </XStack>
                        <Row label="Hàng hóa"     value={receipt.cargo_name} bold />
                        {receipt.cargo_weight_kg ? (
                            <Row label="Khối lượng" value={`${receipt.cargo_weight_kg} kg`} />
                        ) : null}
                        <Row label="Điểm lấy hàng"  value={receipt.pickup_address} />
                        <Row label="Điểm giao hàng" value={receipt.delivery_address} />
                        {kmDisplay ? (
                            <XStack justifyContent="space-between" alignItems="center" paddingVertical={3}>
                                <XStack gap={4} alignItems="center">
                                    <Ruler size={12} color={appTheme.colors.textMuted} />
                                    <Text fontSize={12} color={appTheme.colors.textMuted}>Quãng đường</Text>
                                </XStack>
                                <Text fontSize={12} fontWeight="700" color={appTheme.colors.text}>
                                    {kmDisplay}
                                </Text>
                            </XStack>
                        ) : null}
                    </YStack>

                    <Divider />

                    {/* Vehicle + driver */}
                    <YStack gap={6} paddingVertical={14}>
                        <XStack gap={6} alignItems="center" paddingBottom={4}>
                            <Truck size={14} color={appTheme.colors.primary} weight="fill" />
                            <Text fontSize={11} fontWeight="900" color={appTheme.colors.primary} letterSpacing={0.5}>
                                TÀI XẾ & XE
                            </Text>
                        </XStack>
                        <Row label="Tài xế"       value={receipt.driver_name} bold />
                        <Row label="Điện thoại"   value={receipt.driver_phone} />
                        <Row label="Biển số"       value={receipt.plate_number} />
                        <Row label="Phụ trách"     value={receipt.coordinator_name} />
                    </YStack>

                    {receipt.notes ? (
                        <>
                            <Divider />
                            <YStack gap={4} paddingVertical={12}>
                                <Text fontSize={11} fontWeight="700" color={appTheme.colors.textMuted}>GHI CHÚ</Text>
                                <Text fontSize={12} color={appTheme.colors.text} lineHeight={18}>
                                    {receipt.notes}
                                </Text>
                            </YStack>
                        </>
                    ) : null}

                    {/* Footer */}
                    <View style={styles.footer}>
                        <Text fontSize={10} color={appTheme.colors.textMuted} textAlign="center">
                            Phiếu thu hợp lệ — phát hành bởi hệ thống quản lý vận tải
                        </Text>
                    </View>
                </View>

            </ScrollView>
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    scroll: {
        padding: 16,
        paddingBottom: 40,
    },
    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    receiptCard: {
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 20,
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 4 },
        elevation: 6,
    },
    receiptIconWrap: {
        width: 64,
        height: 64,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    divider: {
        height: 1,
        backgroundColor: appTheme.colors.border,
        marginVertical: 2,
    },
    paymentBadge: {
        paddingHorizontal: 14,
        paddingVertical: 5,
        borderRadius: 999,
    },
    footer: {
        marginTop: 16,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: appTheme.colors.border,
        borderStyle: 'dashed',
    },
});
