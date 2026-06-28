export default function OrderModal({
  open,
  editingTrip,
  form,
  formErrors,
  vehicleGroups,
  partners,
  creating,
  totalFare,

  updateField,
  updateTripField,
  addTrip,
  removeTrip,
  getAvailablePlates,
  getTripFare,

  closeOrderModal,
  handleCreateOrder,
}) {
  if (!open) return null;

  return (
    <section className="modal-backdrop" onClick={closeOrderModal}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="panel-head">
          <div>
            <h2>{editingTrip ? `Chỉnh sửa đơn #${editingTrip.orderId}` : "Tạo đơn"}</h2>
            <p>{editingTrip ? "Cập nhật thông tin đơn hàng để điều phối chính xác." : "Điền thông tin đơn hàng."}</p>
          </div>
          <button className="ghost-btn" type="button" onClick={closeOrderModal}>
            x
          </button>
        </div>

        <form className="create-form" onSubmit={handleCreateOrder}>
          <div className="sheet-caption full">Thông tin đơn hàng</div>

          <div className="form-row form-row-3">
            <label>
              <span>Ngày giao hàng</span>
              <input
                type="date"
                value={form.date}
                onChange={(event) => updateField("date", event.target.value)}
                min={editingTrip ? undefined : new Date().toISOString().slice(0, 10)}
                className={formErrors.date ? "input-error" : ""}
              />
              {formErrors.date && <div className="field-error">{formErrors.date}</div>}
            </label>
            <label>
              <span>SĐT</span>
              <input
                value={form.customer_phone}
                onChange={(event) => updateField("customer_phone", event.target.value)}
                className={formErrors.customer_phone ? "input-error" : ""}
              />
              {formErrors.customer_phone && (
                <div className="field-error">{formErrors.customer_phone}</div>
              )}
            </label>

            <label>
              <span>Khách hàng</span>
              <input
                value={form.customer_name}
                onChange={(event) => updateField("customer_name", event.target.value)}
                className={formErrors.customer_name ? "input-error" : ""}
              />
              {formErrors.customer_name && (
                <div className="field-error">{formErrors.customer_name}</div>
              )}
            </label>
          </div>

          <div className="form-row form-row-2">
            <label>
              <span>Hàng hóa</span>
              <input
                value={form.cargo_name}
                onChange={(event) => updateField("cargo_name", event.target.value)}
                placeholder="Không bắt buộc"
              />
            </label>

            <label>
              <span>Khối lượng (kg)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.cargo_weight_kg}
                onChange={(event) => updateField("cargo_weight_kg", event.target.value)}
                className={formErrors.cargo_weight_kg ? "input-error" : ""}
              />
              {formErrors.cargo_weight_kg && (
                <div className="field-error">{formErrors.cargo_weight_kg}</div>
              )}
            </label>
          </div>

          <div className="form-row full" style={{ marginTop: 12, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="button"
              onClick={() => updateField("is_partner", !form.is_partner)}
              style={{
                border: '1px solid #cfd6e6',
                background: form.is_partner ? '#18227f' : '#fff',
                color: form.is_partner ? '#fff' : '#2a3144',
                borderRadius: 14,
                padding: '11px 14px',
                cursor: 'pointer',
                font: 'inherit',
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}
            >
              Đơn từ đối tác liên kết
            </button>
          </div>

          {form.is_partner && (
            <div className="form-row full" style={{ marginBottom: 16 }}>
              <label style={{ display: 'grid', gap: 6, fontSize: 14, color: '#2a3144' }}>
                <span>Đối tác</span>
                <select
                  value={form.partner_name}
                  onChange={(event) => updateField("partner_name", event.target.value)}
                  style={{ width: '100%', border: '1px solid #cfd6e6', borderRadius: 14, padding: '13px 14px', font: 'inherit', background: '#fff', outline: 'none', boxSizing: 'border-box' }}
                >
                  <option value="">Chọn đối tác</option>
                  {(partners || []).map((partner) => (
                    <option key={partner.id} value={partner.company_name}>
                      {partner.contact_person ? `${partner.company_name} - ${partner.contact_person}` : partner.company_name}
                    </option>
                  ))}
                </select>
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
                  <button
                    type="button"
                    onClick={() => removeTrip(index)}
                    style={{ border: 'none', background: '#fee2e2', color: '#b91c1c', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}
                  >
                    Xóa
                  </button>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <label style={{ display: 'grid', gap: 6, fontSize: 14, color: '#2a3144' }}>
                  <span>Nhóm xe</span>
                  <select
                    value={trip.vehicle_group_id}
                    onChange={(e) => {
                      updateTripField(index, 'vehicle_group_id', e.target.value);
                      updateTripField(index, 'plate', '');
                    }}
                    className={formErrors[`trip_${index}_vehicle_group_id`] ? 'input-error' : ''}
                    style={{ width: '100%', border: '1px solid #cfd6e6', borderRadius: 14, padding: '13px 14px', font: 'inherit', background: '#fff', outline: 'none', boxSizing: 'border-box' }}
                  >
                    <option value="">Chọn nhóm xe</option>
                    {vehicleGroups.map((group) => (
                      <option key={group.id} value={group.id}>{group.name}</option>
                    ))}
                  </select>
                  {formErrors[`trip_${index}_vehicle_group_id`] && (
                    <div className="field-error">{formErrors[`trip_${index}_vehicle_group_id`]}</div>
                  )}
                </label>

                <label style={{ display: 'grid', gap: 6, fontSize: 14, color: '#2a3144' }}>
                  <span>BKS</span>
                  <select
                    value={trip.plate}
                    onChange={(e) => updateTripField(index, 'plate', e.target.value)}
                    disabled={!trip.vehicle_group_id}
                    className={formErrors[`trip_${index}_plate`] ? 'input-error' : ''}
                    style={{ width: '100%', border: '1px solid #cfd6e6', borderRadius: 14, padding: '13px 14px', font: 'inherit', background: '#fff', outline: 'none', boxSizing: 'border-box' }}
                  >
                    <option value="">{trip.vehicle_group_id ? 'Chọn BKS' : 'Chọn nhóm xe trước'}</option>
                    {trip.plate && !getAvailablePlates(trip.vehicle_group_id).some((v) => v.plate_number === trip.plate) && (
                      <option value={trip.plate}>{trip.plate}</option>
                    )}
                    {getAvailablePlates(trip.vehicle_group_id).map((v) => (
                      <option key={v.id} value={v.plate_number}>
                        {v.assigned_driver_name ? `${v.plate_number} - ${v.assigned_driver_name}` : v.plate_number}
                      </option>
                    ))}
                  </select>
                  {formErrors[`trip_${index}_plate`] && (
                    <div className="field-error">{formErrors[`trip_${index}_plate`]}</div>
                  )}
                </label>

                <label style={{ display: 'grid', gap: 6, fontSize: 14, color: '#2a3144' }}>
                  <span>Quãng đường (km)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={trip.distance}
                    onChange={(e) => updateTripField(index, 'distance', e.target.value)}
                    className={formErrors[`trip_${index}_distance`] ? 'input-error' : ''}
                    style={{ width: '100%', border: '1px solid #cfd6e6', borderRadius: 14, padding: '13px 14px', font: 'inherit', background: '#fff', outline: 'none', boxSizing: 'border-box' }}
                  />
                  {formErrors[`trip_${index}_distance`] && (
                    <div className="field-error">{formErrors[`trip_${index}_distance`]}</div>
                  )}
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 4 }}>
                <label style={{ display: 'grid', gap: 6, fontSize: 14, color: '#2a3144' }}>
                  <span>Điểm lấy hàng</span>
                  <input
                    value={trip.pickup_address || ""}
                    onChange={(e) => updateTripField(index, 'pickup_address', e.target.value)}
                    placeholder="Địa chỉ lấy hàng"
                    className={formErrors[`trip_${index}_pickup_address`] ? 'input-error' : ''}
                    style={{ width: '100%', border: '1px solid #cfd6e6', borderRadius: 14, padding: '13px 14px', font: 'inherit', background: '#fff', outline: 'none', boxSizing: 'border-box' }}
                  />
                  {formErrors[`trip_${index}_pickup_address`] && (
                    <div className="field-error">{formErrors[`trip_${index}_pickup_address`]}</div>
                  )}
                </label>

                <label style={{ display: 'grid', gap: 6, fontSize: 14, color: '#2a3144' }}>
                  <span>Điểm giao hàng</span>
                  <input
                    value={trip.delivery_address || ""}
                    onChange={(e) => updateTripField(index, 'delivery_address', e.target.value)}
                    placeholder="Địa chỉ giao hàng"
                    className={formErrors[`trip_${index}_delivery_address`] ? 'input-error' : ''}
                    style={{ width: '100%', border: '1px solid #cfd6e6', borderRadius: 14, padding: '13px 14px', font: 'inherit', background: '#fff', outline: 'none', boxSizing: 'border-box' }}
                  />
                  {formErrors[`trip_${index}_delivery_address`] && (
                    <div className="field-error">{formErrors[`trip_${index}_delivery_address`]}</div>
                  )}
                </label>
              </div>
              {getTripFare(trip) && (
                <div style={{ fontSize: 13, color: '#18227f', fontWeight: 600 }}>
                  Cước: {Number(getTripFare(trip)).toLocaleString('vi-VN')} đ
                </div>
              )}
            </div>
          ))}

          <div className="full" style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
            <button
              type="button"
              onClick={addTrip}
              style={{ border: '1px dashed #18227f', background: '#eef1ff', color: '#18227f', borderRadius: 14, padding: '10px 20px', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}
            >
              + Thêm chuyến
            </button>
            {totalFare > 0 && (
              <div style={{ fontWeight: 700, fontSize: 15, color: '#0f1d70' }}>
                Tổng cước: {totalFare.toLocaleString('vi-VN')} đ
              </div>
            )}
          </div>

          <div className="form-row form-row-note">
            <label>
              <span>Ghi chú</span>
              <textarea
                value={form.note}
                onChange={(event) => updateField("note", event.target.value)}
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
            <button type="button" className="filter" onClick={closeOrderModal}>
              Cancel
            </button>
            <button type="submit" className="primary-btn" disabled={creating}>
              {creating ? (editingTrip ? "Updating..." : "Creating...") : (editingTrip ? "Update" : "Create")}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}