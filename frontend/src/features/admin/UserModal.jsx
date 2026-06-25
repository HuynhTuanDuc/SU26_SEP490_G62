import React, { useEffect } from 'react';
import { Col, DatePicker, Form, Input, Modal, Row, Select } from 'antd';
import dayjs from 'dayjs';
import '../../styles/admin/UserModal.css';

const genderOptions = [
  { value: 'male', label: 'Nam' },
  { value: 'female', label: 'Nu' },
  { value: 'other', label: 'Khac' },
];

export default function UserModal({ isOpen, onClose, onSave, editingUser }) {
  const [form] = Form.useForm();

  const modalBodyStyle = {
    maxHeight: '72vh',
    overflowY: 'auto',
    paddingRight: 8,
  };

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
        address: editingUser.address || '',
        country: editingUser.country || 'VN',
        national_id: editingUser.national_id || '',
        tax_code: editingUser.tax_code || '',
        emergency_contact_name: editingUser.emergency_contact_name || '',
        emergency_contact_phone: editingUser.emergency_contact_phone || '',
        notes: editingUser.notes || '',
      });
      return;
    }

    form.resetFields();
    form.setFieldsValue({
      role: 'driver',
      country: 'VN',
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
      destroyOnClose
      width={920}
      styles={{ body: modalBodyStyle }}
    >
      <Form form={form} layout="vertical" name="userForm">
        <Row gutter={16}>
          <Col xs={24} md={12}>
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
          </Col>
          <Col xs={24} md={12}>
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
          </Col>

          <Col xs={24} md={12}>
            <Form.Item
              name="full_name"
              label="Ho va Ten"
              rules={[{ required: true, message: 'Vui long nhap ho va ten!' }]}
            >
              <Input placeholder="Nhap ho va ten" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
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
          </Col>

          <Col xs={24} md={12}>
            <Form.Item name="gender" label="Gioi tinh">
              <Select
                allowClear
                placeholder="Chon gioi tinh"
                options={genderOptions}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="dob" label="Ngay sinh">
              <DatePicker
                style={{ width: '100%' }}
                format="DD/MM/YYYY"
                placeholder="Chon ngay sinh"
              />
            </Form.Item>
          </Col>

          <Col xs={24} md={12}>
            <Form.Item name="city" label="Que quan">
              <Input placeholder="Nhap que quan" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="country" label="Quoc gia">
              <Input placeholder="VN" />
            </Form.Item>
          </Col>

          <Col xs={24}>
            <Form.Item name="address" label="Dia chi">
              <Input.TextArea rows={2} placeholder="Nhap dia chi" />
            </Form.Item>
          </Col>

          <Col xs={24} md={12}>
            <Form.Item name="national_id" label="So giay to">
              <Input placeholder="CCCD / Passport" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="tax_code" label="Ma so thue ca nhan">
              <Input placeholder="Neu co" />
            </Form.Item>
          </Col>

          <Col xs={24} md={12}>
            <Form.Item name="emergency_contact_name" label="Lien he khan cap">
              <Input placeholder="Nguoi lien he khan cap" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name="emergency_contact_phone"
              label="SDT lien he khan cap"
              rules={[
                { pattern: /^$|^0\d{9,10}$/, message: 'So dien thoai khan cap khong hop le!' },
              ]}
            >
              <Input placeholder="Nhap so dien thoai khan cap" />
            </Form.Item>
          </Col>

          <Col xs={24}>
            <Form.Item name="notes" label="Ghi chu">
              <Input.TextArea rows={3} placeholder="Thong tin bo sung" />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}
