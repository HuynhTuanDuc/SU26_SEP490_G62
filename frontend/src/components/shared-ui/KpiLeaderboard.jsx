import { useEffect, useMemo, useState } from "react";
import { Select, SelectItem, Spinner, Tabs, Tab, Button } from "@heroui/react";
import { RiTrophyLine, RiPencilLine } from "react-icons/ri";
import { Section } from "./Section";
import { PaginationBar } from "./PaginationBar";
import { DriverVehicleGroupModal } from "./DriverVehicleGroupModal";

const now = new Date();
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const YEARS = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i);
const PAGE_SIZE = 10;

const formatCurrency = (value) => Number(value || 0).toLocaleString("vi-VN") + " đ";

const SORT_LABELS = {
  revenue: "Doanh thu",
  trips: "Số chuyến",
  incidents: "Sự cố ít nhất",
};

const sortKpiRows = (rows, sortBy) => {
  const sorted = [...rows];
  if (sortBy === "trips") sorted.sort((a, b) => (b.completed_shipments ?? 0) - (a.completed_shipments ?? 0));
  else if (sortBy === "incidents") sorted.sort((a, b) => (a.incident_count ?? 0) - (b.incident_count ?? 0));
  else sorted.sort((a, b) => Number(b.total_revenue ?? 0) - Number(a.total_revenue ?? 0));
  return sorted;
};

const sortLeaderboard = (rows, sortBy) => {
  const sorted = [...rows];
  if (sortBy === "trips") sorted.sort((a, b) => (a.trips_rank ?? 0) - (b.trips_rank ?? 0));
  else if (sortBy === "incidents") sorted.sort((a, b) => (a.incident_count ?? 0) - (b.incident_count ?? 0));
  else sorted.sort((a, b) => (a.revenue_rank ?? 0) - (b.revenue_rank ?? 0));
  return sorted;
};

export function KpiLeaderboard({ getVehicleGroups, getAllDriversKPI, getLeaderboardByGroup, onUpdateDriverGroup }) {
  const [tab, setTab] = useState("kpi");
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [vehicleGroups, setVehicleGroups] = useState([]);
  const [vehicleGroupId, setVehicleGroupId] = useState(null);
  const [editingDriver, setEditingDriver] = useState(null);

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

  useEffect(() => { setKpiPage(1); }, [kpiRows]);
  useEffect(() => { setLeaderboardPage(1); }, [leaderboard]);

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
        <Select
          selectedKeys={[String(month)]}
          onSelectionChange={(keys) => setMonth(Number([...keys][0]))}
          variant="bordered"
          size="sm"
          className="w-32"
        >
          {MONTHS.map((m) => <SelectItem key={String(m)}>{`Tháng ${m}`}</SelectItem>)}
        </Select>
        <Select
          selectedKeys={[String(year)]}
          onSelectionChange={(keys) => setYear(Number([...keys][0]))}
          variant="bordered"
          size="sm"
          className="w-28"
        >
          {YEARS.map((y) => <SelectItem key={String(y)}>{String(y)}</SelectItem>)}
        </Select>
        <Select
          selectedKeys={vehicleGroupId ? [vehicleGroupId] : []}
          onSelectionChange={(keys) => setVehicleGroupId([...keys][0] ?? null)}
          placeholder="Tất cả nhóm xe"
          variant="bordered"
          size="sm"
          className="w-56"
        >
          {vehicleGroups.map((g) => <SelectItem key={String(g.id)}>{g.name}</SelectItem>)}
        </Select>
      </div>

      <Section title="KPI & Xếp hạng tài xế" icon={RiTrophyLine}>
        <Tabs selectedKey={tab} onSelectionChange={setTab} color="primary" size="sm">
          <Tab key="kpi" title="KPI tài xế">
            <div className="flex justify-end mt-3">
              <Select
                placeholder="Sắp xếp"
                selectedKeys={new Set([kpiSortBy])}
                onSelectionChange={(keys) => setKpiSortBy([...keys][0] ?? "revenue")}
                variant="bordered"
                size="sm"
                className="w-48"
              >
                {Object.entries(SORT_LABELS).map(([key, label]) => (
                  <SelectItem key={key} textValue={label}>{label}</SelectItem>
                ))}
              </Select>
            </div>
            {kpiLoading ? (
              <div className="flex justify-center py-10"><Spinner color="primary" /></div>
            ) : kpiRows.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-8">Chưa có dữ liệu KPI trong kỳ này.</p>
            ) : (
              <>
                <div className="flex flex-col divide-y divide-gray-50 mt-3">
                  {pagedKpiRows.map((row) => (
                    <div key={row.driver_id} className="flex items-center justify-between py-3 gap-4">
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-semibold text-gray-800">{row.driver_name}</span>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-400">{row.vehicle_group_name}</span>
                          {onUpdateDriverGroup && (
                            <Button
                              isIconOnly size="sm" variant="light" className="w-5 h-5 min-w-5"
                              onPress={() => setEditingDriver(row)}
                            >
                              <RiPencilLine size={12} className="text-gray-400" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-6 text-right flex-shrink-0">
                        <div>
                          <div className="text-[10px] text-gray-400 uppercase">Chuyến</div>
                          <div className="text-sm font-semibold text-gray-700">{row.completed_shipments}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-gray-400 uppercase">Doanh thu</div>
                          <div className="text-sm font-semibold text-blue-600">{formatCurrency(row.total_revenue)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-gray-400 uppercase">Sự cố</div>
                          <div className="text-sm font-semibold text-rose-500">{row.incident_count}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {kpiRows.length > 0 && (
                  <div className="mt-3">
                    <PaginationBar
                      page={kpiPage}
                      pageSize={PAGE_SIZE}
                      totalItems={kpiRows.length}
                      totalPages={kpiTotalPages}
                      onPageChange={setKpiPage}
                    />
                  </div>
                )}
              </>
            )}
          </Tab>
          <Tab key="leaderboard" title="Bảng xếp hạng">
            <div className="flex justify-end mt-3">
              <Select
                placeholder="Sắp xếp"
                selectedKeys={new Set([leaderboardSortBy])}
                onSelectionChange={(keys) => setLeaderboardSortBy([...keys][0] ?? "revenue")}
                variant="bordered"
                size="sm"
                className="w-48"
              >
                {Object.entries(SORT_LABELS).map(([key, label]) => (
                  <SelectItem key={key} textValue={label}>{label}</SelectItem>
                ))}
              </Select>
            </div>
            {leaderboardLoading ? (
              <div className="flex justify-center py-10"><Spinner color="primary" /></div>
            ) : leaderboard.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-8">Chưa có dữ liệu xếp hạng — chọn 1 nhóm xe.</p>
            ) : (
              <>
                <div className="flex flex-col divide-y divide-gray-50 mt-3">
                  {pagedLeaderboard.map((row) => (
                    <div key={row.driver_id} className={`flex items-center justify-between py-3 gap-4 ${row.is_me ? "bg-blue-50/40 -mx-5 px-5" : ""}`}>
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0
                          ${row.revenue_rank === 1 ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-500"}`}>
                          {row.revenue_rank}
                        </span>
                        <span className="text-sm font-semibold text-gray-800 truncate">{row.driver_name}</span>
                      </div>
                      <div className="flex items-center gap-6 text-right flex-shrink-0">
                        <div>
                          <div className="text-[10px] text-gray-400 uppercase">Chuyến</div>
                          <div className="text-sm font-semibold text-gray-700">{row.completed_shipments}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-gray-400 uppercase">Doanh thu</div>
                          <div className="text-sm font-semibold text-blue-600">{formatCurrency(row.total_revenue)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {leaderboard.length > 0 && (
                  <div className="mt-3">
                    <PaginationBar
                      page={leaderboardPage}
                      pageSize={PAGE_SIZE}
                      totalItems={leaderboard.length}
                      totalPages={leaderboardTotalPages}
                      onPageChange={setLeaderboardPage}
                    />
                  </div>
                )}
              </>
            )}
          </Tab>
        </Tabs>
      </Section>

      {onUpdateDriverGroup && (
        <DriverVehicleGroupModal
          open={!!editingDriver}
          driver={editingDriver}
          vehicleGroups={vehicleGroups}
          onSave={async (driverId, vehicleGroupId) => {
            await onUpdateDriverGroup(driverId, vehicleGroupId);
            setReloadToken((t) => t + 1);
          }}
          onClose={() => setEditingDriver(null)}
        />
      )}
    </div>
  );
}

export default KpiLeaderboard;
