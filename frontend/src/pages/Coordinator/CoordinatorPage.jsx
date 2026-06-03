import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../services/apiClient";
import "../../styles/Coordinator.css";

const emptyForm = {
  date: "",
  driver_id: "",
  customer_name: "",
  customer_phone: "",
  cargo_name: "",
  cargo_weight_kg: "",
  distance: "",
  pickup_address: "",
  delivery_address: "",
  estimated_price: "",
  vehicle_group_id: "",
  note: "",
};

const requiredFields = [
  { key: "date", label: "Ngày tháng" },
  { key: "driver_id", label: "Tài xế" },
  { key: "vehicle_group_id", label: "Nhóm xe" },
  { key: "customer_phone", label: "SĐT" },
  { key: "customer_name", label: "Khách hàng" },
  { key: "cargo_weight_kg", label: "Khối lượng" },
  { key: "pickup_address", label: "Điểm lấy hàng" },
  { key: "delivery_address", label: "Điểm giao hàng" },
  { key: "estimated_price", label: "Cước xe" },
];

const normalizeNumericText = (value) => String(value ?? "").replace(/,/g, "").trim();
const normalizeDistanceText = (value) => normalizeNumericText(value).replace(/km$/i, "").trim();
const isFiniteNumber = (value) => Number.isFinite(Number(value));
const ORDERS_PER_PAGE = 10;

function extractDriverName(notes) {
  const match = String(notes ?? "").match(/L(?:ái|ai) xe:\s*([^|]+)/i);
  return match?.[1]?.trim() || "";
}

function buildTripFromOrder(order) {
  return {
    id: `#${order.id}`,
    orderId: order.id,
    title: order.cargo_name,
    status: order.status,
    pickup: order.pickup_address,
    delivery: order.delivery_address,
    weight: `${order.cargo_weight_kg ?? ""}kg`,
    driverName: order.driver_name || extractDriverName(order.notes) || "",
  };
}

export default function CoordinatorPage({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [trips, setTrips] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [drivers, setDrivers] = useState([]);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");
  const [form, setForm] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState({});
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: ORDERS_PER_PAGE, totalPages: 1 });
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const loadOrders = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: String(ORDERS_PER_PAGE),
      });
      const query = deferredSearchQuery.trim();
      if (query) params.set("search", query);
      if (activeTab !== "all") params.set("status", activeTab);

      const data = await apiRequest(`/api/orders?${params.toString()}`, { token });
      setTrips((data.orders || []).map(buildTripFromOrder));
      setPagination(data.pagination || { total: 0, page: currentPage, limit: ORDERS_PER_PAGE, totalPages: 1 });
    } catch (error) {
      setMessage(error.message || "Unable to load order list.");
      setMessageType("error");
    }
  }, [activeTab, currentPage, deferredSearchQuery]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    const loadDrivers = async () => {
      try {
        const token = localStorage.getItem("token");
        const data = await apiRequest("/api/drivers", { token });
        setDrivers(data.drivers || []);
      } catch (error) {
        setMessage("Unable to load driver list.");
        setMessageType("error");
      }
    };

    loadDrivers();
  }, []);

  useEffect(() => {
    if (!message) return undefined;

    const timer = window.setTimeout(() => {
      setMessage("");
      setMessageType("info");
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [message]);

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
      return;
    }

    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.reload();
  };

  const totalPages = Math.max(1, pagination.totalPages || 1);
  const totalOrders = pagination.total || 0;
  const pageStart = totalOrders === 0 ? 0 : (currentPage - 1) * ORDERS_PER_PAGE + 1;
  const pageEnd = Math.min(currentPage * ORDERS_PER_PAGE, totalOrders);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, deferredSearchQuery]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const validateForm = () => {
    const errors = {};

    requiredFields.forEach(({ key, label }) => {
      const value = String(form[key] ?? "").trim();
      if (!value) {
        errors[key] = `${label} là bắt buộc`;
      }
    });

    if (form.date) {
      const selectedDate = new Date(`${form.date}T00:00:00`);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (Number.isNaN(selectedDate.getTime()) || selectedDate < today) {
        errors.date = "Ngày không được trước hôm nay";
      }
    }

    const phoneDigits = String(form.customer_phone ?? "").replace(/\D/g, "");
    if (form.customer_phone && !/^0\d{9,10}$/.test(phoneDigits)) {
      errors.customer_phone = "SĐT phải bắt đầu bằng 0 và có 10-11 chữ số";
    }

    const weight = normalizeNumericText(form.cargo_weight_kg);
    if (weight && (!isFiniteNumber(weight) || Number(weight) <= 0)) {
      errors.cargo_weight_kg = "Khối lượng phải là số lớn hơn 0";
    }

    const price = normalizeNumericText(form.estimated_price);
    if (price && (!isFiniteNumber(price) || Number(price) < 0)) {
      errors.estimated_price = "Cước xe phải là số không âm";
    }

    const distance = normalizeDistanceText(form.distance);
    if (distance && (!isFiniteNumber(distance) || Number(distance) <= 0)) {
      errors.distance = "Quãng đường phải là số lớn hơn 0";
    }

    setFormErrors(errors);
    return errors;
  };

  const updateField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (formErrors[key]) {
      setFormErrors((currentErrors) => {
        const nextErrors = { ...currentErrors };
        delete nextErrors[key];
        return nextErrors;
      });
    }
  };

  const vehicleGroups = useMemo(() => {
    const seen = new Map();
    drivers.forEach((driver) => {
      if (!driver.vehicle_group_id) return;
      const id = String(driver.vehicle_group_id);
      if (!seen.has(id)) {
        seen.set(id, {
          id,
          name: driver.vehicle_group_name || `Nhóm xe ${id}`,
        });
      }
    });
    return Array.from(seen.values());
  }, [drivers]);

  const handleExcelImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setMessage("");
    setMessageType("info");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const token = localStorage.getItem("token");
      const data = await apiRequest("/api/coordinator/import-excel", {
        method: "POST",
        token,
        body: formData,
      });

      setMessage(`Imported ${data.rows?.length || 0} rows from Excel.`);
      setMessageType("success");
    } catch (err) {
      setMessage(err.message || "Unable to import Excel file.");
      setMessageType("error");
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  };

  const handleCreateOrder = async (event) => {
    event.preventDefault();
    setMessage("");
    setMessageType("info");

    const errors = validateForm();
    // if (Object.keys(errors).length > 0) {
    //   setMessage("Vui lòng kiểm tra các trường bắt buộc.");
    //   setMessageType("error");
    //   return;
    // }

    setCreating(true);

    try {
      const token = localStorage.getItem("token");
      const selectedDriver = drivers.find(
        (driver) => String(driver.id) === String(form.driver_id),
      );
      const selectedPlate = selectedDriver?.plate_number || "";
      const selectedVehicleGroupId = selectedDriver?.vehicle_group_id || form.vehicle_group_id || "";

      const data = await apiRequest("/api/orders", {
        method: "POST",
        token,
        body: {
          date: form.date,
          plate: selectedPlate,
          driver_id: form.driver_id || "",
          customer_name: form.customer_name,
          customer_phone: form.customer_phone,
          cargo_name: form.cargo_name,
          cargo_weight_kg: form.cargo_weight_kg,
          pickup_address: form.pickup_address,
          delivery_address: form.delivery_address,
          estimated_price: form.estimated_price,
          vehicle_group_id: selectedVehicleGroupId,
          notes: [
            form.distance ? `Quãng đường: ${form.distance}` : "",
            form.note,
          ].filter(Boolean).join(" | "),
        },
      });

      setCurrentPage(1);
      await loadOrders();

      setCreateOpen(false);
      setMessage(data.message || "Order created successfully.");
      setMessageType("success");
      setForm(emptyForm);
      setFormErrors({});
    } catch (err) {
      setMessage(err.message || "Unable to create order.");
      setMessageType("error");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="coordinator-shell">
      <aside className="sidebar">
        <div>
          <div className="brand">
            <div className="brand-mark">L</div>
            <div>
              <div className="brand-name">Logistics HQ</div>
              <div className="brand-sub">Coordinator dashboard</div>
            </div>
          </div>
          <nav className="nav">
            <button className="nav-item active">Đơn hàng</button>
            {/* <button className="nav-item">Map</button>
            <button className="nav-item">Drivers</button>
            <button className="nav-item">Reports</button> */}
          </nav>
        </div>
        <button className="nav-item nav-footer" onClick={handleLogout}>
          Profile
        </button>
      </aside>

      <main className="content">
        <header className="topbar">
          <div className="search-box">
            <span className="search-icon">⌕</span>
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Tên sản phẩm, điểm lấy hàng, giao hàng, tài xế, trạng thái"
            />
          </div>
          <div className="topbar-actions">
            <label className="import-btn">
              {importing ? "Importing..." : "+ Import Excel"}
              <input type="file" accept=".xlsx,.xls" onChange={handleExcelImport} hidden />
            </label>
            <button className="primary-btn" onClick={() => setCreateOpen(true)}>
              + Tạo mới
            </button>
            <div className="avatar">{user?.full_name?.[0] || "A"}</div>
          </div>
        </header>

        <section className="hero">
          {/* <div>
            <h1>Danh sách đơn hàng</h1>
            <p>Manage and dispatch active transport trips.</p>
          </div> */}
          <div></div>
          <div className="filters">
            {/* <button
              className={activeTab === "all" ? "filter active" : "filter"}
              onClick={() => setActiveTab("all")}
            >
              All
            </button> */}
            {/* <button
              className={activeTab === "new" ? "filter active" : "filter"}
              onClick={() => setActiveTab("new")}
            >
              New
            </button>
            <button
              className={activeTab === "waiting" ? "filter active" : "filter"}
              onClick={() => setActiveTab("waiting")}
            >
              Waiting
            </button> */}
          </div>
        </section>

        {createOpen && (
          <section className="modal-backdrop" onClick={() => setCreateOpen(false)}>
            <div className="modal-card" onClick={(event) => event.stopPropagation()}>
              <div className="panel-head">
                <div>
                  <h2>Tạo đơn</h2>
                  <p>Fill the form based on the Excel sheet structure.</p>
                </div>
                <button className="ghost-btn" onClick={() => setCreateOpen(false)}>
                  x
                </button>
              </div>

              <form className="create-form" onSubmit={handleCreateOrder}>
                <div className="sheet-caption full">Thông tin đơn hàng</div>

                <div className="form-row form-row-3">
                  <label>
                    <span>Ngày tháng</span>
                    <input
                      type="date"
                      value={form.date}
                      onChange={(event) => updateField("date", event.target.value)}
                      min={new Date().toISOString().slice(0, 10)}
                      className={formErrors.date ? "input-error" : ""}
                    />
                    {formErrors.date && <div className="field-error">{formErrors.date}</div>}
                  </label>
                  <label>
                    <span>Tài xế</span>
                    <select
                      value={form.driver_id}
                      onChange={(event) => {
                        const driverId = event.target.value;
                        const driver = drivers.find((item) => String(item.id) === String(driverId));
                        updateField("driver_id", driverId);
                        updateField(
                          "vehicle_group_id",
                          driver?.vehicle_group_id ? String(driver.vehicle_group_id) : "",
                        );
                      }}
                      className={formErrors.driver_id ? "input-error" : ""}
                    >
                      <option value="">Chọn tài xế</option>
                      {drivers.map((driver) => (
                        <option key={driver.id} value={driver.id}>
                          {driver.full_name} {driver.plate_number ? `- ${driver.plate_number}` : ""}
                        </option>
                      ))}
                    </select>
                    {formErrors.driver_id && (
                      <div className="field-error">{formErrors.driver_id}</div>
                    )}
                  </label>
                  <label>
                    <span>Nhóm xe</span>
                    <select
                      value={form.vehicle_group_id}
                      onChange={(event) => updateField("vehicle_group_id", event.target.value)}
                      className={formErrors.vehicle_group_id ? "input-error" : ""}
                    >
                      <option value="">Chọn nhóm xe</option>
                      {vehicleGroups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                    {formErrors.vehicle_group_id && (
                      <div className="field-error">{formErrors.vehicle_group_id}</div>
                    )}
                  </label>
                </div>

                <div className="form-row form-row-3">
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
                  <label>
                    <span>Sản phẩm</span>
                    <input
                      value={form.cargo_name}
                      onChange={(event) => updateField("cargo_name", event.target.value)}
                      placeholder="Không bắt buộc"
                    />
                  </label>
                </div>

                <div className="form-row form-row-note">
                  
                </div>

                <div className="form-row form-row-3">
                  <label>
                    <span>Khối lượng</span>
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
                  <label>
                    <span>Quãng đường</span>
                    <input
                      value={form.distance}
                      onChange={(event) => updateField("distance", event.target.value)}
                      placeholder="VD: 120 km"
                      className={formErrors.distance ? "input-error" : ""}
                    />
                    {formErrors.distance && (
                      <div className="field-error">{formErrors.distance}</div>
                    )}
                  </label>
                  <label>
                    <span>Cước xe</span>
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      value={form.estimated_price}
                      onChange={(event) => updateField("estimated_price", event.target.value)}
                      className={formErrors.estimated_price ? "input-error" : ""}
                    />
                    {formErrors.estimated_price && (
                      <div className="field-error">{formErrors.estimated_price}</div>
                    )}
                  </label>
                </div>

                <div className="form-row form-row-2">
                  <label>
                    <span>Điểm lấy hàng</span>
                    <input
                      value={form.pickup_address}
                      onChange={(event) => updateField("pickup_address", event.target.value)}
                      className={formErrors.pickup_address ? "input-error" : ""}
                    />
                    {formErrors.pickup_address && (
                      <div className="field-error">{formErrors.pickup_address}</div>
                    )}
                  </label>
                  <label>
                    <span>Điểm giao hàng</span>
                    <input
                      value={form.delivery_address}
                      onChange={(event) => updateField("delivery_address", event.target.value)}
                      className={formErrors.delivery_address ? "input-error" : ""}
                    />
                    {formErrors.delivery_address && (
                      <div className="field-error">{formErrors.delivery_address}</div>
                    )}
                  </label>
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
                  <button type="button" className="filter" onClick={() => setCreateOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="primary-btn" disabled={creating}>
                    {creating ? "Creating..." : "Create"}
                  </button>
                </div>
              </form>
            </div>
          </section>
        )}

        {message && <div className={`notice notice-${messageType}`}>{message}</div>}

        <section className="orders-panel">
          <div className="panel-head">
            <div>
              <h2>Danh sách chuyến</h2>
              <p>Hiển thị đơn hàng dạng bảng để dễ theo dõi và điều phối.</p>
            </div>
          </div>

          <div className="table-wrap">
            <table className="orders-table">
              <thead>
                <tr>
                  <th>Mã đơn</th>
                  <th>Trạng thái</th>
                  <th>Sản phẩm</th>
                  <th>Điểm lấy hàng</th>
                  <th>Điểm giao hàng</th>
                  <th>Khối lượng</th>
                  <th>Tài xế</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {trips.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="empty-table-cell">
                      No orders yet. Create an order or import an Excel file to load data.
                    </td>
                  </tr>
                ) : (
                  trips.map((trip) => (
                    <tr key={trip.id}>
                      <td>
                        <span className="trip-id">
                          #{trip.orderId || String(trip.id).replace(/^tmp-/, "")}
                        </span>
                      </td>
                      <td>
                        <span className="trip-status">{trip.status}</span>
                      </td>
                      <td className="table-route-cell">{trip.title || "-"}</td>
                      <td className="table-address-cell">{trip.pickup}</td>
                      <td className="table-address-cell">{trip.delivery}</td>
                      <td>{trip.weight}</td>
                      <td>{trip.driverName || "Unassigned"}</td>
                      <td>
                        <div className="table-actions">
                          
                          <button className="table-edit-btn" aria-label="Edit order">
                            ✎
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="pagination-bar">
            <span>
              Hiển thị {pageStart}-{pageEnd} / {totalOrders} đơn
            </span>
            <div className="pagination-actions">
              <button
                type="button"
                className="pagination-btn"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={currentPage === 1}
              >
                Trước
              </button>
              <span className="pagination-page">
                Trang {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                className="pagination-btn"
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={currentPage === totalPages}
              >
                Sau
              </button>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}
