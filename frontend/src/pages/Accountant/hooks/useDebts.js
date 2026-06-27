import { useState, useEffect, useCallback } from "react";
import { accountantService } from "../services/accountant.service";

const DEFAULT_STATS = { total_customer_debt: 0, total_driver_debt: 0, total_debt: 0 };

// Map BE response { byType, totalRemaining } → FE shape
const mapStats = (data) => ({
  total_customer_debt: data?.byType?.customer?.total_remaining ?? 0,
  total_driver_debt:   data?.byType?.driver?.total_remaining   ?? 0,
  total_debt:          data?.totalRemaining ?? 0,
  customer_count:      data?.byType?.customer?.count ?? 0,
  driver_count:        data?.byType?.driver?.count   ?? 0,
});

export function useDebts() {
  const [stats, setStats]               = useState(DEFAULT_STATS);
  const [statsLoading, setStatsLoading] = useState(true);

  const [grouped, setGrouped]               = useState([]);
  const [groupedLoading, setGroupedLoading] = useState(true);

  const [debtType, setDebtType] = useState("customer"); // "customer" | "driver"

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const data = await accountantService.getDebtStats();
      setStats(mapStats(data));
    } catch {
      /* silent */
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchGrouped = useCallback(async () => {
    setGroupedLoading(true);
    try {
      const data = await accountantService.getDebtsGrouped();
      // API trả về { debts: [...], totalPersons, ... }
      setGrouped(Array.isArray(data?.debts) ? data.debts : []);
    } catch {
      setGrouped([]);
    } finally {
      setGroupedLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchGrouped();
  }, [fetchStats, fetchGrouped]);

  const refetch = useCallback(() => {
    fetchStats();
    fetchGrouped();
  }, [fetchStats, fetchGrouped]);

  // BE trả về field `debt_type`, không phải `person_type`
  const customerDebts = grouped.filter((d) => d.debt_type === "customer");
  const driverDebts   = grouped.filter((d) => d.debt_type === "driver");

  return {
    stats, statsLoading,
    debtType, setDebtType,
    customerDebts,
    driverDebts,
    groupedLoading,
    refetch,
  };
}
