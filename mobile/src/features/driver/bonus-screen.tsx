import { useEffect, useState, useCallback } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, View, StyleSheet } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { Gift, CheckCircle2, Clock, XCircle, Banknote } from 'lucide-react-native';

import { ScreenHeader } from '@/components/screen-header';
import { AppText }      from '@/components/app-text';
import { appTheme }     from '@/theme/app-theme';
import { bonusService, type DriverBonus, type BonusType, type BonusStatus } from '@/services/bonus-service';

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<BonusType, string> = {
    tet_annual:       'Thưởng Tết',
    welfare_wedding:  'Hỗ trợ kết hôn',
    welfare_funeral:  'Hỗ trợ tang gia',
    welfare_birthday: 'Thưởng sinh nhật',
    holiday_overtime: 'Thưởng ngày lễ',
    special:          'Thưởng đặc biệt',
};

const RELATION_LABEL: Record<string, string> = {
    self:          'Bản thân',
    spouse:        'Vợ/Chồng',
    parent:        'Cha/Mẹ',
    parent_in_law: 'Bố/Mẹ vợ chồng',
    child:         'Con',
};

const STATUS_CONFIG: Record<BonusStatus, { label: string; color: string }> = {
    pending:  { label: 'Chờ duyệt', color: '#F59E0B' },
    approved: { label: 'Đã duyệt',  color: '#3B82F6' },
    paid:     { label: 'Đã chi',    color: '#10B981' },
    rejected: { label: 'Từ chối',   color: '#EF4444' },
};

const fmtMoney = (val: string | number | null) => {
    if (val == null) return '—';
    const n = Number(val);
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 2)}M₫`;
    return n.toLocaleString('vi-VN') + 'đ';
};

const fmtDate = (iso: string | null) => {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('vi-VN');
};

// ─── Card ─────────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: BonusStatus }) {
    const cfg = STATUS_CONFIG[status] ?? { label: status, color: '#6B7280' };
    return (
        <View style={[styles.badge, { backgroundColor: cfg.color + '20' }]}>
            <AppText style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</AppText>
        </View>
    );
}

function BonusCard({ bonus }: { bonus: DriverBonus }) {
    const cfg = STATUS_CONFIG[bonus.status] ?? { label: bonus.status, color: '#6B7280' };

    return (
        <View style={styles.card}>
            {/* Header row */}
            <XStack justifyContent="space-between" alignItems="flex-start" mb="$2">
                <YStack flex={1} mr="$2">
                    <AppText style={styles.typeLabel}>
                        {TYPE_LABEL[bonus.type] ?? bonus.type}
                    </AppText>
                    <AppText style={styles.yearText}>Năm {bonus.year}</AppText>
                </YStack>
                <StatusBadge status={bonus.status} />
            </XStack>

            {/* Amount */}
            <XStack alignItems="center" gap="$1.5" mb="$2">
                <Banknote size={16} color={appTheme.colors.primary} />
                <AppText style={styles.amount}>{fmtMoney(bonus.amount)}</AppText>
            </XStack>

            {/* Tet detail */}
            {bonus.type === 'tet_annual' && (
                <View style={styles.detailBox}>
                    <XStack justifyContent="space-between" mb="$1">
                        <AppText style={styles.detailLabel}>Tháng đủ</AppText>
                        <AppText style={styles.detailValue}>{bonus.months_full_count ?? 0}</AppText>
                    </XStack>
                    <XStack justifyContent="space-between" mb="$1">
                        <AppText style={styles.detailLabel}>Thưởng thâm niên</AppText>
                        <AppText style={styles.detailValue}>{fmtMoney(bonus.seniority_bonus)}</AppText>
                    </XStack>
                    <XStack justifyContent="space-between">
                        <AppText style={styles.detailLabel}>Thưởng chuyên cần</AppText>
                        <AppText style={styles.detailValue}>{fmtMoney(bonus.attendance_bonus)}</AppText>
                    </XStack>
                </View>
            )}

            {/* Welfare detail */}
            {bonus.beneficiary_name && (
                <AppText style={styles.beneficiaryText}>
                    Thân nhân: {bonus.beneficiary_name}
                    {bonus.beneficiary_relation
                        ? ` (${RELATION_LABEL[bonus.beneficiary_relation] ?? bonus.beneficiary_relation})`
                        : ''}
                </AppText>
            )}

            {/* Notes */}
            {bonus.notes && (
                <AppText style={styles.notesText}>{bonus.notes}</AppText>
            )}

            {/* Rejection reason */}
            {bonus.rejection_reason && (
                <View style={styles.rejectBox}>
                    <AppText style={styles.rejectText}>
                        Lý do từ chối: {bonus.rejection_reason}
                    </AppText>
                </View>
            )}

            {/* Footer */}
            <XStack justifyContent="space-between" alignItems="center" mt="$2">
                <AppText style={styles.footerText}>
                    {bonus.status === 'paid' && bonus.paid_at
                        ? `Chi ngày ${fmtDate(bonus.paid_at)}`
                        : bonus.status === 'approved' && bonus.approved_at
                            ? `Duyệt ngày ${fmtDate(bonus.approved_at)}`
                            : `Tạo ngày ${fmtDate(bonus.created_at)}`}
                </AppText>
                {bonus.approved_by_name && (
                    <AppText style={styles.footerText}>
                        Duyệt: {bonus.approved_by_name}
                    </AppText>
                )}
            </XStack>
        </View>
    );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function BonusScreen() {
    const [bonuses,  setBonuses]  = useState<DriverBonus[]>([]);
    const [loading,  setLoading]  = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error,    setError]    = useState<string | null>(null);

    const load = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true); else setLoading(true);
        setError(null);
        try {
            const res = await bonusService.getMyBonuses();
            setBonuses(res.bonuses ?? []);
        } catch (err: any) {
            setError(err.message ?? 'Lỗi tải dữ liệu');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const totalPaid = bonuses
        .filter((b) => b.status === 'paid')
        .reduce((sum, b) => sum + Number(b.amount), 0);

    const pending = bonuses.filter((b) => b.status === 'pending').length;

    return (
        <View style={styles.container}>
            <ScreenHeader title="Thưởng & Phúc lợi" />

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator color={appTheme.colors.primary} />
                </View>
            ) : error ? (
                <View style={styles.center}>
                    <AppText style={styles.errorText}>{error}</AppText>
                </View>
            ) : (
                <ScrollView
                    contentContainerStyle={styles.scroll}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={() => load(true)}
                            tintColor={appTheme.colors.primary}
                        />
                    }
                >
                    {/* Summary */}
                    <XStack gap="$3" mb="$4">
                        <View style={[styles.summaryCard, { flex: 1 }]}>
                            <AppText style={styles.summaryLabel}>Tổng đã nhận</AppText>
                            <AppText style={styles.summaryValue}>{fmtMoney(totalPaid)}</AppText>
                        </View>
                        <View style={[styles.summaryCard, { flex: 1 }]}>
                            <AppText style={styles.summaryLabel}>Chờ duyệt</AppText>
                            <AppText style={[styles.summaryValue, { color: '#F59E0B' }]}>
                                {pending}
                            </AppText>
                        </View>
                    </XStack>

                    {bonuses.length === 0 ? (
                        <View style={styles.center}>
                            <Gift size={40} color="#D1D5DB" />
                            <AppText style={styles.emptyText}>Chưa có khoản thưởng nào</AppText>
                        </View>
                    ) : (
                        bonuses.map((b) => <BonusCard key={b.id} bonus={b} />)
                    )}
                </ScrollView>
            )}
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container:      { flex: 1, backgroundColor: '#F9FAFB' },
    center:         { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    scroll:         { padding: 16, gap: 12 },
    card: {
        backgroundColor: '#fff',
        borderRadius: 14,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
        elevation: 2,
        marginBottom: 12,
    },
    typeLabel:      { fontSize: 15, fontWeight: '600', color: '#111827' },
    yearText:       { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
    amount:         { fontSize: 20, fontWeight: '700', color: '#111827' },
    badge:          { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    badgeText:      { fontSize: 12, fontWeight: '600' },
    detailBox: {
        backgroundColor: '#F9FAFB',
        borderRadius: 8,
        padding: 10,
        marginBottom: 8,
    },
    detailLabel:    { fontSize: 12, color: '#6B7280' },
    detailValue:    { fontSize: 12, fontWeight: '600', color: '#111827' },
    beneficiaryText:{ fontSize: 13, color: '#374151', marginBottom: 4 },
    notesText:      { fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' },
    rejectBox:      { backgroundColor: '#FEF2F2', borderRadius: 8, padding: 8, marginTop: 6 },
    rejectText:     { fontSize: 12, color: '#EF4444' },
    footerText:     { fontSize: 11, color: '#9CA3AF' },
    summaryCard: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 14,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 2,
        elevation: 1,
    },
    summaryLabel:   { fontSize: 12, color: '#6B7280', marginBottom: 4 },
    summaryValue:   { fontSize: 18, fontWeight: '700', color: '#111827' },
    emptyText:      { fontSize: 14, color: '#9CA3AF', marginTop: 12 },
    errorText:      { fontSize: 14, color: '#EF4444', textAlign: 'center' },
});
