import { useState, useEffect, useCallback } from "react";
import { Spinner, Select, SelectItem } from "@heroui/react";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartTooltip,
  ResponsiveContainer, Cell, Legend,
} from "recharts";
import {
  RiLineChartLine, RiMoneyDollarCircleLine,
  RiFileList3Line, RiAlertLine,
  RiGroupLine, RiCheckboxCircleLine,
  RiTimeLine, RiArrowUpLine, RiCoinLine,
  RiBankCard2Line, RiShieldUserLine,
} from "react-icons/ri";
import { accountantService } from "../services/accountant.service";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const VND = (n) => {
  const num = Number(n || 0);
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)} tỷ`;
  if (num >= 1_000_000)     return `${(num / 1_000_000).toFixed(1)} tr`;
  if (num >= 1_000)         return `${(num / 1_000).toFixed(0)}k`;
  return num.toLocaleString("vi-VN") + "đ";
};
const VND_FULL = (n) => Number(n || 0).toLocaleString("vi-VN") + "đ";

const MONTH_OPTIONS = [
  { key: "3",  label: "3 tháng gần nhất" },
  { key: "6",  label: "6 tháng gần nhất" },
  { key: "12", label: "12 tháng gần nhất" },
];

const PAYMENT_TYPE_LABEL = {
  cash:          { label: "Tiền mặt",     color: "#f59e0b" },
  bank_transfer: { label: "Chuyển khoản", color: "#3b82f6" },
  client_credit: { label: "Ghi nợ",       color: "#ef4444" },
  qr_transfer:   { label: "QR",           color: "#8b5cf6" },
};

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, sub, gradient, lightBg, text, border }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-white border ${border} p-5 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow`}>
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-xl ${lightBg} flex items-center justify-center`}>
          <Icon size={20} className={text} />
        </div>
        <div className={`w-14 h-14 rounded-full bg-gradient-to-br ${gradient} opacity-10 absolute top-2 right-2`} />
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{label}</span>
        <span className={`text-2xl font-bold ${text} leading-tight`}>{value}</span>
        {sub && <span className="text-[11px] text-gray-400 mt-0.5">{sub}</span>}
      </div>
    </div>
  );
}

// ─── Section wrapper ─────────────────────────────────────────────────────────
function Section({ title, icon: Icon, children, action }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
            <Icon size={14} className="text-blue-600" />
          </div>
          <span className="text-sm font-bold text-gray-800">{title}</span>
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ─── Custom recharts tooltip ──────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-3 py-2.5 text-xs min-w-[130px]">
      <p className="font-bold text-gray-700 mb-1.5">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-3">
          <span className="text-gray-500">{p.name ?? p.dataKey}</span>
          <span className="font-semibold" style={{ color: p.color }}>
            {p.dataKey === "order_count" ? `${p.value} đơn` : VND_FULL(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Revenue area chart ───────────────────────────────────────────────────────
function RevenueChart({ data }) {
  if (!data?.length) return <p className="text-xs text-gray-400 text-center py-8">Chưa có dữ liệu.</p>;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.18} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.01} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={VND} tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={60} />
        <RechartTooltip content={<ChartTooltip />} />
        <Area
          type="monotone"
          dataKey="revenue"
          name="Doanh thu"
          stroke="#3b82f6"
          strokeWidth={2.5}
          fill="url(#revenueGrad)"
          dot={{ r: 3, fill: "#3b82f6", strokeWidth: 0 }}
          activeDot={{ r: 5 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Debt aging bars ──────────────────────────────────────────────────────────
function DebtAgingBars({ data }) {
  if (!data) return null;

  const groups = [
    { key: "d0_30",   label: "0–30 ngày",   color: "bg-green-400",  text: "text-green-600" },
    { key: "d30_60",  label: "31–60 ngày",  color: "bg-yellow-400", text: "text-yellow-600" },
    { key: "d60_90",  label: "61–90 ngày",  color: "bg-orange-400", text: "text-orange-600" },
    { key: "d90_plus",label: "> 90 ngày",   color: "bg-red-500",    text: "text-red-600" },
  ];

  const total = groups.reduce((s, g) => s + Number(data[g.key] || 0), 0);

  return (
    <div className="flex flex-col gap-3">
      {/* stacked bar */}
      <div className="flex h-3 rounded-full overflow-hidden gap-px">
        {groups.map((g) => {
          const pct = total > 0 ? (Number(data[g.key] || 0) / total) * 100 : 0;
          return pct > 0 ? (
            <div key={g.key} className={`${g.color} transition-all`} style={{ width: `${pct}%` }} />
          ) : null;
        })}
        {total === 0 && <div className="bg-gray-100 w-full" />}
      </div>
      {/* legend */}
      <div className="grid grid-cols-2 gap-2">
        {groups.map((g) => (
          <div key={g.key} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2">
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${g.color}`} />
              <span className="text-[11px] text-gray-500">{g.label}</span>
            </div>
            <span className={`text-xs font-bold ${g.text}`}>{VND(data[g.key])}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between px-1 pt-1 border-t border-gray-100">
        <span className="text-xs text-gray-400 font-medium">Tổng nợ khách chưa thu</span>
        <span className="text-sm font-bold text-red-600">{VND_FULL(total)}</span>
      </div>
    </div>
  );
}

// ─── Payment type bar chart ───────────────────────────────────────────────────
function PaymentTypeChart({ data }) {
  if (!data?.length) return <p className="text-xs text-gray-400 text-center py-8">Chưa có dữ liệu.</p>;

  const chartData = data.map((d) => ({
    name: PAYMENT_TYPE_LABEL[d.payment_type]?.label ?? d.payment_type,
    revenue: d.revenue,
    count: d.count,
    color: PAYMENT_TYPE_LABEL[d.payment_type]?.color ?? "#64748b",
  }));

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={VND} tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={55} />
        <RechartTooltip content={<ChartTooltip />} />
        <Bar dataKey="revenue" name="Doanh thu" radius={[6, 6, 0, 0]}>
          {chartData.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Top customers table ──────────────────────────────────────────────────────
function TopCustomersTable({ data }) {
  if (!data?.length) return <p className="text-xs text-gray-400 text-center py-8">Chưa có dữ liệu.</p>;

  const maxRevenue = Math.max(...data.map((d) => Number(d.total_revenue || 0)), 1);

  return (
    <div className="flex flex-col divide-y divide-gray-50">
      {data.map((c, i) => (
        <div key={i} className="flex items-center gap-3 py-3">
          {/* Rank */}
          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0
            ${i === 0 ? "bg-yellow-100 text-yellow-600"
            : i === 1 ? "bg-gray-100 text-gray-500"
            : i === 2 ? "bg-orange-100 text-orange-500"
            : "bg-gray-50 text-gray-400"}`}>
            {i + 1}
          </span>
          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-gray-800 truncate">{c.name}</span>
              <span className="text-xs font-bold text-blue-600 flex-shrink-0 ml-2">{VND(c.total_revenue)}</span>
            </div>
            {/* Progress bar */}
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full"
                style={{ width: `${(Number(c.total_revenue) / maxRevenue) * 100}%` }}
              />
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] text-gray-400">{c.total_orders} đơn</span>
              {Number(c.outstanding_debt) > 0 && (
                <span className="text-[10px] text-red-400 font-medium">
                  Nợ: {VND(c.outstanding_debt)}
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Payroll quick stats ──────────────────────────────────────────────────────
function PayrollQuickStats({ data }) {
  if (!data) return null;

  const statuses = [
    { key: "pending",  label: "Chờ duyệt",      color: "text-gray-500",   bg: "bg-gray-100" },
    { key: "reviewed", label: "Manager đã duyệt", color: "text-blue-600",   bg: "bg-blue-50" },
    { key: "approved", label: "KT xác nhận",     color: "text-green-600",  bg: "bg-green-50" },
    { key: "paid",     label: "Đã chi trả",      color: "text-emerald-600",bg: "bg-emerald-50" },
  ];

  const total = statuses.reduce((s, st) => s + Number(data[st.key] || 0), 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-gray-400">Tháng {data.month}/{data.year}</span>
        <span className="text-xs font-bold text-gray-700">{total} tài xế</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {statuses.map(({ key, label, color, bg }) => (
          <div key={key} className={`flex items-center gap-2 ${bg} rounded-xl px-3 py-2.5`}>
            <span className={`text-xl font-bold ${color}`}>{data[key] ?? 0}</span>
            <span className={`text-[11px] ${color} font-medium leading-tight`}>{label}</span>
          </div>
        ))}
      </div>
      {Number(data.total_net) > 0 && (
        <div className="flex items-center justify-between bg-blue-50 rounded-xl px-4 py-3 mt-1">
          <span className="text-xs text-blue-600 font-medium">Tổng lương net tháng này</span>
          <span className="text-sm font-bold text-blue-700">{VND_FULL(data.total_net)}</span>
        </div>
      )}
    </div>
  );
}

// ─── Main ReportView ─────────────────────────────────────────────────────────
export function ReportView() {
  const [months, setMonths]   = useState("6");
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const load = useCallback(async (m) => {
    setLoading(true);
    setError(null);
    try {
      const res = await accountantService.getReportOverview(Number(m));
      setData(res);
    } catch (err) {
      setError(err.message ?? "Không thể tải báo cáo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(months); }, [months, load]);

  // Derived stats from revenueChart
  const totalRevenue   = data?.revenueChart?.reduce((s, r) => s + Number(r.revenue || 0), 0) ?? 0;
  const totalOrders    = data?.revenueChart?.reduce((s, r) => s + Number(r.order_count || 0), 0) ?? 0;
  const totalDebt      = data?.debtAging
    ? ["d0_30","d30_60","d60_90","d90_plus"].reduce((s, k) => s + Number(data.debtAging[k] || 0), 0)
    : 0;
  const overdueDebt    = Number(data?.debtAging?.d90_plus || 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Spinner color="primary" label="Đang tải báo cáo..." size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center">
          <RiAlertLine size={22} className="text-red-400" />
        </div>
        <p className="text-sm text-gray-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">

      {/* Period picker */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">Dữ liệu tổng hợp từ đơn hoàn thành</p>
        <Select
          size="sm"
          selectedKeys={new Set([months])}
          onSelectionChange={(keys) => setMonths([...keys][0])}
          classNames={{
            base: "w-48",
            trigger: "h-8 bg-white border border-gray-200 rounded-lg text-xs",
          }}
          aria-label="Kỳ báo cáo"
        >
          {MONTH_OPTIONS.map(({ key, label }) => (
            <SelectItem key={key}>{label}</SelectItem>
          ))}
        </Select>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label={`Doanh thu ${months} tháng`}
          value={VND(totalRevenue)}
          icon={RiLineChartLine}
          sub={`${totalOrders} đơn hoàn thành`}
          gradient="from-blue-500 to-blue-600"
          lightBg="bg-blue-50" text="text-blue-600" border="border-blue-100"
        />
        <StatCard
          label="Nợ phải thu"
          value={VND(totalDebt)}
          icon={RiFileList3Line}
          sub={totalDebt > 0 ? "Từ khách hàng chưa thu đủ" : "Không có công nợ"}
          gradient="from-orange-500 to-orange-600"
          lightBg="bg-orange-50" text="text-orange-600" border="border-orange-100"
        />
        <StatCard
          label="Nợ quá hạn > 90 ngày"
          value={VND(overdueDebt)}
          icon={RiAlertLine}
          sub={overdueDebt > 0 ? "Cần xử lý khẩn" : "Không có"}
          gradient="from-red-500 to-rose-600"
          lightBg="bg-red-50" text="text-red-600" border="border-red-100"
        />
        <StatCard
          label="Lương tháng này"
          value={VND(data?.payrollSummary?.total_net ?? 0)}
          icon={RiMoneyDollarCircleLine}
          sub={`${(data?.payrollSummary?.paid ?? 0)} tài xế đã chi`}
          gradient="from-emerald-500 to-emerald-600"
          lightBg="bg-emerald-50" text="text-emerald-600" border="border-emerald-100"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-3 gap-4">
        {/* Revenue trend — 2/3 width */}
        <div className="col-span-2">
          <Section title="Xu hướng doanh thu" icon={RiLineChartLine}>
            <RevenueChart data={data?.revenueChart} />
          </Section>
        </div>

        {/* Payment type — 1/3 width */}
        <Section title="Theo hình thức thanh toán" icon={RiBankCard2Line}>
          <PaymentTypeChart data={data?.revenueByPaymentType} />
        </Section>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-3 gap-4">
        {/* Top customers — 2/3 width */}
        <div className="col-span-2">
          <Section title="Top khách hàng theo doanh thu" icon={RiGroupLine}>
            <TopCustomersTable data={data?.topCustomers} />
          </Section>
        </div>

        {/* Debt aging + Payroll */}
        <div className="flex flex-col gap-4">
          <Section title="Phân tích nợ theo thời gian" icon={RiTimeLine}>
            <DebtAgingBars data={data?.debtAging} />
          </Section>

          <Section title="Tổng quan bảng lương" icon={RiShieldUserLine}>
            <PayrollQuickStats data={data?.payrollSummary} />
          </Section>
        </div>
      </div>

    </div>
  );
}
