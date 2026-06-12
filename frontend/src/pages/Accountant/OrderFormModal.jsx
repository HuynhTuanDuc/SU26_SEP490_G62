import React, { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import dayjs from "dayjs";
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  message,
  Row,
  Select,
  Space,
  Statistic,
  Tag,
  Typography,
} from "antd";
import {
  DeleteOutlined,
  PlusOutlined,
  MinusCircleOutlined,
  CarOutlined,
  UserOutlined,
  DollarOutlined,
  ExclamationCircleOutlined,
} from "@ant-design/icons";
import "../../styles/OrderFormModal.css";

const { Title, Text } = Typography;
const { TextArea } = Input;

const EXPENSE_TYPES = [
  { value: "fuel", label: "Đổ dầu / Xăng" },
  { value: "toll", label: "BOT / Phí cầu đường" },
  { value: "parking", label: "Đỗ xe / Bến bãi" },
  { value: "repair", label: "Sửa xe" },
  { value: "maintenance", label: "Bảo dưỡng" },
  { value: "depreciation", label: "Khấu hao" },
  { value: "other", label: "Khác" },
];

const CUSTOMER_PAYMENT_OPTIONS = [
  { value: "cash", label: "Tiền mặt" },
  { value: "bank_transfer", label: "Chuyển khoản" },
  { value: "debt", label: "Ghi Nợ" },
];

const DRIVER_PAYMENT_OPTIONS = [
  { value: "driver_holding", label: "Tài xế nợ tiền" },
  { value: "company_received", label: "Đã thu đủ" },
];

let tempIdCounter = Date.now();

const newTempId = () => `temp-${++tempIdCounter}`;
const newExpenseId = () => `exp-${++tempIdCounter}`;

const isPhoneValid = (value) => /^\d{7,15}$/.test(String(value || "").replace(/[\s.-]/g, ""));

const formatCurrency = (value) =>
  String(value || 0)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");

const parseCurrency = (value) =>
  Number(String(value).replace(/,/g, "")) || 0;

const newShipment = () => ({
  id: newTempId(),
  vehicle_plate: null,
  driver_name: null,
  pickup_addresses: [""],
  delivery_address: "",
  cargo_name: "",
  cargo_weight: 0,
  cargo_fee: 0,
  ticket_fee: 0,
  payment_type: "cash",
  driver_payment_state: "company_received",
  notes: "",
  expenses: [],
});

const newExpense = () => ({
  id: newExpenseId(),
  expense_type: "fuel",
  amount: 0,
  description: "",
});

const buildLookupMaps = (vehicles = [], drivers = []) => {
  const vehicleByPlate = new Map();
  const driverByName = new Map();

  vehicles.forEach((v) => vehicleByPlate.set(v.plate_number, v));
  drivers.forEach((d) => driverByName.set(d.full_name, d));

  return { vehicleByPlate, driverByName };
};

const ExpenseRow = ({ expense, onRemove, onChange }) => {
  const [amountError, setAmountError] = useState(false);

  const handleAmountChange = (val) => {
    const parsed = parseCurrency(val);
    setAmountError(parsed > 0 ? false : expense.amount > 0 ? false : true);
    onChange({ ...expense, amount: parsed });
  };

  return (
    <div className="expense-row">
      <Select
        value={expense.expense_type}
        onChange={(val) => onChange({ ...expense, expense_type: val })}
        options={EXPENSE_TYPES}
        style={{ width: 160 }}
        size="small"
      />
      <InputNumber
        value={expense.amount}
        onChange={handleAmountChange}
        placeholder="Số tiền"
        min={0}
        formatter={formatCurrency}
        parser={parseCurrency}
        style={{ width: 130 }}
        size="small"
        status={amountError ? "error" : undefined}
      />
      <Input
        value={expense.description}
        onChange={(e) => onChange({ ...expense, description: e.target.value })}
        placeholder="Mô tả"
        size="small"
        style={{ flex: 1 }}
      />
      <Button
        danger
        type="text"
        icon={<MinusCircleOutlined />}
        onClick={onRemove}
        size="small"
      />
    </div>
  );
};

const ShipmentCard = ({
  shipment,
  index,
  canRemove,
  vehicles,
  drivers,
  lookupMaps,
  onUpdate,
  onRemove,
  onAddExpense,
  onRemoveExpense,
  onChangeExpense,
}) => {
  const handleVehicleChange = (plate) => {
    const vehicle = lookupMaps.vehicleByPlate.get(plate);
    onUpdate({
      ...shipment,
      vehicle_plate: plate || null,
      driver_name: vehicle?.assigned_driver_name || null,
      _driverLocked: !!plate,
    });
  };

  const handleDriverChange = (name) => {
    if (shipment._driverLocked) return;
    const driver = lookupMaps.driverByName.get(name);
    onUpdate({
      ...shipment,
      driver_name: name,
      vehicle_plate: driver?.plate_number || shipment.vehicle_plate,
    });
  };

  const addPickup = () => {
    onUpdate({ ...shipment, pickup_addresses: [...shipment.pickup_addresses, ""] });
  };

  const removePickup = (pi) => {
    if (shipment.pickup_addresses.length <= 1) return;
    onUpdate({
      ...shipment,
      pickup_addresses: shipment.pickup_addresses.filter((_, i) => i !== pi),
    });
  };

  const updatePickup = (pi, value) => {
    const updated = [...shipment.pickup_addresses];
    updated[pi] = value;
    onUpdate({ ...shipment, pickup_addresses: updated });
  };

  const totalShipmentFee = (shipment.cargo_fee || 0) + (shipment.ticket_fee || 0);

  const isDriverHolding = shipment.driver_payment_state === "driver_holding";

  return (
    <Card
      className="shipment-card"
      styles={{ body: { padding: 0 } }}
    >
      {/* Card header bar */}
      <div
        style={{
          padding: "8px 16px",
          borderBottom: "1px solid #d3e4fe",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Space size={8}>
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: "#00236f",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              fontWeight: 700,
            }}
          >
            {index + 1}
          </div>
          <Text strong style={{ fontSize: 14, color: "#00236f" }}>Chuyến {index + 1}</Text>
          {shipment.vehicle_plate && (
            <Tag icon={<CarOutlined />} style={{ marginLeft: 4 }}>{shipment.vehicle_plate}</Tag>
          )}
          {shipment.driver_name && (
            <Tag icon={<UserOutlined />}>{shipment.driver_name}</Tag>
          )}
        </Space>
        <Space size={8}>
          {totalShipmentFee > 0 && (
            <Tag
              color={isDriverHolding ? "orange" : "blue"}
              icon={<DollarOutlined />}
              style={{ fontWeight: 600, fontSize: 13 }}
            >
              {totalShipmentFee.toLocaleString()}đ
            </Tag>
          )}
          {isDriverHolding && (
            <Tag color="orange" icon={<ExclamationCircleOutlined />} style={{ fontSize: 12 }}>
              TX nợ
            </Tag>
          )}
          {canRemove && (
            <Button danger type="text" icon={<DeleteOutlined />} onClick={onRemove} />
          )}
        </Space>
      </div>

      {/* Card body */}
      <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Row 1: Xe · Tài xế */}
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item label="Xe" style={{ marginBottom: 0 }}>
              <Select
                allowClear
                showSearch
                value={shipment.vehicle_plate}
                onChange={handleVehicleChange}
                placeholder="Chọn xe"
                options={vehicles.map((v) => ({
                  value: v.plate_number,
                  label: `${v.plate_number}${v.vehicle_group_name ? ` · ${v.vehicle_group_name}` : ""}`,
                }))}
                optionFilterProp="label"
                size="middle"
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="Tài xế" style={{ marginBottom: 0 }}>
              <Select
                allowClear
                showSearch
                value={shipment.driver_name}
                onChange={handleDriverChange}
                placeholder={shipment._driverLocked ? "Theo xe" : "Chọn tài xế"}
                options={drivers.map((d) => ({
                  value: d.full_name,
                  label: `${d.full_name}${d.plate_number ? ` · ${d.plate_number}` : ""}`,
                }))}
                optionFilterProp="label"
                disabled={!!shipment._driverLocked}
                size="middle"
              />
            </Form.Item>
          </Col>
        </Row>

        {/* Row 2: Khối lượng · Tên hàng */}
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item label="Khối lượng (kg)" style={{ marginBottom: 0 }}>
              <InputNumber
                value={shipment.cargo_weight}
                onChange={(val) => onUpdate({ ...shipment, cargo_weight: val || 0 })}
                min={0}
                style={{ width: "100%" }}
                formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                parser={(v) => Number(String(v).replace(/,/g, ""))}
                size="middle"
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="Tên hàng" style={{ marginBottom: 0 }}>
              <Input
                value={shipment.cargo_name}
                onChange={(e) => onUpdate({ ...shipment, cargo_name: e.target.value })}
                placeholder="Có thể bỏ trống"
                size="middle"
              />
            </Form.Item>
          </Col>
        </Row>

        {/* Row 3: Điểm lấy / giao — timeline style */}
        <div style={{ paddingLeft: 0 }}>
          {/* Timeline: pickup points */}
          <div style={{ position: "relative", paddingLeft: 24 }}>
            {/* Vertical dashed line */}
            <div
              style={{
                position: "absolute",
                left: 7,
                top: 16,
                bottom: 16,
                width: 1,
                borderLeft: "2px dashed #c5c5d3",
              }}
            />
            <Form.Item label="Điểm lấy hàng" style={{ marginBottom: 8 }}>
              {shipment.pickup_addresses.map((addr, pi) => (
                <div
                  key={`pickup-${pi}`}
                  style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, position: "relative" }}
                >
                  {/* Green dot */}
                  <div
                    style={{
                      position: "absolute",
                      left: -17,
                      top: 13,
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: "#27c38a",
                      border: "2px solid #fff",
                      boxShadow: "0 0 0 2px #6ffbbe",
                      zIndex: 1,
                    }}
                  />
                  <div
                    style={{
                      background: "#e5eeff",
                      color: "#00236f",
                      fontSize: 10,
                      fontWeight: 600,
                      padding: "2px 6px",
                      borderRadius: 4,
                      whiteSpace: "nowrap",
                    }}
                  >
                    Lấy {pi + 1}
                  </div>
                  <Input
                    value={addr}
                    onChange={(e) => updatePickup(pi, e.target.value)}
                    placeholder={`Địa chỉ lấy ${pi + 1}`}
                    size="middle"
                    style={{ flex: 1 }}
                  />
                  {shipment.pickup_addresses.length > 1 && (
                    <Button danger type="text" icon={<MinusCircleOutlined />} size="small" onClick={() => removePickup(pi)} />
                  )}
                </div>
              ))}
              <Button
                type="dashed"
                size="small"
                icon={<PlusOutlined />}
                onClick={addPickup}
                block
                style={{ marginTop: 4 }}
              >
                Thêm điểm lấy
              </Button>
            </Form.Item>

            {/* Delivery point */}
            <div style={{ position: "relative", marginTop: 8 }}>
              {/* Red dot */}
              <div
                style={{
                  position: "absolute",
                  left: -17,
                  top: 13,
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: "#ba1a1a",
                  border: "2px solid #fff",
                  boxShadow: "0 0 0 2px #ffdad6",
                  zIndex: 1,
                }}
              />
              <Form.Item label={<span style={{ color: "#ba1a1a", textTransform: "uppercase", fontWeight: 600, fontSize: 11 }}>Điểm giao hàng</span>} style={{ marginBottom: 0 }}>
                <Input
                  value={shipment.delivery_address}
                  onChange={(e) => onUpdate({ ...shipment, delivery_address: e.target.value })}
                  placeholder="Địa chỉ giao cuối cùng"
                  size="middle"
                />
              </Form.Item>
            </div>
          </div>
        </div>

        {/* Row 4: Cước phí */}
        <div style={{ paddingTop: 8, borderTop: "1px solid #d3e4fe" }}>
          <div style={{ textAlign: "center", fontSize: 11, fontWeight: 600, color: "#757682", textTransform: "uppercase", marginBottom: 12 }}>
            Cước phí
          </div>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="Cước xe / Doanh thu (VND)" style={{ marginBottom: 8 }}>
                <InputNumber
                  value={shipment.cargo_fee}
                  onChange={(val) => onUpdate({ ...shipment, cargo_fee: parseCurrency(val) })}
                  min={0}
                  style={{ width: "100%" }}
                  formatter={formatCurrency}
                  parser={parseCurrency}
                  size="middle"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Vé / Phụ phí (VND)" style={{ marginBottom: 8 }}>
                <InputNumber
                  value={shipment.ticket_fee}
                  onChange={(val) => onUpdate({ ...shipment, ticket_fee: parseCurrency(val) })}
                  min={0}
                  style={{ width: "100%" }}
                  formatter={formatCurrency}
                  parser={parseCurrency}
                  size="middle"
                />
              </Form.Item>
            </Col>
          </Row>
          {/* 2-col summary bg */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              background: "#e5eeff",
              borderRadius: 8,
              overflow: "hidden",
              border: "1px solid #d3e4fe",
            }}
          >
            <div style={{ textAlign: "center", padding: "8px 8px", borderRight: "1px solid #d3e4fe" }}>
              <div style={{ fontSize: 10, color: "#444651", marginBottom: 2 }}>Doanh thu ghi nhận</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#00236f" }}>
                {(shipment.cargo_fee || 0).toLocaleString()}đ
              </div>
            </div>
            <div style={{ textAlign: "center", padding: "8px 8px" }}>
              <div style={{ fontSize: 10, color: "#444651", marginBottom: 2 }}>Thực thu (cước + vé)</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0058be" }}>
                {totalShipmentFee.toLocaleString()}đ
              </div>
            </div>
          </div>
        </div>

        {/* Row 5: Thanh toán */}
        <div style={{ paddingTop: 8, borderTop: "1px solid #d3e4fe" }}>
          <div style={{ textAlign: "center", fontSize: 11, fontWeight: 600, color: "#757682", textTransform: "uppercase", marginBottom: 12 }}>
            Thanh toán
          </div>

          <Row gutter={12}>
            {/* Khách thanh toán */}
            <Col span={12}>
              <Form.Item style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  {CUSTOMER_PAYMENT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => onUpdate({ ...shipment, payment_type: opt.value })}
                      style={{
                        flex: 1,
                        padding: "8px 4px",
                        borderRadius: 8,
                        border: `1px solid ${shipment.payment_type === opt.value ? "#00236f" : "#757682"}`,
                        background: shipment.payment_type === opt.value ? "#00236f" : "transparent",
                        color: shipment.payment_type === opt.value ? "#fff" : "#0b1c30",
                        cursor: "pointer",
                        fontSize: 11,
                        fontWeight: 600,
                        transition: "all 0.15s",
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </Form.Item>
            </Col>

            {/* Tài xế */}
            <Col span={12}>
              {(shipment.payment_type === "cash" || shipment.payment_type === "bank_transfer") && (
                <Form.Item style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    {DRIVER_PAYMENT_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => onUpdate({ ...shipment, driver_payment_state: opt.value })}
                        style={{
                          flex: 1,
                          padding: "8px 4px",
                          borderRadius: 8,
                          border: `1px solid ${shipment.driver_payment_state === opt.value ? "#0058be" : "#757682"}`,
                          background: shipment.driver_payment_state === opt.value ? "#0058be" : "transparent",
                          color: shipment.driver_payment_state === opt.value ? "#fff" : "#0b1c30",
                          cursor: "pointer",
                          fontSize: 11,
                          fontWeight: 600,
                          transition: "all 0.15s",
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </Form.Item>
              )}
            </Col>
          </Row>

          {/* Alert messages */}
          {shipment.payment_type === "debt" && (
            <Alert type="info" showIcon message="Đơn ghi nợ — công nợ được theo dõi trong bảng công nợ." style={{ marginTop: 4 }} />
          )}
          {isDriverHolding && (
            <Alert type="warning" showIcon message="Tài xế đang giữ tiền — đã thu nhưng chưa nộp công ty." style={{ marginTop: 4 }} />
          )}
        </div>

        {/* Row 6: Chi phí chuyến */}
        <div style={{ paddingTop: 8, borderTop: "1px solid #d3e4fe" }}>
          <div style={{ textAlign: "center", fontSize: 11, fontWeight: 600, color: "#757682", textTransform: "uppercase", marginBottom: 12 }}>
            Chi phí chuyến
          </div>
          <Form.Item style={{ marginBottom: 8 }}>
            <div>
              {(shipment.expenses || []).map((expense) => (
                <ExpenseRow
                  key={expense.id}
                  expense={expense}
                  onRemove={() => onRemoveExpense(expense.id)}
                  onChange={(updated) => onChangeExpense(expense.id, updated)}
                />
              ))}
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={onAddExpense}
                block
                size="small"
                style={{ marginTop: 4 }}
              >
                Thêm chi phí
              </Button>
            </div>
          </Form.Item>

          {/* Ghi chú chuyến */}
          <Form.Item label="Ghi chú chuyến" style={{ marginBottom: 0 }}>
            <TextArea
              value={shipment.notes}
              onChange={(e) => onUpdate({ ...shipment, notes: e.target.value })}
              rows={2}
              placeholder="Ghi chú thêm cho chuyến này..."
              size="middle"
            />
          </Form.Item>
        </div>
      </div>
    </Card>
  );
};

export default function OrderFormModal({ isOpen, onClose, onOrderCreated }) {
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const [orderDate, setOrderDate] = useState(null);
  const [isPartner, setIsPartner] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerCompany, setCustomerCompany] = useState("");
  const [shipments, setShipments] = useState([newShipment()]);
  const [orderNotes, setOrderNotes] = useState("");

  const [fieldErrors, setFieldErrors] = useState({
    customerName: false,
    customerPhone: false,
    orderDate: false,
  });

  const clearFieldError = (field) => {
    setFieldErrors((prev) => ({ ...prev, [field]: false }));
    setFormError("");
  };

  const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:9999";
  const token = localStorage.getItem("token");

  const lookupMaps = useMemo(() => buildLookupMaps(vehicles, drivers), [vehicles, drivers]);

  useEffect(() => {
    if (!isOpen) return;

    const fetchLookup = async () => {
      try {
        const response = await fetch(`${API_BASE}/accountant/orders/lookup`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || data.details || "Không tải được danh sách xe/tài xế");
        setVehicles(data.vehicles || []);
        setDrivers(data.drivers || []);
      } catch (err) {
        message.error(err.message || "Không tải được dữ liệu xe/tài xế.");
      }
    };

    fetchLookup();
    setShipments([newShipment()]);
    setOrderDate(null);
    setIsPartner(false);
    setCustomerName("");
    setCustomerPhone("");
    setCustomerCompany("");
    setOrderNotes("");
    setFormError("");
    setFieldErrors({ customerName: false, customerPhone: false, orderDate: false });
  }, [API_BASE, isOpen, token]);

  if (!isOpen) return null;

  const updateShipment = (index, updated) => {
    const next = [...shipments];
    next[index] = updated;
    setShipments(next);
  };

  const removeShipment = (index) => {
    if (shipments.length <= 1) return;
    setShipments(shipments.filter((_, i) => i !== index));
  };

  const addShipment = () => {
    setShipments([...shipments, newShipment()]);
  };

  const addExpense = (shipmentIndex) => {
    const next = [...shipments];
    next[shipmentIndex] = {
      ...next[shipmentIndex],
      expenses: [...(next[shipmentIndex].expenses || []), newExpense()],
    };
    setShipments(next);
  };

  const removeExpense = (shipmentIndex, expenseId) => {
    const next = [...shipments];
    next[shipmentIndex] = {
      ...next[shipmentIndex],
      expenses: next[shipmentIndex].expenses.filter((e) => e.id !== expenseId),
    };
    setShipments(next);
  };

  const changeExpense = (shipmentIndex, expenseId, updated) => {
    const next = [...shipments];
    next[shipmentIndex] = {
      ...next[shipmentIndex],
      expenses: next[shipmentIndex].expenses.map((e) =>
        e.id === expenseId ? updated : e
      ),
    };
    setShipments(next);
  };

  const totalRevenue = shipments.reduce((sum, s) => sum + (s.cargo_fee || 0), 0);
  const totalCargoFee = shipments.reduce((sum, s) => sum + (s.cargo_fee || 0), 0);
  const totalTicketFee = shipments.reduce((sum, s) => sum + (s.ticket_fee || 0), 0);
  const totalExpenses = shipments.reduce(
    (sum, s) => sum + (s.expenses || []).reduce((es, e) => es + (e.amount || 0), 0),
    0
  );
  const totalDriverDebt = shipments.reduce(
    (sum, s) => sum + (s.driver_payment_state === "driver_holding" ? (s.cargo_fee || 0) : 0),
    0
  );

  const handleSubmit = async () => {
    setFormError("");
    const errors = {};

    if (!customerName.trim()) {
      errors.customerName = true;
    }
    if (!customerPhone.trim()) {
      errors.customerPhone = true;
    } else if (!isPhoneValid(customerPhone)) {
      errors.customerPhone = true;
      setFormError("Số điện thoại không hợp lệ (cần 7-15 chữ số, không chứa chữ cái).");
      setFieldErrors((prev) => ({ ...prev, ...errors }));
      return;
    }
    if (orderDate && orderDate.isAfter(dayjs(), "day")) {
      errors.orderDate = true;
      setFormError("Ngày đơn không được lớn hơn ngày hiện tại.");
      setFieldErrors((prev) => ({ ...prev, ...errors }));
      return;
    }

    const shipmentErrors = [];
    for (let i = 0; i < shipments.length; i += 1) {
      const s = shipments[i];
      const se = {};
      const validPickups = (s.pickup_addresses || []).filter((p) => String(p || "").trim() !== "");
      if (validPickups.length === 0) se.missingPickup = true;
      if (!s.delivery_address?.trim()) se.missingDelivery = true;
      if ((s.cargo_fee || 0) < 0) se.negativeCargoFee = true;
      if ((s.ticket_fee || 0) < 0) se.negativeTicketFee = true;
      if ((s.cargo_weight || 0) < 0) se.negativeWeight = true;

      const expenseErrors = (s.expenses || []).map((e, ei) => {
        if (e.amount && e.amount < 0) return ei;
        return -1;
      }).filter((ei) => ei >= 0);

      if (Object.keys(se).length > 0 || expenseErrors.length > 0) {
        shipmentErrors[i] = { ...se, expenseErrors };
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors((prev) => ({ ...prev, ...errors }));
      if (!formError) setFormError("Vui lòng kiểm tra lại thông tin bắt buộc.");
      return;
    }
    if (shipmentErrors.length > 0) {
      const firstErrIdx = shipmentErrors.findIndex((e) => !!e);
      if (firstErrIdx >= 0) {
        const err = shipmentErrors[firstErrIdx];
        const parts = [`Chuyến ${firstErrIdx + 1}:`];
        if (err.missingPickup) parts.push("thiếu điểm lấy hàng");
        if (err.missingDelivery) parts.push("thiếu điểm giao hàng");
        if (err.negativeCargoFee) parts.push("cước xe không được âm");
        if (err.negativeTicketFee) parts.push("vé phí không được âm");
        if (err.negativeWeight) parts.push("khối lượng không được âm");
        if (err.expenseErrors?.length > 0) {
          parts.push(`chi phí dòng ${err.expenseErrors.map((ei) => ei + 1).join(", ")} không hợp lệ`);
        }
        setFormError(parts.join(" "));
      }
      setFieldErrors((prev) => ({ ...prev, shipmentErrors }));
      return;
    }

    const payload = {
      order_date: orderDate ? orderDate.format("YYYY-MM-DD") : null,
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_company: customerCompany || null,
      notes: orderNotes || null,
      shipments: shipments.map((s) => ({
        vehicle_plate: s.vehicle_plate || null,
        driver_name: s.driver_name || null,
        pickup_addresses: (s.pickup_addresses || []).filter((p) => String(p || "").trim() !== ""),
        delivery_address: s.delivery_address,
        cargo_name: s.cargo_name || null,
        cargo_weight: Number(s.cargo_weight || 0),
        cargo_fee: Number(s.cargo_fee || 0),
        ticket_fee: Number(s.ticket_fee || 0),
        revenue: Number(s.cargo_fee || 0),
        // payment_type: gửi thực tế per shipment (cash / bank_transfer / debt)
        payment_type: s.payment_type || "cash",
        driver_payment_state: s.driver_payment_state || "company_received",
        notes: s.notes || null,
        expenses: (s.expenses || [])
          .filter((e) => e.amount > 0)
          .map((e) => ({
            expense_type: e.expense_type,
            amount: Number(e.amount),
            description: e.description || null,
          })),
      })),
    };

    setSubmitting(true);
    try {
      const response = await fetch(`${API_BASE}/accountant/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || data.details || "Không thể tạo đơn hàng.");
      message.success(`Đã lưu đơn với ${shipments.length} chuyến.`);
      setShipments([newShipment()]);
      setCustomerName("");
      setCustomerPhone("");
      setCustomerCompany("");
      setOrderDate(null);
      setOrderNotes("");
      setFieldErrors({ customerName: false, customerPhone: false, orderDate: false });
      onOrderCreated?.(data.order);
      onClose();
    } catch (err) {
      setFormError(err.message || "Đã xảy ra lỗi hệ thống.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer
      open={isOpen}
      onClose={onClose}
      width={1280}
      title={
        <Space>
          <Text strong style={{ fontSize: 16 }}>Nhập đơn hoàn thành</Text>
        </Space>
      }
      className="accountant-order-drawer"
      footer={
        <div className="drawer-footer-actions">
          <Space>
            <Button onClick={onClose}>Hủy</Button>
            <Button type="primary" loading={submitting} onClick={handleSubmit}>
              Lưu đơn · {totalCargoFee.toLocaleString()}đ
            </Button>
          </Space>
        </div>
      }
    >
      <div className="accountant-order-shell">
        {formError && (
          <Alert type="error" showIcon message={formError} style={{ marginBottom: 16 }} />
        )}

        <Card className="order-info-card" styles={{ header: { background: "#00236f", color: "#fff", padding: "8px 16px" }, body: { padding: 16 } }}>
          <div
            style={{
              background: "#00236f",
              color: "#fff",
              padding: "8px 16px",
              margin: "-16px -16px 16px -16px",
              fontSize: 14,
              fontWeight: 600,
              borderRadius: "8px 8px 0 0",
            }}
          >
            Thông tin đơn hàng
          </div>

          {/* Row 1: Loại khách — compact, không Form.Item */}
          <div style={{ textAlign: "right", marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: "#757682", fontWeight: 500, marginRight: 8 }}>Loại khách</span>
            <span
              style={{
                display: "inline-flex",
                background: "#e5eeff",
                borderRadius: 6,
                padding: 2,
                gap: 2,
              }}
            >
              <button
                type="button"
                onClick={() => setIsPartner(false)}
                style={{
                  padding: "4px 8px",
                  borderRadius: 4,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 600,
                  transition: "all 0.15s",
                  background: !isPartner ? "#00236f" : "transparent",
                  color: !isPartner ? "#fff" : "#444651",
                }}
              >
                Khách thường
              </button>
              <button
                type="button"
                onClick={() => setIsPartner(true)}
                style={{
                  padding: "4px 8px",
                  borderRadius: 4,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 600,
                  transition: "all 0.15s",
                  background: isPartner ? "#00236f" : "transparent",
                  color: isPartner ? "#fff" : "#444651",
                }}
              >
                Đối tác
              </button>
            </span>
          </div>

          {/* Row 2: Ngày · Tên khách hàng input */}
          <Row gutter={12} align="middle">
            <Col span={6}>
              <Form.Item label="Ngày đơn *" style={{ marginBottom: 0 }}>
                <DatePicker
                  value={orderDate}
                  onChange={(val) => {
                    setOrderDate(val);
                    clearFieldError("orderDate");
                  }}
                  format="DD/MM/YYYY"
                  style={{ width: "100%" }}
                  placeholder="Chọn ngày"
                  disabledDate={(current) => current && current > dayjs().endOf("day")}
                  status={fieldErrors.orderDate ? "error" : undefined}
                  size="middle"
                />
              </Form.Item>
            </Col>
            <Col span={18}>
              <Form.Item label="Tên khách hàng *" style={{ marginBottom: 0 }}>
                <Input
                  value={customerName}
                  onChange={(e) => {
                    setCustomerName(e.target.value);
                    clearFieldError("customerName");
                  }}
                  placeholder="Ví dụ: Nguyễn Văn A"
                  status={fieldErrors.customerName ? "error" : undefined}
                  size="middle"
                />
              </Form.Item>
            </Col>
          </Row>

          {/* Row 2: SĐT · Công ty */}
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="Số điện thoại *" style={{ marginBottom: 8 }}>
                <Input
                  value={customerPhone}
                  onChange={(e) => {
                    setCustomerPhone(e.target.value);
                    clearFieldError("customerPhone");
                  }}
                  placeholder="0912345678"
                  status={fieldErrors.customerPhone ? "error" : undefined}
                  maxLength={15}
                  size="middle"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Công ty" style={{ marginBottom: 8 }}>
                <Input
                  value={customerCompany}
                  onChange={(e) => setCustomerCompany(e.target.value)}
                  placeholder="Tên công ty khách hàng (không bắt buộc)"
                  size="middle"
                />
              </Form.Item>
            </Col>
          </Row>

          {/* Row 3: Ghi chú · Số chuyến */}
          <Row gutter={12} align="middle">
            <Col span={18}>
              <Form.Item label="Ghi chú đơn hàng" style={{ marginBottom: 0 }}>
                <TextArea
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  rows={2}
                  placeholder="Ghi chú chung cho toàn đơn..."
                  size="middle"
                />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="Số chuyến" style={{ marginBottom: 0 }}>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: "#00236f",
                    lineHeight: "32px",
                    textAlign: "center",
                    background: "#e5eeff",
                    borderRadius: 8,
                    border: "1px solid #d3e4fe",
                  }}
                >
                  {shipments.length} chuyến
                </div>
              </Form.Item>
            </Col>
          </Row>
        </Card>

        <div className="shipments-list">
          {shipments.map((shipment, index) => (
            <ShipmentCard
              key={shipment.id}
              shipment={shipment}
              index={index}
              canRemove={shipments.length > 1}
              vehicles={vehicles}
              drivers={drivers}
              lookupMaps={lookupMaps}
              onUpdate={(updated) => updateShipment(index, updated)}
              onRemove={() => removeShipment(index)}
              onAddExpense={() => addExpense(index)}
              onRemoveExpense={(expenseId) => removeExpense(index, expenseId)}
              onChangeExpense={(expenseId, updated) => changeExpense(index, expenseId, updated)}
            />
          ))}

          <Button
            type="dashed"
            onClick={addShipment}
            icon={<PlusOutlined />}
            block
            size="large"
            className="add-shipment-btn"
          >
            + Thêm chuyến xe
          </Button>
        </div>

        <Card className="summary-card" title="Tổng kết đơn hàng">
          <Row gutter={24}>
            <Col span={6}>
              <Statistic
                title="Tổng cước xe"
                value={totalCargoFee}
                precision={0}
                prefix="₫"
                valueStyle={{ color: "#1a2680" }}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="Tổng vé / phí"
                value={totalTicketFee}
                precision={0}
                prefix="₫"
                valueStyle={{ color: "#646cff" }}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="Thực thu (cước + vé)"
                value={totalRevenue}
                precision={0}
                prefix="₫"
                valueStyle={{ color: "#52c41a" }}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="Tổng chi phí chuyến"
                value={totalExpenses}
                precision={0}
                prefix="₫"
                valueStyle={{ color: "#fa8c16" }}
              />
            </Col>
            {totalDriverDebt > 0 && (
              <Col span={6}>
                <Statistic
                  title="Tài xế đang nợ"
                  value={totalDriverDebt}
                  precision={0}
                  prefix="₫"
                  valueStyle={{ color: "#cf1322" }}
                />
              </Col>
            )}
          </Row>
        </Card>
      </div>
    </Drawer>
  );
}

OrderFormModal.propTypes = {
  isOpen: PropTypes.bool,
  onClose: PropTypes.func,
  onOrderCreated: PropTypes.func,
};
