import { useEffect, useState } from "react";
import { Button, Image, Input, Modal, Select, Spin, Tag, Tooltip } from "antd";
import { CloseOutlined, PlusOutlined, LoadingOutlined, CheckCircleOutlined, StopOutlined, FileImageOutlined } from "@ant-design/icons";
import StatusTag from "./StatusTag";
import { expenseTypeOptions, formatCurrency, normalizeStatus } from "../utils";
import { apiRequest } from "../../../services/apiClient";

const formatRouteLabel = (shipment) => {
  if (!shipment) return "-";
  const pickup = shipment.pickup_address || shipment.stops?.find((stop) => stop.stop_type === "pickup")?.address || "-";
  const delivery = shipment.delivery_address || shipment.stops?.find((stop) => stop.stop_type === "delivery")?.address || "-";
  return `${pickup} -> ${delivery}`;
};

export default function ReceiptDetailModal({
  open,
  detail,
  loading,
  form,
  publishing,
  onClose,
  onPublish,
  updateField,
  addExpense,
  updateExpense,
  updateExpenseShipment,
  removeExpense,
}) {
  const [ocrResults, setOcrResults] = useState({});
  const [ocrLoading, setOcrLoading] = useState(false);

  useEffect(() => {
    if (!open || !detail?.request?.id) return;

    const allExpenses = (detail.shipments || []).flatMap((s) => s.expenses || []);
    const hasImages = allExpenses.some((e) => Array.isArray(e.receipt_urls) && e.receipt_urls.length > 0);
    if (!hasImages) return;

    setOcrResults({});
    setOcrLoading(true);

    apiRequest(`/api/coordinator/receipt-requests/${detail.request.id}/scan-expenses`)
      .then((data) => {
        const map = {};
        (data.results || []).forEach((r) => { map[r.expense_id] = r; });
        setOcrResults(map);
      })
      .catch(() => {})
      .finally(() => setOcrLoading(false));
  }, [open, detail?.request?.id]);

  if (!open) return null;

  const shipments = detail?.shipments || (detail?.shipment ? [detail.shipment] : []);
  const primaryShipment = detail?.shipment || shipments[0] || null;
  const actualRevenue = shipments.reduce(
    (sum, shipment) => sum + Number(shipment.actual_revenue || shipment.actual_price || 0),
    0,
  );
  const passThroughExpenses = [...(detail?.expenses || []), ...form.expenses]
    .filter((expense) => ["parking", "toll", "depreciation"].includes(String(expense.expense_type || "").trim()))
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const finalPrice = actualRevenue + passThroughExpenses;
  const status = normalizeStatus(detail?.request?.status);
  const readonly = ["approved", "rejected"].includes(status);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={960}
      destroyOnClose
      title={readonly ? "Chi tiết phiếu thu" : "Tạo phiếu thu"}
    >
      <p style={{ marginTop: -8, color: "#6b7280" }}>
        {detail?.request
          ? `Yêu cầu #${detail.request.id} · Đơn #${detail.order?.id}`
          : "Đang tải thông tin yêu cầu phiếu thu"}
      </p>

      {loading || !detail ? (
        <div style={{ padding: "48px 0", textAlign: "center" }}>
          <Spin tip="Đang tải chi tiết phiếu thu..." />
        </div>
      ) : (
        <div className="receipt-layout">
          <div className="receipt-overview-grid">
            <div className="receipt-section">
              <div className="sheet-caption full">Khách hàng</div>
              <div className="receipt-info-grid">
                <div>
                  <span className="receipt-info-label">Khách hàng</span>
                  <strong>{detail.customer?.full_name || "Khách lẻ"}</strong>
                </div>
                <div>
                  <span className="receipt-info-label">Số điện thoại</span>
                  <strong>{detail.customer?.phone || "-"}</strong>
                </div>
                <div>
                  <span className="receipt-info-label">Công ty</span>
                  <strong>{detail.customer?.company_name || "-"}</strong>
                </div>
                <div>
                  <span className="receipt-info-label">Tài xế</span>
                  <strong>{detail.request?.driver_name || "-"}</strong>
                </div>
                <div>
                  <span className="receipt-info-label">Đơn hàng</span>
                  <strong>#{detail.order?.id || "-"}</strong>
                </div>
                <div>
                  <span className="receipt-info-label">Số chuyến</span>
                  <strong>{shipments.length || 0}</strong>
                </div>
              </div>
            </div>

            <div className="receipt-section">
              <div className="sheet-caption full">Thông tin đơn hàng</div>
              <div className="receipt-info-grid">
                <div>
                  <span className="receipt-info-label">Hàng hóa</span>
                  <strong>{detail.order?.cargo_name || "-"}</strong>
                </div>
                <div>
                  <span className="receipt-info-label">Khối lượng</span>
                  <strong>{detail.order?.cargo_weight_kg ? `${detail.order.cargo_weight_kg} kg` : "-"}</strong>
                </div>
              </div>

              <div className="receipt-shipments-stack">
                {shipments.map((shipment) => (
                  <div key={shipment.id} className="receipt-shipment-card">
                    <div className="receipt-shipment-head">
                      <strong>Chuyến #{shipment.id} · {shipment.shipment_index || "-"}</strong>
                      <StatusTag status={shipment.status} />
                    </div>
                    <div className="receipt-info-grid">
                      <div>
                        <span className="receipt-info-label">Tài xế</span>
                        <strong>{shipment.driver_name || "-"}</strong>
                      </div>
                      <div>
                        <span className="receipt-info-label">Biển số</span>
                        <strong>{shipment.plate_number || "-"}</strong>
                      </div>
                      <div>
                        <span className="receipt-info-label">Nhóm xe</span>
                        <strong>{shipment.vehicle_group_name || "-"}</strong>
                      </div>
                      <div>
                        <span className="receipt-info-label">Đơn giá/km</span>
                        <strong>{formatCurrency(shipment.price_per_km)}</strong>
                      </div>
                      <div>
                        <span className="receipt-info-label">KM thực tế</span>
                        <strong>{shipment.actual_km ? `${shipment.actual_km} km` : "-"}</strong>
                      </div>
                      <div>
                        <span className="receipt-info-label">Doanh thu</span>
                        <strong>{formatCurrency(shipment.actual_revenue || shipment.actual_price || 0)}</strong>
                      </div>
                      <div>
                        <span className="receipt-info-label">Lộ trình</span>
                        <strong>{formatRouteLabel(shipment)}</strong>
                      </div>
                      <div>
                        <span className="receipt-info-label">Chi phí chuyến</span>
                        <strong>{formatCurrency(shipment.total_expenses)}</strong>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="receipt-section">
              <div className="sheet-caption full">{readonly ? "Thông tin phiếu thu" : "Chi phí & phát hành"}</div>
              <div className="receipt-expense-head">
                <div>
                  <strong>Chi phí đơn hàng</strong>
                  <p>{readonly
                    ? "Xem lại chi phí đã ghi nhận và tổng hợp phiếu thu."
                    : "Quản lý toàn bộ chi phí của đơn hàng và thêm khoản mới ngay bên dưới."}</p>
                </div>
                {!readonly && (
                  <Button type="primary" className="coordinator-primary-btn" icon={<PlusOutlined />} onClick={addExpense}>
                    Thêm chi phí
                  </Button>
                )}
              </div>
              <div className="receipt-expense-list">
                {(detail.expenses || []).map((expense) => {
                  const ocr = ocrResults[expense.id];
                  const images = Array.isArray(expense.receipt_urls) ? expense.receipt_urls : [];
                  const hasImage = images.length > 0;

                  return (
                    <div key={expense.id} className="receipt-expense-item readonly" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
                      {/* Dòng 1: tên loại + số tiền + badge OCR */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <strong>{expenseTypeOptions.find((o) => o.value === expense.expense_type)?.label || expense.expense_type}</strong>
                          <span style={{ marginLeft: 8, color: "#6b7280", fontSize: 12 }}>
                            {expense.description || "Chi phí đã ghi nhận"}
                            {expense.shipment_id ? ` · Chuyến #${expense.shipment_id}` : ""}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {hasImage && (
                            ocrLoading && !ocr ? (
                              <Tooltip title="Đang quét hóa đơn...">
                                <Tag icon={<LoadingOutlined />} color="processing">Đang quét</Tag>
                              </Tooltip>
                            ) : ocr?.valid === true ? (
                              <Tooltip title="Số tiền trên hóa đơn khớp với số khai">
                                <Tag icon={<CheckCircleOutlined />} color="success">Hợp lệ</Tag>
                              </Tooltip>
                            ) : ocr?.valid === false ? (
                              <Tooltip title={ocr.reject_reason || "Hóa đơn không hợp lệ"}>
                                <Tag icon={<StopOutlined />} color="error">Không khớp</Tag>
                              </Tooltip>
                            ) : null
                          )}
                          {!hasImage && (
                            <Tooltip title="Tài xế chưa đính kèm ảnh hóa đơn">
                              <Tag icon={<FileImageOutlined />} color="default">Chưa có ảnh</Tag>
                            </Tooltip>
                          )}
                          <strong>{formatCurrency(expense.amount)}</strong>
                        </div>
                      </div>

                      {/* Dòng 2: thumbnails ảnh hóa đơn */}
                      {hasImage && (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <Image.PreviewGroup>
                            {images.map((url, idx) => (
                              <Image
                                key={idx}
                                src={url}
                                width={72}
                                height={72}
                                style={{ objectFit: "cover", borderRadius: 6, border: "1px solid #e5e7eb", cursor: "pointer" }}
                                placeholder={<div style={{ width: 72, height: 72, background: "#f3f4f6", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}><LoadingOutlined /></div>}
                              />
                            ))}
                          </Image.PreviewGroup>
                        </div>
                      )}
                    </div>
                  );
                })}

                {!readonly && form.expenses.map((expense, index) => (
                  <div key={`expense-${index}`} className="receipt-expense-editor">
                    <div className="receipt-expense-editor-grid">
                      <label>
                        <span className="receipt-info-label">Chuyến</span>
                        <Select
                          style={{ width: "100%" }}
                          value={expense.shipment_id || primaryShipment?.id || undefined}
                          onChange={(value) => updateExpenseShipment(index, value)}
                          options={shipments.map((shipment) => ({
                            value: shipment.id,
                            label: `Chuyến #${shipment.id} · ${shipment.plate_number || shipment.driver_name || "Chưa gán"}`,
                          }))}
                        />
                      </label>
                      <label>
                        <span className="receipt-info-label">Loại chi phí</span>
                        <Select
                          style={{ width: "100%" }}
                          value={expense.expense_type}
                          onChange={(value) => updateExpense(index, "expense_type", value)}
                          options={expenseTypeOptions}
                        />
                      </label>
                      <label>
                        <span className="receipt-info-label">Số tiền</span>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={expense.amount}
                          onChange={(event) => updateExpense(index, "amount", event.target.value)}
                          placeholder="0"
                        />
                      </label>
                      <label className="receipt-expense-note-field">
                        <span className="receipt-info-label">Mô tả</span>
                        <Input
                          value={expense.description}
                          onChange={(event) => updateExpense(index, "description", event.target.value)}
                          placeholder="Ví dụ: BOT, gửi xe, khấu hao chuyến..."
                        />
                      </label>
                    </div>
                    <Button
                      type="text"
                      danger
                      icon={<CloseOutlined />}
                      className="coordinator-table-icon-btn coordinator-table-icon-btn-danger"
                      onClick={() => removeExpense(index)}
                    />
                  </div>
                ))}
              </div>

              <div className="receipt-notes-card">
                <div className="receipt-field-head">
                  <div>
                    <span className="receipt-info-label">Ghi chú phiếu thu</span>
                    <strong>Thông tin nội bộ cho coordinator</strong>
                  </div>
                  <span className="receipt-field-chip">{readonly ? (detail?.request?.status || "-") : "Không bắt buộc"}</span>
                </div>
                <Input.TextArea
                  className="receipt-notes-textarea"
                  value={readonly ? (detail?.request?.coordinator_notes || "") : form.notes}
                  onChange={(event) => updateField("notes", event.target.value)}
                  readOnly={readonly}
                  rows={3}
                  placeholder="Ví dụ: đối soát theo km thực tế, thêm chi phí cầu đường..."
                />
              </div>

              <div className="receipt-summary-card emphasis">
                <div>
                  <span>Chuyến dùng để chốt phiếu thu</span>
                  <strong>{primaryShipment ? `#${primaryShipment.id} · ${primaryShipment.plate_number || primaryShipment.driver_name || "-"}` : "-"}</strong>
                </div>
                <div>
                  <span>Tổng thu</span>
                  <strong>{formatCurrency(finalPrice)}</strong>
                </div>
              </div>
            </div>
          </div>
          <div className="form-actions full">
            <Button type="default" className="coordinator-secondary-btn" onClick={onClose}>
              Đóng
            </Button>
            {!readonly && (
              <Button type="primary" className="coordinator-primary-btn" loading={publishing} onClick={onPublish}>
                {publishing ? "Đang phát hành..." : "Phát hành phiếu thu"}
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
