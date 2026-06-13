import { Text, XStack } from 'tamagui';
import type { TripStatus } from '@/types/trip';
import { TRIP_STATUS_LABEL } from '@/types/trip';
import { appTheme } from '@/theme/app-theme';

type StatusConfig = {
    bg: string;
    text: string;
    dot: string;
};

const c = appTheme.colors;

const STATUS_CONFIG: Record<TripStatus, StatusConfig> = {
    available:  { bg: c.successSoft,          text: c.successText,        dot: c.success },
    claimed:    { bg: c.primarySoft,          text: c.primary,            dot: c.primary },
    picking:    { bg: c.statusPickingSoft,    text: c.statusPickingText,  dot: c.statusPicking },
    transit:    { bg: c.statusTransitSoft,    text: c.statusTransitText,  dot: c.statusTransit },
    arrived:    { bg: c.successSoft,          text: c.successText,        dot: c.success },
    completed:  { bg: c.successSoft,          text: c.successText,        dot: c.success },
    cancelled:  { bg: c.dangerSoft,           text: c.dangerText,         dot: c.danger },
    failed:     { bg: c.dangerSoft,           text: c.dangerText,         dot: c.danger },
    returning:  { bg: c.statusReturningSoft,  text: c.statusReturningText,dot: c.statusReturning },
};

type Props = {
    status: TripStatus;
};

export function TripStatusBadge({ status }: Props) {
    const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.available;

    return (
        <XStack
            alignItems="center"
            gap={6}
            paddingHorizontal={10}
            paddingVertical={4}
            borderRadius={appTheme.radius.pill}
            backgroundColor={cfg.bg}
        >
            <XStack
                width={6}
                height={6}
                borderRadius={3}
                backgroundColor={cfg.dot}
            />
            <Text
                fontSize={11}
                fontWeight="800"
                color={cfg.text}
                lineHeight={16}
            >
                {TRIP_STATUS_LABEL[status]}
            </Text>
        </XStack>
    );
}
