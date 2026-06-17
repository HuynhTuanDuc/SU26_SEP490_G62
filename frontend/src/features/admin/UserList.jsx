import React, { useEffect, useState } from 'react';
import { Button, Input, message, Modal, Space, Table, Tag, Typography } from 'antd';
import { EditOutlined, LockOutlined, PlusOutlined, SearchOutlined, UnlockOutlined } from '@ant-design/icons';
import UserModal from './UserModal';
import '../../styles/admin/UserModal.css';
import '../../styles/admin/Toast.css';
import '../../styles/admin/Admin.css';

const { Title, Text } = Typography;
const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:9999';

const genderLabelMap = {
  male: 'Nam',
  female: 'Nu',
  other: 'Khac',
};

const formatDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('vi-VN');
};

export default function UserList() {
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${apiBase}/api/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Khong the tai danh sach.');
      setAllUsers(data.users || []);
    } catch (error) {
      message.error(`Loi: ${error.message}`);
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

  const handleSaveUser = async (formData) => {
    try {
      const token = localStorage.getItem('token');
      const url = editingUser
        ? `${apiBase}/api/admin/users/${editingUser.id}`
        : `${apiBase}/api/admin/users`;
      const method = editingUser ? 'PUT' : 'POST';
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });
      const data = await response.json();
      if (!response.ok) {
        message.error(data.error || 'Da co loi xay ra.');
        return;
      }
      message.success(data.message);
      setIsModalOpen(false);
      fetchUsers();
    } catch {
      message.error('Loi ket noi.');
    }
  };

  const handleToggleStatus = (user) => {
    const action = user.is_active ? 'khoa' : 'mo khoa';
    Modal.confirm({
      title: 'Xac nhan',
      content: `Ban co chac muon ${action} tai khoan "${user.full_name || user.email}"?`,
      okText: 'Xac nhan',
      okType: 'danger',
      cancelText: 'Huy',
      onOk: async () => {
        try {
          const token = localStorage.getItem('token');
          const response = await fetch(`${apiBase}/api/admin/users/${user.id}/status`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ is_active: !user.is_active }),
          });
          const data = await response.json();
          if (!response.ok) {
            message.error(data.error || 'Da co loi.');
            return;
          }
          message.success(data.message);
          fetchUsers();
        } catch {
          message.error('Loi ket noi.');
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
      title: 'Ho va Ten',
      dataIndex: 'full_name',
      key: 'full_name',
      sorter: (a, b) => (a.full_name || '').localeCompare(b.full_name || ''),
      render: (text) => text || <Text type="secondary">Chua cap nhat</Text>,
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      sorter: (a, b) => (a.email || '').localeCompare(b.email || ''),
    },
    {
      title: 'So DT',
      dataIndex: 'phone',
      key: 'phone',
      render: (text) => text || <Text type="secondary">-</Text>,
    },
    {
      title: 'Gioi tinh',
      dataIndex: 'gender',
      key: 'gender',
      render: (value) => genderLabelMap[value] || <Text type="secondary">-</Text>,
    },
    {
      title: 'Ngay sinh',
      dataIndex: 'dob',
      key: 'dob',
      render: (value) => formatDate(value) || <Text type="secondary">-</Text>,
    },
    {
      title: 'Que quan',
      dataIndex: 'city',
      key: 'city',
      render: (value) => value || <Text type="secondary">-</Text>,
    },
    {
      title: 'Vai tro',
      dataIndex: 'role',
      key: 'role',
      sorter: (a, b) => (a.role || '').localeCompare(b.role || ''),
      render: (role) => <Tag color={getRoleColor(role)}>{(role || '').toUpperCase()}</Tag>,
    },
    {
      title: 'Trang thai',
      dataIndex: 'is_active',
      key: 'is_active',
      sorter: (a, b) => (a.is_active === b.is_active ? 0 : a.is_active ? -1 : 1),
      render: (isActive) => (
        <Tag color={isActive ? 'green' : 'red'}>
          {isActive ? 'Hoat dong' : 'Da khoa'}
        </Tag>
      ),
    },
    {
      title: 'Thao tac',
      key: 'action',
      render: (_, user) => (
        <Space size="middle">
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => handleOpenEdit(user)}
            disabled={user.role === 'manager'}
          >
            Sua
          </Button>
          <Button
            danger={user.is_active}
            type="text"
            icon={user.is_active ? <LockOutlined /> : <UnlockOutlined />}
            onClick={() => handleToggleStatus(user)}
            disabled={user.role === 'manager'}
          >
            {user.is_active ? 'Khoa' : 'Mo khoa'}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px', background: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Title level={3} style={{ margin: 0 }}>Danh sach tai khoan</Title>
          <Text type="secondary" style={{ margin: 0 }}>Tong: {filtered.length} / {allUsers.length} nguoi dung</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} size="middle" onClick={handleOpenAdd}>
          Them nguoi dung
        </Button>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <Input
          placeholder="Tim kiem theo ten, email, SDT, vai tro..."
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
          showTotal: (total, range) => `${range[0]}-${range[1]} cua ${total} muc`,
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
