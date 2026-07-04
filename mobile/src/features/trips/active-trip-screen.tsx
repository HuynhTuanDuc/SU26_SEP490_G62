import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCameraPermissions } from 'expo-camera';
import {
    AlertTriangle, CheckCircle, ChevronDown, ChevronUp,
    FileText, MapPin, Package,
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
import { useTripLifecycle }     from '@/hooks/use-trip-lifecycle';
import { useToast, useAppAlert, useConfirm } from '@/providers/ui-provider';
import type { ActiveTrip, Expense, TripStatus, TripStop } from '@/types/trip';
import { EXPENSE_TYPE_LABEL, NEXT_ACTIONS } from '@/types/trip';

import { tripService }      from '@/services/trip-service';
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

// ─── Route display ────────────────────────────────────────────────────────────

function RouteRow({ stops, pickup, delivery, isReturning }: {
    stops: TripStop[];
    pickup: string;
    delivery: string;
    isReturning?: boolean;
}) {
    // Khi có stops: hiển thị từng stop theo thứ tự
    // Khi không có stops: fallback về 2 địa chỉ tổng
    const items: { label: string; address: string; isPickup: boolean }[] =
        stops.length > 0
            ? stops.map(s => ({
                label: s.stop_type === 'pickup' ? 'ĐIỂM LẤY' : 'ĐIỂM GIAO',
                address: s.address,
                isPickup: s.stop_type === 'pickup',
            }))
            : isReturning
                ? [{ label: 'ĐIỂM TRẢ HÀNG VỀ', address: pickup, isPickup: true }]
                : [
                    { label: 'ĐIỂM LẤY', address: pickup, isPickup: true },
                    { label: 'ĐIỂM GIAO', address: delivery, isPickup: false },
                  ];

    return (
        <YStack
            borderRadius={appTheme.radius.lg} borderWidth={1}
            borderColor={appTheme.colors.border} backgroundColor={appTheme.colors.surface}
            paddingHorizontal={14} paddingVertical={12} gap={8}
        >
            {items.map((item, idx) => (
                <View key={idx}>
                    {idx > 0 ? <View style={s.routeLine} /> : null}
                    <XStack alignItems="flex-start" gap={10} marginTop={idx > 0 ? 8 : 0}>
                        <View style={[
                            s.routeDot,
                            item.isPickup
                                ? { backgroundColor: appTheme.colors.successSoft, borderColor: appTheme.colors.success }
                                : { backgroundColor: appTheme.colors.primarySoft, borderColor: appTheme.colors.primary },
                        ]}>
                            <MapPin size={11} color={item.isPickup ? appTheme.colors.success : appTheme.colors.primary} />
                        </View>
                        <YStack flex={1}>
                            <Text fontSize={10} fontWeight="700" color={appTheme.colors.textMuted}>
                                {item.label}
                            </Text>
                            <Text fontSize={13} color={appTheme.colors.text} lineHeight={18} numberOfLines={2}>
                                {item.address}
                            </Text>
                        </YStack>
                    </XStack>
                </View>
            ))}
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

function deriveStopState(stop: TripStop): 'completed' | 'active' | 'pending' {
    if (stop.completed_at) return 'completed';
    if (stop.arrived_at)   return 'active';
    return 'pending';
}

function StopCard({
    stop,
    isActionable,
    photoUri,
    onOpenCamera,
    onClearPhoto,
    onArrive,
    onComplete,
    isArriving,
    isCompleting,
}: {
    stop: TripStop;
    isActionable: boolean;
    photoUri: string | null;
    onOpenCamera: () => void;
    onClearPhoto: () => void;
    onArrive: () => void;
    onComplete: () => void;
    isArriving: boolean;
    isCompleting: boolean;
}) {
    const state = deriveStopState(stop);
    const isPickup = stop.stop_type === 'pickup';

    const dotColor =
        state === 'completed' ? appTheme.colors.success :
        state === 'active'    ? appTheme.colors.warning :
        isActionable          ? appTheme.colors.primary :
                                appTheme.colors.border;

    const borderColor =
        state === 'completed' ? appTheme.colors.successSoft :
        state === 'active'    ? appTheme.colors.warningBorder :
        isActionable          ? appTheme.colors.primaryMuted :
                                appTheme.colors.border;

    const bgColor =
        state === 'completed' ? appTheme.colors.successSoft :
        state === 'active'    ? appTheme.colors.warningSoft :
        isActionable          ? appTheme.colors.primarySoft :
                                appTheme.colors.surface;

    const statusText =
        state === 'completed' ? 'Hoàn thành' :
        state === 'active'    ? 'Đang thực hiện' :
        isActionable          ? 'Đến lượt — nhấn để tiếp tục' :
                                'Chờ điểm trước hoàn thành';

    const statusColor =
        state === 'completed' ? appTheme.colors.success :
        state === 'active'    ? appTheme.colors.warning :
        isActionable          ? appTheme.colors.primary :
                                appTheme.colors.textMuted;

    return (
        <YStack
            borderRadius={10} borderWidth={1}
            borderColor={borderColor}
            backgroundColor={bgColor}
            padding={12} gap={8}
        >
            <XStack gap={10} alignItems="flex-start">
                <YStack alignItems="center" gap={2} paddingTop={2}>
                    <View style={[s.stopDot, { backgroundColor: dotColor }]} />
                    <Text fontSize={9} fontWeight="900" color={isPickup ? appTheme.colors.success : appTheme.colors.primary}>
                        {isPickup ? 'LẤY' : 'GIAO'}
                    </Text>
                </YStack>
                <YStack flex={1} gap={2}>
                    <Text fontSize={12} fontWeight="700" color={appTheme.colors.text} numberOfLines={2}>
                        {stop.address}
                    </Text>
                    {stop.contact_name ? (
                        <Text fontSize={11} color={appTheme.colors.textMuted}>
                            {stop.contact_name}{stop.contact_phone ? ` · ${stop.contact_phone}` : ''}
                        </Text>
                    ) : null}
                    <Text fontSize={10} fontWeight="700" color={statusColor}>{statusText}</Text>
                </YStack>
            </XStack>

            {isActionable && state !== 'completed' ? (
                <YStack gap={8} paddingTop={4}
                    borderTopWidth={1} borderTopColor={appTheme.colors.border}>
                    {state === 'pending' ? (
                        <LifecycleActionButton
                            label={isArriving ? 'Đang cập nhật...' : `Đã đến điểm ${isPickup ? 'lấy' : 'giao'}`}
                            tone="secondary"
                            onPress={onArrive}
                            isLoading={isArriving}
                            icon={<MapPin size={15} color="#fff" />}
                        />
                    ) : null}
                    {state === 'active' ? (
                        <>
                            <PhotoCaptureCard
                                label={`Ảnh ${isPickup ? 'lấy hàng' : 'giao hàng'}`}
                                sublabel={`Chụp tại điểm ${isPickup ? 'lấy' : 'giao'} (bắt buộc)`}
                                uri={photoUri}
                                required
                                onCapture={onOpenCamera}
                                onDelete={onClearPhoto}
                            />
                            <LifecycleActionButton
                                label={isCompleting ? 'Đang tải ảnh...' : `Xác nhận ${isPickup ? 'lấy hàng' : 'giao hàng'}`}
                                tone="primary"
                                onPress={onComplete}
                                isLoading={isCompleting}
                                disabled={!photoUri}
                                icon={<CheckCircle size={15} color={photoUri ? '#fff' : appTheme.colors.textMuted} />}
                            />
                        </>
                    ) : null}
                </YStack>
            ) : null}
        </YStack>
    );
}

function StopsSection({
    stops,
    tripId,
    tripStatus,
    onStopUpdated,
}: {
    stops: TripStop[];
    tripId: number;
    tripStatus: TripStatus;
    onStopUpdated: () => void;
}) {
    const { showToast } = useToast();
    const [permission, requestPermission] = useCameraPermissions();
    const [photoUris,    setPhotoUris]   = useState<Record<number, string | null>>({});
    const [cameraStopId, setCameraStopId] = useState<number | null>(null);
    const [arrivals,     setArrivals]    = useState<Record<number, boolean>>({});
    const [completions,  setCompletions] = useState<Record<number, boolean>>({});

    // Optimistic overrides: applied on top of props to prevent stale-state flicker
    // between API success and parent refresh completing.
    const [optimistic, setOptimistic] = useState<Record<number, Partial<TripStop>>>({});

    if (!stops.length) return null;

    // Merge DB data with local optimistic overrides
    const effectiveStops = stops.map(s => ({ ...s, ...(optimistic[s.id] ?? {}) }));
    const done = effectiveStops.filter(s => deriveStopState(s) === 'completed').length;

    // A stop is actionable only when ALL prior stops (by index) are completed
    const isStopActionable = (stop: TripStop, allStops: TripStop[]) => {
        if (stop.completed_at) return false;
        const prior = allStops.filter(s => s.stop_index < stop.stop_index);
        if (!prior.every(s => !!s.completed_at)) return false;
        if (stop.stop_type === 'pickup')   return tripStatus === 'picking';
        if (stop.stop_type === 'delivery') return tripStatus === 'arrived';
        return false;
    };

    const openCameraForStop = async (stopId: number) => {
        if (!permission?.granted) {
            const res = await requestPermission();
            if (!res.granted) return;
        }
        setCameraStopId(stopId);
    };

    const handleArrive = async (stop: TripStop) => {
        setArrivals(prev => ({ ...prev, [stop.id]: true }));
        try {
            await tripService.arriveAtStop(tripId, stop.id);
            // Optimistically mark as arrived immediately so UI stays consistent before refresh
            setOptimistic(prev => ({
                ...prev,
                [stop.id]: { arrived_at: new Date().toISOString() },
            }));
            showToast({ type: 'success', message: `Đã đến điểm ${stop.stop_type === 'pickup' ? 'lấy' : 'giao'}`, duration: 1500 });
            onStopUpdated();
        } catch (e: unknown) {
            showToast({ type: 'error', message: e instanceof Error ? e.message : 'Lỗi', duration: 2000 });
        } finally {
            setArrivals(prev => ({ ...prev, [stop.id]: false }));
        }
    };

    const handleComplete = async (stop: TripStop) => {
        const uri = photoUris[stop.id] ?? null;
        if (!uri) return;
        setCompletions(prev => ({ ...prev, [stop.id]: true }));
        try {
            await tripService.completeStop(tripId, stop.id, uri);
            // Optimistically mark as completed immediately
            setOptimistic(prev => ({
                ...prev,
                [stop.id]: { arrived_at: stop.arrived_at ?? new Date().toISOString(), completed_at: new Date().toISOString() },
            }));
            showToast({ type: 'success', message: `Đã hoàn thành điểm ${stop.stop_type === 'pickup' ? 'lấy' : 'giao'}`, duration: 1500 });
            setPhotoUris(prev => ({ ...prev, [stop.id]: null }));
            onStopUpdated();
        } catch (e: unknown) {
            showToast({ type: 'error', message: e instanceof Error ? e.message : 'Lỗi', duration: 2000 });
        } finally {
            setCompletions(prev => ({ ...prev, [stop.id]: false }));
        }
    };

    return (
        <>
            <CollapsibleSection label="Điểm dừng" badge={`${done}/${effectiveStops.length}`} defaultOpen>
                <YStack gap={10}>
                    {effectiveStops.map((stop) => (
                        <StopCard
                            key={stop.id}
                            stop={stop}
                            isActionable={isStopActionable(stop, effectiveStops)}
                            photoUri={photoUris[stop.id] ?? null}
                            onOpenCamera={() => void openCameraForStop(stop.id)}
                            onClearPhoto={() => setPhotoUris(prev => ({ ...prev, [stop.id]: null }))}
                            onArrive={() => void handleArrive(stop)}
                            onComplete={() => void handleComplete(stop)}
                            isArriving={!!arrivals[stop.id]}
                            isCompleting={!!completions[stop.id]}
                        />
                    ))}
                </YStack>
            </CollapsibleSection>

            <CameraModal
                visible={cameraStopId !== null}
                label={
                    cameraStopId !== null && effectiveStops.find(s => s.id === cameraStopId)?.stop_type === 'pickup'
                        ? 'Chụp ảnh lấy hàng'
                        : 'Chụp ảnh giao hàng'
                }
                onCapture={(uri) => {
                    if (cameraStopId !== null) setPhotoUris(prev => ({ ...prev, [cameraStopId]: uri }));
                    setCameraStopId(null);
                }}
                onClose={() => setCameraStopId(null)}
            />
        </>
    );
}

// ─── Receipt request section (cash_collected: tất cả tài nhập km; tài cuối tạo thêm phiếu thu) ────

function ReceiptRequestSection({ trip, canRequest }: { trip: ActiveTrip; canRequest: boolean }) {
    if (!canRequest) return null;

    const needsReceiptRequest = trip.is_final_shipment && trip.order_payment_type === 'cash';
    const label = needsReceiptRequest ? 'Yêu cầu tạo phiếu thu' : 'Nhập km thực tế';

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
                    orderPaymentType: trip.order_payment_type ?? '',
                },
            })}
        >
            <FileText size={14} color={appTheme.colors.primary} />
            <Text fontSize={13} fontWeight="700" color={appTheme.colors.primary}>
                {label}
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
    const [cameraTarget, setCameraTarget] = useState<'proof' | 'loading' | 'return' | null>(null);

    const [showRelease, setShowRelease] = useState(false);
    const [showExpense, setShowExpense] = useState(false);

    // Flag để trigger navigation sau khi hoàn thành chuyến (qua useEffect để đảm bảo render cycle)
    const [justCompleted, setJustCompleted] = useState(false);

    const { isUploading: completingProof, completeWithProof } = useCompletionProof(() => {
        setJustCompleted(true);
    });

    useEffect(() => {
        if (!justCompleted) return;
        setJustCompleted(false);
        // Mọi tài đều nhập km sau khi hoàn thành — tài cuối của đơn cash còn tạo yêu cầu phiếu thu
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
                orderPaymentType: trip.order_payment_type ?? '',
            },
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [justCompleted]);
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

    // Handlers cho multi-stop flow: gọi transit/complete không cần ảnh (proof đã capture per-stop)
    const [transitingViaStops, setTransitingViaStops]     = useState(false);
    const [completingViaStops, setCompletingViaStops]     = useState(false);

    const handleStartTransitViaStops = async () => {
        setTransitingViaStops(true);
        try {
            await tripService.submitLoadingProof(trip.id, new FormData());
            showToast({ type: 'success', message: 'Đã lấy hàng – bắt đầu vận chuyển', duration: 2500 });
            refresh();
        } catch (e: unknown) {
            showToast({ type: 'error', message: e instanceof Error ? e.message : 'Lỗi', duration: 2000 });
        } finally {
            setTransitingViaStops(false);
        }
    };

    const handleCompleteTripViaStops = async () => {
        setCompletingViaStops(true);
        try {
            await tripService.completeWithProof(trip.id, new FormData());
            setJustCompleted(true);
        } catch (e: unknown) {
            showToast({ type: 'error', message: e instanceof Error ? e.message : 'Lỗi', duration: 2000 });
        } finally {
            setCompletingViaStops(false);
        }
    };

    const isWorking     = lifecycleLoading || completingProof || submittingLoad || completingReturn || releaseLoading || transitingViaStops || completingViaStops;
    const nextAction    = NEXT_ACTIONS[trip.status as TripStatus];
    const accent        = STATUS_ACCENT[trip.status as TripStatus];
    const banner        = STATUS_BANNER[trip.status as TripStatus];
    const isPicking     = trip.status === 'picking';
    const isArrived     = trip.status === 'arrived';
    const isReturning   = trip.status === 'returning';
    const isReleasable  = trip.status === 'claimed' || trip.status === 'picking';
    const canAddExpense   = EXPENSE_ALLOWED_STATUSES.includes(trip.status as TripStatus);

    // Multi-stop awareness
    const stops              = trip.stops ?? [];
    const pickupStops        = stops.filter(s => s.stop_type === 'pickup');
    const deliveryStops      = stops.filter(s => s.stop_type === 'delivery');
    const allPickupsDone     = pickupStops.length === 0 || pickupStops.every(s => !!s.completed_at);
    const allDeliveriesDone  = deliveryStops.length === 0 || deliveryStops.every(s => !!s.completed_at);

    // Khi có stops: proof đã chụp per-stop → chỉ cần button xác nhận, không chụp lại
    // Khi không có stops: giữ flow chụp ảnh truyền thống
    const showLoadingProof   = isPicking  && allPickupsDone  && pickupStops.length === 0;
    const showDeliveryProof  = isArrived  && allDeliveriesDone && deliveryStops.length === 0;
    const showStartTransitBtn  = isPicking  && allPickupsDone  && pickupStops.length > 0;
    const showCompleteTripBtn  = isArrived  && allDeliveriesDone && deliveryStops.length > 0;

    // Mọi tài đều thấy nút này sau khi COMPLETED để nhập km (tài cuối cash còn tạo phiếu thu)
    const canRequestReceipt = trip.status === 'completed';

    const openCamera = async (target: 'proof' | 'loading' | 'return') => {
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
                    stops={stops}
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

                {/* ── Stops (collapsible) – mỗi stop có action riêng ── */}
                <StopsSection
                    stops={stops}
                    tripId={trip.id}
                    tripStatus={trip.status as TripStatus}
                    onStopUpdated={refresh}
                />

                {/* ── Expenses (collapsible) ── */}
                <CollapsibleSection label="Chi phí phát sinh" badge={expenseBadge}>
                    <ExpenseInlineList
                        expenses={expenses}
                        canAdd={canAddExpense}
                        onAdd={() => setShowExpense(true)}
                    />
                </CollapsibleSection>

                {/* ── Loading proof (PICKING, sau khi tất cả pickup stops xong) ── */}
                {showLoadingProof ? (
                    <YStack borderRadius={appTheme.radius.lg} borderWidth={1}
                        borderColor={appTheme.colors.successSoft}
                        backgroundColor={appTheme.colors.surface}
                        padding={14} gap={10}
                    >
                        <Text fontSize={12} fontWeight="900" color={appTheme.colors.textMuted}>
                            {pickupStops.length > 0
                                ? `ĐÃ LẤY HÀNG TẠI ${pickupStops.length} ĐIỂM — XÁC NHẬN BẮT ĐẦU VẬN CHUYỂN`
                                : 'ẢNH XÁC NHẬN LẤY HÀNG (BẮT BUỘC)'}
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

                {/* ── Bắt đầu vận chuyển (PICKING + có pickup stops đã xong — không cần chụp lại) ── */}
                {showStartTransitBtn ? (
                    <YStack borderRadius={appTheme.radius.lg} borderWidth={1}
                        borderColor={appTheme.colors.successSoft}
                        backgroundColor={appTheme.colors.surface}
                        padding={14} gap={10}
                    >
                        <Text fontSize={12} fontWeight="900" color={appTheme.colors.textMuted}>
                            {`ĐÃ LẤY HÀNG TẠI ${pickupStops.length} ĐIỂM — SẴN SÀNG VẬN CHUYỂN`}
                        </Text>
                        <LifecycleActionButton
                            label={transitingViaStops ? 'Đang xử lý...' : 'Bắt đầu vận chuyển'}
                            tone="primary"
                            onPress={() => void handleStartTransitViaStops()}
                            isLoading={transitingViaStops}
                        />
                    </YStack>
                ) : null}

                {/* ── Delivery proof (ARRIVED, sau khi tất cả delivery stops xong) ── */}
                {showDeliveryProof ? (
                    <YStack borderRadius={appTheme.radius.lg} borderWidth={1}
                        borderColor={appTheme.colors.successSoft}
                        backgroundColor={appTheme.colors.surface}
                        padding={14} gap={10}
                    >
                        <Text fontSize={12} fontWeight="900" color={appTheme.colors.textMuted}>
                            {deliveryStops.length > 0
                                ? `ĐÃ GIAO HÀNG TẠI ${deliveryStops.length} ĐIỂM — XÁC NHẬN HOÀN THÀNH CHUYẾN`
                                : 'ẢNH XÁC NHẬN GIAO HÀNG (BẮT BUỘC)'}
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

                {/* ── Hoàn thành chuyến (ARRIVED + có delivery stops đã xong — không cần chụp lại) ── */}
                {showCompleteTripBtn ? (
                    <YStack borderRadius={appTheme.radius.lg} borderWidth={1}
                        borderColor={appTheme.colors.successSoft}
                        backgroundColor={appTheme.colors.surface}
                        padding={14} gap={10}
                    >
                        <Text fontSize={12} fontWeight="900" color={appTheme.colors.textMuted}>
                            {`ĐÃ GIAO HÀNG TẠI ${deliveryStops.length} ĐIỂM — XÁC NHẬN HOÀN THÀNH CHUYẾN`}
                        </Text>
                        <LifecycleActionButton
                            label={completingViaStops ? 'Đang xử lý...' : 'Hoàn thành chuyến'}
                            tone="primary"
                            onPress={() => void handleCompleteTripViaStops()}
                            isLoading={completingViaStops}
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
                    cameraTarget === 'loading' ? 'Chụp ảnh lấy hàng' :
                    cameraTarget === 'proof'   ? 'Chụp ảnh xác nhận giao hàng' :
                                                 'Chụp ảnh hoàn hàng (tuỳ chọn)'
                }
                onCapture={(uri) => {
                    if      (cameraTarget === 'loading') setLoadingUri(uri);
                    else if (cameraTarget === 'proof')   setProofUri(uri);
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
});
