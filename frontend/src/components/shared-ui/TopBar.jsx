import { useState } from "react";
import { Input, Button, Popover, PopoverTrigger, PopoverContent, Spinner } from "@heroui/react";
import {
  RiSearchLine, RiAddLine,
  RiNotification3Line, RiCheckDoubleLine,
  RiTimeLine, RiInboxLine,
} from "react-icons/ri";
import { useNotifications } from "../../hooks/useNotifications";

function formatTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const diffMin = Math.floor((Date.now() - date) / 60000);
  if (diffMin < 1)  return "Vừa xong";
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} giờ trước`;
  return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

function NotificationPanel({ notifications, loading, unreadCount, onMarkAllRead }) {
  return (
    <div className="w-80 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-gray-900">Thông báo</span>
          {unreadCount > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={onMarkAllRead}
            className="flex items-center gap-1 text-[11px] text-blue-500 hover:text-blue-700 font-medium transition-colors"
          >
            <RiCheckDoubleLine size={13} />
            Đọc tất cả
          </button>
        )}
      </div>

      <div className="max-h-[360px] overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner size="sm" color="primary" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
              <RiInboxLine size={18} className="text-gray-400" />
            </div>
            <p className="text-xs text-gray-400">Không có thông báo nào.</p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-gray-50">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`px-4 py-3 transition-colors ${
                  !n.is_read ? "bg-blue-50/50" : "hover:bg-gray-50"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className={`mt-[5px] w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      !n.is_read ? "bg-blue-500" : "bg-transparent"
                    }`}
                  />
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <p className="text-xs font-semibold text-gray-800 leading-snug line-clamp-2">
                      {n.title}
                    </p>
                    {n.message && (
                      <p className="text-[11px] text-gray-500 leading-snug line-clamp-2">
                        {n.message}
                      </p>
                    )}
                    <div className="flex items-center gap-1 mt-0.5">
                      <RiTimeLine size={10} className="text-gray-300" />
                      <span className="text-[10px] text-gray-400">{formatTime(n.created_at)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function TopBar({
  title,
  subtitle,
  search,
  onSearchChange,
  searchPlaceholder = "Tìm kiếm...",
  primaryAction,
  secondaryAction,
}) {
  const [open, setOpen] = useState(false);
  const { notifications, unreadCount, loading, markAllRead } = useNotifications();

  const handleOpenChange = async (isOpen) => {
    setOpen(isOpen);
    if (isOpen && unreadCount > 0) {
      await markAllRead();
    }
  };

  return (
    <header className="flex items-center justify-between px-6 h-16 bg-white border-b border-gray-100 flex-shrink-0 gap-4">
      <div className="flex flex-col min-w-0">
        <h1 className="text-base font-bold text-gray-900 leading-tight truncate">{title}</h1>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5 truncate">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {search !== undefined && onSearchChange && (
          <Input
            value={search}
            onValueChange={onSearchChange}
            placeholder={searchPlaceholder}
            startContent={<RiSearchLine size={15} className="text-gray-400" />}
            size="sm"
            variant="bordered"
            classNames={{
              base: "w-60",
              inputWrapper: "bg-gray-50 border-gray-200 hover:border-blue-300 h-9 rounded-lg",
              input: "text-sm",
            }}
            isClearable
            onClear={() => onSearchChange("")}
          />
        )}

        {secondaryAction && (
          <Button
            variant="flat"
            color="primary"
            size="sm"
            onPress={secondaryAction.onPress}
            className="h-9 font-medium px-4"
          >
            {secondaryAction.label}
          </Button>
        )}

        {primaryAction && (
          <Button
            color="primary"
            size="sm"
            startContent={<RiAddLine size={16} />}
            onPress={primaryAction.onPress}
            className="h-9 font-medium px-4"
          >
            {primaryAction.label}
          </Button>
        )}

        <Popover
          isOpen={open}
          onOpenChange={handleOpenChange}
          placement="bottom-end"
          offset={8}
          classNames={{
            content: "p-0 rounded-2xl shadow-xl border border-gray-100 overflow-hidden",
          }}
        >
          <PopoverTrigger>
            <Button
              isIconOnly
              variant="flat"
              size="sm"
              className="relative h-9 w-9 text-gray-500 hover:text-gray-800 bg-gray-50 hover:bg-gray-100 transition-colors overflow-visible"
              aria-label="Thông báo"
            >
              <RiNotification3Line size={18} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none pointer-events-none">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent>
            <NotificationPanel
              notifications={notifications}
              loading={loading}
              unreadCount={unreadCount}
              onMarkAllRead={markAllRead}
            />
          </PopoverContent>
        </Popover>
      </div>
    </header>
  );
}

export default TopBar;
