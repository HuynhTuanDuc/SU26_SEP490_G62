import { useEffect, useState } from "react";
import { Select, SelectItem, Spinner, Tabs, Tab } from "@heroui/react";
import { RiTrophyLine } from "react-icons/ri";
import { Section } from "./Section";

const now = new Date();
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const YEARS = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i);

const formatCurrency = (value) => Number(value || 0).toLocaleString("vi-VN") + " đ";

export function KpiLeaderboard({ getVehicleGroups, getAllDriversKPI, getLeaderboardByGroup }) {
  const [tab, setTab] = useState("kpi");
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [vehicleGroups, setVehicleGroups] = useState([]);
  const [vehicleGroupId, setVehicleGroupId] = useState(null);

  const [kpiRows, setKpiRows] = useState([]);
  const [kpiLoading, setKpiLoading] = useState(false);
  const [leaderboard, setLeaderboard] = useState([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);

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
  }, [tab, month, year, vehicleGroupId]);

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
            {kpiLoading ? (
              <div className="flex justify-center py-10"><Spinner color="primary" /></div>
            ) : kpiRows.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-8">Chưa có dữ liệu KPI trong kỳ này.</p>
            ) : (
              <div className="flex flex-col divide-y divide-gray-50 mt-3">
                {kpiRows.map((row) => (
                  <div key={row.driver_id} className="flex items-center justify-between py-3 gap-4">
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-semibold text-gray-800">{row.driver_name}</span>
                      <span className="text-xs text-gray-400">{row.vehicle_group_name}</span>
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
            )}
          </Tab>
          <Tab key="leaderboard" title="Bảng xếp hạng">
            {leaderboardLoading ? (
              <div className="flex justify-center py-10"><Spinner color="primary" /></div>
            ) : leaderboard.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-8">Chưa có dữ liệu xếp hạng — chọn 1 nhóm xe.</p>
            ) : (
              <div className="flex flex-col divide-y divide-gray-50 mt-3">
                {leaderboard.map((row) => (
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
            )}
          </Tab>
        </Tabs>
      </Section>
    </div>
  );
}

export default KpiLeaderboard;
