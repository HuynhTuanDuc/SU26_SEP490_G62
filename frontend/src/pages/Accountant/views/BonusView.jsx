import { useEffect, useState } from "react";
import {
  Button, Chip, Modal, ModalContent, ModalHeader,
  ModalBody, ModalFooter, Spinner, Select, SelectItem,
  Tabs, Tab, Input, NumberInput, Textarea,
} from "@heroui/react";
import { RiAddLine } from "react-icons/ri";
import { useBonuses } from "../hooks/useBonuses";
import { accountantService } from "../services/accountant.service";
import { PaginationBar } from "../components/shared/PaginationBar";

const TYPE_LABEL = {
  tet_annual:       "Thưởng Tết",
  welfare_wedding:  "Hỗ trợ kết hôn",
  welfare_funeral:  "Hỗ trợ tang gia",
  welfare_birthday: "Thưởng sinh nhật",
  holiday_overtime: "Thưởng ngày lễ",
  special:          "Thưởng đặc biệt",
};

const STATUS_COLOR = {
  pending:  "warning",
  approved: "primary",
  paid:     "success",
  rejected: "danger",
};
const STATUS_LABEL = {
  pending:  "Chờ duyệt",
  approved: "Đã duyệt",
  paid:     "Đã chi",
  rejected: "Từ chối",
};

const ROLE_LABEL = {
  driver:      "Tài xế",
  coordinator: "Điều phối",
  accountant:  "Kế toán",
  manager:     "Quản lý",
};

const RELATION_LABEL = {
  self:          "Bản thân",
  spouse:        "Vợ/Chồng",
  parent:        "Cha/Mẹ",
  parent_in_law: "Bố/Mẹ vợ chồng",
  child:         "Con",
};

const fmt = (n) =>
  n == null ? "—" : Number(n).toLocaleString("vi-VN") + "đ";

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => currentYear - i);

const WELFARE_AMOUNT = { welfare_birthday: 200_000, welfare_wedding: 1_000_000 };
const EMPTY_CREATE_FORM = { driver_id: "", type: "", year: currentYear, beneficiary_name: "", beneficiary_relation: "", amount: "", notes: "" };

function StatCard({ label, value, color = "default" }) {
  const colors = {
    default: "bg-white border-gray-100",
    blue:    "bg-blue-50 border-blue-100",
    green:   "bg-green-50 border-green-100",
    yellow:  "bg-yellow-50 border-yellow-100",
    red:     "bg-red-50 border-red-100",
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-xl font-bold text-gray-800">{value}</p>
    </div>
  );
}

export function BonusView({ search }) {
  const [tab, setTab] = useState("list");
  const [filterType,   setFilterType]   = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterYear,   setFilterYear]   = useState(String(currentYear));
  const [filterDriver, setFilterDriver] = useState("");
  const [sortBy,       setSortBy]       = useState("");
  const [paying,       setPaying]       = useState(null);
  const [confirmId,    setConfirmId]    = useState(null);
  const [page,         setPage]         = useState(1);
  const [pageSize,     setPageSize]     = useState(10);

  const { bonuses, stats, loading, error, pagination, refresh, payBonus } = useBonuses({
    type:     filterType   || undefined,
    status:   filterStatus || undefined,
    year:     filterYear   || undefined,
    search:   search       || undefined,
    driverId: filterDriver || undefined,
    sort:     sortBy       || undefined,
    page, limit: pageSize,
  });

  useEffect(() => { setPage(1); }, [filterType, filterStatus, filterYear, filterDriver, sortBy, search]);

  const [drivers, setDrivers] = useState([]);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    accountantService.getBonusStaffLookup().then((res) => setDrivers(res.staff || [])).catch(() => {});
  }, []);

  const onWelfareTypeChange = (t) => {
    const auto = WELFARE_AMOUNT[t];
    setCreateForm((p) => ({ ...p, type: t, amount: auto || "" }));
  };

  const handleCreate = async () => {
    if (!createForm.driver_id) { alert("Chọn tài xế"); return; }
    if (!createForm.type) { alert("Chọn loại phúc lợi"); return; }
    if (!createForm.amount) { alert("Nhập số tiền"); return; }
    setCreating(true);
    try {
      const res = await accountantService.createBonus(createForm);
      alert(res.message ?? "Tạo khoản thưởng/phúc lợi thành công");
      setCreateForm(EMPTY_CREATE_FORM);
      refresh();
      setTab("list");
    } catch (err) {
      alert(err.message ?? "Lỗi tạo phúc lợi");
    } finally {
      setCreating(false);
    }
  };

  const needBeneficiary = ["welfare_wedding", "welfare_funeral"].includes(createForm.type);
  const isAutoAmount = !!WELFARE_AMOUNT[createForm.type];

  const handlePay = async () => {
    if (!confirmId) return;
    setPaying(confirmId);
    try {
      await payBonus(confirmId);
      setConfirmId(null);
    } catch (err) {
      alert(err.message ?? "Lỗi chi trả");
    } finally {
      setPaying(null);
    }
  };

  // Lọc theo search đã được backend xử lý (params.search) — không cần lọc lại ở client.
  const filtered = bonuses;

  return (
    <div className="flex flex-col gap-5">

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Chờ duyệt"   value={stats.pending_count}  color="yellow" />
          <StatCard label="Đã duyệt"    value={stats.approved_count} color="blue" />
          <StatCard label="Tổng đã duyệt" value={fmt(stats.approved_total)} color="blue" />
          <StatCard label="Tổng đã chi"   value={fmt(stats.paid_total)}     color="green" />
        </div>
      )}

      <Tabs selectedKey={tab} onSelectionChange={setTab} color="primary">
      <Tab key="list" title="Danh sách">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end mt-3">
        <Select
          size="sm"
          label="Năm"
          className="w-28"
          selectedKeys={filterYear ? new Set([filterYear]) : new Set()}
          onSelectionChange={(keys) => setFilterYear([...keys][0] ?? "")}
        >
          {YEARS.map((y) => (
            <SelectItem key={String(y)} value={String(y)} textValue={String(y)}>{y}</SelectItem>
          ))}
        </Select>

        <Select
          size="sm"
          label="Loại"
          className="w-44"
          selectedKeys={new Set([filterType])}
          onSelectionChange={(keys) => setFilterType([...keys][0] ?? "")}
        >
          <SelectItem key="" textValue="Tất cả loại">Tất cả loại</SelectItem>
          {Object.entries(TYPE_LABEL).map(([k, v]) => (
            <SelectItem key={k} value={k} textValue={v}>{v}</SelectItem>
          ))}
        </Select>

        <Select
          size="sm"
          label="Trạng thái"
          className="w-36"
          selectedKeys={new Set([filterStatus])}
          onSelectionChange={(keys) => setFilterStatus([...keys][0] ?? "")}
        >
          <SelectItem key="" textValue="Tất cả">Tất cả</SelectItem>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <SelectItem key={k} value={k} textValue={v}>{v}</SelectItem>
          ))}
        </Select>

        <Select
          size="sm"
          label="Nhân viên"
          className="w-56"
          selectedKeys={new Set([filterDriver])}
          onSelectionChange={(keys) => setFilterDriver([...keys][0] ?? "")}
        >
          <SelectItem key="" textValue="Tất cả nhân viên">Tất cả nhân viên</SelectItem>
          {drivers.map((d) => (
            <SelectItem key={String(d.id)} textValue={d.full_name}>{d.full_name}</SelectItem>
          ))}
        </Select>

        <Select
          size="sm"
          label="Sắp xếp"
          className="w-48"
          selectedKeys={new Set([sortBy])}
          onSelectionChange={(keys) => setSortBy([...keys][0] ?? "")}
        >
          <SelectItem key="" textValue="Mới nhất">Mới nhất</SelectItem>
          <SelectItem key="oldest" textValue="Cũ nhất">Cũ nhất</SelectItem>
          <SelectItem key="amount-desc" textValue="Số tiền cao nhất">Số tiền cao nhất</SelectItem>
          <SelectItem key="amount-asc" textValue="Số tiền thấp nhất">Số tiền thấp nhất</SelectItem>
        </Select>

        <Button size="sm" variant="flat" onPress={refresh}>Làm mới</Button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : error ? (
        <p className="text-red-500 text-sm">{error}</p>
      ) : filtered.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-12">Không có dữ liệu</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-100">
                <th className="px-4 py-3 text-left font-semibold">Nhân viên</th>
                <th className="px-4 py-3 text-left font-semibold">Loại</th>
                <th className="px-4 py-3 text-left font-semibold">Năm</th>
                <th className="px-4 py-3 text-right font-semibold">Số tiền</th>
                <th className="px-4 py-3 text-left font-semibold">Ghi chú / Thân nhân</th>
                <th className="px-4 py-3 text-left font-semibold">Trạng thái</th>
                <th className="px-4 py-3 text-left font-semibold">Duyệt bởi</th>
                <th className="px-4 py-3 text-center font-semibold">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((b) => (
                <tr key={b.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800">{b.driver_name}</p>
                    <p className="text-xs text-gray-400">{b.driver_phone}</p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {TYPE_LABEL[b.type] ?? b.type}
                  </td>
                  <td className="px-4 py-3">{b.year}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {fmt(b.amount)}
                  </td>
                  <td className="px-4 py-3 max-w-[200px]">
                    {b.beneficiary_name && (
                      <span className="text-gray-700">
                        {b.beneficiary_name}
                        {b.beneficiary_relation && (
                          <span className="text-gray-400 text-xs ml-1">
                            ({RELATION_LABEL[b.beneficiary_relation] ?? b.beneficiary_relation})
                          </span>
                        )}
                      </span>
                    )}
                    {b.notes && (
                      <p className="text-xs text-gray-400 truncate">{b.notes}</p>
                    )}
                    {b.type === "tet_annual" && (
                      <p className="text-xs text-gray-400">
                        {b.months_full_count ?? 0} tháng đủ &bull; thâm niên {fmt(b.seniority_bonus)}
                      </p>
                    )}
                    {b.rejection_reason && (
                      <p className="text-xs text-red-400">Lý do từ chối: {b.rejection_reason}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Chip
                      size="sm"
                      color={STATUS_COLOR[b.status] ?? "default"}
                      variant="flat"
                    >
                      {STATUS_LABEL[b.status] ?? b.status}
                    </Chip>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {b.approved_by_name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {b.status === "approved" && (
                      <Button
                        size="sm"
                        color="success"
                        variant="flat"
                        isLoading={paying === b.id}
                        onPress={() => setConfirmId(b.id)}
                      >
                        Chi trả
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="mt-3">
          <PaginationBar
            page={page}
            pageSize={pageSize}
            totalItems={pagination.total}
            totalPages={pagination.totalPages}
            onPageChange={setPage}
            onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
          />
        </div>
      )}
      </Tab>

      <Tab key="create" title="Tạo phúc lợi">
        <div className="max-w-xl flex flex-col gap-4 mt-3">
          <Select
            label="Nhân viên"
            placeholder="Chọn nhân viên..."
            selectedKeys={createForm.driver_id ? new Set([String(createForm.driver_id)]) : new Set()}
            onSelectionChange={(k) => setCreateForm((p) => ({ ...p, driver_id: [...k][0] }))}
            variant="bordered"
          >
            {drivers.map((d) => <SelectItem key={String(d.id)} textValue={d.full_name}>{`${d.full_name} — ${ROLE_LABEL[d.role] || d.role}`}</SelectItem>)}
          </Select>

          <Select
            label="Loại phúc lợi"
            placeholder="Chọn loại..."
            selectedKeys={createForm.type ? new Set([createForm.type]) : new Set()}
            onSelectionChange={(k) => onWelfareTypeChange([...k][0])}
            variant="bordered"
          >
            <SelectItem key="welfare_wedding" textValue="Kết hôn">Kết hôn (1.000.000đ)</SelectItem>
            <SelectItem key="welfare_funeral" textValue="Tang gia">Tang gia (tự chọn)</SelectItem>
            <SelectItem key="welfare_birthday" textValue="Sinh nhật">Sinh nhật (200.000đ)</SelectItem>
            <SelectItem key="holiday_overtime" textValue="Làm thêm ngày lễ">Làm thêm ngày lễ</SelectItem>
            <SelectItem key="special" textValue="Thưởng đặc biệt">Thưởng đặc biệt</SelectItem>
          </Select>

          <Select
            label="Năm"
            selectedKeys={new Set([String(createForm.year)])}
            onSelectionChange={(k) => setCreateForm((p) => ({ ...p, year: Number([...k][0]) }))}
            variant="bordered"
          >
            {YEARS.map((y) => <SelectItem key={String(y)} textValue={String(y)}>{String(y)}</SelectItem>)}
          </Select>

          {needBeneficiary && (
            <>
              <Input label="Tên thân nhân" value={createForm.beneficiary_name} onValueChange={(v) => setCreateForm((p) => ({ ...p, beneficiary_name: v }))} variant="bordered" />
              <Select
                label="Quan hệ"
                selectedKeys={createForm.beneficiary_relation ? new Set([createForm.beneficiary_relation]) : new Set()}
                onSelectionChange={(k) => setCreateForm((p) => ({ ...p, beneficiary_relation: [...k][0] }))}
                variant="bordered"
              >
                <SelectItem key="self" textValue="Bản thân">Bản thân</SelectItem>
                <SelectItem key="spouse" textValue="Vợ/Chồng">Vợ/Chồng</SelectItem>
                <SelectItem key="parent" textValue="Bố/Mẹ">Bố/Mẹ</SelectItem>
                <SelectItem key="child" textValue="Con">Con</SelectItem>
              </Select>
            </>
          )}

          <NumberInput
            label={isAutoAmount ? "Số tiền (tự động)" : "Số tiền (đồng)"}
            minValue={0}
            step={100000}
            value={createForm.amount || undefined}
            onValueChange={(v) => setCreateForm((p) => ({ ...p, amount: v }))}
            isDisabled={isAutoAmount}
            variant="bordered"
          />

          <Textarea label="Ghi chú" value={createForm.notes} onValueChange={(v) => setCreateForm((p) => ({ ...p, notes: v }))} minRows={2} variant="bordered" />

          <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 text-xs text-blue-700">
            Khoản do Kế toán tạo sẽ ở trạng thái <strong>Chờ duyệt</strong> — cần Manager duyệt trước khi cộng vào lương / chi trả.
          </div>

          <Button color="primary" startContent={<RiAddLine size={16} />} isLoading={creating} onPress={handleCreate} className="w-fit">
            Tạo phúc lợi
          </Button>
        </div>
      </Tab>
      </Tabs>

      {/* Confirm pay modal */}
      <Modal isOpen={!!confirmId} onOpenChange={(open) => !open && setConfirmId(null)}>
        <ModalContent>
          <ModalHeader>Xác nhận chi trả</ModalHeader>
          <ModalBody>
            <p className="text-sm text-gray-600">
              Xác nhận đã chi trả khoản thưởng/phúc lợi này cho tài xế?
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-amber-800">
              Lưu ý: thưởng đã duyệt sẽ tự động cộng vào bảng lương tháng và chuyển
              sang trạng thái đã chi khi kế toán chi lương. Chỉ dùng nút này khi cần
              chi tiền mặt riêng ngoài kỳ lương — khoản đã đánh dấu đã chi sẽ KHÔNG
              được cộng vào bảng lương nữa.
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setConfirmId(null)}>Huỷ</Button>
            <Button color="success" isLoading={!!paying} onPress={handlePay}>
              Xác nhận đã chi
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

    </div>
  );
}
