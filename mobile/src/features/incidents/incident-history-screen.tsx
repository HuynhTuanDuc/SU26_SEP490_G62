import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import {
    AlertTriangle, CheckCircle, ChevronRight, Clock, FileText,
    Image as ImageIcon, MapPin, Package, SearchX, Truck,
} from 'lucide-react-native';
import { Text, XStack, YStack } from 'tamagui';

import { AppText } from '@/components/app-text';
import { ScreenHeader } from '@/components/screen-header';
import { SkeletonBox, SkeletonLine } from '@/components/skeleton';
import { appTheme } from '@/theme/app-theme';
import { useIncidents } from '@/hooks/use-incidents';
import {
    INCIDENT_SEVERITY_LABEL,
    INCIDENT_STATUS_LABEL,
    INCIDENT_TYPE_LABEL,
} from '@/types/incident';
import type { Incident, IncidentSeverity, IncidentStatus, IncidentType } from '@/types/incident';

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<IncidentStatus, { bg: string; text: string; border: string; icon: React.ReactNode }> = {
    open:          { bg: appTheme.colors.warningSoft,  text: appTheme.colors.warningText, border: appTheme.colors.warningBorder, icon: <Clock size={11} color={appTheme.colors.warningText} /> },
    investigating: { bg: appTheme.colors.primarySoft,  text: appTheme.colors.primary,     border: appTheme.colors.primaryMuted,  icon: <SearchX size={11} color={appTheme.colors.primary} /> },
    resolved:      { bg: appTheme.colors.successSoft,  text: appTheme.colors.success,     border: appTheme.colors.successBorder, icon: <CheckCircle size={11} color={appTheme.colors.success} /> },
    closed:        { bg: appTheme.colors.surfaceSoft,  text: appTheme.colors.textMuted,   border: appTheme.colors.border,        icon: <FileText size={11} color={appTheme.colors.textMuted} /> },
};

const SEVERITY_DOT_COLOR: Record<IncidentSeverity, string> = {
    low:      appTheme.colors.success,
    medium:   appTheme.colors.warning,
    high:     appTheme.colors.danger,
    critical: '#7C3AED',
};

const TYPE_ICON: Record<string, React.ReactNode> = {
    vehicle_breakdown: <Truck         size={16} color={appTheme.colors.danger}      />,
    cargo_damage:      <Package       size={16} color={appTheme.colors.warningText} />,
    road_incident:     <AlertTriangle size={16} color={appTheme.colors.warning}     />,
    customer_refusal:  <FileText      size={16} color='#7C3AED'                     />,
    traffic_jam:       <MapPin        size={16} color={appTheme.colors.primary}     />,
    other:             <FileText      size={16} color={appTheme.colors.textMuted}   />,
};

function StatusBadge({ status }: { status: IncidentStatus }) {
    const st = STATUS_STYLE[status] ?? STATUS_STYLE.open;
    return (
        <XStack
            paddingHorizontal={8} paddingVertical={4}
            borderRadius={appTheme.radius.pill}
            backgroundColor={st.bg}
            borderWidth={1} borderColor={st.border}
            alignItems="center" gap={4}
        >
            {st.icon}
            <Text fontSize={10} fontWeight="900" color={st.text}>
                {INCIDENT_STATUS_LABEL[status] ?? status}
            </Text>
        </XStack>
    );
}

function formatDate(iso: string) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

// ─── Incident card ────────────────────────────────────────────────────────────

function IncidentCard({ item }: { item: Incident }) {
    const severityColor  = SEVERITY_DOT_COLOR[item.severity_level] ?? appTheme.colors.warning;
    const previewImages  = item.image_urls.slice(0, 3);
    const canEdit        = item.status === 'open';

    return (
        <Pressable
            onPress={() => router.push({ pathname: '/incident-detail', params: { id: String(item.id) } })}
            style={({ pressed }) => [s.card, pressed && { opacity: 0.85 }]}
        >
            {/* Header */}
            <XStack
                paddingHorizontal={14} paddingVertical={10}
                backgroundColor={appTheme.colors.surfaceSoft}
                justifyContent="space-between" alignItems="center"
            >
                <XStack alignItems="center" gap={8}>
                    <XStack
                        width={28} height={28} borderRadius={10}
                        backgroundColor={appTheme.colors.surface}
                        borderWidth={1} borderColor={appTheme.colors.border}
                        alignItems="center" justifyContent="center"
                    >
                        {TYPE_ICON[item.incident_type]}
                    </XStack>
                    <Text fontSize={13} fontWeight="900" color={appTheme.colors.text}>
                        {INCIDENT_TYPE_LABEL[item.incident_type]}
                    </Text>
                </XStack>
                <XStack alignItems="center" gap={6}>
                    <StatusBadge status={item.status} />
                    <ChevronRight size={14} color={appTheme.colors.textMuted} />
                </XStack>
            </XStack>

            {/* Body */}
            <YStack padding={14} gap={10}>
                <XStack alignItems="center" gap={10} justifyContent="space-between">
                    <XStack alignItems="center" gap={6}>
                        <View style={[s.severityDot, { backgroundColor: severityColor }]} />
                        <Text fontSize={12} fontWeight="700" color={appTheme.colors.textMuted}>
                            {INCIDENT_SEVERITY_LABEL[item.severity_level]}
                        </Text>
                    </XStack>
                    <Text fontSize={11} color={appTheme.colors.textMuted}>
                        Chuyến #{item.shipment_id}
                    </Text>
                </XStack>

                <Text fontSize={13} color={appTheme.colors.text} numberOfLines={2} lineHeight={18}>
                    {item.description}
                </Text>

                {item.location ? (
                    <XStack alignItems="center" gap={4}>
                        <MapPin size={11} color={appTheme.colors.textMuted} />
                        <Text fontSize={11} color={appTheme.colors.textMuted} numberOfLines={1} flex={1}>
                            {item.location}
                        </Text>
                    </XStack>
                ) : null}

                {previewImages.length > 0 ? (
                    <XStack gap={6} alignItems="center">
                        <ImageIcon size={11} color={appTheme.colors.textMuted} />
                        <XStack gap={4}>
                            {previewImages.map((url, i) => (
                                <Image
                                    key={i}
                                    source={{ uri: url }}
                                    style={s.previewImg}
                                    resizeMode="cover"
                                />
                            ))}
                        </XStack>
                        {item.image_urls.length > 3 ? (
                            <Text fontSize={10} color={appTheme.colors.textMuted}>
                                +{item.image_urls.length - 3}
                            </Text>
                        ) : null}
                    </XStack>
                ) : null}

                <XStack justifyContent="space-between" alignItems="center">
                    <Text fontSize={11} color={appTheme.colors.textMuted}>
                        {formatDate(item.created_at)}
                    </Text>
                    {canEdit ? (
                        <Text fontSize={11} color={appTheme.colors.primary} fontWeight="700">
                            Có thể chỉnh sửa
                        </Text>
                    ) : item.resolved_at ? (
                        <XStack alignItems="center" gap={4}>
                            <CheckCircle size={11} color={appTheme.colors.success} />
                            <Text fontSize={10} color={appTheme.colors.success} fontWeight="700">
                                Giải quyết {formatDate(item.resolved_at)}
                            </Text>
                        </XStack>
                    ) : null}
                </XStack>
            </YStack>
        </Pressable>
    );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function IncidentCardSkeleton() {
    return (
        <YStack
            borderRadius={appTheme.radius.lg}
            borderWidth={1}
            borderColor={appTheme.colors.border}
            backgroundColor={appTheme.colors.surface}
            overflow="hidden"
        >
            <XStack paddingHorizontal={14} paddingVertical={10} backgroundColor={appTheme.colors.surfaceSoft} justifyContent="space-between">
                <XStack gap={8} alignItems="center">
                    <SkeletonBox width={28} height={28} borderRadius={10} />
                    <SkeletonLine width={100} height={13} />
                </XStack>
                <SkeletonLine width={70} height={22} borderRadius={appTheme.radius.pill} />
            </XStack>
            <YStack padding={14} gap={10}>
                <SkeletonLine width={120} height={12} />
                <SkeletonLine width="90%" height={13} />
                <SkeletonLine width="60%" height={13} />
                <SkeletonLine width={140} height={11} />
            </YStack>
        </YStack>
    );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function IncidentHistoryScreen() {
    const { incidents, isLoading, error, refresh } = useIncidents();

    return (
        <View style={{ flex: 1, backgroundColor: appTheme.colors.background }}>
            <ScreenHeader title="Lịch sử sự cố" showBack />

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{
                    paddingHorizontal: appTheme.spacing.screenX,
                    paddingTop: 16,
                    paddingBottom: appTheme.spacing.screenBottom,
                    gap: 12,
                    flexGrow: 1,
                }}
                refreshControl={
                    <RefreshControl
                        refreshing={isLoading}
                        onRefresh={() => refresh(false)}
                        tintColor={appTheme.colors.primary}
                    />
                }
                showsVerticalScrollIndicator={false}
            >
                {!isLoading && incidents.length > 0 ? (
                    <Text fontSize={12} color={appTheme.colors.textMuted} fontWeight="700">
                        {incidents.length} sự cố đã báo cáo
                    </Text>
                ) : null}

                {error ? (
                    <XStack
                        padding={14} borderRadius={appTheme.radius.md}
                        backgroundColor={appTheme.colors.dangerSoft}
                        borderWidth={1} borderColor={appTheme.colors.dangerBorder}
                        gap={8} alignItems="center"
                    >
                        <AlertTriangle size={16} color={appTheme.colors.danger} />
                        <AppText variant="caption" tone="danger">{error}</AppText>
                    </XStack>
                ) : null}

                {isLoading && incidents.length === 0 ? (
                    <YStack gap={12}>
                        {[0, 1, 2].map((i) => <IncidentCardSkeleton key={i} />)}
                    </YStack>
                ) : null}

                {!isLoading && incidents.length === 0 && !error ? (
                    <YStack flex={1} alignItems="center" justifyContent="center" paddingVertical={80} gap={12}>
                        <XStack
                            width={64} height={64} borderRadius={24}
                            backgroundColor={appTheme.colors.surfaceSoft}
                            alignItems="center" justifyContent="center"
                        >
                            <CheckCircle size={30} color={appTheme.colors.success} />
                        </XStack>
                        <AppText variant="bodyStrong" tone="muted">Chưa có sự cố nào</AppText>
                        <AppText variant="caption" tone="muted">Hành trình thuận lợi!</AppText>
                    </YStack>
                ) : null}

                {incidents.map((item) => (
                    <IncidentCard key={item.id} item={item} />
                ))}
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    card: {
        borderRadius: appTheme.radius.lg,
        borderWidth: 1,
        borderColor: appTheme.colors.border,
        backgroundColor: appTheme.colors.surface,
        overflow: 'hidden',
    },
    severityDot: { width: 8, height: 8, borderRadius: 4 },
    previewImg:  { width: 40, height: 40, borderRadius: 8 },
});
