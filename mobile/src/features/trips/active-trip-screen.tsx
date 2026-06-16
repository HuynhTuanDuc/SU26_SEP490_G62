import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCameraPermissions } from 'expo-camera';
import {
    AlertTriangle, CheckCircle, ChevronDown, ChevronUp,
    Clock, DollarSign, Edit2, FileText, MapPin, Package,
    PlusCircle, RotateCcw, X, XCircle,
} from 'lucide-react-native';
import { Image } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { AppText }              from '@/components/app-text';
import { LifecycleActionButton }  from '@/components/lifecycle-action-button';
import { ScreenHeader }         from '@/components/screen-header';
import { TripStatusBadge }      from '@/components/trip-status-badge';
import { ActiveTripSkeleton }   from '@/components/skeleton';
import { appTheme }             from '@/theme/app-theme';
import { useActiveTrip }        from '@/hooks/use-active-trip';
import { useCompletionProof }   from '@/hooks/use-completion-proof';
import { useLoadingProof }      from '@/hooks/use-loading-proof';
import { useReturnComplete }    from '@/hooks/use-return-complete';
import { useReleaseTrip }       from '@/hooks/use-release-trip';
import { useShipmentExpenses }  from '@/hooks/use-shipment-expenses';
import { useMarkUnpaid }        from '@/hooks/use-mark-unpaid';
import { useMoneyInput }        from '@/hooks/use-money-input';
import { useRecordPayment }     from '@/hooks/use-record-payment';
import { useUpdatePayment }     from '@/hooks/use-update-payment';
import { tripService }          from '@/services/trip-service';
import { useTripLifecycle }     from '@/hooks/use-trip-lifecycle';
import { useToast, useAppAlert, useConfirm } from '@/providers/ui-provider';
import type { ActiveTrip, Expense, PaymentSummary, ShipmentPayment, TripStatus, TripStop } from '@/types/trip';
import { EXPENSE_TYPE_LABEL, NEXT_ACTIONS } from '@/types/trip';

import { CameraModal }      from './components/camera-modal';
import { ExpenseFormModal }  from './components/expense-form-modal';
import { PhotoCaptureCard }  from './components/photo-capture-card';
import { ReasonModal }      from './components/reason-modal';
import { StatusStepper, STATUS_ACCENT, STATUS_BANNER } from './components/status-stepper';

// Toast message shown after each lifecycle transition
const STATUS_ADVANCE_TOAST: Partial<Record<TripStatus, string>> = {
    picking:   'Đang di chuyển đến điểm lấy hàng',
    transit:   'Đang vận chuyển hàng đến điểm giao',
    arrived:   'Đã đến điểm giao – tiến hành giao hàng',
    failed:    'Ghi nhận giao thất bại – cần hoàn hàng về điểm lấy',
    returning: 'Đang hoàn hàng về điểm lấy',
};

// ─── Constants ────────────────────────────────────────────────────────────────

const EXPENSE_ALLOWED_STATUSES: TripStatus[] = [
    'claimed', 'picking', 'transit', 'arrived', 'failed', 'returning',
];

const fmt = (v: string | number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(v));

// ─── Collapsible section ──────────────────────────────────────────────────────

function CollapsibleSection({
    label,
    badge,
    defaultOpen = false,
    children,
}: {
    label: string;
    badge?: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
}) {
    const [open, setOpen] = useState(defaultOpen);

    return (
        <YStack
            borderRadius={appTheme.radius.lg} borderWidth={1}
            borderColor={appTheme.colors.border} backgroundColor={appTheme.colors.surface}
            overflow="hidden"
        >
            <Pressable onPress={() => setOpen(v => !v)}>
                <XStack
                    paddingHorizontal={16} paddingVertical={12}
                    backgroundColor={appTheme.colors.surfaceSoft}
                    alignItems="center" justifyContent="space-between"
                >
                    <XStack alignItems="center" gap={8}>
                        <Text fontSize={12} fontWeight="900" color={appTheme.colors.textMuted}>
                            {label.toUpperCase()}
                        </Text>
                        {badge ? (
                            <View style={s.badge}>
                                <Text fontSize={10} fontWeight="700" color={appTheme.colors.primary}>{badge}</Text>
                            </View>
                        ) : null}
                    </XStack>
                    {open
                        ? <ChevronUp size={15} color={appTheme.colors.textMuted} />
                        : <ChevronDown size={15} color={appTheme.colors.textMuted} />}
                </XStack>
            </Pressable>
            {open ? (
                <YStack padding={14} gap={8}>{children}</YStack>
            ) : null}
        </YStack>
    );
}

// ─── Compact route row ────────────────────────────────────────────────────────

function RouteRow({ pickup, delivery, isReturning }: {
    pickup: string;
    delivery: string;
    isReturning?: boolean;
}) {
    return (
        <YStack
            borderRadius={appTheme.radius.lg} borderWidth={1}
            borderColor={appTheme.colors.border} backgroundColor={appTheme.colors.surface}
            paddingHorizontal={14} paddingVertical={12} gap={8}
        >
            <XStack alignItems="flex-start" gap={10}>
                <View style={[s.routeDot, { backgroundColor: appTheme.colors.successSoft, borderColor: appTheme.colors.success }]}>
                    <MapPin size={11} color={appTheme.colors.success} />
                </View>
                <YStack flex={1}>
                    <Text fontSize={10} fontWeight="700" color={appTheme.colors.textMuted}>
                        {isReturning ? 'ĐIỂM TRẢ HÀNG VỀ' : 'ĐIỂM LẤY'}
                    </Text>
                    <Text fontSize={13} color={appTheme.colors.text} lineHeight={18} numberOfLines={2}>
                        {pickup}
                    </Text>
                </YStack>
            </XStack>

            {!isReturning ? (
                <>
                    <View style={s.routeLine} />
                    <XStack alignItems="flex-start" gap={10}>
                        <View style={[s.routeDot, { backgroundColor: appTheme.colors.primarySoft, borderColor: appTheme.colors.primary }]}>
                            <MapPin size={11} color={appTheme.colors.primary} />
                        </View>
                        <YStack flex={1}>
                            <Text fontSize={10} fontWeight="700" color={appTheme.colors.textMuted}>ĐIỂM GIAO</Text>
                            <Text fontSize={13} color={appTheme.colors.text} lineHeight={18} numberOfLines={2}>
                                {delivery}
                            </Text>
                        </YStack>
                    </XStack>
                </>
            ) : null}
        </YStack>
    );
}

// ─── Inline expense list ──────────────────────────────────────────────────────

function ExpenseInlineList({ expenses, canAdd, onAdd }: {
    expenses: Expense[];
    canAdd: boolean;
    onAdd: () => void;
}) {
    if (expenses.length === 0 && !canAdd) {
        return <Text fontSize={12} color={appTheme.colors.textMuted}>Chưa có chi phí nào</Text>;
    }
    const total = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

    return (
        <YStack gap={10}>
            {expenses.map((e) => (
                <YStack key={e.id} gap={6}>
                    <XStack justifyContent="space-between" alignItems="center">
                        <Text fontSize={13} color={appTheme.colors.text}>{EXPENSE_TYPE_LABEL[e.expense_type]}</Text>
                        <Text fontSize={13} fontWeight="800" color={appTheme.colors.primary}>{fmt(e.amount)}</Text>
                    </XStack>
                    {e.description ? (
                        <Text fontSize={11} color={appTheme.colors.textMuted}>{e.description}</Text>
                    ) : null}
                    {e.receipt_urls.length > 0 ? (
                        <XStack gap={6} flexWrap="wrap">
                            {e.receipt_urls.map((url, i) => (
                                <Image
                                    key={i}
                                    source={{ uri: url }}
                                    style={s.receiptThumb}
                                    resizeMode="cover"
                                />
                            ))}
                        </XStack>
                    ) : null}
                </YStack>
            ))}
            {expenses.length > 1 ? (
                <XStack justifyContent="space-between" paddingTop={6}
                    borderTopWidth={1} borderTopColor={appTheme.colors.border}>
                    <Text fontSize={12} fontWeight="700" color={appTheme.colors.textMuted}>Tổng</Text>
                    <Text fontSize={13} fontWeight="900" color={appTheme.colors.text}>{fmt(total)}</Text>
                </XStack>
            ) : null}
            {canAdd ? (
                <Pressable onPress={onAdd} style={s.addExpenseBtn}>
                    <PlusCircle size={14} color={appTheme.colors.primary} />
                    <Text fontSize={12} fontWeight="700" color={appTheme.colors.primary}>Thêm chi phí</Text>
                </Pressable>
            ) : null}
        </YStack>
    );
}

// ─── Stops section ────────────────────────────────────────────────────────────

// Derive stop visual state từ trip status khi DB chưa có timestamp
function deriveStopState(
    stop: TripStop,
    tripStatus: TripStatus,
): 'completed' | 'active' | 'pending' {
    if (stop.completed_at) return 'completed';
    if (stop.arrived_at)   return 'active';

    if (stop.stop_type === 'pickup') {
        const pickupDone: TripStatus[] = ['transit', 'arrived', 'completed', 'failed', 'returning'];
        if (pickupDone.includes(tripStatus)) return 'completed';
        if (tripStatus === 'picking')        return 'active';
    }
    if (stop.stop_type === 'delivery') {
        if (tripStatus === 'completed') return 'completed';
        if (tripStatus === 'arrived')   return 'active';
    }
    return 'pending';
}

function StopsSection({ stops, tripStatus }: { stops: TripStop[]; tripStatus: TripStatus }) {
    if (!stops || stops.length === 0) return null;
    const done = stops.filter(s => deriveStopState(s, tripStatus) === 'completed').length;

    return (
        <CollapsibleSection label="Điểm dừng" badge={`${done}/${stops.length}`} defaultOpen>
            <YStack gap={10}>
                {stops.map((stop) => {
                    const state = deriveStopState(stop, tripStatus);
                    const dotColor =
                        state === 'completed' ? appTheme.colors.success :
                        state === 'active'    ? appTheme.colors.warning :
                                                appTheme.colors.border;
                    return (
                        <XStack key={stop.id} gap={10} alignItems="flex-start">
                            <YStack alignItems="center" gap={2} paddingTop={2}>
                                <View style={[s.stopDot, { backgroundColor: dotColor }]} />
                                <Text fontSize={9} fontWeight="900" color={
                                    stop.stop_type === 'pickup'
                                        ? appTheme.colors.success
                                        : appTheme.colors.primary
                                }>
                                    {stop.stop_type === 'pickup' ? 'LẤY' : 'GIAO'}
                                </Text>
                            </YStack>
                            <YStack flex={1} gap={2}>
                                <Text fontSize={12} color={appTheme.colors.text} numberOfLines={2}>
                                    {stop.address}
                                </Text>
                                {stop.contact_name ? (
                                    <Text fontSize={11} color={appTheme.colors.textMuted}>
                                        {stop.contact_name}{stop.contact_phone ? ` · ${stop.contact_phone}` : ''}
                                    </Text>
                                ) : null}
                                {state === 'completed' ? (
                                    <Text fontSize={10} fontWeight="700" color={appTheme.colors.success}>✓ Hoàn thành</Text>
                                ) : state === 'active' ? (
                                    <Text fontSize={10} fontWeight="700" color={appTheme.colors.warning}>• Đang thực hiện</Text>
                                ) : (
                                    <Text fontSize={10} color={appTheme.colors.textMuted}>Chờ đến lượt</Text>
                                )}
                            </YStack>
                        </XStack>
                    );
                })}
            </YStack>
        </CollapsibleSection>
    );
}

// ─── Payment modal (TH2 + TH3) ───────────────────────────────────────────────
// FIX: CameraModal KHÔNG được lồng bên trong Modal (Modal-in-Modal crash Android)
// Thay vào đó nhận receiptUri + onRequestCamera từ parent screen

function PaymentModal({
    visible, tripId, mode, receiptUri, estimatedPrice, remainingAmount,
    onRequestCamera, onDeleteReceipt, onClose, onSuccess,
}: {
    visible: boolean;
    tripId: number;
    mode: 'cash' | 'unpaid';
    receiptUri: string | null;
    estimatedPrice: number | null;
    remainingAmount: number | null;
    onRequestCamera: () => void;
    onDeleteReceipt: () => void;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const { showToast } = useToast();
    const { displayValue: amount, rawValue: parsed, onChangeText: onAmountBase, setValue } = useMoneyInput();
    const [notes,  setNotes]  = useState('');

    const { isLoading: paymentLoading, error: paymentError, recordPayment, clearError: clearPayment } = useRecordPayment(() => {
        showToast({ type: 'success', message: 'Đã ghi nhận thanh toán tiền mặt' });
        onSuccess();
    });
    const { isLoading: unpaidLoading, error: unpaidError, markUnpaid, clearError: clearUnpaid } = useMarkUnpaid(() => {
        showToast({ type: 'success', message: 'Đã ghi nhận công nợ khách hàng' });
        onSuccess();
    });

    const isLoading  = paymentLoading || unpaidLoading;
    const apiError   = paymentError ?? unpaidError;

    // Luôn dùng estimatedPrice làm tham chiếu — giá trị thực thu có thể khác
    const refAmount = estimatedPrice ?? null;

    const handleAmountChange = (text: string) => {
        onAmountBase(text);
        if (apiError) { clearPayment(); clearUnpaid(); }
    };

    const fillRefAmount = () => {
        if (!refAmount) return;
        setValue(refAmount);
        if (apiError) { clearPayment(); clearUnpaid(); }
    };

    const canSubmit = parsed > 0 && (mode === 'unpaid' || !!receiptUri);

    const handleConfirm = async () => {
        if (mode === 'cash') {
            // BR-018: Ảnh biên lai bắt buộc khi ghi nhận tiền mặt
            if (!receiptUri) {
                showToast({ type: 'error', message: 'Cần chụp ảnh biên lai trước khi xác nhận' });
                return;
            }
            await recordPayment(tripId, parsed, receiptUri, notes.trim() || undefined);
        } else {
            // TH3: Khách chưa trả → tạo customer debt
            await markUnpaid(tripId, parsed, notes.trim() || undefined);
        }
    };

    if (!visible) return null;

    // Dùng View + absoluteFill thay vì Modal — tránh Modal-on-Modal với CameraModal
    return (
        <View style={[StyleSheet.absoluteFill, { zIndex: 100 }]}>
            {/* Backdrop */}
            <Pressable style={[StyleSheet.absoluteFill, s.modalBackdrop]} onPress={onClose} />

            <KeyboardAvoidingView
                style={s.modalOverlay}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                pointerEvents="box-none"
            >
                <View style={s.paymentCard}>
                    {/* Header */}
                    <XStack justifyContent="space-between" alignItems="center" marginBottom={14}>
                        <XStack alignItems="center" gap={8}>
                            {mode === 'cash'
                                ? <DollarSign size={18} color={appTheme.colors.success} />
                                : <XCircle size={18} color={appTheme.colors.warningText} />}
                            <Text fontSize={16} fontWeight="900" color={appTheme.colors.text}>
                                {mode === 'cash' ? 'Ghi nhận tiền mặt' : 'Báo khách chưa trả'}
                            </Text>
                        </XStack>
                        <Pressable onPress={onClose} hitSlop={12}>
                            <X size={18} color={appTheme.colors.textMuted} />
                        </Pressable>
                    </XStack>

                    <Text fontSize={12} color={appTheme.colors.textMuted} lineHeight={18} style={{ marginBottom: 14 }}>
                        {mode === 'cash'
                            ? 'Nhập số tiền thực thu từ khách (có thể cao hơn hoặc thấp hơn giá ước tính). Chụp ảnh biên lai bắt buộc.'
                            : 'Khách chưa thanh toán. Hệ thống tạo công nợ để kế toán theo dõi.'}
                    </Text>

                    {/* Giá trị tham chiếu */}
                    {refAmount !== null && refAmount > 0 ? (
                        <XStack
                            padding={10} borderRadius={10}
                            backgroundColor={appTheme.colors.primarySoft}
                            borderWidth={1} borderColor={appTheme.colors.primaryMuted}
                            alignItems="center" justifyContent="space-between"
                            style={{ marginBottom: 14 }}
                        >
                            <YStack gap={2}>
                                <Text fontSize={11} color={appTheme.colors.textMuted}>
                                    Giá trị ước tính (tham khảo)
                                </Text>
                                <Text fontSize={14} fontWeight="900" color={appTheme.colors.primary}>
                                    {refAmount.toLocaleString('vi-VN')} ₫
                                </Text>
                                <Text fontSize={10} color={appTheme.colors.textMuted}>
                                    Giá trị thực tế có thể khác — nhập đúng số tiền thu được
                                </Text>
                            </YStack>
                            <Pressable
                                onPress={fillRefAmount}
                                style={{
                                    paddingHorizontal: 12, paddingVertical: 7,
                                    borderRadius: 8,
                                    backgroundColor: appTheme.colors.primary,
                                }}
                            >
                                <Text fontSize={12} fontWeight="700" color="#fff">Điền vào</Text>
                            </Pressable>
                        </XStack>
                    ) : null}

                    {/* Amount */}
                    <View style={{ marginBottom: 14, gap: 6 }}>
                        <Text fontSize={12} fontWeight="700" color={appTheme.colors.textMuted}>
                            SỐ TIỀN THỰC THU (VNĐ) *
                        </Text>
                        <TextInput
                            value={amount}
                            onChangeText={handleAmountChange}
                            keyboardType="numeric"
                            placeholder="Nhập số tiền khách trả thực tế..."
                            placeholderTextColor={appTheme.colors.textMuted}
                            returnKeyType="done"
                            style={s.amountInput}
                        />
                        {parsed > 0 ? (
                            <Text fontSize={11} color={appTheme.colors.primary} fontWeight="700">
                                = {parsed.toLocaleString('vi-VN')} ₫
                            </Text>
                        ) : null}
                    </View>

                    {/* Receipt photo — chỉ cho TH2 */}
                    {mode === 'cash' ? (
                        <View style={{ marginBottom: 14, gap: 6 }}>
                            <Text fontSize={12} fontWeight="700" color={appTheme.colors.textMuted}>
                                ẢNH BIÊN LAI *
                            </Text>
                            {/* onCapture gọi lên parent → parent đóng overlay này, mở CameraModal thật */}
                            <PhotoCaptureCard
                                label="Chụp biên lai thanh toán"
                                sublabel="Ảnh biên lai / phiếu thu có chữ ký khách (BR-018)"
                                uri={receiptUri}
                                required
                                onCapture={onRequestCamera}
                                onDelete={onDeleteReceipt}
                            />
                        </View>
                    ) : null}

                    {/* Notes */}
                    <View style={{ marginBottom: 14, gap: 6 }}>
                        <Text fontSize={12} fontWeight="700" color={appTheme.colors.textMuted}>
                            GHI CHÚ (TUỲ CHỌN)
                        </Text>
                        <TextInput
                            value={notes}
                            onChangeText={setNotes}
                            placeholder="Ghi chú thêm..."
                            placeholderTextColor={appTheme.colors.textMuted}
                            multiline
                            blurOnSubmit
                            style={s.notesInput}
                        />
                    </View>

                    {/* API error */}
                    {apiError ? (
                        <XStack
                            padding={10} borderRadius={8}
                            backgroundColor={appTheme.colors.dangerSoft}
                            borderWidth={1} borderColor={appTheme.colors.dangerBorder}
                            gap={8} alignItems="center"
                            style={{ marginBottom: 14 }}
                        >
                            <AlertTriangle size={13} color={appTheme.colors.danger} />
                            <Text fontSize={12} color={appTheme.colors.danger} flex={1}>{apiError}</Text>
                        </XStack>
                    ) : null}

                    {/* Actions */}
                    <XStack gap={10}>
                        <Pressable style={[s.modalBtn, s.modalBtnSecondary, { flex: 1 }]} onPress={onClose}>
                            <Text fontSize={14} fontWeight="700" color={appTheme.colors.text}>Hủy</Text>
                        </Pressable>
                        <Pressable
                            style={[s.modalBtn, {
                                flex: 2,
                                backgroundColor: !canSubmit || isLoading
                                    ? appTheme.colors.primaryMuted
                                    : appTheme.colors.primary,
                            }]}
                            onPress={handleConfirm}
                            disabled={!canSubmit || isLoading}
                        >
                            <Text fontSize={14} fontWeight="900" color="#fff">
                                {isLoading ? 'Đang gửi...' : 'Xác nhận'}
                            </Text>
                        </Pressable>
                    </XStack>
                </View>
            </KeyboardAvoidingView>
        </View>
    );
}

// ─── Edit Payment Modal ───────────────────────────────────────────────────────
// Dùng View + absoluteFill (không phải Modal) để tránh Modal-in-Modal

function EditPaymentModal({
    visible, tripId, payment, newReceiptUri, onRequestCamera, onDeleteNewReceipt,
    onClose, onSuccess,
}: {
    visible: boolean;
    tripId: number;
    payment: ShipmentPayment;
    newReceiptUri: string | null;
    onRequestCamera: () => void;
    onDeleteNewReceipt: () => void;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const { showToast } = useToast();
    const { displayValue: amount, rawValue: parsed, onChangeText: onAmountBase } = useMoneyInput(Number(payment.amount));
    const [notes, setNotes] = useState(payment.notes ?? '');

    const { isLoading, error, updatePayment, clearError } = useUpdatePayment(() => {
        showToast({ type: 'success', message: 'Đã cập nhật ghi nhận tiền mặt' });
        onSuccess();
    });

    const handleAmountChange = (text: string) => {
        onAmountBase(text);
        if (error) clearError();
    };

    const handleSave = async () => {
        if (!parsed || parsed <= 0) {
            showToast({ type: 'error', message: 'Vui lòng nhập số tiền hợp lệ' });
            return;
        }
        await updatePayment(tripId, payment.id, parsed, newReceiptUri, notes.trim() || undefined);
    };

    const existingReceiptUrl = payment.receipt_urls[0] ?? null;
    const displayUri = newReceiptUri ?? existingReceiptUrl;

    if (!visible) return null;

    return (
        <View style={[StyleSheet.absoluteFill, { zIndex: 100 }]}>
            <Pressable style={[StyleSheet.absoluteFill, s.modalBackdrop]} onPress={onClose} />
            <KeyboardAvoidingView
                style={s.modalOverlay}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                pointerEvents="box-none"
            >
                <View style={s.paymentCard}>
                    <XStack justifyContent="space-between" alignItems="center" marginBottom={14}>
                        <XStack alignItems="center" gap={8}>
                            <Edit2 size={18} color={appTheme.colors.primary} />
                            <Text fontSize={16} fontWeight="900" color={appTheme.colors.text}>
                                Sửa ghi nhận tiền mặt
                            </Text>
                        </XStack>
                        <Pressable onPress={onClose} hitSlop={12}>
                            <X size={18} color={appTheme.colors.textMuted} />
                        </Pressable>
                    </XStack>

                    {/* Amount */}
                    <View style={{ marginBottom: 14, gap: 6 }}>
                        <Text fontSize={12} fontWeight="700" color={appTheme.colors.textMuted}>
                            SỐ TIỀN (VNĐ) *
                        </Text>
                        <TextInput
                            value={amount}
                            onChangeText={handleAmountChange}
                            keyboardType="numeric"
                            placeholder="Nhập số tiền..."
                            placeholderTextColor={appTheme.colors.textMuted}
                            returnKeyType="done"
                            style={s.amountInput}
                        />
                        {parsed > 0 ? (
                            <Text fontSize={11} color={appTheme.colors.primary} fontWeight="700">
                                = {parsed.toLocaleString('vi-VN')} ₫
                            </Text>
                        ) : null}
                    </View>

                    {/* Receipt photo */}
                    <View style={{ marginBottom: 14, gap: 6 }}>
                        <Text fontSize={12} fontWeight="700" color={appTheme.colors.textMuted}>
                            ẢNH BIÊN LAI {newReceiptUri ? '(MỚI)' : '(HIỆN TẠI)'}
                        </Text>
                        <PhotoCaptureCard
                            label="Biên lai thanh toán"
                            sublabel="Chụp lại để thay ảnh mới (nếu cần)"
                            uri={displayUri}
                            required={false}
                            onCapture={onRequestCamera}
                            onDelete={newReceiptUri ? onDeleteNewReceipt : () => {}}
                        />
                    </View>

                    {/* Notes */}
                    <View style={{ marginBottom: 14, gap: 6 }}>
                        <Text fontSize={12} fontWeight="700" color={appTheme.colors.textMuted}>
                            GHI CHÚ (TUỲ CHỌN)
                        </Text>
                        <TextInput
                            value={notes}
                            onChangeText={setNotes}
                            placeholder="Ghi chú thêm..."
                            placeholderTextColor={appTheme.colors.textMuted}
                            multiline
                            blurOnSubmit
                            style={s.notesInput}
                        />
                    </View>

                    {error ? (
                        <XStack
                            padding={10} borderRadius={8}
                            backgroundColor={appTheme.colors.dangerSoft}
                            borderWidth={1} borderColor={appTheme.colors.dangerBorder}
                            gap={8} alignItems="center"
                            style={{ marginBottom: 14 }}
                        >
                            <AlertTriangle size={13} color={appTheme.colors.danger} />
                            <Text fontSize={12} color={appTheme.colors.danger} flex={1}>{error}</Text>
                        </XStack>
                    ) : null}

                    <XStack gap={10}>
                        <Pressable style={[s.modalBtn, s.modalBtnSecondary, { flex: 1 }]} onPress={onClose}>
                            <Text fontSize={14} fontWeight="700" color={appTheme.colors.text}>Hủy</Text>
                        </Pressable>
                        <Pressable
                            style={[s.modalBtn, {
                                flex: 2,
                                backgroundColor: !parsed || isLoading
                                    ? appTheme.colors.primaryMuted
                                    : appTheme.colors.primary,
                            }]}
                            onPress={handleSave}
                            disabled={!parsed || isLoading}
                        >
                            <Text fontSize={14} fontWeight="900" color="#fff">
                                {isLoading ? 'Đang lưu...' : 'Lưu thay đổi'}
                            </Text>
                        </Pressable>
                    </XStack>
                </View>
            </KeyboardAvoidingView>
        </View>
    );
}

// ─── Receipt request section (chỉ hiện cho chuyến cuối của đơn hàng cash) ────

function ReceiptRequestSection({ trip, canRequest }: { trip: ActiveTrip; canRequest: boolean }) {
    if (!canRequest) return null;

    return (
        <Pressable
            style={[s.secondaryBtn, s.primaryOutlineBtn]}
            onPress={() => router.push({
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
            })}
        >
            <FileText size={14} color={appTheme.colors.primary} />
            <Text fontSize={13} fontWeight="700" color={appTheme.colors.primary}>
                Yêu cầu tạo phiếu thu
            </Text>
        </Pressable>
    );
}

// ─── Active trip content ──────────────────────────────────────────────────────

function ActiveTripContent({ trip, refresh }: { trip: ActiveTrip; refresh: () => void }) {
    const { showToast }   = useToast();
    const { showAlert }   = useAppAlert();
    const { showConfirm } = useConfirm();

    const { isLoading: lifecycleLoading, advance } = useTripLifecycle((updatedTrip) => {
        const msg = STATUS_ADVANCE_TOAST[updatedTrip.status as TripStatus];
        if (msg) showToast({ type: 'success', message: msg, duration: 2500 });
        refresh();
    });

    const [permission, requestPermission] = useCameraPermissions();

    // Camera state
    const [proofUri,   setProofUri]   = useState<string | null>(null);
    const [loadingUri, setLoadingUri] = useState<string | null>(null);
    const [returnUri,  setReturnUri]  = useState<string | null>(null);
    const [cameraTarget, setCameraTarget] = useState<'proof' | 'loading' | 'return' | 'paymentReceipt' | 'editReceipt' | null>(null);

    const [showRelease, setShowRelease] = useState(false);
    const [showExpense, setShowExpense] = useState(false);

    const [showPayment,       setShowPayment]       = useState<'cash' | 'unpaid' | null>(null);
    const [paymentReceiptUri, setPaymentReceiptUri] = useState<string | null>(null);
    const [editingPayment,    setEditingPayment]    = useState<ShipmentPayment | null>(null);
    const [editReceiptUri,    setEditReceiptUri]    = useState<string | null>(null);
    const [paymentSummary,    setPaymentSummary]    = useState<PaymentSummary | null>(null);
    const [payments,          setPayments]          = useState<ShipmentPayment[]>([]);

    const { isUploading: completingProof, completeWithProof } = useCompletionProof(async (completedTrip) => {
        const isLastDriverCash =
            completedTrip.is_final_shipment && completedTrip.order_payment_type === 'cash';
        if (isLastDriverCash) {
            router.replace({
                pathname: '/receipt-request',
                params: {
                    orderId:          String(completedTrip.order_id),
                    shipmentId:       String(completedTrip.id),
                    estimatedPrice:   completedTrip.estimated_price ?? '',
                    cargoName:        completedTrip.cargo_name ?? '',
                    pickupAddress:    completedTrip.pickup_address,
                    deliveryAddress:  completedTrip.delivery_address,
                    shipmentIndex:    String(completedTrip.shipment_index),
                    maxShipmentIndex: String(completedTrip.max_shipment_index),
                },
            });
        } else {
            await showAlert({ type: 'success', title: 'Hoàn thành chuyến!', message: 'Giao hàng thành công.', okLabel: 'Tuyệt vời!' });
            router.back();
        }
    });
    const { isUploading: submittingLoad, submitLoadingProof } = useLoadingProof(() => {
        showToast({ type: 'success', message: 'Đã lấy hàng – bắt đầu vận chuyển đến điểm giao', duration: 2500 });
        refresh();
    });
    const { isUploading: completingReturn, completeReturn } = useReturnComplete(async () => {
        await showAlert({ type: 'success', title: 'Hoàn hàng thành công!', message: 'Hàng đã được trả về điểm lấy.', okLabel: 'OK' });
        router.back();
    });

    const { isLoading: releaseLoading, releaseTrip }  = useReleaseTrip(() => router.back());
    const { expenses, load: loadExpenses }            = useShipmentExpenses(trip.id);

    useEffect(() => { void loadExpenses(); }, [loadExpenses]);

    const loadPaymentData = () => {
        Promise.all([
            tripService.getPaymentSummary(trip.id),
            tripService.getShipmentPayments(trip.id),
        ]).then(([summaryRes, paymentsRes]) => {
            setPaymentSummary(summaryRes);
            setPayments(paymentsRes.payments);
        }).catch(() => { /* silent — not critical */ });
    };

    useEffect(() => { loadPaymentData(); }, [trip.id]);

    const isWorking     = lifecycleLoading || completingProof || submittingLoad || completingReturn || releaseLoading;
    const nextAction    = NEXT_ACTIONS[trip.status as TripStatus];
    const accent        = STATUS_ACCENT[trip.status as TripStatus];
    const banner        = STATUS_BANNER[trip.status as TripStatus];
    const isPicking     = trip.status === 'picking';
    const isArrived     = trip.status === 'arrived';
    const isReturning   = trip.status === 'returning';
    const isReleasable  = trip.status === 'claimed' || trip.status === 'picking';
    const canAddExpense   = EXPENSE_ALLOWED_STATUSES.includes(trip.status as TripStatus);
    const isOrderCollectible = trip.order_payment_type === 'cash' || trip.order_payment_type === 'mixed';
    const canRecordCash   = isArrived && isOrderCollectible;
    const canMarkUnpaid   = isArrived && isOrderCollectible && (paymentSummary?.remaining ?? 0) > 0;

    // Chỉ hiện section yêu cầu phiếu thu cho chuyến cuối của đơn hàng cash (BR-008B)
    const canRequestReceipt =
        trip.status === 'completed' &&
        trip.is_final_shipment &&
        trip.order_payment_type === 'cash' || trip.order_payment_type === 'mixed';

    const openCamera = async (target: 'proof' | 'loading' | 'return' | 'paymentReceipt' | 'editReceipt') => {
        if (!permission?.granted) {
            const res = await requestPermission();
            if (!res.granted) return;
        }
        setCameraTarget(target);
    };

    const handleMarkFailed = async () => {
        const ok = await showConfirm({
            title: 'Xác nhận giao thất bại?',
            message: 'Bạn sẽ cần hoàn hàng về điểm lấy ban đầu.',
            confirmLabel: 'Xác nhận thất bại',
            cancelLabel: 'Hủy',
            danger: true,
        });
        if (!ok) return;
        await advance(trip.id, 'failed');
    };

    const expenseBadge = expenses.length > 0
        ? `${expenses.length} khoản · ${fmt(expenses.reduce((s, e) => s + Number(e.amount), 0))}`
        : undefined;

    return (
        <View style={{ flex: 1, backgroundColor: appTheme.colors.background }}>
            <ScreenHeader
                title={`Đơn #${trip.order_id} · ${trip.shipment_index}/${trip.max_shipment_index}`}
                showBack
                right={<TripStatusBadge status={trip.status as TripStatus} />}
            />

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{
                    paddingHorizontal: appTheme.spacing.screenX,
                    paddingTop: 14,
                    paddingBottom: appTheme.spacing.screenBottom + 16,
                    gap: 10,
                }}
                showsVerticalScrollIndicator={false}
            >
                {/* ── Status card ── */}
                <YStack
                    padding={14} borderRadius={appTheme.radius.lg} gap={12}
                    borderWidth={1}
                    borderColor={accent?.border ?? appTheme.colors.border}
                    backgroundColor={accent?.bg ?? appTheme.colors.surfaceSoft}
                >
                    <StatusStepper status={trip.status as TripStatus} />
                    {banner ? (
                        <XStack gap={8} alignItems="center" paddingTop={4}
                            borderTopWidth={1} borderTopColor={accent?.border ?? appTheme.colors.border}>
                            {banner.icon}
                            <Text fontSize={12} fontWeight="800"
                                color={accent?.text ?? appTheme.colors.text} flex={1}>
                                {banner.text}
                            </Text>
                        </XStack>
                    ) : null}
                </YStack>

                {/* ── Route ── */}
                <RouteRow
                    pickup={trip.pickup_address}
                    delivery={trip.delivery_address}
                    isReturning={isReturning}
                />

                {/* ── Cargo details (collapsible) ── */}
                <CollapsibleSection
                    label="Hàng hóa"
                    badge={trip.cargo_name ?? undefined}
                >
                    {trip.cargo_name ? (
                        <XStack justifyContent="space-between">
                            <Text fontSize={12} color={appTheme.colors.textMuted}>Tên hàng</Text>
                            <Text fontSize={12} fontWeight="700" color={appTheme.colors.text}>{trip.cargo_name}</Text>
                        </XStack>
                    ) : null}
                    {trip.cargo_weight_kg ? (
                        <XStack justifyContent="space-between">
                            <Text fontSize={12} color={appTheme.colors.textMuted}>Trọng lượng</Text>
                            <Text fontSize={12} fontWeight="700" color={appTheme.colors.text}>{trip.cargo_weight_kg} kg</Text>
                        </XStack>
                    ) : null}
                    {trip.estimated_price ? (
                        <XStack justifyContent="space-between">
                            <Text fontSize={12} color={appTheme.colors.textMuted}>Giá trị</Text>
                            <Text fontSize={12} fontWeight="700" color={appTheme.colors.text}>
                                {fmt(trip.estimated_price)}
                            </Text>
                        </XStack>
                    ) : null}
                    {trip.notes ? (
                        <XStack justifyContent="space-between" alignItems="flex-start" gap={12}>
                            <Text fontSize={12} color={appTheme.colors.textMuted}>Ghi chú</Text>
                            <Text fontSize={12} fontWeight="700" color={appTheme.colors.text}
                                flex={1} textAlign="right" numberOfLines={3}>{trip.notes}</Text>
                        </XStack>
                    ) : null}
                    {trip.is_final_shipment ? (
                        <XStack gap={6} alignItems="center" paddingTop={4}
                            borderTopWidth={1} borderTopColor={appTheme.colors.border}>
                            <Package size={12} color={appTheme.colors.primary} />
                            <Text fontSize={11} fontWeight="700" color={appTheme.colors.primary}>
                                Chuyến cuối của đơn hàng
                            </Text>
                        </XStack>
                    ) : null}
                </CollapsibleSection>

                {/* ── Stops (collapsible) – Item 4 ── */}
                <StopsSection stops={trip.stops ?? []} tripStatus={trip.status as TripStatus} />

                {/* ── Expenses (collapsible) ── */}
                <CollapsibleSection label="Chi phí phát sinh" badge={expenseBadge}>
                    <ExpenseInlineList
                        expenses={expenses}
                        canAdd={canAddExpense}
                        onAdd={() => setShowExpense(true)}
                    />
                </CollapsibleSection>

                {/* ── Loading proof section (PICKING) – Item 1 ── */}
                {isPicking ? (
                    <YStack borderRadius={appTheme.radius.lg} borderWidth={1}
                        borderColor={appTheme.colors.successSoft}
                        backgroundColor={appTheme.colors.surface}
                        padding={14} gap={10}
                    >
                        <Text fontSize={12} fontWeight="900" color={appTheme.colors.textMuted}>
                            ẢNH XÁC NHẬN LẤY HÀNG (BẮT BUỘC)
                        </Text>
                        <PhotoCaptureCard
                            label="Ảnh lấy hàng"
                            sublabel="Chụp hàng hóa tại điểm lấy (BR-013)"
                            uri={loadingUri}
                            required
                            onCapture={() => openCamera('loading')}
                            onDelete={() => setLoadingUri(null)}
                        />
                        <LifecycleActionButton
                            label={submittingLoad ? 'Đang tải ảnh...' : 'Xác nhận đã lấy hàng'}
                            tone="primary"
                            onPress={() => { if (loadingUri) void submitLoadingProof(trip.id, loadingUri); }}
                            isLoading={submittingLoad}
                            disabled={!loadingUri}
                            icon={<CheckCircle size={17} color={loadingUri ? '#fff' : appTheme.colors.textMuted} />}
                        />
                    </YStack>
                ) : null}

                {/* ── Delivery proof section (ARRIVED) — chỉ ảnh xác nhận giao hàng ── */}
                {isArrived ? (
                    <YStack borderRadius={appTheme.radius.lg} borderWidth={1}
                        borderColor={appTheme.colors.successSoft}
                        backgroundColor={appTheme.colors.surface}
                        padding={14} gap={10}
                    >
                        <Text fontSize={12} fontWeight="900" color={appTheme.colors.textMuted}>
                            ẢNH XÁC NHẬN GIAO HÀNG (BẮT BUỘC)
                        </Text>
                        <PhotoCaptureCard
                            label="Ảnh xác nhận giao hàng"
                            sublabel="Chụp hàng / người nhận tại điểm giao (BR-015/016)"
                            uri={proofUri}
                            required
                            onCapture={() => openCamera('proof')}
                            onDelete={() => setProofUri(null)}
                        />
                        <LifecycleActionButton
                            label={completingProof ? 'Đang tải ảnh...' : 'Hoàn thành chuyến'}
                            tone="primary"
                            onPress={() => {
                                if (proofUri) void completeWithProof(trip.id, proofUri);
                            }}
                            isLoading={completingProof}
                            disabled={!proofUri}
                            icon={<CheckCircle size={17} color={proofUri ? '#fff' : appTheme.colors.textMuted} />}
                        />
                    </YStack>
                ) : null}

                {/* ── Return complete section (RETURNING) – Item 5 ── */}
                {isReturning ? (
                    <YStack borderRadius={appTheme.radius.lg} borderWidth={1}
                        borderColor={appTheme.colors.border}
                        backgroundColor={appTheme.colors.surface}
                        padding={14} gap={10}
                    >
                        <Text fontSize={12} fontWeight="900" color={appTheme.colors.textMuted}>
                            XÁC NHẬN ĐÃ HOÀN HÀNG
                        </Text>
                        <PhotoCaptureCard
                            label="Ảnh hoàn hàng (tuỳ chọn)"
                            sublabel="Chụp ảnh hàng đã trả về kho"
                            uri={returnUri}
                            required={false}
                            onCapture={() => openCamera('return')}
                            onDelete={() => setReturnUri(null)}
                        />
                        <LifecycleActionButton
                            label={completingReturn ? 'Đang xử lý...' : 'Xác nhận hoàn hàng'}
                            tone="secondary"
                            onPress={() => void completeReturn(trip.id, returnUri ?? undefined)}
                            isLoading={completingReturn}
                            icon={<RotateCcw size={17} color="#fff" />}
                        />
                    </YStack>
                ) : null}

                {/* ── Primary action (non-special statuses) ── */}
                {nextAction && !isArrived && !isPicking && !isReturning ? (
                    <LifecycleActionButton
                        label={nextAction.label}
                        tone={nextAction.tone}
                        onPress={() => void advance(trip.id, nextAction.nextStatus)}
                        isLoading={isWorking}
                    />
                ) : null}

                {/* ── Thanh toán (TH2 cash / TH3 credit) ── */}
                {(canRecordCash || canMarkUnpaid || payments.length > 0) ? (
                    <YStack
                        padding={12} borderRadius={appTheme.radius.lg} gap={10}
                        borderWidth={1} borderColor={appTheme.colors.border}
                        backgroundColor={appTheme.colors.surface}
                    >
                        <Text fontSize={11} fontWeight="900" color={appTheme.colors.textMuted}>
                            THANH TOÁN
                        </Text>
                        {payments.length > 0 ? (
                            <YStack gap={6}>
                                {payments.map((p) => (
                                    <XStack
                                        key={p.id}
                                        alignItems="center" gap={8}
                                        padding={8} borderRadius={appTheme.radius.sm}
                                        backgroundColor={appTheme.colors.successSoft}
                                        borderWidth={1} borderColor={appTheme.colors.successBorder}
                                    >
                                        <YStack flex={1} gap={2}>
                                            <Text fontSize={13} fontWeight="900" color={appTheme.colors.success}>
                                                {fmt(Number(p.amount))}
                                            </Text>
                                            <Text fontSize={10} color={appTheme.colors.textMuted}>
                                                {new Date(p.collected_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                            </Text>
                                        </YStack>
                                        <Pressable onPress={() => setEditingPayment(p)} hitSlop={8}>
                                            <Edit2 size={14} color={appTheme.colors.primary} />
                                        </Pressable>
                                    </XStack>
                                ))}
                            </YStack>
                        ) : null}
                        <XStack gap={8}>
                            {canRecordCash ? (
                                <Pressable
                                    style={[s.secondaryBtn, s.primaryOutlineBtn, { flex: 1 }]}
                                    onPress={() => setShowPayment('cash')}
                                >
                                    <Text fontSize={12} fontWeight="700" color={appTheme.colors.primary}>
                                        {payments.length > 0 ? '+ Thêm lần thu' : 'Thu tiền mặt'}
                                    </Text>
                                </Pressable>
                            ) : null}
                            {canMarkUnpaid ? (
                                <Pressable
                                    style={[s.secondaryBtn, s.warnBtn, { flex: 1 }]}
                                    onPress={() => setShowPayment('unpaid')}
                                >
                                    <Text fontSize={12} fontWeight="700" color={appTheme.colors.warningText}>
                                        Báo công nợ
                                    </Text>
                                </Pressable>
                            ) : null}
                        </XStack>
                    </YStack>
                ) : null}

                {/* ── Phiếu thu (Yêu cầu tạo phiếu thu — chỉ last driver cash) ── */}
                <ReceiptRequestSection
                    trip={trip}
                    canRequest={canRequestReceipt}
                />

                {/* ── Secondary actions row ── */}
                <XStack gap={8}>
                    {isArrived ? (
                        <Pressable style={[s.secondaryBtn, s.dangerBtn]} onPress={handleMarkFailed}>
                            <XCircle size={14} color={appTheme.colors.danger} />
                            <Text fontSize={12} fontWeight="700" color={appTheme.colors.danger}>Thất bại</Text>
                        </Pressable>
                    ) : null}

                    {isReleasable ? (
                        <Pressable style={[s.secondaryBtn, s.dangerBtn]} onPress={() => setShowRelease(true)}>
                            <X size={14} color={appTheme.colors.danger} />
                            <Text fontSize={12} fontWeight="700" color={appTheme.colors.danger}>Hủy chuyến</Text>
                        </Pressable>
                    ) : null}

                    <Pressable
                        style={[s.secondaryBtn, s.warnBtn, { flex: 1 }]}
                        onPress={() => router.push({ pathname: '/report-incident', params: { shipmentId: String(trip.id) } })}
                    >
                        <AlertTriangle size={14} color={appTheme.colors.warningText} />
                        <Text fontSize={12} fontWeight="700" color={appTheme.colors.warningText}>Báo sự cố</Text>
                    </Pressable>
                </XStack>
            </ScrollView>

            <CameraModal
                visible={cameraTarget !== null}
                label={
                    cameraTarget === 'loading'        ? 'Chụp ảnh lấy hàng' :
                    cameraTarget === 'proof'          ? 'Chụp ảnh xác nhận giao hàng' :
                    cameraTarget === 'paymentReceipt' ? 'Chụp ảnh biên lai thanh toán' :
                    cameraTarget === 'editReceipt'    ? 'Chụp ảnh biên lai (cập nhật)' :
                                                        'Chụp ảnh hoàn hàng (tuỳ chọn)'
                }
                onCapture={(uri) => {
                    if      (cameraTarget === 'loading')        setLoadingUri(uri);
                    else if (cameraTarget === 'proof')          setProofUri(uri);
                    else if (cameraTarget === 'return')         setReturnUri(uri);
                    else if (cameraTarget === 'paymentReceipt') setPaymentReceiptUri(uri);
                    else if (cameraTarget === 'editReceipt')    setEditReceiptUri(uri);
                    setCameraTarget(null);
                }}
                onClose={() => setCameraTarget(null)}
            />

            <ReasonModal
                visible={showRelease}
                title="Hủy chuyến"
                description="Xác nhận hủy chuyến này? Đơn hàng sẽ được trả về pool để tài xế khác nhận."
                placeholder="Lý do hủy (tùy chọn)..."
                confirmLabel="Xác nhận hủy chuyến"
                confirmDanger
                onConfirm={(reason) => { setShowRelease(false); void releaseTrip(trip.id, reason || undefined); }}
                onClose={() => setShowRelease(false)}
            />

            <ExpenseFormModal
                visible={showExpense}
                shipmentId={trip.id}
                onClose={() => setShowExpense(false)}
                onSuccess={() => { setShowExpense(false); void loadExpenses(); }}
            />

            {/* PaymentModal nhận receiptUri + callbacks từ đây — không có CameraModal bên trong Modal */}
            {showPayment ? (
                <PaymentModal
                    visible
                    tripId={trip.id}
                    mode={showPayment}
                    receiptUri={paymentReceiptUri}
                    estimatedPrice={trip.estimated_price ? Number(trip.estimated_price) : null}
                    remainingAmount={paymentSummary?.remaining ?? null}
                    onRequestCamera={() => openCamera('paymentReceipt')}
                    onDeleteReceipt={() => setPaymentReceiptUri(null)}
                    onClose={() => { setShowPayment(null); setPaymentReceiptUri(null); }}
                    onSuccess={() => { setShowPayment(null); setPaymentReceiptUri(null); refresh(); void loadPaymentData(); }}
                />
            ) : null}

            {/* EditPaymentModal — dùng View+absoluteFill, không phải Modal */}
            {editingPayment ? (
                <EditPaymentModal
                    visible
                    tripId={trip.id}
                    payment={editingPayment}
                    newReceiptUri={editReceiptUri}
                    onRequestCamera={() => openCamera('editReceipt')}
                    onDeleteNewReceipt={() => setEditReceiptUri(null)}
                    onClose={() => { setEditingPayment(null); setEditReceiptUri(null); }}
                    onSuccess={() => { setEditingPayment(null); setEditReceiptUri(null); void loadPaymentData(); }}
                />
            ) : null}
        </View>
    );
}


export function ActiveTripScreen() {
    const { trip, isLoading, error, refresh } = useActiveTrip();

    if (isLoading) {
        return (
            <View style={{ flex: 1, backgroundColor: appTheme.colors.background }}>
                <ScreenHeader title="Chuyến hiện tại" showBack />
                <ScrollView style={{ flex: 1 }} scrollEnabled={false}
                    contentContainerStyle={{ paddingBottom: appTheme.spacing.screenBottom }}>
                    <ActiveTripSkeleton />
                </ScrollView>
            </View>
        );
    }

    if (error || !trip) {
        return (
            <View style={{ flex: 1, backgroundColor: appTheme.colors.background }}>
                <ScreenHeader title="Chuyến hiện tại" showBack />
                <YStack flex={1} alignItems="center" justifyContent="center" gap={12} padding={24}>
                    <AppText variant="bodyStrong" tone="muted">
                        {error ?? 'Bạn chưa có chuyến nào đang hoạt động.'}
                    </AppText>
                    <AppText variant="caption" tone="primary" onPress={() => router.push('/trip-pool')}>
                        → Xem danh sách chuyến
                    </AppText>
                </YStack>
            </View>
        );
    }

    return (
        <>
            <StatusBar style="dark" />
            <ActiveTripContent trip={trip} refresh={refresh} />
        </>
    );
}


const s = StyleSheet.create({
    // Collapsible badge
    badge: {
        paddingHorizontal: 8, paddingVertical: 2,
        borderRadius: appTheme.radius.pill,
        backgroundColor: appTheme.colors.primarySoft,
        borderWidth: 1, borderColor: appTheme.colors.primaryMuted,
    },

    // Route dots
    routeDot: {
        width: 26, height: 26, borderRadius: 8,
        borderWidth: 1,
        alignItems: 'center', justifyContent: 'center',
        marginTop: 1,
    },
    routeLine: {
        height: 1,
        backgroundColor: appTheme.colors.border,
        marginLeft: 36,
    },

    // Expense receipt thumbnail
    receiptThumb: { width: 52, height: 52, borderRadius: 8 },

    // Expense add button
    addExpenseBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingVertical: 8, paddingHorizontal: 12,
        borderRadius: 10, alignSelf: 'flex-start',
        borderWidth: 1, borderStyle: 'dashed',
        borderColor: appTheme.colors.primaryMuted,
        backgroundColor: appTheme.colors.primarySoft,
    },

    // Secondary action buttons
    secondaryBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
        paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12,
        borderWidth: 1.5,
    },
    dangerBtn: {
        borderColor: appTheme.colors.dangerBorder,
        backgroundColor: appTheme.colors.dangerSoft,
    },
    warnBtn: {
        borderColor: appTheme.colors.warningBorder,
        backgroundColor: appTheme.colors.warningSoft,
    },
    successBtn: {
        borderColor: appTheme.colors.successSoft,
        backgroundColor: appTheme.colors.successSoft,
    },
    primaryOutlineBtn: {
        borderColor: appTheme.colors.primaryMuted,
        backgroundColor: appTheme.colors.primarySoft,
        flex: 1,
    },

    // Stop dot
    stopDot: { width: 10, height: 10, borderRadius: 5 },

    // Payment / Edit modal overlay (View + absoluteFill, không dùng RN Modal)
    modalBackdrop: {
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    modalOverlay: {
        flex: 1,
        justifyContent: 'center',
    },
    paymentCard: {
        backgroundColor: appTheme.colors.surface,
        borderRadius: appTheme.radius.xl,
        padding: 20,
        margin: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 12,
        elevation: 10,
    },
    modalBtn: {
        paddingVertical: 12, borderRadius: 10,
        alignItems: 'center', justifyContent: 'center',
    },
    modalBtnSecondary: {
        backgroundColor: appTheme.colors.surfaceSoft,
        borderWidth: 1, borderColor: appTheme.colors.border,
    },
    amountInput: {
        borderWidth: 1.5, borderColor: appTheme.colors.border,
        borderRadius: 10, padding: 12,
        fontSize: 20, fontWeight: '900',
        color: appTheme.colors.text,
        backgroundColor: appTheme.colors.background,
    },
    notesInput: {
        borderWidth: 1.5, borderColor: appTheme.colors.border,
        borderRadius: 10, padding: 12, fontSize: 14,
        color: appTheme.colors.text, minHeight: 60,
        backgroundColor: appTheme.colors.background,
        textAlignVertical: 'top',
    },
});
