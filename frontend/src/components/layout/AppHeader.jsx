import React, { useState } from 'react';
import { Avatar, Badge, Button, Dropdown, Space, Typography } from 'antd';
import { Bell, ChevronDown, Grid, HelpCircle, LogOut, Settings2, User } from 'lucide-react';
import { C } from '../../styles/theme';
import ProfileModal from '../profile/ProfileModal';

const { Text } = Typography;
const SW = 1.75;

function roleLabel(role) {
  const labels = {
    manager: 'Manager',
    coordinator: 'Coordinator',
    accountant: 'Accountant',
    driver: 'Driver',
  };
  return labels[role] || 'User';
}

export default function AppHeader({ user, onLogout, onProfileUpdated }) {
  const [profileOpen, setProfileOpen] = useState(false);

  const userDropdown = {
    items: [
      {
        key: 'panel',
        disabled: true,
        label: (
          <div style={{ width: 300, padding: 6 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: 14,
                borderRadius: 16,
                background: `linear-gradient(135deg, ${C.surfaceContainerLow} 0%, #ffffff 100%)`,
                border: `1px solid ${C.outlineVariant}55`,
                marginBottom: 10,
              }}
            >
              <Avatar
                size={52}
                src={user?.avatar_url || undefined}
                style={{
                  backgroundColor: C.primary,
                  boxShadow: '0 10px 24px rgba(59,79,216,0.18)',
                  flexShrink: 0,
                }}
                icon={!user?.avatar_url ? <User size={22} strokeWidth={2} /> : undefined}
              />
              <div style={{ minWidth: 0 }}>
                <Text
                  strong
                  style={{
                    display: 'block',
                    color: C.onSurface,
                    fontSize: 15,
                    lineHeight: 1.2,
                    marginBottom: 2,
                  }}
                >
                  {user?.full_name || user?.email || 'User'}
                </Text>
                <Text
                  style={{
                    display: 'block',
                    color: C.onSurfaceVariant,
                    fontSize: 12,
                    wordBreak: 'break-word',
                    lineHeight: 1.35,
                  }}
                >
                  {user?.email}
                </Text>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    marginTop: 8,
                    padding: '4px 10px',
                    borderRadius: 999,
                    background: `${C.primarySoft}`,
                    color: C.primaryDark,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: 0.2,
                  }}
                >
                  {roleLabel(user?.role)}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <button
                type="button"
                onClick={() => setProfileOpen(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  border: `1px solid ${C.outlineVariant}45`,
                  background: '#fff',
                  borderRadius: 14,
                  padding: '12px 14px',
                  cursor: 'pointer',
                  color: C.onSurface,
                  textAlign: 'left',
                }}
              >
                <span
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 12,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: C.primarySoft,
                    color: C.primary,
                    flexShrink: 0,
                  }}
                >
                  <Settings2 size={16} strokeWidth={2} />
                </span>
                <span>
                  <span style={{ display: 'block', fontWeight: 600, fontSize: 13 }}>Ho so ca nhan</span>
                  <span style={{ display: 'block', fontSize: 11, color: C.onSurfaceVariant }}>Cap nhat thong tin, avatar va email</span>
                </span>
              </button>

              <button
                type="button"
                onClick={onLogout}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  border: 'none',
                  background: '#FFF1F2',
                  borderRadius: 14,
                  padding: '12px 14px',
                  cursor: 'pointer',
                  color: C.error,
                  textAlign: 'left',
                }}
              >
                <span
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 12,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#FFE2E5',
                    color: C.error,
                    flexShrink: 0,
                  }}
                >
                  <LogOut size={16} strokeWidth={2} />
                </span>
                <span>
                  <span style={{ display: 'block', fontWeight: 600, fontSize: 13 }}>Dang xuat</span>
                  <span style={{ display: 'block', fontSize: 11, color: '#B94A5A' }}>Ket thuc phien lam viec hien tai</span>
                </span>
              </button>
            </div>
          </div>
        ),
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

        <Space size={6} style={{ marginLeft: 16 }}>
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

          <Dropdown
            menu={userDropdown}
            placement="bottomRight"
            trigger={['click']}
            overlayStyle={{ paddingTop: 10 }}
          >
            <button
              type="button"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                border: `1px solid ${C.outlineVariant}55`,
                background: 'rgba(255,255,255,0.82)',
                borderRadius: 999,
                padding: '6px 10px 6px 6px',
                cursor: 'pointer',
                boxShadow: '0 10px 25px rgba(11,28,48,0.08)',
              }}
            >
              <Avatar
                size={34}
                src={user?.avatar_url || undefined}
                style={{ backgroundColor: C.primary, flexShrink: 0 }}
                icon={!user?.avatar_url ? <User size={16} strokeWidth={2} /> : undefined}
              />
              <div style={{ textAlign: 'left', lineHeight: 1.15, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: C.onSurface,
                    maxWidth: 120,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {user?.full_name || roleLabel(user?.role)}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: C.onSurfaceVariant,
                    textTransform: 'uppercase',
                    letterSpacing: 0.4,
                  }}
                >
                  {roleLabel(user?.role)}
                </div>
              </div>
              <ChevronDown size={15} strokeWidth={2} color={C.onSurfaceVariant} />
            </button>
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
