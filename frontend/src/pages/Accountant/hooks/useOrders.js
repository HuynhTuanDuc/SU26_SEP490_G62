import { useState, useEffect, useCallback, useRef } from "react";
import { accountantService } from "../services/accountant.service";

export function useOrders() {
  const [orders, setOrders]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [debtFilter, setDebtFilter] = useState("all");
  const [dateFrom, setDateFrom]     = useState("");
  const [dateTo, setDateTo]         = useState("");
  const [customer, setCustomer]     = useState("");
  const [sort, setSort]             = useState("newest");
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
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      if (customer.trim()) params.customer = customer.trim();
      if (sort !== "newest") params.sort = sort;

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
  }, [debouncedSearch, debtFilter, dateFrom, dateTo, customer, sort, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, debtFilter, dateFrom, dateTo, customer, sort]);

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
    dateFrom,
    setDateFrom: (v) => { setDateFrom(v); setPage(1); },
    dateTo,
    setDateTo: (v) => { setDateTo(v); setPage(1); },
    customer,
    setCustomer: (v) => { setCustomer(v); setPage(1); },
    sort,
    setSort: (v) => { setSort(v); setPage(1); },
    page,
    setPage,
    pageSize,
    setPageSize: handleSetPageSize,
    meta,
    refetch,
  };
}
