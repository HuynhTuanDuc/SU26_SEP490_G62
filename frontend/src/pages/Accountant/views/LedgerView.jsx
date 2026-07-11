import { useState, useCallback, useEffect } from "react";
import {
  Button, Chip, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader,
  Select, SelectItem, Spinner, Input,
} from "@heroui/react";
import { RiDownloadLine, RiBookOpenLine } from "react-icons/ri";
import { accountantService } from "../services/accountant.service";
import { MoneyText } from "../components/shared/MoneyText";
import { PaginationBar } from "../components/shared/PaginationBar";

const fmtDateTime = (iso) =>
  iso ? new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }) : "—";

const EVENT_COLOR = {
  shipment_revenue:      "success",
  prepaid_received:      "success",
  cash_receipt:          "success",
  bank_receipt:          "success",
  customer_payment:      "success",
  driver_debt_paid:      "primary",
  driver_debt_created:   "warning",
  customer_debt_created: "warning",
  pass_through_cost:     "default",
  expense_recorded:      "danger",
  payroll_paid:          "danger",
  advance_disbursed:     "danger",
};

const DEFAULT_PAGE_SIZE = 20;

function ExportModal({ onClose, onExported }) {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = `${today.slice(0, 8)}01`;
  const [from, setFrom]       = useState(firstOfMonth);
  const [to, setTo]           = useState(today);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const handleExport = async () => {
    setLoading(true);
    setError(null);
    try {
      const csv = await accountantService.exportLedgerPeriod(from, to);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nhat-ky-tai-chinh_${from}_${to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      onExported();
    } catch (err) {
      setError(err.message ?? "Xuất kỳ kế toán thất bại");
      setLoading(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} size="md">
      <ModalContent>
        <ModalHeader className="flex items-center gap-2">
          <RiDownloadLine className="text-blue-600" size={18} />
          Xuất kỳ kế toán
        </ModalHeader>
        <ModalBody className="gap-4">
          <p className="text-sm text-gray-500">
            Xuất các bút toán <strong>chưa xuất</strong> trong kỳ đã chọn ra file CSV
            (dùng để import vào MISA hoặc phần mềm kế toán khác).
            Sau khi xuất, các bút toán được đánh dấu đã chốt và không xuất lại được.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Input type="date" label="Từ ngày" value={from} onChange={(e) => setFrom(e.target.value)} />
            <Input type="date" label="Đến ngày" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose} isDisabled={loading}>Hủy</Button>
          <Button color="primary" onPress={handleExport} isLoading={loading}>
            Xuất CSV và chốt kỳ
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export function LedgerView() {
  const [rows, setRows]           = useState([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [pageSize, setPageSize]   = useState(DEFAULT_PAGE_SIZE);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [eventTypes, setEventTypes] = useState({});

  const [filterEvent, setFilterEvent]       = useState("");
  const [filterFrom, setFilterFrom]         = useState("");
  const [filterTo, setFilterTo]             = useState("");
  const [filterExported, setFilterExported] = useState("");
  const [showExport, setShowExport]         = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { page, pageSize };
      if (filterEvent)    params.event_type = filterEvent;
      if (filterFrom)     params.from = filterFrom;
      if (filterTo)       params.to = filterTo;
      if (filterExported) params.exported = filterExported;
      const data = await accountantService.getLedger(params);
      setRows(data.transactions ?? []);
      setTotal(data.total ?? 0);
      if (data.eventTypes) setEventTypes(data.eventTypes);
    } catch (err) {
      setError(err.message ?? "Không tải được nhật ký tài chính");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filterEvent, filterFrom, filterTo, filterExported]);

  useEffect(() => { load(); }, [load]);

  const resetPageAnd = (setter) => (value) => { setPage(1); setter(value); };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Select
          label="Loại sự kiện"
          size="sm"
          className="w-56"
          selectedKeys={filterEvent ? [filterEvent] : []}
          onChange={(e) => resetPageAnd(setFilterEvent)(e.target.value)}
        >
          {Object.entries(eventTypes).map(([key, label]) => (
            <SelectItem key={key}>{label}</SelectItem>
          ))}
        </Select>
        <Input
          type="date" label="Từ ngày" size="sm" className="w-40"
          value={filterFrom}
          onChange={(e) => resetPageAnd(setFilterFrom)(e.target.value)}
        />
        <Input
          type="date" label="Đến ngày" size="sm" className="w-40"
          value={filterTo}
          onChange={(e) => resetPageAnd(setFilterTo)(e.target.value)}
        />
        <Select
          label="Trạng thái xuất"
          size="sm"
          className="w-44"
          selectedKeys={filterExported ? [filterExported] : []}
          onChange={(e) => resetPageAnd(setFilterExported)(e.target.value)}
        >
          <SelectItem key="pending">Chưa xuất</SelectItem>
          <SelectItem key="exported">Đã xuất</SelectItem>
        </Select>
        <div className="flex-1" />
        <Button
          color="primary"
          startContent={<RiDownloadLine size={16} />}
          onPress={() => setShowExport(true)}
        >
          Xuất kỳ kế toán
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Spinner /></div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
            <RiBookOpenLine size={32} />
            <p className="text-sm">Chưa có bút toán nào</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                  <th className="px-4 py-3 font-semibold">Thời điểm</th>
                  <th className="px-4 py-3 font-semibold">Sự kiện</th>
                  <th className="px-4 py-3 font-semibold">Diễn giải</th>
                  <th className="px-4 py-3 font-semibold text-center">TK Nợ / Có</th>
                  <th className="px-4 py-3 font-semibold text-right">Số tiền</th>
                  <th className="px-4 py-3 font-semibold">Người thực hiện</th>
                  <th className="px-4 py-3 font-semibold text-center">Xuất kỳ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">{fmtDateTime(r.occurred_at)}</td>
                    <td className="px-4 py-3">
                      <Chip size="sm" variant="flat" color={EVENT_COLOR[r.event_type] ?? "default"}>
                        {r.event_label}
                      </Chip>
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-md">{r.description ?? "—"}</td>
                    <td className="px-4 py-3 text-center whitespace-nowrap text-gray-500 font-mono text-xs">
                      {r.debit_account} / {r.credit_account}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      <MoneyText amount={r.amount} />
                    </td>
                    <td className="px-4 py-3 text-gray-600">{r.actor_name ?? "—"}</td>
                    <td className="px-4 py-3 text-center">
                      {r.exported_at ? (
                        <Chip size="sm" variant="flat" color="default" title={r.export_batch_id}>
                          {r.export_batch_id ?? "Đã xuất"}
                        </Chip>
                      ) : (
                        <Chip size="sm" variant="flat" color="warning">Chưa xuất</Chip>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PaginationBar
        page={page}
        pageSize={pageSize}
        totalItems={total}
        totalPages={Math.max(1, Math.ceil(total / pageSize))}
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPage(1); setPageSize(size); }}
      />

      {showExport && (
        <ExportModal
          onClose={() => setShowExport(false)}
          onExported={() => { setShowExport(false); load(); }}
        />
      )}
    </div>
  );
}
