import { useEffect, useRef, useState } from 'react';
import {
    Alert, Image, Platform, ScrollView, StyleSheet,
    TouchableOpacity, View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { launchCameraAsync, MediaTypeOptions, requestCameraPermissionsAsync } from 'expo-image-picker';
import {
    Bank, Camera, CheckCircle,
    MapPin, Money, Receipt, Ruler, Truck, User, Warning,
} from 'phosphor-react-native';
import { Text, XStack, YStack } from 'tamagui';

import { ScreenHeader }          from '@/components/screen-header';
import { AppText }               from '@/components/app-text';
import { ReceiptDetailSkeleton } from '@/components/skeleton';
import { appTheme }              from '@/theme/app-theme';
import { tripService }           from '@/services/trip-service';
import type { CompanyInfo, DriverReceiptDetail, PaymentType } from '@/types/trip';

// ─── Types ────────────────────────────────────────────────────────────────────

type CollectionType = 'cash_collected' | 'bank_transfer' | 'client_credit';

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
    bank_transfer:  'Chuyển khoản về công ty',
    client_credit:  'Công nợ khách hàng',
    qr_transfer:    'QR / Ví điện tử',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function Divider() {
    return <View style={styles.divider} />;
}

function Row({ label, value, bold }: { label: string; value: string | null | undefined; bold?: boolean }) {
    if (!value) return null;
    return (
        <XStack justifyContent="space-between" alignItems="flex-start" gap={12} paddingVertical={3}>
            <Text fontSize={12} color={appTheme.colors.textMuted} flex={1}>{label}</Text>
            <Text
                fontSize={12} fontWeight={bold ? '700' : '400'}
                color={appTheme.colors.text} flex={2} textAlign="right" numberOfLines={3}
            >
                {value}
            </Text>
        </XStack>
    );
}

// Button khách thanh toán
function PaymentOptionBtn({
    label, description, icon, color, selected, onPress,
}: {
    label: string;
    description: string;
    icon: React.ReactNode;
    color: string;
    selected: boolean;
    onPress: () => void;
}) {
    return (
        <TouchableOpacity
            onPress={onPress}
            style={[
                styles.optionBtn,
                selected && { borderColor: color, backgroundColor: `${color}12` },
            ]}
        >
            <XStack alignItems="center" gap={12}>
                <View style={[styles.optionIcon, { backgroundColor: `${color}18` }]}>
                    {icon}
                </View>
                <YStack flex={1} gap={2}>
                    <Text fontSize={13} fontWeight="700" color={selected ? color : appTheme.colors.text}>
                        {label}
                    </Text>
                    <Text fontSize={11} color={appTheme.colors.textMuted} numberOfLines={2}>
                        {description}
                    </Text>
                </YStack>
                <View style={[
                    styles.optionRadio,
                    selected && { borderColor: color, backgroundColor: color },
                ]} />
            </XStack>
        </TouchableOpacity>
    );
}

// Banner sau khi đã ghi nhận
function RecordedBanner({ paymentType, hasDriverDebt, hasCustomerDebt }: {
    paymentType: PaymentType;
    hasDriverDebt: boolean;
    hasCustomerDebt: boolean;
}) {
    if (paymentType === 'cash_collected') {
        return (
            <View style={[styles.statusBanner, { borderColor: hasDriverDebt ? appTheme.colors.warningBorder : appTheme.colors.successBorder }]}>
                <XStack alignItems="center" gap={10} padding={14}>
                    {hasDriverDebt ? (
                        <Warning size={18} color={appTheme.colors.warningText} weight="fill" />
                    ) : (
                        <CheckCircle size={18} color={appTheme.colors.success} weight="fill" />
                    )}
                    <YStack flex={1} gap={2}>
                        <Text fontSize={13} fontWeight="900" color={hasDriverDebt ? appTheme.colors.warningText : appTheme.colors.success}>
                            {hasDriverDebt ? 'Bạn đang có công nợ từ chuyến này' : 'Công nợ đã được thanh toán'}
                        </Text>
                        {hasDriverDebt ? (
                            <Text fontSize={11} color={appTheme.colors.warningText} opacity={0.85}>
                                Tiền mặt đã ghi nhận — vui lòng nộp về công ty.
                            </Text>
                        ) : null}
                    </YStack>
                </XStack>
            </View>
        );
    }

    if (paymentType === 'bank_transfer') {
        return (
            <View style={[styles.statusBanner, { borderColor: appTheme.colors.successBorder }]}>
                <XStack alignItems="center" gap={10} padding={14}>
                    <CheckCircle size={18} color={appTheme.colors.success} weight="fill" />
                    <YStack flex={1} gap={2}>
                        <Text fontSize={13} fontWeight="900" color={appTheme.colors.success}>Chuyển khoản về công ty</Text>
                        <Text fontSize={11} color={appTheme.colors.textMuted}>Đã ghi nhận — không phát sinh công nợ.</Text>
                    </YStack>
                </XStack>
            </View>
        );
    }

    if (paymentType === 'client_credit') {
        return (
            <View style={[styles.statusBanner, { borderColor: '#FF6B6B' }]}>
                <XStack alignItems="center" gap={10} padding={14}>
                    <Warning size={18} color="#E53E3E" weight="fill" />
                    <YStack flex={1} gap={2}>
                        <Text fontSize={13} fontWeight="900" color="#E53E3E">Khách đang nợ công ty</Text>
                        <Text fontSize={11} color={appTheme.colors.textMuted}>Đã tạo công nợ khách hàng.</Text>
                    </YStack>
                </XStack>
            </View>
        );
    }

    return null;
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function ReceiptDetailScreen() {
    const { receiptId } = useLocalSearchParams<{ receiptId: string }>();
    const id = Number(receiptId);

    const [receipt,        setReceipt]        = useState<DriverReceiptDetail | null>(null);
    const [companyInfo,    setCompanyInfo]     = useState<CompanyInfo | null>(null);
    const [isLoading,      setIsLoading]       = useState(true);
    const [error,          setError]           = useState<string | null>(null);

    // 3-button state
    const [selected,       setSelected]        = useState<CollectionType | null>(null);
    const [proofUri,       setProofUri]        = useState<string | null>(null);
    const [isSubmitting,   setIsSubmitting]    = useState(false);

    const load = () => {
        if (!id) { setError('ID phiếu thu không hợp lệ'); setIsLoading(false); return; }
        setIsLoading(true);
        Promise.all([
            tripService.getDriverReceiptDetail(id),
            tripService.getCompanyInfo(),
        ])
            .then(([{ receipt: data }, { info }]) => {
                setReceipt(data);
                setCompanyInfo(info);
                // Pre-select dựa vào order_payment_type
                if (!data.payment_type) {
                    const hint = data.order_payment_type;
                    if (hint === 'cash' || hint === 'cash_collected') setSelected('cash_collected');
                    else if (hint === 'bank_transfer' || hint === 'qr_transfer') setSelected('bank_transfer');
                }
            })
            .catch((err) => setError(err instanceof Error ? err.message : 'Không thể tải phiếu thu'))
            .finally(() => setIsLoading(false));
    };

    useEffect(() => { load(); }, [id]);

    const takePhoto = async () => {
        const { status } = await requestCameraPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Từ chối', 'Cần quyền truy cập camera để chụp ảnh xác minh.');
            return;
        }
        const result = await launchCameraAsync({
            mediaTypes: MediaTypeOptions.Images,
            allowsEditing: false,
            quality: 0.8,
        });
        if (!result.canceled && result.assets[0]) {
            setProofUri(result.assets[0].uri);
        }
    };

    const handleSubmit = async () => {
        if (!selected || !receipt) return;

        if ((selected === 'cash_collected' || selected === 'bank_transfer') && !proofUri) {
            Alert.alert('Thiếu ảnh', 'Vui lòng chụp ảnh xác minh thanh toán.');
            return;
        }

        const confirmMsg: Record<CollectionType, string> = {
            cash_collected: 'Xác nhận khách đã trả tiền mặt cho bạn?\nCông nợ sẽ được tạo và bạn cần nộp lại công ty.',
            bank_transfer:  'Xác nhận khách đã chuyển khoản về công ty?',
            client_credit:  'Xác nhận khách chưa thanh toán?\nSẽ tạo công nợ cho khách hàng.',
        };

        Alert.alert('Xác nhận', confirmMsg[selected], [
            { text: 'Huỷ', style: 'cancel' },
            {
                text: 'Đồng ý', style: 'default',
                onPress: async () => {
                    setIsSubmitting(true);
                    try {
                        const targetId = receipt.actual_receipt_id ?? receipt.receipt_id;
                        const formData = new FormData();
                        formData.append('payment_type', selected);

                        if (proofUri) {
                            const filename = proofUri.split('/').pop() ?? 'proof.jpg';
                            const type = filename.endsWith('.png') ? 'image/png' : 'image/jpeg';
                            formData.append('proof', { uri: proofUri, name: filename, type } as any);
                        }

                        await tripService.recordReceiptCollection(targetId, formData);
                        await load();
                        setProofUri(null);
                    } catch (err: any) {
                        Alert.alert('Lỗi', err?.message ?? 'Không thể ghi nhận thanh toán. Vui lòng thử lại.');
                    } finally {
                        setIsSubmitting(false);
                    }
                },
            },
        ]);
    };

    // ── Render loading / error ────────────────────────────────────────────────

    if (isLoading) {
        return (
            <View style={{ flex: 1, backgroundColor: '#F0F4FF' }}>
                <ScreenHeader title="Phiếu thu" showBack />
                <ScrollView showsVerticalScrollIndicator={false}>
                    <ReceiptDetailSkeleton />
                </ScrollView>
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

    const alreadyRecorded = receipt.payment_type !== null;
    const kmDisplay = receipt.actual_distance_km
        ? `${Number(receipt.actual_distance_km).toLocaleString('vi-VN')} km`
        : receipt.estimated_distance_km
            ? `${Number(receipt.estimated_distance_km).toLocaleString('vi-VN')} km (ước tính)`
            : null;

    const needsProof = selected === 'cash_collected' || selected === 'bank_transfer';

    return (
        <View style={{ flex: 1, backgroundColor: '#F0F4FF' }}>
            <ScreenHeader title="Phiếu thu" showBack />

            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

                {/* ── Receipt card ─────────────────────────────────────────── */}
                <View style={styles.receiptCard}>

                    {/* Header */}
                    <YStack alignItems="center" gap={6} paddingBottom={16}>
                        <View style={styles.receiptIconWrap}>
                            <Receipt size={32} color={appTheme.colors.primary} weight="fill" />
                        </View>
                        <Text fontSize={11} fontWeight="700" color={appTheme.colors.textMuted} letterSpacing={2}>
                            PHIẾU THU VẬN CHUYỂN
                        </Text>
                        <Text fontSize={13} color={appTheme.colors.textMuted}>
                            #{String(receipt.receipt_id).padStart(6, '0')} · {fmtDate(receipt.collected_at)}
                        </Text>
                    </YStack>

                    <Divider />

                    {/* Amount */}
                    <YStack alignItems="center" paddingVertical={20} gap={6}>
                        <Text fontSize={11} fontWeight="700" color={appTheme.colors.textMuted} letterSpacing={1}>
                            SỐ TIỀN THANH TOÁN
                        </Text>
                        <Text fontSize={34} fontWeight="900" color={appTheme.colors.primary}>
                            {fmtMoney(receipt.amount)}
                        </Text>
                        {alreadyRecorded ? (
                            <View style={[styles.paymentBadge, { backgroundColor: `${appTheme.colors.success}18` }]}>
                                <Text fontSize={12} fontWeight="700" color={appTheme.colors.success}>
                                    {PAYMENT_LABEL[receipt.payment_type!] ?? receipt.payment_type}
                                </Text>
                            </View>
                        ) : (
                            <View style={[styles.paymentBadge, { backgroundColor: `${appTheme.colors.warning}18` }]}>
                                <Text fontSize={12} fontWeight="700" color={appTheme.colors.warning}>
                                    Chưa xác nhận thanh toán
                                </Text>
                            </View>
                        )}
                    </YStack>

                    <Divider />

                    {/* Customer */}
                    <YStack gap={6} paddingVertical={14}>
                        <XStack gap={6} alignItems="center" paddingBottom={4}>
                            <User size={14} color={appTheme.colors.primary} weight="fill" />
                            <Text fontSize={11} fontWeight="900" color={appTheme.colors.primary} letterSpacing={0.5}>
                                KHÁCH HÀNG
                            </Text>
                        </XStack>
                        <Row label="Tên"        value={receipt.customer_name} bold />
                        <Row label="Công ty"    value={receipt.customer_company} />
                        <Row label="Điện thoại" value={receipt.customer_phone} />
                        <Row label="Địa chỉ"   value={receipt.customer_address} />
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
                        <Row label="Hàng hóa"       value={receipt.cargo_name} bold />
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
                                <Text fontSize={12} fontWeight="700" color={appTheme.colors.text}>{kmDisplay}</Text>
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
                        <Row label="Tài xế"     value={receipt.driver_name} bold />
                        <Row label="Điện thoại" value={receipt.driver_phone} />
                        <Row label="Biển số"    value={receipt.plate_number} />
                        <Row label="Phụ trách"  value={receipt.coordinator_name} />
                    </YStack>

                    {receipt.notes ? (
                        <>
                            <Divider />
                            <YStack gap={4} paddingVertical={12}>
                                <Text fontSize={11} fontWeight="700" color={appTheme.colors.textMuted}>GHI CHÚ</Text>
                                <Text fontSize={12} color={appTheme.colors.text} lineHeight={18}>{receipt.notes}</Text>
                            </YStack>
                        </>
                    ) : null}

                    {/* QR bank — luôn hiển thị để driver show cho khách */}
                    {companyInfo?.bank_qr_url ? (
                        <>
                            <Divider />
                            <YStack paddingVertical={14} gap={10} alignItems="center">
                                <XStack gap={6} alignItems="center" alignSelf="flex-start">
                                    <Bank size={14} color={appTheme.colors.primary} weight="fill" />
                                    <Text fontSize={11} fontWeight="900" color={appTheme.colors.primary} letterSpacing={0.5}>
                                        QR CHUYỂN KHOẢN CÔNG TY
                                    </Text>
                                </XStack>
                                <Image
                                    source={{ uri: companyInfo.bank_qr_url }}
                                    style={styles.qrImage}
                                    resizeMode="contain"
                                />
                                <YStack gap={4} width="100%">
                                    {companyInfo.bank_account_name ? (
                                        <XStack justifyContent="space-between">
                                            <Text fontSize={12} color={appTheme.colors.textMuted}>Tên TK</Text>
                                            <Text fontSize={12} fontWeight="700" color={appTheme.colors.text}>{companyInfo.bank_account_name}</Text>
                                        </XStack>
                                    ) : null}
                                    {companyInfo.bank_account_number ? (
                                        <XStack justifyContent="space-between">
                                            <Text fontSize={12} color={appTheme.colors.textMuted}>Số TK</Text>
                                            <Text fontSize={13} fontWeight="900" color={appTheme.colors.primary}>{companyInfo.bank_account_number}</Text>
                                        </XStack>
                                    ) : null}
                                    {companyInfo.bank_name ? (
                                        <XStack justifyContent="space-between">
                                            <Text fontSize={12} color={appTheme.colors.textMuted}>Ngân hàng</Text>
                                            <Text fontSize={12} color={appTheme.colors.text}>{companyInfo.bank_name}</Text>
                                        </XStack>
                                    ) : null}
                                </YStack>
                            </YStack>
                        </>
                    ) : null}

                    <Divider />

                    <View style={styles.footer}>
                        <Text fontSize={10} color={appTheme.colors.textMuted} textAlign="center">
                            Phiếu thu hợp lệ — phát hành bởi hệ thống quản lý vận tải
                        </Text>
                    </View>
                </View>

                {/* ── Sau khi đã ghi nhận: hiển thị status ───────────────── */}
                {alreadyRecorded ? (
                    <RecordedBanner
                        paymentType={receipt.payment_type!}
                        hasDriverDebt={receipt.has_driver_debt}
                        hasCustomerDebt={receipt.has_customer_debt}
                    />
                ) : (
                    /* ── Chưa ghi nhận: 3 button chọn hình thức ──────────── */
                    <View style={styles.paymentCard}>
                        <Text fontSize={14} fontWeight="900" color={appTheme.colors.text} marginBottom={4}>
                            Khách thanh toán thế nào?
                        </Text>
                        <Text fontSize={12} color={appTheme.colors.textMuted} marginBottom={14}>
                            Chọn đúng hình thức để ghi nhận công nợ chính xác.
                        </Text>

                        <PaymentOptionBtn
                            label="Khách chuyển khoản về công ty"
                            description="Khách đã scan QR hoặc chuyển khoản. Cần chụp ảnh xác nhận."
                            icon={<Bank size={20} color="#2F80ED" weight="fill" />}
                            color="#2F80ED"
                            selected={selected === 'bank_transfer'}
                            onPress={() => setSelected('bank_transfer')}
                        />

                        <PaymentOptionBtn
                            label="Khách trả tiền mặt cho tài"
                            description="Bạn nhận tiền mặt từ khách. Cần chụp ảnh xác nhận. Sẽ tạo công nợ cho bạn."
                            icon={<Money size={20} color={appTheme.colors.success} weight="fill" />}
                            color={appTheme.colors.success}
                            selected={selected === 'cash_collected'}
                            onPress={() => setSelected('cash_collected')}
                        />

                        <PaymentOptionBtn
                            label="Khách nợ (chưa thanh toán)"
                            description="Khách chưa trả. Sẽ tạo công nợ cho khách hàng. Không cần ảnh."
                            icon={<Warning size={20} color="#E53E3E" weight="fill" />}
                            color="#E53E3E"
                            selected={selected === 'client_credit'}
                            onPress={() => { setSelected('client_credit'); setProofUri(null); }}
                        />

                        {/* Proof photo (bắt buộc với bank + cash) */}
                        {needsProof ? (
                            <YStack gap={10} marginTop={8}>
                                <Text fontSize={12} fontWeight="700" color={appTheme.colors.text}>
                                    Ảnh xác minh thanh toán *
                                </Text>
                                {proofUri ? (
                                    <View style={styles.proofPreviewWrap}>
                                        <Image source={{ uri: proofUri }} style={styles.proofPreview} resizeMode="cover" />
                                        <TouchableOpacity style={styles.retakeBtn} onPress={takePhoto}>
                                            <Camera size={14} color="#fff" weight="fill" />
                                            <Text fontSize={11} fontWeight="700" color="#fff" marginLeft={4}>Chụp lại</Text>
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    <TouchableOpacity style={styles.cameraBtn} onPress={takePhoto}>
                                        <Camera size={22} color={appTheme.colors.primary} weight="fill" />
                                        <Text fontSize={13} fontWeight="700" color={appTheme.colors.primary} marginLeft={8}>
                                            Chụp ảnh xác minh
                                        </Text>
                                    </TouchableOpacity>
                                )}
                            </YStack>
                        ) : null}

                        {/* Submit */}
                        {selected ? (
                            <TouchableOpacity
                                style={[
                                    styles.submitBtn,
                                    (!proofUri && needsProof) && styles.submitBtnDisabled,
                                    isSubmitting && styles.submitBtnDisabled,
                                ]}
                                onPress={handleSubmit}
                                disabled={isSubmitting || (needsProof && !proofUri)}
                            >
                                <CheckCircle size={18} color="#fff" weight="fill" />
                                <Text fontSize={14} fontWeight="900" color="#fff" marginLeft={8}>
                                    {isSubmitting ? 'Đang ghi nhận...' : 'Xác nhận'}
                                </Text>
                            </TouchableOpacity>
                        ) : null}
                    </View>
                )}

            </ScrollView>
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    scroll: {
        padding: 16,
        paddingBottom: 40,
        gap: 12,
    },
    center: {
        flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24,
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
        width: 64, height: 64, borderRadius: 18,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: `${appTheme.colors.primary}18`,
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
    qrImage: {
        width: 220, height: 220,
        borderRadius: 12,
        backgroundColor: '#fff',
    },
    footer: {
        marginTop: 16,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: appTheme.colors.border,
        borderStyle: 'dashed',
    },
    // Payment selection card
    paymentCard: {
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 20,
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 2 },
        elevation: 4,
    },
    optionBtn: {
        borderWidth: 1.5,
        borderColor: appTheme.colors.border,
        borderRadius: 12,
        padding: 14,
        marginBottom: 10,
    },
    optionIcon: {
        width: 40, height: 40, borderRadius: 10,
        alignItems: 'center', justifyContent: 'center',
    },
    optionRadio: {
        width: 18, height: 18, borderRadius: 9,
        borderWidth: 2, borderColor: appTheme.colors.border,
    },
    cameraBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: appTheme.colors.primary,
        borderStyle: 'dashed',
        borderRadius: 12,
        padding: 14,
    },
    proofPreviewWrap: {
        borderRadius: 12,
        overflow: 'hidden',
        position: 'relative',
    },
    proofPreview: {
        width: '100%',
        height: 180,
        borderRadius: 12,
    },
    retakeBtn: {
        position: 'absolute',
        bottom: 8,
        right: 8,
        backgroundColor: 'rgba(0,0,0,0.65)',
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 5,
        flexDirection: 'row',
        alignItems: 'center',
    },
    submitBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: appTheme.colors.primary,
        borderRadius: 12,
        padding: 14,
        marginTop: 6,
    },
    submitBtnDisabled: {
        opacity: 0.45,
    },
    statusBanner: {
        backgroundColor: '#fff',
        borderRadius: 14,
        borderWidth: 1.5,
        overflow: 'hidden',
    },
});
