import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  Button, Select, SelectItem, Input, Spinner,
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
} from "@heroui/react";
import { RiRefreshLine, RiEyeLine, RiFileEditLine, RiForbidLine } from "react-icons/ri";
import { StatusBadge } from "../../../components/shared-ui/StatusBadge";
import ReceiptDetailModal from "../modals/ReceiptDetailModal";
import { coordinatorService } from "../services/coordinator.service";
import {
  emptyReceiptForm, formatCurrency, formatNotificationTime,
  newReceiptExpense, normalizeStatus, resolveFareValue,
} from "../utils";

export default function ReceiptsView({ search, refreshKey, onReceiptPublished }) {
  const [receiptRequests, setReceiptRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [kindFilter, setKindFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");
  const [sortBy, setSortBy] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [rejectingId, setRejectingId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(emptyReceiptForm);

  const deferredSearch = useDeferredValue(search);

  const loadReceiptRequests = async (page = pagination.page) => {
    setLoading(true);
    try {
      const params = { page: String(page), limit: String(pagination.limit) };
      if (kindFilter !== "all") params.kind = kindFilter;
      if (statusFilter !== "all") params.status = statusFilter;
      if (deferredSearch?.trim()) params.search = deferredSearch.trim();
      if (dateFromFilter) params.dateFrom = dateFromFilter;
      if (dateToFilter) params.dateTo = dateToFilter;
      if (sortBy) params.sort = sortBy;

      const data = await coordinatorService.getReceiptRequests(params);
      setReceiptRequests(data.requests || []);
      setPagination(data.pagination || { page, limit: pagination.limit, total: data.requests?.length || 0, totalPages: 1 });
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReceiptRequests(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kindFilter, statusFilter, dateFromFilter, dateToFilter, sortBy, deferredSearch, refreshKey]);

  const resetFilters = () => {
    setKindFilter("all");
    setStatusFilter("all");
    setDateFromFilter("");
    setDateToFilter("");
    setSortBy("");
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
      const data = await coordinatorService.getReceiptRequestDetail(requestId);
      setDetail(data);
      setForm({ notes: data?.request?.coordinator_notes || "", expenses: [] });
    } catch (error) {
      alert(error.message || "Không thể tải chi tiết yêu cầu phiếu thu.");
      closeModal();
    } finally {
      setDetailLoading(false);
    }
  };

  const updateField = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const addExpense = () => setForm((current) => ({ ...current, expenses: [...current.expenses, newReceiptExpense()] }));
  const updateExpense = (index, key, value) => setForm((current) => ({
    ...current,
    expenses: current.expenses.map((expense, i) => (i === index ? { ...expense, [key]: value } : expense)),
  }));
  const updateExpenseShipment = (index, value) => setForm((current) => ({
    ...current,
    expenses: current.expenses.map((expense, i) => (i === index ? { ...expense, shipment_id: value } : expense)),
  }));
  const removeExpense = (index) => setForm((current) => ({
    ...current,
    expenses: current.expenses.filter((_, i) => i !== index),
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
      await coordinatorService.approveReceiptRequest(detail.request.id, payload);
      closeModal();
      await loadReceiptRequests();
      onReceiptPublished?.();
    } catch (error) {
      alert(error.message || "Không thể tạo phiếu thu.");
    } finally {
      setPublishing(false);
    }
  };

  const rejectReceiptRequest = async (requestId) => {
    const reason = window.prompt("Nhập lý do từ chối yêu cầu phiếu thu:");
    if (reason === null) return;
    setRejectingId(requestId);
    try {
      await coordinatorService.rejectReceiptRequest(requestId, reason.trim());
      await loadReceiptRequests();
    } catch (error) {
      alert(error.message || "Không thể từ chối yêu cầu phiếu thu.");
    } finally {
      setRejectingId(null);
    }
  };

  const summary = useMemo(() => {
    const approved = receiptRequests.filter((item) => normalizeStatus(item.status) === "approved").length;
    const pending = receiptRequests.filter((item) => ["pending", "processing"].includes(normalizeStatus(item.status))).length;
    return { total: receiptRequests.length, approved, pending };
  }, [receiptRequests]);

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-wrap items-end gap-3">
        <Select label="Loại" selectedKeys={[kindFilter]} onSelectionChange={(keys) => setKindFilter([...keys][0])} variant="bordered" size="sm" className="w-48">
          <SelectItem key="all">Tất cả</SelectItem>
          <SelectItem key="requests">Yêu cầu chờ xử lý</SelectItem>
          <SelectItem key="receipts">Phiếu thu đã tạo</SelectItem>
          <SelectItem key="rejected">Đã từ chối</SelectItem>
        </Select>
        <Select label="Trạng thái" selectedKeys={[statusFilter]} onSelectionChange={(keys) => setStatusFilter([...keys][0])} variant="bordered" size="sm" className="w-44">
          <SelectItem key="all">Tất cả</SelectItem>
          <SelectItem key="pending">Chờ duyệt</SelectItem>
          <SelectItem key="processing">Đang xử lý</SelectItem>
          <SelectItem key="approved">Đã duyệt</SelectItem>
          <SelectItem key="rejected">Đã từ chối</SelectItem>
        </Select>
        <Input type="date" label="Từ ngày" value={dateFromFilter} onValueChange={setDateFromFilter} variant="bordered" size="sm" className="w-40" />
        <Input type="date" label="Đến ngày" value={dateToFilter} onValueChange={setDateToFilter} variant="bordered" size="sm" className="w-40" />
        <Select label="Sắp xếp" selectedKeys={new Set([sortBy])} onSelectionChange={(keys) => setSortBy([...keys][0] ?? "")} variant="bordered" size="sm" className="w-48">
          <SelectItem key="" textValue="Mới nhất">Mới nhất</SelectItem>
          <SelectItem key="amount-desc" textValue="Số tiền cao nhất">Số tiền cao nhất</SelectItem>
          <SelectItem key="amount-asc" textValue="Số tiền thấp nhất">Số tiền thấp nhất</SelectItem>
        </Select>
        <Button variant="flat" size="sm" startContent={<RiRefreshLine size={14} />} onPress={resetFilters}>Xóa lọc</Button>
        <div className="ml-auto text-xs text-gray-400">
          {summary.total} bản ghi · {summary.approved} đã tạo · {summary.pending} chờ xử lý
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <div className="text-sm font-bold text-gray-800">Yêu cầu & phiếu thu</div>
            <div className="text-xs text-gray-400">Tài xế gửi yêu cầu, coordinator xử lý và xem lại các phiếu thu đã tạo ngay tại đây.</div>
          </div>
        </div>

        <Table
          removeWrapper
          aria-label="Danh sách yêu cầu phiếu thu"
          classNames={{ th: "px-4 first:pl-5 last:pr-5", td: "px-4 py-3 first:pl-5 last:pr-5" }}
          bottomContent={
            pagination.totalPages > 1 ? (
              <div className="flex justify-center py-3">
                <div className="flex gap-1">
                  {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      onClick={() => loadReceiptRequests(p)}
                      className={`w-7 h-7 rounded-lg text-xs font-medium ${p === pagination.page ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-100"}`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            ) : null
          }
        >
          <TableHeader>
            <TableColumn>LOẠI</TableColumn>
            <TableColumn>NGÀY</TableColumn>
            <TableColumn>ĐƠN</TableColumn>
            <TableColumn>CHUYẾN</TableColumn>
            <TableColumn>KHÁCH HÀNG</TableColumn>
            <TableColumn>TÀI XẾ</TableColumn>
            <TableColumn>SỐ TIỀN</TableColumn>
            <TableColumn>TRẠNG THÁI</TableColumn>
            <TableColumn> </TableColumn>
          </TableHeader>
          <TableBody
            items={receiptRequests}
            isLoading={loading}
            loadingContent={<Spinner color="primary" />}
            emptyContent="Không có bản ghi phù hợp với bộ lọc hiện tại."
          >
            {(request) => {
              const status = normalizeStatus(request.status);
              return (
                <TableRow key={request.id}>
                  <TableCell>{request.record_kind === "receipt" ? "Phiếu thu" : "Yêu cầu"}</TableCell>
                  <TableCell>{formatNotificationTime(request.receipt_created_at || request.requested_at)}</TableCell>
                  <TableCell>#{request.order_id}</TableCell>
                  <TableCell>{request.shipment_id ? `#${request.shipment_id}` : `${request.shipment_count || 0} chuyến`}</TableCell>
                  <TableCell>{request.customer_name || "-"}</TableCell>
                  <TableCell>{request.driver_name || "-"}</TableCell>
                  <TableCell>{formatCurrency(request.record_kind === "receipt" ? request.receipt_amount : resolveFareValue(request.actual_price, request.estimated_price))}</TableCell>
                  <TableCell><StatusBadge status={request.status} /></TableCell>
                  <TableCell>
                    {status === "approved" ? (
                      <Button isIconOnly size="sm" variant="flat" color="primary" title="Xem phiếu thu" onPress={() => openModal(request.id)}><RiEyeLine size={16} /></Button>
                    ) : status === "rejected" ? (
                      <Button isIconOnly size="sm" variant="light" title="Xem chi tiết" onPress={() => openModal(request.id)}><RiEyeLine size={16} /></Button>
                    ) : (
                      <div className="flex gap-1 justify-end">
                        <Button isIconOnly size="sm" variant="flat" color="primary" title="Tạo phiếu thu" onPress={() => openModal(request.id)}>
                          <RiFileEditLine size={16} />
                        </Button>
                        <Button
                          isIconOnly
                          size="sm"
                          variant="flat"
                          color="danger"
                          title="Từ chối yêu cầu"
                          isLoading={rejectingId === request.id}
                          onPress={() => rejectReceiptRequest(request.id)}
                        >
                          <RiForbidLine size={16} />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            }}
          </TableBody>
        </Table>
      </div>

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
    </div>
  );
}
