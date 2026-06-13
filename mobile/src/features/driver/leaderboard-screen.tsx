import { useEffect, useState } from 'react';
import {
    ActivityIndicator, Pressable, RefreshControl,
    ScrollView, StyleSheet, View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
    AlertTriangle, ChevronLeft, ChevronRight,
    Medal, TrendingUp, Truck,
} from 'lucide-react-native';
import { Text, XStack, YStack } from 'tamagui';

import { AppText }    from '@/components/app-text';
import { ScreenHeader } from '@/components/screen-header';
import { appTheme }   from '@/theme/app-theme';
import { useLeaderboard } from '@/hooks/use-leaderboard';
import type { LeaderboardRow } from '@/services/kpi-service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
    '', 'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4',
    'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8',
    'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
];

const fmtRevenue = (val: string | number) => {
    const n = Number(val);
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M ₫`;
    if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K ₫`;
    return `${n} ₫`;
};

const rankColor = (rank: number) =>
    rank === 1 ? '#F59E0B'
    : rank === 2 ? '#94A3B8'
    : rank === 3 ? '#CD7C3F'
    : appTheme.colors.textMuted;

// ─── Rank medal icon ──────────────────────────────────────────────────────────

function RankBadge({ rank }: { rank: number }) {
    if (rank <= 3) {
        return (
            <XStack
                width={32} height={32} borderRadius={16}
                backgroundColor={rankColor(rank) + '22'}
                alignItems="center" justifyContent="center"
            >
                <Medal size={16} color={rankColor(rank)} />
            </XStack>
        );
    }
    return (
        <XStack
            width={32} height={32} borderRadius={16}
            backgroundColor={appTheme.colors.surfaceSoft}
            alignItems="center" justifyContent="center"
        >
            <Text fontSize={13} fontWeight="900" color={appTheme.colors.textMuted}>
                {rank}
            </Text>
        </XStack>
    );
}

// ─── Leaderboard row ──────────────────────────────────────────────────────────

type SortMode = 'revenue' | 'trips';

function DriverRow({ row, sortMode, position }: {
    row: LeaderboardRow;
    sortMode: SortMode;
    position: number;
}) {
    const rank = sortMode === 'revenue' ? row.revenue_rank : row.trips_rank;

    return (
        <XStack
            padding={14}
            backgroundColor={row.is_me ? appTheme.colors.primarySoft : appTheme.colors.surface}
            borderRadius={appTheme.radius.lg}
            borderWidth={row.is_me ? 1.5 : 1}
            borderColor={row.is_me ? appTheme.colors.primaryMuted : appTheme.colors.border}
            alignItems="center" gap={12}
        >
            <RankBadge rank={rank} />

            <YStack flex={1} gap={3}>
                <XStack alignItems="center" gap={6}>
                    <Text
                        fontSize={14}
                        fontWeight={row.is_me ? '900' : '700'}
                        color={row.is_me ? appTheme.colors.primary : appTheme.colors.text}
                        numberOfLines={1}
                        flex={1}
                    >
                        {row.driver_name}
                        {row.is_me ? '  (Tôi)' : ''}
                    </Text>
                </XStack>
                <XStack gap={12}>
                    <Text fontSize={11} color={appTheme.colors.textMuted}>
                        {row.completed_shipments} chuyến
                    </Text>
                    {row.incident_count > 0 ? (
                        <Text fontSize={11} color={appTheme.colors.danger}>
                            {row.incident_count} sự cố
                        </Text>
                    ) : null}
                </XStack>
            </YStack>

            <YStack alignItems="flex-end" gap={2}>
                <Text fontSize={13} fontWeight="900" color={appTheme.colors.text}>
                    {sortMode === 'revenue'
                        ? fmtRevenue(row.total_revenue)
                        : `${row.completed_shipments} chuyến`}
                </Text>
                <Text fontSize={10} color={appTheme.colors.textMuted}>
                    {sortMode === 'revenue' ? 'doanh thu' : 'hoàn thành'}
                </Text>
            </YStack>
        </XStack>
    );
}

// ─── Month navigator (reusable) ───────────────────────────────────────────────

function MonthNav({
    month, year, onPrev, onNext,
}: {
    month: number; year: number; onPrev: () => void; onNext: () => void;
}) {
    const now = new Date();
    const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();
    return (
        <XStack alignItems="center" justifyContent="space-between">
            <Pressable onPress={onPrev} hitSlop={12} style={s.navBtn}>
                <ChevronLeft size={18} color={appTheme.colors.primary} />
            </Pressable>
            <Text fontSize={16} fontWeight="900" color={appTheme.colors.text}>
                {MONTH_NAMES[month]} / {year}
            </Text>
            <Pressable
                onPress={onNext} hitSlop={12}
                style={[s.navBtn, isCurrentMonth && { opacity: 0.3 }]}
                disabled={isCurrentMonth}
            >
                <ChevronRight size={18} color={appTheme.colors.primary} />
            </Pressable>
        </XStack>
    );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function LeaderboardScreen() {
    const params = useLocalSearchParams<{ month?: string; year?: string }>();
    const now = new Date();

    const [month, setMonth] = useState(params.month ? Number(params.month) : now.getMonth() + 1);
    const [year,  setYear]  = useState(params.year  ? Number(params.year)  : now.getFullYear());
    const [sortMode, setSortMode] = useState<SortMode>('revenue');

    const { data, isLoading, error, reload } = useLeaderboard(month, year);

    useEffect(() => { reload(); }, [reload]);

    const goToPrev = () => {
        if (month === 1) { setMonth(12); setYear((y) => y - 1); }
        else setMonth((m) => m - 1);
    };
    const goToNext = () => {
        if (year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1)) return;
        if (month === 12) { setMonth(1); setYear((y) => y + 1); }
        else setMonth((m) => m + 1);
    };

    const sorted = data?.leaderboard
        ? [...data.leaderboard].sort((a, b) =>
            sortMode === 'revenue'
                ? a.revenue_rank - b.revenue_rank
                : a.trips_rank - b.trips_rank,
        )
        : [];

    const myRow = data?.leaderboard.find((r) => r.is_me);

    return (
        <View style={{ flex: 1, backgroundColor: appTheme.colors.background }}>
            <StatusBar style="dark" />
            <ScreenHeader title="Bảng xếp hạng" showBack />

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{
                    paddingHorizontal: appTheme.spacing.screenX,
                    paddingTop: 16,
                    paddingBottom: appTheme.spacing.screenBottom + 20,
                    gap: 14,
                }}
                refreshControl={
                    <RefreshControl refreshing={isLoading} onRefresh={reload} tintColor={appTheme.colors.primary} />
                }
                showsVerticalScrollIndicator={false}
            >
                {/* Vehicle group header */}
                {data ? (
                    <XStack
                        padding={12} borderRadius={appTheme.radius.md}
                        backgroundColor={appTheme.colors.primarySoft}
                        borderWidth={1} borderColor={appTheme.colors.primaryMuted}
                        alignItems="center" gap={8}
                    >
                        <Truck size={15} color={appTheme.colors.primary} />
                        <Text fontSize={13} fontWeight="700" color={appTheme.colors.primary}>
                            Nhóm xe: {data.vehicle_group_name}
                        </Text>
                    </XStack>
                ) : null}

                {/* Month nav */}
                <MonthNav month={month} year={year} onPrev={goToPrev} onNext={goToNext} />

                {/* Sort toggle */}
                <XStack gap={8}>
                    <Pressable
                        style={[s.sortBtn, sortMode === 'revenue' && s.sortBtnActive]}
                        onPress={() => setSortMode('revenue')}
                    >
                        <TrendingUp size={13} color={sortMode === 'revenue' ? appTheme.colors.primary : appTheme.colors.textMuted} />
                        <Text
                            fontSize={12} fontWeight="700"
                            color={sortMode === 'revenue' ? appTheme.colors.primary : appTheme.colors.textMuted}
                        >
                            Doanh thu
                        </Text>
                    </Pressable>
                    <Pressable
                        style={[s.sortBtn, sortMode === 'trips' && s.sortBtnActive]}
                        onPress={() => setSortMode('trips')}
                    >
                        <Truck size={13} color={sortMode === 'trips' ? appTheme.colors.primary : appTheme.colors.textMuted} />
                        <Text
                            fontSize={12} fontWeight="700"
                            color={sortMode === 'trips' ? appTheme.colors.primary : appTheme.colors.textMuted}
                        >
                            Số chuyến
                        </Text>
                    </Pressable>
                </XStack>

                {/* My rank summary (always visible) */}
                {myRow && !isLoading ? (
                    <XStack
                        padding={12} borderRadius={appTheme.radius.md}
                        backgroundColor={appTheme.colors.surface}
                        borderWidth={1} borderColor={appTheme.colors.border}
                        alignItems="center" gap={12}
                    >
                        <Text fontSize={12} color={appTheme.colors.textMuted}>Xếp hạng của tôi:</Text>
                        <Text fontSize={14} fontWeight="900" color={appTheme.colors.primary}>
                            #{sortMode === 'revenue' ? myRow.revenue_rank : myRow.trips_rank}
                        </Text>
                        <Text fontSize={12} color={appTheme.colors.textMuted}>
                            / {data?.total_in_group ?? 0} tài xế trong nhóm
                        </Text>
                    </XStack>
                ) : null}

                {/* Error */}
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

                {/* Loading */}
                {isLoading ? (
                    <YStack alignItems="center" paddingVertical={40} gap={12}>
                        <ActivityIndicator color={appTheme.colors.primary} />
                        <AppText variant="caption" tone="muted">Đang tải bảng xếp hạng...</AppText>
                    </YStack>
                ) : null}

                {/* Empty */}
                {!isLoading && !error && sorted.length === 0 ? (
                    <YStack
                        padding={32} borderRadius={appTheme.radius.lg}
                        backgroundColor={appTheme.colors.surface}
                        borderWidth={1} borderColor={appTheme.colors.border}
                        alignItems="center" gap={12}
                    >
                        <AppText variant="bodyStrong" tone="muted">Chưa có dữ liệu</AppText>
                        <AppText variant="caption" tone="muted">
                            Bảng xếp hạng {MONTH_NAMES[month]}/{year} chưa được cập nhật.
                        </AppText>
                    </YStack>
                ) : null}

                {/* Leaderboard list */}
                {!isLoading && sorted.length > 0 ? (
                    <YStack gap={8}>
                        {sorted.map((row, i) => (
                            <DriverRow
                                key={row.driver_id}
                                row={row}
                                sortMode={sortMode}
                                position={i + 1}
                            />
                        ))}
                        {sorted.length === 20 ? (
                            <Text fontSize={11} color={appTheme.colors.textMuted} textAlign="center" marginTop={4}>
                                Hiển thị top 20
                            </Text>
                        ) : null}
                    </YStack>
                ) : null}
            </ScrollView>
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
    navBtn: {
        width: 34, height: 34, borderRadius: 10,
        backgroundColor: appTheme.colors.primarySoft,
        alignItems: 'center', justifyContent: 'center',
    },
    sortBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center',
        justifyContent: 'center', gap: 6,
        paddingVertical: 10, borderRadius: appTheme.radius.md,
        backgroundColor: appTheme.colors.surfaceSoft,
        borderWidth: 1.5, borderColor: appTheme.colors.border,
    },
    sortBtnActive: {
        backgroundColor: appTheme.colors.primarySoft,
        borderColor: appTheme.colors.primaryMuted,
    },
});
