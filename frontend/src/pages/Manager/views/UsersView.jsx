import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  Button, Input, Chip, Spinner, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
} from "@heroui/react";
import { RiSearchLine, RiAddLine, RiDownloadLine, RiUploadLine, RiLockLine, RiLockUnlockLine, RiPencilLine } from "react-icons/ri";
import { useRoleRealtime } from "../../../hooks/useRoleRealtime";
import { PaginationBar } from "../../../components/shared-ui/PaginationBar";
import UserFormModal from "../modals/UserFormModal";
import { managerService } from "../services/manager.service";

const GENDER_LABEL = { male: "Nam", female: "Nữ", other: "Khác" };
const ROLE_COLOR = { manager: "danger", coordinator: "primary", accountant: "secondary", driver: "warning" };

const IMPORT_HEADERS = [
  "email", "full_name", "phone", "role", "gender", "dob", "city", "address", "country",
  "national_id", "tax_code", "emergency_contact_name", "emergency_contact_phone", "notes",
];

const SAMPLE_ROWS = [
  {
    email: "coordinator.new@example.com", full_name: "Nguyễn Văn Điều Phối", phone: "0912345678",
    role: "coordinator", gender: "male", dob: "1994-05-10", city: "Ho Chi Minh",
    address: "12 Nguyen Hue, District 1", country: "VN", national_id: "079194123456", tax_code: "",
    emergency_contact_name: "Nguyen Thi Lan", emergency_contact_phone: "0901234567", notes: "Nhân sự điều phối mới",
  },
  {
    email: "driver.new@example.com", full_name: "Trần Tài Xế", phone: "0987654321",
    role: "driver", gender: "female", dob: "1997-08-21", city: "Da Nang",
    address: "88 Le Loi, Hai Chau", country: "VN", national_id: "079197987654", tax_code: "",
    emergency_contact_name: "Tran Van B", emergency_contact_phone: "0907654321", notes: "Lưu ý điền đầy đủ các cột bắt buộc",
  },
];

const formatDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("vi-VN");
};

const normalizeText = (value) => {
  if (value === undefined || value === null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
};

const normalizeImportedDate = (value) => {
  if (value === undefined || value === null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const parsedDate = new Date(raw);
  return Number.isNaN(parsedDate.getTime()) ? raw : parsedDate.toISOString().slice(0, 10);
};

const isRowEmpty = (row) => IMPORT_HEADERS.every((h) => !normalizeText(row?.[h]));

const buildImportedPayload = (row) => ({
  email: normalizeText(row.email).toLowerCase(),
  full_name: normalizeText(row.full_name),
  phone: normalizeText(row.phone),
  role: normalizeText(row.role).toLowerCase(),
  gender: normalizeText(row.gender).toLowerCase(),
  dob: normalizeImportedDate(row.dob),
  city: normalizeText(row.city),
  address: normalizeText(row.address),
  country: normalizeText(row.country) || "VN",
  national_id: normalizeText(row.national_id),
  tax_code: normalizeText(row.tax_code),
  emergency_contact_name: normalizeText(row.emergency_contact_name),
  emergency_contact_phone: normalizeText(row.emergency_contact_phone),
  notes: normalizeText(row.notes),
});

export default function UsersView({ user }) {
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [toggleTarget, setToggleTarget] = useState(null);
  const fileInputRef = useRef(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await managerService.getUsers();
      setAllUsers(data.users || []);
    } catch (error) {
      alert(`Lỗi: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  useRoleRealtime(user, {
    onMessage: (payload) => { if (payload?.type === "manager.users.changed") fetchUsers(); },
  });

  const filtered = allUsers.filter((u) => {
    const q = search.toLowerCase();
    return (
      String(u.id).includes(q) || (u.full_name || "").toLowerCase().includes(q) ||
      (u.email || "").toLowerCase().includes(q) || (u.phone || "").toLowerCase().includes(q) ||
      (u.role || "").toLowerCase().includes(q) || (u.city || "").toLowerCase().includes(q)
    );
  });

  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const handleDownloadSample = () => {
    const worksheet = XLSX.utils.json_to_sheet(SAMPLE_ROWS, { header: IMPORT_HEADERS });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "users");
    XLSX.writeFile(workbook, "user-import-sample.xlsx");
  };

  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImporting(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const firstSheet = workbook.SheetNames[0];
      if (!firstSheet) throw new Error("File Excel không có sheet nào.");

      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: "", raw: false });
      const missingHeaders = IMPORT_HEADERS.filter((h) => !(h in (rows[0] || {})));
      if (missingHeaders.length > 0) throw new Error(`File thiếu cột: ${missingHeaders.join(", ")}`);

      const numberedRows = rows.map((row, index) => ({ row, rowNumber: index + 2 }));
      const skippedRows = numberedRows.filter(({ row }) => isRowEmpty(row));
      const importRows = numberedRows.filter(({ row }) => !isRowEmpty(row));
      if (importRows.length === 0) throw new Error("File Excel không có dòng dữ liệu hợp lệ.");

      const successes = [];
      const failures = [];

      for (const { row, rowNumber } of importRows) {
        const payload = buildImportedPayload(row);
        if (!payload.email || !payload.full_name || !payload.phone || !payload.role) {
          failures.push({ row: rowNumber, message: "Thiếu email, full_name, phone hoặc role." });
          continue;
        }
        try {
          await managerService.createUser(payload);
          successes.push({ row: rowNumber, email: payload.email });
        } catch (error) {
          failures.push({ row: rowNumber, message: error.message || "Không thể tạo người dùng." });
        }
      }

      if (successes.length > 0) await fetchUsers();
      setImportResult({ successes, failures, skippedRows, total: importRows.length });
    } catch (error) {
      alert(error.message || "Không thể import file Excel.");
    } finally {
      setImporting(false);
    }
  };

  const handleSaveUser = async (formData) => {
    try {
      if (editingUser) await managerService.updateUser(editingUser.id, formData);
      else await managerService.createUser(formData);
      setModalOpen(false);
      fetchUsers();
    } catch (error) {
      alert(error.message || "Đã có lỗi xảy ra.");
    }
  };

  const handleToggleStatus = async () => {
    if (!toggleTarget) return;
    try {
      await managerService.toggleUserStatus(toggleTarget.id, !toggleTarget.is_active);
      setToggleTarget(null);
      fetchUsers();
    } catch (error) {
      alert(error.message || "Đã có lỗi.");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <span className="text-sm font-bold text-gray-800">Danh sách tài khoản</span>
          <span className="text-xs text-gray-400 ml-2">Tổng: {filtered.length} / {allUsers.length} người dùng</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="flat" size="sm" startContent={<RiDownloadLine size={15} />} onPress={handleDownloadSample}>Tải file mẫu</Button>
          <Button variant="flat" size="sm" startContent={<RiUploadLine size={15} />} isLoading={importing} onPress={() => fileInputRef.current?.click()}>Import Excel</Button>
          <Button color="primary" size="sm" startContent={<RiAddLine size={16} />} onPress={() => { setEditingUser(null); setModalOpen(true); }}>Thêm người dùng</Button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
        </div>
      </div>

      <Input
        placeholder="Tìm kiếm theo tên, email, SĐT, vai trò..."
        value={search}
        onValueChange={(v) => { setSearch(v); setPage(1); }}
        startContent={<RiSearchLine size={15} className="text-gray-400" />}
        variant="bordered"
        isClearable
        className="max-w-md"
      />

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <Table removeWrapper aria-label="Danh sách người dùng" classNames={{ th: "px-4 first:pl-5 last:pr-5", td: "px-4 py-3 first:pl-5 last:pr-5" }}>
          <TableHeader>
            <TableColumn>HỌ VÀ TÊN</TableColumn>
            <TableColumn>EMAIL</TableColumn>
            <TableColumn>SỐ ĐT</TableColumn>
            <TableColumn>GIỚI TÍNH</TableColumn>
            <TableColumn>NGÀY SINH</TableColumn>
            <TableColumn>QUÊ QUÁN</TableColumn>
            <TableColumn>VAI TRÒ</TableColumn>
            <TableColumn>TRẠNG THÁI</TableColumn>
            <TableColumn> </TableColumn>
          </TableHeader>
          <TableBody items={paged} isLoading={loading} loadingContent={<Spinner color="primary" />} emptyContent="Không có người dùng nào.">
            {(u) => (
              <TableRow key={u.id}>
                <TableCell>{u.full_name || <span className="text-gray-300">Chưa cập nhật</span>}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>{u.phone || "-"}</TableCell>
                <TableCell>{GENDER_LABEL[u.gender] || "-"}</TableCell>
                <TableCell>{formatDate(u.dob) || "-"}</TableCell>
                <TableCell>{u.city || "-"}</TableCell>
                <TableCell><Chip size="sm" variant="flat" color={ROLE_COLOR[u.role] || "default"}>{(u.role || "").toUpperCase()}</Chip></TableCell>
                <TableCell><Chip size="sm" variant="flat" color={u.is_active ? "success" : "danger"}>{u.is_active ? "Hoạt động" : "Đã khóa"}</Chip></TableCell>
                <TableCell>
                  <div className="flex gap-1 justify-end">
                    <Button size="sm" variant="flat" color="primary" startContent={<RiPencilLine size={13} />} isDisabled={u.role === "manager"} onPress={() => { setEditingUser(u); setModalOpen(true); }}>Sửa</Button>
                    <Button
                      size="sm"
                      variant="flat"
                      color={u.is_active ? "danger" : "success"}
                      isDisabled={u.role === "manager"}
                      startContent={u.is_active ? <RiLockLine size={13} /> : <RiLockUnlockLine size={13} />}
                      onPress={() => setToggleTarget(u)}
                    >
                      {u.is_active ? "Khóa" : "Mở khóa"}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <div className="px-5 py-3">
          <PaginationBar page={page} pageSize={pageSize} totalItems={filtered.length} totalPages={Math.max(1, Math.ceil(filtered.length / pageSize))} onPageChange={setPage} />
        </div>
      </div>

      <UserFormModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onSave={handleSaveUser} editingUser={editingUser} />

      <Modal isOpen={!!toggleTarget} onOpenChange={(open) => !open && setToggleTarget(null)} size="sm">
        <ModalContent>
          <ModalHeader>Xác nhận</ModalHeader>
          <ModalBody>
            <p className="text-sm text-gray-600">
              Bạn có chắc muốn {toggleTarget?.is_active ? "khóa" : "mở khóa"} tài khoản "{toggleTarget?.full_name || toggleTarget?.email}"?
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setToggleTarget(null)}>Hủy</Button>
            <Button color="danger" onPress={handleToggleStatus}>Xác nhận</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={!!importResult} onOpenChange={(open) => !open && setImportResult(null)} size="2xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader>Kết quả import nhân viên</ModalHeader>
          <ModalBody className="gap-3">
            {importResult && (
              <>
                <p className="text-sm text-gray-700">Đã tạo thành công {importResult.successes.length}/{importResult.total} nhân viên từ file.</p>
                {importResult.skippedRows.length > 0 && (
                  <p className="text-xs text-gray-400">Đã bỏ qua {importResult.skippedRows.length} dòng trống (dòng {importResult.skippedRows.map((s) => s.rowNumber).join(", ")}).</p>
                )}
                {importResult.failures.length > 0 && (
                  <div className="rounded-xl border border-rose-100 bg-rose-50/40 p-3 max-h-60 overflow-y-auto">
                    <p className="text-xs font-bold text-rose-600 mb-2">Có {importResult.failures.length} dòng chưa import được:</p>
                    {importResult.failures.slice(0, 20).map((f) => (
                      <p key={`${f.row}-${f.message}`} className="text-xs text-rose-500">Dòng {f.row}: {f.message}</p>
                    ))}
                  </div>
                )}
              </>
            )}
          </ModalBody>
          <ModalFooter>
            <Button color="primary" onPress={() => setImportResult(null)}>Đóng</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
