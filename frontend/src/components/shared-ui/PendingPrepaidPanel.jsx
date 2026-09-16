import { useCallback, useEffect, useState } from "react";
import { RiTimeLine } from "react-icons/ri";
import { PrepaidConfirmModal } from "./PrepaidConfirmModal";
import { money } from "../../utils/formatNumber";

const fmt = (n) => money(n ?? 0);

/**
 * Banner "Chờ xác nhận tiền trả trước" — dùng chung cho Điều phối và Kế toán.
 * api: { listPendingPrepaid(), confirmPrepaid(orderId, formData), rejectPrepaid(orderId) }
 * Tự ẩn khi không có đơn nào đang chờ.
 */
export function PendingPrepaidPanel({ api, onChanged }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.listPendingPrepaid()
      .then((data) => setOrders(data.orders || []))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, [api]);

  useEffect(() => { load(); }, [load]);

  if (loading) return null;
  if (orders.length === 0) return null;

  return (
    <div className="rounded-2xl border border-amber-200 dark:border-amber-500/25 bg-amber-50/50 dark:bg-amber-500/10 p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <RiTimeLine size={16} className="text-amber-500" />
        <span className="text-sm font-bold text-amber-700 dark:text-amber-300">
          Chờ xác nhận tiền trả trước ({orders.length})
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {orders.map((o) => (
          <button
            key={o.id}
            onClick={() => setTarget({ id: o.id, prepaidAmount: o.prepaid_amount, customerName: o.customer_name })}
            className="flex items-center justify-between gap-3 bg-white dark:bg-[#161922] rounded-xl border border-amber-100 dark:border-amber-500/20 px-4 py-3 text-left hover:ring-2 hover:ring-amber-300 dark:hover:ring-amber-500/40 transition-all"
          >
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
                Đơn #{o.id} — {o.customer_name || "Khách lẻ"}
              </span>
              <span className="text-[11px] text-gray-400 dark:text-gray-400">{o.cargo_name || ""}</span>
            </div>
            <span className="text-sm font-bold text-amber-600 dark:text-amber-300 shrink-0">{fmt(o.prepaid_amount)}</span>
          </button>
        ))}
      </div>

      <PrepaidConfirmModal
        order={target}
        api={api}
        onClose={() => setTarget(null)}
        onDone={() => { load(); onChanged?.(); }}
      />
    </div>
  );
}

export default PendingPrepaidPanel;
