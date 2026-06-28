import { useState, useEffect, useCallback } from "react";
import { accountantService } from "../services/accountant.service";

const currentPeriod = () => {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
};

export function usePayroll() {
  const [period, setPeriod]           = useState(currentPeriod());
  const [payrolls, setPayrolls]       = useState([]);
  const [stats, setStats]             = useState(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await accountantService.getPayrolls({
        month: period.month,
        year: period.year,
      });
      setPayrolls(data.payrolls ?? []);
      setStats(data.stats ?? null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  return {
    period, setPeriod,
    payrolls, stats,
    loading, error,
    refetch: load,
  };
}

export function useSalaryAdvances() {
  const [statusFilter, setStatusFilter] = useState("approved");
  const [advances, setAdvances]         = useState([]);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      const data = await accountantService.getSalaryAdvances(params);
      setAdvances(data.advances ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  return {
    statusFilter, setStatusFilter,
    advances, loading, error,
    refetch: load,
  };
}
