import { useState, useEffect, useCallback, useRef } from "react";
import { accountantService } from "../services/accountant.service";

export function useOrders() {
  const [orders, setOrders]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [debtFilter, setDebtFilter] = useState("all");
  const [page, setPage]             = useState(1);
  const [pageSize, setPageSize]     = useState(10);
  const [meta, setMeta]             = useState({ totalPages: 1, totalItems: 0 });

  const searchTimerRef = useRef(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const handleSearchChange = useCallback((value) => {
    setSearch(value);
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 400);
  }, []);

  const fetchOrders = useCallback(async (pageNum) => {
    setLoading(true);
    try {
      const params = { page: pageNum, limit: pageSize };
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      if (debtFilter !== "all") params.debt_status = debtFilter;

      const data = await accountantService.getOrders(params);
      setOrders(data.orders ?? []);
      setMeta({
        totalPages: data.totalPages ?? 1,
        totalItems: data.totalItems ?? 0,
      });
    } catch (err) {
      console.error("useOrders:", err);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, debtFilter, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, debtFilter]);

  useEffect(() => {
    fetchOrders(page);
  }, [page, fetchOrders]);

  const handleSetPageSize = useCallback((size) => {
    setPageSize(size);
    setPage(1);
  }, []);

  const refetch = useCallback(() => fetchOrders(page), [fetchOrders, page]);

  return {
    orders,
    loading,
    search,
    onSearchChange: handleSearchChange,
    debtFilter,
    setDebtFilter: (v) => { setDebtFilter(v); setPage(1); },
    page,
    setPage,
    pageSize,
    setPageSize: handleSetPageSize,
    meta,
    refetch,
  };
}
