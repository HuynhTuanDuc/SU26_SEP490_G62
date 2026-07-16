import { useState, useEffect, useCallback } from "react";
import { accountantService } from "../services/accountant.service";

const currentYear = new Date().getFullYear();

export function useBonuses(filters = {}) {
  const [bonuses,  setBonuses]  = useState([]);
  const [stats,    setStats]    = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 10, totalPages: 1 });

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
      params.page  = filters.page  || 1;
      params.limit = filters.limit || 10;

      const [listRes, statsRes] = await Promise.all([
        accountantService.getBonuses(params),
        accountantService.getBonusStats(filters.year || currentYear),
      ]);
      setBonuses(listRes.bonuses ?? []);
      setStats(statsRes);
      setPagination(listRes.pagination ?? { total: (listRes.bonuses ?? []).length, page: 1, limit: params.limit, totalPages: 1 });
    } catch (err) {
      setError(err.message ?? "Lỗi tải dữ liệu");
    } finally {
      setLoading(false);
    }
  }, [filters.type, filters.status, filters.year, filters.search, filters.driverId, filters.page, filters.limit]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const payBonus = async (id) => {
    await accountantService.payBonus(id);
    await fetchAll();
  };

  return { bonuses, stats, loading, error, pagination, refresh: fetchAll, payBonus };
}
