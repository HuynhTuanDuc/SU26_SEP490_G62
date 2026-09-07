import { useState, useCallback, useEffect } from "react";
import {
  Button, Chip, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader,
  Spinner, Textarea,
} from "@heroui/react";
import { RiBankCardLine, RiCheckLine, RiImageLine, RiSearchLine } from "react-icons/ri";
import { accountantService } from "../services/accountant.service";
import { notify } from "../../../components/shared-ui/Toast";
import { confirmDialog } from "../../../components/shared-ui/confirm";
import { money } from "../../../utils/formatNumber";

const fmt = (v) =>
  v == null ? "—" : money(Number(v));

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

// ── Proof image viewer ────────────────────────────────────────────────────────
function ProofImages({ urls }) {
  const [lightbox, setLightbox] = useState(null);
  if (!urls?.length) return <span className="text-gray-400 dark:text-gray-400 text-xs">Không có ảnh</span>;
  return (
    <>
      <div className="flex gap-2 flex-wrap">
        {urls.map((url, i) => (
          <button
            key={i}
            onClick={() => setLightbox(url)}
            className="w-16 h-16 rounded-lg overflow-hidden border border-gray-200 dark:border-white/10 hover:ring-2 hover:ring-blue-400 transition-all shrink-0"
          >
            <img src={url} alt={`Biên lai ${i + 1}`} className="w-full h-full object-cover" />
          </button>
        ))}
      </div>
      {lightbox && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="Biên lai" className="max-w-full max-h-full rounded-xl shadow-2xl" />
        </div>
      )}
    </>
  );
}

// ── Confirm modal ─────────────────────────────────────────────────────────────
function ConfirmModal({ receipt, onClose, onConfirmed }) {
  const receiptAmt = Number(receipt.amount) || 0;
  // Mặc định bằng số trên phiếu, nhưng PHẢI cho sửa: kế toán đối chiếu sao kê, khách có thể
  // chuyển thiếu/thừa và backend dựa vào số này để ghi công nợ hoặc phân bổ phần dư.
  const [actualAmount, setActualAmount] = useState(String(receiptAmt));
  const [notes,       setNotes]       = useState("");
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);

  const actualNum   = Number(String(actualAmount).replace(/[^\d.]/g, ""));
  const amountValid = String(actualAmount).trim() !== "" && Number.isFinite(actualNum) && actualNum >= 0;
  const diff        = actualNum - receiptAmt;

  const handleConfirm = async () => {
    // Backend BẮT BUỘC actual_amount (accountantBankTransferService), thiếu là ném lỗi —
    // trước đây màn này không có ô nhập nên gửi rỗng và bấm bao nhiêu lần cũng hỏng.
    if (!amountValid) {
      const message = "Vui lòng nhập số tiền thực nhận";
      setError(message);
      notify.error(message);
      return;
    }
    if (!(await confirmDialog({
      title: "Xác nhận chuyển khoản",
      description: `Xác nhận đã nhận ${fmt(actualNum)} từ khách hàng?`,
      confirmLabel: "Xác nhận",
    }))) return;
    setLoading(true);
    setError(null);
    try {
      await accountantService.confirmBankTransfer(receipt.receipt_id, notes || undefined, actualNum);
      notify.success("Đã xác nhận chuyển khoản.");
      onConfirmed();
    } catch (err) {
      setError(err.message ?? "Xác nhận thất bại");
      notify.error(err.message ?? "Xác nhận thất bại");
      setLoading(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} size="lg">
      <ModalContent>
        <ModalHeader className="flex items-center gap-2">
          <RiBankCardLine className="text-blue-600 dark:text-blue-300" size={18} />
          Xác nhận nhận tiền chuyển khoản
        </ModalHeader>
        <ModalBody className="gap-4">
          {/* Receipt info */}
          <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-gray-500 dark:text-gray-400 text-xs">Phiếu thu</p>
              <p className="font-semibold">#{String(receipt.receipt_id).padStart(6, "0")}</p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400 text-xs">Số tiền</p>
              <p className="font-bold text-blue-600 dark:text-blue-300 text-base">{fmt(receipt.amount)}</p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400 text-xs">Khách hàng</p>
              <p className="font-medium">{receipt.customer_name ?? "—"}</p>
              {receipt.customer_company && <p className="text-gray-400 dark:text-gray-400 text-xs">{receipt.customer_company}</p>}
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400 text-xs">Tài xế</p>
              <p className="font-medium">{receipt.driver_name ?? "—"}</p>
              {receipt.plate_number && <p className="text-gray-400 dark:text-gray-400 text-xs">{receipt.plate_number}</p>}
            </div>
            <div className="col-span-2">
              <p className="text-gray-500 dark:text-gray-400 text-xs">Tuyến đường</p>
              <p className="text-gray-700 dark:text-gray-200 text-xs">{receipt.pickup_address} → {receipt.delivery_address}</p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400 text-xs">Ngày driver ghi nhận</p>
              <p>{fmtDate(receipt.collected_at)}</p>
            </div>
          </div>

          {/* Proof images */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <RiImageLine className="text-gray-500 dark:text-gray-400" size={15} />
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Biên lai driver chụp</p>
            </div>
            <ProofImages urls={receipt.proof_urls} />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5 block">
              Số tiền thực nhận được <span className="text-rose-500">*</span>
            </label>
            <input
              type="number"
              min="0"
              step="1000"
              value={actualAmount}
              onChange={(e) => { setActualAmount(e.target.value); setError(null); }}
              placeholder="Nhập số tiền đối chiếu trên sao kê"
              className="w-full rounded-lg border border-gray-200 dark:border-white/15 bg-white dark:bg-white/5
                         px-3 py-2 text-sm text-gray-800 dark:text-gray-100 outline-none
                         focus:border-blue-400 dark:focus:border-blue-400"
            />
            {amountValid && Math.abs(diff) > 0.01 && (
              <p className={`text-xs mt-1.5 font-medium ${diff < 0 ? "text-rose-600 dark:text-rose-300" : "text-blue-600 dark:text-blue-300"}`}>
                {diff < 0
                  ? `Khách chuyển thiếu ${fmt(Math.abs(diff))} — hệ thống sẽ ghi công nợ khách phần thiếu`
                  : `Khách chuyển thừa ${fmt(diff)} — hệ thống sẽ phân bổ phần thừa vào nợ cũ`}
              </p>
            )}
          </div>

          <Textarea
            label="Ghi chú (tuỳ chọn)"
            placeholder="Ví dụ: Đã kiểm tra sao kê ngân hàng ngày..."
            value={notes}
            onValueChange={setNotes}
            minRows={2}
            size="sm"
          />

          {error && (
            <p className="text-red-500 text-sm bg-red-50 dark:bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose} isDisabled={loading}>Hủy</Button>
          <Button
            color="success"
            onPress={handleConfirm}
            isLoading={loading}
            isDisabled={!amountValid}
            startContent={!loading && <RiCheckLine size={16} />}
          >
            Xác nhận đã nhận tiền
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────
export function BankTransferView({ search = "" }) {
  const [receipts,   setReceipts]   = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [page,       setPage]       = useState(1);
  const [selected,   setSelected]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await accountantService.getPendingBankTransfers({ page, limit: 20, search });
      setReceipts(data.receipts);
      setPagination(data.pagination);
    } catch {
      setReceipts([]);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [search]);

  const handleConfirmed = () => {
    setSelected(null);
    void load();
  };

  return (
    <div className="space-y-5">
      {/* Header stats */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">Chuyển khoản chờ xác nhận</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Xem biên lai driver chụp và xác nhận tiền đã về tài khoản công ty
          </p>
        </div>
        {pagination && (
          <Chip color="warning" variant="flat" size="sm">
            {pagination.total} chờ xác nhận
          </Chip>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner color="primary" /></div>
      ) : receipts.length === 0 ? (
        <div className="bg-white dark:bg-[#161922] rounded-2xl border border-gray-200 dark:border-white/10 py-16 flex flex-col items-center gap-3">
          <RiBankCardLine size={40} className="text-gray-300" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">Không có phiếu thu chờ xác nhận</p>
          <p className="text-gray-400 dark:text-gray-400 text-sm">Tất cả chuyển khoản đã được xác nhận</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-[#161922] rounded-2xl border border-gray-200 dark:border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-white/5 border-b border-gray-100 dark:border-white/10">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Phiếu thu</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Khách hàng</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tài xế</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Hàng hóa</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Số tiền</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Ngày ghi</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Biên lai</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-white/10">
              {receipts.map((r) => (
                <tr key={r.receipt_id} className="hover:bg-gray-50/60 dark:hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-gray-600 dark:text-gray-300">
                      #{String(r.receipt_id).padStart(6, "0")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800 dark:text-gray-100">{r.customer_name ?? "—"}</p>
                    {r.customer_company && <p className="text-xs text-gray-400 dark:text-gray-400">{r.customer_company}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800 dark:text-gray-100">{r.driver_name ?? "—"}</p>
                    {r.plate_number && <p className="text-xs text-gray-400 dark:text-gray-400">{r.plate_number}</p>}
                  </td>
                  <td className="px-4 py-3 max-w-[160px]">
                    <p className="text-gray-700 dark:text-gray-200 truncate">{r.cargo_name ?? "—"}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-400 truncate">{r.pickup_address} → {r.delivery_address}</p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-bold text-blue-600 dark:text-blue-300">{fmt(r.amount)}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap">
                    {fmtDate(r.collected_at)}
                  </td>
                  <td className="px-4 py-3">
                    {r.proof_urls?.length > 0 ? (
                      <div className="flex gap-1">
                        {r.proof_urls.slice(0, 2).map((url, i) => (
                          <div key={i} className="w-9 h-9 rounded-lg overflow-hidden border border-gray-200 dark:border-white/10 shrink-0">
                            <img src={url} alt="proof" className="w-full h-full object-cover" />
                          </div>
                        ))}
                        {r.proof_urls.length > 2 && (
                          <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-white/10 flex items-center justify-center text-xs text-gray-500 dark:text-gray-400 font-medium shrink-0">
                            +{r.proof_urls.length - 2}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-300 text-xs flex items-center gap-1">
                        <RiImageLine size={13} /> Không có
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      size="sm"
                      color="primary"
                      variant="flat"
                      onPress={() => setSelected(r)}
                      startContent={<RiSearchLine size={13} />}
                    >
                      Xem & Xác nhận
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-white/10">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {pagination.total} phiếu · Trang {page}/{pagination.totalPages}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="flat" isDisabled={page <= 1} onPress={() => setPage(p => p - 1)}>
                  Trước
                </Button>
                <Button size="sm" variant="flat" isDisabled={page >= pagination.totalPages} onPress={() => setPage(p => p + 1)}>
                  Sau
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {selected && (
        <ConfirmModal
          receipt={selected}
          onClose={() => setSelected(null)}
          onConfirmed={handleConfirmed}
        />
      )}
    </div>
  );
}
