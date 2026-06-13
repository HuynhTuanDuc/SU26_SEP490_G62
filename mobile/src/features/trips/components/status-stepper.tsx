import { View } from 'react-native';
import {
    CheckCircle, MapPin, Navigation,
    Package, RotateCcw,
    Truck, X, XCircle,
} from 'lucide-react-native';
import { Text, XStack, YStack } from 'tamagui';

import { appTheme } from '@/theme/app-theme';
import type { TripStatus } from '@/types/trip';

// ─── Flow definitions ─────────────────────────────────────────────────────────

const MAIN_FLOW: TripStatus[]      = ['claimed', 'picking', 'transit', 'arrived', 'completed'];
const RETURN_FLOW: TripStatus[]    = ['failed', 'returning', 'completed'];
const CANCELLED_FLOW: TripStatus[] = ['claimed', 'picking', 'transit', 'arrived', 'cancelled'];

// ─── Exported accent + banner (used in active-trip-screen) ───────────────────

export const STATUS_ACCENT: Partial<Record<TripStatus, { bg: string; text: string; border: string }>> = {
    claimed:   { bg: appTheme.colors.primarySoft,  text: appTheme.colors.primary,     border: appTheme.colors.primaryMuted },
    picking:   { bg: appTheme.colors.warningSoft,  text: appTheme.colors.warningText, border: appTheme.colors.warningBorder },
    transit:   { bg: appTheme.colors.primarySoft,  text: appTheme.colors.primary,     border: appTheme.colors.primaryMuted },
    arrived:   { bg: appTheme.colors.successSoft,  text: appTheme.colors.success,     border: '#a7f3d0' },
    completed: { bg: appTheme.colors.successSoft,  text: appTheme.colors.success,     border: '#a7f3d0' },
    failed:    { bg: '#fee2e2',                    text: appTheme.colors.danger,      border: '#fca5a5' },
    returning: { bg: appTheme.colors.surfaceSoft,  text: appTheme.colors.textMuted,   border: appTheme.colors.border },
    cancelled: { bg: '#f3f4f6',                    text: appTheme.colors.textMuted,   border: appTheme.colors.border },
};

export const STATUS_BANNER: Partial<Record<TripStatus, { icon: React.ReactNode; text: string }>> = {
    claimed:   { icon: <Package    size={14} color={appTheme.colors.primary} />,     text: 'Di chuyển đến điểm lấy hàng' },
    picking:   { icon: <Truck      size={14} color={appTheme.colors.warningText} />, text: 'Chụp ảnh lấy hàng để xác nhận và bắt đầu vận chuyển' },
    transit:   { icon: <Navigation size={14} color={appTheme.colors.primary} />,     text: 'Đang vận chuyển đến điểm giao' },
    arrived:   { icon: <MapPin      size={14} color={appTheme.colors.success} />,     text: 'Đã đến — chụp ảnh biên lai rồi hoàn thành' },
    failed:    { icon: <XCircle     size={14} color={appTheme.colors.danger} />,      text: 'Giao hàng thất bại — bắt đầu hoàn hàng về' },
    returning: { icon: <RotateCcw   size={14} color={appTheme.colors.textMuted} />,   text: 'Đang hoàn hàng về điểm lấy hàng ban đầu' },
};

// ─── Icon per status ──────────────────────────────────────────────────────────

function StepIcon({ status, size, color }: { status: TripStatus; size: number; color: string }) {
    const props = { size, color };
    switch (status) {
        case 'claimed':   return <Package    {...props} />;
        case 'picking':   return <Truck      {...props} />;
        case 'transit':   return <Navigation {...props} />;
        case 'arrived':   return <MapPin     {...props} />;
        case 'completed': return <CheckCircle {...props} />;
        case 'failed':    return <XCircle    {...props} />;
        case 'returning': return <RotateCcw  {...props} />;
        case 'cancelled': return <X          {...props} />;
        default:          return null;
    }
}

// ─── Label per status ─────────────────────────────────────────────────────────

const STEP_LABEL: Partial<Record<TripStatus, string>> = {
    claimed:   'Đã nhận',
    picking:   'Lấy hàng',
    transit:   'Vận chuyển',
    arrived:   'Đã đến',
    completed: 'Hoàn thành',
    failed:    'Thất bại',
    returning: 'Hoàn hàng',
    cancelled: 'Đã hủy',
};

// ─── Component ────────────────────────────────────────────────────────────────

type Props = { status: TripStatus };

export function StatusStepper({ status }: Props) {
    const isCancelled = status === 'cancelled';
    const isReturn    = status === 'failed' || status === 'returning';
    const flow        = isCancelled ? CANCELLED_FLOW : isReturn ? RETURN_FLOW : MAIN_FLOW;
    const curIdx      = flow.indexOf(status);

    return (
        <XStack alignItems="center">
            {flow.map((s, i) => {
                const isPast    = i < curIdx;
                const isCurrent = i === curIdx;
                const isFuture  = i > curIdx;
                const isLast    = i === flow.length - 1;

                const accentColor = STATUS_ACCENT[s]?.text ?? appTheme.colors.primary;

                // Dot visual state
                const dotSize   = isCurrent ? 30 : 22;
                const iconSize  = isCurrent ? 14 : 10;
                const dotBg     = isPast
                    ? appTheme.colors.success
                    : isCurrent
                        ? accentColor
                        : appTheme.colors.surfaceSoft;
                const dotBorder = isPast
                    ? appTheme.colors.success
                    : isCurrent
                        ? accentColor
                        : appTheme.colors.border;
                const iconColor = isPast || isCurrent ? '#fff' : appTheme.colors.border;
                const lineColor = isPast ? appTheme.colors.success : appTheme.colors.border;
                const labelColor = isPast
                    ? appTheme.colors.success
                    : isCurrent
                        ? accentColor
                        : appTheme.colors.border;

                return (
                    <XStack key={s} flex={isLast ? 0 : 1} alignItems="center">
                        <YStack alignItems="center" gap={5}>
                            {/* Dot */}
                            <View style={{
                                width: dotSize, height: dotSize,
                                borderRadius: isCurrent ? 10 : 8,
                                backgroundColor: dotBg,
                                borderWidth: isCurrent ? 0 : 1.5,
                                borderColor: dotBorder,
                                alignItems: 'center',
                                justifyContent: 'center',
                                shadowColor: isCurrent ? accentColor : 'transparent',
                                shadowOpacity: isCurrent ? 0.35 : 0,
                                shadowRadius: 6,
                                elevation: isCurrent ? 4 : 0,
                            }}>
                                {/* Past: always checkmark. Current/future: status icon */}
                                {isPast
                                    ? <CheckCircle size={12} color="#fff" />
                                    : <StepIcon status={s} size={iconSize} color={iconColor} />}
                            </View>

                            {/* Label */}
                            <Text
                                fontSize={9}
                                fontWeight={isCurrent ? '900' : '600'}
                                color={labelColor}
                                style={{ width: 52, textAlign: 'center' }}
                                numberOfLines={1}
                            >
                                {STEP_LABEL[s]}
                            </Text>
                        </YStack>

                        {/* Connector line */}
                        {!isLast ? (
                            <View style={{
                                flex: 1, height: 2,
                                marginBottom: 18,
                                backgroundColor: lineColor,
                            }} />
                        ) : null}
                    </XStack>
                );
            })}
        </XStack>
    );
}
