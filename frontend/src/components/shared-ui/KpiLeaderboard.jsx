import { useEffect, useMemo, useState } from "react";
import { Select, SelectItem, Spinner, Tabs, Tab, Button, Chip } from "@heroui/react";
import {
  RiTrophyLine, RiPencilLine, RiCarLine, RiRouteLine, RiMoneyDollarCircleLine,
  RiAlertLine, RiShieldCheckLine, RiMedalLine, RiUserStarLine, RiHistoryLine,
} from "react-icons/ri";
import { Section } from "./Section";
import { PaginationBar } from "./PaginationBar";
import { DriverVehicleGroupModal } from "./DriverVehicleGroupModal";
import { moneyShort } from "../../utils/formatNumber";

const now = new Date();
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const YEARS = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i);
const PAGE_SIZE = 10;

const SORT_LABELS = {
  revenue: "Doanh thu",
  trips: "Số chuyến",
  incidents: "Sự cố ít nhất",
};

const RANK_STYLE = {
  1: "bg-linear-to-br from-amber-300 to-yellow-500 text-white shadow-amber-500/30",
  2: "bg-linear-to-br from-slate-200 to-slate-500 text-white shadow-slate-500/20",
  3: "bg-linear-to-br from-orange-300 to-orange-500 text-white shadow-orange-500/25",
};
const rankBadge = (rank) => RANK_STYLE[rank] || "bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-gray-400";

const sortKpiRows = (rows, sortBy) => {
  const sorted = [...rows];
  if (sortBy === "trips") sorted.sort((a, b) => (b.completed_shipments ?? 0) - (a.completed_shipments ?? 0));
  else if (sortBy === "incidents") sorted.sort((a, b) => (a.incident_count ?? 0) - (b.incident_count ?? 0));
  else sorted.sort((a, b) => Number(b.total_revenue ?? 0) - Number(a.total_revenue ?? 0));
  return sorted;
};

const sortLeaderboard = (rows, sortBy) => {
  const sorted = [...rows];
  if (sortBy === "trips") sorted.sort((a, b) => (b.completed_shipments ?? 0) - (a.completed_shipments ?? 0));
  else if (sortBy === "incidents") sorted.sort((a, b) => (a.incident_count ?? 0) - (b.incident_count ?? 0));
  else sorted.sort((a, b) => (a.revenue_rank ?? 0) - (b.revenue_rank ?? 0));
  return sorted;
};

function getInitials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "TX";
  return parts.slice(-2).map((p) => p[0]).join("").toUpperCase();
}

function getDriverState(row, avgRevenue = 0) {
  const incidents = Number(row.incident_count || 0);
  const critical = Number(row.critical_incident_count || 0);
  const revenue = Number(row.total_revenue || 0);
  if (critical > 0) return { label: "Cần xử lý", color: "danger" };
  if (incidents > 0) return { label: "Cần chú ý", color: "warning" };
  if (avgRevenue > 0 && revenue >= avgRevenue) return { label: "Vượt trung bình", color: "success" };
  return { label: "Ổn định", color: "primary" };
}

function metricRank(row, fallbackRank, sortBy) {
  if (sortBy === "trips") return row.trips_rank ?? fallbackRank;
  if (sortBy === "incidents") return row.incident_rank ?? fallbackRank;
  return row.revenue_rank ?? fallbackRank;
}

function DriverAvatar({ name, rank }) {
  return (
    <div className="relative shrink-0">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 text-sm font-extrabold text-gray-600 dark:bg-white/10 dark:text-gray-200">
        {getInitials(name)}
      </div>
      {rank <= 3 && (
        <span className={`absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black shadow-sm ${rankBadge(rank)}`}>
          {rank}
        </span>
      )}
    </div>
  );
}

function StatChip({ label, value, icon: Icon, tone = "gray" }) {
  const toneCls = {
    gray: "text-gray-800 dark:text-gray-100 bg-gray-50 dark:bg-white/5 border-gray-100 dark:border-white/10",
    blue: "text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/10 border-blue-100 dark:border-blue-500/20",
    green: "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/20",
    rose: "text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 border-rose-100 dark:border-rose-500/20",
    amber: "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 border-amber-100 dark:border-amber-500/20",
  }[tone];
  return (
    <div className={`flex min-w-36 flex-1 items-center gap-3 rounded-xl border px-4 py-3 ${toneCls}`}>
      {Icon && <Icon size={20} className="shrink-0 opacity-80" />}
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</div>
        <div className="mt-0.5 truncate text-lg font-extrabold">{value}</div>
      </div>
    </div>
  );
}

function RevenueBar({ value, max, tone = "blue", showPercent = true }) {
  const pct = Math.max(2, Math.min(100, (Number(value || 0) / (max || 1)) * 100));
  const color = tone === "green"
    ? "from-emerald-400 to-teal-500"
    : tone === "amber"
      ? "from-amber-400 to-orange-500"
      : "from-blue-400 to-indigo-500";
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-[10px] text-gray-400 dark:text-gray-400">
        <span>Tỷ lệ doanh thu</span>
        {showPercent && <span>{Math.round(pct)}%</span>}
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
        <div className={`h-full rounded-full bg-linear-to-r ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function MetricPill({ label, value, tone = "gray" }) {
  const toneCls = {
    gray: "bg-gray-50 text-gray-700 dark:bg-white/5 dark:text-gray-200",
    blue: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300",
    green: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
    rose: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  }[tone];
  return (
    <div className={`rounded-lg px-3 py-2 text-right ${toneCls}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-0.5 text-sm font-extrabold">{value}</div>
    </div>
  );
}

function PodiumCard({ row, rank, maxRevenue }) {
  const sizeCls = rank === 1 ? "md:col-span-2 border-amber-200 dark:border-amber-400/30" : "border-gray-100 dark:border-white/10";
  const iconCls = rank === 1 ? "text-amber-500" : rank === 2 ? "text-slate-400" : "text-orange-400";
  return (
    <div className={`rounded-xl border bg-white p-4 shadow-sm dark:bg-[#161922] ${sizeCls}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <DriverAvatar name={row.driver_name} rank={rank} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <RiMedalLine size={16} className={iconCls} />
              <span className="text-[11px] font-bold uppercase text-gray-400 dark:text-gray-400">Hạng {rank}</span>
            </div>
            <div className="truncate text-sm font-extrabold text-gray-900 dark:text-gray-100">{row.driver_name}</div>
            <div className="truncate text-xs text-gray-400 dark:text-gray-400">{row.vehicle_group_name || "Chưa gán nhóm xe"}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-black text-blue-700 dark:text-blue-300">{moneyShort(row.total_revenue)}</div>
          <div className="text-[11px] text-gray-400 dark:text-gray-400">{row.completed_shipments || 0} chuyến</div>
        </div>
      </div>
      <RevenueBar value={row.total_revenue} max={maxRevenue} tone={rank === 1 ? "amber" : "blue"} />
    </div>
  );
}

function DriverKpiRow({ row, rank, maxRevenue, avgRevenue, onEdit, editIcon: EditIcon = RiPencilLine }) {
  const state = getDriverState(row, avgRevenue);
  const incidents = Number(row.incident_count || 0);
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-white/10 dark:bg-[#161922]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <DriverAvatar name={row.driver_name} rank={rank} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-extrabold text-gray-900 dark:text-gray-100">{row.driver_name}</span>
              <Chip size="sm" color={state.color} variant="flat" className="h-5 text-[10px] font-bold">
                {state.label}
              </Chip>
            </div>
            <div className="mt-0.5 flex items-center gap-1">
              <span className="truncate text-xs text-gray-400 dark:text-gray-400">{row.vehicle_group_name || "Chưa gán nhóm xe"}</span>
              {onEdit && (
                <Button isIconOnly size="sm" variant="light" className="h-5 min-w-5 text-gray-400" onPress={onEdit}>
                  <EditIcon size={12} />
                </Button>
              )}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 lg:w-[460px]">
          <MetricPill label="Chuyến" value={row.completed_shipments || 0} tone="gray" />
          <MetricPill label="Doanh thu" value={moneyShort(row.total_revenue)} tone="blue" />
          <MetricPill label="Sự cố" value={incidents} tone={incidents > 0 ? "rose" : "green"} />
        </div>
      </div>
      <RevenueBar value={row.total_revenue} max={maxRevenue} />
      {Number(row.critical_incident_count || 0) > 0 && (
        <div className="mt-2 text-[11px] font-semibold text-red-600 dark:text-red-300">
          Có {row.critical_incident_count} sự cố nặng trong kỳ.
        </div>
      )}
    </div>
  );
}

function LeaderboardRow({ row, rank, maxRevenue, sortBy }) {
  const displayRank = metricRank(row, rank, sortBy);
  const incidents = Number(row.incident_count || 0);
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${row.is_me ? "border-blue-200 bg-blue-50/70 dark:border-blue-400/30 dark:bg-blue-500/10" : "border-gray-100 bg-white dark:border-white/10 dark:bg-[#161922]"}`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black shadow-sm ${rankBadge(displayRank)}`}>
            {displayRank}
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-extrabold text-gray-900 dark:text-gray-100">
              {row.driver_name}
              {row.is_me && <span className="ml-1.5 text-[10px] font-bold text-blue-500">(Bạn)</span>}
            </div>
            <div className="text-xs text-gray-400 dark:text-gray-400">
              {SORT_LABELS[sortBy]} · {incidents > 0 ? `${incidents} sự cố` : "Không có sự cố"}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 md:w-72">
          <MetricPill label="Chuyến" value={row.completed_shipments || 0} tone="gray" />
          <MetricPill label="Doanh thu" value={moneyShort(row.total_revenue)} tone="blue" />
        </div>
      </div>
      <RevenueBar value={row.total_revenue} max={maxRevenue} />
    </div>
  );
}

export function KpiLeaderboard({ getVehicleGroups, getAllDriversKPI, getLeaderboardByGroup, onUpdateDriverGroup, getDriverGroupHistory }) {
  const [tab, setTab] = useState("kpi");
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [vehicleGroups, setVehicleGroups] = useState([]);
  const [vehicleGroupId, setVehicleGroupId] = useState(null);
  const [editingDriver, setEditingDriver] = useState(null);
  // Manager truyền onUpdateDriverGroup (sửa được); vai trò khác chỉ có lịch sử để tra cứu
  const canOpenGroupModal = Boolean(onUpdateDriverGroup || getDriverGroupHistory);

  const [kpiRows, setKpiRows] = useState([]);
  const [kpiLoading, setKpiLoading] = useState(false);
  const [kpiSortBy, setKpiSortBy] = useState("revenue");
  const [leaderboard, setLeaderboard] = useState([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [kpiPage, setKpiPage] = useState(1);
  const [leaderboardPage, setLeaderboardPage] = useState(1);
  const [leaderboardSortBy, setLeaderboardSortBy] = useState("revenue");
  const [reloadToken, setReloadToken] = useState(0);

  const sortedKpiRows = useMemo(() => sortKpiRows(kpiRows, kpiSortBy), [kpiRows, kpiSortBy]);
  const sortedLeaderboard = useMemo(() => sortLeaderboard(leaderboard, leaderboardSortBy), [leaderboard, leaderboardSortBy]);

  const kpiSummary = useMemo(() => {
    const drivers = kpiRows.length;
    const trips = kpiRows.reduce((s, r) => s + Number(r.completed_shipments || 0), 0);
    const revenue = kpiRows.reduce((s, r) => s + Number(r.total_revenue || 0), 0);
    const incidents = kpiRows.reduce((s, r) => s + Number(r.incident_count || 0), 0);
    const cleanDrivers = kpiRows.filter((r) => Number(r.incident_count || 0) === 0).length;
    return {
      drivers,
      trips,
      revenue,
      incidents,
      cleanDrivers,
      avgRevenue: drivers ? revenue / drivers : 0,
      cleanRate: drivers ? Math.round((cleanDrivers / drivers) * 100) : 0,
    };
  }, [kpiRows]);

  const kpiMaxRevenue = useMemo(
    () => Math.max(1, ...kpiRows.map((r) => Number(r.total_revenue || 0))),
    [kpiRows],
  );
  const lbMaxRevenue = useMemo(
    () => Math.max(1, ...leaderboard.map((r) => Number(r.total_revenue || 0))),
    [leaderboard],
  );
  const podiumRows = useMemo(() => sortedKpiRows.slice(0, 3), [sortedKpiRows]);
  const mostIncidentDriver = useMemo(() => {
    return [...kpiRows].sort((a, b) => Number(b.incident_count || 0) - Number(a.incident_count || 0))[0] || null;
  }, [kpiRows]);

  useEffect(() => {
    getVehicleGroups()
      .then((data) => {
        const groups = data.vehicleGroups || [];
        setVehicleGroups(groups);
        if (groups.length) setVehicleGroupId(String(groups[0].id));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tab === "kpi") {
      setKpiLoading(true);
      getAllDriversKPI({ month: String(month), year: String(year), ...(vehicleGroupId ? { vehicleGroupId } : {}) })
        .then((data) => setKpiRows(data.kpi || []))
        .catch(() => {})
        .finally(() => setKpiLoading(false));
    } else if (vehicleGroupId) {
      setLeaderboardLoading(true);
      getLeaderboardByGroup(vehicleGroupId, { month: String(month), year: String(year) })
        .then((data) => setLeaderboard(data.leaderboard || []))
        .catch(() => {})
        .finally(() => setLeaderboardLoading(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, month, year, vehicleGroupId, reloadToken]);

  useEffect(() => { setKpiPage(1); }, [kpiRows, kpiSortBy]);
  useEffect(() => { setLeaderboardPage(1); }, [leaderboard, leaderboardSortBy]);

  const kpiTotalPages = Math.max(1, Math.ceil(sortedKpiRows.length / PAGE_SIZE));
  const pagedKpiRows = useMemo(() => {
    const start = (kpiPage - 1) * PAGE_SIZE;
    return sortedKpiRows.slice(start, start + PAGE_SIZE);
  }, [sortedKpiRows, kpiPage]);

  const leaderboardTotalPages = Math.max(1, Math.ceil(sortedLeaderboard.length / PAGE_SIZE));
  const pagedLeaderboard = useMemo(() => {
    const start = (leaderboardPage - 1) * PAGE_SIZE;
    return sortedLeaderboard.slice(start, start + PAGE_SIZE);
  }, [sortedLeaderboard, leaderboardPage]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <Select selectedKeys={[String(month)]} onSelectionChange={(keys) => setMonth(Number([...keys][0]))} variant="bordered" size="sm" className="w-32">
          {MONTHS.map((m) => <SelectItem key={String(m)}>{`Tháng ${m}`}</SelectItem>)}
        </Select>
        <Select selectedKeys={[String(year)]} onSelectionChange={(keys) => setYear(Number([...keys][0]))} variant="bordered" size="sm" className="w-28">
          {YEARS.map((y) => <SelectItem key={String(y)}>{String(y)}</SelectItem>)}
        </Select>
        <Select selectedKeys={vehicleGroupId ? [vehicleGroupId] : []} onSelectionChange={(keys) => setVehicleGroupId([...keys][0] ?? null)} placeholder="Tất cả nhóm xe" variant="bordered" size="sm" className="w-56">
          {vehicleGroups.map((g) => <SelectItem key={String(g.id)}>{g.name}</SelectItem>)}
        </Select>
      </div>

      <Section title="KPI & Xếp hạng tài xế" icon={RiTrophyLine}>
        <Tabs selectedKey={tab} onSelectionChange={setTab} color="primary" size="sm">
          <Tab key="kpi" title="KPI tài xế">
            {kpiLoading ? (
              <div className="flex justify-center py-10"><Spinner color="primary" /></div>
            ) : kpiRows.length === 0 ? (
              <p className="py-8 text-center text-xs text-gray-400 dark:text-gray-400">Chưa có dữ liệu KPI trong kỳ này.</p>
            ) : (
              <>
                <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <StatChip label="Tài xế" value={kpiSummary.drivers} icon={RiUserStarLine} />
                  <StatChip label="Tổng chuyến" value={kpiSummary.trips} icon={RiRouteLine} tone="gray" />
                  <StatChip label="Tổng doanh thu" value={moneyShort(kpiSummary.revenue)} icon={RiMoneyDollarCircleLine} tone="blue" />
                  <StatChip label="Không sự cố" value={`${kpiSummary.cleanRate}%`} icon={RiShieldCheckLine} tone="green" />
                </div>

                <div className="mt-3 grid gap-3 lg:grid-cols-3">
                  <StatChip label="Doanh thu TB/tài xế" value={moneyShort(kpiSummary.avgRevenue)} icon={RiCarLine} tone="amber" />
                  <StatChip label="Tổng sự cố" value={kpiSummary.incidents} icon={RiAlertLine} tone={kpiSummary.incidents > 0 ? "rose" : "green"} />
                  <StatChip
                    label="Cần chú ý nhất"
                    value={mostIncidentDriver?.incident_count > 0 ? mostIncidentDriver.driver_name : "Không có"}
                    icon={RiAlertLine}
                    tone={mostIncidentDriver?.incident_count > 0 ? "rose" : "green"}
                  />
                </div>

                {podiumRows.length > 0 && (
                  <div className="mt-4 grid gap-3 md:grid-cols-4">
                    {podiumRows.map((row, index) => (
                      <PodiumCard key={row.driver_id} row={row} rank={index + 1} maxRevenue={kpiMaxRevenue} />
                    ))}
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs font-semibold text-gray-400 dark:text-gray-400">
                    Sắp theo: <span className="text-gray-700 dark:text-gray-200">{SORT_LABELS[kpiSortBy]}</span>
                  </div>
                  <Select placeholder="Sắp xếp" selectedKeys={new Set([kpiSortBy])} onSelectionChange={(keys) => setKpiSortBy([...keys][0] ?? "revenue")} variant="bordered" size="sm" className="w-48">
                    {Object.entries(SORT_LABELS).map(([key, label]) => (
                      <SelectItem key={key} textValue={label}>{label}</SelectItem>
                    ))}
                  </Select>
                </div>

                <div className="mt-3 flex flex-col gap-3">
                  {pagedKpiRows.map((row, index) => {
                    const rank = (kpiPage - 1) * PAGE_SIZE + index + 1;
                    return (
                      <DriverKpiRow
                        key={row.driver_id}
                        row={row}
                        rank={rank}
                        maxRevenue={kpiMaxRevenue}
                        avgRevenue={kpiSummary.avgRevenue}
                        onEdit={canOpenGroupModal ? () => setEditingDriver(row) : null}
                        editIcon={onUpdateDriverGroup ? RiPencilLine : RiHistoryLine}
                      />
                    );
                  })}
                </div>

                <div className="mt-3">
                  <PaginationBar page={kpiPage} pageSize={PAGE_SIZE} totalItems={kpiRows.length} totalPages={kpiTotalPages} onPageChange={setKpiPage} />
                </div>
              </>
            )}
          </Tab>

          <Tab key="leaderboard" title="Bảng xếp hạng">
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs font-semibold text-gray-400 dark:text-gray-400">
                Hạng đang tính theo: <span className="text-gray-700 dark:text-gray-200">{SORT_LABELS[leaderboardSortBy]}</span>
              </div>
              <Select placeholder="Sắp xếp" selectedKeys={new Set([leaderboardSortBy])} onSelectionChange={(keys) => setLeaderboardSortBy([...keys][0] ?? "revenue")} variant="bordered" size="sm" className="w-48">
                {Object.entries(SORT_LABELS).map(([key, label]) => (
                  <SelectItem key={key} textValue={label}>{label}</SelectItem>
                ))}
              </Select>
            </div>

            {leaderboardLoading ? (
              <div className="flex justify-center py-10"><Spinner color="primary" /></div>
            ) : leaderboard.length === 0 ? (
              <p className="py-8 text-center text-xs text-gray-400 dark:text-gray-400">Chưa có dữ liệu xếp hạng. Chọn 1 nhóm xe để xem.</p>
            ) : (
              <>
                <div className="mt-3 flex flex-col gap-3">
                  {pagedLeaderboard.map((row, index) => {
                    const rank = (leaderboardPage - 1) * PAGE_SIZE + index + 1;
                    return <LeaderboardRow key={row.driver_id} row={row} rank={rank} maxRevenue={lbMaxRevenue} sortBy={leaderboardSortBy} />;
                  })}
                </div>
                <div className="mt-3">
                  <PaginationBar page={leaderboardPage} pageSize={PAGE_SIZE} totalItems={leaderboard.length} totalPages={leaderboardTotalPages} onPageChange={setLeaderboardPage} />
                </div>
              </>
            )}
          </Tab>
        </Tabs>
      </Section>

      {canOpenGroupModal && (
        <DriverVehicleGroupModal
          open={!!editingDriver}
          driver={editingDriver}
          vehicleGroups={vehicleGroups}
          getHistory={getDriverGroupHistory}
          // Không truyền onUpdateDriverGroup = vai trò chỉ được xem (chỉ Manager đổi được)
          readOnly={!onUpdateDriverGroup}
          onSave={onUpdateDriverGroup ? async (driverId, nextVehicleGroupId, reason) => {
            const res = await onUpdateDriverGroup(driverId, nextVehicleGroupId, reason);
            setReloadToken((t) => t + 1);
            return res;   // modal cần thông điệp của backend để báo đúng việc đã xảy ra
          } : undefined}
          onClose={() => setEditingDriver(null)}
        />
      )}
    </div>
  );
}

export default KpiLeaderboard;
