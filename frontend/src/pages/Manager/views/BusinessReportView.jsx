import { useState, useEffect, useCallback, useMemo } from "react";
import { Spinner, Select, SelectItem, Button } from "@heroui/react";
import { confirmDialog } from "../../../components/shared-ui/confirm";
import {
  RiLineChartLine, RiWallet3Line, RiFundsLine, RiPercentLine,
  RiAlertLine, RiTimeLine, RiCoinLine,
  RiGroupLine, RiUserStarLine, RiArrowUpLine, RiArrowDownLine,
  RiErrorWarningLine, RiLockLine, RiShieldCheckLine,
  RiFileExcel2Line, RiFileList3Line,
} from "react-icons/ri";
import { managerService } from "../services/manager.service";
import { notify } from "../../../components/shared-ui/Toast";
import { exportBusinessReportToExcel } from "../utils/exportBusinessReport";
import { reconcileDebtRows } from "../utils/debtReconcile";
import { StatCard } from "../../../components/shared-ui/StatCard";
import { Section } from "../../../components/shared-ui/Section";
import {
  VND, VND_FULL, DebtAgingBars,
  DriverHoldingsList, TopCustomersTable,
} from "../../../components/shared-ui/reportCharts";
import { money } from "../../../utils/formatNumber";

// 12 kỳ gần nhất (tháng) tính từ tháng hiện tại theo giờ VN.
function buildPeriodOptions() {
  const vnNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
  let y = vnNow.getUTCFullYear();
  let m = vnNow.getUTCMonth() + 1;
  const out = [];
  for (let i = 0; i < 12; i++) {
    out.push({ key: `${y}-${m}`, year: y, month: m, label: `Tháng ${m}/${y}` });
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
  }
  return out;
}

// Chênh lệch tương đối so kỳ trước cho các chỉ số tiền/số lượng.
function Delta({ cur, prev, goodWhenUp = true }) {
  if (prev === null || prev === undefined || Number(prev) === 0) {
    return <span className="text-[11px] text-gray-400 dark:text-gray-400">chưa có kỳ trước</span>;
  }
  const pct = ((Number(cur) - Number(prev)) / Math.abs(Number(prev))) * 100;
  const up = pct >= 0;
  const good = up === goodWhenUp;
  const Icon = up ? RiArrowUpLine : RiArrowDownLine;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${good ? "text-emerald-600 dark:text-emerald-300" : "text-red-500"}`}>
      <Icon size={12} />
      {Math.abs(pct).toFixed(1)}% <span className="text-gray-400 dark:text-gray-400 font-normal">so kỳ trước</span>
    </span>
  );
}

export default function BusinessReportView() {
  const periodOptions = useMemo(buildPeriodOptions, []);
  const [periodKey, setPeriodKey] = useState(periodOptions[0].key);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [acting, setActing] = useState(false);
  const [actionErr, setActionErr] = useState(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async (key) => {
    const opt = periodOptions.find((p) => p.key === key) ?? periodOptions[0];
    setLoading(true);
    setError(null);
    try {
      const res = await managerService.getBusinessReport(opt.year, opt.month);
      setData(res);
    } catch (err) {
      setError(err.message ?? "Không thể tải báo cáo.");
    } finally {
      setLoading(false);
    }
  }, [periodOptions]);

  useEffect(() => { load(periodKey); }, [periodKey, load]);

  // Ký duyệt kỳ — thao tác một chiều, không mở lại được, nên phải xác nhận trước.
  // Cảnh báo nêu SỐ THẬT (bao nhiêu chuyến còn chưa chốt giá, ước tính bao nhiêu tiền)
  // thay vì nhắc chung chung — đó mới là thứ quyết định nên ký bây giờ hay đợi.
  const handleSignOff = useCallback(async () => {
    const opt = periodOptions.find((p) => p.key === periodKey) ?? periodOptions[0];

    setActionErr(null);
    let preflight = null;
    try {
      preflight = await managerService.getReportPeriodPreflight(opt.year, opt.month);
    } catch {
      // Không chặn thao tác chỉ vì không lấy được số cảnh báo — vẫn cảnh báo phần chung.
      preflight = null;
    }

    // Kỳ đã có người ký (tab khác, người khác) — dừng ngay ở đây thay vì để người dùng
    // bấm qua hộp xác nhận rồi mới ăn 409 từ server.
    if (preflight?.already_signed_off) {
      const message = "Kỳ này đã được ký duyệt trước đó.";
      setActionErr(message);
      notify.error(message);
      await load(periodKey);
      return;
    }

    const unpricedWarning = preflight?.unpriced_trips > 0
      ? `\n\n⚠️ Kỳ này còn ${preflight.unpriced_trips} chuyến đã chạy nhưng CHƯA chốt giá `
        + `(ước tính ${money(preflight.unpriced_estimated_total)}). Ký duyệt bây giờ thì `
        + "doanh thu của những chuyến đó sẽ được ghi nhận sang kỳ mở kế tiếp, không nằm "
        + `trong báo cáo ${opt.label}. Muốn tính đủ vào kỳ này thì duyệt hết phiếu thu TRƯỚC, `
        + "rồi mới ký — ký rồi là không sửa được nữa."
      : "";

    const { ok, value: note } = await confirmDialog({
      title: `Ký duyệt báo cáo ${opt.label}?`,
      description:
        `Ký duyệt sẽ đóng băng toàn bộ số liệu ${opt.label} và KHOÁ CỨNG kỳ này — `
        + "không sửa lại, không mở lại được."
        + unpricedWarning,
      input: { label: "Ghi chú (không bắt buộc)", placeholder: "Lý do ký duyệt, điểm cần lưu ý của kỳ này..." },
      confirmLabel: "Ký duyệt",
      danger: true,
    });
    if (!ok) return;

    setActing(true);
    try {
      const res = await managerService.signOffReportPeriod(opt.year, opt.month, note || null);
      if (res?.report) setData(res.report);
      else await load(periodKey);
      notify.success("Đã ký duyệt kỳ báo cáo.");
    } catch (err) {
      const message = err.message ?? "Thao tác không thành công.";
      setActionErr(message);
      notify.error(message);
    } finally {
      setActing(false);
    }
  }, [periodOptions, periodKey, load]);

  const handleExport = useCallback(async () => {
    if (!data) return;
    const opt = periodOptions.find((p) => p.key === periodKey) ?? periodOptions[0];
    setExporting(true);
    try {
      // Khối định danh đơn vị ở đầu mỗi sheet. Không lấy được thì vẫn xuất — biểu mẫu
      // in ra các dòng chấm để điền tay, còn hơn là chặn không xuất được báo cáo.
      const info = await managerService.getCompanyInfo().catch(() => null);

      await exportBusinessReportToExcel(data, {
        periodLabel: opt.label,
        company: info?.info ?? {},
      });
      notify.success("Đã xuất báo cáo kinh doanh.");
    } catch {
      setActionErr("Xuất file không thành công.");
      notify.error("Xuất file không thành công.");
    } finally {
      setExporting(false);
    }
  }, [data, periodOptions, periodKey]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Spinner color="primary" label="Đang tải báo cáo kinh doanh..." size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <div className="w-12 h-12 rounded-2xl bg-red-50 dark:bg-red-500/10 flex items-center justify-center">
          <RiAlertLine size={22} className="text-red-400" />
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">{error}</p>
      </div>
    );
  }

  const pnl = data?.pnl ?? {};
  const prev = pnl.prev ?? {};
  const totalCost = Number(pnl.operating_cost || 0) + Number(pnl.payroll_cost || 0);
  const prevCost = Number(prev.operating_cost || 0) + Number(prev.payroll_cost || 0);
  const marginPP = (Number(pnl.margin_pct || 0) - Number(prev.margin_pct || 0));
  const cash = data?.cashflow ?? {};
  const meta = data?.meta ?? { status: "open" };

  return (
    <div className="flex flex-col gap-5">

      {/* Kỳ báo cáo */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400 dark:text-gray-400">
          Kết quả kinh doanh · Doanh thu cước hoàn thành trừ chi phí vận hành và lương
        </p>
        <div className="flex items-center gap-2">
          <Button
            size="sm" variant="flat" color="success" className="h-8"
            isLoading={exporting} onPress={handleExport} isDisabled={!data}
            startContent={!exporting && <RiFileExcel2Line size={15} />}
          >
            Xuất Excel
          </Button>
          <Select
            size="sm"
            selectedKeys={new Set([periodKey])}
            onSelectionChange={(keys) => setPeriodKey([...keys][0])}
            classNames={{ base: "w-44", trigger: "h-8 bg-white dark:bg-[#161922] border border-gray-200 dark:border-white/10 rounded-lg text-xs" }}
            aria-label="Kỳ báo cáo"
          >
            {periodOptions.map(({ key, label }) => (
              <SelectItem key={key}>{label}</SelectItem>
            ))}
          </Select>
        </div>
      </div>

      {/* Phase 3: trạng thái ký duyệt kỳ + thao tác */}
      <PeriodStatusBar
        meta={meta}
        acting={acting}
        actionErr={actionErr}
        onSignOff={handleSignOff}
      />

      {/* Doanh thu chạy ở kỳ trước nhưng chốt giá muộn nên ghi nhận vào kỳ này. Nêu
          riêng để người đọc không phải đoán vì sao doanh thu vọt lên mà số chuyến
          trong kỳ không tăng tương ứng. */}
      {Number(pnl.revenue_carried_in) > 0 && (
        <div className="rounded-2xl border border-sky-200 dark:border-sky-500/25 bg-sky-50 dark:bg-sky-500/10 px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/70 dark:bg-white/10 flex items-center justify-center shrink-0">
            <RiArrowUpLine size={18} className="text-sky-500" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-800 dark:text-gray-100">
              Bao gồm {money(pnl.revenue_carried_in)} doanh thu kỳ trước chuyển sang
            </p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              {pnl.trips_carried_in ?? 0} chuyến chạy ở kỳ trước, chốt giá sau khi kỳ đó đã ký duyệt
              nên được ghi nhận vào kỳ này.
            </p>
          </div>
        </div>
      )}

      {/* A. P&L */}
      <div className="grid grid-cols-4 gap-4">
        <div className="flex flex-col gap-1">
          <StatCard
            label="Doanh thu"
            value={VND(pnl.revenue)}
            icon={RiLineChartLine}
            sub={`${pnl.completed_trips ?? 0} chuyến đã chốt giá`}
            gradient="from-blue-500 to-blue-600"
            lightBg="bg-blue-50 dark:bg-blue-500/10" text="text-blue-600 dark:text-blue-300" border="border-blue-100 dark:border-blue-500/20"
          />
          <div className="px-1"><Delta cur={pnl.revenue} prev={prev.revenue} /></div>
        </div>
        <div className="flex flex-col gap-1">
          <StatCard
            label="Tổng chi phí"
            value={VND(totalCost)}
            icon={RiWallet3Line}
            sub="Vận hành + lương"
            gradient="from-orange-500 to-orange-600"
            lightBg="bg-orange-50 dark:bg-orange-500/10" text="text-orange-600 dark:text-orange-300" border="border-orange-100 dark:border-orange-500/20"
          />
          <div className="px-1"><Delta cur={totalCost} prev={prevCost} goodWhenUp={false} /></div>
        </div>
        <div className="flex flex-col gap-1">
          <StatCard
            label="Lợi nhuận gộp"
            value={VND(pnl.gross_profit)}
            icon={RiFundsLine}
            sub={Number(pnl.gross_profit) >= 0 ? "Doanh thu − chi phí" : "Đang lỗ trong kỳ"}
            gradient={Number(pnl.gross_profit) >= 0 ? "from-emerald-500 to-emerald-600" : "from-red-500 to-rose-600"}
            lightBg={Number(pnl.gross_profit) >= 0 ? "bg-emerald-50 dark:bg-emerald-500/10" : "bg-red-50 dark:bg-red-500/10"}
            text={Number(pnl.gross_profit) >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-red-600 dark:text-red-300"}
            border={Number(pnl.gross_profit) >= 0 ? "border-emerald-100 dark:border-emerald-500/20" : "border-red-100 dark:border-red-500/20"}
          />
          <div className="px-1"><Delta cur={pnl.gross_profit} prev={prev.gross_profit} /></div>
        </div>
        <div className="flex flex-col gap-1">
          <StatCard
            label="Biên lợi nhuận"
            value={`${Number(pnl.margin_pct || 0).toFixed(1)}%`}
            icon={RiPercentLine}
            sub="Lợi nhuận / doanh thu"
            gradient="from-indigo-500 to-indigo-600"
            lightBg="bg-indigo-50 dark:bg-indigo-500/10" text="text-indigo-600 dark:text-indigo-300" border="border-indigo-100 dark:border-indigo-500/20"
          />
          <div className="px-1">
            <span className={`text-[11px] font-semibold ${marginPP >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-red-500"}`}>
              {marginPP >= 0 ? "+" : ""}{marginPP.toFixed(1)} điểm <span className="text-gray-400 dark:text-gray-400 font-normal">so kỳ trước</span>
            </span>
          </div>
        </div>
      </div>

      {/* Cơ cấu chi phí */}
      <Section title="Cơ cấu chi phí" icon={RiWallet3Line}>
        <CostBreakdown items={data?.cost_breakdown} total={totalCost} />
      </Section>

      {/* Năng suất tài xế + Top khách */}
      <div className="grid grid-cols-2 gap-4">
        <Section title="Năng suất tài xế" icon={RiUserStarLine}>
          <DriverProductivity data={data?.drivers} />
        </Section>
        <Section title="Top khách hàng / đối tác theo doanh thu kỳ" icon={RiGroupLine}>
          <TopCustomersTable data={data?.top_customers} />
        </Section>
      </div>

      {/* Dòng tiền + KPI công nợ */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <Section title="Phân tích nợ phải thu theo tuổi" icon={RiTimeLine}>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <MiniStat label="Nợ phải thu (khách + đối tác)" value={VND(cash.receivable_total)} tone="text-orange-600 dark:text-orange-300" />
              <MiniStat label="DSO (ngày thu tiền)" value={`${Number(cash.dso || 0).toFixed(0)} ngày`} tone="text-gray-700 dark:text-gray-200" />
              <MiniStat
                label="Tỷ lệ thu hồi công nợ kỳ"
                value={`${Number(cash.collection_rate || 0).toFixed(0)}%`}
                tone={Number(cash.collection_rate) >= 80 ? "text-emerald-600 dark:text-emerald-300" : "text-amber-600 dark:text-amber-300"}
              />
            </div>
            {/* Nói rõ mẫu số: DSO và tỷ lệ thu hồi chia cho doanh thu BÁN CHỊU, không phải
                tổng doanh thu — đơn tiền mặt không sinh nợ phải thu. */}
            <p className="text-[11px] text-gray-400 dark:text-gray-400 mb-3">
              Đã thu trong kỳ {VND(cash.collected)} / doanh thu bán chịu {VND(cash.credit_revenue)}.
              Tiền mặt tài xế thu hộ theo dõi riêng ở "Tiền tài xế đang cầm".
            </p>
            <DebtAgingBars data={cash.debt_aging} />
          </Section>
        </div>
        <Section title="Tiền tài xế đang cầm" icon={RiCoinLine}>
          <DriverHoldingsList data={cash.driver_holdings} />
        </Section>
      </div>

      {/* Bên nợ rủi ro */}
      <Section title="Khách hàng / đối tác rủi ro công nợ" icon={RiErrorWarningLine}>
        <RiskyCustomers data={data?.risky_customers} />
      </Section>

      {/* Công nợ chi tiết — tách theo tuổi nợ. Chỉ liệt kê 50 bên nợ lớn nhất, phần còn
          lại gộp thành một dòng để TỔNG CỘNG khớp ô "Nợ phải thu" ở trên. */}
      <Section title="Công nợ phải thu chi tiết" icon={RiFileList3Line}>
        <CustomerDebtTable data={data?.customer_debts} cashflow={cash} />
      </Section>

    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function fmtDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Thanh trạng thái kỳ (open → signed_off) + nút ký duyệt. Chỉ một bước, một chiều:
// ký xong là khoá cứng, không có "chốt lại" hay "mở lại".
function PeriodStatusBar({ meta, acting, actionErr, onSignOff }) {
  const status = meta?.status ?? "open";

  const config = {
    open: {
      wrap: "bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10",
      icon: RiTimeLine, iconTone: "text-gray-400 dark:text-gray-400",
      title: "Kỳ đang mở",
      desc: "Số liệu tính động theo thời gian thực, sẽ đổi khi có giao dịch phát sinh.",
    },
    signed_off: {
      wrap: "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/25",
      icon: RiShieldCheckLine, iconTone: "text-emerald-500",
      title: "Đã ký duyệt — khoá cứng",
      desc: `Ký bởi ${meta?.signed_off_by_name ?? "—"} · ${fmtDateTime(meta?.signed_off_at)}`,
    },
  }[status] ?? {};

  const Icon = config.icon ?? RiTimeLine;

  return (
    <div className={`rounded-2xl border ${config.wrap} px-4 py-3 flex items-center gap-3 flex-wrap`}>
      <div className="w-9 h-9 rounded-xl bg-white/70 dark:bg-white/10 flex items-center justify-center shrink-0">
        <Icon size={18} className={config.iconTone} />
      </div>
      <div className="flex-1 min-w-[180px]">
        <p className="text-sm font-bold text-gray-800 dark:text-gray-100">{config.title}</p>
        <p className="text-[11px] text-gray-500 dark:text-gray-400">{config.desc}</p>
        {meta?.note && <p className="text-[11px] text-gray-400 dark:text-gray-400 italic mt-0.5">Ghi chú: {meta.note}</p>}
        {actionErr && <p className="text-[11px] text-red-500 mt-0.5">{actionErr}</p>}
      </div>

      <div className="flex items-center gap-2">
        {status === "open" && (
          <Button size="sm" color="success" className="text-white" isLoading={acting}
            startContent={!acting && <RiShieldCheckLine size={15} />} onPress={onSignOff}>
            Ký duyệt
          </Button>
        )}
        {status === "signed_off" && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-300">
            <RiLockLine size={14} /> Đã khoá
          </span>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone = "text-gray-700 dark:text-gray-200" }) {
  return (
    <div className="bg-gray-50 dark:bg-white/5 rounded-xl px-3 py-2.5">
      <p className="text-[10px] text-gray-400 dark:text-gray-400 uppercase tracking-wider font-semibold">{label}</p>
      <p className={`text-base font-bold ${tone}`}>{value}</p>
    </div>
  );
}

const COST_COLORS = {
  payroll: { bar: "bg-violet-500", dot: "bg-violet-500", text: "text-violet-600 dark:text-violet-300" },
  vehicle: { bar: "bg-sky-500", dot: "bg-sky-500", text: "text-sky-600 dark:text-sky-300" },
  office: { bar: "bg-amber-500", dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-300" },
};

function CostBreakdown({ items, total }) {
  if (!items?.length || total <= 0) {
    return <p className="text-xs text-gray-400 dark:text-gray-400 text-center py-8">Chưa có chi phí trong kỳ.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-3 rounded-full overflow-hidden gap-px">
        {items.map((it) => {
          const pct = total > 0 ? (Number(it.amount || 0) / total) * 100 : 0;
          const c = COST_COLORS[it.key] ?? COST_COLORS.office;
          return pct > 0 ? <div key={it.key} className={c.bar} style={{ width: `${pct}%` }} /> : null;
        })}
      </div>
      <div className="flex flex-col gap-2">
        {items.map((it) => {
          const c = COST_COLORS[it.key] ?? COST_COLORS.office;
          const pct = total > 0 ? (Number(it.amount || 0) / total) * 100 : 0;
          return (
            <div key={it.key} className="flex items-center justify-between bg-gray-50 dark:bg-white/5 rounded-xl px-3 py-2">
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                <span className="text-[11px] text-gray-500 dark:text-gray-400">{it.label}</span>
                <span className="text-[10px] text-gray-300">{pct.toFixed(0)}%</span>
              </div>
              <span className={`text-xs font-bold ${c.text}`}>{VND(it.amount)}</span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between px-1 pt-1 border-t border-gray-100 dark:border-white/10">
        <span className="text-xs text-gray-400 dark:text-gray-400 font-medium">Tổng chi phí kỳ</span>
        <span className="text-sm font-bold text-orange-600 dark:text-orange-300">{money(total)}</span>
      </div>
    </div>
  );
}

function DriverProductivity({ data }) {
  if (!data?.length) return <p className="text-xs text-gray-400 dark:text-gray-400 text-center py-8">Chưa có dữ liệu.</p>;
  const max = Math.max(...data.map((d) => Number(d.revenue || 0)), 1);
  return (
    <div className="flex flex-col gap-1">
      {data.map((d, i) => (
        <div key={i} className="py-2 border-b border-gray-50 last:border-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate">{d.driver_name}</span>
            <span className="text-xs font-bold text-blue-600 dark:text-blue-300 shrink-0 ml-2">{VND(d.revenue)}</span>
          </div>
          <div className="h-1.5 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-linear-to-r from-blue-400 to-blue-600 rounded-full"
              style={{ width: `${(Number(d.revenue) / max) * 100}%` }} />
          </div>
          <span className="text-[10px] text-gray-400 dark:text-gray-400">{d.trip_count} chuyến</span>
        </div>
      ))}
    </div>
  );
}

// Bảng công nợ giờ gộp cả khách hàng và đối tác giao việc (để tổng khớp với ô
// "Nợ phải thu") — cần nhãn để phân biệt hai loại bên nợ.
function PartyTag() {
  return (
    <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-300">
      Đối tác
    </span>
  );
}

function CustomerDebtTable({ data, cashflow }) {
  if (!data?.length) {
    return <p className="text-xs text-gray-400 dark:text-gray-400 text-center py-8">Không có khách hàng còn dư nợ.</p>;
  }
  // rows đã kèm dòng bù "các bên nợ khác" nếu có hơn 50 bên nợ, nên TỔNG CỘNG bên dưới
  // luôn khớp ô "Nợ phải thu" ở phần trên.
  const { rows, total } = reconcileDebtRows(data, cashflow);
  const cell = "py-2.5 px-2 text-right tabular-nums";

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs min-w-[640px]">
        <thead>
          <tr className="text-gray-400 dark:text-gray-400 border-b border-gray-100 dark:border-white/10">
            <th className="text-left font-semibold py-2 px-2">Khách hàng / đối tác</th>
            <th className="text-right font-semibold py-2 px-2">Dư nợ</th>
            <th className="text-right font-semibold py-2 px-2">0–30</th>
            <th className="text-right font-semibold py-2 px-2">31–60</th>
            <th className="text-right font-semibold py-2 px-2">61–90</th>
            <th className="text-right font-semibold py-2 px-2">&gt; 90</th>
            <th className="text-right font-semibold py-2 px-2">Đơn chưa thu</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c, i) => (
            <tr key={i} className="border-b border-gray-50 last:border-0">
              <td className={`py-2.5 px-2 font-medium truncate max-w-[200px] ${c.unpaid_orders === null ? "text-gray-400 dark:text-gray-400 italic" : "text-gray-700 dark:text-gray-200"}`}>
                {c.name}
                {c.party_type === "partner" && <PartyTag />}
              </td>
              <td className={`${cell} font-bold text-gray-800 dark:text-gray-100`}>{money(c.outstanding)}</td>
              <td className={`${cell} text-gray-500 dark:text-gray-400`}>{Number(c.d0_30) > 0 ? VND(c.d0_30) : "—"}</td>
              <td className={`${cell} text-yellow-600 dark:text-yellow-300`}>{Number(c.d30_60) > 0 ? VND(c.d30_60) : "—"}</td>
              <td className={`${cell} text-orange-600 dark:text-orange-300`}>{Number(c.d60_90) > 0 ? VND(c.d60_90) : "—"}</td>
              <td className={`${cell} font-semibold ${Number(c.d90_plus) > 0 ? "text-red-500" : "text-gray-300"}`}>
                {Number(c.d90_plus) > 0 ? VND(c.d90_plus) : "—"}
              </td>
              <td className={`${cell} text-gray-500 dark:text-gray-400`}>{c.unpaid_orders ?? "—"}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-gray-100 dark:border-white/10 font-bold text-gray-700 dark:text-gray-200">
            <td className="py-2.5 px-2">TỔNG CỘNG</td>
            <td className={cell}>{money(total.outstanding)}</td>
            <td className={cell}>{VND(total.d0_30)}</td>
            <td className={cell}>{VND(total.d30_60)}</td>
            <td className={cell}>{VND(total.d60_90)}</td>
            <td className={`${cell} text-red-500`}>{VND(total.d90_plus)}</td>
            <td className={cell}>{total.unpaid_orders}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function RiskyCustomers({ data }) {
  if (!data?.length) {
    return <p className="text-xs text-gray-400 dark:text-gray-400 text-center py-8">Không có khách hàng tồn đọng công nợ.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs min-w-[420px]">
        <thead>
          <tr className="text-gray-400 dark:text-gray-400 border-b border-gray-100 dark:border-white/10">
            <th className="text-left font-semibold py-2 px-2">Khách hàng / đối tác</th>
            <th className="text-right font-semibold py-2 px-2">Dư nợ</th>
            <th className="text-right font-semibold py-2 px-2">Quá hạn</th>
          </tr>
        </thead>
        <tbody>
          {data.map((c, i) => (
            <tr key={i} className="border-b border-gray-50 last:border-0">
              <td className="py-2.5 px-2 font-medium text-gray-700 dark:text-gray-200 truncate max-w-[220px]">
                {c.name}
                {c.party_type === "partner" && <PartyTag />}
              </td>
              <td className="py-2.5 px-2 text-right font-semibold text-gray-700 dark:text-gray-200">{money(c.outstanding)}</td>
              <td className="py-2.5 px-2 text-right font-bold">
                {Number(c.overdue) > 0
                  ? <span className="text-red-500">{money(c.overdue)}</span>
                  : <span className="text-gray-300">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
