import { apiClient } from '@/lib/api-client';

export type BonusType =
  | 'tet_annual'
  | 'welfare_wedding'
  | 'welfare_funeral'
  | 'welfare_birthday'
  | 'holiday_overtime'
  | 'special';

export type BonusStatus = 'pending' | 'approved' | 'rejected' | 'paid';

export interface DriverBonus {
  id: number;
  driver_id: number;
  type: BonusType;
  year: number;
  amount: string;
  notes: string | null;
  months_full_count: number | null;
  months_incomplete_count: number | null;
  seniority_bonus: string | null;
  attendance_bonus: string | null;
  beneficiary_name: string | null;
  beneficiary_relation: string | null;
  proof_url: string | null;
  status: BonusStatus;
  rejection_reason: string | null;
  approved_by_name: string | null;
  paid_by_name: string | null;
  approved_at: string | null;
  paid_at: string | null;
  created_at: string;
}

export const bonusService = {
  getMyBonuses: (): Promise<{ bonuses: DriverBonus[] }> =>
    apiClient.get('/api/bonuses/my'),
};
