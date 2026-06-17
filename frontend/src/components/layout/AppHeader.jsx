import React, { useState } from 'react';
import { Avatar, Badge, Button, Dropdown, Space, Typography } from 'antd';
import { Bell, Grid, HelpCircle, LogOut, User } from 'lucide-react';
import { C } from '../../styles/theme';
import ProfileModal from '../profile/ProfileModal';

const { Text } = Typography;
const SW = 1.75;

export default function AppHeader({ user, onLogout, onProfileUpdated }) {
  const [profileOpen, setProfileOpen] = useState(false);

  const userMenu = {
    items: [
      {
        key: 'info',
        label: (
          <div style={{ padding: '4px 0', minWidth: 160 }}>
            <Text strong style={{ display: 'block', fontSize: 13, color: C.onSurface }}>
              {user?.full_name || user?.email}
            </Text>
            <Text style={{ fontSize: 11, color: C.outline }}>{user?.email}</Text>
          </div>
        ),
        disabled: true,
      },
      { type: 'divider' },
      {
        key: 'profile',
        label: 'Ho so ca nhan',
        onClick: () => setProfileOpen(true),
      },
      {
        key: 'logout',
        icon: <LogOut size={14} strokeWidth={SW} />,
        label: 'Đăng xuất',
        onClick: onLogout,
        danger: true,
      },
    ],
  };

  return (
    <>
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        height: 64,
        padding: '0 24px',
        background: 'rgba(248,249,255,0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: `1px solid ${C.outlineVariant}50`,
        position: 'sticky',
        top: 0,
        zIndex: 40,
        flexShrink: 0,
      }}>
        <div style={{ flex: 1 }} />

        <Space size={2} style={{ marginLeft: 16 }}>
          <Badge count={3} size="small" color="#BA1A1A">
            <Button
              type="text"
              icon={<Bell size={18} strokeWidth={SW} />}
              style={{ color: C.onSurfaceVariant, borderRadius: '50%', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            />
          </Badge>

          <Button
            type="text"
            icon={<HelpCircle size={18} strokeWidth={SW} />}
            style={{ color: C.onSurfaceVariant, borderRadius: '50%', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          />

          <Button
            type="text"
            icon={<Grid size={18} strokeWidth={SW} />}
            style={{ color: C.onSurfaceVariant, borderRadius: '50%', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          />

          <Dropdown menu={userMenu} placement="bottomRight" arrow={{ pointAtCenter: true }}>
            <Avatar
              size={34}
              style={{ backgroundColor: C.primary, cursor: 'pointer', flexShrink: 0, marginLeft: 6 }}
              icon={<User size={16} strokeWidth={2} />}
            />
          </Dropdown>
        </Space>
      </header>

      <ProfileModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        onProfileUpdated={(nextProfile) => {
          onProfileUpdated?.(nextProfile);
        }}
      />
    </>
  );
}
