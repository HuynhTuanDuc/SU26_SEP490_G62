import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Spinner, Chip } from "@heroui/react";
import { RiInformationLine } from "react-icons/ri";
import { money } from "../../../utils/formatNumber";

const fmt = (v) => money(v ?? 0);

const DEBT_STATUS_LABEL = { paid: "Đã thu đủ", partial: "Thu một phần", unpaid: "Chưa thu", overdue: "Quá hạn" };
const DEBT_STATUS_COLOR = { paid: "success", partial: "warning", unpaid: "danger", overdue: "danger" };

// Chỉ theo dõi — Manager không ghi nhận thanh toán, việc đó thuộc về Kế toán.
export default function PartnerDebtModal({ open, partner, debts, loading, onClose }) {
  if (!partner) return null;

  const totalAmount = debts.reduce((sum, d) => sum + Number(d.total_amount || 0), 0);
  const totalRemaining = debts.reduce((sum, d) => sum + Number(d.remaining || 0), 0);

  return (
    <Modal isOpen={open} onOpenChange={(isOpen) => !isOpen && onClose()} size="4xl" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader>Công nợ đối tác: {partner.company_name}</ModalHeader>
        <ModalBody>
          {loading ? (
            <div className="flex justify-center py-10"><Spinner color="primary" /></div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-xs text-gray-400 dark:text-gray-400 block">Tên viết tắt</span><strong>{partner.short_name || "Chưa cập nhật"}</strong></div>
                <div><span className="text-xs text-gray-400 dark:text-gray-400 block">Người liên hệ</span><strong>{partner.contact_person || "Chưa cập nhật"}</strong></div>
                <div><span className="text-xs text-gray-400 dark:text-gray-400 block">Số điện thoại</span><strong>{partner.phone || "Chưa cập nhật"}</strong></div>
                <div><span className="text-xs text-gray-400 dark:text-gray-400 block">Email</span><strong>{partner.email || "Chưa cập nhật"}</strong></div>
                <div><span className="text-xs text-gray-400 dark:text-gray-400 block">Mã số thuế</span><strong>{partner.tax_code || "Chưa cập nhật"}</strong></div>
                <div><span className="text-xs text-gray-400 dark:text-gray-400 block">Hạn thanh toán</span><strong>{partner.payment_term_days ? `${partner.payment_term_days} ngày` : "Chưa cập nhật"}</strong></div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-gray-100 dark:border-white/10 p-3 text-center">
                  <div className="text-xs text-gray-400 dark:text-gray-400">Số khoản nợ</div>
                  <div className="text-lg font-bold text-gray-800 dark:text-gray-100">{debts.length}</div>
                </div>
                <div className="rounded-xl border border-gray-100 dark:border-white/10 p-3 text-center">
                  <div className="text-xs text-gray-400 dark:text-gray-400">Tổng nợ</div>
                  <div className="text-lg font-bold text-gray-800 dark:text-gray-100">{fmt(totalAmount)}</div>
                </div>
                <div className="rounded-xl border border-gray-100 dark:border-white/10 p-3 text-center">
                  <div className="text-xs text-gray-400 dark:text-gray-400">Còn lại</div>
                  <div className="text-lg font-bold text-rose-600 dark:text-rose-300">{fmt(totalRemaining)}</div>
                </div>
              </div>

              {debts.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-400 text-center py-8">Đối tác này hiện không có công nợ.</p>
              ) : (
                <div className="flex flex-col divide-y divide-gray-50 dark:divide-white/10">
                  {debts.map((d) => (
                    <div key={d.id} className="flex items-center justify-between py-3 gap-4">
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">Đơn #{d.order_id || "-"} · Chuyến #{d.shipment_id || "-"}</span>
                        <span className="text-xs text-gray-400 dark:text-gray-400">{d.customer_company || d.customer_name || "Không có"} · {d.cargo_name || "Không có hàng hóa"}</span>
                      </div>
                      <div className="flex items-center gap-4 shrink-0 text-right">
                        <div><div className="text-[10px] text-gray-400 dark:text-gray-400">Tổng nợ</div><div className="text-sm font-semibold">{fmt(d.total_amount)}</div></div>
                        <div><div className="text-[10px] text-gray-400 dark:text-gray-400">Đã thu</div><div className="text-sm font-semibold text-emerald-600 dark:text-emerald-300">{fmt(d.paid_amount)}</div></div>
                        <div><div className="text-[10px] text-gray-400 dark:text-gray-400">Còn lại</div><div className="text-sm font-bold text-rose-600 dark:text-rose-300">{fmt(d.remaining)}</div></div>
                        <Chip size="sm" variant="flat" color={DEBT_STATUS_COLOR[d.status] || "default"}>{DEBT_STATUS_LABEL[d.status] || d.status}</Chip>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {totalRemaining > 0.01 && (
                <div className="rounded-xl border border-amber-100 dark:border-amber-500/20 bg-amber-50/50 dark:bg-amber-500/10 p-4 flex items-start gap-2">
                  <RiInformationLine size={16} className="text-amber-600 dark:text-amber-300 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800 dark:text-amber-200">
                    Đối tác còn nợ {fmt(totalRemaining)}. Việc thu tiền do Kế toán ghi nhận ở màn Công nợ —
                    tab Đối tác. Số liệu ở đây sẽ tự cập nhật ngay khi kế toán ghi nhận xong.
                  </p>
                </div>
              )}
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={onClose}>Đóng</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
