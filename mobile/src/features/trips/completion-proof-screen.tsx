import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { Alert } from 'react-native';
import { Camera, CheckCircle, ChevronLeft } from 'lucide-react-native';
import { Text, XStack, YStack } from 'tamagui';

import { AppText } from '@/components/app-text';
import { appTheme } from '@/theme/app-theme';
import { useCompletionProof } from '@/hooks/use-completion-proof';
import type { ActiveTrip } from '@/types/trip';

// ─── Main screen ──────────────────────────────────────────────────────────────

export function CompletionProofScreen() {
    const { tripId } = useLocalSearchParams<{ tripId: string }>();
    const tripIdNum = Number(tripId);

    const [proofUri, setProofUri] = useState<string | null>(null);
    const [permission, requestPermission] = useCameraPermissions();
    const cameraRef = useRef<CameraView>(null);

    const handleSuccess = useCallback((trip: ActiveTrip) => {
        const isLastDriver = trip.is_final_shipment && trip.order_payment_type === 'cash';
        if (isLastDriver) {
            // Navigate to dedicated receipt request screen — replace so back returns to home
            router.replace({
                pathname: '/receipt-request',
                params: {
                    orderId:          String(trip.order_id),
                    shipmentId:       String(trip.id),
                    estimatedPrice:   trip.estimated_price ?? '',
                    cargoName:        trip.cargo_name ?? '',
                    pickupAddress:    trip.pickup_address,
                    deliveryAddress:  trip.delivery_address,
                    shipmentIndex:    String(trip.shipment_index),
                    maxShipmentIndex: String(trip.max_shipment_index),
                },
            });
        } else {
            router.back();
        }
    }, []);

    const { isUploading, error, completeWithProof } = useCompletionProof(handleSuccess);

    const takePicture = useCallback(async () => {
        if (!cameraRef.current) return;
        try {
            const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
            if (photo?.uri) setProofUri(photo.uri);
        } catch {
            Alert.alert('Lỗi', 'Không thể chụp ảnh, vui lòng thử lại.');
        }
    }, []);

    const handleConfirm = useCallback(() => {
        if (!proofUri) return;
        void completeWithProof(tripIdNum, proofUri);
    }, [proofUri, tripIdNum, completeWithProof]);

    // ── Permission screens ───────────────────────────────────────────────────

    if (!permission) {
        return (
            <YStack flex={1} backgroundColor="#000" alignItems="center" justifyContent="center">
                <AppText variant="body" tone="inverse">Đang kiểm tra quyền camera...</AppText>
            </YStack>
        );
    }

    if (!permission.granted) {
        return (
            <YStack flex={1} backgroundColor={appTheme.colors.background} alignItems="center" justifyContent="center" padding={24} gap={16}>
                <AppText variant="bodyStrong">Cần quyền truy cập camera</AppText>
                <AppText variant="body" tone="muted" textAlign="center">
                    Ứng dụng cần quyền camera để chụp ảnh xác nhận giao hàng
                </AppText>
                <Pressable
                    onPress={requestPermission}
                    style={{ backgroundColor: appTheme.colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: appTheme.radius.md }}
                >
                    <Text color="#fff" fontWeight="900" fontSize={14}>Cấp quyền</Text>
                </Pressable>
            </YStack>
        );
    }

    // ── Camera layout ────────────────────────────────────────────────────────

    return (
        <View style={styles.container}>
            <StatusBar style="light" />

            {/* Camera — always live */}
            <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

            {/* Corner frame guides — visible when no photo taken yet */}
            {!proofUri ? (
                <View style={styles.frameContainer} pointerEvents="none">
                    <View style={[styles.corner, styles.cornerTL]} />
                    <View style={[styles.corner, styles.cornerTR]} />
                    <View style={[styles.corner, styles.cornerBL]} />
                    <View style={[styles.corner, styles.cornerBR]} />
                </View>
            ) : null}

            {/* Top bar */}
            <View style={styles.topBar}>
                <XStack paddingHorizontal={20} paddingTop={56} paddingBottom={14} alignItems="center" gap={12}>
                    <Pressable onPress={() => router.back()} hitSlop={12} style={styles.iconBtn}>
                        <ChevronLeft size={20} color="#fff" />
                    </Pressable>
                    <YStack flex={1} gap={2}>
                        <Text fontSize={15} fontWeight="900" color="#fff">
                            Chụp ảnh xác nhận giao hàng
                        </Text>
                        <Text fontSize={11} color="rgba(255,255,255,0.65)">
                            Chụp người nhận hoặc hàng tại điểm giao · Chuyến #{tripId}
                        </Text>
                    </YStack>
                </XStack>
            </View>

            {/* Bottom panel */}
            <View style={styles.bottomPanel}>
                {/* Error */}
                {error ? (
                    <View style={styles.errorBar}>
                        <Text fontSize={12} color="#fff">{error}</Text>
                    </View>
                ) : null}

                {/* Shutter + confirm */}
                <YStack alignItems="center" gap={14} paddingBottom={44} paddingTop={12}>
                    <Text style={styles.guideText}>
                        {proofUri
                            ? 'Ảnh đã chụp — nhấn Hoàn thành hoặc chụp lại'
                            : 'Chụp ảnh người nhận hoặc hàng tại điểm giao (BR-015/016)'}
                    </Text>

                    <XStack gap={20} alignItems="center">
                        {/* Shutter */}
                        <Pressable onPress={takePicture} disabled={isUploading} style={styles.shutterBtn}>
                            <View style={styles.shutterInner}>
                                <Camera size={28} color={appTheme.colors.primary} />
                            </View>
                        </Pressable>

                        {/* Confirm (shown when photo is ready) */}
                        {proofUri ? (
                            <Pressable
                                onPress={handleConfirm}
                                disabled={isUploading}
                                style={[styles.confirmBtn, isUploading && { opacity: 0.7 }]}
                            >
                                <CheckCircle size={16} color="#fff" />
                                <Text fontSize={13} fontWeight="900" color="#fff">
                                    {isUploading ? 'Đang tải...' : 'Hoàn thành'}
                                </Text>
                            </Pressable>
                        ) : null}
                    </XStack>

                    <Text style={styles.stepHint}>
                        {proofUri ? '✓ Đã chụp ảnh xác nhận' : '○ Chưa chụp ảnh'}
                    </Text>
                </YStack>
            </View>
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const C  = 28;
const CT = 3;

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },

    frameContainer: {
        position: 'absolute', top: '22%', left: '10%', right: '10%', bottom: '28%',
    },
    corner:   { position: 'absolute', width: C, height: C, borderColor: 'rgba(255,255,255,0.9)' },
    cornerTL: { top: 0, left: 0, borderTopWidth: CT, borderLeftWidth: CT, borderTopLeftRadius: 4 },
    cornerTR: { top: 0, right: 0, borderTopWidth: CT, borderRightWidth: CT, borderTopRightRadius: 4 },
    cornerBL: { bottom: 0, left: 0, borderBottomWidth: CT, borderLeftWidth: CT, borderBottomLeftRadius: 4 },
    cornerBR: { bottom: 0, right: 0, borderBottomWidth: CT, borderRightWidth: CT, borderBottomRightRadius: 4 },

    topBar: {
        position: 'absolute', top: 0, left: 0, right: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    iconBtn: {
        width: 40, height: 40, borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.18)',
        alignItems: 'center', justifyContent: 'center',
    },

    bottomPanel: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingTop: 14,
    },

    errorBar: {
        marginHorizontal: 20, marginBottom: 10,
        padding: 10, borderRadius: 10,
        backgroundColor: appTheme.colors.danger,
    },

    guideText: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.8)',
        fontWeight: '600',
        textAlign: 'center',
        paddingHorizontal: 24,
    },
    shutterBtn: {
        width: 76, height: 76, borderRadius: 38,
        backgroundColor: '#fff',
        alignItems: 'center', justifyContent: 'center',
        shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, elevation: 8,
    },
    shutterInner: {
        width: 62, height: 62, borderRadius: 31,
        backgroundColor: '#fff',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 2, borderColor: appTheme.colors.primaryMuted,
    },
    confirmBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: appTheme.colors.primary,
        paddingHorizontal: 18, paddingVertical: 14,
        borderRadius: appTheme.radius.md,
    },
    stepHint: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.65)',
        fontWeight: '700',
        letterSpacing: 0.5,
    },
});
