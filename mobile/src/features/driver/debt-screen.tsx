import { useState } from 'react';
import {
    ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable,
    RefreshControl, ScrollView, StyleSheet, TextInput, View,
} from 'react-native';
import { useConfirm } from '@/providers/ui-provider';
import { useMoneyInput } from '@/hooks/use-money-input';
import { StatusBar } from 'expo-status-bar';
import {
    AlertTriangle, Camera, CheckCircle2, ChevronDown,
    ChevronUp, Clock, X, XCircle,
} from 'lucide-react-native';
import { Text, XStack, YStack } from 'tamagui';

import { AppText }      from '@/components/app-text';
import { ScreenHeader } from '@/components/screen-header';
import { CameraModal }  from '@/features/trips/components/camera-modal';
import { SimpleListSkeleton } from '@/components/skeleton';
import { appTheme }     from '@/theme/app-theme';
import { useDebt, useDebtPayments, useSubmitRepayment } from '@/hooks/use-debt';
import type { DriverDebt, DebtPayment, RepaymentStatus } from '@/services/debt-service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtMoney = (val: string | number) => {
    const n = Number(val);
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M₫`;
    if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K₫`;
    return `${n}₫`;
};

const fmtMoneyFull = (val: string | number) =>
    Number(val).toLocaleString('vi-VN') + '₫';

const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
};

const METHOD_LABEL: Record<string, string> = {
    cash:          'Tiền mặt',
    bank_transfer: 'Chuyển khoản',
    offset:        'Bù trừ',
};

const DEBT_BADGE: Record<string, { label: string; bg: string; text: string; border: string }> = {
    unpaid:  { label: 'Chưa trả',   bg: appTheme.colors.dangerSoft,  text: appTheme.colors.dangerText,  border: appTheme.colors.dangerBorder },
    partial: { label: 'Trả 1 phần', bg: appTheme.colors.warningSoft, text: appTheme.colors.warningText, border: appTheme.colors.warningBorder },
    overdue: { label: 'Quá hạn',    bg: appTheme.colors.dangerSoft,  text: appTheme.colors.danger,      border: appTheme.colors.dangerBorder },
    paid:    { label: 'Đã trả đủ',  bg: appTheme.colors.successSoft, text: appTheme.colors.successText, border: appTheme.colors.successBorder },
};

const REPAY_BADGE: Record<RepaymentStatus, { label: string; color: string }> = {
    pending:   { label: 'Chờ xác nhận', color: appTheme.colors.warningText },
    confirmed: { label: 'Đã xác nhận',  color: appTheme.colors.successText },
    rejected:  { label: 'Bị từ chối',   color: appTheme.colors.dangerText  },
};

// ─── Summary card ─────────────────────────────────────────────────────────────

function SummaryCard({ summary }: { summary: NonNullable<ReturnType<typeof useDebt>['summary']> }) {
    const hasDebt = Number(summary.total_remaining) > 0;
    return (
        <YStack
            padding={20} borderRadius={appTheme.radius.xl}
            backgroundColor={hasDebt ? appTheme.colors.dangerSoft : appTheme.colors.successSoft}
            borderWidth={1.5}
            borderColor={hasDebt ? appTheme.colors.dangerBorder : appTheme.colors.successBorder}
            gap={12}
        >
            <YStack>
                <Text fontSize={12} color={appTheme.colors.textMuted}>Tổng công nợ còn lại</Text>
                <Text
                    fontSize={26} fontWeight="900" lineHeight={32}
                    color={hasDebt ? appTheme.colors.dangerText : appTheme.colors.successText}
                >
                    {fmtMoneyFull(summary.total_remaining)}
                </Text>
            </YStack>

            {Number(summary.overdue_remaining) > 0 ? (
                <XStack gap={6} alignItems="center"
                    padding={10} borderRadius={appTheme.radius.sm}
                    backgroundColor={appTheme.colors.dangerSoft}
                    borderWidth={1} borderColor={appTheme.colors.dangerBorder}
                >
                    <AlertTriangle size={13} color={appTheme.colors.danger} />
                    <Text fontSize={12} color={appTheme.colors.dangerText} fontWeight="700">
                        Quá hạn: {fmtMoney(summary.overdue_remaining)}
                    </Text>
                </XStack>
            ) : null}

            {!hasDebt ? (
                <Text fontSize={13} color={appTheme.colors.successText} fontWeight="700" textAlign="center">
                    Không có công nợ — Xuất sắc!
                </Text>
            ) : null}
        </YStack>
    );
}

// ─── Repayment overlay ────────────────────────────────────────────────────────
// Dùng View + absoluteFill thay vì Modal — tránh Modal-in-Modal khi CameraModal mở
// Render ở cấp DebtScreen để phủ toàn màn hình

type RepayOverlayProps = {
    debt: DriverDebt;
    receiptUri: string | null;
    onRequestCamera: () => void;
    onDeleteReceipt: () => void;
    onClose: () => void;
    onSuccess: () => void;
};

function RepayOverlay({ debt, receiptUri, onRequestCamera, onDeleteReceipt, onClose, onSuccess }: RepayOverlayProps) {
    const { displayValue: amount, rawValue: amountRaw, onChangeText: onAmountChange } = useMoneyInput();
    const [method, setMethod] = useState<'cash' | 'bank_transfer'>('cash');
    const [notes, setNotes]   = useState('');
    const { isSubmitting, error, submit } = useSubmitRepayment();

    const remaining = Number(debt.remaining);

    const handleSubmit = async () => {
        const amt = amountRaw;
        if (!amt || amt <= 0) {
            Alert.alert('Lỗi', 'Vui lòng nhập số tiền hợp lệ');
            return;
        }
        if (!receiptUri) {
            Alert.alert('Lỗi', 'Vui lòng chụp ảnh chứng từ nộp tiền');
            return;
        }
        const ok = await submit(debt.id, { amount: amt, paymentMethod: method, notes: notes.trim() || undefined, receiptUri });
        if (ok) {
            onSuccess();
        }
    };

    return (
        // absoluteFill phủ toàn màn hình, zIndex cao — CameraModal (native Modal) sẽ hiện trên đây
        <View style={[StyleSheet.absoluteFill, { zIndex: 200, backgroundColor: appTheme.colors.background }]}>
            <StatusBar style="dark" />

            {/* Header */}
            <XStack
                paddingHorizontal={20} paddingTop={56} paddingBottom={16}
                alignItems="center" gap={12}
                borderBottomWidth={1} borderBottomColor={appTheme.colors.border}
                backgroundColor={appTheme.colors.surface}
            >
                <Pressable onPress={onClose} hitSlop={12}>
                    <X size={22} color={appTheme.colors.text} />
                </Pressable>
                <Text flex={1} fontSize={17} fontWeight="900" color={appTheme.colors.text}>
                    Báo nộp tiền về công ty
                </Text>
            </XStack>

            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <ScrollView
                    contentContainerStyle={{ padding: 20, gap: 16 }}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* Debt info */}
                    <YStack
                        padding={14} borderRadius={appTheme.radius.md}
                        backgroundColor={appTheme.colors.dangerSoft}
                        borderWidth={1} borderColor={appTheme.colors.dangerBorder}
                        gap={4}
                    >
                        <Text fontSize={12} color={appTheme.colors.textMuted}>
                            {debt.cargo_name ?? (debt.trip_code ? `Chuyến ${debt.trip_code}` : `Công nợ #${debt.id}`)}
                        </Text>
                        <XStack gap={16}>
                            <YStack>
                                <Text fontSize={10} color={appTheme.colors.textMuted}>Tổng nợ</Text>
                                <Text fontSize={14} fontWeight="700" color={appTheme.colors.dangerText}>{fmtMoney(debt.total_amount)}</Text>
                            </YStack>
                            <YStack>
                                <Text fontSize={10} color={appTheme.colors.textMuted}>Còn lại</Text>
                                <Text fontSize={14} fontWeight="900" color={appTheme.colors.dangerText}>{fmtMoney(debt.remaining)}</Text>
                            </YStack>
                        </XStack>
                    </YStack>

                    {/* Amount */}
                    <YStack gap={6}>
                        <Text fontSize={13} fontWeight="700" color={appTheme.colors.text}>Số tiền nộp (₫) *</Text>
                        <TextInput
                            style={s.input}
                            placeholder={`Tối đa ${fmtMoneyFull(remaining)}`}
                            keyboardType="numeric"
                            value={amount}
                            onChangeText={onAmountChange}
                            placeholderTextColor={appTheme.colors.textMuted}
                        />
                    </YStack>

                    {/* Method */}
                    <YStack gap={6}>
                        <Text fontSize={13} fontWeight="700" color={appTheme.colors.text}>Hình thức</Text>
                        <XStack gap={8}>
                            {(['cash', 'bank_transfer'] as const).map((m) => (
                                <Pressable
                                    key={m}
                                    onPress={() => setMethod(m)}
                                    style={[s.chip, method === m && s.chipActive]}
                                >
                                    <Text
                                        fontSize={13} fontWeight="700"
                                        color={method === m ? '#fff' : appTheme.colors.textMuted}
                                    >
                                        {m === 'cash' ? 'Tiền mặt' : 'Chuyển khoản'}
                                    </Text>
                                </Pressable>
                            ))}
                        </XStack>
                    </YStack>

                    {/* Photo */}
                    <YStack gap={6}>
                        <Text fontSize={13} fontWeight="700" color={appTheme.colors.text}>Ảnh chứng từ *</Text>
                        {receiptUri ? (
                            <View style={s.photoPreviewWrap}>
                                <Image source={{ uri: receiptUri }} style={s.photoPreview} resizeMode="cover" />
                                <Pressable style={s.retakeBtn} onPress={onRequestCamera}>
                                    <Camera size={14} color="#fff" />
                                    <Text fontSize={12} color="#fff" fontWeight="700">Chụp lại</Text>
                                </Pressable>
                                <Pressable style={s.deleteReceiptBtn} onPress={onDeleteReceipt}>
                                    <X size={14} color="#fff" />
                                </Pressable>
                            </View>
                        ) : (
                            <Pressable style={s.photoBtn} onPress={onRequestCamera}>
                                <Camera size={24} color={appTheme.colors.primary} />
                                <Text fontSize={13} color={appTheme.colors.primary} fontWeight="700">Chụp ảnh chứng từ</Text>
                            </Pressable>
                        )}
                    </YStack>

                    {/* Notes */}
                    <YStack gap={6}>
                        <Text fontSize={13} fontWeight="700" color={appTheme.colors.text}>Ghi chú</Text>
                        <TextInput
                            style={[s.input, { height: 72, textAlignVertical: 'top' }]}
                            placeholder="VD: Nộp tiền mặt tại văn phòng..."
                            value={notes}
                            onChangeText={setNotes}
                            multiline
                            placeholderTextColor={appTheme.colors.textMuted}
                        />
                    </YStack>

                    {error ? (
                        <XStack
                            padding={12} borderRadius={appTheme.radius.md}
                            backgroundColor={appTheme.colors.dangerSoft}
                            borderWidth={1} borderColor={appTheme.colors.dangerBorder}
                            gap={8} alignItems="center"
                        >
                            <AlertTriangle size={14} color={appTheme.colors.danger} />
                            <Text fontSize={12} color={appTheme.colors.dangerText} flex={1}>{error}</Text>
                        </XStack>
                    ) : null}

                    <Pressable
                        style={[s.submitBtn, isSubmitting && { opacity: 0.6 }]}
                        onPress={handleSubmit}
                        disabled={isSubmitting}
                    >
                        {isSubmitting
                            ? <ActivityIndicator color="#fff" size="small" />
                            : <Text fontSize={15} fontWeight="900" color="#fff">Gửi yêu cầu nộp tiền</Text>
                        }
                    </Pressable>
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

// ─── Payment row ──────────────────────────────────────────────────────────────

function PaymentRow({ p, onCancel }: { p: DebtPayment; onCancel?: () => void }) {
    const badge = REPAY_BADGE[p.status] ?? REPAY_BADGE.pending;
    return (
        <YStack
            padding={10} borderRadius={appTheme.radius.sm}
            backgroundColor={appTheme.colors.surfaceSoft}
            borderWidth={1} borderColor={appTheme.colors.border}
            gap={4}
        >
            <XStack alignItems="center" gap={8}>
                {p.status === 'pending'   ? <Clock      size={13} color={appTheme.colors.warningText} /> : null}
                {p.status === 'confirmed' ? <CheckCircle2 size={13} color={appTheme.colors.successText} /> : null}
                {p.status === 'rejected'  ? <XCircle    size={13} color={appTheme.colors.danger} /> : null}
                <Text fontSize={12} fontWeight="700" color={badge.color}>{badge.label}</Text>
                <Text fontSize={12} fontWeight="900" color={appTheme.colors.text} marginLeft="auto">
                    {fmtMoney(p.amount)}
                </Text>
            </XStack>

            <XStack gap={12}>
                <Text fontSize={11} color={appTheme.colors.textMuted}>
                    {METHOD_LABEL[p.payment_method] ?? p.payment_method}
                </Text>
                <Text fontSize={11} color={appTheme.colors.textMuted}>{fmtDate(p.paid_at)}</Text>
            </XStack>

            {p.reject_reason ? (
                <Text fontSize={11} color={appTheme.colors.dangerText}>
                    Lý do từ chối: {p.reject_reason}
                </Text>
            ) : null}

            {p.notes ? (
                <Text fontSize={11} color={appTheme.colors.textMuted} numberOfLines={1}>{p.notes}</Text>
            ) : null}

            {p.status === 'pending' && onCancel ? (
                <Pressable onPress={onCancel} style={s.cancelBtn}>
                    <Text fontSize={11} fontWeight="700" color={appTheme.colors.danger}>Huỷ yêu cầu</Text>
                </Pressable>
            ) : null}
        </YStack>
    );
}

// ─── Debt card ────────────────────────────────────────────────────────────────

function DebtCard({
    debt, onRepaid, onRepayPress,
}: {
    debt: DriverDebt;
    onRepaid: () => void;
    onRepayPress: (debt: DriverDebt) => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const { payments, isLoading, reload } = useDebtPayments(debt.id);
    const { cancel } = useSubmitRepayment();
    const { showConfirm } = useConfirm();
    const badge = DEBT_BADGE[debt.status] ?? DEBT_BADGE.unpaid;

    const handleExpand = () => {
        if (!expanded) reload();
        setExpanded((v) => !v);
    };

    const handleCancel = async (paymentId: number) => {
        const ok = await showConfirm({
            title: 'Huỷ yêu cầu',
            message: 'Bạn có chắc muốn huỷ yêu cầu nộp tiền này?',
            confirmLabel: 'Huỷ yêu cầu',
            danger: true,
        });
        if (!ok) return;
        await cancel(paymentId);
        reload();
    };

    const canRepay = debt.status !== 'paid';

    return (
        <YStack
            borderRadius={appTheme.radius.lg}
            borderWidth={1} borderColor={badge.border}
            backgroundColor={appTheme.colors.surface}
            overflow="hidden"
        >
            <Pressable onPress={handleExpand}>
                <XStack padding={16} gap={12} alignItems="flex-start">
                    <YStack flex={1} gap={4}>
                        <XStack gap={8} alignItems="center">
                            <Text fontSize={14} fontWeight="900" color={appTheme.colors.text} flex={1} numberOfLines={1}>
                                {debt.cargo_name ?? (debt.trip_code ? `Chuyến ${debt.trip_code}` : `Công nợ #${debt.id}`)}
                            </Text>
                            <XStack
                                paddingHorizontal={8} paddingVertical={3}
                                borderRadius={appTheme.radius.pill}
                                backgroundColor={badge.bg}
                                borderWidth={1} borderColor={badge.border}
                            >
                                <Text fontSize={10} fontWeight="700" color={badge.text}>{badge.label}</Text>
                            </XStack>
                        </XStack>

                        <XStack gap={16}>
                            <YStack>
                                <Text fontSize={10} color={appTheme.colors.textMuted}>Tổng nợ</Text>
                                <Text fontSize={13} fontWeight="700" color={appTheme.colors.text}>
                                    {fmtMoney(debt.total_amount)}
                                </Text>
                            </YStack>
                            <YStack>
                                <Text fontSize={10} color={appTheme.colors.textMuted}>Đã xác nhận</Text>
                                <Text fontSize={13} fontWeight="700" color={appTheme.colors.successText}>
                                    {fmtMoney(debt.paid_amount)}
                                </Text>
                            </YStack>
                            <YStack>
                                <Text fontSize={10} color={appTheme.colors.textMuted}>Còn lại</Text>
                                <Text fontSize={13} fontWeight="900" color={appTheme.colors.dangerText}>
                                    {fmtMoney(debt.remaining)}
                                </Text>
                            </YStack>
                        </XStack>

                        {debt.due_date ? (
                            <Text fontSize={11} color={appTheme.colors.textMuted}>
                                Hạn: {new Date(debt.due_date).toLocaleDateString('vi-VN')}
                            </Text>
                        ) : null}
                    </YStack>

                    {expanded
                        ? <ChevronUp size={16} color={appTheme.colors.textMuted} />
                        : <ChevronDown size={16} color={appTheme.colors.textMuted} />
                    }
                </XStack>
            </Pressable>

            {canRepay ? (
                <Pressable style={s.repayBtn} onPress={() => onRepayPress(debt)}>
                    <Text fontSize={13} fontWeight="900" color={appTheme.colors.primary}>
                        + Báo nộp tiền về công ty
                    </Text>
                </Pressable>
            ) : null}

            {expanded ? (
                <YStack
                    padding={16} paddingTop={0} gap={8}
                    borderTopWidth={1} borderTopColor={appTheme.colors.border}
                >
                    <Text fontSize={11} fontWeight="700" color={appTheme.colors.textMuted}>
                        Lịch sử nộp tiền
                    </Text>
                    {isLoading ? (
                        <ActivityIndicator color={appTheme.colors.primary} size="small" style={{ marginVertical: 8 }} />
                    ) : payments.length > 0 ? (
                        <YStack gap={6}>
                            {payments.map((p) => (
                                <PaymentRow
                                    key={p.id}
                                    p={p}
                                    onCancel={p.status === 'pending' ? () => handleCancel(p.id) : undefined}
                                />
                            ))}
                        </YStack>
                    ) : (
                        <Text fontSize={12} color={appTheme.colors.textMuted} textAlign="center" paddingVertical={8}>
                            Chưa có lần nộp tiền nào
                        </Text>
                    )}
                </YStack>
            ) : null}
        </YStack>
    );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function DebtScreen() {
    const { debts, summary, isLoading, error, reload } = useDebt();

    // Camera + repay state ở cấp screen để CameraModal (native Modal) luôn render trên RepayOverlay (View)
    const [repayingDebt,  setRepayingDebt]  = useState<DriverDebt | null>(null);
    const [photoUri,      setPhotoUri]      = useState<string | null>(null);
    const [showCamera,    setShowCamera]    = useState(false);

    const openDebts = debts.filter((d) => d.status !== 'paid');
    const paidDebts = debts.filter((d) => d.status === 'paid');

    const handleRepayPress = (debt: DriverDebt) => {
        setPhotoUri(null);
        setRepayingDebt(debt);
    };

    const handleRepayClose = () => {
        setRepayingDebt(null);
        setPhotoUri(null);
    };

    return (
        <View style={{ flex: 1, backgroundColor: appTheme.colors.background }}>
            <StatusBar style="dark" />
            <ScreenHeader title="Công nợ của tôi" showBack />

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={s.content}
                refreshControl={
                    <RefreshControl
                        refreshing={isLoading}
                        onRefresh={reload}
                        tintColor={appTheme.colors.primary}
                    />
                }
                showsVerticalScrollIndicator={false}
            >
                {summary ? <SummaryCard summary={summary} /> : null}

                {error ? (
                    <XStack
                        padding={14} borderRadius={appTheme.radius.md}
                        backgroundColor={appTheme.colors.dangerSoft}
                        borderWidth={1} borderColor={appTheme.colors.dangerBorder}
                        gap={8} alignItems="center"
                    >
                        <AlertTriangle size={15} color={appTheme.colors.danger} />
                        <AppText variant="caption" tone="danger" flex={1}>{error}</AppText>
                    </XStack>
                ) : null}

                {isLoading && debts.length === 0 ? <SimpleListSkeleton count={4} /> : null}

                {!isLoading && openDebts.length === 0 && !error ? (
                    <YStack
                        padding={32} borderRadius={appTheme.radius.lg}
                        backgroundColor={appTheme.colors.successSoft}
                        borderWidth={1} borderColor={appTheme.colors.successBorder}
                        alignItems="center" gap={10}
                    >
                        <CheckCircle2 size={36} color={appTheme.colors.success} />
                        <AppText variant="bodyStrong" tone="muted">Không có công nợ</AppText>
                    </YStack>
                ) : (
                    <YStack gap={10}>
                        {openDebts.length > 0 ? (
                            <Text fontSize={15} fontWeight="900" color={appTheme.colors.text}>
                                Đang có ({openDebts.length})
                            </Text>
                        ) : null}
                        {openDebts.map((d) => (
                            <DebtCard key={d.id} debt={d} onRepaid={reload} onRepayPress={handleRepayPress} />
                        ))}
                    </YStack>
                )}

                {paidDebts.length > 0 ? (
                    <YStack gap={10}>
                        <Text fontSize={15} fontWeight="900" color={appTheme.colors.textMuted}>
                            Đã trả ({paidDebts.length})
                        </Text>
                        {paidDebts.map((d) => (
                            <DebtCard key={d.id} debt={d} onRepaid={reload} onRepayPress={handleRepayPress} />
                        ))}
                    </YStack>
                ) : null}
            </ScrollView>

            {/* RepayOverlay: View + absoluteFill, zIndex=200 — không phải native Modal */}
            {repayingDebt ? (
                <RepayOverlay
                    debt={repayingDebt}
                    receiptUri={photoUri}
                    onRequestCamera={() => setShowCamera(true)}
                    onDeleteReceipt={() => setPhotoUri(null)}
                    onClose={handleRepayClose}
                    onSuccess={() => { reload(); handleRepayClose(); }}
                />
            ) : null}

            {/* CameraModal: native Modal — render trên RepayOverlay vì Modal luôn hiện trên mọi View */}
            <CameraModal
                visible={showCamera}
                label="Chụp chứng từ nộp tiền"
                onCapture={(uri) => { setPhotoUri(uri); setShowCamera(false); }}
                onClose={() => setShowCamera(false)}
            />
        </View>
    );
}

const s = StyleSheet.create({
    content: {
        paddingHorizontal: appTheme.spacing.screenX,
        paddingTop: 16,
        paddingBottom: appTheme.spacing.screenBottom + 20,
        gap: 14,
    },
    input: {
        borderWidth: 1,
        borderColor: appTheme.colors.border,
        borderRadius: appTheme.radius.md,
        padding: 12,
        fontSize: 14,
        color: appTheme.colors.text,
        backgroundColor: appTheme.colors.surface,
    },
    chip: {
        paddingHorizontal: 14, paddingVertical: 8,
        borderRadius: appTheme.radius.pill,
        borderWidth: 1, borderColor: appTheme.colors.border,
        backgroundColor: appTheme.colors.surface,
    },
    chipActive: {
        backgroundColor: appTheme.colors.primary,
        borderColor: appTheme.colors.primary,
    },
    photoBtn: {
        height: 100,
        borderWidth: 1.5,
        borderStyle: 'dashed',
        borderColor: appTheme.colors.primary,
        borderRadius: appTheme.radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: appTheme.colors.primarySoft,
    },
    photoPreviewWrap: {
        height: 160,
        borderRadius: appTheme.radius.md,
        overflow: 'hidden',
        position: 'relative',
    },
    photoPreview: { width: '100%', height: '100%' },
    retakeBtn: {
        position: 'absolute', bottom: 8, right: 8,
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: 10, paddingVertical: 5,
        borderRadius: appTheme.radius.pill,
    },
    deleteReceiptBtn: {
        position: 'absolute', top: 8, right: 8,
        width: 28, height: 28, borderRadius: 14,
        backgroundColor: 'rgba(0,0,0,0.6)',
        alignItems: 'center', justifyContent: 'center',
    },
    submitBtn: {
        backgroundColor: appTheme.colors.primary,
        borderRadius: appTheme.radius.md,
        padding: 16,
        alignItems: 'center',
        marginTop: 4,
    },
    repayBtn: {
        paddingHorizontal: 16, paddingVertical: 10,
        borderTopWidth: 1, borderTopColor: appTheme.colors.border,
        alignItems: 'center',
        backgroundColor: appTheme.colors.primarySoft,
    },
    cancelBtn: {
        alignSelf: 'flex-end',
        paddingHorizontal: 10, paddingVertical: 4,
        borderRadius: appTheme.radius.pill,
        borderWidth: 1, borderColor: appTheme.colors.dangerBorder,
        marginTop: 4,
    },
});
