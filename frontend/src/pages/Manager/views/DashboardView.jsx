import { useEffect, useState } from "react";
import { Button, Input, Textarea, Chip, Spinner } from "@heroui/react";
import {
  RiUserSettingsLine, RiTruckLine, RiWalletLine, RiExchangeLine,
  RiCloseLine, RiCheckLine, RiFileTextLine, RiBuilding2Line,
} from "react-icons/ri";
import { StatCard } from "../../../components/shared-ui/StatCard";
import { Section } from "../../../components/shared-ui/Section";
import { StatusBadge } from "../../../components/shared-ui/StatusBadge";
import { BankSelect } from "../../../components/shared-ui/BankSelect";
import { useRoleRealtime } from "../../../hooks/useRoleRealtime";
import { managerService } from "../services/manager.service";

const fmt = (v) => new Intl.NumberFormat("vi-VN").format(Number(v || 0)) + "đ";

export default function DashboardView({ user }) {
  const [dashboard, setDashboard] = useState(null);
  const [salaryAdvances, setSalaryAdvances] = useState([]);
  const [debtRepayments, setDebtRepayments] = useState([]);
  const [receiptRequests, setReceiptRequests] = useState([]);
  const [companyForm, setCompanyForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingCompany, setSavingCompany] = useState(false);
  const [actingId, setActingId] = useState(null);

  const [rejectAdvanceTarget, setRejectAdvanceTarget] = useState(null);
  const [rejectRepaymentTarget, setRejectRepaymentTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");

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

  if (loading && !dashboard) {
    return <div className="flex items-center justify-center py-32"><Spinner color="primary" label="Đang tải tổng quan..." size="lg" /></div>;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl p-6 text-white relative overflow-hidden" style={{ background: "linear-gradient(135deg, #0B1C30 0%, #1D3268 55%, #3B4FD8 100%)" }}>
        <div className="absolute -right-8 -bottom-24 w-72 h-72 rounded-full" style={{ background: "radial-gradient(circle, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 70%)" }} />
        <div className="relative flex flex-col gap-3 max-w-3xl">
          <Chip size="sm" color="secondary" variant="flat" className="w-fit">QUẢN LÝ VẬN HÀNH</Chip>
          <h2 className="text-xl font-bold">Quản lý công việc liên phòng ban trong một màn hình.</h2>
          <p className="text-sm text-white/80">
            Theo dõi các điểm nghẽn giữa tài xế, điều phối và kế toán, phê duyệt yêu cầu quan trọng và giữ thông tin công ty luôn sẵn sàng cho vận hành.
          </p>
          <div className="flex flex-wrap gap-2 mt-1">
            <Chip size="sm" className="bg-white/15 text-white">{workflow.pending_advances || 0} yêu cầu ứng lương</Chip>
            <Chip size="sm" className="bg-white/15 text-white">{workflow.pending_repayments || 0} yêu cầu nộp tiền</Chip>
            <Chip size="sm" className="bg-white/15 text-white">{(workflow.pending_receipts || 0) + (workflow.processing_receipts || 0)} phiếu thu đang chờ</Chip>
          </div>
        </div>
      </div>

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
      </div>

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
