import { useCallback, useState } from 'react';
import {
    KeyboardAvoidingView, Platform,
    Pressable, ScrollView, StyleSheet, TextInput, View,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { AlertTriangle, CheckCircle, FileText, Info, ReceiptText } from 'lucide-react-native';
import { Text, XStack, YStack } from 'tamagui';

import { AppText }              from '@/components/app-text';
import { LifecycleActionButton } from '@/components/lifecycle-action-button';
import { ScreenHeader }         from '@/components/screen-header';
import { appTheme }             from '@/theme/app-theme';
import { useAppAlert, useToast } from '@/providers/ui-provider';
import { tripService }          from '@/services/trip-service';
import type { OrderReceiptRequest } from '@/types/trip';

import { CameraModal }     from './components/camera-modal';
import { PhotoCaptureCard } from './components/photo-capture-card';

// ─── Types ────────────────────────────────────────────────────────────────────

type Params = {
    orderId: string;
    shipmentId: string;
    estimatedPrice?: string;
    cargoName?: string;
    pickupAddress: string;
    deliveryAddress: string;
    shipmentIndex: string;
    maxShipmentIndex: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function compressImage(uri: string): Promise<string> {
    const result = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1200 } }],
        { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG },
    );
    return result.uri;
}

const fmt = (v: string | number | null | undefined) => {
    if (!v) return null;
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(v));
};

// ─── Receipt request status display ──────────────────────────────────────────

function ExistingRequestBanner({ req }: { req: OrderReceiptRequest }) {
    if (req.status === 'pending' || req.status === 'processing') {
        return (
            <XStack
                padding={14} borderRadius={appTheme.radius.lg}
                backgroundColor={appTheme.colors.warningSoft}
                borderWidth={1} borderColor={appTheme.colors.warningBorder}
                alignItems="center" gap={10}
            >
                <AlertTriangle size={18} color={appTheme.colors.warningText} />
                <YStack flex={1} gap={3}>
                    <Text fontSize={13} fontWeight="900" color={appTheme.colors.warningText}>
                        Đã gửi yêu cầu — đang chờ coordinator
                    </Text>
                    <Text fontSize={11} color={appTheme.colors.warningText}>
                        {req.actual_km ? `${req.actual_km} km · ` : ''}Phiếu thu sẽ được tạo sớm nhất
                    </Text>
                </YStack>
            </XStack>
        );
    }

    if (req.status === 'approved') {
        return (
            <XStack
                padding={14} borderRadius={appTheme.radius.lg}
                backgroundColor={appTheme.colors.successSoft}
                borderWidth={1} borderColor={appTheme.colors.successBorder}
                alignItems="center" gap={10}
            >
                <CheckCircle size={18} color={appTheme.colors.success} />
                <Text fontSize={13} fontWeight="900" color={appTheme.colors.success} flex={1}>
                    Phiếu thu đã được coordinator tạo — kiểm tra thông báo
                </Text>
            </XStack>
        );
    }

    if (req.status === 'rejected') {
        return (
            <YStack
                padding={14} borderRadius={appTheme.radius.lg}
                backgroundColor={appTheme.colors.dangerSoft}
                borderWidth={1} borderColor={appTheme.colors.dangerBorder}
                gap={6}
            >
                <XStack alignItems="center" gap={10}>
                    <AlertTriangle size={18} color={appTheme.colors.danger} />
                    <Text fontSize={13} fontWeight="900" color={appTheme.colors.danger}>
                        Yêu cầu bị từ chối — liên hệ coordinator
                    </Text>
                </XStack>
                {req.coordinator_notes ? (
                    <Text fontSize={12} color={appTheme.colors.danger} style={{ paddingLeft: 28 }}>
                        Lý do: {req.coordinator_notes}
                    </Text>
                ) : null}
            </YStack>
        );
    }

    return null;
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function ReceiptRequestScreen() {
    const params = useLocalSearchParams<Params>();
    const orderId    = Number(params.orderId);
    const shipmentId = Number(params.shipmentId);

    const [receiptUri,    setReceiptUri]    = useState<string | null>(null);
    const [actualKm,      setActualKm]      = useState('');
    const [isSubmitting,  setIsSubmitting]  = useState(false);
    const [error,         setError]         = useState<string | null>(null);
    const [showCamera,    setShowCamera]    = useState(false);

    // Existing request state (check on focus — driver may return after submitting)
    const [existingReq,   setExistingReq]   = useState<OrderReceiptRequest | null>(null);
    const [isLoadingReq,  setIsLoadingReq]  = useState(true);

    const { showAlert } = useAppAlert();
    const [permission, requestPermission] = useCameraPermissions();

    // ── Load existing request on focus ──────────────────────────────────────
    useFocusEffect(useCallback(() => {
        let active = true;
        const load = async () => {
            setIsLoadingReq(true);
            try {
                const { request } = await tripService.getOrderReceiptRequest(orderId);
                if (active) setExistingReq(request);
            } catch {
                // ignore — screen still usable
            } finally {
                if (active) setIsLoadingReq(false);
            }
        };
        void load();
        return () => { active = false; };
    }, [orderId]));

    // ── Camera ───────────────────────────────────────────────────────────────
    const handleOpenCamera = async () => {
        if (!permission?.granted) {
            const res = await requestPermission();
            if (!res.granted) return;
        }
        setShowCamera(true);
    };

    // ── Validate ─────────────────────────────────────────────────────────────
    const validate = (): string | null => {
        if (!receiptUri) return 'Vui lòng chụp ảnh biên lai trước khi gửi yêu cầu.';
        const km = actualKm.trim() ? Number(actualKm.replace(',', '.')) : undefined;
        if (km !== undefined && (isNaN(km) || km <= 0))
            return 'Số km thực tế không hợp lệ — vui lòng nhập số lớn hơn 0.';
        return null;
    };

    // ── Submit ───────────────────────────────────────────────────────────────
    const handleSubmit = async () => {
        const validationError = validate();
        if (validationError) { setError(validationError); return; }

        setIsSubmitting(true);
        setError(null);

        try {
            const compressedReceipt = await compressImage(receiptUri!);
            const km = actualKm.trim() ? Number(actualKm.replace(',', '.')) : undefined;

            const formData = new FormData();
            formData.append('shipment_id', String(shipmentId));
            if (km !== undefined) formData.append('actual_km', String(km));
            formData.append('receipt', {
                uri: compressedReceipt,
                type: 'image/jpeg',
                name: 'receipt.jpg',
            } as unknown as Blob);

            const { request } = await tripService.requestOrderReceipt(orderId, formData);
            setExistingReq(request);

            await showAlert({
                type:    'success',
                title:   'Đã gửi yêu cầu!',
                message: 'Coordinator sẽ xem xét và tạo phiếu thu. Bạn sẽ nhận thông báo khi có kết quả.',
                okLabel: 'OK',
            });

            router.back();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Không thể gửi yêu cầu tạo phiếu thu');
        } finally {
            setIsSubmitting(false);
        }
    };

    const kmNum    = actualKm.trim() ? Number(actualKm.replace(',', '.')) : undefined;
    const kmValid  = kmNum === undefined || (!isNaN(kmNum) && kmNum > 0);
    const canSubmit = !!receiptUri && !isSubmitting && !existingReq;

    // ── Render ───────────────────────────────────────────────────────────────

    if (!permission) {
        return (
            <View style={{ flex: 1, backgroundColor: appTheme.colors.background }}>
                <ScreenHeader title="Yêu cầu tạo phiếu thu" showBack />
                <YStack flex={1} alignItems="center" justifyContent="center" padding={24}>
                    <AppText variant="body" tone="muted">Đang kiểm tra quyền camera...</AppText>
                </YStack>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <View style={{ flex: 1, backgroundColor: appTheme.colors.background }}>
                <ScreenHeader title="Yêu cầu tạo phiếu thu" showBack />

                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={styles.scroll}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* ── Trip info ── */}
                    <YStack
                        padding={14} borderRadius={appTheme.radius.lg}
                        backgroundColor={appTheme.colors.surface}
                        borderWidth={1} borderColor={appTheme.colors.border}
                        gap={8}
                    >
                        <XStack alignItems="center" gap={8}>
                            <Info size={13} color={appTheme.colors.primary} />
                            <Text fontSize={11} fontWeight="900" color={appTheme.colors.textMuted}>
                                THÔNG TIN CHUYẾN
                            </Text>
                        </XStack>
                        <Text fontSize={13} fontWeight="700" color={appTheme.colors.text}>
                            Đơn #{params.orderId} · Chuyến {params.shipmentIndex}/{params.maxShipmentIndex}
                        </Text>
                        <Text fontSize={12} color={appTheme.colors.textMuted} numberOfLines={2}>
                            {params.pickupAddress}
                        </Text>
                        <Text fontSize={12} color={appTheme.colors.textMuted} numberOfLines={2}>
                            → {params.deliveryAddress}
                        </Text>
                        {params.cargoName ? (
                            <Text fontSize={12} color={appTheme.colors.text}>Hàng: {params.cargoName}</Text>
                        ) : null}
                        {params.estimatedPrice ? (
                            <XStack justifyContent="space-between" alignItems="center">
                                <Text fontSize={12} color={appTheme.colors.textMuted}>Giá ước tính</Text>
                                <Text fontSize={13} fontWeight="700" color={appTheme.colors.primary}>
                                    {fmt(params.estimatedPrice)}
                                </Text>
                            </XStack>
                        ) : null}
                    </YStack>

                    {/* ── Existing request status (if any) ── */}
                    {!isLoadingReq && existingReq ? (
                        <ExistingRequestBanner req={existingReq} />
                    ) : null}

                    {/* ── Receipt photo (only if no existing request) ── */}
                    {!existingReq ? (
                        <YStack
                            padding={14} borderRadius={appTheme.radius.lg}
                            backgroundColor={appTheme.colors.surface}
                            borderWidth={1}
                            borderColor={receiptUri ? appTheme.colors.successBorder : appTheme.colors.border}
                            gap={10}
                        >
                            <Text fontSize={11} fontWeight="900" color={appTheme.colors.textMuted}>
                                ẢNH BIÊN LAI / HÓA ĐƠN (BẮT BUỘC)
                            </Text>
                            <AppText variant="caption" tone="muted">
                                Chụp biên lai hoặc hóa đơn có chữ ký của khách hàng — ảnh realtime, không được upload từ thư viện.
                            </AppText>
                            <PhotoCaptureCard
                                label="Ảnh biên lai"
                                sublabel="Biên lai / hóa đơn có chữ ký khách"
                                uri={receiptUri}
                                required
                                onCapture={handleOpenCamera}
                                onDelete={() => setReceiptUri(null)}
                            />
                        </YStack>
                    ) : null}

                    {/* ── Actual km (only if no existing request) ── */}
                    {!existingReq ? (
                        <YStack
                            padding={14} borderRadius={appTheme.radius.lg}
                            backgroundColor={appTheme.colors.surface}
                            borderWidth={1}
                            borderColor={!kmValid ? appTheme.colors.dangerBorder : appTheme.colors.border}
                            gap={10}
                        >
                            <Text fontSize={11} fontWeight="900" color={appTheme.colors.textMuted}>
                                SỐ KM THỰC TẾ (TUỲ CHỌN)
                            </Text>
                            <TextInput
                                value={actualKm}
                                onChangeText={(t) => { setActualKm(t); setError(null); }}
                                keyboardType="decimal-pad"
                                placeholder="Bỏ trống = dùng km ước tính ban đầu"
                                placeholderTextColor={appTheme.colors.textMuted}
                                returnKeyType="done"
                                style={[styles.kmInput, !kmValid && styles.kmInputError]}
                            />
                            {kmNum !== undefined && kmNum > 0 && kmValid ? (
                                <XStack gap={6} alignItems="center">
                                    <AlertTriangle size={11} color={appTheme.colors.warningText} />
                                    <Text fontSize={11} color={appTheme.colors.warningText} flex={1}>
                                        Coordinator sẽ tính lại giá dựa trên {actualKm} km thực tế
                                    </Text>
                                </XStack>
                            ) : null}
                            {!kmValid ? (
                                <Text fontSize={11} color={appTheme.colors.danger}>
                                    Số km phải lớn hơn 0
                                </Text>
                            ) : null}
                        </YStack>
                    ) : null}

                    {/* ── One-time warning ── */}
                    {!existingReq ? (
                        <XStack
                            padding={12} borderRadius={appTheme.radius.md}
                            backgroundColor={appTheme.colors.warningSoft}
                            borderWidth={1} borderColor={appTheme.colors.warningBorder}
                            gap={8} alignItems="flex-start"
                        >
                            <AlertTriangle size={14} color={appTheme.colors.warningText} style={{ marginTop: 1 }} />
                            <Text fontSize={11} color={appTheme.colors.warningText} flex={1} lineHeight={17}>
                                Yêu cầu phiếu thu chỉ được gửi 1 lần cho mỗi đơn hàng.
                                Kiểm tra kỹ ảnh biên lai trước khi xác nhận.
                            </Text>
                        </XStack>
                    ) : null}

                    {/* ── API error ── */}
                    {error ? (
                        <XStack
                            padding={12} borderRadius={appTheme.radius.md}
                            backgroundColor={appTheme.colors.dangerSoft}
                            borderWidth={1} borderColor={appTheme.colors.dangerBorder}
                            gap={8} alignItems="flex-start"
                        >
                            <AlertTriangle size={14} color={appTheme.colors.danger} style={{ marginTop: 1 }} />
                            <Text fontSize={12} color={appTheme.colors.danger} flex={1}>{error}</Text>
                        </XStack>
                    ) : null}

                    {/* ── Submit ── */}
                    {!existingReq ? (
                        <LifecycleActionButton
                            label={isSubmitting ? 'Đang gửi yêu cầu...' : 'Xác nhận gửi yêu cầu tạo phiếu thu'}
                            tone="primary"
                            onPress={handleSubmit}
                            isLoading={isSubmitting}
                            disabled={!canSubmit}
                            icon={<FileText size={17} color={canSubmit ? '#fff' : appTheme.colors.textMuted} />}
                        />
                    ) : null}

                    {/* ── Skip / Back ── */}
                    <Pressable
                        style={styles.skipBtn}
                        onPress={() => router.back()}
                        disabled={isSubmitting}
                    >
                        <Text fontSize={13} color={appTheme.colors.textMuted}>
                            {existingReq ? 'Đóng' : 'Bỏ qua — yêu cầu sau'}
                        </Text>
                    </Pressable>
                </ScrollView>

                <CameraModal
                    visible={showCamera}
                    label="Chụp ảnh biên lai / hóa đơn"
                    onCapture={(uri) => { setReceiptUri(uri); setShowCamera(false); setError(null); }}
                    onClose={() => setShowCamera(false)}
                />
            </View>
        </KeyboardAvoidingView>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    scroll: {
        paddingHorizontal: 16,
        paddingTop: 14,
        paddingBottom: 48,
        gap: 12,
    },
    kmInput: {
        height: 46,
        borderWidth: 1,
        borderColor: appTheme.colors.border,
        borderRadius: appTheme.radius.md,
        paddingHorizontal: 14,
        fontSize: 14,
        color: appTheme.colors.text,
        backgroundColor: appTheme.colors.surfaceSoft,
    },
    kmInputError: {
        borderColor: appTheme.colors.dangerBorder,
    },
    skipBtn: {
        alignItems: 'center',
        paddingVertical: 14,
    },
});
