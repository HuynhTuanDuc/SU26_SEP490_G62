import { useCallback, useEffect, useState } from 'react';
import {
    KeyboardAvoidingView, Platform,
    Pressable, ScrollView, StyleSheet, TextInput, View,
} from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCameraPermissions } from 'expo-camera';
import {
    AlertTriangle, CheckCircle, ChevronDown, ChevronUp,
    Clock, FileText, Info, MapPin, Package,
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
import { useReceiptRequest, useLoadReceiptRequest } from '@/hooks/use-receipt-request';
import { useShipmentExpenses }  from '@/hooks/use-shipment-expenses';
import { tripService }          from '@/services/trip-service';
import { useTripLifecycle }     from '@/hooks/use-trip-lifecycle';
import { useToast, useAppAlert, useConfirm } from '@/providers/ui-provider';
import type { ActiveTrip, Expense, ReceiptRequest, TripStatus, TripStop } from '@/types/trip';
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
    arrived:   'Đã đến điểm giao — tiến hành giao hàng',
    failed:    'Ghi nhận giao thất bại — cần hoàn hàng về điểm lấy',
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

// ─── Stops section ───────────────────────────────────────────────────────────

// Derive stop visual state từ trip status khi DB chưa có timestamp
// (xảy ra khi driver update status mà chưa kịp sync DB)
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

// ─── Receipt Request Modal (Yêu cầu tạo phiếu thu) ──────────────────────────

function ReceiptRequestModal({
    visible, trip, onClose, onSuccess,
}: {
    visible: boolean;
    trip: ActiveTrip;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const { showToast } = useToast();
    const [actualKm, setActualKm] = useState('');
    const { isLoading, error, request, clearError } = useReceiptRequest(() => {
        showToast({ type: 'success', message: 'Đã gửi yêu cầu — coordinator sẽ xử lý sớm nhất' });
        onSuccess();
    });

    const handleSubmit = async () => {
        const km = actualKm.trim() ? Number(actualKm.replace(',', '.')) : undefined;
        if (km !== undefined && (isNaN(km) || km <= 0)) {
            showToast({ type: 'error', message: 'Số km không hợp lệ' });
            return;
        }
        await request(trip.id, km);
    };

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
                    {/* Header */}
                    <XStack justifyContent="space-between" alignItems="center" marginBottom={14}>
                        <XStack alignItems="center" gap={8}>
                            <FileText size={18} color={appTheme.colors.primary} />
                            <Text fontSize={16} fontWeight="900" color={appTheme.colors.text}>
                                Yêu cầu tạo phiếu thu
                            </Text>
                        </XStack>
                        <Pressable onPress={onClose} hitSlop={12}>
                            <X size={18} color={appTheme.colors.textMuted} />
                        </Pressable>
                    </XStack>

                    {/* Trip info */}
                    <YStack
                        padding={12} borderRadius={appTheme.radius.md}
                        backgroundColor={appTheme.colors.surfaceSoft}
                        borderWidth={1} borderColor={appTheme.colors.border}
                        gap={6} style={{ marginBottom: 14 }}
                    >
                        <XStack alignItems="center" gap={6}>
                            <Info size={12} color={appTheme.colors.textMuted} />
                            <Text fontSize={11} fontWeight="700" color={appTheme.colors.textMuted}>
                                THÔNG TIN CHUYẾN
                            </Text>
                        </XStack>
                        <Text fontSize={12} fontWeight="700" color={appTheme.colors.text}>
                            Đơn #{trip.order_id} · Chuyến {trip.shipment_index}/{trip.max_shipment_index}
                        </Text>
                        <Text fontSize={12} color={appTheme.colors.textMuted} numberOfLines={1}>
                            {trip.pickup_address}
                        </Text>
                        <Text fontSize={12} color={appTheme.colors.textMuted} numberOfLines={1}>
                            → {trip.delivery_address}
                        </Text>
                        {trip.cargo_name ? (
                            <Text fontSize={12} color={appTheme.colors.text}>Hàng: {trip.cargo_name}</Text>
                        ) : null}
                        {trip.estimated_price ? (
                            <XStack justifyContent="space-between">
                                <Text fontSize={12} color={appTheme.colors.textMuted}>Giá ước tính</Text>
                                <Text fontSize={12} fontWeight="700" color={appTheme.colors.primary}>
                                    {fmt(trip.estimated_price)}
                                </Text>
                            </XStack>
                        ) : null}
                    </YStack>

                    {/* Actual km input */}
                    <View style={{ marginBottom: 14, gap: 6 }}>
                        <Text fontSize={12} fontWeight="700" color={appTheme.colors.textMuted}>
                            SỐ KM THỰC TẾ (TUỲ CHỌN)
                        </Text>
                        <TextInput
                            value={actualKm}
                            onChangeText={(t) => { setActualKm(t); if (error) clearError(); }}
                            keyboardType="numeric"
                            placeholder="Bỏ trống = dùng giá ước tính ban đầu"
                            placeholderTextColor={appTheme.colors.textMuted}
                            returnKeyType="done"
                            style={s.amountInput}
                        />
                        {actualKm.trim() && Number(actualKm) > 0 ? (
                            <XStack gap={6} alignItems="center">
                                <AlertTriangle size={11} color={appTheme.colors.warningText} />
                                <Text fontSize={11} color={appTheme.colors.warningText} flex={1}>
                                    Coordinator sẽ tính lại giá theo {actualKm} km thực tế
                                </Text>
                            </XStack>
                        ) : null}
                    </View>

                    {/* One-time warning */}
                    <XStack
                        padding={10} borderRadius={appTheme.radius.sm}
                        backgroundColor={appTheme.colors.warningSoft}
                        borderWidth={1} borderColor={appTheme.colors.warningBorder}
                        gap={6} alignItems="center"
                        style={{ marginBottom: 14 }}
                    >
                        <AlertTriangle size={12} color={appTheme.colors.warningText} />
                        <Text fontSize={11} color={appTheme.colors.warningText} flex={1} lineHeight={16}>
                            Phiếu thu chỉ được tạo 1 lần cho mỗi chuyến. Kiểm tra kỹ trước khi xác nhận.
                        </Text>
                    </XStack>

                    {/* API error */}
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

                    {/* Actions */}
                    <XStack gap={10}>
                        <Pressable style={[s.modalBtn, s.modalBtnSecondary, { flex: 1 }]} onPress={onClose}>
                            <Text fontSize={14} fontWeight="700" color={appTheme.colors.text}>Hủy</Text>
                        </Pressable>
                        <Pressable
                            style={[s.modalBtn, {
                                flex: 2,
                                backgroundColor: isLoading
                                    ? appTheme.colors.primaryMuted
                                    : appTheme.colors.primary,
                            }]}
                            onPress={handleSubmit}
                            disabled={isLoading}
                        >
                            <Text fontSize={14} fontWeight="900" color="#fff">
                                {isLoading ? 'Đang gửi...' : 'Xác nhận gửi yêu cầu'}
                            </Text>
                        </Pressable>
                    </XStack>
                </View>
            </KeyboardAvoidingView>
        </View>
    );
}

// ─── Receipt Request Section ──────────────────────────────────────────────────

function ReceiptRequestSection({
    trip,
    receiptRequest,
    canRequest,
    onRequestSuccess,
}: {
    trip: ActiveTrip;
    receiptRequest: ReceiptRequest | null;
    canRequest: boolean;
    onRequestSuccess: () => void;
}) {
    const [showModal, setShowModal] = useState(false);

    if (!canRequest) return null;

    if (receiptRequest) {
        if (receiptRequest.status === 'pending' || receiptRequest.status === 'processing') {
            return (
                <XStack
                    padding={12} borderRadius={appTheme.radius.md}
                    backgroundColor={appTheme.colors.warningSoft}
                    borderWidth={1} borderColor={appTheme.colors.warningBorder}
                    alignItems="center" gap={8}
                >
                    <Clock size={14} color={appTheme.colors.warningText} />
                    <YStack flex={1} gap={2}>
                        <Text fontSize={12} fontWeight="700" color={appTheme.colors.warningText}>
                            Đã gửi yêu cầu tạo phiếu thu
                        </Text>
                        <Text fontSize={11} color={appTheme.colors.warningText}>
                            Đang chờ coordinator xử lý
                            {receiptRequest.actual_km ? ` · ${receiptRequest.actual_km} km` : ''}
                        </Text>
                    </YStack>
                </XStack>
            );
        }

        if (receiptRequest.status === 'approved') {
            return (
                <XStack
                    padding={12} borderRadius={appTheme.radius.md}
                    backgroundColor={appTheme.colors.successSoft}
                    borderWidth={1} borderColor={appTheme.colors.successBorder}
                    alignItems="center" gap={8}
                >
                    <CheckCircle size={14} color={appTheme.colors.success} />
                    <Text fontSize={12} fontWeight="700" color={appTheme.colors.success} flex={1}>
                        Phiếu thu đã được tạo — xem chi tiết trong thông báo
                    </Text>
                </XStack>
            );
        }

        if (receiptRequest.status === 'rejected') {
            return (
                <YStack
                    padding={12} borderRadius={appTheme.radius.md}
                    backgroundColor={appTheme.colors.dangerSoft}
                    borderWidth={1} borderColor={appTheme.colors.dangerBorder}
                    gap={4}
                >
                    <XStack alignItems="center" gap={8}>
                        <XCircle size={14} color={appTheme.colors.danger} />
                        <Text fontSize={12} fontWeight="700" color={appTheme.colors.danger}>
                            Yêu cầu phiếu thu bị từ chối
                        </Text>
                    </XStack>
                    {receiptRequest.coordinator_notes ? (
                        <Text fontSize={11} color={appTheme.colors.danger} style={{ paddingLeft: 22 }}>
                            Lý do: {receiptRequest.coordinator_notes}
                        </Text>
                    ) : null}
                </YStack>
            );
        }
    }

    return (
        <>
            <Pressable
                style={[s.secondaryBtn, s.primaryOutlineBtn]}
                onPress={() => setShowModal(true)}
            >
                <FileText size={14} color={appTheme.colors.primary} />
                <Text fontSize={13} fontWeight="700" color={appTheme.colors.primary}>
                    Yêu cầu tạo phiếu thu
                </Text>
            </Pressable>

            {showModal ? (
                <ReceiptRequestModal
                    visible
                    trip={trip}
                    onClose={() => setShowModal(false)}
                    onSuccess={() => { setShowModal(false); onRequestSuccess(); }}
                />
            ) : null}
        </>
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
    const [receiptUri, setReceiptUri] = useState<string | null>(null);
    const [loadingUri, setLoadingUri] = useState<string | null>(null);
    const [returnUri,  setReturnUri]  = useState<string | null>(null);
    const [cameraTarget, setCameraTarget] = useState<'proof' | 'receipt' | 'loading' | 'return' | null>(null);

    const [showRelease, setShowRelease] = useState(false);
    const [showExpense, setShowExpense] = useState(false);

    const { isUploading: completingProof, completeWithProof } = useCompletionProof(async () => {
        await showAlert({ type: 'success', title: 'Hoàn thành chuyến!', message: 'Giao hàng thành công.', okLabel: 'Tuyệt vời!' });
        router.back();
    });
    const { isUploading: submittingLoad, submitLoadingProof } = useLoadingProof(() => {
        showToast({ type: 'success', message: 'Đã lấy hàng — bắt đầu vận chuyển đến điểm giao', duration: 2500 });
        refresh();
    });
    const { isUploading: completingReturn, completeReturn } = useReturnComplete(async () => {
        await showAlert({ type: 'success', title: 'Hoàn hàng thành công!', message: 'Hàng đã được trả về điểm lấy.', okLabel: 'OK' });
        router.back();
    });

    const { isLoading: releaseLoading, releaseTrip }  = useReleaseTrip(() => router.back());
    const { expenses, load: loadExpenses }            = useShipmentExpenses(trip.id);

    useEffect(() => { void loadExpenses(); }, [loadExpenses]);

    const isWorking     = lifecycleLoading || completingProof || submittingLoad || completingReturn || releaseLoading;
    const nextAction    = NEXT_ACTIONS[trip.status as TripStatus];
    const accent        = STATUS_ACCENT[trip.status as TripStatus];
    const banner        = STATUS_BANNER[trip.status as TripStatus];
    const isPicking     = trip.status === 'picking';
    const isArrived     = trip.status === 'arrived';
    const isReturning   = trip.status === 'returning';
    const isReleasable  = trip.status === 'claimed' || trip.status === 'picking';
    const canAddExpense = EXPENSE_ALLOWED_STATUSES.includes(trip.status as TripStatus);

    // Yêu cầu tạo phiếu thu: từ lúc đang vận chuyển trở đi
    const canRequestReceipt = ['transit', 'arrived', 'completed'].includes(trip.status);

    // Receipt request — load khi section hiện, reload sau khi gửi yêu cầu thành công
    const { receiptRequest, loadReceiptRequest } = useLoadReceiptRequest(canRequestReceipt ? trip.id : null);

    useEffect(() => { void loadReceiptRequest(); }, [loadReceiptRequest]);

    const openCamera = async (target: 'proof' | 'receipt' | 'loading' | 'return') => {
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

                {/* ── Stops (collapsible) — Item 4 ── */}
                <StopsSection stops={trip.stops ?? []} tripStatus={trip.status as TripStatus} />

                {/* ── Expenses (collapsible) ── */}
                <CollapsibleSection label="Chi phí phát sinh" badge={expenseBadge}>
                    <ExpenseInlineList
                        expenses={expenses}
                        canAdd={canAddExpense}
                        onAdd={() => setShowExpense(true)}
                    />
                </CollapsibleSection>

                {/* ── Loading proof section (PICKING) — Item 1 ── */}
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

                {/* ── Delivery proof section (ARRIVED) — 2 ảnh bắt buộc ── */}
                {isArrived ? (
                    <YStack borderRadius={appTheme.radius.lg} borderWidth={1}
                        borderColor={appTheme.colors.successSoft}
                        backgroundColor={appTheme.colors.surface}
                        padding={14} gap={10}
                    >
                        <Text fontSize={12} fontWeight="900" color={appTheme.colors.textMuted}>
                            ẢNH XÁC NHẬN GIAO HÀNG (2 ẢNH BẮT BUỘC)
                        </Text>
                        <PhotoCaptureCard
                            label="Ảnh xác nhận giao hàng"
                            sublabel="Chụp hàng / người nhận tại điểm giao (BR-015)"
                            uri={proofUri}
                            required
                            onCapture={() => openCamera('proof')}
                            onDelete={() => setProofUri(null)}
                        />
                        <PhotoCaptureCard
                            label="Ảnh biên lai / hóa đơn"
                            sublabel="Chụp biên lai hoặc hóa đơn có chữ ký của khách"
                            uri={receiptUri}
                            required
                            onCapture={() => openCamera('receipt')}
                            onDelete={() => setReceiptUri(null)}
                        />
                        <LifecycleActionButton
                            label={completingProof ? 'Đang tải ảnh...' : 'Hoàn thành chuyến'}
                            tone="primary"
                            onPress={() => {
                                if (proofUri && receiptUri)
                                    void completeWithProof(trip.id, proofUri, receiptUri);
                            }}
                            isLoading={completingProof}
                            disabled={!proofUri || !receiptUri}
                            icon={<CheckCircle size={17} color={(proofUri && receiptUri) ? '#fff' : appTheme.colors.textMuted} />}
                        />
                    </YStack>
                ) : null}

                {/* ── Return complete section (RETURNING) — Item 5 ── */}
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

                {/* ── Phiếu thu (Yêu cầu tạo phiếu thu) ── */}
                <ReceiptRequestSection
                    trip={trip}
                    receiptRequest={receiptRequest}
                    canRequest={canRequestReceipt}
                    onRequestSuccess={() => void loadReceiptRequest()}
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

            {/* ── Modals ── */}
            {/* Một CameraModal duy nhất — tránh Modal-in-Modal */}
            <CameraModal
                visible={cameraTarget !== null}
                label={
                    cameraTarget === 'loading' ? 'Chụp ảnh lấy hàng' :
                    cameraTarget === 'proof'   ? 'Chụp ảnh xác nhận giao hàng' :
                    cameraTarget === 'receipt' ? 'Chụp ảnh biên lai / hóa đơn' :
                                                 'Chụp ảnh hoàn hàng (tuỳ chọn)'
                }
                onCapture={(uri) => {
                    if      (cameraTarget === 'loading') setLoadingUri(uri);
                    else if (cameraTarget === 'proof')   setProofUri(uri);
                    else if (cameraTarget === 'receipt') setReceiptUri(uri);
                    else if (cameraTarget === 'return')  setReturnUri(uri);
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

        </View>
    );
}

// ─── Screen shell ─────────────────────────────────────────────────────────────

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

// ─── Styles ───────────────────────────────────────────────────────────────────

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

    // Receipt request / Payment modal
    modalBackdrop: {
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    modalOverlay: {
        flex: 1,
        justifyContent: 'center',
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
    paymentCard: {
        backgroundColor: appTheme.colors.surface,
        borderRadius: appTheme.radius.xl,
        padding: 20,
        margin: 20,
        // Shadow để nổi lên trên backdrop
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 12,
        elevation: 10,
    },
});
