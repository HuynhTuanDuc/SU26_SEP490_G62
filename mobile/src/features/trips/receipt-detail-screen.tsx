import { useEffect, useState } from 'react';
import {
    Alert, Image, KeyboardAvoidingView, Modal, Platform,
    ScrollView, StyleSheet, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { launchCameraAsync, MediaTypeOptions, requestCameraPermissionsAsync } from 'expo-image-picker';
import {
    Bank, Buildings, Camera, Car, CaretDown, CaretRight, CheckCircle,
    CurrencyDollar, MapPin, MapPinLine, Money, Package,
    PencilSimple, Phone, Receipt, Ruler, Scales,
    Truck, User, UserCircle, Warning, X,
} from 'phosphor-react-native';
import { Text, XStack, YStack } from 'tamagui';

import { ScreenHeader }          from '@/components/screen-header';
import { AppText }               from '@/components/app-text';
import { ReceiptDetailSkeleton } from '@/components/skeleton';
import { appTheme }              from '@/theme/app-theme';
import { tripService }           from '@/services/trip-service';
import type { CompanyInfo, DriverReceiptDetail, ExpenseItem, PaymentType } from '@/types/trip';

// ─── Types ────────────────────────────────────────────────────────────────────

type CollectionType = 'cash_collected' | 'bank_transfer' | 'client_credit';

// ─── Constants ────────────────────────────────────────────────────────────────

const EXPENSE_TYPE_LABEL: Record<string, string> = {
    fuel:         'Xăng dầu',
    toll:         'Phí đường bộ',
    parking:      'Phí đỗ xe',
    repair:       'Sửa chữa',
    maintenance:  'Bảo dưỡng',
    depreciation: 'Khấu hao',
    other:        'Khác',
};

const PAYMENT_LABEL: Record<PaymentType, string> = {
    cash_collected: 'Tiền mặt (Driver thu)',
    bank_transfer:  'Chuyển khoản về công ty',
    client_credit:  'Công nợ khách hàng',
    qr_transfer:    'QR / Ví điện tử',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtMoney = (v: string | number | null | undefined) => {
    if (v === null || v === undefined || Number(v) === 0) return '—';
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(v));
};

const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString('vi-VN', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });

// ─── Accordion section ────────────────────────────────────────────────────────

function AccordionSection({
    icon, title, badge, defaultOpen = false, children,
}: {
    icon: React.ReactNode;
    title: string;
    badge?: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
}) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <View style={styles.accordion}>
            <TouchableOpacity
                style={styles.accordionHeader}
                onPress={() => setOpen(v => !v)}
                activeOpacity={0.7}
            >
                <XStack alignItems="center" gap={8} flex={1}>
                    {icon}
                    <Text fontSize={13} fontWeight="700" color={appTheme.colors.text} flex={1}>
                        {title}
                    </Text>
                    {badge && !open ? (
                        <View style={styles.badge}>
                            <Text fontSize={11} fontWeight="700" color={appTheme.colors.primary}>{badge}</Text>
                        </View>
                    ) : null}
                </XStack>
                {open
                    ? <CaretDown size={14} color={appTheme.colors.textMuted} weight="bold" />
                    : <CaretRight size={14} color={appTheme.colors.textMuted} weight="bold" />}
            </TouchableOpacity>
            {open ? <View style={styles.accordionBody}>{children}</View> : null}
        </View>
    );
}

// ─── Info row ─────────────────────────────────────────────────────────────────

function Row({ label, value, bold, icon }: {
    label: string; value?: string | null; bold?: boolean; icon?: React.ReactNode;
}) {
    if (!value) return null;
    return (
        <XStack alignItems="flex-start" gap={8} paddingVertical={5}>
            <XStack alignItems="center" gap={5} width={120}>
                {icon ? <View style={{ width: 16, alignItems: 'center' }}>{icon}</View> : <View style={{ width: 16 }} />}
                <Text fontSize={12} color={appTheme.colors.textMuted} flex={1} numberOfLines={1}>{label}</Text>
            </XStack>
            <Text fontSize={12} fontWeight={bold ? '700' : '400'} color={appTheme.colors.text}
                flex={1} textAlign="right" numberOfLines={3}>
                {value}
            </Text>
        </XStack>
    );
}

// ─── Expense row (inside order accordion) ────────────────────────────────────

function ExpenseRow({ expense, onEdit }: { expense: ExpenseItem; onEdit: () => void }) {
    const [showPhotos, setShowPhotos] = useState(false);
    return (
        <View style={styles.expenseRow}>
            <XStack justifyContent="space-between" alignItems="center">
                <YStack flex={1} gap={1}>
                    <Text fontSize={12} fontWeight="700" color={appTheme.colors.text}>
                        {EXPENSE_TYPE_LABEL[expense.expense_type] ?? expense.expense_type}
                    </Text>
                    {expense.description ? (
                        <Text fontSize={11} color={appTheme.colors.textMuted} numberOfLines={1}>
                            {expense.description}
                        </Text>
                    ) : null}
                </YStack>
                <XStack alignItems="center" gap={8}>
                    <Text fontSize={13} fontWeight="900" color={appTheme.colors.primary}>
                        {fmtMoney(expense.amount)}
                    </Text>
                    {expense.receipt_urls.length > 0 ? (
                        <TouchableOpacity onPress={() => setShowPhotos(v => !v)} style={styles.photoBtn}>
                            <Camera size={13} color={appTheme.colors.textMuted} weight="fill" />
                            <Text fontSize={10} color={appTheme.colors.textMuted} marginLeft={2}>
                                {expense.receipt_urls.length}
                            </Text>
                        </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity onPress={onEdit} style={styles.editChip}>
                        <PencilSimple size={12} color={appTheme.colors.primary} weight="fill" />
                    </TouchableOpacity>
                </XStack>
            </XStack>

            {showPhotos && expense.receipt_urls.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                    <XStack gap={8}>
                        {expense.receipt_urls.map((url, i) => (
                            <Image key={i} source={{ uri: url }} style={styles.expenseThumb} resizeMode="cover" />
                        ))}
                    </XStack>
                </ScrollView>
            ) : null}
        </View>
    );
}

// ─── Expense edit modal ───────────────────────────────────────────────────────

function ExpenseEditModal({
    expense, visible, onClose, onSaved,
}: {
    expense: ExpenseItem | null;
    visible: boolean;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [amount,      setAmount]      = useState('');
    const [description, setDescription] = useState('');
    const [photoUri,    setPhotoUri]    = useState<string | null>(null);
    const [saving,      setSaving]      = useState(false);

    useEffect(() => {
        if (expense) {
            setAmount(expense.amount);
            setDescription(expense.description ?? '');
            setPhotoUri(null);
        }
    }, [expense]);

    const takePhoto = async () => {
        const { status } = await requestCameraPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Từ chối', 'Cần quyền camera.'); return; }
        const result = await launchCameraAsync({ mediaTypes: MediaTypeOptions.Images, quality: 0.8 });
        if (!result.canceled) setPhotoUri(result.assets[0]?.uri ?? null);
    };

    const save = async () => {
        if (!expense) return;
        if (!amount || Number(amount) <= 0) { Alert.alert('Lỗi', 'Số tiền phải lớn hơn 0'); return; }
        setSaving(true);
        try {
            const fd = new FormData();
            fd.append('amount', amount);
            if (description) fd.append('description', description);
            if (photoUri) {
                const name = photoUri.split('/').pop() ?? 'receipt.jpg';
                fd.append('receipt', { uri: photoUri, name, type: 'image/jpeg' } as any);
            }
            await tripService.updateExpense(expense.id, fd);
            onSaved();
            onClose();
        } catch (err: any) {
            Alert.alert('Lỗi', err?.message ?? 'Không thể cập nhật chi phí');
        } finally {
            setSaving(false);
        }
    };

    if (!expense) return null;

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalBox}>
                        <XStack justifyContent="space-between" alignItems="center" marginBottom={16}>
                            <Text fontSize={15} fontWeight="900" color={appTheme.colors.text}>
                                Sửa — {EXPENSE_TYPE_LABEL[expense.expense_type] ?? expense.expense_type}
                            </Text>
                            <TouchableOpacity onPress={onClose}><X size={20} color={appTheme.colors.textMuted} /></TouchableOpacity>
                        </XStack>

                        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                            <Text fontSize={12} color={appTheme.colors.textMuted} marginBottom={6}>Số tiền (VNĐ)</Text>
                            <TextInput style={styles.textInput} value={amount} onChangeText={setAmount}
                                keyboardType="numeric" placeholder="Nhập số tiền" />

                            <Text fontSize={12} color={appTheme.colors.textMuted} marginTop={12} marginBottom={6}>Ghi chú</Text>
                            <TextInput style={[styles.textInput, { minHeight: 56 }]} value={description}
                                onChangeText={setDescription} placeholder="Mô tả (không bắt buộc)" multiline />

                            <Text fontSize={12} color={appTheme.colors.textMuted} marginTop={12} marginBottom={6}>
                                Ảnh chứng từ {photoUri ? '(mới)' : '(giữ nguyên nếu không chụp)'}
                            </Text>
                            {photoUri
                                ? <Image source={{ uri: photoUri }} style={styles.modalPreview} resizeMode="cover" />
                                : null}
                            <TouchableOpacity style={styles.camBtn} onPress={takePhoto}>
                                <Camera size={15} color={appTheme.colors.primary} weight="fill" />
                                <Text fontSize={13} color={appTheme.colors.primary} marginLeft={6}>
                                    {photoUri ? 'Chụp lại' : 'Chụp ảnh mới'}
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.saveBtn, saving && { opacity: 0.5 }]}
                                onPress={save} disabled={saving}
                            >
                                <Text fontSize={14} fontWeight="900" color="#fff">
                                    {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
                                </Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

// ─── Payment option button ────────────────────────────────────────────────────

function PaymentOptionBtn({
    label, description, icon, color, selected, onPress,
}: {
    label: string; description: string; icon: React.ReactNode;
    color: string; selected: boolean; onPress: () => void;
}) {
    return (
        <TouchableOpacity
            onPress={onPress}
            style={[styles.optionBtn, selected && { borderColor: color, backgroundColor: `${color}10` }]}
        >
            <XStack alignItems="center" gap={10}>
                <View style={[styles.optionIcon, { backgroundColor: `${color}18` }]}>{icon}</View>
                <YStack flex={1} gap={1}>
                    <Text fontSize={13} fontWeight="700" color={selected ? color : appTheme.colors.text}>
                        {label}
                    </Text>
                    <Text fontSize={11} color={appTheme.colors.textMuted} numberOfLines={2}>{description}</Text>
                </YStack>
                <View style={[styles.radioCircle, selected && { borderColor: color, backgroundColor: color }]} />
            </XStack>
        </TouchableOpacity>
    );
}

// ─── Recorded / debt banner ───────────────────────────────────────────────────

function RecordedBanner({ pt, hasDriverDebt }: { pt: PaymentType; hasDriverDebt: boolean }) {
    const configs = {
        cash_collected: {
            color:  hasDriverDebt ? appTheme.colors.warningText : appTheme.colors.success,
            bg:     hasDriverDebt ? appTheme.colors.warningSoft  : appTheme.colors.successSoft,
            bc:     hasDriverDebt ? appTheme.colors.warningBorder : appTheme.colors.successBorder,
            icon:   hasDriverDebt
                ? <Warning size={18} color={appTheme.colors.warningText} weight="fill" />
                : <CheckCircle size={18} color={appTheme.colors.success} weight="fill" />,
            title:  hasDriverDebt ? 'Bạn đang có công nợ từ chuyến này' : 'Công nợ đã được thanh toán',
            sub:    hasDriverDebt ? 'Tiền mặt đã ghi nhận — vui lòng nộp về công ty.' : null,
        },
        bank_transfer: {
            color: appTheme.colors.success, bg: appTheme.colors.successSoft,
            bc: appTheme.colors.successBorder,
            icon: <CheckCircle size={18} color={appTheme.colors.success} weight="fill" />,
            title: 'Chuyển khoản về công ty — đã ghi nhận', sub: null,
        },
        client_credit: {
            color: '#E53E3E', bg: '#FEF2F2', bc: '#FCA5A5',
            icon: <Warning size={18} color="#E53E3E" weight="fill" />,
            title: 'Khách đang nợ công ty', sub: 'Đã tạo công nợ khách hàng.',
        },
        qr_transfer: {
            color: appTheme.colors.success, bg: appTheme.colors.successSoft,
            bc: appTheme.colors.successBorder,
            icon: <CheckCircle size={18} color={appTheme.colors.success} weight="fill" />,
            title: 'QR / Ví điện tử — đã ghi nhận', sub: null,
        },
    };
    const c = configs[pt];
    if (!c) return null;
    return (
        <View style={[styles.statusBanner, { borderColor: c.bc, backgroundColor: c.bg }]}>
            <XStack alignItems="center" gap={10} padding={14}>
                {c.icon}
                <YStack flex={1} gap={2}>
                    <Text fontSize={13} fontWeight="900" color={c.color}>{c.title}</Text>
                    {c.sub ? <Text fontSize={11} color={c.color} opacity={0.85}>{c.sub}</Text> : null}
                </YStack>
            </XStack>
        </View>
    );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function ReceiptDetailScreen() {
    const { receiptId } = useLocalSearchParams<{ receiptId: string }>();
    const id = Number(receiptId);

    const [receipt,      setReceipt]      = useState<DriverReceiptDetail | null>(null);
    const [companyInfo,  setCompanyInfo]  = useState<CompanyInfo | null>(null);
    const [isLoading,    setIsLoading]    = useState(true);
    const [error,        setError]        = useState<string | null>(null);

    const [selected,     setSelected]     = useState<CollectionType | null>(null);
    const [proofUri,     setProofUri]     = useState<string | null>(null);
    const [cashAmount,   setCashAmount]   = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [editExpense,  setEditExpense]  = useState<ExpenseItem | null>(null);
    const [resubmitting, setResubmitting] = useState(false);
    const [driverNote,   setDriverNote]   = useState('');

    const load = () => {
        if (!id) { setError('ID không hợp lệ'); setIsLoading(false); return; }
        setIsLoading(true);
        Promise.all([tripService.getDriverReceiptDetail(id), tripService.getCompanyInfo()])
            .then(([{ receipt: data }, { info }]) => {
                setReceipt(data);
                setCompanyInfo(info);
                if (!data.payment_type) {
                    const hint = data.order_payment_type;
                    if (hint === 'cash' || hint === 'cash_collected') setSelected('cash_collected');
                    else if (hint === 'bank_transfer' || hint === 'qr_transfer') setSelected('bank_transfer');
                    // pre-fill với tổng dự kiến (cước + chi phí)
                    const expenses = data.expenses ?? [];
                    const expTotal = expenses.reduce((s: number, e: any) => s + Number(e.amount), 0);
                    setCashAmount(String(Number(data.amount) + expTotal));
                }
            })
            .catch(err => setError(err instanceof Error ? err.message : 'Không thể tải phiếu thu'))
            .finally(() => setIsLoading(false));
    };

    useEffect(() => { load(); }, [id]);

    const takeProofPhoto = async () => {
        const { status } = await requestCameraPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Từ chối', 'Cần quyền camera.'); return; }
        const result = await launchCameraAsync({ mediaTypes: MediaTypeOptions.Images, quality: 0.8 });
        if (!result.canceled && result.assets[0]) setProofUri(result.assets[0].uri);
    };

    const handleSubmitCollection = async () => {
        if (!selected || !receipt) return;
        if (selected === 'cash_collected') {
            if (!cashAmount || Number(cashAmount) <= 0) {
                Alert.alert('Thiếu thông tin', 'Vui lòng nhập số tiền nhận từ khách.');
                return;
            }
            if (!proofUri) {
                Alert.alert('Thiếu ảnh', 'Vui lòng chụp ảnh xác minh tiền mặt.');
                return;
            }
        }
        if (selected === 'bank_transfer' && !proofUri) {
            Alert.alert('Thiếu ảnh', 'Vui lòng chụp ảnh xác minh chuyển khoản.');
            return;
        }

        const expectedTotal = Number(receipt.amount) + totalExpenses;
        const actualCash    = Number(cashAmount);
        const diffNote      = selected === 'cash_collected' && actualCash !== expectedTotal
            ? `\nChênh lệch: ${(actualCash - expectedTotal).toLocaleString('vi-VN')}₫`
            : '';

        const msg: Record<CollectionType, string> = {
            cash_collected: `Xác nhận khách đã trả ${Number(cashAmount).toLocaleString('vi-VN')}₫ tiền mặt?${diffNote}\nSẽ tạo công nợ cho bạn.`,
            bank_transfer:  'Xác nhận khách đã chuyển khoản về công ty?',
            client_credit:  'Xác nhận khách chưa thanh toán?\nSẽ tạo công nợ cho khách hàng.',
        };
        Alert.alert('Xác nhận', msg[selected], [
            { text: 'Huỷ', style: 'cancel' },
            {
                text: 'Đồng ý', onPress: async () => {
                    setIsSubmitting(true);
                    try {
                        const targetId = receipt.actual_receipt_id ?? receipt.receipt_id;
                        const fd = new FormData();
                        fd.append('payment_type', selected);
                        if (selected === 'cash_collected') {
                            fd.append('notes', `Tiền nhận thực tế: ${Number(cashAmount).toLocaleString('vi-VN')}₫${diffNote}`);
                        }
                        if (proofUri) {
                            const name = proofUri.split('/').pop() ?? 'proof.jpg';
                            fd.append('proof', { uri: proofUri, name, type: 'image/jpeg' } as any);
                        }
                        await tripService.recordReceiptCollection(targetId, fd);
                        setProofUri(null);
                        load();
                    } catch (err: any) {
                        Alert.alert('Lỗi', err?.message ?? 'Thử lại.');
                    } finally {
                        setIsSubmitting(false);
                    }
                },
            },
        ]);
    };

    const handleResubmit = async () => {
        if (!receipt) return;
        setResubmitting(true);
        try {
            await tripService.resubmitReceiptRequest(receipt.orr_id, driverNote.trim() || undefined);
            setDriverNote('');
            load();
        } catch (err: any) {
            Alert.alert('Lỗi', err?.message ?? 'Không thể gửi lại yêu cầu.');
        } finally {
            setResubmitting(false);
        }
    };

    // ── Render loading / error ────────────────────────────────────────────────

    if (isLoading) {
        return (
            <View style={{ flex: 1, backgroundColor: '#F0F4FF' }}>
                <ScreenHeader title="Phiếu thu" showBack />
                <ScrollView showsVerticalScrollIndicator={false}><ReceiptDetailSkeleton /></ScrollView>
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

    const isApproved      = receipt.request_status === 'approved';
    const isRejected      = receipt.request_status === 'rejected';
    const alreadyRecorded = isApproved && receipt.payment_type !== null;
    const needsProof      = selected === 'cash_collected' || selected === 'bank_transfer';
    const totalExpenses   = receipt.expenses.reduce((s, e) => s + Number(e.amount), 0);
    const kmDisplay       = receipt.actual_distance_km
        ? `${Number(receipt.actual_distance_km).toLocaleString('vi-VN')} km`
        : receipt.estimated_distance_km
            ? `${Number(receipt.estimated_distance_km).toLocaleString('vi-VN')} km (ước tính)`
            : null;

    return (
        <View style={{ flex: 1, backgroundColor: '#F0F4FF' }}>
            <ScreenHeader title="Phiếu thu" showBack />

            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

                {/* ── Rejection banner ──────────────────────────────────── */}
                {isRejected ? (
                    <View style={[styles.statusBanner, { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' }]}>
                        <YStack padding={14} gap={10}>
                            <XStack alignItems="center" gap={8}>
                                <Warning size={18} color="#E53E3E" weight="fill" />
                                <Text fontSize={14} fontWeight="900" color="#E53E3E">Yêu cầu đã bị từ chối</Text>
                            </XStack>

                            {receipt.rejection_reason ? (
                                <View style={styles.reasonBox}>
                                    <Text fontSize={11} fontWeight="700" color="#7F1D1D" marginBottom={2}>
                                        Lý do từ chối:
                                    </Text>
                                    <Text fontSize={12} color="#7F1D1D" lineHeight={18}>
                                        {receipt.rejection_reason}
                                    </Text>
                                </View>
                            ) : null}

                            <Text fontSize={12} color={appTheme.colors.textMuted} lineHeight={18}>
                                Hãy kiểm tra lại chi phí phát sinh bên dưới, cập nhật nếu cần, sau đó gửi lại.
                            </Text>

                            {/* Driver note trước khi gửi lại */}
                            <YStack gap={6}>
                                <Text fontSize={12} fontWeight="700" color={appTheme.colors.text}>
                                    Ghi chú cập nhật (không bắt buộc)
                                </Text>
                                <TextInput
                                    style={styles.noteInput}
                                    value={driverNote}
                                    onChangeText={setDriverNote}
                                    placeholder="Giải thích thay đổi hoặc bổ sung thông tin..."
                                    placeholderTextColor={appTheme.colors.textMuted}
                                    multiline
                                    numberOfLines={3}
                                    textAlignVertical="top"
                                />
                            </YStack>

                            <TouchableOpacity
                                style={[styles.resubmitBtn, resubmitting && { opacity: 0.5 }]}
                                onPress={handleResubmit} disabled={resubmitting}
                            >
                                <Text fontSize={13} fontWeight="900" color="#fff">
                                    {resubmitting ? 'Đang gửi...' : 'Gửi lại yêu cầu tạo phiếu thu'}
                                </Text>
                            </TouchableOpacity>
                        </YStack>
                    </View>
                ) : null}

                {/* ── Main receipt card ─────────────────────────────────── */}
                <View style={styles.card}>

                    {/* ── Header ──────────────────────────────────────────── */}
                    <YStack alignItems="center" gap={4} paddingBottom={16}>
                        <View style={styles.receiptIconWrap}>
                            <Receipt size={28} color={appTheme.colors.primary} weight="fill" />
                        </View>
                        <Text fontSize={10} fontWeight="700" color={appTheme.colors.textMuted} letterSpacing={2}>
                            PHIẾU THU VẬN CHUYỂN
                        </Text>
                        <Text fontSize={12} color={appTheme.colors.textMuted}>
                            #{String(receipt.receipt_id).padStart(6, '0')} · {fmtDate(receipt.collected_at)}
                        </Text>
                    </YStack>

                    {/* ── Amount hero ─────────────────────────────────────── */}
                    <View style={styles.amountBox}>
                        <Text fontSize={10} fontWeight="700" color={appTheme.colors.textMuted} letterSpacing={1}>
                            TỔNG THU
                        </Text>
                        <Text fontSize={36} fontWeight="900" color={appTheme.colors.primary} marginTop={2}>
                            {fmtMoney(Number(receipt.amount) + totalExpenses)}
                        </Text>

                        {/* Breakdown nếu có chi phí phát sinh */}
                        {totalExpenses > 0 ? (
                            <View style={styles.amountBreakdown}>
                                <XStack justifyContent="space-between" paddingVertical={3}>
                                    <Text fontSize={11} color={appTheme.colors.textMuted}>Cước vận chuyển</Text>
                                    <Text fontSize={11} color={appTheme.colors.text}>{fmtMoney(receipt.amount)}</Text>
                                </XStack>
                                <XStack justifyContent="space-between" paddingVertical={3}>
                                    <Text fontSize={11} color={appTheme.colors.textMuted}>Chi phí phát sinh</Text>
                                    <Text fontSize={11} color={appTheme.colors.primary}>+{fmtMoney(totalExpenses)}</Text>
                                </XStack>
                            </View>
                        ) : null}

                        <View style={[
                            styles.statusChip,
                            alreadyRecorded
                                ? { backgroundColor: `${appTheme.colors.success}18` }
                                : isRejected
                                    ? { backgroundColor: '#FEF2F2' }
                                    : { backgroundColor: `${appTheme.colors.warning}18` },
                        ]}>
                            <Text fontSize={11} fontWeight="700" color={
                                alreadyRecorded ? appTheme.colors.success
                                    : isRejected ? '#E53E3E'
                                    : appTheme.colors.warning
                            }>
                                {alreadyRecorded
                                    ? (PAYMENT_LABEL[receipt.payment_type!] ?? receipt.payment_type)
                                    : isRejected ? 'Yêu cầu bị từ chối'
                                    : 'Chưa xác nhận thanh toán'}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.divider} />

                    {/* ── Accordion: Khách hàng ────────────────────────────── */}
                    <AccordionSection
                        icon={<User size={15} color={appTheme.colors.primary} weight="fill" />}
                        title="Khách hàng"
                        badge={receipt.customer_name ?? undefined}
                    >
                        <Row icon={<User size={13} color={appTheme.colors.primary} weight="fill" />}
                            label="Tên" value={receipt.customer_name} bold />
                        <Row icon={<Buildings size={13} color={appTheme.colors.primary} weight="fill" />}
                            label="Công ty" value={receipt.customer_company} />
                        <Row icon={<Phone size={13} color={appTheme.colors.primary} weight="fill" />}
                            label="Điện thoại" value={receipt.customer_phone} />
                        <Row icon={<MapPin size={13} color={appTheme.colors.primary} weight="fill" />}
                            label="Địa chỉ" value={receipt.customer_address} />
                    </AccordionSection>

                    <View style={styles.divider} />

                    {/* ── Accordion: Đơn hàng + chi phí ───────────────────── */}
                    <AccordionSection
                        icon={<Package size={15} color={appTheme.colors.primary} weight="fill" />}
                        title={`Đơn hàng #${receipt.order_id}`}
                        badge={receipt.cargo_name ?? undefined}
                        defaultOpen
                    >
                        <Row icon={<Package size={13} color={appTheme.colors.primary} weight="fill" />}
                            label="Hàng hóa" value={receipt.cargo_name} bold />
                        {receipt.cargo_weight_kg ? (
                            <Row icon={<Scales size={13} color={appTheme.colors.primary} weight="fill" />}
                                label="Khối lượng" value={`${receipt.cargo_weight_kg} kg`} />
                        ) : null}
                        <Row icon={<MapPinLine size={13} color={appTheme.colors.primary} weight="fill" />}
                            label="Điểm lấy hàng" value={receipt.pickup_address} />
                        <Row icon={<MapPin size={13} color={appTheme.colors.primary} weight="fill" />}
                            label="Điểm giao hàng" value={receipt.delivery_address} />
                        {kmDisplay ? (
                            <Row icon={<Ruler size={13} color={appTheme.colors.primary} weight="fill" />}
                                label="Quãng đường" value={kmDisplay} />
                        ) : null}
                        <Row icon={<CurrencyDollar size={13} color={appTheme.colors.primary} weight="fill" />}
                            label="Đơn giá thực" value={receipt.actual_price ? fmtMoney(receipt.actual_price) : null} />
                        <Row icon={<CurrencyDollar size={13} color={appTheme.colors.textMuted} weight="fill" />}
                            label="Đơn giá ước" value={!receipt.actual_price && receipt.estimated_price ? fmtMoney(receipt.estimated_price) : null} />

                        {/* Chi phí phát sinh */}
                        <View style={styles.expenseBlock}>
                            <XStack justifyContent="space-between" alignItems="center" marginBottom={8}>
                                <XStack gap={5} alignItems="center">
                                    <CurrencyDollar size={13} color={appTheme.colors.primary} weight="fill" />
                                    <Text fontSize={12} fontWeight="700" color={appTheme.colors.text}>
                                        Chi phí phát sinh
                                    </Text>
                                </XStack>
                                {totalExpenses > 0 ? (
                                    <Text fontSize={12} fontWeight="900" color={appTheme.colors.primary}>
                                        {fmtMoney(totalExpenses)}
                                    </Text>
                                ) : null}
                            </XStack>

                            {receipt.expenses.length === 0 ? (
                                <Text fontSize={11} color={appTheme.colors.textMuted} textAlign="center" paddingVertical={6}>
                                    Không có chi phí phát sinh
                                </Text>
                            ) : (
                                <YStack gap={8}>
                                    {receipt.expenses.map(exp => (
                                        <ExpenseRow
                                            key={exp.id}
                                            expense={exp}
                                            onEdit={() => setEditExpense(exp)}
                                        />
                                    ))}
                                </YStack>
                            )}
                        </View>
                    </AccordionSection>

                    <View style={styles.divider} />

                    {/* ── Accordion: Tài xế & xe ───────────────────────────── */}
                    <AccordionSection
                        icon={<Truck size={15} color={appTheme.colors.primary} weight="fill" />}
                        title="Tài xế & xe"
                        badge={receipt.plate_number ?? undefined}
                    >
                        <Row icon={<User size={13} color={appTheme.colors.primary} weight="fill" />}
                            label="Tài xế" value={receipt.driver_name} bold />
                        <Row icon={<Phone size={13} color={appTheme.colors.primary} weight="fill" />}
                            label="Điện thoại" value={receipt.driver_phone} />
                        <Row icon={<Car size={13} color={appTheme.colors.primary} weight="fill" />}
                            label="Biển số" value={receipt.plate_number} />
                        <Row icon={<UserCircle size={13} color={appTheme.colors.primary} weight="fill" />}
                            label="Phụ trách" value={receipt.coordinator_name} />
                    </AccordionSection>

                    {receipt.notes ? (
                        <>
                            <View style={styles.divider} />
                            <YStack gap={4} paddingVertical={10} paddingHorizontal={2}>
                                <Text fontSize={11} fontWeight="700" color={appTheme.colors.textMuted}>GHI CHÚ</Text>
                                <Text fontSize={12} color={appTheme.colors.text} lineHeight={18}>{receipt.notes}</Text>
                            </YStack>
                        </>
                    ) : null}

                    {/* ── QR bank (luôn hiển thị) ──────────────────────────── */}
                    {companyInfo?.bank_qr_url ? (
                        <>
                            <View style={styles.divider} />
                            <AccordionSection
                                icon={<Bank size={15} color={appTheme.colors.primary} weight="fill" />}
                                title="QR chuyển khoản công ty"
                            >
                                <YStack gap={8} alignItems="center">
                                    <Image source={{ uri: companyInfo.bank_qr_url }} style={styles.qrImage} resizeMode="contain" />
                                    {companyInfo.bank_account_name ? (
                                        <Row label="Tên TK" value={companyInfo.bank_account_name} />
                                    ) : null}
                                    {companyInfo.bank_account_number ? (
                                        <Row label="Số TK" value={companyInfo.bank_account_number} bold />
                                    ) : null}
                                    {companyInfo.bank_name ? (
                                        <Row label="Ngân hàng" value={companyInfo.bank_name} />
                                    ) : null}
                                </YStack>
                            </AccordionSection>
                        </>
                    ) : null}

                    <View style={[styles.divider, { marginTop: 8 }]} />
                    <Text fontSize={10} color={appTheme.colors.textMuted} textAlign="center" paddingTop={10}>
                        Phiếu thu hợp lệ — phát hành bởi hệ thống quản lý vận tải
                    </Text>
                </View>

                {/* ── Recorded status ───────────────────────────────────────── */}
                {alreadyRecorded ? (
                    <RecordedBanner pt={receipt.payment_type!} hasDriverDebt={receipt.has_driver_debt} />
                ) : null}

                {/* ── 3-button payment (chỉ khi approved + chưa ghi nhận) ─── */}
                {isApproved && !alreadyRecorded ? (
                    <View style={styles.card}>
                        <Text fontSize={14} fontWeight="900" color={appTheme.colors.text} marginBottom={4}>
                            Khách thanh toán thế nào?
                        </Text>
                        <Text fontSize={12} color={appTheme.colors.textMuted} marginBottom={14}>
                            Chọn đúng hình thức để ghi nhận công nợ chính xác.
                        </Text>

                        <PaymentOptionBtn
                            label="Khách chuyển khoản về công ty"
                            description="Khách scan QR hoặc chuyển khoản. Cần chụp ảnh xác nhận."
                            icon={<Bank size={20} color="#2F80ED" weight="fill" />}
                            color="#2F80ED"
                            selected={selected === 'bank_transfer'}
                            onPress={() => setSelected('bank_transfer')}
                        />
                        <PaymentOptionBtn
                            label="Khách trả tiền mặt cho tài"
                            description="Bạn nhận tiền mặt từ khách. Cần ảnh. Sẽ tạo công nợ cho bạn."
                            icon={<Money size={20} color={appTheme.colors.success} weight="fill" />}
                            color={appTheme.colors.success}
                            selected={selected === 'cash_collected'}
                            onPress={() => setSelected('cash_collected')}
                        />
                        <PaymentOptionBtn
                            label="Khách nợ (chưa thanh toán)"
                            description="Khách chưa trả. Sẽ tạo công nợ cho khách hàng."
                            icon={<Warning size={20} color="#E53E3E" weight="fill" />}
                            color="#E53E3E"
                            selected={selected === 'client_credit'}
                            onPress={() => { setSelected('client_credit'); setProofUri(null); }}
                        />

                        {/* Input số tiền nhận từ khách (chỉ cash_collected) */}
                        {selected === 'cash_collected' ? (
                            <YStack gap={6} marginTop={6}
                                style={{ borderWidth: 1.5, borderColor: appTheme.colors.success + '60',
                                    borderRadius: 12, padding: 12, backgroundColor: appTheme.colors.successSoft }}>
                                <XStack alignItems="center" gap={6}>
                                    <Money size={15} color={appTheme.colors.success} weight="fill" />
                                    <Text fontSize={12} fontWeight="700" color={appTheme.colors.successText}>
                                        Số tiền nhận từ khách *
                                    </Text>
                                </XStack>
                                <TextInput
                                    style={[styles.textInput, { fontSize: 18, fontWeight: '700',
                                        color: appTheme.colors.text, borderColor: appTheme.colors.success + '80' }]}
                                    value={cashAmount}
                                    onChangeText={v => setCashAmount(v.replace(/[^0-9]/g, ''))}
                                    keyboardType="numeric"
                                    placeholder="0"
                                    placeholderTextColor={appTheme.colors.textMuted}
                                />
                                {cashAmount && Number(cashAmount) !== (Number(receipt?.amount) + totalExpenses) ? (
                                    <XStack alignItems="center" gap={4}>
                                        <Warning size={12} color={appTheme.colors.warningText} weight="fill" />
                                        <Text fontSize={11} color={appTheme.colors.warningText}>
                                            Khác tổng dự kiến{' '}
                                            {(Number(receipt?.amount) + totalExpenses).toLocaleString('vi-VN')}₫
                                            {' '}(chênh {(Number(cashAmount) - Number(receipt?.amount) - totalExpenses).toLocaleString('vi-VN')}₫)
                                        </Text>
                                    </XStack>
                                ) : null}
                            </YStack>
                        ) : null}

                        {needsProof ? (
                            <YStack gap={10} marginTop={6}>
                                <Text fontSize={12} fontWeight="700" color={appTheme.colors.text}>Ảnh xác minh *</Text>
                                {proofUri ? (
                                    <View style={styles.proofWrap}>
                                        <Image source={{ uri: proofUri }} style={styles.proofImg} resizeMode="cover" />
                                        <TouchableOpacity style={styles.retakeBtn} onPress={takeProofPhoto}>
                                            <Camera size={13} color="#fff" weight="fill" />
                                            <Text fontSize={11} color="#fff" marginLeft={4}>Chụp lại</Text>
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    <TouchableOpacity style={styles.camBtn} onPress={takeProofPhoto}>
                                        <Camera size={20} color={appTheme.colors.primary} weight="fill" />
                                        <Text fontSize={13} fontWeight="700" color={appTheme.colors.primary} marginLeft={8}>
                                            Chụp ảnh xác minh
                                        </Text>
                                    </TouchableOpacity>
                                )}
                            </YStack>
                        ) : null}

                        {selected ? (
                            <TouchableOpacity
                                style={[styles.saveBtn, (isSubmitting
                                    || (selected === 'cash_collected' && (!cashAmount || Number(cashAmount) <= 0))
                                    || (needsProof && !proofUri)) && { opacity: 0.45 }]}
                                onPress={handleSubmitCollection}
                                disabled={isSubmitting
                                    || (selected === 'cash_collected' && (!cashAmount || Number(cashAmount) <= 0))
                                    || (needsProof && !proofUri)}
                            >
                                <CheckCircle size={18} color="#fff" weight="fill" />
                                <Text fontSize={14} fontWeight="900" color="#fff" marginLeft={8}>
                                    {isSubmitting ? 'Đang ghi nhận...' : 'Xác nhận'}
                                </Text>
                            </TouchableOpacity>
                        ) : null}
                    </View>
                ) : null}

            </ScrollView>

            <ExpenseEditModal
                expense={editExpense}
                visible={editExpense !== null}
                onClose={() => setEditExpense(null)}
                onSaved={load}
            />
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    scroll:         { padding: 16, paddingBottom: 40, gap: 12 },
    center:         { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    card:           {
        backgroundColor: '#fff', borderRadius: 18, padding: 20,
        shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 14,
        shadowOffset: { width: 0, height: 3 }, elevation: 5,
    },
    receiptIconWrap: {
        width: 52, height: 52, borderRadius: 14,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: `${appTheme.colors.primary}15`,
        marginBottom: 4,
    },
    amountBox:      { alignItems: 'center', paddingVertical: 18, gap: 6 },
    amountBreakdown: {
        width: '100%', backgroundColor: `${appTheme.colors.primary}08`,
        borderRadius: 10, paddingHorizontal: 14, paddingVertical: 4,
        borderWidth: 1, borderColor: `${appTheme.colors.border}`,
    },
    statusChip:     { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, marginTop: 2 },
    divider:        { height: 1, backgroundColor: appTheme.colors.border, marginVertical: 2 },
    statusBanner:   { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1.5, overflow: 'hidden' },
    // Accordion
    accordion:      { paddingVertical: 2 },
    accordionHeader: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingVertical: 11, gap: 8,
    },
    accordionBody:  { paddingBottom: 10, paddingLeft: 4 },
    badge:          {
        backgroundColor: `${appTheme.colors.primary}12`,
        paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, maxWidth: 120,
    },
    // Expenses
    expenseBlock:   {
        marginTop: 14, paddingTop: 12,
        borderTopWidth: 1, borderTopColor: appTheme.colors.border, borderStyle: 'dashed',
    },
    expenseRow:     {
        backgroundColor: `${appTheme.colors.primary}06`,
        borderRadius: 10, padding: 10,
        borderWidth: 1, borderColor: `${appTheme.colors.border}`,
    },
    expenseThumb:   { width: 90, height: 65, borderRadius: 8 },
    photoBtn:       { flexDirection: 'row', alignItems: 'center', padding: 4 },
    editChip:       {
        width: 28, height: 28, borderRadius: 8,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: `${appTheme.colors.primary}15`,
    },
    // QR
    qrImage:        { width: 200, height: 200, borderRadius: 10, backgroundColor: '#f9f9f9' },
    // Payment options
    optionBtn:      {
        borderWidth: 1.5, borderColor: appTheme.colors.border,
        borderRadius: 12, padding: 12, marginBottom: 10,
    },
    optionIcon:     { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    radioCircle:    { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: appTheme.colors.border },
    proofWrap:      { borderRadius: 12, overflow: 'hidden', position: 'relative' },
    proofImg:       { width: '100%', height: 160, borderRadius: 12 },
    retakeBtn:      {
        position: 'absolute', bottom: 8, right: 8,
        backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8,
        paddingHorizontal: 10, paddingVertical: 5,
        flexDirection: 'row', alignItems: 'center',
    },
    reasonBox:      { backgroundColor: '#FEE2E2', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#FECACA' },
    noteInput:      {
        borderWidth: 1, borderColor: '#FECACA', borderRadius: 10,
        padding: 10, fontSize: 13, color: appTheme.colors.text,
        backgroundColor: '#fff', minHeight: 72, textAlignVertical: 'top',
    },
    resubmitBtn:    { backgroundColor: '#E53E3E', borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 4 },
    camBtn:         {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        borderWidth: 1.5, borderColor: appTheme.colors.primary,
        borderStyle: 'dashed', borderRadius: 12, padding: 12,
    },
    saveBtn:        {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: appTheme.colors.primary, borderRadius: 12, padding: 14, marginTop: 8,
    },
    // Modal
    modalOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalBox:       { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40 },
    textInput:      {
        borderWidth: 1, borderColor: appTheme.colors.border, borderRadius: 10,
        padding: 10, fontSize: 14, color: appTheme.colors.text,
    },
    modalPreview:   { width: '100%', height: 130, borderRadius: 10, marginBottom: 8 },
});
