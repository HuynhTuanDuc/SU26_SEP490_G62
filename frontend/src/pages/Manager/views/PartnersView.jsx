import { useEffect, useState } from "react";
import { notify } from "../../../components/shared-ui/Toast";
import { Button, Input, Select, SelectItem, Spinner, Chip, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell } from "@heroui/react";
import { RiSearchLine, RiAddLine, RiBuilding2Line, RiFileSearchLine, RiWalletLine, RiPencilLine, RiFileList3Line } from "react-icons/ri";
import { StatCard } from "../../../components/shared-ui/StatCard";
import { PaginationBar } from "../../../components/shared-ui/PaginationBar";
import { useRoleRealtime } from "../../../hooks/useRoleRealtime";
import PartnerFormModal from "../modals/PartnerFormModal";
import PartnerDebtModal from "../modals/PartnerDebtModal";
import { managerService } from "../services/manager.service";
import { money } from "../../../utils/formatNumber";

const EMPTY_FORM = {
  company_name: "", short_name: "", contact_person: "", phone: "", email: "",
  address: "", tax_code: "", business_registration_number: "", payment_term_days: "",
  bank_name: "", bank_account_number: "", bank_account_name: "", notes: "",
};

const fmt = (v) => Number(v || money(0));

export default function PartnersView({ user }) {
  const [partners, setPartners] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [hasDebt, setHasDebt] = useState("");
  const [sort, setSort] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const [debtModalOpen, setDebtModalOpen] = useState(false);
  const [debtLoading, setDebtLoading] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState(null);
  const [selectedDebts, setSelectedDebts] = useState([]);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });

  const load = async (nextSearch = search, nextPage = page, nextPageSize = pageSize, nextHasDebt = hasDebt, nextSort = sort) => {
    setLoading(true);
    try {
      const data = await managerService.getPartners(nextSearch, { page: nextPage, limit: nextPageSize, hasDebt: nextHasDebt, sort: nextSort });
      setPartners(data.partners || []);
      setSummary(data.summary || {});
      setPagination(data.pagination || { total: (data.partners || []).length, totalPages: 1 });
    } catch (error) {
      notify.error(error.message || "Không thể tải danh sách đối tác.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load("", 1, pageSize); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useRoleRealtime(user, {
    onMessage: (payload) => {
      if (payload?.type !== "manager.partners.changed") return;
      load();
      // Kế toán vừa thu tiền đối tác đang mở → làm mới luôn công nợ trong modal
      if (payload.action === "payment" && Number(payload.partnerId) === Number(selectedPartner?.id)) {
        refreshDebts(selectedPartner.id);
      }
    },
  });

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setModalOpen(true); };

  const openEdit = (partner) => {
    setEditing(partner);
    setForm({
      company_name: partner.company_name || "", short_name: partner.short_name || "",
      contact_person: partner.contact_person || "", phone: partner.phone || "", email: partner.email || "",
      address: partner.address || "", tax_code: partner.tax_code || "",
      business_registration_number: partner.business_registration_number || "",
      payment_term_days: partner.payment_term_days ?? "",
      bank_name: partner.bank_name || "", bank_account_number: partner.bank_account_number || "",
      bank_account_name: partner.bank_account_name || "", notes: partner.notes || "",
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.company_name.trim()) { notify.error("Vui lòng nhập tên đối tác"); return; }
    setSaving(true);
    try {
      if (editing) {
        await managerService.updatePartner(editing.id, form);
        notify.success("Đã cập nhật đối tác.");
      } else {
        await managerService.createPartner(form);
        notify.success("Đã thêm đối tác.");
      }
      setModalOpen(false);
      setEditing(null);
      await load();
    } catch (error) {
      notify.error(error.message || "Không thể lưu đối tác.");
    } finally {
      setSaving(false);
    }
  };

  const openDebtModal = async (partner) => {
    setDebtModalOpen(true);
    setSelectedPartner(partner);
    setDebtLoading(true);
    try {
      const data = await managerService.getPartnerDebts(partner.id);
      setSelectedPartner(data.partner || partner);
      setSelectedDebts(data.debts || []);
    } catch (error) {
      notify.error(error.message || "Không thể tải công nợ đối tác.");
      setDebtModalOpen(false);
    } finally {
      setDebtLoading(false);
    }
  };

  // Làm mới im lặng khi kế toán vừa thu tiền — không đóng modal nếu lỗi
  const refreshDebts = async (partnerId) => {
    try {
      const data = await managerService.getPartnerDebts(partnerId);
      setSelectedPartner((prev) => data.partner || prev);
      setSelectedDebts(data.debts || []);
    } catch { /* giữ nguyên số liệu đang hiển thị */ }
  };

  const totalRemaining = Number(summary.total_remaining || 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Tổng đối tác" value={summary.total_partners || 0} icon={RiBuilding2Line} border="border-blue-100 dark:border-blue-500/20" lightBg="bg-blue-50 dark:bg-blue-500/10" text="text-blue-600 dark:text-blue-300" gradient="from-blue-500 to-blue-600" sub="Danh bạ đối tác đang theo dõi" />
        <StatCard label="Đối tác có công nợ" value={summary.partners_with_debt || 0} icon={RiFileSearchLine} border="border-amber-100 dark:border-amber-500/20" lightBg="bg-amber-50 dark:bg-amber-500/10" text="text-amber-600 dark:text-amber-300" gradient="from-amber-500 to-amber-600" sub="Chỉ tính đối tác thực sự còn nợ" />
        <StatCard label="Tổng còn phải thu" value={fmt(totalRemaining)} icon={RiWalletLine} border="border-rose-100 dark:border-rose-500/20" lightBg="bg-rose-50 dark:bg-rose-500/10" text="text-rose-600 dark:text-rose-300" gradient="from-rose-500 to-rose-600" sub="Tổng giá trị công nợ đối tác" />
      </div>

      <div className="bg-white dark:bg-[#161922] rounded-2xl border border-gray-100 dark:border-white/10 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-white/10 gap-3 flex-wrap">
          <div>
            <div className="text-sm font-bold text-gray-800 dark:text-gray-100">Danh sách đối tác</div>
            <div className="text-xs text-gray-400 dark:text-gray-400">Quản lý thông tin đối tác và xem công nợ nếu còn tồn đọng.</div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              placeholder="Tìm theo tên công ty, người liên hệ..."
              value={search}
              onValueChange={setSearch}
              onKeyDown={(e) => e.key === "Enter" && load(search, 1, pageSize)}
              startContent={<RiSearchLine size={14} className="text-gray-400 dark:text-gray-400" />}
              variant="bordered"
              size="sm"
              className="w-72"
              isClearable
            />
            <Select
              size="sm"
              variant="bordered"
              className="w-44"
              aria-label="Trạng thái công nợ"
              selectedKeys={new Set([hasDebt])}
              onChange={(e) => { const v = e.target.value; setHasDebt(v); setPage(1); load(search, 1, pageSize, v, sort); }}
            >
              <SelectItem key="" textValue="Tất cả">Tất cả</SelectItem>
              <SelectItem key="true" textValue="Có công nợ">Có công nợ</SelectItem>
              <SelectItem key="false" textValue="Không nợ">Không nợ</SelectItem>
            </Select>
            <Select
              size="sm"
              variant="bordered"
              className="w-52"
              aria-label="Sắp xếp"
              selectedKeys={new Set([sort])}
              onChange={(e) => { const v = e.target.value; setSort(v); setPage(1); load(search, 1, pageSize, hasDebt, v); }}
            >
              <SelectItem key="" textValue="Tên A→Z">Tên A→Z</SelectItem>
              <SelectItem key="debt-desc" textValue="Công nợ cao nhất">Công nợ cao nhất</SelectItem>
              <SelectItem key="debt-asc" textValue="Công nợ thấp nhất">Công nợ thấp nhất</SelectItem>
            </Select>
            <Button variant="flat" size="sm" onPress={() => load(search, 1, pageSize)}>Tìm</Button>
            <Button color="primary" size="sm" startContent={<RiAddLine size={16} />} onPress={openCreate}>Thêm đối tác</Button>
          </div>
        </div>

        <div className="overflow-x-auto">
        <Table removeWrapper aria-label="Danh sách đối tác" classNames={{ th: "px-4 first:pl-5 last:pr-5", td: "px-4 py-3 first:pl-5 last:pr-5" }}>
          <TableHeader>
            <TableColumn>ĐỐI TÁC</TableColumn>
            <TableColumn>NGƯỜI LIÊN HỆ</TableColumn>
            <TableColumn>LIÊN HỆ</TableColumn>
            <TableColumn>CÔNG NỢ</TableColumn>
            <TableColumn>TRẠNG THÁI</TableColumn>
            <TableColumn> </TableColumn>
          </TableHeader>
          <TableBody
            items={partners}
            isLoading={loading}
            loadingContent={<Spinner color="primary" />}
            emptyContent="Chưa có đối tác nào."
          >
            {(p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-semibold text-gray-800 dark:text-gray-100 text-sm">{p.company_name}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-400">{p.short_name || `#${p.id}`}</span>
                  </div>
                </TableCell>
                <TableCell>{p.contact_person || "Chưa cập nhật"}</TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="text-sm">{p.phone || "-"}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-400">{p.email || "Không có email"}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className={`text-sm font-semibold ${Number(p.total_remaining || 0) > 0 ? "text-rose-600 dark:text-rose-300" : "text-emerald-600 dark:text-emerald-300"}`}>{fmt(p.total_remaining)}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-400">{p.debt_count || 0} khoản nợ</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Chip size="sm" variant="flat" color={Number(p.total_remaining || 0) > 0 ? "danger" : "success"}>
                    {Number(p.total_remaining || 0) > 0 ? "Có công nợ" : "Không nợ"}
                  </Chip>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1 justify-end">
                    <Button size="sm" variant="flat" color="primary" startContent={<RiPencilLine size={13} />} onPress={() => openEdit(p)}>Sửa</Button>
                    <Button size="sm" variant="flat" color="warning" startContent={<RiFileList3Line size={13} />} isDisabled={Number(p.debt_count || 0) === 0} onPress={() => openDebtModal(p)}>Xem công nợ</Button>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        </div>

        {partners.length > 0 && (
          <div className="px-5 py-4 border-t border-gray-100 dark:border-white/10">
            <PaginationBar
              page={page}
              pageSize={pageSize}
              totalItems={pagination.total}
              totalPages={pagination.totalPages}
              onPageChange={(p) => { setPage(p); load(search, p, pageSize); }}
              onPageSizeChange={(size) => { setPageSize(size); setPage(1); load(search, 1, size); }}
            />
          </div>
        )}
      </div>

      <PartnerFormModal
        open={modalOpen}
        editing={editing}
        form={form}
        setForm={setForm}
        saving={saving}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmit}
      />

      <PartnerDebtModal
        open={debtModalOpen}
        partner={selectedPartner}
        debts={selectedDebts}
        loading={debtLoading}
        onClose={() => { setDebtModalOpen(false); setSelectedPartner(null); setSelectedDebts([]); }}
      />
    </div>
  );
}
