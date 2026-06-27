import React, { useEffect, useState } from 'react';
import { Avatar, Button, DatePicker, Form, Input, Upload, message, Modal, Select, Space, Typography } from 'antd';
import { CameraOutlined, UserOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { apiRequest } from '../../services/apiClient';

const { Text } = Typography;

const genderOptions = [
  { value: 'male',   label: 'Nam' },
  { value: 'female', label: 'Nữ' },
  { value: 'other',  label: 'Khác' },
];

export default function ProfileModal({ open, onClose, onProfileUpdated }) {
  const [form] = Form.useForm();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    if (!open) return;

    const loadProfile = async () => {
      try {
        setLoading(true);
        const data = await apiRequest('/api/profile/me');
        const nextProfile = data.profile;
        setProfile(nextProfile);
        form.setFieldsValue({
          full_name: nextProfile.full_name || '',
          phone: nextProfile.phone || '',
          gender: nextProfile.gender || undefined,
          dob: nextProfile.dob ? dayjs(nextProfile.dob) : null,
          city: nextProfile.city || '',
          email: nextProfile.email || '',
          verification_code: '',
          new_email: '',
        });
        setResendCooldown(0);
      } catch (error) {
        message.error(error.message || 'Không thể tải hồ sơ.');
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [form, open]);

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;

    const timer = window.setInterval(() => {
      setResendCooldown((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  const handleAvatarUpload = async ({ file, onSuccess, onError }) => {
    try {
      setUploadingAvatar(true);
      const formData = new FormData();
      formData.append('avatar', file);

      const data = await apiRequest('/api/profile/me/avatar', {
        method: 'POST',
        body: formData,
      });

      const nextProfile = { ...profile, avatar_url: data.avatar_url };
      setProfile(nextProfile);
      message.success(data.message || 'Cập nhật ảnh đại diện thành công.');
      onProfileUpdated?.({
        email: nextProfile.email,
        full_name: nextProfile.full_name,
        phone: nextProfile.phone,
        gender: nextProfile.gender,
        dob: nextProfile.dob,
        city: nextProfile.city,
        avatar_url: nextProfile.avatar_url,
      });
      onSuccess?.(data, file);
    } catch (error) {
      message.error(error.message || 'Không thể tải avatar lên.');
      onError?.(error);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveProfile = async () => {
    try {
      const values = await form.validateFields(['full_name', 'phone', 'gender', 'dob', 'city']);
      setSaving(true);
      const data = await apiRequest('/api/profile/me', {
        method: 'PATCH',
        body: {
          full_name: values.full_name,
          phone: values.phone || null,
          gender: values.gender || null,
          dob: values.dob ? values.dob.format('YYYY-MM-DD') : null,
          city: values.city || null,
        },
      });

      const mergedProfile = { ...profile, ...data.profile };
      setProfile(mergedProfile);
      message.success(data.message || 'Cập nhật hồ sơ thành công.');
      onProfileUpdated?.({
        email: mergedProfile.email,
        full_name: mergedProfile.full_name,
        phone: mergedProfile.phone,
        gender: mergedProfile.gender,
        dob: mergedProfile.dob,
        city: mergedProfile.city,
        avatar_url: mergedProfile.avatar_url,
      });
    } catch (error) {
      if (error?.errorFields) return;
      message.error(error.message || 'Không thể cập nhật hồ sơ.');
    } finally {
      setSaving(false);
    }
  };

  const handleSendCode = async () => {
    try {
      setSendingCode(true);
      const data = await apiRequest('/api/profile/me/email/send-code', {
        method: 'POST',
      });
      setResendCooldown(Number(data.retry_after_seconds || 60));
      message.success(data.message || 'Đã gửi mã xác nhận.');
    } catch (error) {
      if (Number.isFinite(Number(error?.retry_after_seconds)) && Number(error.retry_after_seconds) > 0) {
        setResendCooldown(Number(error.retry_after_seconds));
      } else if (error?.message && typeof error.message === 'string') {
        const match = error.message.match(/(\d+)/);
        if (match) {
          setResendCooldown(Number(match[1]));
        }
      }
      message.error(error.message || 'Không thể gửi mã xác nhận.');
    } finally {
      setSendingCode(false);
    }
  };

  const handleVerifyEmail = async () => {
    try {
      const values = await form.validateFields(['verification_code', 'new_email']);
      setVerifyingCode(true);
      const data = await apiRequest('/api/profile/me/email/verify', {
        method: 'POST',
        body: {
          code: String(values.verification_code || '').trim().toUpperCase(),
          newEmail: values.new_email,
        },
      });

      const nextProfile = { ...profile, email: data.email };
      setProfile(nextProfile);
      form.setFieldValue('email', data.email);
      form.setFieldValue('verification_code', '');
      form.setFieldValue('new_email', '');
      message.success(data.message || 'Cập nhật email thành công.');
      onProfileUpdated?.({
        email: data.email,
        full_name: nextProfile.full_name,
        phone: nextProfile.phone,
        gender: nextProfile.gender,
        dob: nextProfile.dob,
        city: nextProfile.city,
        avatar_url: nextProfile.avatar_url,
      });
    } catch (error) {
      if (error?.errorFields) return;
      message.error(error.message || 'Không thể cập nhật email.');
    } finally {
      setVerifyingCode(false);
    }
  };

  return (
    <Modal
      title="Hồ sơ cá nhân"
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnHidden={false}
      width={680}
    >
      <Form form={form} layout="vertical" disabled={loading}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <Avatar
            size={72}
            src={profile?.avatar_url || undefined}
            icon={!profile?.avatar_url ? <UserOutlined /> : undefined}
          />
          <Space direction="vertical" size={4}>
            <Text strong>Ảnh đại diện</Text>
            <Text type="secondary">Tải ảnh đại diện lên Cloudinary.</Text>
            <Upload
              accept="image/*"
              showUploadList={false}
              customRequest={handleAvatarUpload}
              disabled={uploadingAvatar}
            >
              <Button icon={<CameraOutlined />} loading={uploadingAvatar}>
                {uploadingAvatar ? 'Đang tải ảnh...' : 'Chọn ảnh'}
              </Button>
            </Upload>
          </Space>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          <Form.Item
            name="full_name"
            label="Họ và tên"
            rules={[{ required: true, message: 'Vui lòng nhập họ và tên.' }]}
          >
            <Input placeholder="Nhập họ và tên" />
          </Form.Item>

          <Form.Item
            name="phone"
            label="Số điện thoại"
            rules={[
              { pattern: /^$|^0\d{9,10}$/, message: 'Số điện thoại không hợp lệ.' },
            ]}
          >
            <Input placeholder="Nhập số điện thoại" />
          </Form.Item>

          <Form.Item name="gender" label="Giới tính">
            <Select allowClear options={genderOptions} placeholder="Chọn giới tính" />
          </Form.Item>

          <Form.Item name="dob" label="Ngày sinh">
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" placeholder="Chọn ngày sinh" />
          </Form.Item>

          <Form.Item name="city" label="Quê quán">
            <Input placeholder="Nhập quê quán" />
          </Form.Item>

          <Form.Item name="email" label="Email hiện tại">
            <Input disabled />
          </Form.Item>
        </div>

        <div style={{ marginTop: 8, marginBottom: 20, padding: 16, border: '1px solid #e5e7eb', borderRadius: 10, background: '#fafafa' }}>
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <div>
              <Text strong>Đổi email</Text>
              <br />
              <Text type="secondary">Gửi mã xác nhận 6 ký tự về email hiện tại, sau đó nhập mã đúng để đổi sang email mới.</Text>
            </div>

            <Space wrap>
              <Button onClick={handleSendCode} loading={sendingCode} disabled={sendingCode || resendCooldown > 0}>
                {resendCooldown > 0 ? `Gửi lại sau ${resendCooldown}s` : 'Gửi mã xác nhận'}
              </Button>
            </Space>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
              <Form.Item
                name="verification_code"
                label="Mã xác nhận"
                rules={[
                  { required: true, message: 'Vui lòng nhập mã xác nhận.' },
                  { len: 6, message: 'Mã xác nhận phải gồm 6 ký tự.' },
                ]}
              >
                <Input placeholder="VD: A1B2C3" maxLength={6} />
              </Form.Item>

              <Form.Item
                name="new_email"
                label="Email mới"
                rules={[
                  { required: true, message: 'Vui lòng nhập email mới.' },
                  { type: 'email', message: 'Email mới không hợp lệ.' },
                ]}
              >
                <Input placeholder="Nhập email mới" />
              </Form.Item>
            </div>

            <Button type="primary" onClick={handleVerifyEmail} loading={verifyingCode}>
              Xác nhận đổi email
            </Button>
          </Space>
        </div>

        <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
          <Button onClick={onClose}>Đóng</Button>
          <Button type="primary" onClick={handleSaveProfile} loading={saving}>
            Lưu thay đổi
          </Button>
        </Space>
      </Form>
    </Modal>
  );
}
