import React, { useEffect, useState } from 'react';
import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button, Input, Select, SelectItem, Avatar, Divider, Chip,
} from '@heroui/react';
import { DatePicker } from 'antd';
import { CameraOutlined } from '@ant-design/icons';
import Upload from 'antd/lib/upload';
import message from 'antd/lib/message';
import dayjs from 'dayjs';
import { apiRequest } from '../../services/apiClient';
import { RiUser3Line, RiMailLine, RiPhoneLine, RiMapPinLine, RiShieldCheckLine, RiSendPlaneLine } from 'react-icons/ri';

const GENDER_OPTIONS = [
  { key: 'male',   label: 'Nam' },
  { key: 'female', label: 'Nữ' },
  { key: 'other',  label: 'Khác' },
];

export default function ProfileModal({ open, onClose, onProfileUpdated }) {
  const [profile, setProfile]           = useState(null);
  const [loading, setLoading]           = useState(false);
  const [saving, setSaving]             = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [sendingCode, setSendingCode]   = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Controlled fields
  const [fullName, setFullName]   = useState('');
  const [phone, setPhone]         = useState('');
  const [gender, setGender]       = useState(new Set([]));
  const [dob, setDob]             = useState(null);
  const [city, setCity]           = useState('');
  const [verCode, setVerCode]     = useState('');
  const [newEmail, setNewEmail]   = useState('');
  const [errors, setErrors]       = useState({});

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      setLoading(true);
      try {
        const data = await apiRequest('/api/profile/me');
        const p = data.profile;
        setProfile(p);
        setFullName(p.full_name || '');
        setPhone(p.phone || '');
        setGender(p.gender ? new Set([p.gender]) : new Set([]));
        setDob(p.dob ? dayjs(p.dob) : null);
        setCity(p.city || '');
        setVerCode('');
        setNewEmail('');
        setErrors({});
        setResendCooldown(0);
      } catch (err) {
        message.error(err.message || 'Không thể tải hồ sơ.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [open]);

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const timer = setInterval(() => {
      setResendCooldown((c) => {
        if (c <= 1) { clearInterval(timer); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const validate = () => {
    const e = {};
    if (!fullName.trim()) e.full_name = 'Vui lòng nhập họ và tên.';
    if (phone && !/^0\d{9,10}$/.test(phone)) e.phone = 'Số điện thoại không hợp lệ.';
    return e;
  };

  const handleAvatarUpload = async ({ file, onSuccess, onError }) => {
    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const data = await apiRequest('/api/profile/me/avatar', { method: 'POST', body: formData });
      const next = { ...profile, avatar_url: data.avatar_url };
      setProfile(next);
      message.success(data.message || 'Cập nhật ảnh đại diện thành công.');
      onProfileUpdated?.({ ...next });
      onSuccess?.(data, file);
    } catch (err) {
      message.error(err.message || 'Không thể tải avatar lên.');
      onError?.(err);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setSaving(true);
    try {
      const data = await apiRequest('/api/profile/me', {
        method: 'PATCH',
        body: {
          full_name: fullName,
          phone:     phone || null,
          gender:    [...gender][0] || null,
          dob:       dob ? dob.format('YYYY-MM-DD') : null,
          city:      city || null,
        },
      });
      const merged = { ...profile, ...data.profile };
      setProfile(merged);
      message.success(data.message || 'Cập nhật hồ sơ thành công.');
      onProfileUpdated?.({ ...merged });
    } catch (err) {
      message.error(err.message || 'Không thể cập nhật hồ sơ.');
    } finally {
      setSaving(false);
    }
  };

  const handleSendCode = async () => {
    setSendingCode(true);
    try {
      const data = await apiRequest('/api/profile/me/email/send-code', { method: 'POST' });
      setResendCooldown(Number(data.retry_after_seconds || 60));
      message.success(data.message || 'Đã gửi mã xác nhận.');
    } catch (err) {
      const seconds = Number(err?.retry_after_seconds) || Number((err?.message || '').match(/(\d+)/)?.[1]) || 0;
      if (seconds > 0) setResendCooldown(seconds);
      message.error(err.message || 'Không thể gửi mã xác nhận.');
    } finally {
      setSendingCode(false);
    }
  };

  const handleVerifyEmail = async () => {
    const e = {};
    if (!verCode.trim()) e.verCode = 'Vui lòng nhập mã xác nhận.';
    else if (verCode.trim().length !== 6) e.verCode = 'Mã xác nhận phải gồm 6 ký tự.';
    if (!newEmail.trim()) e.newEmail = 'Vui lòng nhập email mới.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) e.newEmail = 'Email mới không hợp lệ.';
    if (Object.keys(e).length) { setErrors((prev) => ({ ...prev, ...e })); return; }

    setVerifyingCode(true);
    try {
      const data = await apiRequest('/api/profile/me/email/verify', {
        method: 'POST',
        body: { code: verCode.trim().toUpperCase(), newEmail },
      });
      const next = { ...profile, email: data.email };
      setProfile(next);
      setVerCode('');
      setNewEmail('');
      message.success(data.message || 'Cập nhật email thành công.');
      onProfileUpdated?.({ ...next });
    } catch (err) {
      message.error(err.message || 'Không thể cập nhật email.');
    } finally {
      setVerifyingCode(false);
    }
  };

  return (
    <Modal isOpen={open} onClose={onClose} size="xl" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader className="flex flex-col gap-0.5 pb-2">
          <span className="text-base font-bold">Hồ sơ cá nhân</span>
          <span className="text-xs font-normal text-gray-400">Cập nhật thông tin và ảnh đại diện</span>
        </ModalHeader>

        <ModalBody className="gap-4 py-3">
          {/* Avatar */}
          <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-xl border border-gray-100">
            <Avatar
              src={profile?.avatar_url}
              name={profile?.full_name}
              size="lg"
              className="shrink-0"
            />
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-sm font-semibold text-gray-800 truncate">
                {profile?.full_name || '—'}
              </span>
              <span className="text-xs text-gray-400 truncate">{profile?.email || '—'}</span>
              <Upload
                accept="image/*"
                showUploadList={false}
                customRequest={handleAvatarUpload}
                disabled={uploadingAvatar || loading}
              >
                <Button
                  size="sm"
                  variant="flat"
                  color="default"
                  isLoading={uploadingAvatar}
                  startContent={!uploadingAvatar && <CameraOutlined />}
                  className="mt-1 h-7 text-xs"
                >
                  {uploadingAvatar ? 'Đang tải...' : 'Đổi ảnh'}
                </Button>
              </Upload>
            </div>
          </div>

          {/* Basic info */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Input
              label="Họ và tên"
              placeholder="Nhập họ và tên"
              value={fullName}
              onValueChange={(v) => { setFullName(v); setErrors((p) => ({ ...p, full_name: null })); }}
              isInvalid={!!errors.full_name}
              errorMessage={errors.full_name}
              isDisabled={loading}
              isRequired
              startContent={<RiUser3Line className="text-gray-400 shrink-0" size={15} />}
              classNames={{ inputWrapper: 'bg-white' }}
            />

            <Input
              label="Số điện thoại"
              placeholder="0xxxxxxxxx"
              value={phone}
              onValueChange={(v) => { setPhone(v); setErrors((p) => ({ ...p, phone: null })); }}
              isInvalid={!!errors.phone}
              errorMessage={errors.phone}
              isDisabled={loading}
              startContent={<RiPhoneLine className="text-gray-400 shrink-0" size={15} />}
              classNames={{ inputWrapper: 'bg-white' }}
            />

            <Select
              label="Giới tính"
              placeholder="Chọn giới tính"
              selectedKeys={gender}
              onSelectionChange={setGender}
              isDisabled={loading}
              classNames={{ trigger: 'bg-white' }}
            >
              {GENDER_OPTIONS.map(({ key, label }) => (
                <SelectItem key={key}>{label}</SelectItem>
              ))}
            </Select>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-700">Ngày sinh</label>
              <DatePicker
                value={dob}
                onChange={setDob}
                format="DD/MM/YYYY"
                placeholder="Chọn ngày sinh"
                disabled={loading}
                style={{ width: '100%', height: 40, borderRadius: 10 }}
              />
            </div>

            <Input
              label="Quê quán"
              placeholder="Tỉnh / Thành phố"
              value={city}
              onValueChange={setCity}
              isDisabled={loading}
              startContent={<RiMapPinLine className="text-gray-400 shrink-0" size={15} />}
              classNames={{ inputWrapper: 'bg-white' }}
            />

            <Input
              label="Email hiện tại"
              value={profile?.email || ''}
              isReadOnly
              startContent={<RiMailLine className="text-gray-400 shrink-0" size={15} />}
              classNames={{ inputWrapper: 'bg-gray-50' }}
            />
          </div>

          <Divider className="my-0" />

          {/* Change email */}
          <div className="flex flex-col gap-3 p-3 bg-blue-50/40 rounded-xl border border-blue-100">
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5">
                  <RiShieldCheckLine size={14} className="text-blue-600" />
                  <span className="text-sm font-semibold text-gray-800">Đổi email</span>
                </div>
                <span className="text-xs text-gray-500">
                  Gửi mã 6 ký tự về email hiện tại, nhập đúng mã để chuyển sang email mới.
                </span>
              </div>
              <Button
                size="sm"
                variant="flat"
                color="primary"
                isLoading={sendingCode}
                isDisabled={sendingCode || resendCooldown > 0 || loading}
                onPress={handleSendCode}
                startContent={!sendingCode && <RiSendPlaneLine size={13} />}
                className="shrink-0 h-7 text-xs"
              >
                {resendCooldown > 0 ? `${resendCooldown}s` : 'Gửi mã'}
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Input
                label="Mã xác nhận"
                placeholder="A1B2C3"
                value={verCode}
                onValueChange={(v) => { setVerCode(v.toUpperCase()); setErrors((p) => ({ ...p, verCode: null })); }}
                maxLength={6}
                isInvalid={!!errors.verCode}
                errorMessage={errors.verCode}
                isDisabled={loading}
                classNames={{ inputWrapper: 'bg-white' }}
              />
              <Input
                label="Email mới"
                placeholder="email@example.com"
                value={newEmail}
                onValueChange={(v) => { setNewEmail(v); setErrors((p) => ({ ...p, newEmail: null })); }}
                isInvalid={!!errors.newEmail}
                errorMessage={errors.newEmail}
                isDisabled={loading}
                startContent={<RiMailLine className="text-gray-400 shrink-0" size={15} />}
                classNames={{ inputWrapper: 'bg-white' }}
              />
            </div>

            <Button
              size="sm"
              color="primary"
              isLoading={verifyingCode}
              isDisabled={loading}
              onPress={handleVerifyEmail}
              className="self-start h-8 text-xs"
            >
              Xác nhận đổi email
            </Button>
          </div>
        </ModalBody>

        <ModalFooter className="pt-2">
          <Button variant="light" onPress={onClose} isDisabled={saving}>
            Đóng
          </Button>
          <Button color="primary" onPress={handleSave} isLoading={saving} isDisabled={loading}>
            Lưu thay đổi
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
