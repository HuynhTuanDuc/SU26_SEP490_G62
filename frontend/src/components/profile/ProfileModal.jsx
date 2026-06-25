import React, { useEffect, useState } from 'react';
import { Avatar, Button, DatePicker, Form, Input, Upload, message, Modal, Select, Space, Typography } from 'antd';
import { CameraOutlined, UserOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { apiRequest } from '../../services/apiClient';

const { Text } = Typography;

const genderOptions = [
  { value: 'male', label: 'Nam' },
  { value: 'female', label: 'Nu' },
  { value: 'other', label: 'Khac' },
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

  const token = localStorage.getItem('token');

  useEffect(() => {
    if (!open) return;

    const loadProfile = async () => {
      try {
        setLoading(true);
        const data = await apiRequest('/api/profile/me', { token });
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
        message.error(error.message || 'Khong the tai ho so.');
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [form, open, token]);

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
        token,
        body: formData,
      });

      const nextProfile = { ...profile, avatar_url: data.avatar_url };
      setProfile(nextProfile);
      message.success(data.message || 'Cap nhat avatar thanh cong.');
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
      message.error(error.message || 'Khong the tai avatar len.');
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
        token,
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
      message.success(data.message || 'Cap nhat ho so thanh cong.');
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
      message.error(error.message || 'Khong the cap nhat ho so.');
    } finally {
      setSaving(false);
    }
  };

  const handleSendCode = async () => {
    try {
      setSendingCode(true);
      const data = await apiRequest('/api/profile/me/email/send-code', {
        method: 'POST',
        token,
      });
      setResendCooldown(Number(data.retry_after_seconds || 60));
      message.success(data.message || 'Da gui ma xac nhan.');
    } catch (error) {
      if (Number.isFinite(Number(error?.retry_after_seconds)) && Number(error.retry_after_seconds) > 0) {
        setResendCooldown(Number(error.retry_after_seconds));
      } else if (error?.message && typeof error.message === 'string') {
        const match = error.message.match(/(\d+)/);
        if (match) {
          setResendCooldown(Number(match[1]));
        }
      }
      message.error(error.message || 'Khong the gui ma xac nhan.');
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
        token,
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
      message.success(data.message || 'Cap nhat email thanh cong.');
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
      message.error(error.message || 'Khong the cap nhat email.');
    } finally {
      setVerifyingCode(false);
    }
  };

  return (
    <Modal
      title="Ho so ca nhan"
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
            <Text strong>Avatar</Text>
            <Text type="secondary">Tai anh dai dien len Cloudinary.</Text>
            <Upload
              accept="image/*"
              showUploadList={false}
              customRequest={handleAvatarUpload}
              disabled={uploadingAvatar}
            >
              <Button icon={<CameraOutlined />} loading={uploadingAvatar}>
                {uploadingAvatar ? 'Dang tai anh...' : 'Chon avatar'}
              </Button>
            </Upload>
          </Space>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          <Form.Item
            name="full_name"
            label="Ho va ten"
            rules={[{ required: true, message: 'Vui long nhap ho va ten.' }]}
          >
            <Input placeholder="Nhap ho va ten" />
          </Form.Item>

          <Form.Item
            name="phone"
            label="So dien thoai"
            rules={[
              { pattern: /^$|^0\d{9,10}$/, message: 'So dien thoai khong hop le.' },
            ]}
          >
            <Input placeholder="Nhap so dien thoai" />
          </Form.Item>

          <Form.Item name="gender" label="Gioi tinh">
            <Select allowClear options={genderOptions} placeholder="Chon gioi tinh" />
          </Form.Item>

          <Form.Item name="dob" label="Ngay sinh">
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" placeholder="Chon ngay sinh" />
          </Form.Item>

          <Form.Item name="city" label="Que quan">
            <Input placeholder="Nhap que quan" />
          </Form.Item>

          <Form.Item name="email" label="Email hien tai">
            <Input disabled />
          </Form.Item>
        </div>

        <div style={{ marginTop: 8, marginBottom: 20, padding: 16, border: '1px solid #e5e7eb', borderRadius: 10, background: '#fafafa' }}>
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <div>
              <Text strong>Doi email</Text>
              <br />
              <Text type="secondary">Gui ma xac nhan 6 ky tu ve email hien tai, sau do nhap ma dung de doi sang email moi.</Text>
            </div>

            <Space wrap>
              <Button onClick={handleSendCode} loading={sendingCode} disabled={sendingCode || resendCooldown > 0}>
                {resendCooldown > 0 ? `Gui lai sau ${resendCooldown}s` : 'Gui ma xac nhan'}
              </Button>
            </Space>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
              <Form.Item
                name="verification_code"
                label="Ma xac nhan"
                rules={[
                  { required: true, message: 'Vui long nhap ma xac nhan.' },
                  { len: 6, message: 'Ma xac nhan phai gom 6 ky tu.' },
                ]}
              >
                <Input placeholder="VD: A1B2C3" maxLength={6} />
              </Form.Item>

              <Form.Item
                name="new_email"
                label="Email moi"
                rules={[
                  { required: true, message: 'Vui long nhap email moi.' },
                  { type: 'email', message: 'Email moi khong hop le.' },
                ]}
              >
                <Input placeholder="Nhap email moi" />
              </Form.Item>
            </div>

            <Button type="primary" onClick={handleVerifyEmail} loading={verifyingCode}>
              Xac nhan doi email
            </Button>
          </Space>
        </div>

        <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
          <Button onClick={onClose}>Dong</Button>
          <Button type="primary" onClick={handleSaveProfile} loading={saving}>
            Luu thay doi
          </Button>
        </Space>
      </Form>
    </Modal>
  );
}
