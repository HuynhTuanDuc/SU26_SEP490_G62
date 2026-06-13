import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type KpiRecord = {
    id: number;
    month: number;
    year: number;
    completed_shipments: number;
    total_revenue: string;       // chỉ actual_price (BR-026)
    incident_count: number;
    major_incident_count: number;
    critical_incident_count: number;
    vehicle_group_name: string;
    // Xếp hạng trong nhóm xe
    revenue_rank: number;
    trips_rank: number;
    // Rule 5 — Thưởng vượt KPI (giá trị từ bonus_rules DB, không hardcode)
    kpi_bonus_reward: string | null;
    kpi_bonus_threshold: string | null;
    kpi_bonus_achieved: boolean;
    // Rule 4 — Thưởng lái xe xuất sắc nhất
    top_driver_bonus_reward: string | null;
};

export type LeaderboardRow = {
    driver_id: number;
    driver_name: string;
    completed_shipments: number;
    total_revenue: string;
    incident_count: number;
    revenue_rank: number;
    trips_rank: number;
    is_me: boolean;
};

export type LeaderboardResponse = {
    vehicle_group_name: string;
    month: number;
    year: number;
    total_in_group: number;
    leaderboard: LeaderboardRow[];
};

// ─── Service ──────────────────────────────────────────────────────────────────

export const kpiService = {
    getMyKPI: (params?: { month?: number; year?: number }): Promise<{ kpi: KpiRecord[] }> => {
        const q = new URLSearchParams();
        if (params?.month) q.set('month', String(params.month));
        if (params?.year)  q.set('year',  String(params.year));
        return apiClient.get(`/api/kpi/me${q.toString() ? `?${q}` : ''}`);
    },

    getLeaderboard: (params?: { month?: number; year?: number }): Promise<LeaderboardResponse> => {
        const q = new URLSearchParams();
        if (params?.month) q.set('month', String(params.month));
        if (params?.year)  q.set('year',  String(params.year));
        return apiClient.get(`/api/kpi/leaderboard${q.toString() ? `?${q}` : ''}`);
    },
};
