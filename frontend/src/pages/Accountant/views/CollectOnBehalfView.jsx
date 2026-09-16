import { useState, useCallback, useEffect } from "react";
import {
  Button, Chip, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader,
  Select, SelectItem, Spinner, Textarea,
} from "@heroui/react";
import { RiHandHeartLine, RiInformationLine, RiSearchLine } from "react-icons/ri";
import { accountantService } from "../services/accountant.service";
import { notify } from "../../../components/shared-ui/Toast";
import { money } from "../../../utils/formatNumber";

const fmt = (v) => money(v ?? 0);

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

/**
 * Lập phiếu chi trả tiền thu hộ cho người bán.
 *
 * Số tiền để sẵn phần chưa lập phiếu và cho sửa: trả một phần là chuyện có thật (người bán
 * xin nhận trước một nửa), nhưng mặc định phải là trả hết để thao tác thường gặp nhất
 * không phải gõ lại con số.
 */
function ReturnModal({ item, onClose, onDone }) {
  const [amount, setAmount] = useState(String(Math.round(Number(item.chua_lap_phieu))));
  const [payee, setPayee] = useState(item.nguoi_ban || "");
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const res = await accountantService.createCollectOnBehalfReturn(item.order_id, {
        amount: amount.trim() || undefined,
        payee: payee.trim() || undefined,
        notes: notes.trim() || undefined,
        paymentMethod,
      });
      notify.success(res?.message || "Đã lập phiếu chi trả tiền thu hộ.");
      onDone?.();
      onClose();
    } catch (err) {
      notify.error(err.message || "Không lập được phiếu chi.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} size="lg">
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <span className="text-base font-bold text-gray-900 dark:text-gray-100">
            Trả tiền thu hộ cho người bán
          </span>
          <span className="text-xs font-normal text-gray-400 dark:text-gray-400">
            Đơn #{item.order_id} · {item.nguoi_ban || "Chưa có tên"} · đang giữ {fmt(item.con_giu)}
          </span>
        </ModalHeader>
        <ModalBody>
          <div className="flex gap-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-white/5 p-3 rounded-lg">
            <RiInformationLine size={14} className="shrink-0 mt-0.5" />
            <span>
              Đây là tiền của người bán, không phải chi phí của công ty — nó không vào báo
              cáo lãi lỗ. Phiếu tạo ra đã duyệt sẵn; vào <b>Quản lý chi</b> bấm “Đã chi” và
              đính chứng từ thì khoản nợ mới đóng lại trên sổ.
            </span>
          </div>
          <Input
            label="Số tiền trả"
            description="Bỏ trống là trả hết phần còn lại."
            value={amount}
            onValueChange={setAmount}
            inputMode="numeric"
            startContent={<span className="text-xs text-gray-400">đ</span>}
          />
          <Input label="Người nhận" value={payee} onValueChange={setPayee} />
          <Select
            label="Hình thức chi"
            selectedKeys={[paymentMethod]}
            onSelectionChange={(k) => setPaymentMethod([...k][0])}
          >
            <SelectItem key="bank_transfer">Chuyển khoản</SelectItem>
            <SelectItem key="cash">Tiền mặt</SelectItem>
          </Select>
          <Textarea label="Ghi chú" value={notes} onValueChange={setNotes} minRows={2} />
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose} isDisabled={saving}>Đóng</Button>
          <Button color="primary" onPress={submit} isLoading={saving}>Lập phiếu chi</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export default function CollectOnBehalfView() {
  const [rows, setRows] = useState([]);
  const [tong, setTong] = useState(0);
  const [tongChuaLapPhieu, setTongChuaLapPhieu] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState(null);

  const load = useCallback(async (q) => {
    setLoading(true);
    try {
      const data = await accountantService.getCollectOnBehalf(q ? { search: q } : {});
      setRows(data.rows ?? []);
      setTong(Number(data.tong ?? 0));
      setTongChuaLapPhieu(Number(data.tongChuaLapPhieu ?? 0));
    } catch (err) {
      notify.error(err.message || "Không tải được danh sách thu hộ.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-col gap-5">
      {/* Hai con số trả lời hai câu khác nhau, nên đứng cạnh nhau chứ không gộp:
          "công ty đang nợ bao nhiêu" (chỉ giảm khi tiền RA thật) và
          "còn bao nhiêu chưa ai đụng tới" (đã trừ phiếu đang chờ chi). */}
      <div className="rounded-2xl border border-amber-100 dark:border-amber-500/20 bg-amber-50/60 dark:bg-amber-500/10 p-5 flex flex-wrap items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center shrink-0">
          <RiHandHeartLine size={20} className="text-amber-600 dark:text-amber-300" />
        </div>
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-xs font-medium uppercase tracking-wide text-amber-700/70 dark:text-amber-300/70">
            Công ty đang nợ người bán
          </span>
          <span className="text-2xl font-bold text-amber-700 dark:text-amber-300">{fmt(tong)}</span>
        </div>
        <div className="flex flex-col gap-0.5 min-w-0 pl-4 border-l border-amber-200 dark:border-amber-500/20">
          <span className="text-xs font-medium uppercase tracking-wide text-amber-700/70 dark:text-amber-300/70">
            Chưa lập phiếu chi
          </span>
          <span className="text-2xl font-bold text-amber-700 dark:text-amber-300">{fmt(tongChuaLapPhieu)}</span>
        </div>
        <div className="ml-auto hidden lg:flex items-start gap-2 max-w-sm text-xs text-amber-800/80 dark:text-amber-200/70">
          <RiInformationLine size={15} className="shrink-0 mt-0.5" />
          <span>
            Tiền hàng công ty thu hộ khi giao (COD). Đây là tiền <b>của người bán</b>, không
            phải doanh thu và không cấn vào công nợ cước. Số trên sổ là dư Có tài khoản 3388.
          </span>
        </div>
      </div>

      <Input
        placeholder="Tìm theo tên người bán, số điện thoại hoặc mã đơn"
        value={search}
        onValueChange={(v) => { setSearch(v); load(v); }}
        startContent={<RiSearchLine size={16} className="text-gray-400" />}
        className="max-w-md"
        isClearable
        onClear={() => { setSearch(""); load(); }}
      />

      <div className="bg-white dark:bg-[#161922] rounded-2xl border border-gray-100 dark:border-white/10 shadow-sm overflow-x-auto">
        {loading ? (
          <div className="flex justify-center py-16"><Spinner color="primary" label="Đang tải..." /></div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400 dark:text-gray-400">
            Không còn khoản thu hộ nào phải trả — công ty không giữ tiền của ai.
          </div>
        ) : (
          <table className="w-full text-left min-w-[860px]">
            <thead className="bg-gray-50/70 dark:bg-white/5 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-400">
              <tr>
                <th className="py-3 px-4">Đơn</th>
                <th className="py-3 px-4">Người bán</th>
                <th className="py-3 px-4 text-right">Đang giữ</th>
                <th className="py-3 px-4 text-right">Đã lập phiếu</th>
                <th className="py-3 px-4 text-right">Chưa lập phiếu</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {rows.map((r) => {
                const chuaLap = Number(r.chua_lap_phieu);
                const dangCho = Number(r.dang_cho_chi);
                return (
                  <tr key={r.order_id} className="border-t border-gray-50 dark:border-white/5">
                    <td className="py-3 px-4">
                      <div className="flex flex-col">
                        <span className="font-semibold text-gray-800 dark:text-gray-100">#{r.order_id}</span>
                        <span className="text-[11px] text-gray-400 dark:text-gray-400">
                          {r.cargo_name || "—"} · {fmtDate(r.created_at)}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-col">
                        <span className="text-gray-700 dark:text-gray-200">{r.nguoi_ban || "—"}</span>
                        <span className="text-[11px] text-gray-400 dark:text-gray-400">{r.nguoi_ban_phone || ""}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-amber-600 dark:text-amber-400">
                      {fmt(r.con_giu)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {dangCho > 0
                        ? <Chip size="sm" variant="flat" color="primary">{fmt(dangCho)}</Chip>
                        : <span className="text-gray-300 dark:text-gray-600">—</span>}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-gray-800 dark:text-gray-100">
                      {fmt(chuaLap)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button
                        size="sm" color="primary" variant="flat"
                        isDisabled={chuaLap <= 0}
                        onPress={() => setTarget(r)}
                      >
                        {chuaLap > 0 ? "Trả người bán" : "Đã lập phiếu"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {target && (
        <ReturnModal item={target} onClose={() => setTarget(null)} onDone={() => load(search)} />
      )}
    </div>
  );
}
