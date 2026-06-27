import { useState, useCallback, useEffect } from "react";
import { StatsGrid } from "../components/revenue/StatsGrid";
import { FilterBar } from "../components/revenue/FilterBar";
import { OrdersTable } from "../components/revenue/OrdersTable";
import { PaymentModal } from "../modals/PaymentModal";
import { OrderDetailModal } from "../modals/OrderDetailModal";
import { useFinanceStats } from "../hooks/useFinanceStats";
import { useOrders } from "../hooks/useOrders";
import { useShipments } from "../hooks/useShipments";

/**
 * @param {{ refreshKey: number, search: string }} props
 */
export function RevenueView({ refreshKey = 0, search = "" }) {
  const { stats, loading: statsLoading, refetch: refetchStats } = useFinanceStats();
  const {
    orders, loading: ordersLoading,
    onSearchChange,
    debtFilter, setDebtFilter,
    page, setPage, meta,
    refetch: refetchOrders,
  } = useOrders();

  const { shipmentCache, isLoadingShipments, fetchShipments } = useShipments();

  // Sync external search → hook's search state
  useEffect(() => {
    onSearchChange(search);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    if (refreshKey > 0) {
      refetchOrders();
      refetchStats();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const [paymentOrder, setPaymentOrder] = useState(null);
  const [detailOrder, setDetailOrder]   = useState(null);

  const handleExpandOrder = useCallback((order) => {
    fetchShipments(order.id);
  }, [fetchShipments]);

  const handlePaymentRecorded = useCallback(() => {
    refetchOrders();
    refetchStats();
  }, [refetchOrders, refetchStats]);

  return (
    <div className="flex flex-col gap-5">
      <StatsGrid stats={stats} loading={statsLoading} />

      <FilterBar
        activeFilter={debtFilter}
        onFilterChange={setDebtFilter}
        totalItems={meta.totalItems}
      />

      <OrdersTable
        orders={orders}
        loading={ordersLoading}
        page={page}
        meta={meta}
        onPageChange={setPage}
        shipmentCache={shipmentCache}
        isLoadingShipments={isLoadingShipments}
        onExpandOrder={handleExpandOrder}
        onPayment={setPaymentOrder}
        onDetail={setDetailOrder}
      />

      <PaymentModal
        isOpen={!!paymentOrder}
        onClose={() => setPaymentOrder(null)}
        order={paymentOrder}
        onPaymentRecorded={handlePaymentRecorded}
      />

      <OrderDetailModal
        isOpen={!!detailOrder}
        onClose={() => setDetailOrder(null)}
        order={detailOrder}
      />
    </div>
  );
}
