import { useCallback, useEffect, useState } from "react";
import {
  Button, Select, SelectItem, Input, NumberInput, Textarea, Tabs, Tab, Chip, Spinner,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
} from "@heroui/react";
import { RiRefreshLine, RiGiftLine, RiCheckLine, RiCloseLine, RiAddLine } from "react-icons/ri";
import { StatCard } from "../../../components/shared-ui/StatCard";
import { PaginationBar } from "../../../components/shared-ui/PaginationBar";
import { managerService } from "../services/manager.service";

const NOW = new Date();
const YEARS = [NOW.getFullYear(), NOW.getFullYear() - 1, NOW.getFullYear() - 2];
const fmt = (v) => new Intl.NumberFormat("vi-VN").format(Number(v || 0)) + "đ";

const TYPE_LABEL = {
  tet_annual: "Thưởng Tết",
  welfare_wedding: "Phúc lợi - Kết hôn",
  welfare_funeral: "Phúc lợi - Tang gia",
  welfare_birthday: "Phúc lợi - Sinh nhật",
  holiday_overtime: "Làm thêm ngày lễ",
  special: "Thưởng đặc biệt",
};

const WELFARE_AMOUNT = { welfare_birthday: 200_000, welfare_wedding: 1_000_000 };

const STATUS_COLOR = { pending: "warning", approved: "primary", rejected: "danger", paid: "success" };
const STATUS_LABEL = { pending: "Chờ duyệt", approved: "Đã duyệt", rejected: "Từ chối", paid: "Đã chi" };

const EMPTY_CREATE_FORM = { driver_id: "", type: "", year: NOW.getFullYear(), beneficiary_name: "", beneficiary_relation: "", amount: "", notes: "" };

export default function BonusView() {
  const [tab, setTab] = useState("list");

  const [bonuses, setBonuses] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [year, setYear] = useState(NOW.getFullYear());
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [driverFilter, setDriverFilter] = useState("");
  const [sortBy, setSortBy] = useState("");

  const [approveTarget, setApproveTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [adjustAmount, setAdjustAmount] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [acting, setActing] = useState(false);

  const [tetYear, setTetYear] = useState(NOW.getFullYear());
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [confirmGenerate, setConfirmGenerate] = useState(false);

  const [drivers, setDrivers] = useState([]);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM);
  const [creating, setCreating] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });

  const loadBonuses = useCallback(async () => {
    setLoading(true);
    try {
      const [bonusRes, statsRes] = await Promise.all([
        managerService.getBonuses({
          year, page, limit: pageSize,
          ...(typeFilter ? { type: typeFilter } : {}),
          ...(statusFilter ? { status: statusFilter } : {}),
          ...(driverFilter ? { driver_id: driverFilter } : {}),
          ...(sortBy ? { sort: sortBy } : {}),
        }),
        managerService.getBonusStats(year),
      ]);
      setBonuses(bonusRes.bonuses || []);
      setStats(statsRes);
      setPagination(bonusRes.pagination || { total: (bonusRes.bonuses || []).length, totalPages: 1 });
    } catch (e) {
      alert(e.message || "Lỗi tải dữ liệu thưởng");
    } finally {
      setLoading(false);
    }
  }, [year, typeFilter, statusFilter, driverFilter, sortBy, page, pageSize]);

  useEffect(() => { loadBonuses(); }, [loadBonuses]);
  useEffect(() => { setPage(1); }, [year, typeFilter, statusFilter, driverFilter, sortBy]);

  useEffect(() => {
    managerService.getDriverList().then((res) => setDrivers((res.users || []).filter((u) => u.role === "driver"))).catch(() => {});
  }, []);

  const handleApprove = async () => {
    setActing(true);
    try {
      await managerService.approveBonus(approveTarget.id, adjustAmount ?? undefined);
      setApproveTarget(null);
      loadBonuses();
    } catch (e) {
      alert(e.message || "Lỗi duyệt");
    } finally {
      setActing(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) { alert("Vui lòng nhập lý do từ chối"); return; }
    setActing(true);
    try {
      await managerService.rejectBonus(rejectTarget.id, rejectReason.trim());
      setRejectTarget(null);
      setRejectReason("");
      loadBonuses();
    } catch (e) {
      alert(e.message || "Lỗi từ chối");
    } finally {
      setActing(false);
    }
  };

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      const data = await managerService.previewTetBonuses(tetYear);
      setPreview(data.previews || data);
    } catch (e) {
      alert(e.message || "Lỗi preview");
    } finally {
      setPreviewing(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await managerService.generateTetBonuses(tetYear);
      setConfirmGenerate(false);
      setPreview(null);
      loadBonuses();
      alert(`Đã tạo ${res.inserted} phiếu thưởng Tết (bỏ qua ${res.skipped} đã tồn tại)`);
    } catch (e) {
      alert(e.message || "Lỗi tạo thưởng Tết");
    } finally {
      setGenerating(false);
    }
  };

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
      await managerService.createBonus(createForm);
      setCreateForm(EMPTY_CREATE_FORM);
      loadBonuses();
      setTab("list");
    } catch (e) {
      alert(e.message || "Lỗi tạo phúc lợi");
    } finally {
      setCreating(false);
    }
  };

  const needBeneficiary = ["welfare_wedding", "welfare_funeral"].includes(createForm.type);
  const isAutoAmount = !!WELFARE_AMOUNT[createForm.type];

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Chờ duyệt" value={stats?.pending_count || 0} icon={RiGiftLine} border="border-amber-100" lightBg="bg-amber-50" text="text-amber-600" gradient="from-amber-500 to-amber-600" />
        <StatCard label="Đã duyệt" value={stats?.approved_count || 0} border="border-blue-100" lightBg="bg-blue-50" text="text-blue-600" gradient="from-blue-500 to-blue-600" />
        <StatCard label="Tổng đã duyệt" value={fmt(stats?.approved_total || 0)} border="border-blue-100" lightBg="bg-blue-50" text="text-blue-600" gradient="from-blue-500 to-blue-600" />
        <StatCard label="Tổng đã chi" value={fmt(stats?.paid_total || 0)} border="border-emerald-100" lightBg="bg-emerald-50" text="text-emerald-600" gradient="from-emerald-500 to-emerald-600" />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <Tabs selectedKey={tab} onSelectionChange={setTab} color="primary">
          <Tab key="list" title="Duyệt thưởng">
            <div className="flex flex-wrap gap-3 my-4">
              <Select selectedKeys={[String(year)]} onSelectionChange={(k) => setYear(Number([...k][0]))} variant="bordered" size="sm" className="w-24">
                {YEARS.map((y) => <SelectItem key={String(y)}>{String(y)}</SelectItem>)}
              </Select>
              <Select
                selectedKeys={typeFilter ? [typeFilter] : []}
                onSelectionChange={(k) => setTypeFilter([...k][0] ?? "")}
                placeholder="Tất cả loại"
                variant="bordered"
                size="sm"
                className="w-56"
              >
                {Object.entries(TYPE_LABEL).map(([k, v]) => <SelectItem key={k}>{v}</SelectItem>)}
              </Select>
              <Select
                selectedKeys={statusFilter ? [statusFilter] : []}
                onSelectionChange={(k) => setStatusFilter([...k][0] ?? "")}
                variant="bordered"
                size="sm"
                className="w-44"
              >
                <SelectItem key="">Tất cả trạng thái</SelectItem>
                <SelectItem key="pending">Chờ duyệt</SelectItem>
                <SelectItem key="approved">Đã duyệt</SelectItem>
                <SelectItem key="rejected">Từ chối</SelectItem>
                <SelectItem key="paid">Đã chi</SelectItem>
              </Select>
              <Select
                selectedKeys={new Set([driverFilter])}
                onSelectionChange={(k) => setDriverFilter([...k][0] ?? "")}
                placeholder="Tất cả tài xế"
                variant="bordered"
                size="sm"
                className="w-56"
              >
                <SelectItem key="" textValue="Tất cả tài xế">Tất cả tài xế</SelectItem>
                {drivers.map((d) => <SelectItem key={String(d.id)} textValue={d.full_name}>{d.full_name}</SelectItem>)}
              </Select>
              <Select
                selectedKeys={new Set([sortBy])}
                onSelectionChange={(k) => setSortBy([...k][0] ?? "")}
                variant="bordered"
                size="sm"
                className="w-48"
              >
                <SelectItem key="" textValue="Mới nhất">Mới nhất</SelectItem>
                <SelectItem key="oldest" textValue="Cũ nhất">Cũ nhất</SelectItem>
                <SelectItem key="amount-desc" textValue="Số tiền cao nhất">Số tiền cao nhất</SelectItem>
                <SelectItem key="amount-asc" textValue="Số tiền thấp nhất">Số tiền thấp nhất</SelectItem>
              </Select>
              <Button variant="flat" size="sm" startContent={<RiRefreshLine size={14} />} onPress={loadBonuses}>Làm mới</Button>
            </div>

            <Table removeWrapper aria-label="Danh sách thưởng" classNames={{ th: "px-4 first:pl-5 last:pr-5", td: "px-4 py-3 first:pl-5 last:pr-5" }}>
              <TableHeader>
                <TableColumn>TÀI XẾ</TableColumn>
                <TableColumn>LOẠI</TableColumn>
                <TableColumn>NĂM</TableColumn>
                <TableColumn>SỐ TIỀN</TableColumn>
                <TableColumn>GHI CHÚ</TableColumn>
                <TableColumn>TRẠNG THÁI</TableColumn>
                <TableColumn> </TableColumn>
              </TableHeader>
              <TableBody items={bonuses} isLoading={loading} loadingContent={<Spinner color="primary" />} emptyContent="Không có phiếu thưởng nào.">
                {(r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-semibold text-gray-800 text-sm">{r.driver_name}</span>
                        <span className="text-xs text-gray-400">{r.driver_phone}</span>
                      </div>
                    </TableCell>
                    <TableCell>{TYPE_LABEL[r.type] || r.type}</TableCell>
                    <TableCell>{r.year}</TableCell>
                    <TableCell><span className="font-semibold">{fmt(r.amount)}</span></TableCell>
                    <TableCell>
                      <div className="flex flex-col text-xs text-gray-500">
                        {r.notes && <span>{r.notes}</span>}
                        {r.beneficiary_name && <span>{r.beneficiary_name} ({r.beneficiary_relation})</span>}
                        {r.rejection_reason && <span className="text-rose-500">Lý do: {r.rejection_reason}</span>}
                      </div>
                    </TableCell>
                    <TableCell><Chip size="sm" variant="flat" color={STATUS_COLOR[r.status] || "default"}>{STATUS_LABEL[r.status] || r.status}</Chip></TableCell>
                    <TableCell>
                      {r.status === "pending" && (
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" color="primary" startContent={<RiCheckLine size={13} />} onPress={() => { setApproveTarget(r); setAdjustAmount(r.amount); }}>Duyệt</Button>
                          <Button size="sm" variant="light" color="danger" startContent={<RiCloseLine size={13} />} onPress={() => { setRejectTarget(r); setRejectReason(""); }}>Từ chối</Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {bonuses.length > 0 && (
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

          <Tab key="tet" title="Thưởng Tết">
            <div className="flex items-center gap-3 my-4 flex-wrap">
              <span className="text-sm font-semibold text-gray-700">Năm:</span>
              <Select selectedKeys={[String(tetYear)]} onSelectionChange={(k) => setTetYear(Number([...k][0]))} variant="bordered" size="sm" className="w-24">
                {YEARS.map((y) => <SelectItem key={String(y)}>{String(y)}</SelectItem>)}
              </Select>
              <Button variant="flat" size="sm" isLoading={previewing} onPress={handlePreview}>Xem trước</Button>
              <Button color="primary" size="sm" startContent={<RiGiftLine size={14} />} isDisabled={!preview} onPress={() => setConfirmGenerate(true)}>
                Tạo thưởng Tết {tetYear}
              </Button>
            </div>

            {preview && (
              <div className="flex flex-col gap-3">
                <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 text-sm text-blue-700">
                  {preview.filter((p) => !p.already_exists).length} tài xế sẽ được tạo phiếu thưởng mới · {preview.filter((p) => p.already_exists).length} đã có sẵn
                </div>
                <div className="max-h-[360px] overflow-y-auto">
                  <Table removeWrapper aria-label="Xem trước thưởng Tết" classNames={{ th: "px-4 first:pl-5 last:pr-5", td: "px-4 py-3 first:pl-5 last:pr-5" }}>
                    <TableHeader>
                      <TableColumn>TÀI XẾ</TableColumn>
                      <TableColumn>NHÓM XE</TableColumn>
                      <TableColumn>THÁNG ĐỦ</TableColumn>
                      <TableColumn>THÂM NIÊN</TableColumn>
                      <TableColumn>CHUYÊN CẦN</TableColumn>
                      <TableColumn>TỔNG</TableColumn>
                      <TableColumn>ĐÃ TỒN TẠI</TableColumn>
                    </TableHeader>
                    <TableBody items={preview} emptyContent="Không có dữ liệu.">
                      {(p) => (
                        <TableRow key={p.driver_id}>
                          <TableCell>{p.full_name}</TableCell>
                          <TableCell>{p.vehicle_group}</TableCell>
                          <TableCell>{p.months_full_count}</TableCell>
                          <TableCell>{fmt(p.seniority_bonus)}</TableCell>
                          <TableCell>{fmt(p.attendance_bonus)}</TableCell>
                          <TableCell><strong>{fmt(p.total)}</strong></TableCell>
                          <TableCell><Chip size="sm" variant="flat" color={p.already_exists ? "success" : "warning"}>{p.already_exists ? "Có" : "Chưa"}</Chip></TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </Tab>

          <Tab key="create" title="Tạo phúc lợi">
            <div className="max-w-xl flex flex-col gap-4 my-4">
              <Select
                label="Tài xế"
                placeholder="Chọn tài xế..."
                selectedKeys={createForm.driver_id ? [String(createForm.driver_id)] : []}
                onSelectionChange={(k) => setCreateForm((p) => ({ ...p, driver_id: [...k][0] }))}
                variant="bordered"
              >
                {drivers.map((d) => <SelectItem key={String(d.id)}>{`${d.full_name} — ${d.phone}`}</SelectItem>)}
              </Select>

              <Select
                label="Loại phúc lợi"
                placeholder="Chọn loại..."
                selectedKeys={createForm.type ? [createForm.type] : []}
                onSelectionChange={(k) => onWelfareTypeChange([...k][0])}
                variant="bordered"
              >
                <SelectItem key="welfare_wedding">Kết hôn (1.000.000đ)</SelectItem>
                <SelectItem key="welfare_funeral">Tang gia (tự chọn)</SelectItem>
                <SelectItem key="welfare_birthday">Sinh nhật (200.000đ)</SelectItem>
                <SelectItem key="holiday_overtime">Làm thêm ngày lễ</SelectItem>
                <SelectItem key="special">Thưởng đặc biệt</SelectItem>
              </Select>

              <Select label="Năm" selectedKeys={[String(createForm.year)]} onSelectionChange={(k) => setCreateForm((p) => ({ ...p, year: Number([...k][0]) }))} variant="bordered">
                {YEARS.map((y) => <SelectItem key={String(y)}>{String(y)}</SelectItem>)}
              </Select>

              {needBeneficiary && (
                <>
                  <Input label="Tên thân nhân" value={createForm.beneficiary_name} onValueChange={(v) => setCreateForm((p) => ({ ...p, beneficiary_name: v }))} variant="bordered" />
                  <Select
                    label="Quan hệ"
                    selectedKeys={createForm.beneficiary_relation ? [createForm.beneficiary_relation] : []}
                    onSelectionChange={(k) => setCreateForm((p) => ({ ...p, beneficiary_relation: [...k][0] }))}
                    variant="bordered"
                  >
                    <SelectItem key="self">Bản thân</SelectItem>
                    <SelectItem key="spouse">Vợ/Chồng</SelectItem>
                    <SelectItem key="parent">Bố/Mẹ</SelectItem>
                    <SelectItem key="child">Con</SelectItem>
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

              <Button color="primary" startContent={<RiAddLine size={16} />} isLoading={creating} onPress={handleCreate} className="w-fit">
                Tạo phúc lợi
              </Button>
            </div>
          </Tab>
        </Tabs>
      </div>

      <Modal isOpen={!!approveTarget} onOpenChange={(open) => !open && setApproveTarget(null)} size="sm">
        <ModalContent>
          <ModalHeader>Duyệt thưởng</ModalHeader>
          <ModalBody className="gap-3">
            {approveTarget && (
              <>
                <div className="text-sm text-gray-600">
                  <div>Tài xế: <strong>{approveTarget.driver_name}</strong></div>
                  <div>Loại: <strong>{TYPE_LABEL[approveTarget.type]}</strong></div>
                  <div>Số tiền gốc: <strong>{fmt(approveTarget.amount)}</strong></div>
                </div>
                <NumberInput label="Số tiền duyệt (có thể điều chỉnh)" minValue={0} step={100000} value={adjustAmount} onValueChange={setAdjustAmount} variant="bordered" />
              </>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setApproveTarget(null)}>Hủy</Button>
            <Button color="primary" isLoading={acting} onPress={handleApprove}>Xác nhận duyệt</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={!!rejectTarget} onOpenChange={(open) => !open && setRejectTarget(null)} size="sm">
        <ModalContent>
          <ModalHeader>Từ chối thưởng</ModalHeader>
          <ModalBody className="gap-3">
            {rejectTarget && (
              <div className="text-sm text-gray-600">
                <div>Tài xế: <strong>{rejectTarget.driver_name}</strong></div>
                <div>Số tiền: <strong>{fmt(rejectTarget.amount)}</strong></div>
              </div>
            )}
            <Textarea label="Lý do từ chối *" value={rejectReason} onValueChange={setRejectReason} minRows={3} variant="bordered" />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setRejectTarget(null)}>Hủy</Button>
            <Button color="danger" isLoading={acting} onPress={handleReject}>Xác nhận từ chối</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={confirmGenerate} onOpenChange={(open) => !open && setConfirmGenerate(false)} size="sm">
        <ModalContent>
          <ModalHeader>Tạo thưởng Tết {tetYear}</ModalHeader>
          <ModalBody><p className="text-sm text-gray-600">Hệ thống sẽ tự động tính và tạo phiếu thưởng Tết {tetYear} cho tất cả tài xế chưa có. Tiếp tục?</p></ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setConfirmGenerate(false)}>Hủy</Button>
            <Button color="primary" isLoading={generating} onPress={handleGenerate}>Tạo thưởng</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
