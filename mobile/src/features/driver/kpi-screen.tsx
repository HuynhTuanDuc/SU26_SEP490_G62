import { useEffect, useState } from 'react';
import {
    Pressable, RefreshControl,
    ScrollView, StyleSheet, View,
} from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
    AlertTriangle, Award, ChevronLeft, ChevronRight,
    Clock, Star, TrendingUp, Trophy, Truck,
} from 'lucide-react-native';
import { Text, XStack, YStack } from 'tamagui';

import { AppText }     from '@/components/app-text';
import { ScreenHeader } from '@/components/screen-header';
import { KpiSkeleton } from '@/components/skeleton';
import { appTheme }    from '@/theme/app-theme';
import { useKpi }      from '@/hooks/use-kpi';
import type { KpiRecord } from '@/services/kpi-service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
    '', 'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4',
    'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8',
    'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
];

const fmtMoney = (val: string | number) => {
    const n = Number(val);
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M₫`;
    if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K₫`;
    return `${n}₫`;
};

// ─── Month navigator ──────────────────────────────────────────────────────────

function MonthNav({
    month, year, onPrev, onNext,
}: {
    month: number; year: number; onPrev: () => void; onNext: () => void;
}) {
    const now = new Date();
    const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();

    return (
        <XStack
            alignItems="center" justifyContent="space-between"
            padding={16}
            backgroundColor={appTheme.colors.surface}
            borderRadius={appTheme.radius.lg}
            borderWidth={1} borderColor={appTheme.colors.border}
        >
            <Pressable onPress={onPrev} hitSlop={12} style={s.navBtn}>
                <ChevronLeft size={20} color={appTheme.colors.primary} />
            </Pressable>

            <YStack alignItems="center" gap={2}>
                <Text fontSize={18} fontWeight="900" color={appTheme.colors.text}>
                    {MONTH_NAMES[month]} / {year}
                </Text>
                {isCurrentMonth ? (
                    <View style={s.currentBadge}>
                        <Text fontSize={10} fontWeight="700" color={appTheme.colors.primary}>
                            Tháng hiện tại
                        </Text>
                    </View>
                ) : null}
            </YStack>

            <Pressable
                onPress={onNext} hitSlop={12}
                style={[s.navBtn, isCurrentMonth && { opacity: 0.3 }]}
                disabled={isCurrentMonth}
            >
                <ChevronRight size={20} color={appTheme.colors.primary} />
            </Pressable>
        </XStack>
    );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
    icon, label, value, sub, color,
}: {
    icon: React.ReactNode; label: string; value: string; sub?: string; color: string;
}) {
    return (
        <YStack
            flex={1} padding={16} gap={10}
            backgroundColor={appTheme.colors.surface}
            borderRadius={appTheme.radius.lg}
            borderWidth={1} borderColor={appTheme.colors.border}
        >
            <XStack
                width={36} height={36} borderRadius={10}
                backgroundColor={color + '22'}
                alignItems="center" justifyContent="center"
            >
                {icon}
            </XStack>
            <YStack gap={2}>
                <Text fontSize={22} fontWeight="900" color={appTheme.colors.text}>{value}</Text>
                <Text fontSize={12} fontWeight="700" color={appTheme.colors.textMuted}>{label}</Text>
                {sub ? <Text fontSize={11} color={appTheme.colors.textMuted}>{sub}</Text> : null}
            </YStack>
        </YStack>
    );
}

// ─── Rule 5: Thưởng vượt KPI ─────────────────────────────────────────────────
// threshold & reward đến từ bonus_rules trong DB — không hardcode ở đây

function KpiBonusCard({ record }: { record: KpiRecord }) {
    const threshold = record.kpi_bonus_threshold ? Number(record.kpi_bonus_threshold) : null;
    const reward    = record.kpi_bonus_reward    ? Number(record.kpi_bonus_reward)    : null;

    if (!threshold || !reward) return null;

    const revenue  = Number(record.total_revenue);
    const achieved = record.kpi_bonus_achieved;
    const pct      = Math.min(revenue / threshold * 100, 100);
    const remain   = Math.max(threshold - revenue, 0);
    const color    = achieved ? appTheme.colors.success : appTheme.colors.primary;

    return (
        <YStack
            padding={16}
            backgroundColor={achieved ? '#F0FDF4' : appTheme.colors.surface}
            borderRadius={appTheme.radius.lg}
            borderWidth={achieved ? 1.5 : 1}
            borderColor={achieved ? appTheme.colors.success : appTheme.colors.border}
            gap={12}
        >
            <XStack alignItems="center" justifyContent="space-between">
                <XStack alignItems="center" gap={8}>
                    <XStack
                        width={32} height={32} borderRadius={10}
                        backgroundColor={color + '22'}
                        alignItems="center" justifyContent="center"
                    >
                        <TrendingUp size={16} color={color} />
                    </XStack>
                    <Text fontSize={14} fontWeight="900" color={appTheme.colors.text}>
                        Thưởng vượt KPI
                    </Text>
                </XStack>
                {achieved ? (
                    <View style={[s.badge, { backgroundColor: appTheme.colors.success }]}>
                        <Text fontSize={10} fontWeight="900" color="#fff">ĐÃ ĐẠT</Text>
                    </View>
                ) : null}
            </XStack>

            <YStack gap={6}>
                <XStack justifyContent="space-between">
                    <Text fontSize={12} color={appTheme.colors.textMuted}>Doanh thu tháng này</Text>
                    <Text fontSize={12} fontWeight="700" color={color}>
                        {fmtMoney(revenue)} / {fmtMoney(threshold)}
                    </Text>
                </XStack>
                <View style={s.barTrack}>
                    <View style={[s.barFill, { width: `${pct}%` as any, backgroundColor: color }]} />
                </View>
                <XStack justifyContent="space-between" alignItems="center">
                    <Text fontSize={11} color={appTheme.colors.textMuted}>
                        {achieved
                            ? `Vượt ngưỡng ${fmtMoney(revenue - threshold)}`
                            : `Còn thiếu ${fmtMoney(remain)}`}
                    </Text>
                    <Text fontSize={13} fontWeight="900" color={color}>
                        {fmtMoney(reward)}
                    </Text>
                </XStack>
            </YStack>
        </YStack>
    );
}

// ─── Rule 4: Lái xe xuất sắc nhất tháng ──────────────────────────────────────
// reward đến từ bonus_rules — không hardcode

function TopDriverCard({ record }: { record: KpiRecord }) {
    const rank   = record.revenue_rank;
    const reward = record.top_driver_bonus_reward ? Number(record.top_driver_bonus_reward) : null;

    if (!reward || rank === 0) return null;

    const isTop1 = rank === 1;
    const color  = isTop1 ? '#F59E0B' : appTheme.colors.primary;

    return (
        <YStack
            padding={16}
            backgroundColor={isTop1 ? '#FFFBEB' : appTheme.colors.surface}
            borderRadius={appTheme.radius.lg}
            borderWidth={isTop1 ? 1.5 : 1}
            borderColor={isTop1 ? '#F59E0B' : appTheme.colors.border}
            gap={10}
        >
            <XStack alignItems="center" justifyContent="space-between">
                <XStack alignItems="center" gap={8}>
                    <XStack
                        width={32} height={32} borderRadius={10}
                        backgroundColor={color + '22'}
                        alignItems="center" justifyContent="center"
                    >
                        <Trophy size={16} color={color} />
                    </XStack>
                    <Text fontSize={14} fontWeight="900" color={appTheme.colors.text}>
                        Lái xe xuất sắc nhất
                    </Text>
                </XStack>
                {isTop1 ? (
                    <View style={[s.badge, { backgroundColor: '#F59E0B' }]}>
                        <Text fontSize={10} fontWeight="900" color="#fff">TOP 1</Text>
                    </View>
                ) : null}
            </XStack>

            <XStack alignItems="center" gap={16}>
                <YStack alignItems="center" gap={2}>
                    <Text fontSize={32} fontWeight="900" color={color}>#{rank}</Text>
                    <Text fontSize={11} color={appTheme.colors.textMuted}>Xếp hạng</Text>
                </YStack>
                <View style={s.divider} />
                <YStack flex={1} gap={4}>
                    <Text fontSize={13} color={isTop1 ? appTheme.colors.success : appTheme.colors.textMuted} fontWeight={isTop1 ? '700' : '400'}>
                        {isTop1 ? 'Bạn đang dẫn đầu nhóm xe!' : 'Vươn tới #1 để nhận thưởng'}
                    </Text>
                    <XStack alignItems="center" gap={4}>
                        <Star size={12} color={color} fill={color} />
                        <Text fontSize={12} fontWeight="700" color={color}>
                            {fmtMoney(reward)} cho driver #1
                        </Text>
                    </XStack>
                </YStack>
            </XStack>
        </YStack>
    );
}

// ─── KPI section ──────────────────────────────────────────────────────────────

function KpiSection({ record }: { record: KpiRecord }) {
    return (
        <YStack gap={14}>
            {/* Completed trips + Revenue */}
            <XStack gap={12}>
                <StatCard
                    icon={<Truck size={18} color={appTheme.colors.primary} />}
                    label="Chuyến hoàn thành"
                    value={String(record.completed_shipments)}
                    color={appTheme.colors.primary}
                />
                <StatCard
                    icon={<TrendingUp size={18} color={appTheme.colors.success} />}
                    label="Doanh thu thực tế"
                    value={fmtMoney(record.total_revenue)}
                    sub="Chỉ tính giá thực tế"
                    color={appTheme.colors.success}
                />
            </XStack>

            {/* On-Time KPI + Incidents */}
            <XStack gap={12}>
                <StatCard
                    icon={<Clock size={18} color={Number(record.on_time_rate) >= 90 ? appTheme.colors.success : appTheme.colors.warning} />}
                    label="Giao đúng hạn"
                    value={`${record.on_time_rate}%`}
                    color={Number(record.on_time_rate) >= 90 ? appTheme.colors.success : appTheme.colors.warning}
                />
                <StatCard
                    icon={<AlertTriangle size={18} color={record.incident_count > 0 ? appTheme.colors.danger : appTheme.colors.success} />}
                    label="Sự cố tháng này"
                    value={String(record.incident_count)}
                    sub={
                        record.critical_incident_count > 0
                            ? `${record.critical_incident_count} khẩn cấp`
                            : record.major_incident_count > 0
                                ? `${record.major_incident_count} nghiêm trọng`
                                : 'Không có sự cố nghiêm trọng'
                    }
                    color={record.incident_count > 0 ? appTheme.colors.danger : appTheme.colors.success}
                />
            </XStack>

            {/* Rule 5 */}
            <KpiBonusCard record={record} />

            {/* Rule 4 */}
            <TopDriverCard record={record} />

            {/* Nhóm xe label */}
            <XStack
                padding={10} borderRadius={appTheme.radius.md}
                backgroundColor={appTheme.colors.surfaceSoft}
                borderWidth={1} borderColor={appTheme.colors.border}
                alignItems="center" gap={8}
            >
                <Truck size={13} color={appTheme.colors.textMuted} />
                <Text fontSize={12} color={appTheme.colors.textMuted}>
                    Nhóm xe:{' '}
                    <Text fontWeight="700" color={appTheme.colors.text}>
                        {record.vehicle_group_name}
                    </Text>
                </Text>
            </XStack>
        </YStack>
    );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyMonth({ month, year }: { month: number; year: number }) {
    return (
        <YStack
            padding={32} borderRadius={appTheme.radius.lg}
            backgroundColor={appTheme.colors.surface}
            borderWidth={1} borderColor={appTheme.colors.border}
            alignItems="center" gap={12}
        >
            <XStack
                width={56} height={56} borderRadius={20}
                backgroundColor={appTheme.colors.surfaceSoft}
                alignItems="center" justifyContent="center"
            >
                <Truck size={26} color={appTheme.colors.textMuted} />
            </XStack>
            <AppText variant="bodyStrong" tone="muted">Chưa có dữ liệu</AppText>
            <AppText variant="caption" tone="muted">
                Chưa có KPI nào được ghi nhận cho {MONTH_NAMES[month]}/{year}
            </AppText>
        </YStack>
    );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function KpiScreen() {
    const now = new Date();
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [year,  setYear]  = useState(now.getFullYear());

    const { records, isLoading, error, reload } = useKpi(month, year);

    useEffect(() => { reload(); }, [reload]);

    const record = records[0] ?? null;

    const goToPrev = () => {
        if (month === 1) { setMonth(12); setYear((y) => y - 1); }
        else setMonth((m) => m - 1);
    };

    const goToNext = () => {
        const n = new Date();
        if (year > n.getFullYear() || (year === n.getFullYear() && month >= n.getMonth() + 1)) return;
        if (month === 12) { setMonth(1); setYear((y) => y + 1); }
        else setMonth((m) => m + 1);
    };

    return (
        <View style={{ flex: 1, backgroundColor: appTheme.colors.background }}>
            <StatusBar style="dark" />
            <ScreenHeader
                title="KPI của tôi"
                showBack
                right={
                    <Pressable
                        onPress={() => router.push({ pathname: '/leaderboard', params: { month: String(month), year: String(year) } })}
                        style={s.rankBtn}
                        hitSlop={10}
                    >
                        <Trophy size={14} color={appTheme.colors.primary} />
                        <Text fontSize={12} fontWeight="700" color={appTheme.colors.primary}>Xếp hạng</Text>
                    </Pressable>
                }
            />

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{
                    paddingHorizontal: appTheme.spacing.screenX,
                    paddingTop: 16,
                    paddingBottom: appTheme.spacing.screenBottom + 20,
                    gap: 16,
                }}
                refreshControl={
                    <RefreshControl refreshing={isLoading} onRefresh={reload} tintColor={appTheme.colors.primary} />
                }
                showsVerticalScrollIndicator={false}
            >
                <MonthNav month={month} year={year} onPrev={goToPrev} onNext={goToNext} />

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

                {isLoading ? <KpiSkeleton /> : null}

                {!isLoading && !error ? (
                    record
                        ? <KpiSection record={record} />
                        : <EmptyMonth month={month} year={year} />
                ) : null}

                {!isLoading && record ? (
                    <Pressable
                        style={s.leaderboardCta}
                        onPress={() => router.push({ pathname: '/leaderboard', params: { month: String(month), year: String(year) } })}
                    >
                        <Award size={18} color={appTheme.colors.primary} />
                        <YStack flex={1} gap={2}>
                            <Text fontSize={14} fontWeight="900" color={appTheme.colors.primary}>
                                Xem bảng xếp hạng tháng {month}/{year}
                            </Text>
                            <Text fontSize={12} color={appTheme.colors.textMuted}>
                                Nhóm xe {record.vehicle_group_name}
                            </Text>
                        </YStack>
                        <ChevronRight size={16} color={appTheme.colors.primary} />
                    </Pressable>
                ) : null}
            </ScrollView>
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
    navBtn: {
        width: 36, height: 36, borderRadius: 12,
        backgroundColor: appTheme.colors.primarySoft,
        alignItems: 'center', justifyContent: 'center',
    },
    currentBadge: {
        paddingHorizontal: 8, paddingVertical: 2,
        borderRadius: appTheme.radius.pill,
        backgroundColor: appTheme.colors.primarySoft,
        borderWidth: 1, borderColor: appTheme.colors.primaryMuted,
    },
    rankBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
    },
    barTrack: {
        height: 8, borderRadius: 4,
        backgroundColor: appTheme.colors.surfaceSoft,
        overflow: 'hidden',
    },
    barFill: {
        height: '100%', borderRadius: 4,
    },
    leaderboardCta: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        padding: 16,
        backgroundColor: appTheme.colors.primarySoft,
        borderRadius: appTheme.radius.lg,
        borderWidth: 1.5, borderColor: appTheme.colors.primaryMuted,
    },
    badge: {
        paddingHorizontal: 8, paddingVertical: 3,
        borderRadius: appTheme.radius.pill,
    },
    divider: {
        width: 1, height: 48,
        backgroundColor: appTheme.colors.border,
    },
});
