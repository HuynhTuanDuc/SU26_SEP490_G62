import { useState, useEffect, useCallback } from "react";
import { accountantService } from "../services/accountant.service";

const DEFAULT_STATS = {
  total_revenue: 0,
  total_collected: 0,
  total_receivables: 0,
  pending_payments_count: 0,
};

export function useFinanceStats() {
  const [stats, setStats] = useState(DEFAULT_STATS);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const data = await accountantService.getFinanceStats();
      setStats(data);
    } catch (err) {
      console.error("useFinanceStats:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, loading, refetch: fetchStats };
}
