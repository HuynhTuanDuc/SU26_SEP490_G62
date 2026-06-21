import React, { useState, useEffect } from 'react';
import {
  previewDebtAllocation,
  allocateDebtPayment,
  getDebtsByPerson,
} from '../../services/debtPaymentService';

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Tiền mặt' },
  { value: 'bank_transfer', label: 'Chuyển khoản' },
];

export default function DebtPaymentModal({ isOpen, onClose, person, onPaymentRecorded }) {
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [debts, setDebts] = useState([]);
  const [preview, setPreview] = useState(null);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  // Load debts của person khi mở modal
  useEffect(() => {
    if (isOpen && person) {
      loadDebts();
    }
  }, [isOpen, person]);

  // Reset form khi đóng
  useEffect(() => {
    if (!isOpen) {
      setAmount('');
      setPreview(null);
      setNotes('');
      setError('');
      setDebts([]);
    }
  }, [isOpen]);

  const loadDebts = async () => {
    try {
      setLoading(true);
      const result = await getDebtsByPerson(person.type, person.id);
      setDebts(result.debts || []);
    } catch (err) {
      console.error('Error loading debts:', err);
      setError('Không thể tải danh sách công nợ');
    } finally {
      setLoading(false);
    }
  };

  // Preview phân bổ
  const handlePreview = async () => {
    if (!amount || Number(amount) <= 0) {
      setError('Vui lòng nhập số tiền hợp lệ');
      return;
    }

    try {
      setPreviewLoading(true);
      setError('');
      const result = await previewDebtAllocation(person.type, person.id, Number(amount));
      setPreview(result);
    } catch (err) {
      console.error('Error previewing:', err);
      setError(err.message || 'Không thể xem trước phân bổ');
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Xác nhận thanh toán
  const handleSubmit = async () => {
    if (!amount || Number(amount) <= 0) {
      setError('Vui lòng nhập số tiền hợp lệ');
      return;
    }

    try {
      setLoading(true);
      setError('');
      await allocateDebtPayment(
        person.type,
        person.id,
        Number(amount),
        paymentMethod,
        notes
      );
      alert('Ghi nhận thu tiền thành công!');
      onPaymentRecorded?.();
      onClose();
    } catch (err) {
      console.error('Error recording payment:', err);
      setError(err.message || 'Ghi nhận thu tiền thất bại');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const totalRemaining = debts.reduce((sum, d) => sum + (d.total_remaining || 0), 0);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 700 }}>
        <div className="modal-header">
          <h3>
            {person.type === 'customer' ? 'Thu tiền khách hàng' : 'Thu tiền tài xế'}
          </h3>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          {/* Thông tin người */}
          <div className="info-box" style={{ marginBottom: 16, padding: 12, background: '#f5f5f5', borderRadius: 8 }}>
            <strong>{person.name}</strong>
            {person.phone && <span style={{ marginLeft: 8, color: '#666' }}>{person.phone}</span>}
            <span style={{ marginLeft: 16, color: '#e74c3c', fontWeight: 600 }}>
              Còn nợ: {totalRemaining.toLocaleString()}đ
            </span>
          </div>

          {/* Danh sách công nợ */}
          {loading ? (
            <p>Đang tải...</p>
          ) : debts.length === 0 ? (
            <p style={{ color: '#27ae60', fontWeight: 600 }}>Không có công nợ nào.</p>
          ) : (
            <div style={{ marginBottom: 16 }}>
              <h4 style={{ marginBottom: 8 }}>Các khoản nợ:</h4>
              <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#eee' }}>
                    <th style={{ padding: 6, textAlign: 'left' }}>Chuyến</th>
                    <th style={{ padding: 6, textAlign: 'right' }}>Tổng</th>
                    <th style={{ padding: 6, textAlign: 'right' }}>Đã trả</th>
                    <th style={{ padding: 6, textAlign: 'right' }}>Còn nợ</th>
                    <th style={{ padding: 6, textAlign: 'center' }}>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {debts.map((debt) => (
                    <tr key={debt.id} style={{ borderBottom: '1px solid #ddd' }}>
                      <td style={{ padding: 6 }}>#{debt.shipment_id || debt.id}</td>
                      <td style={{ padding: 6, textAlign: 'right' }}>
                        {Number(debt.total_amount || 0).toLocaleString()}đ
                      </td>
                      <td style={{ padding: 6, textAlign: 'right', color: '#27ae60' }}>
                        {Number(debt.paid_amount || 0).toLocaleString()}đ
                      </td>
                      <td style={{ padding: 6, textAlign: 'right', color: '#e74c3c', fontWeight: 600 }}>
                        {Number(debt.remaining || 0).toLocaleString()}đ
                      </td>
                      <td style={{ padding: 6, textAlign: 'center' }}>
                        <span className={`status-badge ${debt.computed_status || debt.raw_status || 'unpaid'}`}>
                          {debt.computed_status === 'paid' ? 'Đã trả' :
                           debt.computed_status === 'partial' ? 'Một phần' : 'Chưa trả'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Form nhập tiền */}
          {debts.length > 0 && (
            <>
              <div className="form-row" style={{ marginBottom: 12 }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Số tiền thu:</label>
                  <input
                    type="number"
                    className="form-input"
                    value={amount}
                    onChange={(e) => { setAmount(e.target.value); setPreview(null); }}
                    placeholder="Nhập số tiền..."
                    min="0"
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Hình thức:</label>
                  <select
                    className="form-input"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>Ghi chú:</label>
                <input
                  type="text"
                  className="form-input"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ghi chú (không bắt buộc)..."
                />
              </div>

              {/* Preview phân bổ */}
              <div style={{ marginBottom: 12 }}>
                <button
                  className="btn btn-outline"
                  onClick={handlePreview}
                  disabled={previewLoading || !amount}
                  style={{ marginRight: 8 }}
                >
                  {previewLoading ? 'Đang xem...' : 'Xem trước phân bổ'}
                </button>
              </div>

              {preview && (
                <div className="preview-box" style={{ background: '#e8f5e9', padding: 12, borderRadius: 8, marginBottom: 12 }}>
                  <h4 style={{ marginBottom: 8, color: '#2e7d32' }}>Phân bổ thanh toán:</h4>
                  <table style={{ width: '100%', fontSize: 13 }}>
                    <thead>
                      <tr style={{ color: '#555' }}>
                        <th style={{ textAlign: 'left', padding: 4 }}>Khoản nợ</th>
                        <th style={{ textAlign: 'right', padding: 4 }}>Số tiền</th>
                        <th style={{ textAlign: 'center', padding: 4 }}>Sau khi trả</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.preview.map((p, i) => (
                        <tr key={i}>
                          <td style={{ padding: 4 }}>Debt #{p.debtId}</td>
                          <td style={{ padding: 4, textAlign: 'right', fontWeight: 600 }}>
                            {p.allocateAmount.toLocaleString()}đ
                          </td>
                          <td style={{ padding: 4, textAlign: 'center' }}>
                            <span className={`status-badge ${p.newStatus}`}>
                              {p.newStatus === 'paid' ? 'Đã trả' : 'Một phần'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ marginTop: 8, fontWeight: 600, color: '#2e7d32' }}>
                    Tổng phân bổ: {preview.totalAllocated.toLocaleString()}đ
                    {preview.overpayment > 0 && (
                      <span style={{ color: '#f39c12', marginLeft: 16 }}>
                        (Dư: {preview.overpayment.toLocaleString()}đ)
                      </span>
                    )}
                  </div>
                </div>
              )}

              {error && (
                <div className="error-message" style={{ color: '#e74c3c', marginBottom: 12 }}>
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Đóng</button>
          {debts.length > 0 && (
            <button
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={loading || !amount}
            >
              {loading ? 'Đang xử lý...' : 'Xác nhận thu tiền'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
