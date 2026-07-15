import { useEffect, useState } from "react";
import { Button, Input, Textarea, Spinner, Select, SelectItem } from "@heroui/react";
import {
  RiUserSettingsLine, RiTruckLine, RiWalletLine, RiExchangeLine,
  RiCloseLine, RiCheckLine, RiFileTextLine, RiBuilding2Line,
  RiDashboardLine, RiLineChartLine, RiAlertLine,
  RiTrophyLine, RiGroupLine, RiCoinLine, RiTimeLine, RiShieldUserLine,
  RiBankCard2Line, RiQrCodeLine, RiUploadCloud2Line,
} from "react-icons/ri";
import { StatCard } from "../../../components/shared-ui/StatCard";
import { Section } from "../../../components/shared-ui/Section";
import { StatusBadge } from "../../../components/shared-ui/StatusBadge";
import { BankSelect } from "../../../components/shared-ui/BankSelect";
import { KpiLeaderboard } from "../../../components/shared-ui/KpiLeaderboard";
import {
  VND, VND_FULL, RevenueChart, VehicleRevenueChart,
  DebtAgingBars, TopCustomersTable, DriverHoldingsList, PayrollQuickStats,
} from "../../../components/shared-ui/reportCharts";
import { useRoleRealtime } from "../../../hooks/useRoleRealtime";
import { managerService } from "../services/manager.service";

const fmt = (v) => new Intl.NumberFormat("vi-VN").format(Number(v || 0)) + "đ";

const REPORT_MONTH_OPTIONS = [
  { key: "3",  label: "3 tháng gần nhất" },
  { key: "6",  label: "6 tháng gần nhất" },
  { key: "12", label: "12 tháng gần nhất" },
];

const TABS = [
  { key: "overview",  label: "Tổng quan",       icon: RiDashboardLine },
  { key: "financial", label: "Tài chính",       icon: RiLineChartLine },
  { key: "debt",      label: "Công nợ",         icon: RiAlertLine },
  { key: "kpi",       label: "KPI & Xếp hạng", icon: RiTrophyLine },
];

export default function DashboardView({ user }) {
  const [tab, setTab] = useState("overview");
  const [dashboard, setDashboard] = useState(null);
  const [salaryAdvances, setSalaryAdvances] = useState([]);
  const [debtRepayments, setDebtRepayments] = useState([]);
  const [receiptRequests, setReceiptRequests] = useState([]);
  const [companyForm, setCompanyForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingCompany, setSavingCompany] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);
  const [actingId, setActingId] = useState(null);

  const [rejectAdvanceTarget, setRejectAdvanceTarget] = useState(null);
  const [rejectRepaymentTarget, setRejectRepaymentTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");

  const [reportMonths, setReportMonths] = useState("6");
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState(null);

  const refreshAll = async () => {
    setLoading(true);
    try {
      const [dashboardData, advancesData, repaymentsData, receiptsData, companyData] = await Promise.all([
        managerService.getDashboard(),
        managerService.getSalaryAdvances({ status: "all", limit: 20 }),
        managerService.getDebtRepayments(),
        managerService.getReceiptRequests(),
        managerService.getCompanyInfo(),
      ]);

      setDashboard(dashboardData);
      setSalaryAdvances(advancesData.advances || []);
      setDebtRepayments(repaymentsData.repayments || []);
      setReceiptRequests(receiptsData.requests || []);
      setCompanyForm({
        company_name: companyData.info?.company_name || "",
        hotline: companyData.info?.hotline || "",
        bank_name: companyData.info?.bank_name || "",
        bank_account_number: companyData.info?.bank_account_number || "",
        bank_account_name: companyData.info?.bank_account_name || "",
        bank_qr_url: companyData.info?.bank_qr_url || "",
        updated_at: companyData.info?.updated_at || null,
      });
    } catch (error) {
      alert(error.message || "Không thể tải dữ liệu quản lý.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refreshAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useRoleRealtime(user, {
    onMessage: (payload) => {
      if (!payload?.type) return;
      if (
        payload.type === "manager.workflow.changed" ||
        payload.type === "manager.users.changed" ||
        payload.type === "manager.vehicles.changed" ||
        payload.type === "coordinator.receipt_requests.changed" ||
        payload.type === "notification.created" ||
        payload.type === "maintenance.completed"
      ) {
        refreshAll();
      }
    },
  });

  const overview = dashboard?.overview;
  const finance = dashboard?.finance;
  const workflow = overview?.workflow || {};

  // Chỉ tải báo cáo tài chính/công nợ khi mở tới tab tương ứng — tránh gọi API nặng không cần thiết
  useEffect(() => {
    if (tab !== "financial" && tab !== "debt") return;
    if (report) return;
    let cancelled = false;
    setReportLoading(true);
    setReportError(null);
    managerService.getReportOverview(Number(reportMonths), "month")
      .then((res) => { if (!cancelled) setReport(res); })
      .catch((err) => { if (!cancelled) setReportError(err.message || "Không thể tải báo cáo."); })
      .finally(() => { if (!cancelled) setReportLoading(false); });
    return () => { cancelled = true; };
  }, [tab, report, reportMonths]);

  const handleReportMonthsChange = (value) => {
    setReportMonths(value);
    setReport(null);
  };

  const handleApproveAdvance = async (record) => {
    setActingId(`advance-approve-${record.id}`);
    try {
      await managerService.approveSalaryAdvance(record.id);
      await refreshAll();
    } catch (error) {
      alert(error.message || "Không thể phê duyệt yêu cầu.");
    } finally {
      setActingId(null);
    }
  };

  const submitRejectAdvance = async () => {
    setActingId(`advance-reject-${rejectAdvanceTarget.id}`);
    try {
      await managerService.rejectSalaryAdvance(rejectAdvanceTarget.id, rejectReason);
      setRejectAdvanceTarget(null);
      setRejectReason("");
      await refreshAll();
    } catch (error) {
      alert(error.message || "Không thể từ chối yêu cầu.");
    } finally {
      setActingId(null);
    }
  };

  const handleConfirmRepayment = async (record) => {
    setActingId(`repayment-confirm-${record.id}`);
    try {
      await managerService.confirmDebtRepayment(record.id);
      await refreshAll();
    } catch (error) {
      alert(error.message || "Không thể xác nhận nộp tiền.");
    } finally {
      setActingId(null);
    }
  };

  const submitRejectRepayment = async () => {
    setActingId(`repayment-reject-${rejectRepaymentTarget.id}`);
    try {
      await managerService.rejectDebtRepayment(rejectRepaymentTarget.id, rejectReason);
      setRejectRepaymentTarget(null);
      setRejectReason("");
      await refreshAll();
    } catch (error) {
      alert(error.message || "Không thể từ chối yêu cầu.");
    } finally {
      setActingId(null);
    }
  };

  const handleSaveCompany = async () => {
    setSavingCompany(true);
    try {
      const result = await managerService.updateCompanyInfo(companyForm);
      setCompanyForm((p) => ({ ...p, ...result.info }));
    } catch (error) {
      alert(error.message || "Không thể cập nhật thông tin công ty.");
    } finally {
      setSavingCompany(false);
    }
  };

  const handleUploadQr = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingQr(true);
    try {
      const result = await managerService.uploadBankQr(file);
      setCompanyForm((p) => ({ ...p, ...result.info }));
    } catch (error) {
      alert(error.message || "Không thể tải ảnh QR lên.");
    } finally {
      setUploadingQr(false);
    }
  };

  if (loading && !dashboard) {
    return <div className="flex items-center justify-center py-32"><Spinner color="primary" label="Đang tải tổng quan..." size="lg" /></div>;
  }

  const reportTotalRevenue = report?.revenueChart?.reduce((s, r) => s + Number(r.revenue || 0), 0) ?? 0;
  const reportTotalOrders  = report?.revenueChart?.reduce((s, r) => s + Number(r.order_count || 0), 0) ?? 0;
  const reportTotalDebt = report?.debtAging
    ? ["d0_30", "d30_60", "d60_90", "d90_plus"].reduce((s, k) => s + Number(report.debtAging[k] || 0), 0)
    : 0;
  const reportOverdueDebt = Number(report?.debtAging?.d90_plus || 0);

  return (
    <div className="flex flex-col gap-5">
      {/* Thanh chuyển tab — gom mọi loại báo cáo (tổng quan, vận hành, tài chính, công nợ, KPI) vào 1 màn hình */}
      <div className="flex gap-1 bg-white border border-gray-100 rounded-2xl p-1.5 shadow-sm w-fit">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all
              ${tab === key ? "bg-blue-600 text-white shadow-sm" : "text-gray-500 hover:bg-gray-50"}`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-4 gap-4">
          <StatCard
            label="Nhân sự đang hoạt động"
            value={overview?.workforce?.active_users || 0}
            icon={RiUserSettingsLine}
            sub={`${overview?.workforce?.driver_count || 0} tài xế, ${overview?.workforce?.active_staff || 0} nhân sự văn phòng`}
            border="border-blue-100" lightBg="bg-blue-50" text="text-blue-600" gradient="from-blue-500 to-blue-600"
          />
          <StatCard
            label="Xe sẵn sàng"
            value={overview?.fleet?.active || 0}
            icon={RiTruckLine}
            sub={`${overview?.fleet?.maintenance || 0} bảo trì, ${overview?.fleet?.broken || 0} hư hỏng`}
            border="border-emerald-100" lightBg="bg-emerald-50" text="text-emerald-600" gradient="from-emerald-500 to-emerald-600"
          />
          <StatCard
            label="Công nợ cần thu"
            value={fmt(finance?.total_receivables)}
            icon={RiWalletLine}
            sub={`${finance?.pending_payments_count || 0} đơn chưa thu đủ`}
            border="border-amber-100" lightBg="bg-amber-50" text="text-amber-600" gradient="from-amber-500 to-amber-600"
          />
          <StatCard
            label="Tiền chờ phê duyệt"
            value={fmt(workflow.pending_advances_amount)}
            icon={RiExchangeLine}
            sub="Ứng lương và nộp tiền đang chờ"
            border="border-rose-100" lightBg="bg-rose-50" text="text-rose-600" gradient="from-rose-500 to-rose-600"
          />

          <StatCard
            label="Tổng nhân sự"
            value={overview?.workforce?.total_users || 0}
            icon={RiGroupLine}
            sub={`${overview?.workforce?.manager_count || 0} quản lý, ${overview?.workforce?.coordinator_count || 0} điều phối, ${overview?.workforce?.accountant_count || 0} kế toán`}
            border="border-indigo-100" lightBg="bg-indigo-50" text="text-indigo-600" gradient="from-indigo-500 to-indigo-600"
          />
          <StatCard
            label="Xe cần chú ý"
            value={(overview?.fleet?.maintenance || 0) + (overview?.fleet?.broken || 0)}
            icon={RiAlertLine}
            sub={`${overview?.fleet?.broken || 0} hư hỏng, ${overview?.fleet?.retired || 0} ngừng hoạt động`}
            border="border-orange-100" lightBg="bg-orange-50" text="text-orange-600" gradient="from-orange-500 to-orange-600"
          />
          <StatCard
            label="Doanh thu gộp"
            value={fmt(finance?.total_gross_revenue)}
            icon={RiLineChartLine}
            sub="Tổng cước các đơn đã hoàn thành"
            border="border-blue-100" lightBg="bg-blue-50" text="text-blue-600" gradient="from-blue-500 to-blue-600"
          />
          <StatCard
            label="Đã thu về"
            value={fmt(finance?.total_collected)}
            icon={RiCoinLine}
            sub="Doanh thu thực nhận sau khi trừ công nợ"
            border="border-emerald-100" lightBg="bg-emerald-50" text="text-emerald-600" gradient="from-emerald-500 to-emerald-600"
          />
        </div>
      )}

      {tab === "overview" && (
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 flex flex-col gap-4">
          <Section title="Ứng lương" icon={RiExchangeLine} action={<span className="text-xs text-gray-400">{salaryAdvances.filter((a) => a.status === "pending").length} đang chờ</span>}>
            {salaryAdvances.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">Không có yêu cầu ứng lương.</p>
            ) : (
              <div className="flex flex-col divide-y divide-gray-50">
                {salaryAdvances.slice(0, 6).map((r) => (
                  <div key={r.id} className="flex items-center justify-between py-3 gap-3">
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-semibold text-gray-800">{r.driver_name}</span>
                      <span className="text-xs text-gray-400">{r.request_month}/{r.request_year} · {fmt(r.amount)}</span>
                    </div>
                    {r.status === "pending" ? (
                      <div className="flex gap-1 flex-shrink-0">
                        <Button size="sm" variant="flat" color="success" startContent={<RiCheckLine size={13} />} isLoading={actingId === `advance-approve-${r.id}`} onPress={() => handleApproveAdvance(r)}>Duyệt</Button>
                        <Button size="sm" variant="flat" color="danger" startContent={<RiCloseLine size={13} />} onPress={() => { setRejectAdvanceTarget(r); setRejectReason(""); }}>Từ chối</Button>
                      </div>
                    ) : (
                      <StatusBadge status={r.status} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Nộp tiền công nợ" icon={RiWalletLine} action={<span className="text-xs text-gray-400">{debtRepayments.length} đang chờ</span>}>
            {debtRepayments.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">Không có yêu cầu nộp tiền.</p>
            ) : (
              <div className="flex flex-col divide-y divide-gray-50">
                {debtRepayments.slice(0, 6).map((r) => (
                  <div key={r.id} className="flex items-center justify-between py-3 gap-3">
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-semibold text-gray-800">{r.driver_name}</span>
                      <span className="text-xs text-gray-400">{r.cargo_name || "Công nợ nội bộ"} · {fmt(r.amount)} / {fmt(r.total_amount)}</span>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button size="sm" variant="flat" color="success" startContent={<RiCheckLine size={13} />} isLoading={actingId === `repayment-confirm-${r.id}`} onPress={() => handleConfirmRepayment(r)}>Xác nhận</Button>
                      <Button size="sm" variant="flat" color="danger" startContent={<RiCloseLine size={13} />} onPress={() => { setRejectRepaymentTarget(r); setRejectReason(""); }}>Từ chối</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>

        <div className="flex flex-col gap-4">
          <Section title="Yêu cầu phiếu thu" icon={RiFileTextLine}>
            {receiptRequests.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">Không có yêu cầu phiếu thu.</p>
            ) : (
              <div className="flex flex-col divide-y divide-gray-50">
                {receiptRequests.slice(0, 6).map((r, idx) => (
                  <div key={idx} className="py-2.5 flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-800">Đơn #{r.order_id}</span>
                      <StatusBadge status={r.status} />
                    </div>
                    <span className="text-xs text-gray-500">{r.driver_name || "Chưa có tài xế"} → {r.customer_name || "Khách lẻ"}</span>
                    <span className="text-xs text-gray-400">{r.cargo_name || "Không có tên hàng"} · {fmt(r.receipt_amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {companyForm && (
            <Section title="Thông tin công ty" icon={RiBuilding2Line}>
              <div className="flex flex-col gap-3">
                <Input label="Tên công ty" value={companyForm.company_name} onValueChange={(v) => setCompanyForm((p) => ({ ...p, company_name: v }))} variant="bordered" size="sm" />
                <Input label="Hotline" value={companyForm.hotline} onValueChange={(v) => setCompanyForm((p) => ({ ...p, hotline: v }))} variant="bordered" size="sm" />
                <BankSelect value={companyForm.bank_name} onChange={(v) => setCompanyForm((p) => ({ ...p, bank_name: v }))} />
                <Input label="Số tài khoản" value={companyForm.bank_account_number} onValueChange={(v) => setCompanyForm((p) => ({ ...p, bank_account_number: v }))} variant="bordered" size="sm" />
                <Input label="Chủ tài khoản" value={companyForm.bank_account_name} onValueChange={(v) => setCompanyForm((p) => ({ ...p, bank_account_name: v }))} variant="bordered" size="sm" />

                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-gray-600">Ảnh QR ngân hàng</span>
                  <div className="flex items-center gap-3">
                    {companyForm.bank_qr_url ? (
                      <img src={companyForm.bank_qr_url} alt="QR ngân hàng" className="w-20 h-20 rounded-xl object-cover border border-gray-200" />
                    ) : (
                      <div className="w-20 h-20 rounded-xl border border-dashed border-gray-300 flex items-center justify-center">
                        <RiQrCodeLine size={22} className="text-gray-300" />
                      </div>
                    )}
                    <label className="cursor-pointer">
                      <input type="file" accept="image/*" className="hidden" onChange={handleUploadQr} disabled={uploadingQr} />
                      <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                        {uploadingQr ? <Spinner size="sm" /> : <RiUploadCloud2Line size={14} />}
                        {companyForm.bank_qr_url ? "Đổi ảnh QR" : "Tải ảnh QR"}
                      </span>
                    </label>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">
                    {companyForm.updated_at ? `Cập nhật lần cuối: ${new Date(companyForm.updated_at).toLocaleString("vi-VN")}` : "Chưa có bản ghi công ty."}
                  </span>
                  <Button size="sm" color="primary" isLoading={savingCompany} onPress={handleSaveCompany}>Lưu thay đổi</Button>
                </div>
              </div>
            </Section>
          )}
        </div>
      </div>
      )}

      {(tab === "financial" || tab === "debt") && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400">Dữ liệu tổng hợp từ đơn hoàn thành</p>
            <Select
              size="sm"
              selectedKeys={new Set([reportMonths])}
              onSelectionChange={(keys) => handleReportMonthsChange([...keys][0])}
              classNames={{ base: "w-48", trigger: "h-8 bg-white border border-gray-200 rounded-lg text-xs" }}
              aria-label="Kỳ báo cáo"
            >
              {REPORT_MONTH_OPTIONS.map(({ key, label }) => (
                <SelectItem key={key}>{label}</SelectItem>
              ))}
            </Select>
          </div>

          {reportLoading ? (
            <div className="flex items-center justify-center py-24"><Spinner color="primary" label="Đang tải báo cáo..." size="lg" /></div>
          ) : reportError ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center">
                <RiAlertLine size={22} className="text-red-400" />
              </div>
              <p className="text-sm text-gray-500">{reportError}</p>
            </div>
          ) : tab === "financial" ? (
            <>
              <div className="grid grid-cols-4 gap-4">
                <StatCard
                  label={`Doanh thu ${reportMonths} tháng`}
                  value={VND(reportTotalRevenue)}
                  icon={RiLineChartLine}
                  sub={`${reportTotalOrders} đơn hoàn thành`}
                  gradient="from-blue-500 to-blue-600" lightBg="bg-blue-50" text="text-blue-600" border="border-blue-100"
                />
                <StatCard
                  label="Nợ phải thu"
                  value={VND(reportTotalDebt)}
                  icon={RiFileTextLine}
                  sub={reportTotalDebt > 0 ? "Từ khách hàng chưa thu đủ" : "Không có công nợ"}
                  gradient="from-orange-500 to-orange-600" lightBg="bg-orange-50" text="text-orange-600" border="border-orange-100"
                />
                <StatCard
                  label="Nợ quá hạn > 90 ngày"
                  value={VND(reportOverdueDebt)}
                  icon={RiAlertLine}
                  sub={reportOverdueDebt > 0 ? "Cần xử lý khẩn" : "Không có"}
                  gradient="from-red-500 to-rose-600" lightBg="bg-red-50" text="text-red-600" border="border-red-100"
                />
                <StatCard
                  label="Lương tháng này"
                  value={VND(report?.payrollSummary?.total_net ?? 0)}
                  icon={RiWalletLine}
                  sub={`${report?.payrollSummary?.paid ?? 0} tài xế đã chi`}
                  gradient="from-emerald-500 to-emerald-600" lightBg="bg-emerald-50" text="text-emerald-600" border="border-emerald-100"
                />
              </div>

              <div className="grid grid-cols-5 gap-4">
                <div className="col-span-3">
                  <Section title="Xu hướng doanh thu" icon={RiLineChartLine}>
                    <RevenueChart data={report?.revenueChart} />
                  </Section>
                </div>
                <div className="col-span-2">
                  <Section title="Doanh thu theo từng xe" icon={RiBankCard2Line}>
                    <VehicleRevenueChart data={report?.revenueByVehicle} />
                  </Section>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <Section title="Top khách hàng theo doanh thu" icon={RiGroupLine}>
                    <TopCustomersTable data={report?.topCustomers} />
                  </Section>
                </div>
                <Section title="Tổng quan bảng lương" icon={RiShieldUserLine}>
                  <PayrollQuickStats data={report?.payrollSummary} />
                </Section>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <Section title="Phân tích nợ theo thời gian" icon={RiTimeLine}>
                  <DebtAgingBars data={report?.debtAging} />
                </Section>
              </div>
              <Section title="Tiền tài xế đang cầm" icon={RiCoinLine}>
                <DriverHoldingsList data={report?.driverHoldings} />
              </Section>
            </div>
          )}
        </div>
      )}

      {tab === "kpi" && (
        <KpiLeaderboard
          getVehicleGroups={managerService.getVehicleGroupsForKpi}
          getAllDriversKPI={managerService.getAllDriversKPI}
          getLeaderboardByGroup={managerService.getLeaderboardByGroup}
        />
      )}

      {rejectAdvanceTarget && (
        <RejectDialog
          title="Từ chối yêu cầu ứng lương"
          reason={rejectReason}
          setReason={setRejectReason}
          loading={actingId === `advance-reject-${rejectAdvanceTarget.id}`}
          onClose={() => setRejectAdvanceTarget(null)}
          onConfirm={submitRejectAdvance}
        />
      )}
      {rejectRepaymentTarget && (
        <RejectDialog
          title="Từ chối nộp tiền"
          reason={rejectReason}
          setReason={setRejectReason}
          loading={actingId === `repayment-reject-${rejectRepaymentTarget.id}`}
          onClose={() => setRejectRepaymentTarget(null)}
          onConfirm={submitRejectRepayment}
        />
      )}
    </div>
  );
}

function RejectDialog({ title, reason, setReason, loading, onClose, onConfirm }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-sm flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        <span className="text-sm font-bold text-gray-900">{title}</span>
        <Textarea placeholder="Lý do từ chối" value={reason} onValueChange={setReason} minRows={3} variant="bordered" />
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="flat" onPress={onClose}>Hủy</Button>
          <Button size="sm" color="danger" isLoading={loading} startContent={<RiCloseLine size={14} />} onPress={onConfirm}>Từ chối</Button>
        </div>
      </div>
    </div>
  );
}
