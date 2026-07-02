import { Button, DatePicker, Input, Modal, Select } from "antd";
import { CloseOutlined, DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import dayjs from "dayjs";

const fieldStyle = { width: "100%" };

export default function OrderFormModal({
  open,
  editingTrip,
  form,
  formErrors,
  vehicleGroups,
  partners,
  creating,
  totalFare,
  onClose,
  onSubmit,
  updateField,
  updateTripField,
  updateTripStopList,
  addTripStop,
  removeTripStop,
  addTrip,
  removeTrip,
  getAvailablePlates,
  getTripFare,
}) {
  if (!open) return null;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={860}
      destroyOnClose
      title={editingTrip ? `Chỉnh sửa đơn #${editingTrip.orderId}` : "Tạo đơn"}
    >
      <p style={{ marginTop: -8, color: "#6b7280" }}>
        {editingTrip ? "Cập nhật thông tin đơn hàng để điều phối chính xác." : "Điền thông tin đơn hàng để tạo chuyến mới."}
      </p>

      <form className="create-form" onSubmit={onSubmit}>
        <div className="sheet-caption full">Thông tin đơn hàng</div>

        <div className="form-row form-row-3">
          <label>
            <span>Ngày giao hàng</span>
            <DatePicker
              style={fieldStyle}
              value={form.date ? dayjs(form.date) : null}
              onChange={(_, dateString) => updateField("date", dateString || "")}
              minDate={editingTrip ? undefined : dayjs()}
              status={formErrors.date ? "error" : undefined}
              format="YYYY-MM-DD"
            />
            {formErrors.date && <div className="field-error">{formErrors.date}</div>}
          </label>
          <label>
            <span>SĐT</span>
            <Input
              value={form.customer_phone}
              onChange={(event) => updateField("customer_phone", event.target.value)}
              status={formErrors.customer_phone ? "error" : undefined}
            />
            {formErrors.customer_phone && (
              <div className="field-error">{formErrors.customer_phone}</div>
            )}
          </label>

          <label>
            <span>Khách hàng</span>
            <Input
              value={form.customer_name}
              onChange={(event) => updateField("customer_name", event.target.value)}
              status={formErrors.customer_name ? "error" : undefined}
            />
            {formErrors.customer_name && (
              <div className="field-error">{formErrors.customer_name}</div>
            )}
          </label>
        </div>

        <div className="form-row form-row-2">
          <label>
            <span>Hàng hóa</span>
            <Input
              value={form.cargo_name}
              onChange={(event) => updateField("cargo_name", event.target.value)}
              placeholder="Không bắt buộc"
            />
          </label>

          <label>
            <span>Khối lượng (kg)</span>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.cargo_weight_kg}
              onChange={(event) => updateField("cargo_weight_kg", event.target.value)}
              status={formErrors.cargo_weight_kg ? "error" : undefined}
            />
            {formErrors.cargo_weight_kg && (
              <div className="field-error">{formErrors.cargo_weight_kg}</div>
            )}
          </label>
        </div>

        <div className="form-row form-row-1">
          <label>
            <span>Khách trả trước</span>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.prepaid_amount}
              onChange={(event) => updateField("prepaid_amount", event.target.value)}
              placeholder="VD: 500000"
              status={formErrors.prepaid_amount ? "error" : undefined}
            />
            {formErrors.prepaid_amount && (
              <div className="field-error">{formErrors.prepaid_amount}</div>
            )}
          </label>
        </div>

        <div className="form-row full" style={{ marginTop: 12, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button
            type={form.is_partner ? "primary" : "default"}
            className={form.is_partner ? "coordinator-primary-btn" : "coordinator-secondary-btn"}
            onClick={() => updateField("is_partner", !form.is_partner)}
          >
            Đơn từ đối tác liên kết
          </Button>
        </div>

        {form.is_partner && (
          <div className="form-row full" style={{ marginBottom: 16 }}>
            <label style={{ display: 'grid', gap: 6, fontSize: 14, color: '#2a3144' }}>
              <span>Đối tác</span>
              <Select
                style={fieldStyle}
                value={form.partner_name || undefined}
                placeholder="Chọn đối tác"
                onChange={(value) => updateField("partner_name", value)}
                options={partners.map((partner) => ({
                  value: partner.company_name,
                  label: partner.contact_person ? `${partner.company_name} - ${partner.contact_person}` : partner.company_name,
                }))}
              />
            </label>
          </div>
        )}

        <div className="sheet-caption full" style={{ marginTop: 12 }}>Chuyến xe</div>

        {form.trips && form.trips.map((trip, index) => (
          <div key={index} className="trip-row full" style={{
            border: '1px solid #dde2f3',
            borderRadius: 16,
            padding: '14px 16px',
            background: '#f8f9ff',
            display: 'grid',
            gap: 12,
            position: 'relative'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <strong style={{ color: '#18227f', fontSize: 13 }}>Chuyến {index + 1}</strong>
              {form.trips.length > 1 && (
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  className="coordinator-danger-text-btn"
                  onClick={() => removeTrip(index)}
                >
                  Xóa
                </Button>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <label style={{ display: 'grid', gap: 6, fontSize: 14, color: '#2a3144' }}>
                <span>Nhóm xe</span>
                <Select
                  style={fieldStyle}
                  value={trip.vehicle_group_id || undefined}
                  placeholder="Chọn nhóm xe"
                  status={formErrors[`trip_${index}_vehicle_group_id`] ? "error" : undefined}
                  onChange={(value) => {
                    updateTripField(index, 'vehicle_group_id', value);
                    updateTripField(index, 'plate', '');
                  }}
                  options={vehicleGroups.map((group) => ({ value: group.id, label: group.name }))}
                />
                {formErrors[`trip_${index}_vehicle_group_id`] && (
                  <div className="field-error">{formErrors[`trip_${index}_vehicle_group_id`]}</div>
                )}
              </label>

              <label style={{ display: 'grid', gap: 6, fontSize: 14, color: '#2a3144' }}>
                <span>BKS</span>
                <Select
                  style={fieldStyle}
                  value={trip.plate || undefined}
                  placeholder={trip.vehicle_group_id ? 'Chọn BKS' : 'Chọn nhóm xe trước'}
                  disabled={!trip.vehicle_group_id}
                  status={formErrors[`trip_${index}_plate`] ? "error" : undefined}
                  onChange={(value) => updateTripField(index, 'plate', value)}
                  options={[
                    ...(trip.plate && !getAvailablePlates(trip.vehicle_group_id).some((v) => v.plate_number === trip.plate)
                      ? [{ value: trip.plate, label: trip.plate }]
                      : []),
                    ...getAvailablePlates(trip.vehicle_group_id).map((v) => ({
                      value: v.plate_number,
                      label: v.assigned_driver_name ? `${v.plate_number} - ${v.assigned_driver_name}` : v.plate_number,
                    })),
                  ]}
                />
                {formErrors[`trip_${index}_plate`] && (
                  <div className="field-error">{formErrors[`trip_${index}_plate`]}</div>
                )}
              </label>

              <label style={{ display: 'grid', gap: 6, fontSize: 14, color: '#2a3144' }}>
                <span>Quãng đường (km)</span>
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  value={trip.distance}
                  onChange={(e) => updateTripField(index, 'distance', e.target.value)}
                  placeholder="VD: 120"
                  status={formErrors[`trip_${index}_distance`] ? "error" : undefined}
                />
                {formErrors[`trip_${index}_distance`] && (
                  <div className="field-error">{formErrors[`trip_${index}_distance`]}</div>
                )}
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 4 }}>
              <div style={{ display: 'grid', gap: 8 }}>
                <label style={{ display: 'grid', gap: 6, fontSize: 14, color: '#2a3144' }}>
                  <span>Điểm lấy hàng</span>
                  <Input
                    value={trip.pickup_address || ""}
                    onChange={(e) => updateTripField(index, 'pickup_address', e.target.value)}
                    placeholder="Địa chỉ lấy hàng"
                    status={formErrors[`trip_${index}_pickup_address`] ? "error" : undefined}
                  />
                  {formErrors[`trip_${index}_pickup_address`] && (
                    <div className="field-error">{formErrors[`trip_${index}_pickup_address`]}</div>
                  )}
                </label>
                {(trip.pickup_addresses || [trip.pickup_address]).slice(1).map((address, extraIndex) => {
                  const stopIndex = extraIndex + 1;
                  return (
                    <div key={`pickup-${stopIndex}`} style={{ display: 'flex', gap: 8 }}>
                      <Input
                        value={address || ""}
                        onChange={(e) => updateTripStopList(index, 'pickup_addresses', stopIndex, e.target.value)}
                        placeholder={`Điểm lấy #${stopIndex + 1}`}
                      />
                      <Button
                        type="text"
                        danger
                        icon={<CloseOutlined />}
                        className="coordinator-stop-remove-btn"
                        onClick={() => removeTripStop(index, 'pickup_addresses', stopIndex)}
                      />
                    </div>
                  );
                })}
                <Button type="dashed" className="coordinator-dashed-btn" icon={<PlusOutlined />} onClick={() => addTripStop(index, 'pickup_addresses')}>
                  Thêm điểm lấy
                </Button>
              </div>

              <div style={{ display: 'grid', gap: 8 }}>
                <label style={{ display: 'grid', gap: 6, fontSize: 14, color: '#2a3144' }}>
                  <span>Điểm giao hàng</span>
                  <Input
                    value={trip.delivery_address || ""}
                    onChange={(e) => updateTripField(index, 'delivery_address', e.target.value)}
                    placeholder="Địa chỉ giao hàng"
                    status={formErrors[`trip_${index}_delivery_address`] ? "error" : undefined}
                  />
                  {formErrors[`trip_${index}_delivery_address`] && (
                    <div className="field-error">{formErrors[`trip_${index}_delivery_address`]}</div>
                  )}
                </label>
                {(trip.delivery_addresses || [trip.delivery_address]).slice(1).map((address, extraIndex) => {
                  const stopIndex = extraIndex + 1;
                  return (
                    <div key={`delivery-${stopIndex}`} style={{ display: 'flex', gap: 8 }}>
                      <Input
                        value={address || ""}
                        onChange={(e) => updateTripStopList(index, 'delivery_addresses', stopIndex, e.target.value)}
                        placeholder={`Điểm giao #${stopIndex + 1}`}
                      />
                      <Button
                        type="text"
                        danger
                        icon={<CloseOutlined />}
                        className="coordinator-stop-remove-btn"
                        onClick={() => removeTripStop(index, 'delivery_addresses', stopIndex)}
                      />
                    </div>
                  );
                })}
                <Button type="dashed" className="coordinator-dashed-btn" icon={<PlusOutlined />} onClick={() => addTripStop(index, 'delivery_addresses')}>
                  Thêm điểm giao
                </Button>
              </div>
            </div>
            <div style={{ fontSize: 13, color: '#18227f', fontWeight: 600 }}>
              Cước xe: {Number(getTripFare(trip) || 0).toLocaleString('vi-VN')} đ
            </div>
          </div>
        ))}

        <div className="full" style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
          <Button type="dashed" className="coordinator-dashed-btn" icon={<PlusOutlined />} onClick={addTrip}>
            Thêm chuyến
          </Button>
          {totalFare > 0 && (
            <div style={{ fontWeight: 700, fontSize: 15, color: '#0f1d70' }}>
              Tổng cước: {totalFare.toLocaleString('vi-VN')} đ
            </div>
          )}
        </div>

        <div className="form-row form-row-note">
          <label>
            <span>Ghi chú</span>
            <Input.TextArea
              value={form.note}
              onChange={(event) => updateField("note", event.target.value)}
              rows={3}
            />
          </label>
        </div>
        {Object.keys(formErrors).length > 0 && (
          <div className="full field-error field-error-box">
            {Object.entries(formErrors).map(([key, error]) => (
              <div key={key}>{error}</div>
            ))}
          </div>
        )}

        <div className="form-actions full">
          <Button type="default" className="coordinator-secondary-btn" onClick={onClose}>
            Hủy
          </Button>
          <Button type="primary" className="coordinator-primary-btn" htmlType="submit" loading={creating}>
            {creating ? (editingTrip ? "Đang cập nhật..." : "Đang tạo...") : (editingTrip ? "Cập nhật" : "Tạo đơn")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
