import React from 'react';
import { Tooltip } from 'antd';
import {
  Car,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  FileText,
  LayoutDashboard,
  Settings,
  Truck,
  Users,
} from 'lucide-react';

const SW = 1.75; // stroke weight — soft & modern

const BG = '#F8F9FF';
const ACTIVE_BG = '#EFF6FF';
const HOVER_BG = '#E5EEFF';
const PRIMARY = '#3B4FD8';
const TEXT_MAIN = '#0B1C30';
const TEXT_SUB = '#424751';
const TEXT_MUTED = '#737782';
const BORDER = '#C2C6D340';

const MENU_CONFIG = {
  manager: [
    { key: 'dashboard', Icon: LayoutDashboard, label: 'Tổng quan', disabled: true },
    { key: 'users', Icon: Users, label: 'Người dùng' },
    { key: 'vehicles', Icon: Car, label: 'Quản lý xe' },
    { type: 'divider' },
    { key: 'settings', Icon: Settings, label: 'Cài đặt', disabled: true },
  ],
  coordinator: [
    { key: 'dashboard', Icon: LayoutDashboard, label: 'Tổng quan', disabled: true },
    { key: 'trips', Icon: Truck, label: 'Chuyến xe' },
  ],
  accountant: [
    { key: 'dashboard', Icon: LayoutDashboard, label: 'Tổng quan', disabled: true },
    { key: 'orders', Icon: FileText, label: 'Đơn hàng' },
    { key: 'payments', Icon: DollarSign, label: 'Thanh toán' },
  ],
};

const ROLE_LABELS = {
  manager: 'Quản trị viên',
  coordinator: 'Điều phối viên',
  accountant: 'Kế toán',
  driver: 'Tài xế',
};

function NavItem({ item, isActive, collapsed, onClick }) {
  const { Icon, label, key, disabled } = item;

  return (
    <Tooltip title={collapsed && !disabled ? label : ''} placement="right">
      <button
        onClick={() => !disabled && onClick(key)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: collapsed ? 0 : 10,
          width: '100%',
          padding: collapsed ? '9px 0' : '9px 12px',
          justifyContent: collapsed ? 'center' : 'flex-start',
          borderRadius: 8,
          border: 'none',
          outline: 'none',
          backgroundColor: isActive ? ACTIVE_BG : 'transparent',
          color: isActive ? PRIMARY : disabled ? '#CBD5E1' : TEXT_SUB,
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontFamily: "'Geist','Google Sans',system-ui,sans-serif",
          fontSize: 14,
          fontWeight: isActive ? 600 : 400,
          transform: isActive ? 'scale(0.98)' : 'scale(1)',
          transition: 'background-color 0.18s ease, color 0.18s ease, transform 0.1s ease, gap 0.22s cubic-bezier(0.4,0,0.2,1), padding 0.22s cubic-bezier(0.4,0,0.2,1)',
        }}
        onMouseEnter={(e) => {
          if (!disabled && !isActive) {
            e.currentTarget.style.backgroundColor = HOVER_BG;
            e.currentTarget.style.color = PRIMARY;
          }
        }}
        onMouseLeave={(e) => {
          if (!disabled && !isActive) {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = TEXT_SUB;
          }
        }}
      >
        <Icon size={18} strokeWidth={SW} style={{ flexShrink: 0 }} />
        <span
          style={{
            whiteSpace: 'nowrap',
            lineHeight: '20px',
            overflow: 'hidden',
            maxWidth: collapsed ? 0 : 160,
            opacity: collapsed ? 0 : 1,
            transition: 'max-width 0.22s cubic-bezier(0.4,0,0.2,1), opacity 0.16s ease',
          }}
        >
          {label}
        </span>
      </button>
    </Tooltip>
  );
}

export default function AppSidebar({ user, activeTab, onTabChange, collapsed, onCollapse }) {
  const role = user?.role || 'manager';
  const items = MENU_CONFIG[role] || MENU_CONFIG.manager;

  return (
    <aside
      className="g62-sidebar"
      style={{
        width: collapsed ? 68 : 260,
        minWidth: collapsed ? 68 : 260,
        minHeight: '100vh',
        alignSelf: 'stretch',
        backgroundColor: BG,
        display: 'flex',
        flexDirection: 'column',
        padding: 16,
        gap: 4,
        flexShrink: 0,
        transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1), min-width 0.22s cubic-bezier(0.4,0,0.2,1)',
        willChange: 'width',
        overflow: 'hidden',
        boxShadow: '1px 0 0 0 #C2C6D340',
        zIndex: 50,
      }}
    >
      {/* ── Brand ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: collapsed ? 0 : 12,
        padding: '12px 4px 16px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        transition: 'gap 0.22s cubic-bezier(0.4,0,0.2,1)',
      }}>
        <div style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          backgroundColor: PRIMARY,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          flexShrink: 0,
        }}>
          <Truck size={20} strokeWidth={2} />
        </div>

        <div style={{
          overflow: 'hidden',
          maxWidth: collapsed ? 0 : 180,
          opacity: collapsed ? 0 : 1,
          transition: 'max-width 0.22s cubic-bezier(0.4,0,0.2,1), opacity 0.16s ease',
        }}>
          <div style={{
            fontWeight: 800,
            fontSize: 18,
            color: PRIMARY,
            lineHeight: '22px',
            fontFamily: "'Geist', sans-serif",
            letterSpacing: '-0.3px',
            whiteSpace: 'nowrap',
          }}>
            LogisCount
          </div>
          <div style={{ fontSize: 11, color: TEXT_MUTED, whiteSpace: 'nowrap' }}>
            Ops Management
          </div>
        </div>
      </div>

      {/* ── Navigation ── */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
        {items.map((item) => {
          if (item.type === 'divider') {
            return (
              <div key="divider" style={{
                margin: '8px 0',
                borderTop: `1px solid ${BORDER}`,
              }} />
            );
          }
          return (
            <NavItem
              key={item.key}
              item={item}
              isActive={activeTab === item.key}
              collapsed={collapsed}
              onClick={onTabChange}
            />
          );
        })}
      </nav>

      {/* ── Collapse toggle ── */}
      <button
        onClick={() => onCollapse(!collapsed)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: collapsed ? 0 : 6,
          padding: '8px 12px',
          marginTop: 4,
          backgroundColor: 'transparent',
          border: `1px solid ${BORDER}`,
          borderRadius: 8,
          cursor: 'pointer',
          color: TEXT_MUTED,
          fontSize: 13,
          fontWeight: 500,
          fontFamily: "'Geist','Google Sans',sans-serif",
          transition: 'background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease, gap 0.22s cubic-bezier(0.4,0,0.2,1)',
          width: '100%',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = ACTIVE_BG;
          e.currentTarget.style.color = PRIMARY;
          e.currentTarget.style.borderColor = '#BFCBF7';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
          e.currentTarget.style.color = TEXT_MUTED;
          e.currentTarget.style.borderColor = BORDER;
        }}
      >
        {collapsed
          ? <ChevronRight size={16} strokeWidth={SW} style={{ flexShrink: 0 }} />
          : <ChevronLeft size={16} strokeWidth={SW} style={{ flexShrink: 0 }} />}
        <span style={{
          overflow: 'hidden',
          maxWidth: collapsed ? 0 : 80,
          opacity: collapsed ? 0 : 1,
          whiteSpace: 'nowrap',
          transition: 'max-width 0.22s cubic-bezier(0.4,0,0.2,1), opacity 0.16s ease',
        }}>
          Thu gọn
        </span>
      </button>
    </aside>
  );
}
