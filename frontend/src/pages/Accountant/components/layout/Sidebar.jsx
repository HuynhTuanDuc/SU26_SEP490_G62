import { Tooltip } from "@heroui/react";
import {
  RiLineChartLine,
  RiFileList3Line,
  RiMoneyDollarCircleLine,
  RiHandCoinLine,
  RiBarChartBoxLine,
  RiLogoutBoxLine,
  RiArrowRightSLine,
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

function NavItem({ navKey, label, icon: Icon, disabled, active, onViewChange }) {
  const base =
    "flex items-center gap-3 px-3 py-2.5 rounded-lg w-full text-left text-sm transition-all duration-150";

  if (disabled) {
    return (
      <Tooltip content="Đang phát triển" placement="right" color="foreground">
        <button disabled className={`${base} text-slate-700 cursor-not-allowed select-none`}>
          <Icon size={18} />
          <span>{label}</span>
        </button>
      </Tooltip>
    );
  }

  return (
    <button
      onClick={() => onViewChange(navKey)}
      className={`group ${base}
        ${active
          ? "bg-blue-600 text-white font-semibold shadow-md shadow-blue-900/40"
          : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
        }`}
    >
      <Icon size={18} className={active ? "text-white" : "text-slate-500 group-hover:text-slate-300"} />
      <span className="flex-1">{label}</span>
      {active && <RiArrowRightSLine size={16} className="text-blue-200" />}
    </button>
  );
}

export function Sidebar({ activeView, onViewChange, user, onLogout, onProfile }) {
  const avatar = user?.full_name?.[0]?.toUpperCase() ?? "A";

  return (
    <aside className="flex flex-col w-[220px] min-h-screen bg-slate-900 text-slate-100 flex-shrink-0">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 h-16 border-b border-slate-800">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-500">
          <RiBarChartBoxLine size={17} className="text-white" />
        </div>
        <div className="flex flex-col">
          <span className="font-bold text-sm text-white leading-none">Finance HQ</span>
          <span className="text-xs text-slate-500 mt-0.5">Kế toán</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-5 overflow-y-auto">
        {NAV_GROUPS.map(({ label, items }) => (
          <div key={label}>
            <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-600">
              {label}
            </p>
            <div className="flex flex-col gap-0.5">
              {items.map(({ key, label: itemLabel, icon, disabled }) => (
                <NavItem
                  key={key}
                  navKey={key}
                  label={itemLabel}
                  icon={icon}
                  disabled={disabled}
                  active={activeView === key}
                  onViewChange={onViewChange}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-3 pb-4 flex flex-col gap-1 border-t border-slate-800 pt-3">
        <button
          onClick={onProfile}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg w-full text-left
                     text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-100
                     transition-colors duration-150"
        >
          <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center
                          text-white font-bold text-xs flex-shrink-0">
            {avatar}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-medium text-slate-200 truncate text-xs leading-tight">
              {user?.full_name ?? "Kế toán"}
            </span>
            <span className="text-slate-500 truncate text-[11px] mt-0.5">
              {user?.email ?? ""}
            </span>
          </div>
        </button>

        <button
          onClick={onLogout}
          className="flex items-center gap-3 px-3 py-2 rounded-lg w-full text-left
                     text-sm text-slate-500 hover:bg-red-900/30 hover:text-red-400
                     transition-colors duration-150"
        >
          <RiLogoutBoxLine size={16} />
          <span>Đăng xuất</span>
        </button>
      </div>
    </aside>
  );
}
