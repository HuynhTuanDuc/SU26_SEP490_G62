import { Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import {
    Camera, CheckCircle, ChevronRight, Clock, MapPin,
    Package, RotateCcw, X, XCircle,
} from 'lucide-react-native';
import { Text, XStack, YStack } from 'tamagui';

import { AppText } from '@/components/app-text';
import { OrderDetailSkeleton } from '@/components/skeleton';
import { ScreenHeader } from '@/components/screen-header';
import { TripStatusBadge } from '@/components/trip-status-badge';
import { appTheme } from '@/theme/app-theme';
import { useOrderDetail } from '@/hooks/use-order-detail';
import type { ShipmentWithPhotos, TripStatus } from '@/types/trip';
import { TRIP_STATUS_LABEL } from '@/types/trip';
import { useState } from 'react';

const fmtDate = (iso: string | null) => {
    if (!iso) return null;
    const d = new Date(iso);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
};

const fmtCurrency = (v: string | null) =>
    v ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(v)) : null;

function PhotoViewer({ uri, onClose }: { uri: string; onClose: () => void }) {
    return (
        <Modal visible transparent animationType="fade" onRequestClose={onClose}>
            <View style={pv.overlay}>
                <Pressable style={pv.closeBtn} onPress={onClose} hitSlop={12}>
                    <X size={22} color="#fff" />
                </Pressable>
                <Image source={{ uri }} style={pv.image} resizeMode="contain" />
            </View>
        </Modal>
    );
}

const TIMELINE_STEPS: { key: keyof ShipmentWithPhotos; label: string }[] = [
    { key: 'claimed_at',   label: 'Đã nhận đơn' },
    { key: 'picking_at',   label: 'Bắt đầu lấy hàng' },
    { key: 'transit_at',   label: 'Đang vận chuyển' },
    { key: 'arrived_at',   label: 'Đã đến nơi' },
    { key: 'completed_at', label: 'Hoàn thành' },
    { key: 'cancelled_at', label: 'Hủy giao hàng' },
];

function ShipmentCard({
    shipment,
    maxIndex,
    onPhotoPress,
}: {
    shipment: ShipmentWithPhotos;
    maxIndex: number;
    onPhotoPress: (uri: string) => void;
}) {
    const isFinal     = shipment.shipment_index === maxIndex;
    const isCompleted = shipment.status === 'completed';
    const isCancelled = shipment.status === 'cancelled';

    const statusAccent = isCompleted
        ? { bg: appTheme.colors.successSoft, text: appTheme.colors.success, border: '#a7f3d0' }
        : isCancelled
        ? { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa' }
        : { bg: appTheme.colors.primarySoft, text: appTheme.colors.primary, border: appTheme.colors.primaryMuted };

    return (
        <YStack
            borderRadius={appTheme.radius.lg}
            borderWidth={1}
            borderColor={statusAccent.border}
            backgroundColor={appTheme.colors.surface}
            overflow="hidden"
        >
            {/* Card header */}
            <XStack
                paddingHorizontal={14} paddingVertical={11}
                backgroundColor={statusAccent.bg}
                alignItems="center" justifyContent="space-between"
            >
                <XStack alignItems="center" gap={8}>
                    <Text fontSize={13} fontWeight="900" color={statusAccent.text}>
                        Chuyến {shipment.shipment_index}/{maxIndex}
                    </Text>
                    {isFinal ? (
                        <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: appTheme.colors.primarySoft }}>
                            <Text fontSize={9} fontWeight="900" color={appTheme.colors.primary}>CUỐI</Text>
                        </View>
                    ) : null}
                </XStack>
                <TripStatusBadge status={shipment.status} />
            </XStack>

            <YStack padding={14} gap={12}>
                {/* Route */}
                <YStack gap={4}>
                    <XStack gap={8} alignItems="flex-start">
                        <XStack width={24} height={24} borderRadius={8} backgroundColor={appTheme.colors.successSoft}
                            alignItems="center" justifyContent="center" marginTop={1}>
                            <MapPin size={12} color={appTheme.colors.success} />
                        </XStack>
                        <YStack flex={1}>
                            <Text fontSize={10} fontWeight="700" color={appTheme.colors.textMuted}>LẤY HÀNG</Text>
                            <Text fontSize={12} color={appTheme.colors.text} lineHeight={17}>{shipment.pickup_address}</Text>
                        </YStack>
                    </XStack>
                    <View style={{ width: 1.5, height: 8, backgroundColor: appTheme.colors.border, marginLeft: 11 }} />
                    <XStack gap={8} alignItems="flex-start">
                        <XStack width={24} height={24} borderRadius={8} backgroundColor={appTheme.colors.primarySoft}
                            alignItems="center" justifyContent="center" marginTop={1}>
                            <MapPin size={12} color={appTheme.colors.primary} />
                        </XStack>
                        <YStack flex={1}>
                            <Text fontSize={10} fontWeight="700" color={appTheme.colors.textMuted}>GIAO HÀNG</Text>
                            <Text fontSize={12} color={appTheme.colors.text} lineHeight={17}>{shipment.delivery_address}</Text>
                        </YStack>
                    </XStack>
                </YStack>

                {/* Cancel reason */}
                {isCancelled && shipment.cancel_reason ? (
                    <XStack gap={8} padding={10} borderRadius={10}
                        backgroundColor="#fff7ed" borderWidth={1} borderColor="#fed7aa"
                        alignItems="flex-start"
                    >
                        <RotateCcw size={13} color="#c2410c" style={{ marginTop: 1 }} />
                        <YStack flex={1} gap={2}>
                            <Text fontSize={11} fontWeight="700" color="#c2410c">Lý do không giao được</Text>
                            <Text fontSize={12} color="#92400e" lineHeight={17}>{shipment.cancel_reason}</Text>
                        </YStack>
                    </XStack>
                ) : null}

                {/* Cargo + price */}
                <XStack justifyContent="space-between">
                    {shipment.cargo_weight_kg ? (
                        <Text fontSize={12} color={appTheme.colors.textMuted}>
                            Trọng lượng: <Text fontWeight="700" color={appTheme.colors.text}>{shipment.cargo_weight_kg} kg</Text>
                        </Text>
                    ) : null}
                    {shipment.estimated_price ? (
                        <Text fontSize={12} color={appTheme.colors.textMuted}>
                            Giá trị: <Text fontWeight="700" color={appTheme.colors.text}>{fmtCurrency(shipment.estimated_price)}</Text>
                        </Text>
                    ) : null}
                </XStack>

                {/* Timeline */}
                <YStack gap={0}>
                    <Text fontSize={11} fontWeight="900" color={appTheme.colors.textMuted} marginBottom={8}>
                        LỊCH SỬ TRẠNG THÁI
                    </Text>
                    {TIMELINE_STEPS.filter(s => shipment[s.key] !== null).map((step, idx, arr) => (
                        <XStack key={step.key} gap={10} alignItems="flex-start">
                            <YStack alignItems="center" width={18}>
                                <View style={{
                                    width: 10, height: 10, borderRadius: 5,
                                    backgroundColor: step.key === 'cancelled_at'
                                        ? '#c2410c'
                                        : step.key === 'completed_at'
                                        ? appTheme.colors.success
                                        : appTheme.colors.primary,
                                    marginTop: 2,
                                }} />
                                {idx < arr.length - 1 ? (
                                    <View style={{ width: 1.5, flex: 1, minHeight: 14, backgroundColor: appTheme.colors.border, marginTop: 2 }} />
                                ) : null}
                            </YStack>
                            <YStack flex={1} paddingBottom={idx < arr.length - 1 ? 10 : 0}>
                                <Text fontSize={12} fontWeight="700" color={appTheme.colors.text}>{step.label}</Text>
                                <Text fontSize={11} color={appTheme.colors.textMuted}>
                                    {fmtDate(shipment[step.key] as string)}
                                </Text>
                            </YStack>
                        </XStack>
                    ))}
                </YStack>

                {/* Receipt photos */}
                {shipment.receipt_urls.length > 0 ? (
                    <YStack gap={8}>
                        <XStack alignItems="center" gap={6}>
                            <Camera size={13} color={appTheme.colors.primary} />
                            <Text fontSize={11} fontWeight="900" color={appTheme.colors.textMuted}>
                                ẢNH BIÊN LAI ({shipment.receipt_urls.length})
                            </Text>
                        </XStack>
                        <XStack gap={8} flexWrap="wrap">
                            {shipment.receipt_urls.map((url, i) => (
                                <Pressable key={i} onPress={() => onPhotoPress(url)}>
                                    <Image source={{ uri: url }} style={styles.thumb} resizeMode="cover" />
                                    <View style={styles.thumbBadge}>
                                        <ChevronRight size={10} color="#fff" />
                                    </View>
                                </Pressable>
                            ))}
                        </XStack>
                    </YStack>
                ) : null}

                {/* Proof photo (final shipment) */}
                {isFinal && shipment.proof_url ? (
                    <YStack gap={8}>
                        <XStack alignItems="center" gap={6}>
                            <CheckCircle size={13} color={appTheme.colors.success} />
                            <Text fontSize={11} fontWeight="900" color={appTheme.colors.textMuted}>
                                ẢNH XÁC NHẬN HOÀN THÀNH
                            </Text>
                        </XStack>
                        <Pressable onPress={() => onPhotoPress(shipment.proof_url!)}>
                            <Image source={{ uri: shipment.proof_url }} style={styles.proofThumb} resizeMode="cover" />
                            <View style={styles.proofOverlay}>
                                <Text fontSize={11} fontWeight="700" color="#fff">Xem ảnh xác nhận</Text>
                            </View>
                        </Pressable>
                    </YStack>
                ) : null}
            </YStack>
        </YStack>
    );
}

export default function OrderDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const orderId = Number(id);
    const { data, isLoading, error } = useOrderDetail(orderId);
    const [viewPhoto, setViewPhoto] = useState<string | null>(null);

    const maxIndex = data ? Math.max(...data.shipments.map(s => s.shipment_index)) : 1;

    if (isLoading) {
        return (
            <View style={{ flex: 1, backgroundColor: appTheme.colors.background }}>
                <ScreenHeader title={`Đơn #${orderId}`} showBack />
                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{ paddingBottom: appTheme.spacing.screenBottom }}
                    scrollEnabled={false}
                >
                    <OrderDetailSkeleton />
                </ScrollView>
            </View>
        );
    }

    if (error || !data) {
        return (
            <View style={{ flex: 1, backgroundColor: appTheme.colors.background }}>
                <ScreenHeader title={`Đơn #${orderId}`} showBack />
                <YStack flex={1} alignItems="center" justifyContent="center" padding={24} gap={12}>
                    <XCircle size={36} color={appTheme.colors.danger} />
                    <AppText variant="bodyStrong" tone="muted">{error ?? 'Không tìm thấy đơn hàng'}</AppText>
                </YStack>
            </View>
        );
    }

    const { order, shipments } = data;
    const totalPrice = shipments.reduce((sum, s) => sum + (Number(s.estimated_price) || 0), 0);
    const completedLegs = shipments.filter(s => s.status === 'completed').length;

    return (
        <View style={{ flex: 1, backgroundColor: appTheme.colors.background }}>
            <ScreenHeader
                title={`Đơn #${order.id}`}
                showBack
                right={<TripStatusBadge status={order.status as TripStatus} />}
            />

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{
                    paddingHorizontal: appTheme.spacing.screenX,
                    paddingTop: 16,
                    paddingBottom: appTheme.spacing.screenBottom,
                    gap: 14,
                }}
            >
                {/* ── Order summary card ── */}
                <YStack
                    borderRadius={appTheme.radius.lg} borderWidth={1}
                    borderColor={appTheme.colors.border}
                    backgroundColor={appTheme.colors.surface}
                    overflow="hidden"
                >
                    <XStack paddingHorizontal={16} paddingVertical={11} backgroundColor={appTheme.colors.surfaceSoft}>
                        <Text fontSize={12} fontWeight="900" color={appTheme.colors.textMuted}>THÔNG TIN ĐƠN HÀNG</Text>
                    </XStack>
                    <YStack padding={16} gap={8}>
                        <XStack alignItems="center" gap={8}>
                            <Package size={16} color={appTheme.colors.primary} />
                            <Text fontSize={15} fontWeight="900" color={appTheme.colors.text} flex={1}>
                                {order.cargo_name ?? 'Hàng hóa'}
                            </Text>
                        </XStack>
                        <XStack justifyContent="space-between" paddingTop={4}>
                            <YStack alignItems="center" flex={1} gap={3}>
                                <Text fontSize={20} fontWeight="900" color={appTheme.colors.primary}>
                                    {completedLegs}/{shipments.length}
                                </Text>
                                <Text fontSize={11} color={appTheme.colors.textMuted}>Chuyến hoàn thành</Text>
                            </YStack>
                            <View style={{ width: 1, backgroundColor: appTheme.colors.border }} />
                            <YStack alignItems="center" flex={1} gap={3}>
                                <Text fontSize={15} fontWeight="900" color={appTheme.colors.text} numberOfLines={1} adjustsFontSizeToFit>
                                    {totalPrice > 0 ? fmtCurrency(String(totalPrice)) : '—'}
                                </Text>
                                <Text fontSize={11} color={appTheme.colors.textMuted}>Tổng giá trị</Text>
                            </YStack>
                            <View style={{ width: 1, backgroundColor: appTheme.colors.border }} />
                            <YStack alignItems="center" flex={1} gap={3}>
                                <Text fontSize={12} fontWeight="800" color={appTheme.colors.text} textAlign="center">
                                    {order.payment_type ?? '—'}
                                </Text>
                                <Text fontSize={11} color={appTheme.colors.textMuted}>Thanh toán</Text>
                            </YStack>
                        </XStack>
                        {order.notes ? (
                            <XStack
                                padding={10} borderRadius={10}
                                backgroundColor={appTheme.colors.surfaceSoft}
                                marginTop={4}
                            >
                                <Text fontSize={12} color={appTheme.colors.textMuted} flex={1}>{order.notes}</Text>
                            </XStack>
                        ) : null}
                    </YStack>
                </YStack>

                {/* ── Shipment cards ── */}
                <Text fontSize={12} fontWeight="900" color={appTheme.colors.textMuted}>
                    CÁC CHUYẾN VẬN CHUYỂN ({shipments.length})
                </Text>

                {shipments.map(s => (
                    <ShipmentCard
                        key={s.id}
                        shipment={s}
                        maxIndex={maxIndex}
                        onPhotoPress={setViewPhoto}
                    />
                ))}
            </ScrollView>

            {/* Full-screen photo viewer */}
            {viewPhoto ? (
                <PhotoViewer uri={viewPhoto} onClose={() => setViewPhoto(null)} />
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    thumb: {
        width: 88, height: 88, borderRadius: 10,
        borderWidth: 1, borderColor: appTheme.colors.border,
    },
    thumbBadge: {
        position: 'absolute', bottom: 4, right: 4,
        width: 18, height: 18, borderRadius: 9,
        backgroundColor: 'rgba(0,0,0,0.55)',
        alignItems: 'center', justifyContent: 'center',
    },
    proofThumb: {
        width: '100%', height: 160, borderRadius: 12,
        borderWidth: 1, borderColor: appTheme.colors.border,
    },
    proofOverlay: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        paddingVertical: 8, paddingHorizontal: 12,
        backgroundColor: 'rgba(0,0,0,0.45)',
        borderBottomLeftRadius: 12, borderBottomRightRadius: 12,
        alignItems: 'center',
    },
});

const pv = StyleSheet.create({
    overlay: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.92)',
        justifyContent: 'center', alignItems: 'center',
    },
    closeBtn: {
        position: 'absolute', top: 56, right: 20,
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.18)',
        alignItems: 'center', justifyContent: 'center',
        zIndex: 10,
    },
    image: {
        width: '100%',
        height: '75%',
    },
});
