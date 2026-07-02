import React, { useEffect } from 'react';
import { Col, DatePicker, Form, Input, Modal, Row, Select } from 'antd';
import dayjs from 'dayjs';
import '../../styles/admin/UserModal.css';

const genderOptions = [
  { value: 'male', label: 'Nam' },
  { value: 'female', label: 'Nữ' },
  { value: 'other', label: 'Khác' },
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
      title={editingUser ? 'Sửa thông tin người dùng' : 'Thêm người dùng mới'}
      open={isOpen}
      onOk={handleOk}
      onCancel={onClose}
      okText="Lưu lại"
      cancelText="Hủy"
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
                { required: true, message: 'Vui lòng nhập email!' },
                { type: 'email', message: 'Email không hợp lệ!' },
              ]}
            >
              <Input disabled={!!editingUser} placeholder="Nhập địa chỉ email" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name="role"
              label="Vai trò"
              rules={[{ required: true, message: 'Vui lòng chọn vai trò!' }]}
            >
              <Select placeholder="Chọn vai trò">
                <Select.Option value="coordinator">Coordinator (Điều phối)</Select.Option>
                <Select.Option value="accountant">Accountant (Kế toán)</Select.Option>
                <Select.Option value="driver">Driver (Tài xế)</Select.Option>
              </Select>
            </Form.Item>
          </Col>

          <Col xs={24} md={12}>
            <Form.Item
              name="full_name"
              label="Họ và Tên"
              rules={[{ required: true, message: 'Vui lòng nhập họ và tên!' }]}
            >
              <Input placeholder="Nhập họ và tên" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name="phone"
              label="Số điện thoại"
              rules={[
                { required: true, message: 'Vui lòng nhập số điện thoại!' },
                { pattern: /^0\d{9,10}$/, message: 'Số điện thoại không hợp lệ!' },
              ]}
            >
              <Input placeholder="Nhập số điện thoại" />
            </Form.Item>
          </Col>

          <Col xs={24} md={12}>
            <Form.Item name="gender" label="Giới tính">
              <Select
                allowClear
                placeholder="Chọn giới tính"
                options={genderOptions}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="dob" label="Ngày sinh">
              <DatePicker
                style={{ width: '100%' }}
                format="DD/MM/YYYY"
                placeholder="Chọn ngày sinh"
              />
            </Form.Item>
          </Col>

          <Col xs={24} md={12}>
            <Form.Item name="city" label="Quê quán">
              <Input placeholder="Nhập quê quán" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="country" label="Quốc gia">
              <Input placeholder="VN" />
            </Form.Item>
          </Col>

          <Col xs={24}>
            <Form.Item name="address" label="Địa chỉ">
              <Input.TextArea rows={2} placeholder="Nhập địa chỉ" />
            </Form.Item>
          </Col>

          <Col xs={24} md={12}>
            <Form.Item name="national_id" label="Số giấy tờ">
              <Input placeholder="CCCD / Passport" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="tax_code" label="Mã số thuế cá nhân">
              <Input placeholder="Nếu có" />
            </Form.Item>
          </Col>

          <Col xs={24} md={12}>
            <Form.Item name="emergency_contact_name" label="Liên hệ khẩn cấp">
              <Input placeholder="Người liên hệ khẩn cấp" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name="emergency_contact_phone"
              label="SĐT liên hệ khẩn cấp"
              rules={[
                { pattern: /^$|^0\d{9,10}$/, message: 'Số điện thoại khẩn cấp không hợp lệ!' },
              ]}
            >
              <Input placeholder="Nhập số điện thoại khẩn cấp" />
            </Form.Item>
          </Col>

          <Col xs={24}>
            <Form.Item name="notes" label="Ghi chú">
              <Input.TextArea rows={3} placeholder="Thông tin bổ sung" />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}
