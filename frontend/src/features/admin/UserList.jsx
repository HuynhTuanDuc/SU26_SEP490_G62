import React, { useEffect, useRef, useState } from 'react';
import { Button, Input, message, Modal, Space, Table, Tag, Typography } from 'antd';
import { DownloadOutlined, EditOutlined, LockOutlined, PlusOutlined, SearchOutlined, UnlockOutlined, UploadOutlined } from '@ant-design/icons';
import UserModal from './UserModal';
import { apiRequest } from '../../services/apiClient';
import { useRoleRealtime } from '../../hooks/useRoleRealtime';
import * as XLSX from 'xlsx';
import '../../styles/admin/UserModal.css';
import '../../styles/admin/Toast.css';
import '../../styles/admin/Admin.css';

const { Title, Text } = Typography;

const genderLabelMap = {
  male: 'Nam',
  female: 'Nữ',
  other: 'Khác',
};

const USER_IMPORT_HEADERS = [
  'email',
  'full_name',
  'phone',
  'role',
  'gender',
  'dob',
  'city',
  'address',
  'country',
  'national_id',
  'tax_code',
  'emergency_contact_name',
  'emergency_contact_phone',
  'notes',
];

const USER_IMPORT_SAMPLE_ROWS = [
  {
    email: 'coordinator.new@example.com',
    full_name: 'Nguyễn Văn Điều Phối',
    phone: '0912345678',
    role: 'coordinator',
    gender: 'male',
    dob: '1994-05-10',
    city: 'Ho Chi Minh',
    address: '12 Nguyen Hue, District 1',
    country: 'VN',
    national_id: '079194123456',
    tax_code: '',
    emergency_contact_name: 'Nguyen Thi Lan',
    emergency_contact_phone: '0901234567',
    notes: 'Nhân sự điều phối mới',
  },
  {
    email: 'driver.new@example.com',
    full_name: 'Trần Tài Xế',
    phone: '0987654321',
    role: 'driver',
    gender: 'female',
    dob: '1997-08-21',
    city: 'Da Nang',
    address: '88 Le Loi, Hai Chau',
    country: 'VN',
    national_id: '079197987654',
    tax_code: '',
    emergency_contact_name: 'Tran Van B',
    emergency_contact_phone: '0907654321',
    notes: 'Lưu ý điền đầy đủ các cột bắt buộc',
  },
];

const formatDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('vi-VN');
};

const normalizeImportedText = (value) => {
  if (value === undefined || value === null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return String(value);
    return String(value).trim();
  }
  return String(value).trim();
};

const normalizeImportedDate = (value) => {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      const month = String(parsed.m).padStart(2, '0');
      const day = String(parsed.d).padStart(2, '0');
      return `${parsed.y}-${month}-${day}`;
    }
  }

  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const parsedDate = new Date(raw);
  if (!Number.isNaN(parsedDate.getTime())) {
    return parsedDate.toISOString().slice(0, 10);
  }

  return raw;
};

const isImportedRowEmpty = (row) => {
  return USER_IMPORT_HEADERS.every((header) => !normalizeImportedText(row?.[header]));
};

const buildImportedUserPayload = (row) => ({
  email: normalizeImportedText(row.email).toLowerCase(),
  full_name: normalizeImportedText(row.full_name),
  phone: normalizeImportedText(row.phone),
  role: normalizeImportedText(row.role).toLowerCase(),
  gender: normalizeImportedText(row.gender).toLowerCase(),
  dob: normalizeImportedDate(row.dob),
  city: normalizeImportedText(row.city),
  address: normalizeImportedText(row.address),
  country: normalizeImportedText(row.country) || 'VN',
  national_id: normalizeImportedText(row.national_id),
  tax_code: normalizeImportedText(row.tax_code),
  emergency_contact_name: normalizeImportedText(row.emergency_contact_name),
  emergency_contact_phone: normalizeImportedText(row.emergency_contact_phone),
  notes: normalizeImportedText(row.notes),
});

export default function UserList({ user }) {
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  useRoleRealtime(user, {
    onMessage: (payload) => {
      if (payload?.type === 'manager.users.changed') {
        fetchUsers();
      }
    },
  });

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const data = await apiRequest('/api/admin/users');
      setAllUsers(data.users || []);
    } catch (error) {
      message.error(`Lỗi: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const filtered = allUsers.filter((user) => {
    const query = search.toLowerCase();
    return (
      String(user.id).includes(query) ||
      (user.full_name || '').toLowerCase().includes(query) ||
      (user.email || '').toLowerCase().includes(query) ||
      (user.phone || '').toLowerCase().includes(query) ||
      (user.role || '').toLowerCase().includes(query) ||
      (user.city || '').toLowerCase().includes(query)
    );
  });

  const handleOpenAdd = () => {
    setEditingUser(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (user) => {
    setEditingUser(user);
    setIsModalOpen(true);
  };

  const handleDownloadSample = () => {
    const worksheet = XLSX.utils.json_to_sheet(USER_IMPORT_SAMPLE_ROWS, {
      header: USER_IMPORT_HEADERS,
    });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'users');
    XLSX.writeFile(workbook, 'user-import-sample.xlsx');
  };

  const handleOpenImportPicker = () => {
    fileInputRef.current?.click();
  };

  const handleImportUsers = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      setImporting(true);
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        throw new Error('File Excel không có sheet nào.');
      }

      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], {
        defval: '',
        raw: false,
      });

      const importRows = rows.filter((row) => !isImportedRowEmpty(row));
      if (importRows.length === 0) {
        throw new Error('File Excel không có dòng dữ liệu hợp lệ.');
      }

      const missingHeaders = USER_IMPORT_HEADERS.filter((header) => !(header in (rows[0] || {})));
      if (missingHeaders.length > 0) {
        throw new Error(`File thiếu cột: ${missingHeaders.join(', ')}`);
      }

      const successes = [];
      const failures = [];

      for (let index = 0; index < importRows.length; index += 1) {
        const rowNumber = index + 2;
        const payload = buildImportedUserPayload(importRows[index]);

        if (!payload.email || !payload.full_name || !payload.phone || !payload.role) {
          failures.push({
            row: rowNumber,
            message: 'Thiếu email, full_name, phone hoặc role.',
          });
          continue;
        }

        try {
          const data = await apiRequest('/api/admin/users', {
            method: 'POST',
            body: payload,
          });
          successes.push({
            row: rowNumber,
            message: data.message || 'Đã tạo người dùng.',
            email: payload.email,
          });
        } catch (error) {
          failures.push({
            row: rowNumber,
            message: error.message || 'Không thể tạo người dùng.',
          });
        }
      }

      if (successes.length > 0) {
        await fetchUsers();
      }

      Modal.info({
        title: 'Kết quả import người dùng',
        width: 720,
        content: (
          <div style={{ display: 'grid', gap: 12 }}>
            <Text>{`Thành công: ${successes.length} dòng`}</Text>
            <Text>{`Thất bại: ${failures.length} dòng`}</Text>
            {failures.length > 0 ? (
              <div style={{ maxHeight: 240, overflowY: 'auto', paddingRight: 8 }}>
                {failures.slice(0, 12).map((failure) => (
                  <div key={`${failure.row}-${failure.message}`} style={{ marginBottom: 8 }}>
                    <Text type="danger">{`Dòng ${failure.row}: ${failure.message}`}</Text>
                  </div>
                ))}
                {failures.length > 12 ? (
                  <Text type="secondary">{`Còn ${failures.length - 12} lỗi khác, vui lòng chia nhỏ file hoặc sửa và import lại.`}</Text>
                ) : null}
              </div>
            ) : (
              <Text type="secondary">Tất cả dòng dữ liệu đều đã được tạo thành công.</Text>
            )}
          </div>
        ),
      });
    } catch (error) {
      message.error(error.message || 'Không thể import file Excel.');
    } finally {
      setImporting(false);
    }
  };

  const handleSaveUser = async (formData) => {
    try {
      const data = await apiRequest(
        editingUser ? `/api/admin/users/${editingUser.id}` : '/api/admin/users',
        {
          method: editingUser ? 'PUT' : 'POST',
          body: formData,
        },
      );
      message.success(data.message);
      setIsModalOpen(false);
      fetchUsers();
    } catch (error) {
      message.error(error.message || 'Đã có lỗi xảy ra.');
    }
  };

  const handleToggleStatus = (user) => {
    const action = user.is_active ? 'khóa' : 'mở khóa';
    Modal.confirm({
      title: 'Xác nhận',
      content: `Bạn có chắc muốn ${action} tài khoản "${user.full_name || user.email}"?`,
      okText: 'Xác nhận',
      okType: 'danger',
      cancelText: 'Hủy',
      onOk: async () => {
        try {
          const data = await apiRequest(`/api/admin/users/${user.id}/status`, {
            method: 'PATCH',
            body: { is_active: !user.is_active },
          });
          message.success(data.message);
          fetchUsers();
        } catch (error) {
          message.error(error.message || 'Đã có lỗi.');
        }
      },
    });
  };

  const getRoleColor = (role) => {
    const map = { manager: 'magenta', coordinator: 'blue', accountant: 'purple', driver: 'orange' };
    return map[role] || 'default';
  };

  const columns = [
    {
      title: 'STT',
      key: 'stt',
      render: (_, __, index) => <strong>{(currentPage - 1) * pageSize + index + 1}</strong>,
    },
    {
      title: 'Họ và Tên',
      dataIndex: 'full_name',
      key: 'full_name',
      sorter: (a, b) => (a.full_name || '').localeCompare(b.full_name || ''),
      render: (text) => text || <Text type="secondary">Chưa cập nhật</Text>,
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      sorter: (a, b) => (a.email || '').localeCompare(b.email || ''),
    },
    {
      title: 'Số ĐT',
      dataIndex: 'phone',
      key: 'phone',
      render: (text) => text || <Text type="secondary">-</Text>,
    },
    {
      title: 'Giới tính',
      dataIndex: 'gender',
      key: 'gender',
      render: (value) => genderLabelMap[value] || <Text type="secondary">-</Text>,
    },
    {
      title: 'Ngày sinh',
      dataIndex: 'dob',
      key: 'dob',
      render: (value) => formatDate(value) || <Text type="secondary">-</Text>,
    },
    {
      title: 'Quê quán',
      dataIndex: 'city',
      key: 'city',
      render: (value) => value || <Text type="secondary">-</Text>,
    },
    {
      title: 'Vai trò',
      dataIndex: 'role',
      key: 'role',
      sorter: (a, b) => (a.role || '').localeCompare(b.role || ''),
      render: (role) => <Tag color={getRoleColor(role)}>{(role || '').toUpperCase()}</Tag>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'is_active',
      key: 'is_active',
      sorter: (a, b) => (a.is_active === b.is_active ? 0 : a.is_active ? -1 : 1),
      render: (isActive) => (
        <Tag color={isActive ? 'green' : 'red'}>
          {isActive ? 'Hoạt động' : 'Đã khóa'}
        </Tag>
      ),
    },
    {
      title: 'Thao tác',
      key: 'action',
      render: (_, user) => (
        <Space size="middle">
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => handleOpenEdit(user)}
            disabled={user.role === 'manager'}
          >
            Sửa
          </Button>
          <Button
            danger={user.is_active}
            type="text"
            icon={user.is_active ? <LockOutlined /> : <UnlockOutlined />}
            onClick={() => handleToggleStatus(user)}
            disabled={user.role === 'manager'}
          >
            {user.is_active ? 'Khóa' : 'Mở khóa'}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px', background: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Title level={3} style={{ margin: 0 }}>Danh sách tài khoản</Title>
          <Text type="secondary" style={{ margin: 0 }}>Tổng: {filtered.length} / {allUsers.length} người dùng</Text>
        </div>
        <Space wrap>
          <Button icon={<DownloadOutlined />} onClick={handleDownloadSample}>
            Tải file mẫu
          </Button>
          <Button icon={<UploadOutlined />} loading={importing} onClick={handleOpenImportPicker}>
            Import Excel
          </Button>
          <Button type="primary" icon={<PlusOutlined />} size="middle" onClick={handleOpenAdd}>
            Thêm người dùng
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: 'none' }}
            onChange={handleImportUsers}
          />
        </Space>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <Input
          placeholder="Tìm kiếm theo tên, email, SĐT, vai trò..."
          prefix={<SearchOutlined />}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setCurrentPage(1);
          }}
          size="large"
          allowClear
        />
      </div>

      <Table
        columns={columns}
        dataSource={filtered}
        rowKey="id"
        loading={loading}
        pagination={{
          current: currentPage,
          pageSize,
          defaultPageSize: 10,
          showSizeChanger: true,
          showTotal: (total, range) => `${range[0]}-${range[1]} của ${total} mục`,
          onChange: (page, size) => {
            setCurrentPage(page);
            setPageSize(size);
          },
        }}
        scroll={{ x: 'max-content' }}
      />

      <UserModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveUser}
        editingUser={editingUser}
      />
    </div>
  );
}
