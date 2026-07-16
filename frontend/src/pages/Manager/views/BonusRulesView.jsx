import { useEffect, useMemo, useState } from "react";
import {
  Button, Input, NumberInput, Select, SelectItem, Switch, Chip, Spinner,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
} from "@heroui/react";
import { RiAddLine, RiPencilLine, RiDeleteBinLine } from "react-icons/ri";
import { PaginationBar } from "../../../components/shared-ui/PaginationBar";
import { managerService } from "../services/manager.service";

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

const EMPTY_FORM = {
  title: "", bonus_type: "kpi", vehicle_group_id: null,
  reward_amount: null, reward_multiplier: null, min_revenue: null, is_active: true,
};

const formatCurrency = (value) => (value != null ? Number(value).toLocaleString("vi-VN") + " đ" : "-");

export default function BonusRulesView() {
  const [rules, setRules] = useState([]);
  const [vehicleGroups, setVehicleGroups] = useState([]);
  const [loading, setLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState(null);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [page, setPage] = useState(1);

  const load = async () => {
    setLoading(true);
    try {
      const data = await managerService.getBonusRules();
      setRules(data.rules || []);
    } catch (err) {
      alert(err.message || "Không thể tải quy tắc thưởng.");
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
      if (editing) await managerService.updateBonusRule(editing.id, payload);
      else await managerService.createBonusRule(payload);
      closeModal();
      load();
    } catch (err) {
      setError(err.message || "Không thể lưu quy tắc thưởng.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await managerService.deleteBonusRule(deleteTarget.id);
      setDeleteTarget(null);
      load();
    } catch (err) {
      alert(err.message || "Không thể xóa quy tắc thưởng.");
    }
  };

  const totalPages = Math.max(1, Math.ceil(rules.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedRules = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return rules.slice(start, start + PAGE_SIZE);
  }, [rules, safePage]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button color="primary" size="sm" startContent={<RiAddLine size={16} />} onPress={openCreate} className="h-9 font-medium px-4">
          Thêm quy tắc thưởng
        </Button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-10"><Spinner color="primary" /></div>
        ) : rules.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-8">Chưa có quy tắc thưởng nào.</p>
        ) : (
          <div className="flex flex-col divide-y divide-gray-50">
            {pagedRules.map((rule) => (
              <div key={rule.id} className="flex items-center justify-between px-5 py-4 gap-4">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-800">{rule.title}</span>
                    <Chip size="sm" variant="flat" color={rule.is_active ? "success" : "default"}>
                      {rule.is_active ? "Đang áp dụng" : "Tạm dừng"}
                    </Chip>
                  </div>
                  <span className="text-xs text-gray-400">
                    {BONUS_TYPES.find((t) => t.value === rule.bonus_type)?.label || rule.bonus_type} · {rule.vehicle_group_name || "Tất cả nhóm xe"}
                  </span>
                </div>
                <div className="flex items-center gap-6 flex-shrink-0">
                  <div className="text-right">
                    <div className="text-[10px] text-gray-400 uppercase">Số tiền thưởng</div>
                    <div className="text-sm font-semibold text-blue-600">{formatCurrency(rule.reward_amount)}</div>
                  </div>
                  {rule.conditions_json?.min_revenue && (
                    <div className="text-right">
                      <div className="text-[10px] text-gray-400 uppercase">Ngưỡng doanh thu</div>
                      <div className="text-sm font-semibold text-gray-700">{formatCurrency(rule.conditions_json.min_revenue)}</div>
                    </div>
                  )}
                  <div className="flex gap-1">
                    <Button size="sm" variant="flat" color="primary" startContent={<RiPencilLine size={13} />} onPress={() => openEdit(rule)}>Sửa</Button>
                    <Button size="sm" variant="flat" color="danger" startContent={<RiDeleteBinLine size={13} />} onPress={() => setDeleteTarget(rule)}>Xóa</Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {rules.length > 0 && (
        <PaginationBar
          page={safePage}
          pageSize={PAGE_SIZE}
          totalItems={rules.length}
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
              >
                {BONUS_TYPES.map((t) => <SelectItem key={t.value}>{t.label}</SelectItem>)}
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
              <NumberInput label="Số tiền thưởng (VNĐ)" minValue={0} value={form.reward_amount} onValueChange={(v) => setForm((p) => ({ ...p, reward_amount: v }))} variant="bordered" />
              <NumberInput label="Hệ số thưởng (tùy chọn)" minValue={0} step={0.1} value={form.reward_multiplier} onValueChange={(v) => setForm((p) => ({ ...p, reward_multiplier: v }))} variant="bordered" />
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
              <span className="text-sm text-gray-600">Đang áp dụng</span>
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
          <ModalBody><p className="text-sm text-gray-500">Xóa quy tắc "{deleteTarget?.title}"?</p></ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setDeleteTarget(null)}>Đóng</Button>
            <Button color="danger" onPress={handleDelete}>Xóa</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
