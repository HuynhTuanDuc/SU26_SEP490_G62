import { useState, useCallback, useEffect } from "react";
import {
  Button, Chip, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader,
  Spinner, Textarea,
} from "@heroui/react";
import { RiBankCardLine, RiCheckLine, RiImageLine, RiSearchLine } from "react-icons/ri";
import { accountantService } from "../services/accountant.service";

const fmt = (v) =>
  v == null ? "—" : new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(Number(v));

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

// ── Proof image viewer ────────────────────────────────────────────────────────
function ProofImages({ urls }) {
  const [lightbox, setLightbox] = useState(null);
  if (!urls?.length) return <span className="text-gray-400 text-xs">Không có ảnh</span>;
  return (
    <>
      <div className="flex gap-2 flex-wrap">
        {urls.map((url, i) => (
          <button
            key={i}
            onClick={() => setLightbox(url)}
            className="w-16 h-16 rounded-lg overflow-hidden border border-gray-200 hover:ring-2 hover:ring-blue-400 transition-all flex-shrink-0"
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
  const [notes,       setNotes]       = useState("");
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    try {
      await accountantService.confirmBankTransfer(receipt.receipt_id, notes || undefined);
      onConfirmed();
    } catch (err) {
      setError(err.message ?? "Xác nhận thất bại");
      setLoading(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} size="lg">
      <ModalContent>
        <ModalHeader className="flex items-center gap-2">
          <RiBankCardLine className="text-blue-600" size={18} />
          Xác nhận nhận tiền chuyển khoản
        </ModalHeader>
        <ModalBody className="gap-4">
          {/* Receipt info */}
          <div className="bg-gray-50 rounded-xl p-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-gray-500 text-xs">Phiếu thu</p>
              <p className="font-semibold">#{String(receipt.receipt_id).padStart(6, "0")}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Số tiền</p>
              <p className="font-bold text-blue-600 text-base">{fmt(receipt.amount)}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Khách hàng</p>
              <p className="font-medium">{receipt.customer_name ?? "—"}</p>
              {receipt.customer_company && <p className="text-gray-400 text-xs">{receipt.customer_company}</p>}
            </div>
            <div>
              <p className="text-gray-500 text-xs">Tài xế</p>
              <p className="font-medium">{receipt.driver_name ?? "—"}</p>
              {receipt.plate_number && <p className="text-gray-400 text-xs">{receipt.plate_number}</p>}
            </div>
            <div className="col-span-2">
              <p className="text-gray-500 text-xs">Tuyến đường</p>
              <p className="text-gray-700 text-xs">{receipt.pickup_address} → {receipt.delivery_address}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Ngày driver ghi nhận</p>
              <p>{fmtDate(receipt.collected_at)}</p>
            </div>
          </div>

          {/* Proof images */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <RiImageLine className="text-gray-500" size={15} />
              <p className="text-sm font-semibold text-gray-700">Biên lai driver chụp</p>
            </div>
            <ProofImages urls={receipt.proof_urls} />
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
            <p className="text-red-500 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose} isDisabled={loading}>Hủy</Button>
          <Button
            color="success"
            onPress={handleConfirm}
            isLoading={loading}
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
          <h2 className="text-lg font-bold text-gray-800">Chuyển khoản chờ xác nhận</h2>
          <p className="text-sm text-gray-500 mt-0.5">
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
        <div className="bg-white rounded-2xl border border-gray-200 py-16 flex flex-col items-center gap-3">
          <RiBankCardLine size={40} className="text-gray-300" />
          <p className="text-gray-500 font-medium">Không có phiếu thu chờ xác nhận</p>
          <p className="text-gray-400 text-sm">Tất cả chuyển khoản đã được xác nhận</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Phiếu thu</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Khách hàng</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tài xế</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Hàng hóa</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Số tiền</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Ngày ghi</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Biên lai</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {receipts.map((r) => (
                <tr key={r.receipt_id} className="hover:bg-gray-50/60 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-gray-600">
                      #{String(r.receipt_id).padStart(6, "0")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800">{r.customer_name ?? "—"}</p>
                    {r.customer_company && <p className="text-xs text-gray-400">{r.customer_company}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800">{r.driver_name ?? "—"}</p>
                    {r.plate_number && <p className="text-xs text-gray-400">{r.plate_number}</p>}
                  </td>
                  <td className="px-4 py-3 max-w-[160px]">
                    <p className="text-gray-700 truncate">{r.cargo_name ?? "—"}</p>
                    <p className="text-xs text-gray-400 truncate">{r.pickup_address} → {r.delivery_address}</p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-bold text-blue-600">{fmt(r.amount)}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                    {fmtDate(r.collected_at)}
                  </td>
                  <td className="px-4 py-3">
                    {r.proof_urls?.length > 0 ? (
                      <div className="flex gap-1">
                        {r.proof_urls.slice(0, 2).map((url, i) => (
                          <div key={i} className="w-9 h-9 rounded-lg overflow-hidden border border-gray-200 flex-shrink-0">
                            <img src={url} alt="proof" className="w-full h-full object-cover" />
                          </div>
                        ))}
                        {r.proof_urls.length > 2 && (
                          <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center text-xs text-gray-500 font-medium flex-shrink-0">
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
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <p className="text-sm text-gray-500">
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
