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
import { apiRequest } from "../../services/apiClient";

const { Text } = Typography;
const { TextArea } = Input;

const EXPENSE_TYPES = [
  { value: "toll",    label: "BOT / Phí cầu đường (khách chịu)", group: "pass_through" },
  { value: "parking", label: "Đỗ xe / Bến bãi (khách chịu)",     group: "pass_through" },
  { value: "etc",     label: "Phí ETC (khách chịu)",              group: "pass_through" },
  { value: "fuel",    label: "Xăng dầu / nhiên liệu (cty chịu)", group: "company" },
  { value: "repair",  label: "Sửa xe (cty chịu)",                 group: "company" },
];

const PASS_THROUGH_TYPES = new Set(["toll", "parking", "etc"]);

const CUSTOMER_PAYMENT_OPTIONS = [
  { value: "cash", label: "Tiền mặt" },
  { value: "bank_transfer", label: "Chuyển khoản" },
  { value: "client_credit", label: "Ghi Nợ" },
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

const CurrencyInput = ({ value, onChange, size = "middle", ...props }) => {
  const [display, setDisplay] = useState(() => formatCurrency(value));
  useEffect(() => {
    setDisplay(formatCurrency(value));
  }, [value]);
  return (
    <Input
      {...props}
      value={display}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^0-9]/g, "");
        setDisplay(raw ? formatCurrency(raw) : "");
        onChange(raw ? parseCurrency(raw) : 0);
      }}
      onBlur={() => {
        const num = parseCurrency(display);
        setDisplay(formatCurrency(num));
        onChange(num);
      }}
      size={size}
    />
  );
};

const newShipment = () => ({
  id: newTempId(),
  vehicle_group_id: null,
  vehicle_id: null,
  vehicle_plate: null,
  driver_id: null,
  driver_name: null,
  pickup_addresses: [""],
  delivery_address: "",
  cargo_name: "",
  cargo_weight: 0,
  cargo_fee: 0,
  payment_type: "cash",
  driver_payment_state: "company_received",
  notes: "",
  expenses: [],
});

const newExpense = () => ({
  id: newExpenseId(),
  expense_type: "toll",
  amount: 0,
  description: "",
});

const buildLookupMaps = (vehicles = [], drivers = []) => {
  const vehicleById = new Map();
  const vehicleByPlate = new Map();
  const driverById = new Map();
  const driverByName = new Map();

  vehicles.forEach((v) => {
    vehicleById.set(Number(v.id), v);
    vehicleByPlate.set(v.plate_number, v);
  });
  drivers.forEach((d) => {
    driverById.set(Number(d.id), d);
    driverByName.set(d.full_name, d);
  });

  return { vehicleById, vehicleByPlate, driverById, driverByName };
};

const ExpenseRow = ({ expense, onRemove, onChange }) => {
  return (
    <div className="expense-row">
      <Select
        value={expense.expense_type}
        onChange={(val) => onChange({ ...expense, expense_type: val })}
        options={EXPENSE_TYPES}
        style={{ width: 160 }}
        size="small"
      />
      <CurrencyInput
        value={expense.amount}
        onChange={(val) => onChange({ ...expense, amount: val })}
        placeholder="Số tiền"
        style={{ width: 130 }}
        size="small"
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
  vehicleGroups,
  vehicles,
  drivers,
  lookupMaps,
  onUpdate,
  onRemove,
  onAddExpense,
  onRemoveExpense,
  onChangeExpense,
}) => {
  const filteredVehicles = useMemo(() => {
    if (!shipment.vehicle_group_id) return [];
    return vehicles.filter((v) => Number(v.vehicle_group_id) === Number(shipment.vehicle_group_id));
  }, [shipment.vehicle_group_id, vehicles]);

  const filteredDrivers = useMemo(() => {
    if (!shipment.vehicle_group_id) return [];
    return drivers.filter((d) => Number(d.vehicle_group_id) === Number(shipment.vehicle_group_id));
  }, [shipment.vehicle_group_id, drivers]);

  const handleGroupChange = (groupId) => {
    onUpdate({
      ...shipment,
      vehicle_group_id: groupId || null,
      vehicle_id: null,
      vehicle_plate: null,
      driver_id: null,
      driver_name: null,
    });
  };

  const handleVehicleChange = (vehicleId) => {
    const vehicle = lookupMaps.vehicleById.get(Number(vehicleId));
    const assignedDriver = vehicle?.assigned_driver_id
      ? lookupMaps.driverById.get(Number(vehicle.assigned_driver_id))
      : null;
    onUpdate({
      ...shipment,
      vehicle_id: vehicle?.id || null,
      vehicle_plate: vehicle?.plate_number || null,
      driver_id: assignedDriver?.id || null,
      driver_name: assignedDriver?.full_name || null,
    });
  };

  const handleDriverChange = (driverId) => {
    const driver = lookupMaps.driverById.get(Number(driverId));
    const vehicle = driver?.vehicle_id
      ? lookupMaps.vehicleById.get(Number(driver.vehicle_id))
      : null;
    onUpdate({
      ...shipment,
      driver_id: driver?.id || null,
      driver_name: driver?.full_name || null,
      vehicle_id: vehicle?.id || null,
      vehicle_plate: vehicle?.plate_number || null,
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

  const passThrough = (shipment.expenses || []).reduce(
    (sum, e) => sum + (PASS_THROUGH_TYPES.has(e.expense_type) ? (e.amount || 0) : 0),
    0
  );
  const actualPrice = (shipment.cargo_fee || 0) + passThrough;

  const isDriverHolding = shipment.driver_payment_state === "driver_holding";

  return (
    <Card
      className="shipment-card"
      styles={{ body: { padding: 0 } }}
    >
      {}
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
          {actualPrice > 0 && (
            <Tag
              color={isDriverHolding ? "orange" : "blue"}
              icon={<DollarOutlined />}
              style={{ fontWeight: 600, fontSize: 13 }}
            >
              {actualPrice.toLocaleString()}đ
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

      {}
      <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 16 }}>

        {}
        <Row gutter={12}>
          <Col span={8}>
            <Form.Item label="Nhóm xe" style={{ marginBottom: 0 }}>
              <Select
                allowClear
                showSearch
                value={shipment.vehicle_group_id}
                onChange={handleGroupChange}
                placeholder="Chọn nhóm xe"
                options={vehicleGroups.map((g) => ({
                  value: g.id,
                  label: `${g.name}${g.description ? ` · ${g.description}` : ""}`,
                }))}
                optionFilterProp="label"
                size="middle"
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <div style={{ position: "relative" }}>
              {!shipment.vehicle_group_id && (
                <div style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: "rgba(245, 247, 250, 0.85)",
                  borderRadius: 6,
                  zIndex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  <span style={{ fontSize: 11, color: "#94a3b8" }}>🔒</span>
                </div>
              )}
              <Form.Item label="Xe" style={{ marginBottom: 0 }}>
                <Select
                  allowClear
                  showSearch
                  value={shipment.vehicle_id}
                  onChange={handleVehicleChange}
                  placeholder={shipment.vehicle_group_id ? "Chọn xe" : "Chọn nhóm xe trước"}
                  options={filteredVehicles.map((v) => ({
                    value: v.id,
                    label: `${v.plate_number}${v.assigned_driver_name ? ` · ${v.assigned_driver_name}` : ""}`,
                  }))}
                  optionFilterProp="label"
                  size="middle"
                  disabled={!shipment.vehicle_group_id}
                  notFoundContent={
                    <span style={{ fontSize: 11, color: "#94a3b8" }}>
                      {shipment.vehicle_group_id ? "Không có xe" : "Chọn nhóm xe trước"}
                    </span>
                  }
                />
              </Form.Item>
            </div>
          </Col>
          <Col span={8}>
            <div style={{ position: "relative" }}>
              {!shipment.vehicle_group_id && (
                <div style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: "rgba(245, 247, 250, 0.85)",
                  borderRadius: 6,
                  zIndex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  <span style={{ fontSize: 11, color: "#94a3b8" }}>🔒</span>
                </div>
              )}
              <Form.Item label="Tài xế" style={{ marginBottom: 0 }}>
                <Select
                  allowClear
                  showSearch
                  value={shipment.driver_id}
                  onChange={handleDriverChange}
                  placeholder={shipment.vehicle_group_id ? "Chọn tài xế" : "Chọn nhóm xe trước"}
                  options={filteredDrivers.map((d) => ({
                    value: d.id,
                    label: `${d.full_name}${d.plate_number ? ` · ${d.plate_number}` : ""}`,
                  }))}
                  optionFilterProp="label"
                  size="middle"
                  disabled={!shipment.vehicle_group_id}
                  notFoundContent={
                    <span style={{ fontSize: 11, color: "#94a3b8" }}>
                      {shipment.vehicle_group_id ? "Không có tài xế" : "Chọn nhóm xe trước"}
                    </span>
                  }
                />
              </Form.Item>
            </div>
          </Col>
        </Row>

        {}
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

        {}
        <div style={{ paddingLeft: 0 }}>
          {}
          <div style={{ position: "relative", paddingLeft: 24 }}>
            {}
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
                  {}
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

            {}
            <div style={{ position: "relative", marginTop: 8 }}>
              {}
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

        {}
        <div style={{ paddingTop: 8, borderTop: "1px solid #d3e4fe" }}>
          <div style={{ textAlign: "center", fontSize: 11, fontWeight: 600, color: "#757682", textTransform: "uppercase", marginBottom: 12 }}>
            Cước phí
          </div>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="Cước xe (VND)" style={{ marginBottom: 8 }}>
                <CurrencyInput
                  value={shipment.cargo_fee}
                  onChange={(val) => onUpdate({ ...shipment, cargo_fee: val })}
                  style={{ width: "100%" }}
                />
              </Form.Item>
            </Col>
          </Row>
          {}
          {(() => {
            const passThrough = (shipment.expenses || []).reduce(
              (sum, e) => sum + (PASS_THROUGH_TYPES.has(e.expense_type) ? (e.amount || 0) : 0),
              0
            );
            const actualPrice = (shipment.cargo_fee || 0) + passThrough;
            return (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr",
                  background: "#e5eeff",
                  borderRadius: 8,
                  overflow: "hidden",
                  border: "1px solid #d3e4fe",
                }}
              >
                <div style={{ textAlign: "center", padding: "8px 8px" }}>
                  <div style={{ fontSize: 10, color: "#444651", marginBottom: 2 }}>Thực thu (cước + phí đi qua)</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#0058be" }}>
                    {actualPrice.toLocaleString()}đ
                  </div>
                  {passThrough > 0 && (
                    <div style={{ fontSize: 10, color: "#757682", marginTop: 2 }}>
                      (cước xe {((shipment.cargo_fee) || 0).toLocaleString()}đ + phí đi qua {passThrough.toLocaleString()}đ)
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>

        {}
        <div style={{ paddingTop: 8, borderTop: "1px solid #d3e4fe" }}>
          <div style={{ textAlign: "center", fontSize: 11, fontWeight: 600, color: "#757682", textTransform: "uppercase", marginBottom: 12 }}>
            Thanh toán
          </div>

          <Row gutter={12}>
            {}
            <Col span={12}>
              <Form.Item style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  {CUSTOMER_PAYMENT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => onUpdate({
                        ...shipment,
                        payment_type: opt.value,
                        driver_payment_state: opt.value === "client_credit"
                          ? "company_received"
                          : shipment.driver_payment_state,
                      })}
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

            {}
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

          {}
          {shipment.payment_type === "client_credit" && (
            <Alert type="info" showIcon message="Đơn ghi nợ — công nợ được theo dõi trong bảng công nợ." style={{ marginTop: 4 }} />
          )}
          {isDriverHolding && (
            <Alert type="warning" showIcon message="Tài xế đang giữ tiền — đã thu nhưng chưa nộp công ty." style={{ marginTop: 4 }} />
          )}
        </div>

        {}
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

          {}
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
  const [vehicleGroups, setVehicleGroups] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const [orderDate, setOrderDate] = useState(null);
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

  const lookupMaps = useMemo(() => buildLookupMaps(vehicles, drivers), [vehicles, drivers]);

  useEffect(() => {
    if (!isOpen) return;

    const fetchLookup = async () => {
      try {
        const data = await apiRequest("/accountant/orders/lookup");
        setVehicles(data.vehicles || []);
        setDrivers(data.drivers || []);
        setVehicleGroups(data.vehicle_groups || []);
      } catch (err) {
        message.error(err.message || "Không tải được dữ liệu xe/tài xế.");
      }
    };

    fetchLookup();
    setShipments([newShipment()]);
    setOrderDate(null);
    setCustomerName("");
    setCustomerPhone("");
    setCustomerCompany("");
    setOrderNotes("");
    setFormError("");
    setFieldErrors({ customerName: false, customerPhone: false, orderDate: false });
  }, [isOpen]);

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

  const totalCargoFee = shipments.reduce((sum, s) => sum + (s.cargo_fee || 0), 0);
  const totalPassThrough = shipments.reduce(
    (sum, s) =>
      sum +
      (s.expenses || []).reduce(
        (es, e) => es + (PASS_THROUGH_TYPES.has(e.expense_type) ? (e.amount || 0) : 0),
        0
      ),
    0
  );
  const totalExpenses = shipments.reduce(
    (sum, s) => sum + (s.expenses || []).reduce((es, e) => es + (e.amount || 0), 0),
    0
  );
  const totalActualPrice = totalCargoFee + totalPassThrough;
  const totalDriverDebt = shipments.reduce((sum, s) => {
    if (!["cash", "bank_transfer"].includes(s.payment_type)) return sum;
    if (s.driver_payment_state !== "driver_holding") return sum;
    const passThrough = (s.expenses || []).reduce(
      (es, e) => es + (PASS_THROUGH_TYPES.has(e.expense_type) ? (e.amount || 0) : 0),
      0
    );
    return sum + (s.cargo_fee || 0) + passThrough;
  }, 0);

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
      if ((s.cargo_weight || 0) < 0) se.negativeWeight = true;
      const shipmentActualPrice = Number(s.cargo_fee || 0) + (s.expenses || []).reduce(
        (sum, e) => sum + (PASS_THROUGH_TYPES.has(e.expense_type) ? Number(e.amount || 0) : 0),
        0
      );
      const isCashLike = ["cash", "bank_transfer"].includes(s.payment_type);
      if (isCashLike && s.driver_payment_state === "driver_holding" && !s.driver_id && !s.driver_name) {
        se.missingDriverForDebt = true;
      }
      if ((s.payment_type === "client_credit" || (isCashLike && s.driver_payment_state === "driver_holding")) && shipmentActualPrice <= 0) {
        se.missingDebtAmount = true;
      }

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
        if (err.negativeWeight) parts.push("khối lượng không được âm");
        if (err.missingDriverForDebt) parts.push("cần chọn tài xế khi tài xế giữ tiền");
        if (err.missingDebtAmount) parts.push("cần nhập số tiền khi tạo công nợ");
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
      customer_name: customerName.trim(),
      customer_phone: customerPhone.trim(),
      customer_company: customerCompany.trim() || null,
      notes: orderNotes.trim() || null,
      shipments: shipments.map((s) => ({
          vehicle_id: s.vehicle_id || null,
          vehicle_plate: s.vehicle_plate || null,
          driver_id: s.driver_id || null,
          driver_name: s.driver_name || null,
          pickup_addresses: (s.pickup_addresses || []).filter((p) => String(p || "").trim() !== ""),
          delivery_address: String(s.delivery_address || "").trim(),
          cargo_name: String(s.cargo_name || "").trim() || null,
          cargo_weight: Number(s.cargo_weight || 0),
          cargo_fee: Number(s.cargo_fee || 0),
          payment_type: s.payment_type || "cash",
          driver_payment_state: s.payment_type === "client_credit"
            ? "company_received"
            : (s.driver_payment_state || "company_received"),
          notes: String(s.notes || "").trim() || null,
          expenses: (s.expenses || [])
            .filter((e) => e.amount > 0)
            .map((e) => ({
              expense_type: e.expense_type,
              amount: Number(e.amount),
              description: String(e.description || "").trim() || null,
            })),
      })),
    };

    setSubmitting(true);
    try {
      const data = await apiRequest("/accountant/orders", {
        method: "POST",
        body: payload,
      });
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
              Lưu đơn · {totalActualPrice.toLocaleString()}đ
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

          {}
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

          {}
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

          {}
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
              vehicleGroups={vehicleGroups}
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
                title="Phí đi qua (BOT/vé)"
                value={totalPassThrough}
                precision={0}
                prefix="₫"
                valueStyle={{ color: "#646cff" }}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="Thực thu"
                value={totalActualPrice}
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
