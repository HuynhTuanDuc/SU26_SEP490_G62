import { useState, useCallback, useEffect } from "react";
import {
  Button, Chip, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader,
  Select, SelectItem, Spinner, Textarea,
} from "@heroui/react";
import { RiHandCoinLine, RiCheckLine, RiInformationLine, RiArrowGoBackLine } from "react-icons/ri";
import { accountantService } from "../services/accountant.service";
import { reversalRequestService } from "../../../services/reversalRequest.service";
import { notify } from "../../../components/shared-ui/Toast";
import { money } from "../../../utils/formatNumber";

const fmt = (v) =>
  v == null ? "—" : money(Number(v));

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

// Kế toán KHÔNG có quyền gỡ duyệt chi phí — route đó chỉ mở cho Điều phối. Nên khi phát
// hiện một khoản đã duyệt sai số tiền ngay lúc sắp chi, trước đây kế toán không có
// đường nào ngoài việc nhắn tay cho điều phối. Nút này gửi một yêu cầu hoàn tác để
// Manager quyết — có lý do, có người duyệt, có vết.
function RequestUnapproveModal({ item, onClose, onDone }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await reversalRequestService.create({
        kind: "expense.approve",
        entityId: item.expense_id,
        reason: reason.trim(),
      });
      notify.success("Đã gửi yêu cầu — Manager sẽ duyệt ở màn Yêu cầu hoàn tác.");
      onDone?.();
      onClose();
    } catch (err) {
      notify.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} size="lg">
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <span className="text-base font-bold text-gray-900 dark:text-gray-100">Xin gỡ duyệt khoản chi</span>
          <span className="text-xs font-normal text-gray-400 dark:text-gray-400">
            {item.driver_name || `Tài xế #${item.driver_id}`} · {fmt(item.amount)}
          </span>
        </ModalHeader>
        <ModalBody>
          <div className="flex gap-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-white/5 p-3 rounded-lg">
            <RiInformationLine size={14} className="shrink-0 mt-0.5" />
            <span>
              Khoản đã duyệt chỉ Điều phối mới gỡ được. Yêu cầu này gửi cho Manager
              duyệt; duyệt xong hệ thống tự đưa khoản về trạng thái chờ để tài xế khai lại.
            </span>
          </div>
          <Textarea
            isRequired
            label="Vì sao cần gỡ duyệt"
            placeholder="Ví dụ: hoá đơn ghi 50.000 nhưng khoản khai 500.000"
            value={reason}
            onValueChange={setReason}
            minRows={2}
          />
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose} isDisabled={saving}>Đóng</Button>
          <Button color="warning" onPress={submit} isLoading={saving} isDisabled={!reason.trim()}>
            Gửi yêu cầu
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

// Chi hộ khách (toll/parking/etc) khác chi phí công ty chịu: khoản chi hộ chi ra rồi còn
// đòi lại được khách, nên kế toán cần nhìn thấy khác biệt này ngay trên danh sách.
const EXPENSE_META = {
  toll:        { label: "Phí cầu đường", passThrough: true },
  parking:     { label: "Phí đỗ xe",     passThrough: true },
  etc:         { label: "Phí ETC",       passThrough: true },
  fuel:        { label: "Xăng dầu",      passThrough: false },
  repair:      { label: "Sửa xe",        passThrough: false },
  maintenance: { label: "Bảo dưỡng xe",  passThrough: false },
};

function ReceiptThumbs({ urls }) {
  const [lightbox, setLightbox] = useState(null);
  if (!urls?.length) {
    return <span className="text-xs text-gray-400 dark:text-gray-400">Không có ảnh</span>;
  }
  return (
    <>
      <div className="flex gap-1.5 flex-wrap">
        {urls.map((url, i) => (
          <button
            key={i}
            onClick={() => setLightbox(url)}
            className="w-11 h-11 rounded-lg overflow-hidden border border-gray-200 dark:border-white/10 hover:ring-2 hover:ring-blue-400 transition-all shrink-0"
          >
            <img src={url} alt={`Chứng từ ${i + 1}`} className="w-full h-full object-cover" />
          </button>
        ))}
      </div>
      {lightbox && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Chứng từ" className="max-w-full max-h-full rounded-xl shadow-2xl" />
        </div>
      )}
    </>
  );
}

export default function ReimbursementView() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [target, setTarget] = useState(null);
  const [unapproveTarget, setUnapproveTarget] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await accountantService.getPendingReimbursements();
      setItems(data.items ?? []);
      setTotal(Number(data.total ?? 0));
    } catch (err) {
      notify.error(err.message || "Không tải được danh sách khoản chờ hoàn.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openModal = (item) => {
    setTarget(item);
    setPaymentMethod("cash");
    setNotes("");
  };

  const submit = async () => {
    if (!target) return;
    setSubmitting(true);
    try {
      const res = await accountantService.createReimbursementVoucher({
        expense_id: target.expense_id,
        payment_method: paymentMethod,
        notes: notes.trim() || undefined,
      });
      setTarget(null);
      await load();
      notify.success(res?.message || "Đã tạo phiếu hoàn ứng, chờ Manager duyệt.");
    } catch (err) {
      notify.error(err.message || "Không tạo được phiếu hoàn ứng.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border border-teal-100 dark:border-teal-500/20 bg-teal-50/60 dark:bg-teal-500/10 p-5 flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-teal-100 dark:bg-teal-500/20 flex items-center justify-center shrink-0">
          <RiHandCoinLine size={20} className="text-teal-600 dark:text-teal-300" />
        </div>
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-xs font-medium uppercase tracking-wide text-teal-700/70 dark:text-teal-300/70">
            Tổng đang chờ hoàn
          </span>
          <span className="text-2xl font-bold text-teal-700 dark:text-teal-300">{fmt(total)}</span>
        </div>
        <div className="ml-auto hidden md:flex items-start gap-2 max-w-md text-xs text-teal-800/80 dark:text-teal-200/70">
          <RiInformationLine size={15} className="shrink-0 mt-0.5" />
          <span>
            Lập phiếu ở đây để trả tài ngay, không phải đợi kỳ lương. Phiếu vẫn cần Manager
            duyệt rồi mới chi được ở màn Quản lý chi. Khoản đã lập phiếu sẽ tự động bị loại
            khỏi bảng lương nên không bao giờ chi trùng.
          </span>
        </div>
      </div>

      <div className="bg-white dark:bg-[#161922] rounded-2xl border border-gray-100 dark:border-white/10 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Spinner color="primary" label="Đang tải..." /></div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400 dark:text-gray-400">
            Không có khoản nào đang chờ hoàn cho tài xế.
          </div>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-gray-50/70 dark:bg-white/5 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-400">
              <tr>
                <th className="py-3 pl-5 pr-4">Tài xế</th>
                <th className="py-3 pr-4">Khoản chi</th>
                <th className="py-3 pr-4">Ngày chi</th>
                <th className="py-3 pr-4">Chứng từ</th>
                <th className="py-3 pr-4 text-right">Số tiền</th>
                <th className="py-3 pr-5"> </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const meta = EXPENSE_META[item.expense_type] ?? { label: item.expense_type, passThrough: false };
                return (
                  <tr key={item.expense_id} className="border-t border-gray-100 dark:border-white/10">
                    <td className="py-3.5 pl-5 pr-4">
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
                          {item.driver_name || `Tài xế #${item.driver_id}`}
                        </span>
                        {item.driver_phone && (
                          <span className="text-xs font-mono text-gray-400 dark:text-gray-400">{item.driver_phone}</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 pr-4">
                      <div className="flex flex-col gap-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm text-gray-700 dark:text-gray-200">{meta.label}</span>
                          <Chip size="sm" variant="flat" color={meta.passThrough ? "warning" : "default"} className="text-[10px]">
                            {meta.passThrough ? "Chi hộ khách" : "Công ty chịu"}
                          </Chip>
                        </div>
                        <span className="text-xs text-gray-400 dark:text-gray-400 truncate">
                          {[item.description, item.plate_number && `xe ${item.plate_number}`, item.order_id && `đơn #${item.order_id}`]
                            .filter(Boolean).join(" · ") || "—"}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 pr-4 text-xs text-gray-500 dark:text-gray-400">{fmtDate(item.expense_date)}</td>
                    <td className="py-3.5 pr-4"><ReceiptThumbs urls={item.receipt_urls} /></td>
                    <td className="py-3.5 pr-4 text-right tabular-nums text-sm font-bold text-gray-800 dark:text-gray-100">
                      {fmt(item.amount)}
                    </td>
                    <td className="py-3.5 pr-5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button size="sm" variant="light" className="h-8 px-2.5 text-xs gap-1.5 text-amber-600 dark:text-amber-300"
                          onPress={() => setUnapproveTarget(item)}>
                          <RiArrowGoBackLine size={14} />
                          <span>Xin gỡ duyệt</span>
                        </Button>
                        <Button size="sm" variant="flat" color="primary" className="h-8 px-3 text-xs gap-1.5"
                          onPress={() => openModal(item)}>
                          <RiCheckLine size={15} />
                          <span>Lập phiếu hoàn</span>
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {unapproveTarget && (
        <RequestUnapproveModal
          item={unapproveTarget}
          onClose={() => setUnapproveTarget(null)}
          onDone={load}
        />
      )}

      <Modal isOpen={Boolean(target)} onOpenChange={(open) => !open && setTarget(null)} size="lg">
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            <span className="text-base font-bold text-gray-900 dark:text-gray-100">Lập phiếu hoàn ứng</span>
            <span className="text-xs font-normal text-gray-400 dark:text-gray-400">
              Phiếu sẽ ở trạng thái chờ Manager duyệt, sau đó chi ở màn Quản lý chi
            </span>
          </ModalHeader>
          <ModalBody className="gap-4">
            {target && (
              <>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-xs text-gray-400 dark:text-gray-400 block">Trả cho</span>
                    <strong>{target.driver_name || `Tài xế #${target.driver_id}`}</strong>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400 dark:text-gray-400 block">Số tiền hoàn</span>
                    <strong className="text-teal-600 dark:text-teal-300">{fmt(target.amount)}</strong>
                  </div>
                  <div className="col-span-2">
                    <span className="text-xs text-gray-400 dark:text-gray-400 block">Khoản chi</span>
                    <strong>{(EXPENSE_META[target.expense_type] ?? {}).label || target.expense_type}</strong>
                    {target.description ? <span className="text-gray-500 dark:text-gray-400"> — {target.description}</span> : null}
                  </div>
                </div>

                <Select
                  label="Hình thức chi" variant="bordered" size="sm"
                  selectedKeys={[paymentMethod]}
                  onSelectionChange={(keys) => setPaymentMethod([...keys][0])}
                >
                  <SelectItem key="cash">Tiền mặt</SelectItem>
                  <SelectItem key="bank_transfer">Chuyển khoản</SelectItem>
                </Select>

                <Textarea
                  label="Ghi chú (tuỳ chọn)" variant="bordered" size="sm" minRows={2}
                  value={notes} onValueChange={setNotes}
                  placeholder="VD: tài xế đề nghị nhận ngay trong ngày"
                />
              </>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setTarget(null)} isDisabled={submitting}>Đóng</Button>
            <Button color="primary" onPress={submit} isLoading={submitting}>Tạo phiếu chờ duyệt</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
