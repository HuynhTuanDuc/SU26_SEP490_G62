import { useCallback, useState } from 'react';
import {
    ActivityIndicator, Pressable, RefreshControl,
    ScrollView, StyleSheet, View,
} from 'react-native';
import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
    AlertTriangle, CheckCircle, Clock, Edit3, FileText,
    MapPin, Package, SearchX, Truck,
} from 'lucide-react-native';
import { Text, XStack, YStack } from 'tamagui';

import { AppText } from '@/components/app-text';
import { AppButton } from '@/components/app-button';
import { ScreenHeader } from '@/components/screen-header';
import { appTheme } from '@/theme/app-theme';
import { incidentService } from '@/services/incident-service';
import {
    INCIDENT_SEVERITY_LABEL,
    INCIDENT_STATUS_LABEL,
    INCIDENT_TYPE_LABEL,
} from '@/types/incident';
import type { Incident, IncidentSeverity, IncidentStatus, IncidentType } from '@/types/incident';

// ─── Visual maps ──────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<IncidentStatus, { bg: string; text: string; border: string; icon: React.ReactNode }> = {
    open:          { bg: appTheme.colors.warningSoft,  text: appTheme.colors.warningText, border: appTheme.colors.warningBorder, icon: <Clock size={13} color={appTheme.colors.warningText} /> },
    investigating: { bg: appTheme.colors.primarySoft,  text: appTheme.colors.primary,     border: appTheme.colors.primaryMuted,  icon: <SearchX size={13} color={appTheme.colors.primary} /> },
    resolved:      { bg: appTheme.colors.successSoft,  text: appTheme.colors.success,     border: appTheme.colors.successBorder, icon: <CheckCircle size={13} color={appTheme.colors.success} /> },
    closed:        { bg: appTheme.colors.surfaceSoft,  text: appTheme.colors.textMuted,   border: appTheme.colors.border,        icon: <FileText size={13} color={appTheme.colors.textMuted} /> },
};

const SEVERITY_COLOR: Record<IncidentSeverity, string> = {
    low:      appTheme.colors.success,
    medium:   appTheme.colors.warning,
    high:     appTheme.colors.danger,
    critical: '#7C3AED',
};

const TYPE_ICON: Record<string, React.ReactNode> = {
    vehicle_breakdown: <Truck         size={20} color={appTheme.colors.danger}      />,
    cargo_damage:      <Package       size={20} color={appTheme.colors.warningText} />,
    road_incident:     <AlertTriangle size={20} color={appTheme.colors.warning}     />,
    customer_refusal:  <FileText      size={20} color='#7C3AED'                     />,
    traffic_jam:       <MapPin        size={20} color={appTheme.colors.primary}     />,
    other:             <FileText      size={20} color={appTheme.colors.textMuted}   />,
};

function formatDate(iso: string | null | undefined) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

// ─── Info row ─────────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <XStack justifyContent="space-between" alignItems="flex-start" gap={12}>
            <Text fontSize={12} color={appTheme.colors.textMuted} fontWeight="700" style={{ minWidth: 80 }}>
                {label}
            </Text>
            <Text fontSize={13} color={appTheme.colors.text} flex={1} textAlign="right">
                {value}
            </Text>
        </XStack>
    );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function IncidentDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const incidentId = Number(id);

    const [incident,  setIncident]  = useState<Incident | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error,     setError]     = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!incidentId) return;
        setIsLoading(true);
        setError(null);
        try {
            const { incident: data } = await incidentService.getIncidentDetail(incidentId);
            setIncident(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Không thể tải sự cố');
        } finally {
            setIsLoading(false);
        }
    }, [incidentId]);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    const canEdit = incident?.status === 'open';
    const statusSt = incident ? (STATUS_STYLE[incident.status] ?? STATUS_STYLE.open) : null;
    const severityColor = incident ? (SEVERITY_COLOR[incident.severity_level] ?? appTheme.colors.warning) : '';

    return (
        <View style={{ flex: 1, backgroundColor: appTheme.colors.background }}>
            <ScreenHeader
                title={incident ? `Sự cố #${incident.id}` : 'Chi tiết sự cố'}
                showBack
                right={
                    canEdit ? (
                        <Pressable
                            onPress={() => router.push({ pathname: '/incident-edit', params: { id: String(incidentId) } })}
                            style={s.editHeaderBtn}
                            hitSlop={10}
                        >
                            <Edit3 size={15} color={appTheme.colors.primary} />
                            <Text fontSize={12} fontWeight="700" color={appTheme.colors.primary}>Chỉnh sửa</Text>
                        </Pressable>
                    ) : null
                }
            />

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{
                    paddingHorizontal: appTheme.spacing.screenX,
                    paddingTop: 20,
                    paddingBottom: appTheme.spacing.screenBottom + 20,
                    gap: 16,
                }}
                refreshControl={
                    <RefreshControl refreshing={isLoading && !!incident} onRefresh={load} tintColor={appTheme.colors.primary} />
                }
                showsVerticalScrollIndicator={false}
            >
                {/* Loading */}
                {isLoading && !incident ? (
                    <YStack flex={1} alignItems="center" justifyContent="center" paddingVertical={80} gap={12}>
                        <ActivityIndicator color={appTheme.colors.primary} />
                        <AppText variant="caption" tone="muted">Đang tải...</AppText>
                    </YStack>
                ) : null}

                {/* Error */}
                {error ? (
                    <XStack
                        padding={14} borderRadius={appTheme.radius.md}
                        backgroundColor={appTheme.colors.dangerSoft}
                        borderWidth={1} borderColor={appTheme.colors.dangerBorder}
                        gap={8} alignItems="center"
                    >
                        <AlertTriangle size={16} color={appTheme.colors.danger} />
                        <AppText variant="caption" tone="danger" flex={1}>{error}</AppText>
                    </XStack>
                ) : null}

                {incident && statusSt ? (
                    <>
                        {/* ── Status + type card ── */}
                        <YStack
                            padding={16} borderRadius={appTheme.radius.lg}
                            backgroundColor={appTheme.colors.surface}
                            borderWidth={1} borderColor={appTheme.colors.border}
                            gap={12}
                        >
                            <XStack justifyContent="space-between" alignItems="center">
                                <XStack alignItems="center" gap={10}>
                                    <XStack
                                        width={42} height={42} borderRadius={14}
                                        backgroundColor={appTheme.colors.surfaceSoft}
                                        borderWidth={1} borderColor={appTheme.colors.border}
                                        alignItems="center" justifyContent="center"
                                    >
                                        {TYPE_ICON[incident.incident_type]}
                                    </XStack>
                                    <YStack gap={2}>
                                        <Text fontSize={15} fontWeight="900" color={appTheme.colors.text}>
                                            {INCIDENT_TYPE_LABEL[incident.incident_type]}
                                        </Text>
                                        <Text fontSize={11} color={appTheme.colors.textMuted}>
                                            Chuyến #{incident.shipment_id}
                                        </Text>
                                    </YStack>
                                </XStack>

                                {/* Status badge */}
                                <XStack
                                    paddingHorizontal={10} paddingVertical={6}
                                    borderRadius={appTheme.radius.pill}
                                    backgroundColor={statusSt.bg}
                                    borderWidth={1} borderColor={statusSt.border}
                                    alignItems="center" gap={5}
                                >
                                    {statusSt.icon}
                                    <Text fontSize={11} fontWeight="900" color={statusSt.text}>
                                        {INCIDENT_STATUS_LABEL[incident.status]}
                                    </Text>
                                </XStack>
                            </XStack>

                            {/* Severity */}
                            <XStack alignItems="center" gap={8}>
                                <View style={[s.severityDot, { backgroundColor: severityColor }]} />
                                <Text fontSize={13} color={appTheme.colors.text} fontWeight="700">
                                    {INCIDENT_SEVERITY_LABEL[incident.severity_level]}
                                </Text>
                                <Text fontSize={12} color={appTheme.colors.textMuted}>
                                    — mức độ nghiêm trọng
                                </Text>
                            </XStack>
                        </YStack>

                        {/* ── Description ── */}
                        <YStack
                            padding={16} borderRadius={appTheme.radius.lg}
                            backgroundColor={appTheme.colors.surface}
                            borderWidth={1} borderColor={appTheme.colors.border}
                            gap={8}
                        >
                            <Text fontSize={12} fontWeight="700" color={appTheme.colors.textMuted}>
                                MÔ TẢ
                            </Text>
                            <Text fontSize={14} color={appTheme.colors.text} lineHeight={22}>
                                {incident.description}
                            </Text>
                        </YStack>

                        {/* ── Meta info ── */}
                        <YStack
                            padding={16} borderRadius={appTheme.radius.lg}
                            backgroundColor={appTheme.colors.surface}
                            borderWidth={1} borderColor={appTheme.colors.border}
                            gap={12}
                        >
                            <Text fontSize={12} fontWeight="700" color={appTheme.colors.textMuted}>
                                THÔNG TIN
                            </Text>
                            {incident.location ? (
                                <XStack alignItems="flex-start" gap={6}>
                                    <MapPin size={13} color={appTheme.colors.textMuted} style={{ marginTop: 2 }} />
                                    <Text fontSize={13} color={appTheme.colors.text} flex={1}>
                                        {incident.location}
                                    </Text>
                                </XStack>
                            ) : null}
                            <InfoRow label="Tạo lúc"    value={formatDate(incident.created_at)} />
                            <InfoRow label="Xảy ra lúc" value={formatDate(incident.occurred_at)} />
                            {incident.resolved_at ? (
                                <InfoRow label="Giải quyết" value={formatDate(incident.resolved_at)} />
                            ) : null}
                        </YStack>

                        {/* ── Images ── */}
                        {incident.image_urls.length > 0 ? (
                            <YStack
                                padding={16} borderRadius={appTheme.radius.lg}
                                backgroundColor={appTheme.colors.surface}
                                borderWidth={1} borderColor={appTheme.colors.border}
                                gap={12}
                            >
                                <XStack alignItems="center" justifyContent="space-between">
                                    <Text fontSize={12} fontWeight="700" color={appTheme.colors.textMuted}>
                                        ẢNH MINH CHỨNG
                                    </Text>
                                    <Text fontSize={11} color={appTheme.colors.textMuted}>
                                        {incident.image_urls.length} ảnh
                                    </Text>
                                </XStack>
                                <XStack gap={10} flexWrap="wrap">
                                    {incident.image_urls.map((url, i) => (
                                        <Image
                                            key={i}
                                            source={{ uri: url }}
                                            style={s.fullImg}
                                            contentFit="cover"
                                        />
                                    ))}
                                </XStack>
                            </YStack>
                        ) : null}

                        {/* ── Edit button (if open) ── */}
                        {canEdit ? (
                            <AppButton
                                tone="primary"
                                onPress={() => router.push({ pathname: '/incident-edit', params: { id: String(incidentId) } })}
                                height={52}
                            >
                                Chỉnh sửa sự cố
                            </AppButton>
                        ) : null}
                    </>
                ) : null}
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    editHeaderBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
    },
    severityDot: {
        width: 10, height: 10, borderRadius: 5,
    },
    fullImg: {
        width: 100, height: 100, borderRadius: 12,
    },
});
