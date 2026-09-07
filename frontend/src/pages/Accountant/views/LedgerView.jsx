import { useState, useCallback, useEffect } from "react";
import {
  Button, Chip, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader,
  Select, SelectItem, Spinner, Input,
} from "@heroui/react";
import {
  RiDownloadLine, RiBookOpenLine,
  RiPriceTag3Line, RiFileTransferLine, RiSortDesc,
} from "react-icons/ri";

const ic = (Icon) => <Icon size={16} className="text-gray-400 dark:text-gray-400 shrink-0" />;
import { accountantService } from "../services/accountant.service";
import { MoneyText } from "../components/shared/MoneyText";
import { PaginationBar } from "../components/shared/PaginationBar";
import { exportLedgerCsvToExcel } from "../utils/exportLedgerReport";
import { notify } from "../../../components/shared-ui/Toast";

const fmtDateTime = (iso) =>
  iso ? new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }) : "—";

const EVENT_COLOR = {
  shipment_revenue:      "success",
  prepaid_received:      "success",
  prepaid_refunded:      "warning",
  cash_receipt:          "success",
  bank_receipt:          "success",
  customer_payment:      "success",
  driver_debt_paid:      "primary",
  driver_debt_created:   "warning",
  customer_debt_created: "warning",
  pass_through_cost:     "default",
  // Cùng màu hổ phách với dòng "thu hộ (giữ hộ khách)" ở màn Doanh thu — người đọc
  // nhận ra ngay đây là tiền của khách chứ không phải tiền công ty.
  collect_on_behalf_held: "warning",
  collect_on_behalf_returned: "primary",
  expense_recorded:      "danger",
  // Tất toán khoản phải trả tài xế — không phải chi phí phát sinh mới (đã ghi lúc duyệt)
  expense_reimbursed:    "primary",
  payroll_paid:          "danger",
  bonus_paid:            "danger",
  advance_disbursed:     "danger",
  advance_recovered:     "primary",
  debt_transferred:      "warning",
  opening_balance:       "default",
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

      // Khối định danh đơn vị ở đầu biểu mẫu. Không lấy được thì vẫn xuất — biểu mẫu
      // in ra các dòng chấm để điền tay, còn hơn là chặn kế toán không chốt được kỳ.
      const company = await accountantService.getCompanyInfo().catch(() => null);

      await exportLedgerCsvToExcel(csv, { from, to, company: company?.info ?? {} });
      onExported();
      notify.success("Đã xuất kỳ kế toán.");
    } catch (err) {
      setError(err.message ?? "Xuất Excel kỳ kế toán thất bại");
      notify.error(err.message ?? "Xuất Excel kỳ kế toán thất bại");
      setLoading(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} size="md">
      <ModalContent>
        <ModalHeader className="flex items-center gap-2">
          <RiDownloadLine className="text-blue-600 dark:text-blue-300" size={18} />
          Xuất kỳ kế toán
        </ModalHeader>
        <ModalBody className="gap-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Xuất các bút toán <strong>chưa xuất</strong> trong kỳ đã chọn ra file Excel
            có định dạng sẵn: tiêu đề, bộ lọc, cột tiền, ngày phát sinh và dòng tổng cộng.
            Sau khi xuất, các bút toán được đánh dấu đã chốt và không xuất lại được.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Input type="date" label="Từ ngày" value={from} onChange={(e) => setFrom(e.target.value)} />
            <Input type="date" label="Đến ngày" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-300">{error}</p>}
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose} isDisabled={loading}>Hủy</Button>
          <Button color="primary" onPress={handleExport} isLoading={loading}>
            Xuất Excel và chốt kỳ
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
  const [sortBy, setSortBy]                 = useState("");
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
      if (sortBy)         params.sort = sortBy;
      const data = await accountantService.getLedger(params);
      setRows(data.transactions ?? []);
      setTotal(data.total ?? 0);
      if (data.eventTypes) setEventTypes(data.eventTypes);
    } catch (err) {
      setError(err.message ?? "Không tải được nhật ký tài chính");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filterEvent, filterFrom, filterTo, filterExported, sortBy]);

  useEffect(() => { load(); }, [load]);

  const resetPageAnd = (setter) => (value) => { setPage(1); setter(value); };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Select
          label="Loại sự kiện"
          size="sm"
          className="w-56"
          startContent={ic(RiPriceTag3Line)}
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
          startContent={ic(RiFileTransferLine)}
          selectedKeys={filterExported ? [filterExported] : []}
          onChange={(e) => resetPageAnd(setFilterExported)(e.target.value)}
        >
          <SelectItem key="pending">Chưa xuất</SelectItem>
          <SelectItem key="exported">Đã xuất</SelectItem>
        </Select>
        <Select
          label="Sắp xếp"
          size="sm"
          variant="bordered"
          className="w-52"
          startContent={ic(RiSortDesc)}
          selectedKeys={new Set([sortBy])}
          onChange={(e) => resetPageAnd(setSortBy)(e.target.value)}
        >
          <SelectItem key="" textValue="Mới nhất">Mới nhất</SelectItem>
          <SelectItem key="oldest" textValue="Cũ nhất">Cũ nhất</SelectItem>
          <SelectItem key="amount-desc" textValue="Số tiền cao nhất">Số tiền cao nhất</SelectItem>
          <SelectItem key="amount-asc" textValue="Số tiền thấp nhất">Số tiền thấp nhất</SelectItem>
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
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/25 text-red-700 dark:text-red-300 text-sm rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      <div className="bg-white dark:bg-[#161922] rounded-2xl border border-gray-200 dark:border-white/10 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Spinner /></div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-400 gap-2">
            <RiBookOpenLine size={32} />
            <p className="text-sm">Chưa có bút toán nào</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-white/5 text-left text-xs text-gray-500 dark:text-gray-400 uppercase">
                  <th className="px-4 py-3 font-semibold">Thời điểm</th>
                  <th className="px-4 py-3 font-semibold">Sự kiện</th>
                  <th className="px-4 py-3 font-semibold">Diễn giải</th>
                  <th className="px-4 py-3 font-semibold text-center">TK Nợ / Có</th>
                  <th className="px-4 py-3 font-semibold text-right">Số tiền</th>
                  <th className="px-4 py-3 font-semibold">Người thực hiện</th>
                  <th className="px-4 py-3 font-semibold text-center">Xuất kỳ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/10">
                {rows.map((r) => (
                  <tr key={r.id} className={`hover:bg-gray-50 dark:hover:bg-white/5 ${r.reversal_of_id || r.reversed_by_id ? "bg-orange-50/40 dark:bg-orange-500/10" : ""}`}>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600 dark:text-gray-300">{fmtDateTime(r.occurred_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <Chip size="sm" variant="flat" color={EVENT_COLOR[r.event_type] ?? "default"}>
                          {r.event_label}
                        </Chip>
                        {r.reversal_of_id && (
                          <Chip size="sm" variant="flat" color="warning" className="text-[10px]">
                            BT đảo của #{r.reversal_of_id}
                          </Chip>
                        )}
                        {r.reversed_by_id && (
                          <Chip size="sm" variant="flat" color="danger" className="text-[10px]">
                            Đã bị đảo (#{r.reversed_by_id})
                          </Chip>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-200 max-w-md">{r.description ?? "—"}</td>
                    <td className="px-4 py-3 text-center whitespace-nowrap text-gray-500 dark:text-gray-400 font-mono text-xs">
                      {r.debit_account} / {r.credit_account}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      <MoneyText amount={r.amount} />
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{r.actor_name ?? "—"}</td>
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
