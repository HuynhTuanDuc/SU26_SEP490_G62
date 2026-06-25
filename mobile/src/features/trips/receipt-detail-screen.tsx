import { useEffect, useState } from 'react';
import {
    Image, ScrollView, StyleSheet, View, Pressable, ActivityIndicator, TextInput,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Receipt, MapPin, Truck, User, Ruler, Buildings, CurrencyCircleDollar, Clock, Camera } from 'phosphor-react-native';
import { Text, XStack, YStack } from 'tamagui';

import { ScreenHeader }          from '@/components/screen-header';
import { AppText }               from '@/components/app-text';
import { ReceiptDetailSkeleton } from '@/components/skeleton';
import { CameraModal }           from '@/features/trips/components/camera-modal';
import { appTheme }              from '@/theme/app-theme';
import { tripService }  from '@/services/trip-service';
import { useToast }     from '@/providers/ui-provider';
import type { CompanyInfo, DriverReceiptDetail, PaymentType } from '@/types/trip';

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
    client_credit:  'Công nợ khách hàng',
    qr_transfer:    'QR / Ví điện tử',
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

// ─── Payment collection section ───────────────────────────────────────────────

type CollectionType = 'cash_collected' | 'bank_transfer' | 'client_credit' | 'qr_transfer';

const COLLECTION_CFG: Record<CollectionType, { label: string; sublabel: string; color: string; bg: string; border: string; activeBg: string }> = {
    cash_collected: {
        label: 'Tài đã thu tiền mặt',
        sublabel: 'Bạn cầm tiền mặt — hệ thống ghi nợ tài',
        color: appTheme.colors.success,
        bg: '#F0FBF4',
        activeBg: appTheme.colors.successSoft,
        border: appTheme.colors.successBorder,
    },
    bank_transfer: {
        label: 'Khách trả về công ty',
        sublabel: 'Chuyển khoản / QR — công ty đã nhận',
        color: appTheme.colors.statusTransit,
        bg: '#EBF5FF',
        activeBg: '#D9ECFF',
        border: '#BFD9F7',
    },
    qr_transfer: {
        label: 'Khách trả QR / ví điện tử',
        sublabel: 'Thanh toán qua ví — công ty đã nhận',
        color: appTheme.colors.primary,
        bg: appTheme.colors.primarySoft,
        activeBg: appTheme.colors.primaryMuted,
        border: appTheme.colors.primaryMuted,
    },
    client_credit: {
        label: 'Khách chưa thanh toán',
        sublabel: 'Ghi công nợ — kế toán theo dõi thu hồi',
        color: appTheme.colors.warning,
        bg: '#FFFBEB',
        activeBg: appTheme.colors.warningSoft,
        border: appTheme.colors.warningBorder,
    },
};

function CollectionStatusBadge({ type }: { type: CollectionType }) {
    const labels: Record<CollectionType, string> = {
        cash_collected: 'Tài đã thu tiền mặt — nợ công ty',
        bank_transfer:  'Khách đã trả về công ty (chuyển khoản)',
        qr_transfer:    'Khách đã trả về công ty (QR / ví)',
        client_credit:  'Đã ghi nhận công nợ khách',
    };
    const cfg = COLLECTION_CFG[type] ?? COLLECTION_CFG.bank_transfer;
    return (
        <XStack
            padding={12} borderRadius={12} gap={8} alignItems="center"
            backgroundColor={cfg.activeBg} borderWidth={1} borderColor={cfg.border}
        >
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: cfg.color }} />
            <Text fontSize={13} fontWeight="700" color={cfg.color} flex={1}>{labels[type]}</Text>
        </XStack>
    );
}

function PaymentCollectionSection({
    receipt,
    onRecorded,
}: {
    receipt: DriverReceiptDetail;
    onRecorded: () => void;
}) {
    const { showToast } = useToast();
    const [selectedType, setSelectedType] = useState<CollectionType | null>(null);
    const [amountText,   setAmountText]   = useState('');
    const [proofUri,     setProofUri]     = useState<string | null>(null);
    const [showCamera,   setShowCamera]   = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error,        setError]        = useState<string | null>(null);

    const collectionDone = (receipt.driver_collection_type as CollectionType | null) ?? null;

    // ── Đã xác nhận: hiện kết quả ───────────────────────────────────────────
    if (collectionDone) {
        const confirmedAmount = receipt.driver_collected_amount
            ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
                  .format(Number(receipt.driver_collected_amount))
            : null;
        return (
            <YStack gap={10}>
                <Text fontSize={11} fontWeight="900" color={appTheme.colors.textMuted} letterSpacing={0.5}>
                    HÌNH THỨC THU TIỀN
                </Text>
                <CollectionStatusBadge type={collectionDone} />
                {confirmedAmount ? (
                    <XStack justifyContent="space-between" alignItems="center"
                        padding={10} borderRadius={10}
                        backgroundColor={appTheme.colors.surfaceSoft}
                        borderWidth={1} borderColor={appTheme.colors.border}
                    >
                        <Text fontSize={12} color={appTheme.colors.textMuted}>Số tiền khách trả</Text>
                        <Text fontSize={14} fontWeight="900" color={appTheme.colors.text}>{confirmedAmount}</Text>
                    </XStack>
                ) : null}
                {receipt.driver_proof_url ? (
                    <YStack gap={6}>
                        <Text fontSize={11} fontWeight="700" color={appTheme.colors.textMuted}>Ảnh bằng chứng</Text>
                        <Image
                            source={{ uri: receipt.driver_proof_url }}
                            style={{ width: '100%', height: 180, borderRadius: 12 }}
                            resizeMode="cover"
                        />
                    </YStack>
                ) : null}
            </YStack>
        );
    }

    // ── Chưa xác nhận: chọn hình thức + nhập thông tin ─────────────────────
    const handleSelectType = (type: CollectionType) => {
        setSelectedType(prev => (prev === type ? null : type));
        setAmountText('');
        setProofUri(null);
        setError(null);
    };

    const amountNum   = amountText.trim() ? Number(amountText.replace(/\./g, '').replace(',', '.')) : null;
    const amountValid = amountNum !== null && !isNaN(amountNum) && amountNum >= 0;
    const canSubmit   = selectedType !== null && amountValid && proofUri !== null && !isSubmitting;

    const handleSubmit = async () => {
        if (!selectedType) return;
        if (!amountValid || amountNum === null) { setError('Vui lòng nhập số tiền hợp lệ'); return; }
        if (!proofUri) { setError('Vui lòng chụp ảnh bằng chứng'); return; }

        setIsSubmitting(true);
        setError(null);
        try {
            const formData = new FormData();
            formData.append('collection_type',   selectedType);
            formData.append('collected_amount',  String(amountNum));
            const filename = proofUri.split('/').pop() ?? 'proof.jpg';
            const ext      = filename.split('.').pop()?.toLowerCase() ?? 'jpg';
            const mimeMap: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
            formData.append('proof', { uri: proofUri, name: filename, type: mimeMap[ext] ?? 'image/jpeg' } as unknown as Blob);

            await tripService.recordReceiptCollection(receipt.receipt_id, formData);
            showToast({
                type: 'success',
                message:
                    selectedType === 'cash_collected' ? 'Đã ghi nhận — bạn đang giữ tiền, nhớ nộp về công ty' :
                    selectedType === 'bank_transfer'  ? 'Đã xác nhận khách trả về công ty' :
                    selectedType === 'qr_transfer'    ? 'Đã xác nhận khách thanh toán QR' :
                                                        'Đã ghi nhận công nợ khách hàng',
            });
            onRecorded();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Không thể ghi nhận');
        } finally {
            setIsSubmitting(false);
        }
    };

    const OPTION_TYPES: CollectionType[] = ['bank_transfer', 'cash_collected', 'client_credit'];

    return (
        <>
            <YStack gap={10}>
                <Text fontSize={11} fontWeight="900" color={appTheme.colors.textMuted} letterSpacing={0.5}>
                    XÁC NHẬN THU TIỀN
                </Text>
                <Text fontSize={12} color={appTheme.colors.textMuted} lineHeight={18}>
                    Chọn hình thức thanh toán, nhập số tiền và chụp ảnh bằng chứng.
                </Text>

                {OPTION_TYPES.map((type) => {
                    const cfg      = COLLECTION_CFG[type];
                    const isActive = selectedType === type;
                    return (
                        <Pressable
                            key={type}
                            style={[
                                styles.collectionBtn,
                                {
                                    borderColor:     isActive ? cfg.color : cfg.border,
                                    backgroundColor: isActive ? cfg.activeBg : cfg.bg,
                                    borderWidth:     isActive ? 2 : 1.5,
                                    opacity:         selectedType !== null && !isActive ? 0.55 : 1,
                                },
                            ]}
                            onPress={() => handleSelectType(type)}
                            disabled={isSubmitting}
                        >
                            {type === 'bank_transfer'  && <Buildings size={20} color={cfg.color} weight="fill" />}
                            {type === 'cash_collected' && <CurrencyCircleDollar size={20} color={cfg.color} weight="fill" />}
                            {type === 'client_credit'  && <Clock size={20} color={cfg.color} weight="fill" />}
                            <YStack flex={1} gap={2}>
                                <Text fontSize={13} fontWeight="700" color={cfg.color}>{cfg.label}</Text>
                                <Text fontSize={11} color={appTheme.colors.textMuted}>{cfg.sublabel}</Text>
                            </YStack>
                            {isActive && (
                                <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: cfg.color, alignItems: 'center', justifyContent: 'center' }}>
                                    <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#fff' }} />
                                </View>
                            )}
                        </Pressable>
                    );
                })}

                {selectedType ? (
                    <YStack gap={10} padding={14} borderRadius={14}
                        backgroundColor={appTheme.colors.surfaceSoft}
                        borderWidth={1} borderColor={appTheme.colors.border}
                    >
                        <YStack gap={6}>
                            <Text fontSize={11} fontWeight="700" color={appTheme.colors.textMuted}>
                                SỐ TIỀN KHÁCH TRẢ (₫)
                            </Text>
                            <TextInput
                                value={amountText}
                                onChangeText={(t) => { setAmountText(t); setError(null); }}
                                keyboardType="numeric"
                                placeholder="Nhập số tiền..."
                                placeholderTextColor={appTheme.colors.textMuted}
                                style={styles.amountInput}
                                editable={!isSubmitting}
                            />
                            {selectedType === 'client_credit' ? (
                                <Text fontSize={11} color={appTheme.colors.warning}>
                                    Nhập 0 nếu khách chưa trả đồng nào.
                                </Text>
                            ) : null}
                        </YStack>

                        <YStack gap={6}>
                            <Text fontSize={11} fontWeight="700" color={appTheme.colors.textMuted}>
                                ẢNH BẰNG CHỨNG (BẮT BUỘC)
                            </Text>
                            {proofUri ? (
                                <Pressable onPress={() => setShowCamera(true)} disabled={isSubmitting}>
                                    <View style={styles.proofPreviewWrap}>
                                        <Image source={{ uri: proofUri }} style={styles.proofPreview} resizeMode="cover" />
                                        <View style={styles.proofOverlay}>
                                            <Camera size={16} color="#fff" />
                                            <Text fontSize={11} color="#fff" fontWeight="700">Chụp lại</Text>
                                        </View>
                                    </View>
                                </Pressable>
                            ) : (
                                <Pressable
                                    style={styles.cameraBtn}
                                    onPress={() => setShowCamera(true)}
                                    disabled={isSubmitting}
                                >
                                    <Camera size={20} color={appTheme.colors.primary} />
                                    <Text fontSize={13} fontWeight="700" color={appTheme.colors.primary}>
                                        Chụp ảnh bằng chứng
                                    </Text>
                                </Pressable>
                            )}
                        </YStack>

                        {error ? (
                            <Text fontSize={12} color={appTheme.colors.danger}>{error}</Text>
                        ) : null}

                        <Pressable
                            style={[styles.submitBtn, { backgroundColor: canSubmit ? COLLECTION_CFG[selectedType].color : appTheme.colors.border }]}
                            onPress={handleSubmit}
                            disabled={!canSubmit}
                        >
                            {isSubmitting
                                ? <ActivityIndicator size="small" color="#fff" />
                                : <Text fontSize={14} fontWeight="900" color="#fff">Xác nhận</Text>
                            }
                        </Pressable>
                    </YStack>
                ) : null}
            </YStack>

            <CameraModal
                visible={showCamera}
                label="Ảnh bằng chứng thu tiền"
                onCapture={(uri) => { setProofUri(uri); setShowCamera(false); }}
                onClose={() => setShowCamera(false)}
            />
        </>
    );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function ReceiptDetailScreen() {
    const { receiptId } = useLocalSearchParams<{ receiptId: string }>();
    const id = Number(receiptId);

    const [receipt,     setReceipt]     = useState<DriverReceiptDetail | null>(null);
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
    const [isLoading,   setIsLoading]   = useState(true);
    const [error,       setError]       = useState<string | null>(null);

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
            })
            .catch((err) => setError(err instanceof Error ? err.message : 'Không thể tải phiếu thu'))
            .finally(() => setIsLoading(false));
    };

    useEffect(() => { load(); }, [id]);

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

    const paymentColor = receipt.payment_type
        ? (PAYMENT_COLOR[receipt.payment_type] ?? appTheme.colors.primary)
        : appTheme.colors.textMuted;
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
                                {receipt.payment_type ? (PAYMENT_LABEL[receipt.payment_type] ?? receipt.payment_type) : 'Chưa xác nhận'}
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

                    {/* Bank QR — hiển thị khi payment_type là bank_transfer hoặc qr_transfer */}
                    {(receipt.payment_type === 'bank_transfer' || receipt.payment_type === 'qr_transfer') && companyInfo?.bank_qr_url ? (
                        <>
                            <Divider />
                            <YStack paddingVertical={14} gap={10} alignItems="center">
                                <Text fontSize={11} fontWeight="900" color={appTheme.colors.textMuted} letterSpacing={0.5} alignSelf="flex-start">
                                    QR THANH TOÁN
                                </Text>
                                <Image
                                    source={{ uri: companyInfo.bank_qr_url }}
                                    style={styles.qrImage}
                                    resizeMode="contain"
                                />
                                {(companyInfo.bank_name || companyInfo.bank_account_number || companyInfo.bank_account_name) ? (
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
                                ) : null}
                            </YStack>
                        </>
                    ) : null}

                    <Divider />

                    {/* Payment collection actions */}
                    <YStack paddingVertical={14} gap={0}>
                        <PaymentCollectionSection
                            receipt={receipt}
                            onRecorded={() => load()}
                        />
                    </YStack>

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
    qrImage: {
        width: 220,
        height: 220,
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
    collectionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        borderRadius: 14,
        borderWidth: 1.5,
    },
    amountInput: {
        borderWidth: 1,
        borderColor: appTheme.colors.border,
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 10,
        fontSize: 16,
        fontWeight: '700',
        color: appTheme.colors.text,
        backgroundColor: '#fff',
    },
    cameraBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: 14,
        borderRadius: 12,
        borderWidth: 1.5,
        borderStyle: 'dashed',
        borderColor: appTheme.colors.primary,
        backgroundColor: appTheme.colors.primarySoft,
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
    proofOverlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 10,
        backgroundColor: 'rgba(0,0,0,0.45)',
    },
    submitBtn: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: 14,
        borderRadius: 12,
        marginTop: 4,
    },
});

