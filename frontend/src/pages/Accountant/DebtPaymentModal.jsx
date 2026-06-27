import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button, Input, Checkbox, Progress, Spinner, Chip,
} from '@heroui/react';
import {
  previewDebtAllocation,
  allocateDebtPayment,
  getDebtsByPerson,
  getPaymentHistoryByPerson,
} from '../../services/debtPaymentService';
import { DebtBadge } from './components/debt/DebtBadge';

const fmt = (v) => Number(v || 0).toLocaleString('vi-VN');

const formatDate = (s) => {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const STATUS_CHIP = {
  paid:    { label: 'Đã trả',   color: 'success'  },
  partial: { label: 'Một phần', color: 'warning'  },
  unpaid:  { label: 'Chưa trả', color: 'danger'   },
};

const PAYMENT_METHODS = [
  { value: 'cash',          label: 'Tiền mặt',     icon: '💵' },
  { value: 'bank_transfer', label: 'Chuyển khoản', icon: '🏦' },
];

// ─── Payment History ──────────────────────────────────────────────────────────
function PaymentHistory({ personType, personId }) {
  const [histories, setHistories] = useState([]);
  const [loading, setLoading]     = useState(false);
  const [expanded, setExpanded]   = useState(false);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getPaymentHistoryByPerson(personType, personId);
      setHistories(data.payments || []);
    } catch {
      setHistories([]);
    } finally {
      setLoading(false);
    }
  }, [personType, personId]);

  useEffect(() => { if (expanded) fetchHistory(); }, [expanded, fetchHistory]);

  return (
    <div className="mt-2">
      <Button
        size="sm" variant="bordered" fullWidth
        onPress={() => setExpanded((v) => !v)}
        className="text-gray-500 justify-start"
      >
        🕐 Lịch sử thanh toán {histories.length > 0 && `(${histories.length})`}
        <span className="ml-auto">{expanded ? '▲' : '▼'}</span>
      </Button>

      {expanded && (
        <div className="mt-2 flex flex-col gap-2 max-h-72 overflow-auto">
          {loading ? (
            <div className="flex justify-center py-4"><Spinner size="sm" /></div>
          ) : histories.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-3">Chưa có lịch sử thanh toán</p>
          ) : histories.map((payment) => (
            <div key={payment.id} className="p-3 border border-gray-200 rounded-xl">
              <div className="flex items-center gap-3">
                <span className="flex-1 text-[13px] font-medium text-gray-500">{formatDate(payment.paid_at)}</span>
                <span className="text-sm font-bold text-green-600">{fmt(payment.total_amount || payment.totalAmount)}đ</span>
                <span>{payment.payment_method === 'cash' ? '💵' : '🏦'}</span>
              </div>
              {payment.items?.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-100 flex flex-col gap-0.5">
                  {payment.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-[12px] text-gray-400">
                      <span>Khoản nợ #{item.debtId}</span>
                      <span className="font-semibold text-green-500">{fmt(item.amount)}đ</span>
                    </div>
                  ))}
                </div>
              )}
              {payment.notes && <p className="mt-1 text-[12px] text-gray-400 italic">{payment.notes}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────
export default function DebtPaymentModal({ isOpen, onClose, person, onPaymentRecorded }) {
  const [loading, setLoading]         = useState(false);
  const [debts, setDebts]             = useState([]);
  const [preview, setPreview]         = useState(null);
  const [amount, setAmount]           = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [notes, setNotes]             = useState('');
  const [error, setError]             = useState('');
  const [selectedDebts, setSelectedDebts] = useState({});
  const [previewing, setPreviewing]   = useState(false);
  const [remainingInput, setRemainingInput] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successData, setSuccessData] = useState(null);

  useEffect(() => {
    if (isOpen && person) loadDebts();
  }, [isOpen, person]);

  const loadDebts = async () => {
    try {
      setLoading(true);
      const result = await getDebtsByPerson(person.type, person.id);
      const unpaid = (result.debts || []).filter((d) => Number(d.total_amount) - Number(d.paid_amount) > 0);
      setDebts(unpaid);
      setSelectedDebts({}); setRemainingInput(null); setPreview(null);
    } catch {
      setError('Không thể tải danh sách công nợ');
    } finally {
      setLoading(false);
    }
  };

  const doAutoAllocate = useCallback(async (numeric) => {
    if (!Number.isFinite(numeric) || numeric <= 0) { setRemainingInput(null); return; }
    try {
      setPreviewing(true); setError('');
      const result = await previewDebtAllocation(person.type, person.id, numeric);
      const nextSelected = {};
      (result.preview || []).forEach((item) => { if (item.allocateAmount > 0) nextSelected[item.debtId] = Number(item.allocateAmount); });
      setSelectedDebts(nextSelected);
      setRemainingInput(result.overpayment || 0);
    } catch (err) {
      setError(err.message || 'Không thể phân bổ thanh toán'); setRemainingInput(null);
    } finally {
      setPreviewing(false);
    }
  }, [person]);

  const allocateTimerRef = React.useRef(null);
  const handleAmountChange = (value) => {
    setAmount(value); setPreview(null);
    if (allocateTimerRef.current) clearTimeout(allocateTimerRef.current);
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0 && debts.length > 0) {
      allocateTimerRef.current = setTimeout(() => doAutoAllocate(numeric), 350);
    } else {
      setRemainingInput(null); setSelectedDebts({});
    }
  };

  const totalSelected  = Object.values(selectedDebts).reduce((s, v) => s + (Number(v) || 0), 0);
  const totalRemaining = debts.reduce((s, d) => s + (Number(d.total_amount) - Number(d.paid_amount)), 0);
  const amountInput    = Number(amount) || 0;
  const isOverInput    = amountInput > 0 && totalSelected > amountInput;

  const handleDebtToggle = (debtId) => {
    setSelectedDebts((prev) => {
      const next = { ...prev };
      if (next[debtId]) { delete next[debtId]; }
      else {
        const debt = debts.find((d) => d.id === debtId);
        if (debt) next[debtId] = Number(debt.total_amount) - Number(debt.paid_amount);
      }
      return next;
    });
    setPreview(null);
  };

  const handleDebtAmountChange = (debtId, value) => {
    const numeric = Number(value) || 0;
    setSelectedDebts((prev) => ({ ...prev, [debtId]: numeric }));
    setPreview(null);
    const newTotal = Object.entries({ ...selectedDebts, [debtId]: numeric }).reduce((s, [, v]) => s + (Number(v) || 0), 0);
    setRemainingInput(-Math.max(0, newTotal - amountInput));
  };

  const handleSubmit = async () => {
    try {
      setLoading(true); setError('');
      await allocateDebtPayment(person.type, person.id, totalSelected, paymentMethod, notes);
      const allocations = Object.entries(selectedDebts)
        .filter(([, amt]) => amt > 0)
        .map(([debtId, amt]) => {
          const debt = debts.find((d) => d.id === Number(debtId));
          return {
            debtId: Number(debtId),
            label:  debt ? `#${debt.shipment_id || debt.id} - ${debt.order_cargo_name || 'Chuyến'}` : `#${debtId}`,
            amount: amt,
            newStatus: amt >= (debt ? Number(debt.total_amount) - Number(debt.paid_amount) : 0) - 0.01 ? 'paid' : 'partial',
          };
        });
      setSuccessData({ totalAmount: totalSelected, allocations, paymentMethod });
      setShowConfirm(false); setShowSuccess(true);
    } catch (err) {
      setError(err.message || 'Ghi nhận thu tiền thất bại'); setShowConfirm(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSuccessClose = () => { setShowSuccess(false); onPaymentRecorded?.(); onClose(); };
  const openConfirm = () => {
    if (totalSelected <= 0) { setError('Vui lòng chọn ít nhất một khoản nợ'); return; }
    setShowConfirm(true);
  };

  return (
    <>
      {/* ── Main modal ── */}
      <Modal
        isOpen={isOpen && !showConfirm && !showSuccess}
        onClose={onClose}
        size="2xl"
        scrollBehavior="inside"
        classNames={{ header: "border-b border-gray-100 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-t-xl", footer: "border-t border-gray-100" }}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex gap-3 items-center">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-white text-lg">💰</div>
                <div>
                  <p className="text-base font-extrabold">Thu tiền {person?.type === 'customer' ? 'khách hàng' : 'tài xế'}</p>
                  <p className="text-[12px] opacity-80 font-normal mt-0.5">Ghi nhận thanh toán công nợ</p>
                </div>
              </ModalHeader>

              <ModalBody className="py-4 flex flex-col gap-4">
                {/* Person summary */}
                <div className="flex justify-between items-center p-4 bg-gray-50 rounded-2xl border border-gray-200">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-white text-sm font-bold">
                      {person?.type === 'customer' ? '🏢' : '🚗'}
                    </div>
                    <div>
                      <p className="font-bold text-gray-800 text-sm">{person?.name}</p>
                      {person?.phone && <p className="text-[12px] text-gray-400">📞 {person.phone}</p>}
                    </div>
                  </div>
                  <div className="flex gap-5 text-right">
                    <div>
                      <p className="text-[11px] text-gray-400 font-bold uppercase">Tổng nợ</p>
                      <p className="text-base font-extrabold text-gray-800">{fmt(totalRemaining)}đ</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-gray-400 font-bold uppercase">Đã chọn</p>
                      <p className={`text-base font-extrabold ${isOverInput ? 'text-danger' : 'text-success'}`}>{fmt(totalSelected)}đ</p>
                    </div>
                  </div>
                </div>

                {/* Auto-allocate */}
                {debts.length > 0 && (
                  <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200 flex flex-col gap-3">
                    <div className="flex items-end gap-2 flex-wrap">
                      <Input
                        size="sm" variant="bordered" type="number"
                        label="Số tiền muốn thu" placeholder="Nhập tổng số tiền..."
                        value={amount} onValueChange={handleAmountChange}
                        endContent={<span className="text-gray-400 text-sm">đ</span>}
                        isInvalid={amountInput > totalRemaining}
                        className="flex-1 min-w-[180px]"
                      />
                      <Button
                        size="sm" color="primary" variant="flat"
                        isLoading={previewing}
                        isDisabled={previewing || !amountInput || amountInput <= 0}
                        onPress={() => doAutoAllocate(amountInput)}
                      >Tự động phân bổ</Button>
                      <Button size="sm" variant="bordered" isDisabled={previewing}
                        onPress={() => { setSelectedDebts({}); setRemainingInput(null); }}
                      >Xóa chọn</Button>
                    </div>

                    {error && <p className="text-danger text-sm font-semibold">{error}</p>}

                    {remainingInput !== null && (
                      <Chip
                        color={remainingInput > 0 ? 'warning' : 'danger'}
                        variant="flat" size="sm"
                      >
                        {remainingInput > 0
                          ? `Còn dư: ${fmt(remainingInput)}đ chưa phân bổ`
                          : `Vượt quá ${fmt(Math.abs(remainingInput))}đ so với số tiền nhập`}
                      </Chip>
                    )}
                  </div>
                )}

                {/* Debt list */}
                {loading && debts.length === 0 ? (
                  <div className="flex justify-center py-10"><Spinner color="primary" label="Đang tải..." /></div>
                ) : debts.length === 0 ? (
                  <div className="text-center py-10">
                    <p className="text-4xl mb-3">🎉</p>
                    <p className="font-bold text-gray-700">Không có công nợ nào</p>
                    <p className="text-gray-400 text-sm">Tất cả khoản nợ đã được thanh toán!</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Danh sách khoản nợ</p>
                    {debts.map((debt) => {
                      const debtRemaining = Number(debt.total_amount) - Number(debt.paid_amount);
                      const isSelected    = selectedDebts[debt.id] > 0;
                      const statusKey     = debtRemaining <= 0 ? 'paid' : Number(debt.paid_amount) > 0 ? 'partial' : 'unpaid';
                      const pct           = Math.min((Number(debt.paid_amount) / Number(debt.total_amount)) * 100, 100);
                      const chipCfg       = STATUS_CHIP[statusKey];

                      return (
                        <div key={debt.id} className={`p-4 rounded-2xl border-2 transition-all ${isSelected ? 'border-success bg-success-50/30' : 'border-gray-200 bg-white'}`}>
                          <div className="flex items-center gap-3 mb-3">
                            <Checkbox
                              isSelected={isSelected}
                              onValueChange={() => handleDebtToggle(debt.id)}
                              isDisabled={statusKey === 'paid'}
                              color="success"
                            />
                            <div className="flex-1">
                              <p className="text-sm font-bold text-gray-800">#{debt.shipment_id || debt.id} - {debt.order_cargo_name || 'Chuyến xe'}</p>
                              <p className="text-[12px] text-gray-400">
                                {debt.order_id && `Đơn #${debt.order_id}`}
                                {debt.shipment_id && ` · Chuyến #${debt.shipment_id}`}
                              </p>
                            </div>
                            <Chip size="sm" color={chipCfg.color} variant="flat" className="text-[11px] h-5">{chipCfg.label}</Chip>
                          </div>

                          <div className="flex gap-5 mb-3">
                            {[['Tổng nợ', debt.total_amount, ''], ['Đã trả', debt.paid_amount, 'text-success'], ['Còn nợ', debtRemaining, 'text-danger']].map(([lbl, val, cls]) => (
                              <div key={lbl}>
                                <p className="text-[11px] text-gray-400 font-bold uppercase">{lbl}</p>
                                <p className={`text-sm font-bold ${cls || 'text-gray-800'}`}>{fmt(val)}đ</p>
                              </div>
                            ))}
                          </div>

                          {isSelected && statusKey !== 'paid' && (
                            <Input
                              size="sm" variant="bordered" type="number"
                              label="Số tiền thanh toán"
                              placeholder={`Tối đa ${fmt(debtRemaining)}`}
                              value={String(selectedDebts[debt.id] || '')}
                              onValueChange={(v) => handleDebtAmountChange(debt.id, v)}
                              endContent={<span className="text-gray-400 text-sm">đ</span>}
                              isInvalid={(selectedDebts[debt.id] || 0) > debtRemaining}
                              className="mb-2"
                            />
                          )}

                          <Progress
                            value={pct} color="success" size="sm"
                            className="w-full" aria-label="Tiến độ thanh toán"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Payment info */}
                {debts.length > 0 && (
                  <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200 flex flex-col gap-3">
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Thông tin thanh toán</p>

                    <div className="flex gap-2">
                      {PAYMENT_METHODS.map((m) => (
                        <Button
                          key={m.value} size="sm" fullWidth
                          variant={paymentMethod === m.value ? 'solid' : 'bordered'}
                          color={paymentMethod === m.value ? 'success' : 'default'}
                          onPress={() => setPaymentMethod(m.value)}
                          startContent={<span>{m.icon}</span>}
                        >{m.label}</Button>
                      ))}
                    </div>

                    <Input
                      size="sm" variant="bordered"
                      label="Ghi chú (không bắt buộc)"
                      placeholder="Nhập ghi chú..."
                      value={notes} onValueChange={setNotes}
                    />

                    {/* Summary */}
                    <div className="p-3 bg-white border-2 border-success-400 rounded-xl flex flex-col gap-1">
                      {[
                        ['Tổng số tiền', <span key="t" className={`text-xl font-extrabold ${isOverInput ? 'text-danger' : 'text-success'}`}>{fmt(totalSelected)}đ</span>],
                        ['Số khoản nợ', `${Object.values(selectedDebts).filter((v) => v > 0).length} khoản`],
                        ...(amountInput > 0 ? [['Tổng muốn thu', `${fmt(amountInput)}đ`]] : []),
                      ].map(([lbl, val]) => (
                        <div key={lbl} className="flex justify-between items-center text-sm text-gray-500">
                          <span>{lbl}</span><span className="font-semibold">{val}</span>
                        </div>
                      ))}
                    </div>

                    {error && !amount && <p className="text-danger text-sm font-semibold">{error}</p>}

                    <PaymentHistory personType={person?.type} personId={person?.id} />
                  </div>
                )}
              </ModalBody>

              <ModalFooter>
                <Button variant="bordered" onPress={onClose}>Đóng</Button>
                {debts.length > 0 && (
                  <>
                    <Button variant="bordered" color="primary" isDisabled={loading || totalSelected <= 0}
                      onPress={async () => {
                        if (totalSelected <= 0) return;
                        try {
                          setLoading(true);
                          const result = await previewDebtAllocation(person.type, person.id, totalSelected);
                          setPreview(result);
                        } catch (err) {
                          setError(err.message || 'Không thể xem trước');
                        } finally {
                          setLoading(false);
                        }
                      }}
                    >Xem trước phân bổ</Button>
                    <Button color="success" isDisabled={loading || totalSelected <= 0} onPress={openConfirm}>
                      Xác nhận thu tiền
                    </Button>
                  </>
                )}
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* ── Preview modal ── */}
      <Modal isOpen={!!preview} onClose={() => setPreview(null)} size="md">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Phân bổ thanh toán</ModalHeader>
              <ModalBody className="flex flex-col gap-3">
                {preview?.preview?.map((item, i) => (
                  <div key={i} className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-800">#{item.debtId} - {item.orderCargoName || 'Khoản nợ'}</span>
                      <Chip size="sm" color={STATUS_CHIP[item.newStatus]?.color || 'default'} variant="flat" className="text-[11px] h-5">
                        {STATUS_CHIP[item.newStatus]?.label || item.newStatus}
                      </Chip>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-extrabold text-success">+{fmt(item.allocateAmount)}đ</p>
                      <p className="text-[11px] text-gray-400">Còn: {fmt(item.remaining - item.allocateAmount)}đ</p>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between items-center p-3 bg-success-50 rounded-xl text-success font-semibold">
                  <span>Tổng phân bổ:</span>
                  <span className="text-xl font-extrabold">{fmt(preview?.totalAllocated)}đ</span>
                </div>
                {preview?.overpayment > 0 && (
                  <Chip color="warning" variant="flat" size="sm">Số tiền dư: {fmt(preview.overpayment)}đ</Chip>
                )}
              </ModalBody>
              <ModalFooter>
                <Button fullWidth variant="bordered" onPress={onClose}>Đóng</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* ── Confirm modal ── */}
      <Modal isOpen={showConfirm} onClose={() => setShowConfirm(false)} size="sm">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col items-center gap-2 pt-6">
                <span className="text-4xl">⚠️</span>
                <span className="text-base font-extrabold">Xác nhận thu tiền</span>
              </ModalHeader>
              <ModalBody className="flex flex-col gap-1">
                {[
                  ['Người thanh toán', person?.name],
                  ['Tổng số tiền', <span key="a" className="text-lg font-extrabold text-success">{fmt(totalSelected)}đ</span>],
                  ['Hình thức', paymentMethod === 'cash' ? '💵 Tiền mặt' : '🏦 Chuyển khoản'],
                  ['Số khoản nợ', `${Object.values(selectedDebts).filter((v) => v > 0).length} khoản`],
                  ...(notes ? [['Ghi chú', notes]] : []),
                ].map(([lbl, val]) => (
                  <div key={lbl} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0 text-sm">
                    <span className="text-gray-400">{lbl}</span>
                    <span className="font-semibold text-gray-800">{val}</span>
                  </div>
                ))}
                <p className="text-[12px] text-gray-400 text-center mt-2">Hành động này không thể hoàn tác.</p>
              </ModalBody>
              <ModalFooter>
                <Button variant="bordered" onPress={onClose} isDisabled={loading}>Hủy bỏ</Button>
                <Button color="success" onPress={handleSubmit} isLoading={loading}>Xác nhận thu tiền</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* ── Success modal ── */}
      <Modal isOpen={showSuccess} onClose={handleSuccessClose} size="md" isDismissable={false}>
        <ModalContent>
          {() => (
            <>
              <ModalHeader className="flex flex-col items-center gap-2 pt-6">
                <span className="text-5xl">✅</span>
                <span className="text-lg font-extrabold text-gray-800">Thu tiền thành công!</span>
                <span className="text-3xl font-black text-success">{fmt(successData?.totalAmount)}đ</span>
              </ModalHeader>
              <ModalBody className="flex flex-col gap-2">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Chi tiết phân bổ:</p>
                {successData?.allocations?.map((item, i) => (
                  <div key={i} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-800">{item.label}</span>
                      <Chip size="sm" color={STATUS_CHIP[item.newStatus]?.color || 'default'} variant="flat" className="text-[11px] h-5">
                        {STATUS_CHIP[item.newStatus]?.label}
                      </Chip>
                    </div>
                    <span className="text-sm font-extrabold text-success">+{fmt(item.amount)}đ</span>
                  </div>
                ))}
              </ModalBody>
              <ModalFooter>
                <Button color="success" fullWidth onPress={handleSuccessClose}>Đóng</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}
