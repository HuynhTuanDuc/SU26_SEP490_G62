import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { ERROR_MESSAGES } from '@/constants/error-messages';
import { tripService } from '@/services/trip-service';
import type { OrderHistoryPagination, TripPoolItem, VehicleGroup } from '@/types/trip';

const LIMIT = 20;
const POLL_MS = 10_000;

type State = {
  trips: TripPoolItem[];
  vehicleGroups: VehicleGroup[];
  pagination: OrderHistoryPagination | null;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
};

export function useTripPool() {
  const [state, setState] = useState<State>({
    trips: [],
    vehicleGroups: [],
    pagination: null,
    isLoading: true,
    isLoadingMore: false,
    error: null,
  });
  const [groupFilter, setGroupFilter] = useState<number | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pageRef = useRef(1);
  const latestGroupFilter = useRef<number | null>(null);

  useEffect(() => {
    latestGroupFilter.current = groupFilter;
  }, [groupFilter]);

  const load = useCallback(async (page: number, showSpinner = true, append = false) => {
    const isFirstPage = page === 1;

    if (showSpinner && isFirstPage) {
      setState((current) => ({ ...current, isLoading: true, error: null }));
    } else if (append) {
      setState((current) => ({ ...current, isLoadingMore: true }));
    }

    try {
      const { trips, vehicleGroups, pagination } = await tripService.getPool(
        page,
        LIMIT,
        latestGroupFilter.current,
      );

      setState((current) => ({
        ...current,
        trips: append ? [...current.trips, ...(trips ?? [])] : (trips ?? []),
        vehicleGroups: vehicleGroups ?? current.vehicleGroups,
        pagination,
        isLoading: false,
        isLoadingMore: false,
        error: null,
      }));
      pageRef.current = page;
    } catch (error) {
      const message = error instanceof Error ? error.message : ERROR_MESSAGES.tripPoolLoadFailed;
      setState((current) => ({
        ...current,
        isLoading: false,
        isLoadingMore: false,
        ...(showSpinner ? { error: message } : {}),
      }));
    }
  }, []);

  const refresh = useCallback((showSpinner = true) => load(1, showSpinner, false), [load]);

  const loadMore = useCallback(() => {
    if (state.isLoading || state.isLoadingMore || !state.pagination) return;
    if (pageRef.current >= state.pagination.totalPages) return;
    load(pageRef.current + 1, false, true);
  }, [load, state.isLoading, state.isLoadingMore, state.pagination]);

  const removeOrder = useCallback((orderId: number) => {
    setState((current) => ({
      ...current,
      trips: current.trips.filter((trip) => trip.order_id !== orderId),
      pagination: current.pagination
        ? { ...current.pagination, total: Math.max(0, current.pagination.total - 1) }
        : current.pagination,
    }));
  }, []);

  const startPolling = useCallback(() => {
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = setInterval(() => refresh(false), POLL_MS);
  }, [refresh]);

  const stopPolling = useCallback(() => {
    if (!pollTimer.current) return;
    clearInterval(pollTimer.current);
    pollTimer.current = null;
  }, []);

  useEffect(() => {
    refresh(true);
  }, [groupFilter, refresh]);

  useEffect(() => {
    startPolling();
    return stopPolling;
  }, [startPolling, stopPolling]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') {
        refresh(false);
        startPolling();
      } else {
        stopPolling();
      }
    });

    return () => sub.remove();
  }, [refresh, startPolling, stopPolling]);

  const totalCount = state.pagination?.total ?? state.trips.length;
  const hasMore = state.pagination ? pageRef.current < state.pagination.totalPages : false;

  return {
    trips: state.trips,
    totalCount,
    vehicleGroups: state.vehicleGroups,
    groupFilter,
    setGroupFilter,
    pagination: state.pagination,
    isLoading: state.isLoading,
    isLoadingMore: state.isLoadingMore,
    hasMore,
    error: state.error,
    refresh,
    loadMore,
    removeOrder,
  };
}
