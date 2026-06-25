import React, { useEffect } from 'react';
import { DatePicker, Form, Input, Modal, Select } from 'antd';
import dayjs from 'dayjs';
import '../../styles/admin/UserModal.css';

const genderOptions = [
  { value: 'male', label: 'Nam' },
  { value: 'female', label: 'Nu' },
  { value: 'other', label: 'Khac' },
];

export default function UserModal({ isOpen, onClose, onSave, editingUser }) {
  const [form] = Form.useForm();

  useEffect(() => {
    if (!isOpen) return;

    if (editingUser) {
      form.setFieldsValue({
        email: editingUser.email || '',
        full_name: editingUser.full_name || '',
        phone: editingUser.phone || '',
        role: editingUser.role || 'driver',
        gender: editingUser.gender || undefined,
        dob: editingUser.dob ? dayjs(editingUser.dob) : null,
        city: editingUser.city || '',
      });
      return;
    }

    form.resetFields();
    form.setFieldsValue({
      role: 'driver',
    });
  }, [editingUser, form, isOpen]);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      onSave({
        ...values,
        dob: values.dob ? values.dob.format('YYYY-MM-DD') : null,
      });
    } catch (error) {
      console.error('Validate Failed:', error);
    }
  };

  return (
    <Modal
      title={editingUser ? 'Sua thong tin nguoi dung' : 'Them nguoi dung moi'}
      open={isOpen}
      onOk={handleOk}
      onCancel={onClose}
      okText="Luu lai"
      cancelText="Huy"
      destroyOnHidden
    >
      <Form form={form} layout="vertical" name="userForm">
        <Form.Item
          name="email"
          label="Email"
          rules={[
            { required: true, message: 'Vui long nhap email!' },
            { type: 'email', message: 'Email khong hop le!' },
          ]}
        >
          <Input disabled={!!editingUser} placeholder="Nhap dia chi email" />
        </Form.Item>

        <Form.Item
          name="full_name"
          label="Ho va Ten"
          rules={[{ required: true, message: 'Vui long nhap ho va ten!' }]}
        >
          <Input placeholder="Nhap ho va ten" />
        </Form.Item>

        <Form.Item
          name="phone"
          label="So dien thoai"
          rules={[
            { required: true, message: 'Vui long nhap so dien thoai!' },
            { pattern: /^0\d{9,10}$/, message: 'So dien thoai khong hop le!' },
          ]}
        >
          <Input placeholder="Nhap so dien thoai" />
        </Form.Item>

        <Form.Item name="gender" label="Gioi tinh">
          <Select
            allowClear
            placeholder="Chon gioi tinh"
            options={genderOptions}
          />
        </Form.Item>

        <Form.Item name="dob" label="Ngay sinh">
          <DatePicker
            style={{ width: '100%' }}
            format="DD/MM/YYYY"
            placeholder="Chon ngay sinh"
          />
        </Form.Item>

        <Form.Item name="city" label="Que quan">
          <Input placeholder="Nhap que quan" />
        </Form.Item>

        <Form.Item
          name="role"
          label="Vai tro"
          rules={[{ required: true, message: 'Vui long chon vai tro!' }]}
        >
          <Select placeholder="Chon vai tro">
            <Select.Option value="coordinator">Coordinator (Dieu phoi)</Select.Option>
            <Select.Option value="accountant">Accountant (Ke toan)</Select.Option>
            <Select.Option value="driver">Driver (Tai xe)</Select.Option>
          </Select>
        </Form.Item>
      </Form>
    </Modal>
  );
}
