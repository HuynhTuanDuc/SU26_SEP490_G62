import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Button, DatePicker, Select, Table, Tooltip, message } from "antd";
import { CloseOutlined, EyeOutlined, FileTextOutlined, ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { apiRequest } from "../../services/apiClient";
import ReceiptDetailModal from "./components/ReceiptDetailModal";
import StatusTag from "./components/StatusTag";
import {
  emptyReceiptForm,
  formatCurrency,
  formatNotificationTime,
  newReceiptExpense,
  normalizeStatus,
  resolveFareValue,
} from "./utils";

const { RangePicker } = DatePicker;

export default function ReceiptsPage({ search, refreshKey, onReceiptPublished }) {
  const [receiptRequests, setReceiptRequests] = useState([]);
  const [receiptRequestsLoading, setReceiptRequestsLoading] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [kindFilter, setKindFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [rejectingId, setRejectingId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(emptyReceiptForm);

  const deferredSearch = useDeferredValue(search);

  const loadReceiptRequests = async (page = pagination.page) => {
    setReceiptRequestsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pagination.limit),
      });
      if (kindFilter !== "all") params.set("kind", kindFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (deferredSearch.trim()) params.set("search", deferredSearch.trim());
      if (dateFromFilter) params.set("dateFrom", dateFromFilter);
      if (dateToFilter) params.set("dateTo", dateToFilter);

      const queryString = params.toString();
      const data = await apiRequest(`/api/coordinator/receipt-requests${queryString ? `?${queryString}` : ""}`);
      setReceiptRequests(data.requests || []);
      if (data.pagination) {
        setPagination(data.pagination);
      } else {
        setPagination({ page, limit: pagination.limit, total: data.requests?.length || 0, totalPages: 1 });
      }
    } catch (error) {
      message.error(error.message || "Không thể tải danh sách yêu cầu phiếu thu.");
    } finally {
      setReceiptRequestsLoading(false);
    }
  };

  useEffect(() => {
    loadReceiptRequests(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kindFilter, statusFilter, dateFromFilter, dateToFilter, deferredSearch, refreshKey]);

  const resetFilters = () => {
    setKindFilter("all");
    setStatusFilter("all");
    setDateFromFilter("");
    setDateToFilter("");
  };

  const closeModal = () => {
    setModalOpen(false);
    setDetail(null);
    setForm(emptyReceiptForm());
  };

  const openModal = async (requestId) => {
    setModalOpen(true);
    setDetailLoading(true);
    setDetail(null);

    try {
      const data = await apiRequest(`/api/coordinator/receipt-requests/${requestId}`);
      setDetail(data);
      setForm({
        notes: data?.request?.coordinator_notes || "",
        expenses: [],
      });
    } catch (error) {
      message.error(error.message || "Không thể tải chi tiết yêu cầu phiếu thu.");
      closeModal();
    } finally {
      setDetailLoading(false);
    }
  };

  const updateField = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const addExpense = () => setForm((current) => ({
    ...current,
    expenses: [...current.expenses, newReceiptExpense()],
  }));

  const updateExpense = (index, key, value) => setForm((current) => ({
    ...current,
    expenses: current.expenses.map((expense, expenseIndex) => (
      expenseIndex === index ? { ...expense, [key]: value } : expense
    )),
  }));

  const updateExpenseShipment = (index, value) => setForm((current) => ({
    ...current,
    expenses: current.expenses.map((expense, expenseIndex) => (
      expenseIndex === index ? { ...expense, shipment_id: value } : expense
    )),
  }));

  const removeExpense = (index) => setForm((current) => ({
    ...current,
    expenses: current.expenses.filter((_, expenseIndex) => expenseIndex !== index),
  }));

  const publishReceipt = async () => {
    if (!detail?.request?.id) return;

    setPublishing(true);
    try {
      const payload = {
        notes: form.notes,
        expenses: form.expenses
          .filter((expense) => String(expense.amount || "").trim() !== "")
          .map((expense) => ({
            expense_type: expense.expense_type,
            amount: Number(expense.amount),
            description: expense.description,
            shipment_id: expense.shipment_id || null,
          })),
      };

      const data = await apiRequest(`/api/coordinator/receipt-requests/${detail.request.id}/approve`, {
        method: "POST",
        body: payload,
      });

      message.success(data.message || "Đã tạo phiếu thu thành công.");
      closeModal();
      await loadReceiptRequests();
      onReceiptPublished?.();
    } catch (error) {
      message.error(error.message || "Không thể tạo phiếu thu.");
    } finally {
      setPublishing(false);
    }
  };

  const rejectReceiptRequest = async (requestId) => {
    const reason = window.prompt("Nhập lý do từ chối yêu cầu phiếu thu:");
    if (reason === null) return;

    setRejectingId(requestId);
    try {
      const data = await apiRequest(`/api/coordinator/receipt-requests/${requestId}/reject`, {
        method: "POST",
        body: { notes: reason.trim() },
      });
      message.success(data.message || "Đã từ chối yêu cầu phiếu thu.");
      await loadReceiptRequests();
    } catch (error) {
      message.error(error.message || "Không thể từ chối yêu cầu phiếu thu.");
    } finally {
      setRejectingId(null);
    }
  };

  const summary = useMemo(() => {
    const approved = receiptRequests.filter((item) => normalizeStatus(item.status) === "approved").length;
    const pending = receiptRequests.filter((item) => ["pending", "processing"].includes(normalizeStatus(item.status))).length;
    return { total: receiptRequests.length, approved, pending };
  }, [receiptRequests]);

  const columns = [
    {
      title: "Loại",
      dataIndex: "record_kind",
      key: "record_kind",
      render: (value) => <span className="receipt-table-kind">{value === "receipt" ? "Phiếu thu" : "Yêu cầu"}</span>,
    },
    { title: "Request", dataIndex: "id", key: "id", render: (value) => `#${value}` },
    { title: "Ngày", key: "date", render: (_, r) => formatNotificationTime(r.receipt_created_at || r.requested_at) },
    { title: "Đơn", dataIndex: "order_id", key: "order_id", render: (value) => `#${value}` },
    { title: "Chuyến", key: "shipment", render: (_, r) => (r.shipment_id ? `#${r.shipment_id}` : `${r.shipment_count || 0} chuyến`) },
    { title: "Khách hàng", dataIndex: "customer_name", key: "customer_name", render: (value) => value || "-" },
    { title: "Tài xế", dataIndex: "driver_name", key: "driver_name", render: (value) => value || "-" },
    { title: "KM thực tế", dataIndex: "total_actual_distance_km", key: "total_actual_distance_km", render: (value) => (Number(value || 0) > 0 ? `${value} km` : "-") },
    {
      title: "Số tiền",
      key: "amount",
      render: (_, r) => formatCurrency(r.record_kind === "receipt" ? r.receipt_amount : resolveFareValue(r.actual_price, r.estimated_price)),
    },
    { title: "Trạng thái", dataIndex: "status", key: "status", render: (value) => <StatusTag status={value} /> },
    {
      title: "Thao tác",
      key: "actions",
      render: (_, request) => {
        const status = normalizeStatus(request.status);
        if (status === "approved") {
          return (
            <Button className="coordinator-primary-btn" type="primary" icon={<EyeOutlined />} onClick={() => openModal(request.id)}>
              Xem phiếu thu
            </Button>
          );
        }
        if (status === "rejected") {
          return (
            <Tooltip title="Xem chi tiết">
              <Button className="coordinator-table-icon-btn" type="text" icon={<EyeOutlined />} onClick={() => openModal(request.id)} />
            </Tooltip>
          );
        }
        return (
          <div className="table-actions">
            <Button className="coordinator-primary-btn" type="primary" icon={<FileTextOutlined />} onClick={() => openModal(request.id)}>
              Tạo phiếu thu
            </Button>
            <Tooltip title="Từ chối yêu cầu">
              <Button
                className="coordinator-table-icon-btn coordinator-table-icon-btn-danger"
                type="text"
                danger
                loading={rejectingId === request.id}
                icon={rejectingId === request.id ? null : <CloseOutlined />}
                onClick={() => rejectReceiptRequest(request.id)}
              />
            </Tooltip>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <section className="hero hero-compact">
        <div>
          <h1>Quản lý phiếu thu</h1>
          <p>Theo dõi yêu cầu, phiếu thu đã tạo và lọc nhanh theo trạng thái, ngày và khách hàng.</p>
        </div>
        <div className="hero-metrics">
          <div className="upload-hint">{receiptRequestsLoading ? "Đang tải..." : `${summary.total} bản ghi`}</div>
          <div className="upload-hint">{summary.approved} phiếu thu đã tạo</div>
          <div className="upload-hint">{summary.pending} yêu cầu chờ xử lý</div>
        </div>
        <div className="filters order-filters receipt-filters">
          <label className="filter-field">
            <span>Loại</span>
            <Select
              style={{ width: "100%" }}
              value={kindFilter}
              onChange={setKindFilter}
              options={[
                { value: "all", label: "Tất cả" },
                { value: "requests", label: "Yêu cầu chờ xử lý" },
                { value: "receipts", label: "Phiếu thu đã tạo" },
                { value: "rejected", label: "Đã từ chối" },
              ]}
            />
          </label>
          <label className="filter-field">
            <span>Trạng thái</span>
            <Select
              style={{ width: "100%" }}
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: "all", label: "Tất cả" },
                { value: "pending", label: "Pending" },
                { value: "processing", label: "Processing" },
                { value: "approved", label: "Approved" },
                { value: "rejected", label: "Rejected" },
              ]}
            />
          </label>
          <label className="filter-field filter-field-daterange">
            <span>Khoảng ngày</span>
            <RangePicker
              value={[dateFromFilter ? dayjs(dateFromFilter) : null, dateToFilter ? dayjs(dateToFilter) : null]}
              onChange={(_, [from, to]) => {
                setDateFromFilter(from || "");
                setDateToFilter(to || "");
              }}
            />
          </label>
          <Button
            style={{ marginTop: 20 }}
            type="default"
            icon={<ReloadOutlined />}
            className="coordinator-secondary-btn"
            onClick={resetFilters}
          >
            Xóa lọc
          </Button>
        </div>
      </section>

      <section className="orders-panel">
        <div className="panel-head">
          <div>
            <h2>Yêu cầu &amp; phiếu thu</h2>
            <p>Tài xế gửi yêu cầu, coordinator xử lý và xem lại các phiếu thu đã tạo ngay tại đây.</p>
          </div>
        </div>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={receiptRequests}
          loading={receiptRequestsLoading}
          pagination={{
            current: pagination.page,
            pageSize: pagination.limit,
            total: pagination.total,
            showSizeChanger: false,
            onChange: (page) => loadReceiptRequests(page),
          }}
          locale={{ emptyText: "Không có bản ghi phù hợp với bộ lọc hiện tại." }}
          scroll={{ x: true }}
        />
      </section>

      <ReceiptDetailModal
        open={modalOpen}
        detail={detail}
        loading={detailLoading}
        form={form}
        publishing={publishing}
        onClose={closeModal}
        onPublish={publishReceipt}
        updateField={updateField}
        addExpense={addExpense}
        updateExpense={updateExpense}
        updateExpenseShipment={updateExpenseShipment}
        removeExpense={removeExpense}
      />
    </>
  );
}
