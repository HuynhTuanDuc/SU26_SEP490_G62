import { useEffect, useState } from "react";
import {
  Button, Input, Select, SelectItem, Textarea, Chip, Spinner,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
} from "@heroui/react";
import { RiAddLine, RiSearchLine, RiPencilLine, RiDeleteBinLine } from "react-icons/ri";

const EMPTY_FORM = {
  customer_type: "individual",
  full_name: "",
  company_name: "",
  contact_person: "",
  phone: "",
  email: "",
  address: "",
  tax_code: "",
  notes: "",
};

/**
 * Quản lý khách hàng — dùng chung cho Coordinator + Manager.
 * apiRequest được inject qua prop `api` để tránh phụ thuộc trực tiếp vào 1 service file cụ thể.
 */
export function CustomerManagement({ getCustomers, createCustomer, updateCustomer, deleteCustomer }) {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState(null);

  const load = async (page = 1) => {
    setLoading(true);
    try {
      const data = await getCustomers({
        page: String(page),
        limit: String(pagination.limit),
        search: search.trim(),
        type: typeFilter,
        sort: sortBy,
      });
      setCustomers(data.customers || []);
      setPagination(data.pagination || { page, limit: 20, total: 0 });
    } catch (err) {
      setError(err.message ?? "Không thể tải danh sách khách hàng.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => load(1), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, typeFilter, sortBy]);

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setError(null);
  };

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (customer) => {
    setEditing(customer);
    setForm({
      customer_type: customer.customer_type || "individual",
      full_name: customer.full_name || "",
      company_name: customer.company_name || "",
      contact_person: customer.contact_person || "",
      phone: customer.phone || "",
      email: customer.email || "",
      address: customer.address || "",
      tax_code: customer.tax_code || "",
      notes: customer.notes || "",
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await updateCustomer(editing.id, form);
      } else {
        await createCustomer(form);
      }
      closeModal();
      load(pagination.page);
    } catch (err) {
      setError(err.message ?? "Không thể lưu khách hàng.");
    } finally {
      setSaving(false);
    }
  };

  const [deleteTarget, setDeleteTarget] = useState(null);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteCustomer(deleteTarget.id);
      setDeleteTarget(null);
      load(pagination.page);
    } catch (err) {
      setError(err.message ?? "Không thể xóa khách hàng.");
      setDeleteTarget(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Input
            value={search}
            onValueChange={setSearch}
            placeholder="Tìm tên, SĐT, MST khách hàng..."
            startContent={<RiSearchLine size={15} className="text-gray-400" />}
            variant="bordered"
            size="sm"
            isClearable
            onClear={() => setSearch("")}
            classNames={{ base: "w-80", inputWrapper: "bg-white h-9 rounded-lg" }}
          />
          <Select
            placeholder="Loại khách hàng"
            selectedKeys={new Set([typeFilter])}
            onSelectionChange={(keys) => setTypeFilter([...keys][0] ?? "")}
            variant="bordered"
            size="sm"
            className="w-44"
          >
            <SelectItem key="" textValue="Tất cả">Tất cả</SelectItem>
            <SelectItem key="individual" textValue="Cá nhân">Cá nhân</SelectItem>
            <SelectItem key="business" textValue="Doanh nghiệp">Doanh nghiệp</SelectItem>
          </Select>
          <Select
            placeholder="Sắp xếp"
            selectedKeys={new Set([sortBy])}
            onSelectionChange={(keys) => setSortBy([...keys][0] ?? "newest")}
            variant="bordered"
            size="sm"
            className="w-48"
          >
            <SelectItem key="newest" textValue="Mới nhất">Mới nhất</SelectItem>
            <SelectItem key="name_asc" textValue="Tên A-Z">Tên A→Z</SelectItem>
            <SelectItem key="orders_desc" textValue="Số đơn nhiều nhất">Số đơn nhiều nhất</SelectItem>
          </Select>
        </div>
        <Button color="primary" size="sm" startContent={<RiAddLine size={16} />} onPress={openCreate} className="h-9 font-medium px-4">
          Thêm khách hàng
        </Button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <Table
          removeWrapper
          aria-label="Danh sách khách hàng"
          classNames={{ th: "px-4 first:pl-5 last:pr-5", td: "px-4 py-3 first:pl-5 last:pr-5" }}
          bottomContent={
            pagination.total > pagination.limit ? (
              <div className="flex justify-center py-3">
                <div className="flex gap-1">
                  {Array.from({ length: Math.ceil(pagination.total / pagination.limit) }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      onClick={() => load(p)}
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
            <TableColumn>KHÁCH HÀNG</TableColumn>
            <TableColumn>LIÊN HỆ</TableColumn>
            <TableColumn>SĐT</TableColumn>
            <TableColumn>EMAIL</TableColumn>
            <TableColumn>MST</TableColumn>
            <TableColumn>SỐ ĐƠN</TableColumn>
            <TableColumn> </TableColumn>
          </TableHeader>
          <TableBody
            items={customers}
            isLoading={loading}
            loadingContent={<Spinner color="primary" />}
            emptyContent="Chưa có khách hàng nào."
          >
            {(c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-gray-800 text-sm">
                      {c.customer_type === "business" ? c.company_name : c.full_name}
                    </span>
                    <Chip size="sm" variant="flat" color={c.customer_type === "business" ? "primary" : "default"} className="w-fit">
                      {c.customer_type === "business" ? "Doanh nghiệp" : "Cá nhân"}
                    </Chip>
                  </div>
                </TableCell>
                <TableCell>{c.contact_person || "-"}</TableCell>
                <TableCell>{c.phone}</TableCell>
                <TableCell>{c.email || "-"}</TableCell>
                <TableCell>{c.tax_code || "-"}</TableCell>
                <TableCell>{c.total_orders ?? 0}</TableCell>
                <TableCell>
                  <div className="flex gap-1 justify-end">
                    <Button size="sm" variant="flat" color="primary" startContent={<RiPencilLine size={13} />} onPress={() => openEdit(c)}>Sửa</Button>
                    <Button size="sm" variant="flat" color="danger" startContent={<RiDeleteBinLine size={13} />} onPress={() => setDeleteTarget(c)}>Xóa</Button>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Modal isOpen={modalOpen} onOpenChange={(open) => !open && closeModal()} size="2xl">
        <ModalContent>
          <ModalHeader>{editing ? `Sửa khách hàng #${editing.id}` : "Thêm khách hàng mới"}</ModalHeader>
          <ModalBody className="gap-4">
            {error && <p className="text-xs text-rose-500">{error}</p>}
            <div className="grid grid-cols-3 gap-3">
              <Select
                label="Loại khách hàng"
                selectedKeys={[form.customer_type]}
                onSelectionChange={(keys) => setForm((p) => ({ ...p, customer_type: [...keys][0] }))}
                variant="bordered"
              >
                <SelectItem key="individual">Cá nhân</SelectItem>
                <SelectItem key="business">Doanh nghiệp</SelectItem>
              </Select>
              <Input label="Số điện thoại *" value={form.phone} onValueChange={(v) => setForm((p) => ({ ...p, phone: v }))} variant="bordered" />
              <Input label="Email" value={form.email} onValueChange={(v) => setForm((p) => ({ ...p, email: v }))} variant="bordered" />
            </div>

            {form.customer_type === "business" ? (
              <div className="grid grid-cols-2 gap-3">
                <Input label="Tên công ty *" value={form.company_name} onValueChange={(v) => setForm((p) => ({ ...p, company_name: v }))} variant="bordered" />
                <Input label="Người liên hệ" value={form.contact_person} onValueChange={(v) => setForm((p) => ({ ...p, contact_person: v }))} variant="bordered" />
              </div>
            ) : (
              <Input label="Tên khách hàng *" value={form.full_name} onValueChange={(v) => setForm((p) => ({ ...p, full_name: v }))} variant="bordered" />
            )}

            <div className="grid grid-cols-2 gap-3">
              <Input label="Mã số thuế" value={form.tax_code} onValueChange={(v) => setForm((p) => ({ ...p, tax_code: v }))} variant="bordered" />
              <Input label="Địa chỉ" value={form.address} onValueChange={(v) => setForm((p) => ({ ...p, address: v }))} variant="bordered" />
            </div>

            <Textarea label="Ghi chú" value={form.notes} onValueChange={(v) => setForm((p) => ({ ...p, notes: v }))} variant="bordered" minRows={3} />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={closeModal}>Đóng</Button>
            <Button color="primary" isLoading={saving} onPress={handleSubmit}>Lưu</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)} size="sm">
        <ModalContent>
          <ModalHeader>Xóa khách hàng</ModalHeader>
          <ModalBody>
            <p className="text-sm text-gray-500">
              Xóa khách hàng "{deleteTarget?.full_name || deleteTarget?.company_name}"? Hành động này không thể hoàn tác.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setDeleteTarget(null)}>Đóng</Button>
            <Button color="danger" onPress={handleDelete}>Xóa</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

export default CustomerManagement;
