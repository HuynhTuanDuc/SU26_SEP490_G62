import { useEffect, useMemo, useState } from "react";
import { notify } from "../../../components/shared-ui/Toast";
import {
  Button, Input, NumberInput, Select, SelectItem, Switch, Chip, Spinner,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
} from "@heroui/react";
import { RiAddLine, RiPencilLine, RiDeleteBinLine } from "react-icons/ri";
import { PaginationBar } from "../../../components/shared-ui/PaginationBar";
import { managerService } from "../services/manager.service";
import { money } from "../../../utils/formatNumber";

const PAGE_SIZE = 10;

const BONUS_TYPES = [
  { value: "kpi", label: "Vượt KPI (ngưỡng doanh thu)" },
  { value: "top_revenue", label: "Lái xe xuất sắc nhất (doanh thu)" },
  { value: "top_trips", label: "Lái xe xuất sắc nhất (số chuyến)" },
  { value: "zero_incident", label: "Không sự cố" },
  { value: "overtime", label: "Làm thêm giờ" },
  { value: "holiday", label: "Ngày lễ" },
  { value: "custom", label: "Tùy chỉnh" },
];

// Backend chỉ cho tạo/bật các loại mà bộ tính lương thật sự đọc. Trước đây dropdown mời
// chọn cả 7 loại nên chọn 4 loại còn lại là ăn lỗi ngay lúc Lưu. Danh sách thật lấy từ
// API (bonusTypes.implemented); hằng số này chỉ là phương án dự phòng khi API cũ.
const FALLBACK_IMPLEMENTED = ["kpi", "top_revenue", "holiday"];

const typeLabel = (value) => BONUS_TYPES.find((t) => t.value === value)?.label || value;

const EMPTY_FORM = {
  title: "", bonus_type: "kpi", vehicle_group_id: null,
  reward_amount: null, reward_multiplier: null, min_revenue: null, is_active: true,
};


// readOnly: dùng khi Kế toán mở màn này để đối chiếu khi tính lương — chỉ Manager
// mới được cấu hình quy tắc (backend cũng chặn POST/PUT/DELETE với role khác).
export default function BonusRulesView({ readOnly = false }) {
  const [rules, setRules] = useState([]);
  const [implementedTypes, setImplementedTypes] = useState(FALLBACK_IMPLEMENTED);
  const [vehicleGroups, setVehicleGroups] = useState([]);
  const [loading, setLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState(null);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [page, setPage] = useState(1);
  const [filterType, setFilterType] = useState("");
  const [filterActive, setFilterActive] = useState("");
  const [sortBy, setSortBy] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const data = await managerService.getBonusRules();
      setRules(data.rules || []);
      if (data.bonusTypes?.implemented?.length) setImplementedTypes(data.bonusTypes.implemented);
    } catch (err) {
      notify.error(err.message || "Không thể tải quy tắc thưởng.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    managerService.getVehicleGroups().then((data) => setVehicleGroups(data.vehicleGroups || [])).catch(() => {});
  }, []);

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setError(null);
  };

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setModalOpen(true); };

  const openEdit = (rule) => {
    setEditing(rule);
    setForm({
      title: rule.title,
      bonus_type: rule.bonus_type,
      vehicle_group_id: rule.vehicle_group_id ? String(rule.vehicle_group_id) : null,
      reward_amount: rule.reward_amount != null ? Number(rule.reward_amount) : null,
      reward_multiplier: rule.reward_multiplier != null ? Number(rule.reward_multiplier) : null,
      min_revenue: rule.conditions_json?.min_revenue ?? null,
      is_active: rule.is_active,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title: form.title,
        bonus_type: form.bonus_type,
        vehicle_group_id: form.vehicle_group_id ? Number(form.vehicle_group_id) : null,
        reward_amount: form.reward_amount,
        reward_multiplier: form.reward_multiplier,
        conditions_json: form.bonus_type === "kpi" ? { min_revenue: form.min_revenue } : null,
        is_active: form.is_active,
      };
      if (editing) {
        await managerService.updateBonusRule(editing.id, payload);
        notify.success("Đã cập nhật quy tắc thưởng.");
      } else {
        await managerService.createBonusRule(payload);
        notify.success("Đã tạo quy tắc thưởng.");
      }
      closeModal();
      load();
    } catch (err) {
      const message = err.message || "Không thể lưu quy tắc thưởng.";
      setError(message);
      notify.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await managerService.deleteBonusRule(deleteTarget.id);
      setDeleteTarget(null);
      notify.success("Đã xóa quy tắc thưởng.");
      load();
    } catch (err) {
      notify.error(err.message || "Không thể xóa quy tắc thưởng.");
    }
  };

  const filteredRules = useMemo(() => {
    let list = rules;
    if (filterType) list = list.filter((r) => r.bonus_type === filterType);
    if (filterActive) list = list.filter((r) => String(r.is_active) === filterActive);
    list = [...list];
    if (sortBy === "amount-desc") list.sort((a, b) => (b.reward_amount ?? 0) - (a.reward_amount ?? 0));
    else if (sortBy === "amount-asc") list.sort((a, b) => (a.reward_amount ?? 0) - (b.reward_amount ?? 0));
    else list.sort((a, b) => (b.is_active === a.is_active ? b.id - a.id : b.is_active ? 1 : -1));
    return list;
  }, [rules, filterType, filterActive, sortBy]);

  // Dropdown chỉ mời chọn loại backend chấp nhận. Riêng khi sửa một rule cũ đang dùng
  // loại đã ngừng hỗ trợ thì vẫn giữ loại đó trong danh sách — bỏ đi sẽ khiến Select
  // rỗng và ép người dùng đổi loại chỉ để sửa được cái tên.
  const editingLegacyType = Boolean(editing?.bonus_type && !implementedTypes.includes(editing.bonus_type));
  const selectableTypes = useMemo(() => {
    const list = BONUS_TYPES
      .filter((t) => implementedTypes.includes(t.value))
      .map((t) => ({ ...t, supported: true }));
    if (editingLegacyType) {
      list.push({ value: editing.bonus_type, label: typeLabel(editing.bonus_type), supported: false });
    }
    return list;
  }, [implementedTypes, editingLegacyType, editing]);

  const isHolidayRule = form.bonus_type === "holiday";

  const totalPages = Math.max(1, Math.ceil(filteredRules.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedRules = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredRules.slice(start, start + PAGE_SIZE);
  }, [filteredRules, safePage]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <Select
            label="Loại thưởng"
            size="sm"
            variant="bordered"
            className="w-56"
            selectedKeys={new Set([filterType])}
            onChange={(e) => { setPage(1); setFilterType(e.target.value); }}
          >
            <SelectItem key="" textValue="Tất cả loại">Tất cả loại</SelectItem>
            {BONUS_TYPES.map((t) => <SelectItem key={t.value} textValue={t.label}>{t.label}</SelectItem>)}
          </Select>
          <Select
            label="Trạng thái"
            size="sm"
            variant="bordered"
            className="w-44"
            selectedKeys={new Set([filterActive])}
            onChange={(e) => { setPage(1); setFilterActive(e.target.value); }}
          >
            <SelectItem key="" textValue="Tất cả">Tất cả</SelectItem>
            <SelectItem key="true" textValue="Đang áp dụng">Đang áp dụng</SelectItem>
            <SelectItem key="false" textValue="Ngừng áp dụng">Ngừng áp dụng</SelectItem>
          </Select>
          <Select
            label="Sắp xếp"
            size="sm"
            variant="bordered"
            className="w-56"
            selectedKeys={new Set([sortBy])}
            onChange={(e) => { setPage(1); setSortBy(e.target.value); }}
          >
            <SelectItem key="" textValue="Mặc định">Mặc định</SelectItem>
            <SelectItem key="amount-desc" textValue="Số tiền thưởng cao nhất">Số tiền thưởng cao nhất</SelectItem>
            <SelectItem key="amount-asc" textValue="Số tiền thưởng thấp nhất">Số tiền thưởng thấp nhất</SelectItem>
          </Select>
        </div>
        {readOnly ? (
          <span className="text-xs text-gray-400 dark:text-gray-400">Chỉ xem — quy tắc thưởng do Manager cấu hình.</span>
        ) : (
          <Button color="primary" size="sm" startContent={<RiAddLine size={16} />} onPress={openCreate} className="h-9 font-medium px-4">
            Thêm quy tắc thưởng
          </Button>
        )}
      </div>

      <div className="bg-white dark:bg-[#161922] rounded-2xl border border-gray-100 dark:border-white/10 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-10"><Spinner color="primary" /></div>
        ) : filteredRules.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-gray-400 text-center py-8">Chưa có quy tắc thưởng nào.</p>
        ) : (
          <div className="flex flex-col divide-y divide-gray-50 dark:divide-white/10 overflow-x-auto">
            {pagedRules.map((rule) => (
              <div key={rule.id} className="flex items-center justify-between px-5 py-4 gap-4 min-w-max">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{rule.title}</span>
                    <Chip size="sm" variant="flat" color={rule.is_active ? "success" : "default"}>
                      {rule.is_active ? "Đang áp dụng" : "Tạm dừng"}
                    </Chip>
                  </div>
                  <span className="text-xs text-gray-400 dark:text-gray-400">
                    {typeLabel(rule.bonus_type)} · {rule.vehicle_group_name || "Tất cả nhóm xe"}
                  </span>
                  {/* Rule cũ dùng loại thưởng không công thức nào đọc → thưởng luôn bằng 0 */}
                  {rule.is_active && !implementedTypes.includes(rule.bonus_type) && (
                    <span className="text-[11px] text-amber-600 dark:text-amber-300">
                      Loại thưởng này không được bộ tính lương đọc — quy tắc đang không có hiệu lực.
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-6 shrink-0">
                  <div className="text-right">
                    <div className="text-[10px] text-gray-400 dark:text-gray-400 uppercase">Số tiền thưởng</div>
                    <div className="text-sm font-semibold text-blue-600 dark:text-blue-300">{money(rule.reward_amount)}</div>
                  </div>
                  {rule.conditions_json?.min_revenue && (
                    <div className="text-right">
                      <div className="text-[10px] text-gray-400 dark:text-gray-400 uppercase">Ngưỡng doanh thu</div>
                      <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">{money(rule.conditions_json.min_revenue)}</div>
                    </div>
                  )}
                  {!readOnly && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="flat" color="primary" startContent={<RiPencilLine size={13} />} onPress={() => openEdit(rule)}>Sửa</Button>
                      <Button size="sm" variant="flat" color="danger" startContent={<RiDeleteBinLine size={13} />} onPress={() => setDeleteTarget(rule)}>Xóa</Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {filteredRules.length > 0 && (
        <PaginationBar
          page={safePage}
          pageSize={PAGE_SIZE}
          totalItems={filteredRules.length}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      )}

      <Modal isOpen={modalOpen} onOpenChange={(open) => !open && closeModal()} size="2xl">
        <ModalContent>
          <ModalHeader>{editing ? `Sửa quy tắc #${editing.id}` : "Thêm quy tắc thưởng mới"}</ModalHeader>
          <ModalBody className="gap-4">
            {error && <p className="text-xs text-rose-500">{error}</p>}
            <Input label="Tên quy tắc *" value={form.title} onValueChange={(v) => setForm((p) => ({ ...p, title: v }))} variant="bordered" />

            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Loại thưởng *"
                selectedKeys={[form.bonus_type]}
                onSelectionChange={(keys) => setForm((p) => ({ ...p, bonus_type: [...keys][0] }))}
                variant="bordered"
                description={editingLegacyType ? "Loại thưởng cũ này không còn được tính lương đọc — đổi sang loại khác để quy tắc có hiệu lực." : undefined}
              >
                {selectableTypes.map((t) => (
                  <SelectItem key={t.value} textValue={t.label}>
                    {t.supported ? t.label : `${t.label} (không còn hỗ trợ)`}
                  </SelectItem>
                ))}
              </Select>
              <Select
                label="Nhóm xe (để trống = áp dụng chung)"
                selectedKeys={form.vehicle_group_id ? [form.vehicle_group_id] : []}
                onSelectionChange={(keys) => setForm((p) => ({ ...p, vehicle_group_id: [...keys][0] ?? null }))}
                variant="bordered"
              >
                {vehicleGroups.map((g) => <SelectItem key={String(g.id)}>{g.name}</SelectItem>)}
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <NumberInput
                label={isHolidayRule ? "Số tiền thưởng (không dùng cho ngày lễ)" : "Số tiền thưởng (VNĐ)"}
                minValue={0}
                value={form.reward_amount}
                onValueChange={(v) => setForm((p) => ({ ...p, reward_amount: v }))}
                variant="bordered"
              />
              <NumberInput
                label={isHolidayRule ? "Hệ số thưởng *" : "Hệ số thưởng (tùy chọn)"}
                minValue={isHolidayRule ? 1 : 0}
                step={0.1}
                value={form.reward_multiplier}
                onValueChange={(v) => setForm((p) => ({ ...p, reward_multiplier: v }))}
                variant="bordered"
                description={isHolidayRule ? "Vd 2 = đi làm ngày lễ hưởng 200% lương ngày. Phải từ 1 trở lên." : undefined}
              />
            </div>

            {form.bonus_type === "kpi" && (
              <NumberInput
                label="Ngưỡng doanh thu tối thiểu để đạt thưởng KPI (VNĐ) *"
                minValue={0}
                value={form.min_revenue}
                onValueChange={(v) => setForm((p) => ({ ...p, min_revenue: v }))}
                variant="bordered"
              />
            )}

            <div className="flex items-center gap-2">
              <Switch isSelected={form.is_active} onValueChange={(v) => setForm((p) => ({ ...p, is_active: v }))} size="sm" />
              <span className="text-sm text-gray-600 dark:text-gray-300">Đang áp dụng</span>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={closeModal}>Đóng</Button>
            <Button color="primary" isLoading={saving} onPress={handleSubmit}>Lưu</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)} size="sm">
        <ModalContent>
          <ModalHeader>Xóa quy tắc thưởng</ModalHeader>
          <ModalBody><p className="text-sm text-gray-500 dark:text-gray-400">Xóa quy tắc "{deleteTarget?.title}"?</p></ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setDeleteTarget(null)}>Đóng</Button>
            <Button color="danger" onPress={handleDelete}>Xóa</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
