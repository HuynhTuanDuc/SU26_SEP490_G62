import { Skeleton } from "@heroui/react";
import { RiLineChartLine, RiCheckboxCircleLine, RiAlertLine, RiTimeLine } from "react-icons/ri";
import { MoneyText } from "../shared/MoneyText";

const CARDS = [
  {
    // Doanh thu ghi nhận = tổng cước các đơn hoàn thành (không gồm chi hộ khách,
    // không phụ thuộc đã thu tiền hay chưa). "Đã thu về" mới là tiền thực nắm.
    key: "total_gross_revenue",
    label: "Tổng doanh thu",
    icon: RiLineChartLine,
    gradient: "from-blue-500 to-blue-600",
    lightBg: "bg-blue-50",
    text: "text-blue-600",
    border: "border-blue-100",
    isMoney: true,
  },
  {
    key: "total_collected",
    label: "Đã thu về",
    icon: RiCheckboxCircleLine,
    gradient: "from-emerald-500 to-emerald-600",
    lightBg: "bg-emerald-50",
    text: "text-emerald-600",
    border: "border-emerald-100",
    isMoney: true,
  },
  {
    key: "total_receivables",
    label: "Còn phải thu",
    icon: RiAlertLine,
    gradient: "from-rose-500 to-rose-600",
    lightBg: "bg-rose-50",
    text: "text-rose-600",
    border: "border-rose-100",
    isMoney: true,
  },
  {
    key: "pending_payments_count",
    label: "Đơn chưa thu đủ",
    icon: RiTimeLine,
    gradient: "from-amber-500 to-amber-600",
    lightBg: "bg-amber-50",
    text: "text-amber-600",
    border: "border-amber-100",
    isMoney: false,
    suffix: " đơn",
  },
];

export function StatsGrid({ stats, loading }) {
  return (
    <div className="grid grid-cols-4 gap-4">
      {CARDS.map(({ key, label, icon: Icon, gradient, lightBg, text, border, isMoney, suffix }) => (
        <div
          key={key}
          className={`relative overflow-hidden rounded-2xl bg-white border ${border} p-5 flex flex-col gap-4 shadow-sm hover:shadow-md transition-shadow`}
        >
          {}
          <div className="flex items-start justify-between">
            <div className={`w-10 h-10 rounded-xl ${lightBg} flex items-center justify-center`}>
              <Icon size={20} className={text} />
            </div>
            {}
            <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${gradient} opacity-10`} />
          </div>

          {}
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{label}</span>
            {loading ? (
              <Skeleton className="h-7 w-28 rounded-lg mt-1" />
            ) : (
              <span className={`text-2xl font-bold ${text} leading-tight`}>
                {isMoney
                  ? <MoneyText amount={stats?.[key]} />
                  : `${stats?.[key] ?? 0}${suffix ?? ""}`}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
