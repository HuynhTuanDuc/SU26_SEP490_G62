import { useEffect, useMemo, useRef, useState } from "react";
import { notify } from "../../../components/shared-ui/Toast";
import {
  Button, Input, Chip, Spinner, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell, Select, SelectItem,
} from "@heroui/react";
import { RiSearchLine, RiAddLine, RiDownloadLine, RiUploadLine, RiLockLine, RiLockUnlockLine, RiPencilLine, RiKeyLine, RiBriefcaseLine, RiUserUnfollowLine } from "react-icons/ri";
import { useRoleRealtime } from "../../../hooks/useRoleRealtime";
import { PaginationBar } from "../../../components/shared-ui/PaginationBar";
import UserFormModal from "../modals/UserFormModal";
import DriverEmploymentModal from "../modals/DriverEmploymentModal";
import TerminateContractModal from "../modals/TerminateContractModal";
import { managerService } from "../services/manager.service";
import { APP_NAME } from "../../../constants/brand";

const GENDER_LABEL = { male: "Nam", female: "Nữ", other: "Khác" };
const ROLE_COLOR = { manager: "danger", coordinator: "primary", accountant: "secondary", driver: "warning" };
const ROLE_LABEL = { manager: "Quản lý", coordinator: "Điều phối viên", accountant: "Kế toán", driver: "Tài xế" };

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
  // Dòng mẫu CỐ Ý để trống email — cho người nhập thấy ngay là được phép, thay vì
  // phải đọc sheet hướng dẫn mới biết.
  {
    email: "", full_name: "Lê Tài Xế Không Email", phone: "0978123456",
    role: "driver", gender: "male", dob: "1990-03-02", city: "Ha Noi",
    address: "5 Tran Duy Hung, Cau Giay", country: "VN", national_id: "001190445566", tax_code: "",
    emergency_contact_name: "Le Thi C", emergency_contact_phone: "0912000333",
    notes: "Không có email — mật khẩu sẽ hiện ở bảng kết quả import, nhớ chép lại",
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
    const parsed = normalizeImportedDate.xlsx?.SSF.parse_date_code(value);
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

const loadExcelJS = async () => {
  const mod = await import("exceljs");
  return mod.default || mod;
};

const loadXLSX = async () => import("xlsx");

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
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortBy, setSortBy] = useState("name_asc");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [toggleTarget, setToggleTarget] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [resetting, setResetting] = useState(false);
  // Hồ sơ công việc (ngày vào làm / ngày nghỉ việc) của tài xế đang mở
  const [employmentTarget, setEmploymentTarget] = useState(null);
  // Tài xế đang được chấm dứt hợp đồng (thay cho nút Khóa ở dòng tài xế)
  const [terminateTarget, setTerminateTarget] = useState(null);
  // Mật khẩu của tài khoản không có email — chỉ tồn tại đúng một lần trong response,
  // hiển thị riêng để quản lý chép lại trước khi đóng.
  const [passwordHandover, setPasswordHandover] = useState(null);
  const fileInputRef = useRef(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await managerService.getUsers();
      setAllUsers(data.users || []);
    } catch (error) {
      notify.error(`Lỗi: ${error.message}`);
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
    const matchesSearch = (
      String(u.id).includes(q) || (u.full_name || "").toLowerCase().includes(q) ||
      (u.email || "").toLowerCase().includes(q) || (u.phone || "").toLowerCase().includes(q) ||
      (u.role || "").toLowerCase().includes(q) || (u.city || "").toLowerCase().includes(q)
    );
    const matchesRole = !roleFilter || u.role === roleFilter;
    const matchesStatus = !statusFilter || String(!!u.is_active) === statusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  });

  const sorted = useMemo(() => {
    const list = [...filtered];
    switch (sortBy) {
      case "name_desc":
        return list.sort((a, b) => (b.full_name || "").localeCompare(a.full_name || ""));
      case "role":
        return list.sort((a, b) => (ROLE_LABEL[a.role] || a.role || "").localeCompare(ROLE_LABEL[b.role] || b.role || ""));
      case "status":
        return list.sort((a, b) => Number(!!b.is_active) - Number(!!a.is_active));
      case "name_asc":
      default:
        return list.sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
    }
  }, [filtered, sortBy]);

  useEffect(() => { setPage(1); }, [roleFilter, statusFilter, sortBy]);

  const paged = sorted.slice((page - 1) * pageSize, page * pageSize);

  const handleDownloadSample = async () => {
    const ExcelJS = await loadExcelJS();
    // email KHÔNG nằm trong danh sách bắt buộc — nhân viên không có email vẫn đăng nhập
    // được bằng số điện thoại, ép nhập chỉ khiến người dùng bịa địa chỉ giả cho qua form.
    const REQUIRED_HEADERS = new Set(["full_name", "phone", "role"]);
    const BRAND_BLUE = "FF2563EB";
    const HEADER_TEXT = "FFFFFFFF";
    const REQUIRED_FILL = "FFF59E0B";
    const ZEBRA_FILL = "FFF8FAFC";
    const BORDER_COLOR = "FFE2E8F0";
    const thinBorder = { style: "thin", color: { argb: BORDER_COLOR } };

    const wb = new ExcelJS.Workbook();
    wb.creator = APP_NAME;
    wb.created = new Date();

    const ws = wb.addWorksheet("users", { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = IMPORT_HEADERS.map((h) => ({ header: h, key: h, width: Math.max(h.length + 2, 16) }));

    const headerRow = ws.getRow(1);
    headerRow.height = 24;
    headerRow.eachCell((cell, colNumber) => {
      const h = IMPORT_HEADERS[colNumber - 1];
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: REQUIRED_HEADERS.has(h) ? REQUIRED_FILL : BRAND_BLUE } };
      cell.font = { bold: true, color: { argb: HEADER_TEXT }, size: 11 };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = { top: thinBorder, left: thinBorder, right: thinBorder, bottom: thinBorder };
    });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: IMPORT_HEADERS.length } };

    SAMPLE_ROWS.forEach((sample, i) => {
      const row = ws.addRow(IMPORT_HEADERS.map((h) => sample[h] ?? ""));
      row.eachCell((cell) => {
        cell.border = { top: thinBorder, left: thinBorder, right: thinBorder, bottom: thinBorder };
        cell.alignment = { vertical: "middle" };
        if (i % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA_FILL } };
      });
    });

    // Dropdown cho "role" và "gender" — áp dụng 300 dòng đầu để chừa chỗ nhập thêm
    const roleColIndex = IMPORT_HEADERS.indexOf("role") + 1;
    const genderColIndex = IMPORT_HEADERS.indexOf("gender") + 1;
    const roleOptions = Object.keys(ROLE_LABEL);
    const genderOptions = Object.keys(GENDER_LABEL);
    for (let r = 2; r <= 300; r += 1) {
      ws.getCell(r, roleColIndex).dataValidation = {
        type: "list", allowBlank: true,
        formulae: [`"${roleOptions.join(",")}"`],
        showErrorMessage: true, errorTitle: "Vai trò không hợp lệ",
        error: `Chỉ chọn 1 trong: ${roleOptions.join(" / ")}`,
      };
      ws.getCell(r, genderColIndex).dataValidation = {
        type: "list", allowBlank: true,
        formulae: [`"${genderOptions.join(",")}"`],
        showErrorMessage: true, errorTitle: "Giới tính không hợp lệ",
        error: `Chỉ chọn 1 trong: ${genderOptions.join(" / ")}`,
      };
    }

    // ─── Sheet hướng dẫn ────────────────────────────────────────────────────
    const wsGuide = wb.addWorksheet("HUONG_DAN", { views: [{ showGridLines: false }] });
    wsGuide.columns = [{ width: 24 }, { width: 70 }];

    const titleRow = wsGuide.addRow(["HƯỚNG DẪN NHẬP LIỆU — TEMPLATE IMPORT NGƯỜI DÙNG"]);
    wsGuide.mergeCells(`A${titleRow.number}:B${titleRow.number}`);
    titleRow.height = 28;
    titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: HEADER_TEXT } };
    titleRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_BLUE } };
    titleRow.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    wsGuide.addRow([]);

    const addNote = (text) => {
      const row = wsGuide.addRow([text]);
      wsGuide.mergeCells(`A${row.number}:B${row.number}`);
      row.getCell(1).font = { size: 10.5 };
      row.getCell(1).alignment = { wrapText: true, vertical: "top" };
    };
    addNote("• Cột có nền cam ở sheet \"users\" (full_name, phone, role) là BẮT BUỘC — thiếu sẽ bị từ chối.");
    addNote("• email KHÔNG bắt buộc. Nhân viên không có email vẫn đăng nhập được bằng số điện thoại.");
    addNote("• Có email: hệ thống gửi mật khẩu khởi tạo qua mail. Không có email: mật khẩu hiện ở bảng kết quả import — hãy chép lại và giao tận tay, vì không xem lại được.");
    addNote("• Đã nhập email thì phải đúng định dạng (vd nguyenvana@gmail.com) — sai sẽ bị từ chối cả dòng.");
    addNote("• Ngày sinh (dob) nhập dạng yyyy-mm-dd hoặc dd/mm/yyyy.");
    addNote("• country để trống sẽ mặc định là VN.");
    wsGuide.addRow([]);

    const roleTableHeader = wsGuide.addRow(["Giá trị role", "Diễn giải"]);
    roleTableHeader.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: HEADER_TEXT } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_BLUE } };
      cell.border = { top: thinBorder, left: thinBorder, right: thinBorder, bottom: thinBorder };
    });
    roleOptions.forEach((r, i) => {
      const row = wsGuide.addRow([r, ROLE_LABEL[r]]);
      row.eachCell((cell) => {
        cell.border = { top: thinBorder, left: thinBorder, right: thinBorder, bottom: thinBorder };
        if (i % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA_FILL } };
      });
    });

    wsGuide.addRow([]);
    const genderTableHeader = wsGuide.addRow(["Giá trị gender", "Diễn giải"]);
    genderTableHeader.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: HEADER_TEXT } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_BLUE } };
      cell.border = { top: thinBorder, left: thinBorder, right: thinBorder, bottom: thinBorder };
    });
    genderOptions.forEach((g, i) => {
      const row = wsGuide.addRow([g, GENDER_LABEL[g]]);
      row.eachCell((cell) => {
        cell.border = { top: thinBorder, left: thinBorder, right: thinBorder, bottom: thinBorder };
        if (i % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA_FILL } };
      });
    });

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "user-import-sample.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImporting(true);
    try {
      const XLSX = await loadXLSX();
      normalizeImportedDate.xlsx = XLSX;
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
        // email KHÔNG còn bắt buộc — nhân viên không có email vẫn đăng nhập bằng SĐT.
        if (!payload.full_name || !payload.phone || !payload.role) {
          failures.push({ row: rowNumber, message: "Thiếu full_name, phone hoặc role." });
          continue;
        }
        // Có nhập thì phải đúng định dạng: địa chỉ sai chính tả khiến mật khẩu khởi tạo
        // gửi đi lạc mà không ai biết — tệ hơn là bỏ trống.
        if (payload.email && !/^\S+@\S+\.\S+$/.test(payload.email)) {
          failures.push({ row: rowNumber, message: `Email không hợp lệ: ${payload.email}` });
          continue;
        }
        try {
          const created = await managerService.createUser(payload);
          successes.push({
            row: rowNumber,
            email: payload.email,
            full_name: payload.full_name,
            // Dòng không có email thì mật khẩu khởi tạo CHỈ có ở đây — hiển thị để quản
            // lý chép lại, không có lần thứ hai để lấy.
            initialPassword: created?.initial_password ?? null,
          });
        } catch (error) {
          failures.push({ row: rowNumber, message: error.message || "Không thể tạo người dùng." });
        }
      }

      if (successes.length > 0) await fetchUsers();
      setImportResult({
        successes,
        failures,
        skippedRows,
        total: importRows.length,
        // Chỉ những dòng backend trả về mật khẩu (tức là không có email) mới cần giao tay
        needPasswordHandover: successes.filter((s) => s.initialPassword),
      });
      notify.success(`Import xong: ${successes.length} thành công, ${failures.length} lỗi.`);
    } catch (error) {
      notify.error(error.message || "Không thể import file Excel.");
    } finally {
      setImporting(false);
    }
  };

  const handleSaveUser = async (formData) => {
    try {
      if (editingUser) {
        await managerService.updateUser(editingUser.id, formData);
        notify.success("Đã cập nhật tài khoản.");
      } else {
        const created = await managerService.createUser(formData);
        // Không có email → mật khẩu khởi tạo chỉ có trong response này, phải cho quản lý
        // chép lại ngay chứ không nằm trong toast rồi biến mất.
        if (created?.initial_password) {
          setPasswordHandover({
            title: "Đã tạo tài khoản — chưa có email",
            full_name: formData.full_name,
            password: created.initial_password,
          });
        } else {
          notify.success("Đã tạo tài khoản. Thông tin đăng nhập đã gửi qua email.");
        }
      }
      setModalOpen(false);
      fetchUsers();
    } catch (error) {
      notify.error(error.message || "Đã có lỗi xảy ra.");
    }
  };

  const handleToggleStatus = async () => {
    if (!toggleTarget) return;
    try {
      await managerService.toggleUserStatus(toggleTarget.id, !toggleTarget.is_active);
      setToggleTarget(null);
      fetchUsers();
      notify.success("Đã cập nhật trạng thái tài khoản.");
    } catch (error) {
      notify.error(error.message || "Đã có lỗi.");
    }
  };

  const handleResetPassword = async () => {
    if (!resetTarget) return;
    setResetting(true);
    try {
      const result = await managerService.resetUserPassword(resetTarget.id);
      const targetName = resetTarget.full_name || resetTarget.email || `#${resetTarget.id}`;
      setResetTarget(null);
      if (result?.new_password) {
        setPasswordHandover({
          title: "Đã reset mật khẩu — tài khoản chưa có email",
          full_name: targetName,
          password: result.new_password,
        });
      } else {
        notify.success("Đã reset mật khẩu. Mật khẩu tạm thời đã được gửi qua email của nhân viên.");
      }
    } catch (error) {
      notify.error(error.message || "Không thể reset mật khẩu.");
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <span className="text-sm font-bold text-gray-800 dark:text-gray-100">Danh sách tài khoản</span>
          <span className="text-xs text-gray-400 dark:text-gray-400 ml-2">Tổng: {filtered.length} / {allUsers.length} người dùng</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="flat" size="sm" startContent={<RiDownloadLine size={15} />} onPress={handleDownloadSample}>Tải file mẫu</Button>
          <Button variant="flat" size="sm" startContent={<RiUploadLine size={15} />} isLoading={importing} onPress={() => fileInputRef.current?.click()}>Import Excel</Button>
          <Button color="primary" size="sm" startContent={<RiAddLine size={16} />} onPress={() => { setEditingUser(null); setModalOpen(true); }}>Thêm người dùng</Button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Input
          placeholder="Tìm kiếm theo tên, email, SĐT, vai trò..."
          value={search}
          onValueChange={(v) => { setSearch(v); setPage(1); }}
          startContent={<RiSearchLine size={15} className="text-gray-400 dark:text-gray-400" />}
          variant="bordered"
          size="sm"
          isClearable
          className="max-w-md"
        />
        <Select
          size="sm"
          variant="bordered"
          className="w-44"
          selectedKeys={new Set([roleFilter])}
          onSelectionChange={(keys) => setRoleFilter([...keys][0] ?? "")}
        >
          <SelectItem key="" textValue="Tất cả vai trò">Tất cả vai trò</SelectItem>
          {Object.entries(ROLE_LABEL).map(([k, v]) => (
            <SelectItem key={k} textValue={v}>{v}</SelectItem>
          ))}
        </Select>
        <Select
          size="sm"
          variant="bordered"
          className="w-40"
          selectedKeys={new Set([statusFilter])}
          onSelectionChange={(keys) => setStatusFilter([...keys][0] ?? "")}
        >
          <SelectItem key="" textValue="Tất cả trạng thái">Tất cả trạng thái</SelectItem>
          <SelectItem key="true" textValue="Hoạt động">Hoạt động</SelectItem>
          <SelectItem key="false" textValue="Đã khóa">Đã khóa</SelectItem>
        </Select>
        <Select
          size="sm"
          variant="bordered"
          className="w-44"
          placeholder="Sắp xếp"
          selectedKeys={new Set([sortBy])}
          onSelectionChange={(keys) => setSortBy([...keys][0] ?? "name_asc")}
        >
          <SelectItem key="name_asc" textValue="Tên A→Z">Tên A→Z</SelectItem>
          <SelectItem key="name_desc" textValue="Tên Z→A">Tên Z→A</SelectItem>
          <SelectItem key="role" textValue="Vai trò">Vai trò</SelectItem>
          <SelectItem key="status" textValue="Trạng thái (hoạt động trước)">Trạng thái (hoạt động trước)</SelectItem>
        </Select>
      </div>

      <div className="bg-white dark:bg-[#161922] rounded-2xl border border-gray-100 dark:border-white/10 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
        <Table removeWrapper aria-label="Danh sách người dùng" classNames={{ th: "px-4 first:pl-5 last:pr-5", td: "px-4 py-3 first:pl-5 last:pr-5" }}>
          <TableHeader>
            <TableColumn>HỌ VÀ TÊN</TableColumn>
            <TableColumn>EMAIL</TableColumn>
            <TableColumn>SỐ ĐT</TableColumn>
            <TableColumn>GIỚI TÍNH</TableColumn>
            <TableColumn>NGÀY SINH</TableColumn>
            <TableColumn>QUÊ QUÁN</TableColumn>
            <TableColumn>VAI TRÒ</TableColumn>
            <TableColumn>VÀO LÀM / NGHỈ VIỆC</TableColumn>
            <TableColumn>TRẠNG THÁI</TableColumn>
            <TableColumn> </TableColumn>
          </TableHeader>
          <TableBody items={paged} isLoading={loading} loadingContent={<Spinner color="primary" />} emptyContent="Không có người dùng nào.">
            {(u) => (
              <TableRow key={u.id}>
                <TableCell>{u.full_name || <span className="text-gray-300">Chưa cập nhật</span>}</TableCell>
                {/* email có thể trống — hiện dấu gạch để phân biệt với ô lỗi render */}
                <TableCell>{u.email || <span className="text-gray-300 dark:text-gray-600">Không có</span>}</TableCell>
                <TableCell>{u.phone || "-"}</TableCell>
                <TableCell>{GENDER_LABEL[u.gender] || "-"}</TableCell>
                <TableCell>{formatDate(u.dob) || "-"}</TableCell>
                <TableCell>{u.city || "-"}</TableCell>
                <TableCell><Chip size="sm" variant="flat" color={ROLE_COLOR[u.role] || "default"}>{ROLE_LABEL[u.role] || (u.role || "").toUpperCase()}</Chip></TableCell>
                {/* Ngày vào làm / ngày làm cuối chỉ có ở tài xế — hai mốc tính công của bảng lương */}
                <TableCell>
                  {u.role === "driver" ? (
                    <div className="flex flex-col">
                      <span className="text-sm">{u.hire_date ? u.hire_date.split("-").reverse().join("/") : "-"}</span>
                      {u.termination_date && (
                        <span className="text-xs text-rose-500">Làm tới {u.termination_date.split("-").reverse().join("/")}</span>
                      )}
                    </div>
                  ) : "-"}
                </TableCell>
                <TableCell>
                  <Chip size="sm" variant="flat" color={u.is_active ? "success" : "danger"}>
                    {u.is_active ? "Hoạt động" : u.role === "driver" && u.termination_date ? "Đã nghỉ việc" : "Đã khóa"}
                  </Chip>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1 justify-end">
                    {u.role === "driver" && (
                      <Button size="sm" variant="flat" color="secondary" startContent={<RiBriefcaseLine size={13} />} onPress={() => setEmploymentTarget(u)}>Hồ sơ</Button>
                    )}
                    <Button size="sm" variant="flat" color="primary" startContent={<RiPencilLine size={13} />} isDisabled={u.role === "manager"} onPress={() => { setEditingUser(u); setModalOpen(true); }}>Sửa</Button>
                    <Button
                      size="sm"
                      variant="flat"
                      color="warning"
                      isDisabled={u.role === "manager"}
                      startContent={<RiKeyLine size={13} />}
                      onPress={() => setResetTarget(u)}
                    >
                      Reset MK
                    </Button>
                    {u.role === "driver" && u.is_active ? (
                      // Tài xế không "khoá" trơn: chấm dứt HĐ ghi ngày làm việc cuối rồi khoá
                      // luôn, để lương kỳ cuối vẫn tính đúng các ngày đã làm
                      <Button
                        size="sm"
                        variant="flat"
                        color="danger"
                        startContent={<RiUserUnfollowLine size={13} />}
                        onPress={() => setTerminateTarget(u)}
                      >
                        Chấm dứt HĐ
                      </Button>
                    ) : (
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
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        </div>
        <div className="px-5 py-3">
          <PaginationBar page={page} pageSize={pageSize} totalItems={filtered.length} totalPages={Math.max(1, Math.ceil(filtered.length / pageSize))} onPageChange={setPage} />
        </div>
      </div>

      <UserFormModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onSave={handleSaveUser} editingUser={editingUser} />

      <DriverEmploymentModal driver={employmentTarget} onClose={() => setEmploymentTarget(null)} onSaved={fetchUsers} />

      <TerminateContractModal driver={terminateTarget} onClose={() => setTerminateTarget(null)} onDone={fetchUsers} />

      <Modal isOpen={!!toggleTarget} onOpenChange={(open) => !open && setToggleTarget(null)} size="sm">
        <ModalContent>
          <ModalHeader>Xác nhận</ModalHeader>
          <ModalBody>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Bạn có chắc muốn {toggleTarget?.is_active ? "khóa" : "mở khóa"} tài khoản "{toggleTarget?.full_name || toggleTarget?.email}"?
            </p>
            {/* Mở khoá tài xế đã nghỉ việc chỉ trả lại quyền đăng nhập — ngày nghỉ việc giữ nguyên */}
            {!toggleTarget?.is_active && toggleTarget?.role === "driver" && toggleTarget?.termination_date && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Tài xế đã chấm dứt hợp đồng (làm tới {toggleTarget.termination_date.split("-").reverse().join("/")}). Mở khoá chỉ cho đăng nhập lại
                (xem phiếu lương, công nợ) — vẫn không nhận chuyến và không tính công sau ngày đó. Nếu chấm dứt nhầm, xoá ngày nghỉ việc trong &quot;Hồ sơ&quot;.
              </p>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setToggleTarget(null)}>Hủy</Button>
            <Button color="danger" onPress={handleToggleStatus}>Xác nhận</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={!!resetTarget} onOpenChange={(open) => !open && !resetting && setResetTarget(null)} size="sm">
        <ModalContent>
          <ModalHeader>Reset mật khẩu</ModalHeader>
          <ModalBody>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Đặt lại mật khẩu cho tài khoản "{resetTarget?.full_name || resetTarget?.email || `#${resetTarget?.id}`}"?
              {resetTarget?.email ? (
                <> Mật khẩu tạm thời sẽ được gửi qua email <strong>{resetTarget.email}</strong>.</>
              ) : (
                <> Tài khoản này <strong>chưa có email</strong> nên mật khẩu tạm thời sẽ hiện ra ngay sau đó để bạn giao tận tay — hãy chép lại trước khi đóng.</>
              )}
              {" "}Mật khẩu cũ sẽ ngừng hoạt động ngay và nhân viên phải đổi mật khẩu ở lần đăng nhập kế tiếp.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setResetTarget(null)} isDisabled={resetting}>Hủy</Button>
            <Button color="warning" onPress={handleResetPassword} isLoading={resetting}>Reset mật khẩu</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Mật khẩu của tài khoản chưa có email — không gửi đi đâu được, không xem lại được */}
      <Modal isOpen={!!passwordHandover} onOpenChange={(open) => !open && setPasswordHandover(null)} size="sm">
        <ModalContent>
          <ModalHeader>{passwordHandover?.title}</ModalHeader>
          <ModalBody className="gap-2">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Nhân viên <strong>{passwordHandover?.full_name}</strong> chưa có email nên hệ thống không gửi mật khẩu đi được.
              Hãy chép lại và giao tận tay — <strong>đóng cửa sổ này là không xem lại được</strong>.
            </p>
            <div className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-500/10 px-3 py-2 text-center">
              <span className="font-mono text-lg font-bold tracking-wider text-gray-900 dark:text-gray-50">
                {passwordHandover?.password}
              </span>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-400">
              Nhân viên đăng nhập bằng số điện thoại và sẽ phải đổi mật khẩu ở lần đăng nhập đầu tiên.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="flat"
              onPress={() => {
                navigator.clipboard?.writeText(passwordHandover?.password ?? "")
                  .then(() => notify.success("Đã chép mật khẩu."))
                  .catch(() => notify.error("Trình duyệt không cho phép chép tự động."));
              }}
            >
              Chép mật khẩu
            </Button>
            <Button color="primary" onPress={() => setPasswordHandover(null)}>Tôi đã lưu lại</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={!!importResult} onOpenChange={(open) => !open && setImportResult(null)} size="2xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader>Kết quả import nhân viên</ModalHeader>
          <ModalBody className="gap-3">
            {importResult && (
              <>
                <p className="text-sm text-gray-700 dark:text-gray-200">Đã tạo thành công {importResult.successes.length}/{importResult.total} nhân viên từ file.</p>
                {importResult.skippedRows.length > 0 && (
                  <p className="text-xs text-gray-400 dark:text-gray-400">Đã bỏ qua {importResult.skippedRows.length} dòng trống (dòng {importResult.skippedRows.map((s) => s.rowNumber).join(", ")}).</p>
                )}
                {importResult.failures.length > 0 && (
                  <div className="rounded-xl border border-rose-100 dark:border-rose-500/20 bg-rose-50/40 dark:bg-rose-500/10 p-3 max-h-60 overflow-y-auto">
                    <p className="text-xs font-bold text-rose-600 dark:text-rose-300 mb-2">Có {importResult.failures.length} dòng chưa import được:</p>
                    {importResult.failures.slice(0, 20).map((f) => (
                      <p key={`${f.row}-${f.message}`} className="text-xs text-rose-500">Dòng {f.row}: {f.message}</p>
                    ))}
                  </div>
                )}

                {/* Nhân viên không có email: mật khẩu khởi tạo KHÔNG được gửi đi đâu cả
                    và không xem lại được sau khi đóng — phải cho quản lý chép ngay. */}
                {importResult.needPasswordHandover.length > 0 && (
                  <div className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-500/10 p-3">
                    <p className="text-xs font-bold text-amber-700 dark:text-amber-300 mb-1">
                      {importResult.needPasswordHandover.length} nhân viên không có email — hãy giao mật khẩu tận tay
                    </p>
                    <p className="text-[11px] text-amber-700/80 dark:text-amber-300/80 mb-2">
                      Đóng cửa sổ này là không xem lại được. Nếu lỡ mất, dùng chức năng "Reset mật khẩu" để cấp lại.
                    </p>
                    <div className="max-h-52 overflow-y-auto rounded-lg bg-white/70 dark:bg-black/20">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-amber-800/70 dark:text-amber-200/70">
                            <th className="px-2 py-1 font-semibold">Dòng</th>
                            <th className="px-2 py-1 font-semibold">Họ tên</th>
                            <th className="px-2 py-1 font-semibold">Mật khẩu tạm thời</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importResult.needPasswordHandover.map((s) => (
                            <tr key={s.row} className="border-t border-amber-100 dark:border-amber-500/20">
                              <td className="px-2 py-1 text-gray-600 dark:text-gray-300">{s.row}</td>
                              <td className="px-2 py-1 text-gray-700 dark:text-gray-200">{s.full_name}</td>
                              <td className="px-2 py-1 font-mono font-semibold text-gray-900 dark:text-gray-50">{s.initialPassword}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <Button
                      size="sm"
                      variant="flat"
                      className="mt-2"
                      onPress={() => {
                        const text = importResult.needPasswordHandover
                          .map((s) => `${s.full_name}\t${s.initialPassword}`)
                          .join("\n");
                        navigator.clipboard?.writeText(text)
                          .then(() => notify.success("Đã chép danh sách mật khẩu."))
                          .catch(() => notify.error("Trình duyệt không cho phép chép tự động."));
                      }}
                    >
                      Chép danh sách
                    </Button>
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
