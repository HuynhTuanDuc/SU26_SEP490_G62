import { RiFileList3Line, RiTimeLine, RiLoader2Line, RiCheckboxCircleLine } from "react-icons/ri";

const DEBT_FILTERS = [
  { key: "all",     label: "Tất cả",      icon: RiFileList3Line },
  { key: "unpaid",  label: "Chưa thu",    icon: RiTimeLine },
  { key: "partial", label: "Thu một phần", icon: RiLoader2Line },
  { key: "paid",    label: "Đã thu đủ",   icon: RiCheckboxCircleLine },
];

export function FilterBar({ activeFilter, onFilterChange, totalItems }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex gap-1 bg-gray-100/80 p-1 rounded-xl">
        {DEBT_FILTERS.map(({ key, label, icon: Icon }) => {
          const active = activeFilter === key;
          return (
            <button
              key={key}
              onClick={() => onFilterChange(key)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium
                          transition-all duration-150
                ${active
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-800"
                }`}
            >
              <Icon size={14} className={active ? "text-blue-500" : "text-gray-400"} />
              {label}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-1.5 text-xs text-gray-400 font-medium">
        <RiFileList3Line size={13} className="text-gray-300" />
        {totalItems ?? 0} đơn hàng
      </div>
    </div>
  );
}
