import { useCallback, useEffect, useState } from "react";
import { Button, Input, Select, SelectItem, Spinner, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell } from "@heroui/react";
import { RiSearchLine, RiRefreshLine, RiCheckLine } from "react-icons/ri";
import { StatCard } from "../../../components/shared-ui/StatCard";
import { StatusBadge } from "../../../components/shared-ui/StatusBadge";
import { managerService } from "../services/manager.service";

const fmt = (v) => new Intl.NumberFormat("vi-VN").format(Number(v || 0)) + "đ";

const net = (r) =>
  (r.base_salary || 0) + (r.revenue_bonus || 0) + (r.kpi_bonus || 0) + (r.top_driver_bonus || 0) + (r.other_bonus || 0)
  - (r.insurance_employee || 0) - (r.driver_debt_deduction || 0) - (r.advance_deduction || 0) - (r.other_deduction || 0);

const PAYROLL_STATUS_LABELS = {
  pending: "Chờ xác nhận",
  reviewed: "Đã xác nhận",
  approved: "Đã duyệt",
  paid: "Đã chi",
};

const NOW = new Date();
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const YEARS = [NOW.getFullYear(), NOW.getFullYear() - 1, NOW.getFullYear() - 2];

export default function PayrollView() {
  const [payrolls, setPayrolls] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState(NOW.getMonth() + 1);
  const [year, setYear] = useState(NOW.getFullYear());
  const [status, setStatus] = useState("");
  const [reviewing, setReviewing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await managerService.getPayrolls({ month, year, ...(status ? { status } : {}), ...(search ? { search } : {}) });
      setPayrolls(res.payrolls || []);
    } catch (e) {
      alert(e.message || "Lỗi tải bảng lương");
    } finally {
      setLoading(false);
    }
  }, [month, year, status, search]);

  useEffect(() => { load(); }, [load]);

  const handleReview = async (record) => {
    setReviewing(record.id);
    try {
      await managerService.reviewPayroll(record.id);
      load();
    } catch (e) {
      alert(e.message || "Lỗi xác nhận");
    } finally {
      setReviewing(null);
    }
  };

  const pending = payrolls.filter((p) => p.status === "pending").length;
  const reviewed = payrolls.filter((p) => p.status === "reviewed").length;
  const totalNet = payrolls.reduce((s, r) => s + net(r), 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Tổng bảng lương" value={payrolls.length} border="border-gray-100" lightBg="bg-gray-50" text="text-gray-700" gradient="from-gray-400 to-gray-500" />
        <StatCard label="Chờ xác nhận" value={pending} border="border-amber-100" lightBg="bg-amber-50" text="text-amber-600" gradient="from-amber-500 to-amber-600" />
        <StatCard label="Đã xác nhận" value={reviewed} border="border-blue-100" lightBg="bg-blue-50" text="text-blue-600" gradient="from-blue-500 to-blue-600" />
        <StatCard label="Tổng thực lĩnh" value={fmt(totalNet)} border="border-emerald-100" lightBg="bg-emerald-50" text="text-emerald-600" gradient="from-emerald-500 to-emerald-600" />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <Select selectedKeys={[String(month)]} onSelectionChange={(k) => setMonth(Number([...k][0]))} variant="bordered" size="sm" className="w-28">
            {MONTHS.map((m) => <SelectItem key={String(m)}>{`Tháng ${m}`}</SelectItem>)}
          </Select>
          <Select selectedKeys={[String(year)]} onSelectionChange={(k) => setYear(Number([...k][0]))} variant="bordered" size="sm" className="w-24">
            {YEARS.map((y) => <SelectItem key={String(y)}>{String(y)}</SelectItem>)}
          </Select>
          <Select
            selectedKeys={status ? [status] : []}
            onSelectionChange={(k) => setStatus([...k][0] ?? "")}
            placeholder="Tất cả trạng thái"
            variant="bordered"
            size="sm"
            className="w-44"
          >
            <SelectItem key="pending">Chờ xác nhận</SelectItem>
            <SelectItem key="reviewed">Đã xác nhận</SelectItem>
            <SelectItem key="approved">Đã duyệt</SelectItem>
            <SelectItem key="paid">Đã chi</SelectItem>
          </Select>
          <Input
            placeholder="Tìm tài xế..."
            value={search}
            onValueChange={setSearch}
            startContent={<RiSearchLine size={14} className="text-gray-400" />}
            variant="bordered"
            size="sm"
            className="w-56"
            isClearable
          />
          <Button variant="flat" size="sm" startContent={<RiRefreshLine size={14} />} onPress={load}>Làm mới</Button>
        </div>

        <Table removeWrapper aria-label="Bảng lương tài xế" classNames={{ th: "px-4 first:pl-5 last:pr-5", td: "px-4 py-3 first:pl-5 last:pr-5" }}>
          <TableHeader>
            <TableColumn>TÀI XẾ</TableColumn>
            <TableColumn>KỲ LƯƠNG</TableColumn>
            <TableColumn>LƯƠNG CƠ BẢN</TableColumn>
            <TableColumn>THƯỞNG</TableColumn>
            <TableColumn>KHẤU TRỪ</TableColumn>
            <TableColumn>THỰC LĨNH</TableColumn>
            <TableColumn>TRẠNG THÁI</TableColumn>
            <TableColumn> </TableColumn>
          </TableHeader>
          <TableBody
            items={payrolls}
            isLoading={loading}
            loadingContent={<Spinner color="primary" />}
            emptyContent="Không có bảng lương nào."
          >
            {(r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-semibold text-gray-800 text-sm">{r.full_name}</span>
                    <span className="text-xs text-gray-400">{r.phone}</span>
                  </div>
                </TableCell>
                <TableCell>{`T${r.payroll_month}/${r.payroll_year}`}</TableCell>
                <TableCell>{fmt(r.base_salary)}</TableCell>
                <TableCell>{fmt((r.revenue_bonus || 0) + (r.kpi_bonus || 0) + (r.top_driver_bonus || 0) + (r.other_bonus || 0))}</TableCell>
                <TableCell>{fmt((r.insurance_employee || 0) + (r.driver_debt_deduction || 0) + (r.advance_deduction || 0) + (r.other_deduction || 0))}</TableCell>
                <TableCell><span className="font-bold text-blue-600">{fmt(net(r))}</span></TableCell>
                <TableCell><StatusBadge status={r.status}>{PAYROLL_STATUS_LABELS[r.status] || r.status}</StatusBadge></TableCell>
                <TableCell>
                  {r.status === "pending" && (
                    <Button size="sm" color="primary" startContent={<RiCheckLine size={14} />} isLoading={reviewing === r.id} onPress={() => handleReview(r)}>
                      Xác nhận
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
