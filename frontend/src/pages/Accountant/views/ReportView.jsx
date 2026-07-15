import { useState, useEffect, useCallback } from "react";
import { Spinner, Select, SelectItem } from "@heroui/react";
import {
  RiLineChartLine, RiMoneyDollarCircleLine,
  RiFileList3Line, RiAlertLine,
  RiGroupLine, RiTimeLine, RiCoinLine,
  RiBankCard2Line, RiShieldUserLine,
} from "react-icons/ri";
import { accountantService } from "../services/accountant.service";
import { StatCard } from "../../../components/shared-ui/StatCard";
import { Section } from "../../../components/shared-ui/Section";
import {
  VND, VND_FULL, RevenueChart, VehicleRevenueChart,
  DebtAgingBars, TopCustomersTable, DriverHoldingsList, PayrollQuickStats,
} from "../../../components/shared-ui/reportCharts";

const MONTH_OPTIONS = [
  { key: "3",  label: "3 tháng gần nhất" },
  { key: "6",  label: "6 tháng gần nhất" },
  { key: "12", label: "12 tháng gần nhất" },
];

const GRANULARITY_OPTIONS = [
  { key: "day",   label: "Ngày" },
  { key: "week",  label: "Tuần" },
  { key: "month", label: "Tháng" },
];

export function ReportView() {
  const [months, setMonths]   = useState("6");
  const [granularity, setGranularity] = useState("month");
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const load = useCallback(async (m, g) => {
    setLoading(true);
    setError(null);
    try {
      const res = await accountantService.getReportOverview(Number(m), g);
      setData(res);
    } catch (err) {
      setError(err.message ?? "Không thể tải báo cáo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(months, granularity); }, [months, granularity, load]);

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

      {}
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

      {}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label={granularity === "day" ? "Doanh thu 30 ngày"
            : granularity === "week" ? "Doanh thu 12 tuần"
            : `Doanh thu ${months} tháng`}
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

      {/* Xu hướng doanh thu 3/5 — Doanh thu theo xe 2/5 */}
      <div className="grid grid-cols-5 gap-4">
        <div className="col-span-3">
          <Section
            title="Xu hướng doanh thu"
            icon={RiLineChartLine}
            action={
              <div className="flex gap-0.5 bg-gray-100 p-0.5 rounded-lg">
                {GRANULARITY_OPTIONS.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setGranularity(key)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all
                      ${granularity === key
                        ? "bg-white text-blue-600 shadow-sm"
                        : "text-gray-400 hover:text-gray-600"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            }
          >
            <RevenueChart data={data?.revenueChart} />
          </Section>
        </div>

        <div className="col-span-2">
          <Section title="Doanh thu theo từng xe" icon={RiBankCard2Line}>
            <VehicleRevenueChart data={data?.revenueByVehicle} />
          </Section>
        </div>
      </div>

      {}
      <div className="grid grid-cols-3 gap-4">
        {}
        <div className="col-span-2">
          <Section title="Top khách hàng theo doanh thu" icon={RiGroupLine}>
            <TopCustomersTable data={data?.topCustomers} />
          </Section>
        </div>

        {}
        <Section title="Tiền tài xế đang cầm" icon={RiCoinLine}>
          <DriverHoldingsList data={data?.driverHoldings} />
        </Section>
      </div>

      {}
      <div className="grid grid-cols-2 gap-4">
        <Section title="Phân tích nợ theo thời gian" icon={RiTimeLine}>
          <DebtAgingBars data={data?.debtAging} />
        </Section>

        <Section title="Tổng quan bảng lương" icon={RiShieldUserLine}>
          <PayrollQuickStats data={data?.payrollSummary} />
        </Section>
      </div>

    </div>
  );
}
