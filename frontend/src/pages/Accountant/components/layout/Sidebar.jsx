import { Tooltip } from "@heroui/react";
import {
  RiLineChartLine,
  RiFileList3Line,
  RiMoneyDollarCircleLine,
  RiHandCoinLine,
  RiBarChartBoxLine,
  RiLogoutBoxLine,
  RiArrowRightSLine,
  RiMenuFoldLine,
  RiMenuUnfoldLine,
} from "react-icons/ri";
import { TbReportAnalytics } from "react-icons/tb";

const NAV_GROUPS = [
  {
    label: "Tài chính",
    items: [
      { key: "revenue", label: "Doanh thu",  icon: RiLineChartLine },
      { key: "debt",    label: "Công nợ",    icon: RiFileList3Line },
    ],
  },
  {
    label: "Nhân sự",
    items: [
      { key: "salary",  label: "Bảng lương", icon: RiMoneyDollarCircleLine },
      { key: "advance", label: "Ứng lương",  icon: RiHandCoinLine },
    ],
  },
  {
    label: "Phân tích",
    items: [
      { key: "report", label: "Báo cáo", icon: TbReportAnalytics },
    ],
  },
];

function NavItem({ navKey, label, icon: Icon, disabled, active, collapsed, onViewChange }) {
  const base =
    "flex items-center gap-3 rounded-xl w-full text-left text-sm transition-all duration-150 " +
    (collapsed ? "px-0 py-2.5 justify-center" : "px-3 py-2.5");

  const button = (
    <button
      disabled={disabled}
      onClick={() => !disabled && onViewChange(navKey)}
      className={`group ${base}
        ${disabled
          ? "text-gray-300 cursor-not-allowed select-none"
          : active
            ? "bg-blue-600 text-white font-semibold shadow-sm shadow-blue-200"
            : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"
        }`}
    >
      <Icon
        size={18}
        className={
          disabled
            ? "text-gray-300"
            : active
              ? "text-white flex-shrink-0"
              : "text-gray-400 group-hover:text-gray-600 flex-shrink-0"
        }
      />
      {!collapsed && <span className="flex-1 truncate">{label}</span>}
      {!collapsed && active && !disabled && (
        <RiArrowRightSLine size={16} className="text-blue-200" />
      )}
    </button>
  );

  if (collapsed || disabled) {
    return (
      <Tooltip
        content={disabled ? "Đang phát triển" : label}
        placement="right"
        color="foreground"
      >
        {button}
      </Tooltip>
    );
  }

  return button;
}

export function Sidebar({ activeView, onViewChange, user, onLogout, onProfile, collapsed, onToggle }) {
  const avatar = user?.full_name?.[0]?.toUpperCase() ?? "A";

  return (
    <aside
      className={`flex flex-col min-h-screen bg-white border-r border-gray-200 flex-shrink-0
                  transition-all duration-200 ${collapsed ? "w-[60px]" : "w-[220px]"}`}
    >
      {}
      <div className={`flex items-center h-16 border-b border-gray-100
                       ${collapsed ? "justify-center px-0" : "gap-3 px-4"}`}>
        {!collapsed && (
          <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-blue-600 flex-shrink-0">
            <RiBarChartBoxLine size={17} className="text-white" />
          </div>
        )}
        {!collapsed && (
          <div className="flex flex-col flex-1 min-w-0">
            <span className="font-bold text-sm text-gray-800 leading-none truncate">Finance HQ</span>
            <span className="text-xs text-gray-400 mt-0.5">Kế toán</span>
          </div>
        )}
        <button
          onClick={onToggle}
          className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-400
                     hover:bg-gray-100 hover:text-gray-700 transition-colors flex-shrink-0"
          title={collapsed ? "Mở sidebar" : "Thu sidebar"}
        >
          {collapsed
            ? <RiMenuUnfoldLine size={17} />
            : <RiMenuFoldLine size={17} />
          }
        </button>
      </div>

      {}
      <nav className={`flex-1 py-4 flex flex-col gap-5 overflow-y-auto overflow-x-hidden
                       ${collapsed ? "px-1" : "px-3"}`}>
        {NAV_GROUPS.map(({ label, items }) => (
          <div key={label}>
            {!collapsed && (
              <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                {label}
              </p>
            )}
            {collapsed && <div className="mb-1.5 border-t border-gray-100 mx-1" />}
            <div className="flex flex-col gap-0.5">
              {items.map(({ key, label: itemLabel, icon, disabled }) => (
                <NavItem
                  key={key}
                  navKey={key}
                  label={itemLabel}
                  icon={icon}
                  disabled={disabled}
                  active={activeView === key}
                  collapsed={collapsed}
                  onViewChange={onViewChange}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {}
      <div className={`pb-4 flex flex-col gap-1 border-t border-gray-100 pt-3
                       ${collapsed ? "px-1 items-center" : "px-3"}`}>
        {collapsed ? (
          <>
            <Tooltip content={user?.full_name ?? "Hồ sơ"} placement="right" color="foreground">
              <button
                onClick={onProfile}
                className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center
                           text-white font-bold text-xs hover:ring-2 hover:ring-blue-300 transition-all"
              >
                {avatar}
              </button>
            </Tooltip>
            <Tooltip content="Đăng xuất" placement="right" color="foreground">
              <button
                onClick={onLogout}
                className="flex items-center justify-center w-8 h-8 rounded-lg
                           bg-red-100 text-red-700 hover:bg-red-700 hover:text-white transition-colors"
              >
                <RiLogoutBoxLine size={16} />
              </button>
            </Tooltip>
          </>
        ) : (
          <>
            <button
              onClick={onProfile}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl w-full text-left
                         text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-800
                         transition-colors duration-150"
            >
              <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center
                              text-white font-bold text-xs flex-shrink-0">
                {avatar}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-medium text-gray-700 truncate text-xs leading-tight">
                  {user?.full_name ?? "Kế toán"}
                </span>
                <span className="text-gray-400 truncate text-[11px] mt-0.5">
                  {user?.email ?? ""}
                </span>
              </div>
            </button>

            <button
              onClick={onLogout}
              className="flex items-center gap-3 px-3 py-2 rounded-xl w-full text-left
                         text-sm bg-red-100 text-red-700 hover:bg-red-700 hover:text-white
                         transition-colors duration-150"
            >
              <RiLogoutBoxLine size={16} />
              <span>Đăng xuất</span>
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
