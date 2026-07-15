import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartTooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import { RiCheckboxCircleLine } from "react-icons/ri";

export const VND = (n) => {
  const num = Number(n || 0);
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)} tỷ`;
  if (num >= 1_000_000)     return `${(num / 1_000_000).toFixed(1)} tr`;
  if (num >= 1_000)         return `${(num / 1_000).toFixed(0)}k`;
  return num.toLocaleString("vi-VN") + "đ";
};
export const VND_FULL = (n) => Number(n || 0).toLocaleString("vi-VN") + "đ";

export const VEHICLE_BAR_COLORS = ["#3b82f6", "#6366f1", "#8b5cf6", "#0ea5e9", "#14b8a6", "#f59e0b"];

export function ChartTooltip({ active, payload, label }) {
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

export function RevenueChart({ data }) {
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

export function DebtAgingBars({ data }) {
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
      <div className="flex h-3 rounded-full overflow-hidden gap-px">
        {groups.map((g) => {
          const pct = total > 0 ? (Number(data[g.key] || 0) / total) * 100 : 0;
          return pct > 0 ? (
            <div key={g.key} className={`${g.color} transition-all`} style={{ width: `${pct}%` }} />
          ) : null;
        })}
        {total === 0 && <div className="bg-gray-100 w-full" />}
      </div>
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

// Doanh thu theo từng xe (cước thuần trong kỳ báo cáo)
export function VehicleRevenueChart({ data }) {
  if (!data?.length) return <p className="text-xs text-gray-400 text-center py-8">Chưa có dữ liệu.</p>;

  const chartData = data.map((d, i) => ({
    name: d.plate_number,
    group: d.vehicle_group_name,
    revenue: d.revenue,
    trips: d.trip_count,
    color: VEHICLE_BAR_COLORS[i % VEHICLE_BAR_COLORS.length],
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chartData.slice(0, 8)} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
        <XAxis type="number" tickFormatter={VND} tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#6b7280", fontWeight: 600 }} axisLine={false} tickLine={false} width={82} interval={0} />
        <RechartTooltip content={<ChartTooltip />} />
        <Bar dataKey="revenue" name="Doanh thu" radius={[0, 6, 6, 0]} barSize={16}>
          {chartData.slice(0, 8).map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// Tiền tài xế đang cầm (nợ driver còn lại)
export function DriverHoldingsList({ data }) {
  if (!data?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-2">
        <RiCheckboxCircleLine size={24} className="text-emerald-400" />
        <p className="text-xs text-gray-400">Không có tài xế nào đang giữ tiền.</p>
      </div>
    );
  }

  const total = data.reduce((s, d) => s + Number(d.holding || 0), 0);
  const max = Math.max(...data.map((d) => Number(d.holding || 0)), 1);

  return (
    <div className="flex flex-col gap-1">
      {data.map((d, i) => (
        <div key={i} className="py-2 border-b border-gray-50 last:border-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-gray-800 truncate">{d.driver_name}</span>
            <span className="text-xs font-bold text-amber-600 flex-shrink-0 ml-2">{VND(d.holding)}</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-400 to-amber-600 rounded-full"
              style={{ width: `${(Number(d.holding) / max) * 100}%` }}
            />
          </div>
          <span className="text-[10px] text-gray-400">{d.debt_count} khoản nợ</span>
        </div>
      ))}
      <div className="flex items-center justify-between px-1 pt-2 border-t border-gray-100">
        <span className="text-xs text-gray-400 font-medium">Tổng tiền tài xế đang cầm</span>
        <span className="text-sm font-bold text-amber-600">{VND_FULL(total)}</span>
      </div>
    </div>
  );
}

export function TopCustomersTable({ data }) {
  if (!data?.length) return <p className="text-xs text-gray-400 text-center py-8">Chưa có dữ liệu.</p>;

  const maxRevenue = Math.max(...data.map((d) => Number(d.total_revenue || 0)), 1);

  return (
    <div className="flex flex-col divide-y divide-gray-50">
      {data.map((c, i) => (
        <div key={i} className="flex items-center gap-3 py-3">
          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0
            ${i === 0 ? "bg-yellow-100 text-yellow-600"
            : i === 1 ? "bg-gray-100 text-gray-500"
            : i === 2 ? "bg-orange-100 text-orange-500"
            : "bg-gray-50 text-gray-400"}`}>
            {i + 1}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-gray-800 truncate">{c.name}</span>
              <span className="text-xs font-bold text-blue-600 flex-shrink-0 ml-2">{VND(c.total_revenue)}</span>
            </div>
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

export function PayrollQuickStats({ data }) {
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
