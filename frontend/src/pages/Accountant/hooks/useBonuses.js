import { useState, useEffect, useCallback } from "react";
import { accountantService } from "../services/accountant.service";

const currentYear = new Date().getFullYear();

export function useBonuses(filters = {}) {
  const [bonuses,  setBonuses]  = useState([]);
  const [stats,    setStats]    = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (filters.type)     params.type     = filters.type;
      if (filters.status)   params.status   = filters.status;
      if (filters.year)     params.year     = filters.year;
      if (filters.search)   params.search   = filters.search;
      if (filters.driverId) params.driver_id = filters.driverId;

      const [listRes, statsRes] = await Promise.all([
        accountantService.getBonuses(params),
        accountantService.getBonusStats(filters.year || currentYear),
      ]);
      setBonuses(listRes.bonuses ?? []);
      setStats(statsRes);
    } catch (err) {
      setError(err.message ?? "Lỗi tải dữ liệu");
    } finally {
      setLoading(false);
    }
  }, [filters.type, filters.status, filters.year, filters.search, filters.driverId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const payBonus = async (id) => {
    await accountantService.payBonus(id);
    await fetchAll();
  };

  return { bonuses, stats, loading, error, refresh: fetchAll, payBonus };
}
