import { useCallback, useState } from 'react';
import {
    KeyboardAvoidingView, Platform,
    Pressable, ScrollView, StyleSheet, TextInput, View,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { AlertTriangle, CheckCircle, FileText, Info, Save, XCircle } from 'lucide-react-native';
import { Text, XStack, YStack } from 'tamagui';

import { AppText }               from '@/components/app-text';
import { LifecycleActionButton }  from '@/components/lifecycle-action-button';
import { ScreenHeader }          from '@/components/screen-header';
import { appTheme }              from '@/theme/app-theme';
import { useAppAlert }           from '@/providers/ui-provider';
import { tripService }           from '@/services/trip-service';
import type { OrderReceiptRequest } from '@/types/trip';

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

const fmt = (v: string | number | null | undefined) => {
    if (!v) return null;
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(v));
};

// ─── Existing request status banner (only shown to final driver) ──────────────

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
                        Phiếu thu sẽ được tạo sớm nhất
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
                    <XCircle size={18} color={appTheme.colors.danger} />
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
    const params     = useLocalSearchParams<Params>();
    const orderId    = Number(params.orderId);
    const shipmentId = Number(params.shipmentId);

    // Driver cuối = người có shipment_index cao nhất trong order
    const isFinalShipment = Number(params.shipmentIndex) === Number(params.maxShipmentIndex);

    const [actualKm,     setActualKm]     = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error,        setError]        = useState<string | null>(null);

    // Chỉ cần check existing request cho driver cuối
    const [existingReq,  setExistingReq]  = useState<OrderReceiptRequest | null>(null);
    const [isLoadingReq, setIsLoadingReq] = useState(isFinalShipment);

    const { showAlert } = useAppAlert();

    // ── Load existing receipt request (final driver only) ───────────────────
    useFocusEffect(useCallback(() => {
        if (!isFinalShipment) return;

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
    }, [orderId, isFinalShipment]));

    // ── Validate ─────────────────────────────────────────────────────────────
    const kmNum   = actualKm.trim() ? Number(actualKm.replace(',', '.')) : undefined;
    const kmValid = kmNum !== undefined && !isNaN(kmNum) && kmNum > 0;
    const canSubmit = !isSubmitting && kmValid && (isFinalShipment ? !existingReq : true);

    // ── Submit ───────────────────────────────────────────────────────────────
    const handleSubmit = async () => {
        if (!kmValid || kmNum === undefined) {
            setError('Vui lòng nhập số km thực tế hợp lệ (lớn hơn 0).');
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            const result = await tripService.requestOrderReceipt(orderId, {
                shipment_id: shipmentId,
                actual_km:   kmNum,
            });

            if (result.receipt_request_created && result.request) {
                setExistingReq(result.request);
                await showAlert({
                    type:    'success',
                    title:   'Đã gửi yêu cầu!',
                    message: 'Coordinator sẽ xem xét và tạo phiếu thu. Bạn sẽ nhận thông báo khi có kết quả.',
                    okLabel: 'OK',
                });
            } else {
                await showAlert({
                    type:    'success',
                    title:   'Đã lưu số km!',
                    message: `Số km thực tế ${kmNum} km đã được ghi nhận cho chuyến này.`,
                    okLabel: 'OK',
                });
            }

            router.back();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Không thể thực hiện, vui lòng thử lại');
        } finally {
            setIsSubmitting(false);
        }
    };

    // ── Render ───────────────────────────────────────────────────────────────

    const screenTitle = isFinalShipment ? 'Yêu cầu tạo phiếu thu' : 'Nhập km thực tế';
    const buttonLabel = isSubmitting
        ? 'Đang xử lý...'
        : isFinalShipment
            ? 'Gửi yêu cầu tạo phiếu thu'
            : 'Lưu số km thực tế';
    const ButtonIcon = isFinalShipment ? FileText : Save;

    return (
        <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <View style={{ flex: 1, backgroundColor: appTheme.colors.background }}>
                <ScreenHeader title={screenTitle} showBack />

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

                    {/* ── Existing request status (final driver only) ── */}
                    {isFinalShipment && !isLoadingReq && existingReq ? (
                        <ExistingRequestBanner req={existingReq} />
                    ) : null}

                    {/* ── Km input ── */}
                    {(!isFinalShipment || !existingReq) ? (
                        <YStack
                            padding={14} borderRadius={appTheme.radius.lg}
                            backgroundColor={appTheme.colors.surface}
                            borderWidth={1}
                            borderColor={!kmValid && actualKm.trim() ? appTheme.colors.dangerBorder : appTheme.colors.border}
                            gap={10}
                        >
                            <Text fontSize={11} fontWeight="900" color={appTheme.colors.textMuted}>
                                SỐ KM THỰC TẾ (BẮT BUỘC)
                            </Text>
                            <TextInput
                                value={actualKm}
                                onChangeText={(t) => { setActualKm(t); setError(null); }}
                                keyboardType="decimal-pad"
                                placeholder="Nhập số km thực tế của chuyến"
                                placeholderTextColor={appTheme.colors.textMuted}
                                returnKeyType="done"
                                style={[
                                    styles.kmInput,
                                    !kmValid && actualKm.trim() ? styles.kmInputError : null,
                                ]}
                            />
                            {kmValid ? (
                                <XStack gap={6} alignItems="center">
                                    <AlertTriangle size={11} color={appTheme.colors.warningText} />
                                    <Text fontSize={11} color={appTheme.colors.warningText} flex={1}>
                                        {isFinalShipment
                                            ? `Coordinator sẽ tính lại giá dựa trên ${actualKm} km thực tế`
                                            : `${actualKm} km sẽ được ghi nhận cho chuyến này`}
                                    </Text>
                                </XStack>
                            ) : null}
                            {!kmValid && actualKm.trim() ? (
                                <Text fontSize={11} color={appTheme.colors.danger}>
                                    Số km phải lớn hơn 0
                                </Text>
                            ) : null}
                        </YStack>
                    ) : null}

                    {/* ── Final driver warning (one-time, only for final driver) ── */}
                    {isFinalShipment && !existingReq ? (
                        <XStack
                            padding={12} borderRadius={appTheme.radius.md}
                            backgroundColor={appTheme.colors.warningSoft}
                            borderWidth={1} borderColor={appTheme.colors.warningBorder}
                            gap={8} alignItems="flex-start"
                        >
                            <AlertTriangle size={14} color={appTheme.colors.warningText} style={{ marginTop: 1 }} />
                            <Text fontSize={11} color={appTheme.colors.warningText} flex={1} lineHeight={17}>
                                Yêu cầu phiếu thu chỉ được gửi 1 lần cho mỗi đơn hàng.
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
                    {(!isFinalShipment || !existingReq) ? (
                        <LifecycleActionButton
                            label={buttonLabel}
                            tone="primary"
                            onPress={handleSubmit}
                            isLoading={isSubmitting}
                            disabled={!canSubmit}
                            icon={<ButtonIcon size={17} color={canSubmit ? '#fff' : appTheme.colors.textMuted} />}
                        />
                    ) : null}

                    {/* ── Back / Close ── */}
                    <Pressable
                        style={styles.skipBtn}
                        onPress={() => router.back()}
                        disabled={isSubmitting}
                    >
                        <Text fontSize={13} color={appTheme.colors.textMuted}>
                            {(isFinalShipment && existingReq) ? 'Đóng' : 'Quay lại'}
                        </Text>
                    </Pressable>
                </ScrollView>
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
