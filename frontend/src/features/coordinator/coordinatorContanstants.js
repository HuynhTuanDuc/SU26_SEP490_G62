import {getTodayStr} from "../../features/coordinator/coordinatorValidates";

export const emptyForm = () => ({
  date: getTodayStr(),
  customer_name: "",
  customer_phone: "",
  cargo_name: "",
  cargo_weight_kg: "",
  note: "",
  is_partner: false,
  partner_name: "",
  trips: [{ vehicle_group_id: "", plate: "", distance: "", pickup_address: "", delivery_address: "" }]
});

export const newReceiptExpense = () => ({
  expense_type: "fuel",
  amount: "",
  description: "",
});

export const emptyReceiptForm = () => ({
  notes: "",
  expenses: [],
});


export const requiredFields = [
  { key: "date", label: "Ngày tháng" },
  { key: "customer_phone", label: "SĐT" },
  { key: "cargo_weight_kg", label: "Khối lượng" },
];

export const expenseTypeOptions = [
  { value: "fuel", label: "Nhiên liệu" },
  { value: "toll", label: "Cầu đường" },
  { value: "parking", label: "Đỗ xe" },
  { value: "repair", label: "Sửa chữa" },
  { value: "maintenance", label: "Bảo dưỡng" },
  { value: "depreciation", label: "Khấu hao" },
  { value: "other", label: "Khác" },
];

export const STATUS_TABS = {
  all: null,
  new: new Set(["available"]),
  waiting: new Set(["claimed", "picking", "loaded", "transit", "arrived", "returning"]),
};

export const STATUS_QUERY = {
  all: "",
  new: "available",
  waiting: "claimed,picking,loaded,transit,arrived,returning",
};