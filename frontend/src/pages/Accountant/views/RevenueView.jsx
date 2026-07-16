import { useState, useCallback, useEffect } from "react";
import { StatsGrid } from "../components/revenue/StatsGrid";
import { FilterBar } from "../components/revenue/FilterBar";
import { OrdersTable } from "../components/revenue/OrdersTable";
import { PaymentModal } from "../modals/PaymentModal";
import { OrderDetailModal } from "../modals/OrderDetailModal";
import { useFinanceStats } from "../hooks/useFinanceStats";
import { useOrders } from "../hooks/useOrders";
import { useShipments } from "../hooks/useShipments";

export function RevenueView({ refreshKey = 0, search = "" }) {
  const { stats, loading: statsLoading, refetch: refetchStats } = useFinanceStats();
  const {
    orders, loading: ordersLoading,
    onSearchChange,
    debtFilter, setDebtFilter,
    dateFrom, setDateFrom,
    dateTo, setDateTo,
    customer, setCustomer,
    sort, setSort,
    page, setPage,
    pageSize, setPageSize,
    meta,
    refetch: refetchOrders,
  } = useOrders();

  const { shipmentCache, isLoadingShipments, fetchShipments } = useShipments();

  useEffect(() => {
    onSearchChange(search);

  }, [search]);

  useEffect(() => {
    if (refreshKey > 0) {
      refetchOrders();
      refetchStats();
    }

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
        dateFrom={dateFrom}
        onDateFromChange={setDateFrom}
        dateTo={dateTo}
        onDateToChange={setDateTo}
        customer={customer}
        onCustomerChange={setCustomer}
        sort={sort}
        onSortChange={setSort}
      />

      <OrdersTable
        orders={orders}
        loading={ordersLoading}
        page={page}
        pageSize={pageSize}
        meta={meta}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
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
