import { Input, Select, SelectItem } from "@heroui/react";
import { RiFileList3Line, RiTimeLine, RiLoader2Line, RiCheckboxCircleLine } from "react-icons/ri";

const DEBT_FILTERS = [
  { key: "all",     label: "Tất cả",      icon: RiFileList3Line },
  { key: "unpaid",  label: "Chưa thu",    icon: RiTimeLine },
  { key: "partial", label: "Thu một phần", icon: RiLoader2Line },
  { key: "paid",    label: "Đã thu đủ",   icon: RiCheckboxCircleLine },
];

const SORT_OPTIONS = [
  { key: "newest",     label: "Mới nhất" },
  { key: "oldest",     label: "Cũ nhất" },
  { key: "value_desc", label: "Giá trị cao nhất" },
  { key: "value_asc",  label: "Giá trị thấp nhất" },
];

export function FilterBar({
  activeFilter, onFilterChange, totalItems,
  dateFrom, onDateFromChange,
  dateTo, onDateToChange,
  customer, onCustomerChange,
  sort, onSortChange,
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-3">
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

      <div className="flex flex-wrap items-end gap-3">
        <Input
          type="date" label="Từ ngày" size="sm" className="w-40"
          value={dateFrom} onValueChange={onDateFromChange}
        />
        <Input
          type="date" label="Đến ngày" size="sm" className="w-40"
          value={dateTo} onValueChange={onDateToChange}
        />
        <Input
          label="Khách hàng" placeholder="Lọc theo khách hàng" size="sm" className="w-56"
          value={customer} onValueChange={onCustomerChange}
        />
        <Select
          aria-label="Sắp xếp"
          placeholder="Sắp xếp"
          size="sm"
          className="w-48"
          selectedKeys={new Set([sort])}
          onChange={(e) => onSortChange(e.target.value)}
        >
          {SORT_OPTIONS.map(({ key, label }) => (
            <SelectItem key={key} textValue={label}>{label}</SelectItem>
          ))}
        </Select>
      </div>
    </div>
  );
}
