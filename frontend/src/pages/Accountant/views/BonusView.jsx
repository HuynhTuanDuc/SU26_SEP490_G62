import { useState } from "react";
import {
  Button, Chip, Modal, ModalContent, ModalHeader,
  ModalBody, ModalFooter, Spinner, Select, SelectItem,
} from "@heroui/react";
import { useBonuses } from "../hooks/useBonuses";

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
  const [filterType,   setFilterType]   = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterYear,   setFilterYear]   = useState(String(currentYear));
  const [paying,       setPaying]       = useState(null);
  const [confirmId,    setConfirmId]    = useState(null);

  const { bonuses, stats, loading, error, refresh, payBonus } = useBonuses({
    type:   filterType   || undefined,
    status: filterStatus || undefined,
    year:   filterYear   || undefined,
    search: search       || undefined,
  });

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

  const filtered = bonuses.filter((b) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      b.driver_name?.toLowerCase().includes(q) ||
      b.driver_phone?.toLowerCase().includes(q)
    );
  });

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

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <Select
          size="sm"
          label="Năm"
          className="w-28"
          selectedKeys={filterYear ? new Set([filterYear]) : new Set()}
          onSelectionChange={(keys) => setFilterYear([...keys][0] ?? "")}
        >
          {YEARS.map((y) => (
            <SelectItem key={String(y)} value={String(y)}>{y}</SelectItem>
          ))}
        </Select>

        <Select
          size="sm"
          label="Loại"
          className="w-44"
          selectedKeys={filterType ? new Set([filterType]) : new Set()}
          onSelectionChange={(keys) => setFilterType([...keys][0] ?? "")}
        >
          <SelectItem key="">Tất cả loại</SelectItem>
          {Object.entries(TYPE_LABEL).map(([k, v]) => (
            <SelectItem key={k} value={k}>{v}</SelectItem>
          ))}
        </Select>

        <Select
          size="sm"
          label="Trạng thái"
          className="w-36"
          selectedKeys={filterStatus ? new Set([filterStatus]) : new Set()}
          onSelectionChange={(keys) => setFilterStatus([...keys][0] ?? "")}
        >
          <SelectItem key="">Tất cả</SelectItem>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <SelectItem key={k} value={k}>{v}</SelectItem>
          ))}
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
                <th className="px-4 py-3 text-left font-semibold">Tài xế</th>
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

      {/* Confirm pay modal */}
      <Modal isOpen={!!confirmId} onOpenChange={(open) => !open && setConfirmId(null)}>
        <ModalContent>
          <ModalHeader>Xác nhận chi trả</ModalHeader>
          <ModalBody>
            <p className="text-sm text-gray-600">
              Xác nhận đã chi trả khoản thưởng/phúc lợi này cho tài xế?
            </p>
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
