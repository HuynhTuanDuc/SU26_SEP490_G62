import React, { useEffect, useState } from 'react';
import { Avatar, Badge, Button, Dropdown, Space, Typography } from 'antd';
import { Bell, ChevronDown, Grid, HelpCircle, LogOut, Settings2, User } from 'lucide-react';
import { apiRequest } from '../../services/apiClient';
import { useRoleRealtime } from '../../hooks/useRoleRealtime';
import { C } from '../../styles/theme';
import ProfileModal from '../profile/ProfileModal';

const { Text } = Typography;
const SW = 1.75;
const NOTIFICATION_ENABLED_ROLES = new Set(['manager', 'coordinator']);

function roleLabel(role) {
  const labels = {
    manager: 'Manager',
    coordinator: 'Coordinator',
    accountant: 'Accountant',
    driver: 'Driver',
  };
  return labels[role] || 'User';
}

function formatNotificationTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('vi-VN');
}

export default function AppHeader({ user, onLogout, onProfileUpdated, showUtilityActions = true }) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const [notificationMenuOpen, setNotificationMenuOpen] = useState(false);
  const notificationSupported = NOTIFICATION_ENABLED_ROLES.has(String(user?.role || '').toLowerCase());

  const loadNotifications = async () => {
    if (!notificationSupported) return;

    setNotificationsLoading(true);
    try {
      const data = await apiRequest('/api/notifications?limit=10&page=1');
      setNotifications(data.notifications || []);
      setNotificationUnreadCount(Number(data.unreadCount || 0));
    } catch {
      setNotifications([]);
      setNotificationUnreadCount(0);
    } finally {
      setNotificationsLoading(false);
    }
  };

  useEffect(() => {
    if (!notificationSupported) {
      setNotifications([]);
      setNotificationUnreadCount(0);
      setNotificationMenuOpen(false);
      return;
    }

    loadNotifications();
  }, [notificationSupported, user?.id, user?.role]);

  useRoleRealtime(user, {
    onMessage: (payload) => {
      if (!notificationSupported || !payload?.type) return;

      if (payload.type === 'notification.created') {
        setNotificationUnreadCount((current) => current + 1);
        loadNotifications();
      }

      if (payload.type === 'notification.read' || payload.type === 'notification.read_all') {
        loadNotifications();
      }
    },
  });

  const handleOpenNotifications = async (nextOpen) => {
    if (!notificationSupported) return;
    setNotificationMenuOpen(nextOpen);
    if (!nextOpen) return;

    await loadNotifications();
    if (notificationUnreadCount > 0) {
      try {
        await apiRequest('/api/notifications/read-all', { method: 'PATCH' });
        setNotificationUnreadCount(0);
        setNotifications((current) => current.map((item) => ({ ...item, is_read: true })));
      } catch {
        // Ignore notification mark-as-read failures in header UI.
      }
    }
  };

  const notificationDropdown = {
    items: [
      {
        key: 'notifications-panel',
        disabled: true,
        label: (
          <div style={{ width: 340, padding: 6 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 8px 12px',
                borderBottom: `1px solid ${C.outlineVariant}45`,
                marginBottom: 8,
              }}
            >
              <div>
                <Text strong style={{ color: C.onSurface }}>
                  {user?.role === 'manager' ? 'Thông báo Manager' : 'Thông báo Coordinator'}
                </Text>
              </div>
              <Text style={{ color: C.onSurfaceVariant, fontSize: 12 }}>
                {notificationUnreadCount} mới
              </Text>
            </div>

            <div style={{ maxHeight: 360, overflowY: 'auto', display: 'grid', gap: 8, paddingRight: 4 }}>
              {notificationsLoading ? (
                <div style={{ padding: '12px 8px', color: C.onSurfaceVariant }}>Đang tải thông báo...</div>
              ) : notifications.length === 0 ? (
                <div style={{ padding: '12px 8px', color: C.onSurfaceVariant }}>Chưa có thông báo.</div>
              ) : (
                notifications.map((notification) => (
                  <div
                    key={notification.id || `${notification.title}-${notification.created_at}`}
                    style={{
                      padding: 12,
                      borderRadius: 14,
                      background: notification.is_read ? '#fff' : C.primarySoft,
                      border: `1px solid ${notification.is_read ? `${C.outlineVariant}40` : `${C.primary}25`}`,
                    }}
                  >
                    <Text strong style={{ display: 'block', color: C.onSurface, marginBottom: 4 }}>
                      {notification.title}
                    </Text>
                    <Text style={{ display: 'block', color: C.onSurfaceVariant, fontSize: 12, marginBottom: 6 }}>
                      {notification.message || '-'}
                    </Text>
                    <Text style={{ color: C.onSurfaceVariant, fontSize: 11 }}>
                      {formatNotificationTime(notification.created_at)}
                    </Text>
                  </div>
                ))
              )}
            </div>
          </div>
        ),
      },
    ],
  };

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
                  <span style={{ display: 'block', fontWeight: 600, fontSize: 13 }}>Hồ sơ cá nhân</span>
                  <span style={{ display: 'block', fontSize: 11, color: C.onSurfaceVariant }}>Cập nhật thông tin, avatar và email</span>
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
                  <span style={{ display: 'block', fontWeight: 600, fontSize: 13 }}>Đăng xuất</span>
                  <span style={{ display: 'block', fontSize: 11, color: '#B94A5A' }}>Kết thúc phiên làm việc hiện tại</span>
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
          {showUtilityActions && (
            <>
              {notificationSupported ? (
                <Dropdown
                  menu={notificationDropdown}
                  placement="bottomRight"
                  trigger={['click']}
                  open={notificationMenuOpen}
                  onOpenChange={handleOpenNotifications}
                  overlayStyle={{ paddingTop: 10 }}
                >
                  <Badge count={notificationUnreadCount > 0 ? notificationUnreadCount : 0} size="small" color="#BA1A1A">
                    <Button
                      type="text"
                      icon={<Bell size={18} strokeWidth={SW} />}
                      style={{ color: C.onSurfaceVariant, borderRadius: '50%', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    />
                  </Badge>
                </Dropdown>
              ) : null}

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
            </>
          )}

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
