import React, { useState, useEffect, useCallback } from 'react';
import {
  previewDebtAllocation,
  allocateDebtPayment,
  getDebtsByPerson,
  getPaymentHistoryByPerson,
} from '../../services/debtPaymentService';

// Utility functions
const formatCurrency = (value) => {
  const num = Number(value || 0);
  return num.toLocaleString('vi-VN');
};

const formatDate = (dateString) => {
  if (!dateString) return '—';
  const date = new Date(dateString);
  return date.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Status configuration
const STATUS_CONFIG = {
  paid: { label: 'Đã trả', color: '#10b981', bg: '#ecfdf5', border: '#a7f3d0' },
  partial: { label: 'Một phần', color: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
  unpaid: { label: 'Chưa trả', color: '#ef4444', bg: '#fef2f2', border: '#fecaca' },
};

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Tiền mặt', icon: '💵' },
  { value: 'bank_transfer', label: 'Chuyển khoản', icon: '🏦' },
];

// Icons
const Icons = {
  Close: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  ),
  Check: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  ),
  Money: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v12M8 10h8M8 14h8" />
    </svg>
  ),
  History: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  ),
  User: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
    </svg>
  ),
  Phone: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
    </svg>
  ),
  ChevronDown: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 9l6 6 6-6" />
    </svg>
  ),
  ChevronUp: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 15l-6-6-6 6" />
    </svg>
  ),
  Warning: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </svg>
  ),
  Success: () => (
    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10" />
      <path d="M8 12l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Loading: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
    </svg>
  ),
};

// Badge Component
function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.unpaid;
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '4px 10px',
      borderRadius: '999px',
      fontSize: '11px',
      fontWeight: 700,
      color: config.color,
      background: config.bg,
      border: `1px solid ${config.border}`,
    }}>
      {config.label}
    </span>
  );
}

// Confirmation Modal
function ConfirmationModal({ isOpen, onConfirm, onCancel, loading, data }) {
  if (!isOpen) return null;

  return (
    <div style={styles.confirmOverlay} onClick={onCancel}>
      <div style={styles.confirmCard} onClick={(e) => e.stopPropagation()}>
        <div style={styles.confirmIcon}>
          <Icons.Warning />
        </div>
        <h3 style={styles.confirmTitle}>Xác nhận thu tiền</h3>

        <div style={styles.confirmDetails}>
          <div style={styles.confirmRow}>
            <span style={styles.confirmLabel}>Người thanh toán:</span>
            <span style={styles.confirmValue}>{data?.personName}</span>
          </div>
          <div style={styles.confirmRow}>
            <span style={styles.confirmLabel}>Tổng số tiền:</span>
            <span style={{ ...styles.confirmValue, color: '#10b981', fontSize: '18px' }}>
              {formatCurrency(data?.totalAmount)}đ
            </span>
          </div>
          <div style={styles.confirmRow}>
            <span style={styles.confirmLabel}>Hình thức:</span>
            <span style={styles.confirmValue}>
              {data?.paymentMethod === 'cash' ? '💵 Tiền mặt' : '🏦 Chuyển khoản'}
            </span>
          </div>
          <div style={styles.confirmRow}>
            <span style={styles.confirmLabel}>Số khoản nợ:</span>
            <span style={styles.confirmValue}>{data?.itemCount} khoản</span>
          </div>
          {data?.notes && (
            <div style={styles.confirmRow}>
              <span style={styles.confirmLabel}>Ghi chú:</span>
              <span style={styles.confirmValue}>{data.notes}</span>
            </div>
          )}
        </div>

        <p style={styles.confirmWarning}>
          Hành động này không thể hoàn tác. Bạn có chắc chắn muốn ghi nhận thu tiền?
        </p>

        <div style={styles.confirmActions}>
          <button style={styles.confirmCancelBtn} onClick={onCancel} disabled={loading}>
            Hủy bỏ
          </button>
          <button style={styles.confirmSubmitBtn} onClick={onConfirm} disabled={loading}>
            {loading ? (
              <>
                <Icons.Loading /> Đang xử lý...
              </>
            ) : (
              <>
                <Icons.Check /> Xác nhận thu tiền
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Success Screen
function SuccessScreen({ data, onClose }) {
  return (
    <div style={styles.successOverlay}>
      <div style={styles.successCard}>
        <div style={styles.successIcon}>
          <Icons.Success />
        </div>
        <h2 style={styles.successTitle}>Thu tiền thành công!</h2>

        <div style={styles.successAmount}>
          {formatCurrency(data?.totalAmount)}đ
        </div>

        <div style={styles.successDetails}>
          <h4 style={styles.successDetailsTitle}>Chi tiết phân bổ:</h4>
          {data?.allocations?.map((item, index) => (
            <div key={index} style={styles.successAllocationItem}>
              <div style={styles.successAllocationLeft}>
                <span style={styles.successAllocationDebt}>
                  {item.label || `Khoản nợ #${item.debtId}`}
                </span>
                <StatusBadge status={item.newStatus} />
              </div>
              <span style={styles.successAllocationAmount}>
                +{formatCurrency(item.amount)}đ
              </span>
            </div>
          ))}
        </div>

        <button style={styles.successCloseBtn} onClick={onClose}>
          Đóng
        </button>
      </div>
    </div>
  );
}

// Payment History Section
function PaymentHistory({ personType, personId, apiBase, token }) {
  const [histories, setHistories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getPaymentHistoryByPerson(personType, personId);
      setHistories(data.payments || []);
    } catch (err) {
      console.error('Error fetching payment history:', err);
      setHistories([]);
    } finally {
      setLoading(false);
    }
  }, [personType, personId]);

  useEffect(() => {
    if (expanded) {
      fetchHistory();
    }
  }, [expanded, fetchHistory]);

  if (histories.length === 0 && !expanded) {
    return (
      <button style={styles.historyToggleBtn} onClick={() => setExpanded(true)}>
        <Icons.History />
        Xem lịch sử thanh toán
      </button>
    );
  }

  return (
    <div style={styles.historySection}>
      <button style={styles.historyToggleBtn} onClick={() => setExpanded(!expanded)}>
        <Icons.History />
        Lịch sử thanh toán ({histories.length})
        {expanded ? <Icons.ChevronUp /> : <Icons.ChevronDown />}
      </button>

      {expanded && (
        <div style={styles.historyContent}>
          {loading ? (
            <div style={styles.historyLoading}>Đang tải lịch sử...</div>
          ) : histories.length === 0 ? (
            <div style={styles.historyEmpty}>Chưa có lịch sử thanh toán</div>
          ) : (
            histories.map((payment) => (
              <div key={payment.id} style={styles.historyItem}>
                <div style={styles.historyItemHeader}>
                  <div style={styles.historyItemDate}>
                    {formatDate(payment.paid_at)}
                  </div>
                  <div style={styles.historyItemAmount}>
                    {formatCurrency(payment.total_amount || payment.totalAmount)}đ
                  </div>
                  <span style={styles.historyItemMethod}>
                    {payment.payment_method === 'cash' ? '💵' : '🏦'}
                  </span>
                </div>
                {payment.items && payment.items.length > 0 && (
                  <div style={styles.historyItemDetails}>
                    {payment.items.map((item, idx) => (
                      <div key={idx} style={styles.historyDetailRow}>
                        <span>Khoản nợ #{item.debtId}</span>
                        <span style={styles.historyDetailAmount}>
                          {formatCurrency(item.amount)}đ
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {payment.notes && (
                  <div style={styles.historyItemNotes}>{payment.notes}</div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Main Component
export default function DebtPaymentModal({
  isOpen,
  onClose,
  person,
  onPaymentRecorded,
  apiBase,
  token,
}) {
  const [loading, setLoading] = useState(false);
  const [debts, setDebts] = useState([]);
  const [preview, setPreview] = useState(null);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  // Selected debts for payment (key = debtId, value = số tiền sẽ trừ cho khoản đó)
  const [selectedDebts, setSelectedDebts] = useState({});

  // Preview phân bổ tự động (FIFO) theo input amount
  const [previewing, setPreviewing] = useState(false);

  // Còn dư sau khi tự động phân bổ theo input amount (tiêu thụ vào các khoản nợ)
  const [remainingInput, setRemainingInput] = useState(null);

  // Confirmation & Success states
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successData, setSuccessData] = useState(null);

  // Load debts when modal opens
  useEffect(() => {
    if (isOpen && person) {
      loadDebts();
    }
  }, [isOpen, person]);

  const loadDebts = async () => {
    try {
      setLoading(true);
      const result = await getDebtsByPerson(person.type, person.id);
      const debtList = result.debts || [];

      const unpaidDebts = debtList.filter(d => {
        const remaining = Number(d.total_amount || 0) - Number(d.paid_amount || 0);
        return remaining > 0;
      });

      setDebts(unpaidDebts);
      setSelectedDebts({});
      setRemainingInput(null);
      setPreview(null);
    } catch (err) {
      console.error('Error loading debts:', err);
      setError('Không thể tải danh sách công nợ');
    } finally {
      setLoading(false);
    }
  };

  // Gọi preview phân bổ (FIFO) theo số tiền người dùng nhập vào ô tổng
  const doAutoAllocate = useCallback(async (inputAmount) => {
    const numeric = Number(inputAmount);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setRemainingInput(null);
      return;
    }

    try {
      setPreviewing(true);
      setError('');
      const result = await previewDebtAllocation(person.type, person.id, numeric);

      // Dựa theo FIFO, backend trả về mảng preview theo thứ tự cũ -> mới
      const nextSelected = {};
      (result.preview || []).forEach((item) => {
        if (item.allocateAmount > 0) {
          nextSelected[item.debtId] = Number(item.allocateAmount);
        }
      });

      setSelectedDebts(nextSelected);
      setRemainingInput(result.overpayment || 0);
    } catch (err) {
      console.error('Error auto allocating:', err);
      setError(err.message || 'Không thể phân bổ thanh toán');
      setRemainingInput(null);
    } finally {
      setPreviewing(false);
    }
  }, [person]);

  // Khi người dùng bấm "Tự động phân bổ" (hoặc auto-run lần đầu khi đã có input)
  const handleAutoAllocate = () => {
    const numeric = Number(amount);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setError('Vui lòng nhập số tiền hợp lệ để phân bổ');
      return;
    }
    doAutoAllocate(numeric);
  };

  // Debounce gọi auto-allocate khi người dùng gõ trong ô tổng số tiền
  const allocateTimerRef = React.useRef(null);
  const handleAmountInputChange = (value) => {
    setAmount(value);
    setPreview(null);
    if (allocateTimerRef.current) clearTimeout(allocateTimerRef.current);
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0 && debts.length > 0) {
      allocateTimerRef.current = setTimeout(() => doAutoAllocate(numeric), 350);
    } else {
      setRemainingInput(null);
      setSelectedDebts({});
    }
  };

  // Calculate total selected amount
  const totalSelected = Object.entries(selectedDebts).reduce((sum, [debtId, selectedAmount]) => {
    return sum + (Number(selectedAmount) || 0);
  }, 0);

  // Handle debt selection toggle
  const handleDebtToggle = (debtId) => {
    setSelectedDebts(prev => {
      const newSelected = { ...prev };
      if (newSelected[debtId]) {
        delete newSelected[debtId];
      } else {
        const debt = debts.find(d => d.id === debtId);
        if (debt) {
          const remaining = Number(debt.total_amount || 0) - Number(debt.paid_amount || 0);
          newSelected[debtId] = remaining;
        }
      }
      return newSelected;
    });
    setPreview(null);
  };

  // Handle amount change for specific debt (sau khi auto xong vẫn cho sửa)
  const handleAmountChange = (debtId, value) => {
    const numeric = Number(value) || 0;
    setSelectedDebts(prev => ({ ...prev, [debtId]: numeric }));
    setPreview(null);

    // Tính lại remainingInput theo số tiền đã chọn so với input tổng ban đầu
    const inputTotal = Number(amount) || 0;
    const newTotalSelected = Object.entries({ ...selectedDebts, [debtId]: numeric })
      .reduce((sum, [, v]) => sum + (Number(v) || 0), 0);
    const over = Math.max(0, newTotalSelected - inputTotal);
    setRemainingInput(-over); // âm => dùng vượt input
  };

  // Calculate total remaining debt
  const totalRemaining = debts.reduce((sum, debt) => {
    const remaining = Number(debt.total_amount || 0) - Number(debt.paid_amount || 0);
    return sum + remaining;
  }, 0);

  // Preview allocation
  const handlePreview = async () => {
    if (totalSelected <= 0) {
      setError('Vui lòng chọn ít nhất một khoản nợ để thanh toán');
      return;
    }

    try {
      setLoading(true);
      setError('');
      const result = await previewDebtAllocation(person.type, person.id, totalSelected);
      setPreview(result);
    } catch (err) {
      console.error('Error previewing:', err);
      setError(err.message || 'Không thể xem trước phân bổ');
      setPreview(null);
    } finally {
      setLoading(false);
    }
  };

  // Open confirmation
  const handleOpenConfirm = () => {
    if (totalSelected <= 0) {
      setError('Vui lòng chọn ít nhất một khoản nợ để thanh toán');
      return;
    }
    setShowConfirm(true);
  };

  // Submit payment
  const handleSubmit = async () => {
    try {
      setLoading(true);
      setError('');

      const result = await allocateDebtPayment(
        person.type,
        person.id,
        totalSelected,
        paymentMethod,
        notes
      );

      // Prepare success data
      const allocations = [];
      Object.entries(selectedDebts).forEach(([debtId, amount]) => {
        if (amount > 0) {
          const debt = debts.find(d => d.id === Number(debtId));
          allocations.push({
            debtId: Number(debtId),
            label: debt ? `#${debt.shipment_id || debt.id} - ${debt.order_cargo_name || 'Chuyến'}` : `#${debtId}`,
            amount: amount,
            newStatus: amount >= (debt ? Number(debt.total_amount) - Number(debt.paid_amount) : 0) - 0.01 ? 'paid' : 'partial',
          });
        }
      });

      setSuccessData({
        totalAmount: totalSelected,
        allocations,
        paymentMethod,
      });

      setShowConfirm(false);
      setShowSuccess(true);

    } catch (err) {
      console.error('Error recording payment:', err);
      setError(err.message || 'Ghi nhận thu tiền thất bại');
      setShowConfirm(false);
    } finally {
      setLoading(false);
    }
  };

  // Handle success close
  const handleSuccessClose = () => {
    setShowSuccess(false);
    onPaymentRecorded?.();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div style={styles.backdrop} onClick={onClose} />

      {/* Main Modal */}
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerContent}>
            <div style={styles.headerIcon}>
              <Icons.Money />
            </div>
            <div>
              <h2 style={styles.title}>
                Thu tiền {person.type === 'customer' ? 'khách hàng' : 'tài xế'}
              </h2>
              <p style={styles.subtitle}>Ghi nhận thanh toán công nợ</p>
            </div>
          </div>
          <button style={styles.closeBtn} onClick={onClose}>
            <Icons.Close />
          </button>
        </div>

        {/* Body */}
        <div style={styles.body}>
          {/* Person Info Card */}
          <div style={styles.personCard}>
            <div style={styles.personInfo}>
              <div style={styles.personAvatar}>
                <Icons.User />
              </div>
              <div style={styles.personDetails}>
                <h3 style={styles.personName}>{person.name}</h3>
                {person.phone && (
                  <div style={styles.personPhone}>
                    <Icons.Phone />
                    {person.phone}
                  </div>
                )}
              </div>
            </div>
            <div style={styles.debtSummary}>
              <div style={styles.debtSummaryItem}>
                <span style={styles.debtSummaryLabel}>Tổng nợ</span>
                <span style={styles.debtSummaryValue}>{formatCurrency(totalRemaining)}đ</span>
              </div>
              <div style={styles.debtSummaryItem}>
                <span style={styles.debtSummaryLabel}>Đã chọn</span>
                <span style={{
                  ...styles.debtSummaryValue,
                  color:
                    (Number(amount) || 0) > 0 && totalSelected > (Number(amount) || 0)
                      ? '#ef4444'
                      : '#10b981',
                }}>
                  {formatCurrency(totalSelected)}đ
                </span>
              </div>
            </div>
          </div>

          {debts.length > 0 && (
            <div style={{ ...styles.paymentForm, marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 220px' }}>
                  <label style={styles.formLabel}>Số tiền muốn thu</label>
                  <div style={styles.paymentInputWrapper}>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => handleAmountInputChange(e.target.value)}
                      placeholder="Nhập số tiền cần thu..."
                      min="0"
                      max={totalRemaining}
                      style={{
                        ...styles.paymentInput,
                        borderColor:
                          (Number(amount) || 0) > totalRemaining
                            ? '#ef4444'
                            : undefined,
                      }}
                    />
                    <span style={styles.paymentInputSuffix}>đ</span>
                  </div>
                </div>
                <div style={{ paddingTop: '22px', display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    style={{
                      ...styles.paymentMethodBtn,
                      ...(amount ? styles.paymentMethodBtnActive : {}),
                    }}
                    onClick={handleAutoAllocate}
                    disabled={previewing || !Number(amount) || Number(amount) <= 0}
                  >
                    {previewing ? 'Đang phân bổ...' : 'Tự động phân bổ'}
                  </button>
                  <button
                    type="button"
                    style={styles.previewBtn}
                    onClick={() => {
                      setSelectedDebts({});
                      setRemainingInput(null);
                    }}
                    disabled={previewing}
                  >
                    Xóa chọn
                  </button>
                </div>
              </div>

              {error && (
                <div style={{ ...styles.errorBox, marginTop: '12px' }}>
                  <Icons.Warning />
                  {error}
                </div>
              )}

              {(remainingInput || remainingInput === 0) && (
                <div style={{
                  marginTop: '10px',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: 700,
                  background: remainingInput > 0 ? '#fffbeb' : '#fef2f2',
                  color: remainingInput > 0 ? '#d97706' : '#dc2626',
                  border: `1px solid ${remainingInput > 0 ? '#fde68a' : '#fecaca'}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}>
                  {remainingInput > 0
                    ? `Còn dư: ${formatCurrency(remainingInput)}đ (chưa phân bổ vào khoản nợ nào)`
                    : `Đã dùng vượt ${formatCurrency(Math.abs(remainingInput))}đ so với số tiền nhập — vui lòng giảm các khoản đã chọn`}
                </div>
              )}
            </div>
          )}

          {/* Debts List */}
          {loading && debts.length === 0 ? (
            <div style={styles.loadingState}>
              <Icons.Loading />
              <span>Đang tải danh sách công nợ...</span>
            </div>
          ) : debts.length === 0 ? (
            <div style={styles.emptyState}>
              <div style={styles.emptyIcon}>🎉</div>
              <h4>Không có công nợ nào</h4>
              <p>Tất cả các khoản nợ đã được thanh toán!</p>
            </div>
          ) : (
            <div style={styles.debtsSection}>
              <h4 style={styles.sectionTitle}>Danh sách khoản nợ</h4>
              <div style={styles.debtsList}>
                {debts.map((debt) => {
                  const debtRemaining = Number(debt.total_amount || 0) - Number(debt.paid_amount || 0);
                  const isSelected = selectedDebts[debt.id] > 0;
                  const status = debtRemaining <= 0 ? 'paid' :
                    Number(debt.paid_amount) > 0 ? 'partial' : 'unpaid';

                  return (
                    <div
                      key={debt.id}
                      style={{
                        ...styles.debtItem,
                        ...(isSelected ? styles.debtItemSelected : {}),
                      }}
                    >
                      <div style={styles.debtItemHeader}>
                        <label style={styles.debtCheckbox}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleDebtToggle(debt.id)}
                            disabled={status === 'paid'}
                          />
                          <span style={styles.debtCheckboxCustom}>
                            {isSelected && <Icons.Check />}
                          </span>
                        </label>
                        <div style={styles.debtInfo}>
                          <div style={styles.debtTitle}>
                            #{debt.shipment_id || debt.id} - {debt.order_cargo_name || 'Chuyến xe'}
                          </div>
                          <div style={styles.debtMeta}>
                            {debt.order_id && <span>Đơn #{debt.order_id}</span>}
                            {debt.shipment_id && <span>Chuyến #{debt.shipment_id}</span>}
                          </div>
                        </div>
                        <StatusBadge status={status} />
                      </div>

                      <div style={styles.debtAmounts}>
                        <div style={styles.debtAmountItem}>
                          <span style={styles.debtAmountLabel}>Tổng nợ</span>
                          <span style={styles.debtAmountValue}>
                            {formatCurrency(debt.total_amount)}đ
                          </span>
                        </div>
                        <div style={styles.debtAmountItem}>
                          <span style={styles.debtAmountLabel}>Đã trả</span>
                          <span style={{ ...styles.debtAmountValue, color: '#10b981' }}>
                            {formatCurrency(debt.paid_amount)}đ
                          </span>
                        </div>
                        <div style={styles.debtAmountItem}>
                          <span style={styles.debtAmountLabel}>Còn nợ</span>
                          <span style={{ ...styles.debtAmountValue, color: '#ef4444' }}>
                            {formatCurrency(debtRemaining)}đ
                          </span>
                        </div>
                      </div>

                      {isSelected && status !== 'paid' && (
                        <div style={styles.debtPaymentInput}>
                          <label style={styles.paymentInputLabel}>Số tiền thanh toán:</label>
                          <div style={styles.paymentInputWrapper}>
                            <input
                              type="number"
                              value={selectedDebts[debt.id] || ''}
                              onChange={(e) => handleAmountChange(debt.id, e.target.value)}
                              placeholder={`Tối đa ${formatCurrency(debtRemaining)}`}
                              min="0"
                              max={debtRemaining}
                              style={{
                                ...styles.paymentInput,
                                borderColor:
                                  (selectedDebts[debt.id] || 0) > debtRemaining
                                    ? '#ef4444'
                                    : undefined,
                              }}
                            />
                            <span style={styles.paymentInputSuffix}>đ</span>
                          </div>
                        </div>
                      )}

                      {/* Progress bar */}
                      <div style={styles.progressBar}>
                        <div
                          style={{
                            ...styles.progressFill,
                            width: `${Math.min((Number(debt.paid_amount) / Number(debt.total_amount)) * 100, 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Payment Form */}
          {debts.length > 0 && (
            <div style={styles.paymentForm}>
              <h4 style={styles.sectionTitle}>Thông tin thanh toán</h4>

              {/* Payment Method */}
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Hình thức thanh toán</label>
                <div style={styles.paymentMethods}>
                  {PAYMENT_METHODS.map((method) => (
                    <button
                      key={method.value}
                      type="button"
                      style={{
                        ...styles.paymentMethodBtn,
                        ...(paymentMethod === method.value ? styles.paymentMethodBtnActive : {}),
                      }}
                      onClick={() => setPaymentMethod(method.value)}
                    >
                      <span style={styles.paymentMethodIcon}>{method.icon}</span>
                      {method.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Ghi chú (không bắt buộc)</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Nhập ghi chú cho lần thanh toán này..."
                  style={styles.formInput}
                />
              </div>

              {/* Summary */}
              <div style={styles.summaryCard}>
                <div style={styles.summaryRow}>
                  <span>Tổng số tiền</span>
                  <span style={{
                    ...styles.summaryTotal,
                    color:
                      totalSelected > (Number(amount) || 0) && Number(amount) > 0
                        ? '#ef4444'
                        : '#10b981',
                  }}>{formatCurrency(totalSelected)}đ</span>
                </div>
                <div style={styles.summaryRow}>
                  <span>Số khoản nợ</span>
                  <span>{Object.keys(selectedDebts).filter(id => selectedDebts[id] > 0).length} khoản</span>
                </div>
                {Number(amount) > 0 && (
                  <div style={{
                    ...styles.summaryRow,
                    color: totalSelected > (Number(amount) || 0) ? '#dc2626' : '#059669',
                    fontWeight: 700,
                  }}>
                    <span>Tổng muốn thu</span>
                    <span>{formatCurrency(Number(amount))}đ</span>
                  </div>
                )}
              </div>

              {/* Error */}
              {error && (
                <div style={styles.errorBox}>
                  <Icons.Warning />
                  {error}
                </div>
              )}

              {/* Payment History */}
              <PaymentHistory
                personType={person.type}
                personId={person.id}
                apiBase={apiBase}
                token={token}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <button style={styles.cancelBtn} onClick={onClose}>
            Đóng
          </button>
          {debts.length > 0 && (
            <div style={styles.footerActions}>
              <button
                style={styles.previewBtn}
                onClick={handlePreview}
                disabled={loading || totalSelected <= 0}
              >
                Xem trước phân bổ
              </button>
              <button
                style={styles.submitBtn}
                onClick={handleOpenConfirm}
                disabled={loading || totalSelected <= 0}
              >
                {loading ? <Icons.Loading /> : <Icons.Check />}
                Xác nhận thu tiền
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Preview Overlay */}
      {preview && (
        <div style={styles.previewOverlay}>
          <div style={styles.previewCard}>
            <h3 style={styles.previewTitle}>Phân bổ thanh toán</h3>
            <div style={styles.previewList}>
              {preview.preview?.map((item, index) => (
                <div key={index} style={styles.previewItem}>
                  <div style={styles.previewItemInfo}>
                    <span style={styles.previewItemLabel}>
                      #{item.debtId} - {item.orderCargoName || 'Khoản nợ'}
                    </span>
                    <StatusBadge status={item.newStatus} />
                  </div>
                  <div style={styles.previewItemAmounts}>
                    <span style={styles.previewItemAmount}>
                      +{formatCurrency(item.allocateAmount)}đ
                    </span>
                    <span style={styles.previewItemRemaining}>
                      Còn lại: {formatCurrency(item.remaining - item.allocateAmount)}đ
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div style={styles.previewSummary}>
              <span>Tổng phân bổ:</span>
              <span style={styles.previewTotal}>
                {formatCurrency(preview.totalAllocated)}đ
              </span>
            </div>
            {preview.overpayment > 0 && (
              <div style={styles.previewWarning}>
                Số tiền dư: {formatCurrency(preview.overpayment)}đ
              </div>
            )}
            <button style={styles.previewCloseBtn} onClick={() => setPreview(null)}>
              Đóng
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={showConfirm}
        onConfirm={handleSubmit}
        onCancel={() => setShowConfirm(false)}
        loading={loading}
        data={{
          personName: person.name,
          totalAmount: totalSelected,
          paymentMethod,
          itemCount: Object.keys(selectedDebts).filter(id => selectedDebts[id] > 0).length,
          notes,
        }}
      />

      {/* Success Screen */}
      {showSuccess && (
        <SuccessScreen data={successData} onClose={handleSuccessClose} />
      )}
    </>
  );
}

// Styles
const styles = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.6)',
    backdropFilter: 'blur(4px)',
    zIndex: 1000,
  },
  modal: {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: 'min(680px, calc(100vw - 40px))',
    maxHeight: 'calc(100vh - 80px)',
    background: '#ffffff',
    borderRadius: '20px',
    boxShadow: '0 25px 80px rgba(15, 23, 42, 0.35)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    zIndex: 1001,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 24px',
    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    color: '#fff',
  },
  headerContent: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
  },
  headerIcon: {
    width: '48px',
    height: '48px',
    background: 'rgba(255, 255, 255, 0.2)',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 800,
  },
  subtitle: {
    margin: '4px 0 0',
    fontSize: '13px',
    opacity: 0.85,
  },
  closeBtn: {
    width: '36px',
    height: '36px',
    background: 'rgba(255, 255, 255, 0.2)',
    border: 'none',
    borderRadius: '10px',
    color: '#fff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.2s',
  },
  body: {
    flex: 1,
    overflow: 'auto',
    padding: '20px 24px',
  },
  personCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
    borderRadius: '16px',
    border: '1px solid #e2e8f0',
    marginBottom: '20px',
  },
  personInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
  },
  personAvatar: {
    width: '48px',
    height: '48px',
    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
  },
  personDetails: {},
  personName: {
    margin: 0,
    fontSize: '17px',
    fontWeight: 800,
    color: '#0f172a',
  },
  personPhone: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginTop: '4px',
    fontSize: '13px',
    color: '#64748b',
  },
  debtSummary: {
    display: 'flex',
    gap: '24px',
  },
  debtSummaryItem: {
    textAlign: 'right',
  },
  debtSummaryLabel: {
    display: 'block',
    fontSize: '11px',
    color: '#64748b',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  debtSummaryValue: {
    display: 'block',
    fontSize: '18px',
    fontWeight: 800,
    color: '#0f172a',
  },
  loadingState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    padding: '60px 20px',
    color: '#64748b',
  },
  emptyState: {
    textAlign: 'center',
    padding: '60px 20px',
  },
  emptyIcon: {
    fontSize: '48px',
    marginBottom: '16px',
  },
  emptyStateTitle: {
    margin: '0 0 8px',
    fontSize: '18px',
    fontWeight: 700,
    color: '#0f172a',
  },
  emptyStateText: {
    margin: 0,
    color: '#64748b',
  },
  debtsSection: {
    marginBottom: '24px',
  },
  sectionTitle: {
    margin: '0 0 12px',
    fontSize: '14px',
    fontWeight: 700,
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  debtsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  debtItem: {
    padding: '16px',
    background: '#fff',
    border: '2px solid #e2e8f0',
    borderRadius: '14px',
    transition: 'all 0.2s',
  },
  debtItemSelected: {
    borderColor: '#10b981',
    background: '#f0fdf4',
  },
  debtItemHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '12px',
  },
  debtCheckbox: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
  },
  debtCheckboxCustom: {
    width: '22px',
    height: '22px',
    border: '2px solid #cbd5e1',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  },
  debtInfo: {
    flex: 1,
  },
  debtTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#0f172a',
  },
  debtMeta: {
    display: 'flex',
    gap: '12px',
    marginTop: '4px',
    fontSize: '12px',
    color: '#64748b',
  },
  debtAmounts: {
    display: 'flex',
    gap: '20px',
    marginBottom: '12px',
  },
  debtAmountItem: {},
  debtAmountLabel: {
    display: 'block',
    fontSize: '11px',
    color: '#64748b',
    fontWeight: 600,
    textTransform: 'uppercase',
  },
  debtAmountValue: {
    display: 'block',
    fontSize: '14px',
    fontWeight: 700,
    color: '#0f172a',
  },
  debtPaymentInput: {
    marginBottom: '12px',
  },
  paymentInputLabel: {
    display: 'block',
    fontSize: '12px',
    fontWeight: 600,
    color: '#475569',
    marginBottom: '6px',
  },
  paymentInputWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  paymentInput: {
    width: '100%',
    padding: '10px 40px 10px 14px',
    border: '2px solid #e2e8f0',
    borderRadius: '10px',
    fontSize: '15px',
    fontWeight: 600,
    color: '#0f172a',
    outline: 'none',
  },
  paymentInputSuffix: {
    position: 'absolute',
    right: '14px',
    color: '#64748b',
    fontSize: '14px',
    fontWeight: 600,
  },
  progressBar: {
    height: '4px',
    background: '#e2e8f0',
    borderRadius: '2px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #10b981 0%, #34d399 100%)',
    borderRadius: '2px',
    transition: 'width 0.3s ease',
  },
  paymentForm: {
    padding: '20px',
    background: '#f8fafc',
    borderRadius: '16px',
    border: '1px solid #e2e8f0',
  },
  formGroup: {
    marginBottom: '16px',
  },
  formLabel: {
    display: 'block',
    fontSize: '13px',
    fontWeight: 700,
    color: '#475569',
    marginBottom: '8px',
  },
  paymentMethods: {
    display: 'flex',
    gap: '10px',
  },
  paymentMethodBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '12px 16px',
    background: '#fff',
    border: '2px solid #e2e8f0',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#475569',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  paymentMethodBtnActive: {
    borderColor: '#10b981',
    background: '#f0fdf4',
    color: '#059669',
  },
  paymentMethodIcon: {
    fontSize: '18px',
  },
  formInput: {
    width: '100%',
    padding: '12px 14px',
    border: '2px solid #e2e8f0',
    borderRadius: '10px',
    fontSize: '14px',
    color: '#0f172a',
    outline: 'none',
    boxSizing: 'border-box',
  },
  summaryCard: {
    padding: '16px',
    background: '#fff',
    border: '2px solid #10b981',
    borderRadius: '12px',
    marginBottom: '16px',
  },
  summaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 0',
    fontSize: '14px',
    color: '#475569',
  },
  summaryTotal: {
    fontSize: '24px',
    fontWeight: 800,
    color: '#10b981',
  },
  errorBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 14px',
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '10px',
    color: '#dc2626',
    fontSize: '14px',
    fontWeight: 600,
    marginBottom: '16px',
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 24px',
    borderTop: '1px solid #e2e8f0',
    background: '#f8fafc',
  },
  cancelBtn: {
    padding: '12px 20px',
    background: '#fff',
    border: '2px solid #e2e8f0',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: 700,
    color: '#475569',
    cursor: 'pointer',
  },
  footerActions: {
    display: 'flex',
    gap: '10px',
  },
  previewBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 20px',
    background: '#fff',
    border: '2px solid #10b981',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: 700,
    color: '#059669',
    cursor: 'pointer',
  },
  submitBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 24px',
    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    border: 'none',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: 700,
    color: '#fff',
    cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
  },

  // Preview Overlay
  previewOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.5)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1002,
    padding: '20px',
  },
  previewCard: {
    width: '100%',
    maxWidth: '500px',
    background: '#fff',
    borderRadius: '16px',
    padding: '24px',
    boxShadow: '0 25px 80px rgba(15, 23, 42, 0.35)',
  },
  previewTitle: {
    margin: '0 0 20px',
    fontSize: '18px',
    fontWeight: 800,
    color: '#0f172a',
  },
  previewList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginBottom: '20px',
  },
  previewItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 16px',
    background: '#f8fafc',
    borderRadius: '10px',
  },
  previewItemInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  previewItemLabel: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#0f172a',
  },
  previewItemAmounts: {
    textAlign: 'right',
  },
  previewItemAmount: {
    display: 'block',
    fontSize: '15px',
    fontWeight: 800,
    color: '#10b981',
  },
  previewItemRemaining: {
    display: 'block',
    fontSize: '11px',
    color: '#64748b',
    marginTop: '2px',
  },
  previewSummary: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 16px',
    background: '#f0fdf4',
    borderRadius: '10px',
    marginBottom: '12px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#059669',
  },
  previewTotal: {
    fontSize: '20px',
    fontWeight: 800,
  },
  previewWarning: {
    padding: '10px 14px',
    background: '#fffbeb',
    border: '1px solid #fde68a',
    borderRadius: '10px',
    color: '#d97706',
    fontSize: '13px',
    fontWeight: 600,
    marginBottom: '16px',
  },
  previewCloseBtn: {
    width: '100%',
    padding: '12px',
    background: '#f1f5f9',
    border: 'none',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: 700,
    color: '#475569',
    cursor: 'pointer',
  },

  // Confirmation Modal
  confirmOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.7)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1003,
    padding: '20px',
  },
  confirmCard: {
    width: '100%',
    maxWidth: '440px',
    background: '#fff',
    borderRadius: '20px',
    padding: '28px',
    boxShadow: '0 25px 80px rgba(15, 23, 42, 0.4)',
    textAlign: 'center',
  },
  confirmIcon: {
    width: '64px',
    height: '64px',
    margin: '0 auto 20px',
    background: '#fef3c7',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#f59e0b',
  },
  confirmTitle: {
    margin: '0 0 20px',
    fontSize: '20px',
    fontWeight: 800,
    color: '#0f172a',
  },
  confirmDetails: {
    textAlign: 'left',
    padding: '16px',
    background: '#f8fafc',
    borderRadius: '12px',
    marginBottom: '16px',
  },
  confirmRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid #e2e8f0',
  },
  confirmLabel: {
    fontSize: '13px',
    color: '#64748b',
  },
  confirmValue: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#0f172a',
  },
  confirmWarning: {
    margin: '0 0 20px',
    fontSize: '13px',
    color: '#64748b',
  },
  confirmActions: {
    display: 'flex',
    gap: '10px',
  },
  confirmCancelBtn: {
    flex: 1,
    padding: '12px',
    background: '#f1f5f9',
    border: 'none',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: 700,
    color: '#475569',
    cursor: 'pointer',
  },
  confirmSubmitBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '12px',
    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    border: 'none',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: 700,
    color: '#fff',
    cursor: 'pointer',
  },

  // Success Screen
  successOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.8)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1003,
    padding: '20px',
  },
  successCard: {
    width: '100%',
    maxWidth: '480px',
    background: '#fff',
    borderRadius: '24px',
    padding: '32px',
    boxShadow: '0 25px 80px rgba(15, 23, 42, 0.4)',
    textAlign: 'center',
  },
  successIcon: {
    width: '80px',
    height: '80px',
    margin: '0 auto 24px',
    background: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
  },
  successTitle: {
    margin: '0 0 16px',
    fontSize: '24px',
    fontWeight: 800,
    color: '#0f172a',
  },
  successAmount: {
    fontSize: '36px',
    fontWeight: 900,
    color: '#10b981',
    marginBottom: '24px',
  },
  successDetails: {
    textAlign: 'left',
    padding: '20px',
    background: '#f8fafc',
    borderRadius: '16px',
    marginBottom: '24px',
  },
  successDetailsTitle: {
    margin: '0 0 12px',
    fontSize: '13px',
    fontWeight: 700,
    color: '#64748b',
    textTransform: 'uppercase',
  },
  successAllocationItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 0',
    borderBottom: '1px solid #e2e8f0',
  },
  successAllocationLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  successAllocationDebt: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#0f172a',
  },
  successAllocationAmount: {
    fontSize: '15px',
    fontWeight: 800,
    color: '#10b981',
  },
  successCloseBtn: {
    width: '100%',
    padding: '14px',
    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    border: 'none',
    borderRadius: '12px',
    fontSize: '16px',
    fontWeight: 800,
    color: '#fff',
    cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
  },

  // Payment History
  historySection: {
    marginTop: '16px',
  },
  historyToggleBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 14px',
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '10px',
    fontSize: '13px',
    fontWeight: 600,
    color: '#475569',
    cursor: 'pointer',
    width: '100%',
  },
  historyContent: {
    marginTop: '12px',
    maxHeight: '300px',
    overflow: 'auto',
  },
  historyLoading: {
    padding: '20px',
    textAlign: 'center',
    color: '#64748b',
  },
  historyEmpty: {
    padding: '20px',
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: '13px',
  },
  historyItem: {
    padding: '14px',
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '10px',
    marginBottom: '8px',
  },
  historyItemHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  historyItemDate: {
    flex: 1,
    fontSize: '13px',
    fontWeight: 600,
    color: '#475569',
  },
  historyItemAmount: {
    fontSize: '14px',
    fontWeight: 800,
    color: '#10b981',
  },
  historyItemMethod: {
    fontSize: '16px',
  },
  historyItemDetails: {
    marginTop: '10px',
    paddingTop: '10px',
    borderTop: '1px solid #e2e8f0',
  },
  historyDetailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '4px 0',
    fontSize: '12px',
    color: '#64748b',
  },
  historyDetailAmount: {
    fontWeight: 600,
    color: '#10b981',
  },
  historyItemNotes: {
    marginTop: '8px',
    fontSize: '12px',
    color: '#64748b',
    fontStyle: 'italic',
  },
};
