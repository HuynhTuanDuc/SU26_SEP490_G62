import { Pressable, View } from 'react-native';
import { Layers, MapPin, Weight } from 'lucide-react-native';
import { Text, XStack, YStack } from 'tamagui';

import { appTheme } from '@/theme/app-theme';
import type { TripPoolItem } from '@/types/trip';
import { money } from '@/lib/format-number';

type Props = {
    trip: TripPoolItem;
    onPress?: () => void;
    onClaim?: () => void;
    isClaimLoading?: boolean;
    claimDisabled?: boolean;
};

function formatWeight(kg: string | null): string {
    if (!kg) return '—';
    const n = parseFloat(kg);
    return n >= 1000 ? `${(n / 1000).toFixed(1)} tấn` : `${n} kg`;
}

function formatPrice(price: string | null): string {
    return money(price ?? 0);
}

export function TripCard({ trip, onPress, onClaim, isClaimLoading, claimDisabled }: Props) {
    return (
        <Pressable onPress={onPress} style={{ borderRadius: appTheme.radius.lg }}>
            <YStack
                borderRadius={appTheme.radius.lg}
                borderWidth={1}
                borderColor={appTheme.colors.border}
                backgroundColor={appTheme.colors.surface}
                overflow="hidden"
            >
                {/* Header */}
                <XStack
                    paddingHorizontal={16}
                    paddingVertical={12}
                    backgroundColor={appTheme.colors.surfaceSoft}
                    alignItems="center"
                    justifyContent="space-between"
                >
                    <YStack gap={2}>
                        <XStack alignItems="center" gap={6}>
                            <Text fontSize={11} color={appTheme.colors.textMuted} fontWeight="700">
                                ĐƠN #{trip.order_id}
                            </Text>
                            {/* Chuyến thứ mấy / tổng */}
                            <XStack
                                paddingHorizontal={7} paddingVertical={2}
                                borderRadius={6}
                                backgroundColor={appTheme.colors.primarySoft}
                                gap={3} alignItems="center"
                            >
                                <Layers size={10} color={appTheme.colors.primary} />
                                <Text fontSize={10} fontWeight="900" color={appTheme.colors.primary}>
                                    {trip.shipment_index}/{trip.total_order_legs}
                                </Text>
                            </XStack>
                        </XStack>
                        <Text fontSize={13} fontWeight="900" color={appTheme.colors.text}>
                            {trip.cargo_name ?? 'Hàng hóa'}
                        </Text>
                    </YStack>
                </XStack>

                {/* Body */}
                <YStack padding={16} gap={10}>
                    {/* Pickup */}
                    <XStack gap={10} alignItems="flex-start">
                        <XStack
                            width={28} height={28} borderRadius={10}
                            backgroundColor={appTheme.colors.successSoft}
                            alignItems="center" justifyContent="center" marginTop={1}
                        >
                            <MapPin size={14} color={appTheme.colors.success} />
                        </XStack>
                        <YStack flex={1} gap={1}>
                            <Text fontSize={11} color={appTheme.colors.textMuted} fontWeight="700">
                                ĐIỂM LẤY HÀNG
                            </Text>
                            <Text fontSize={13} color={appTheme.colors.text} lineHeight={18}>
                                {trip.pickup_address}
                            </Text>
                        </YStack>
                    </XStack>

                    {/* Delivery */}
                    <XStack gap={10} alignItems="flex-start">
                        <XStack
                            width={28} height={28} borderRadius={10}
                            backgroundColor={appTheme.colors.primarySoft}
                            alignItems="center" justifyContent="center" marginTop={1}
                        >
                            <MapPin size={14} color={appTheme.colors.primary} />
                        </XStack>
                        <YStack flex={1} gap={1}>
                            <Text fontSize={11} color={appTheme.colors.textMuted} fontWeight="700">
                                ĐIỂM GIAO HÀNG
                            </Text>
                            <Text fontSize={13} color={appTheme.colors.text} lineHeight={18}>
                                {trip.delivery_address}
                            </Text>
                        </YStack>
                    </XStack>

                    {/* Meta */}
                    <XStack gap={12} paddingTop={4} flexWrap="wrap">
                        <XStack alignItems="center" gap={5}>
                            <Weight size={13} color={appTheme.colors.textMuted} />
                            <Text fontSize={12} color={appTheme.colors.textMuted}>
                                {formatWeight(trip.cargo_weight_kg)}
                            </Text>
                        </XStack>
                        <Text fontSize={12} color={appTheme.colors.textMuted}>
                            {trip.vehicle_group_name}
                        </Text>
                        {trip.estimated_price ? (
                            <Text fontSize={12} fontWeight="800" color={appTheme.colors.primary}>
                                {formatPrice(trip.estimated_price)}
                            </Text>
                        ) : null}
                    </XStack>
                </YStack>

                {/* Claim button */}
                {onClaim ? (
                    <Pressable
                        onPress={!claimDisabled && !isClaimLoading ? onClaim : undefined}
                        style={({ pressed }) => ({
                            margin: 12,
                            marginTop: 0,
                            height: 46,
                            borderRadius: appTheme.radius.md,
                            backgroundColor: claimDisabled
                                ? appTheme.colors.border
                                : pressed
                                    ? appTheme.colors.primaryDark
                                    : appTheme.colors.primary,
                            alignItems: 'center',
                            justifyContent: 'center',
                        })}
                    >
                        <Text
                            fontSize={14}
                            fontWeight="900"
                            color={claimDisabled ? appTheme.colors.textMuted : appTheme.colors.surface}
                        >
                            {isClaimLoading ? 'Đang nhận...' : claimDisabled ? 'Đang có đơn hàng' : 'Nhận đơn hàng'}
                        </Text>
                    </Pressable>
                ) : null}
            </YStack>
        </Pressable>
    );
}
