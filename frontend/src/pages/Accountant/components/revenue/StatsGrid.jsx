import { Skeleton } from "@heroui/react";
import { RiLineChartLine, RiAlertLine, RiTimeLine, RiHandCoinLine } from "react-icons/ri";
import { MoneyText } from "../shared/MoneyText";
import { money } from "../../../../utils/formatNumber";

const CARDS = [
  {
    // Doanh thu ghi nhận = tổng cước các đơn hoàn thành (không gồm chi hộ khách,
    // không phụ thuộc đã thu tiền hay chưa).
    key: "total_gross_revenue",
    label: "Tổng doanh thu",
    icon: RiLineChartLine,
    gradient: "from-blue-500 to-blue-600",
    lightBg: "bg-blue-50 dark:bg-blue-500/10",
    text: "text-blue-600 dark:text-blue-300",
    border: "border-blue-100 dark:border-blue-500/20",
    isMoney: true,
  },
  {
    key: "total_receivables",
    label: "Còn phải thu",
    icon: RiAlertLine,
    gradient: "from-rose-500 to-rose-600",
    lightBg: "bg-rose-50 dark:bg-rose-500/10",
    text: "text-rose-600 dark:text-rose-300",
    border: "border-rose-100 dark:border-rose-500/20",
    isMoney: true,
  },
  {
    key: "pending_payments_count",
    label: "Đơn chưa thu đủ",
    icon: RiTimeLine,
    gradient: "from-amber-500 to-amber-600",
    lightBg: "bg-amber-50 dark:bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-300",
    border: "border-amber-100 dark:border-amber-500/20",
    isMoney: false,
    suffix: " đơn",
  },
  {
    // Tiền tài xế đã ứng túi (chi hộ khách/chi phí công ty) đã duyệt nhưng
    // công ty CHƯA hoàn lại — chưa cấn trừ nợ (TH2), chưa hoàn qua lương (TH1)
    key: "total_reimbursable",
    label: "Cần hoàn trả tài xế",
    // Khoản đã lập phiếu chi nhưng chưa chi xong vẫn nằm trong tổng (tiền chưa ra khỏi
    // quỹ, công ty vẫn đang nợ tài) — nhưng màn "Hoàn ứng tài xế" cố ý ẩn nó đi để khỏi
    // lập phiếu trùng. Không chú thích thì hai màn hiện hai số khác nhau, người xem tưởng
    // hệ thống tính sai.
    hintKey: "total_reimbursable_in_progress",
    hint: (v) => `trong đó ${v} đang chờ duyệt phiếu chi`,
    icon: RiHandCoinLine,
    gradient: "from-teal-500 to-teal-600",
    lightBg: "bg-teal-50 dark:bg-teal-500/10",
    text: "text-teal-600 dark:text-teal-300",
    border: "border-teal-100 dark:border-teal-500/20",
    isMoney: true,
  },
];

export function StatsGrid({ stats, loading }) {
  return (
    <div className="grid grid-cols-4 gap-4">
      {CARDS.map(({ key, label, icon: Icon, gradient, lightBg, text, border, isMoney, suffix, hintKey, hint }) => (
        <div
          key={key}
          className={`relative overflow-hidden rounded-2xl bg-white dark:bg-[#161922] border ${border} p-5 flex flex-col gap-4 shadow-sm hover:shadow-md transition-shadow`}
        >
          {}
          <div className="flex items-start justify-between">
            <div className={`w-10 h-10 rounded-xl ${lightBg} flex items-center justify-center`}>
              <Icon size={20} className={text} />
            </div>
            {}
            <div className={`w-12 h-12 rounded-full bg-linear-to-br ${gradient} opacity-10`} />
          </div>

          {}
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-semibold text-gray-400 dark:text-gray-400 uppercase tracking-wider">{label}</span>
            {loading ? (
              <Skeleton className="h-7 w-28 rounded-lg mt-1" />
            ) : (
              <span className={`text-2xl font-bold ${text} leading-tight`}>
                {isMoney
                  ? <MoneyText amount={stats?.[key]} />
                  : `${stats?.[key] ?? 0}${suffix ?? ""}`}
              </span>
            )}
            {!loading && hintKey && Number(stats?.[hintKey]) > 0 && (
              <span className="text-[11px] text-gray-400 dark:text-gray-400 mt-0.5 leading-snug">
                {hint(money(stats[hintKey]))}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
