import React, { useMemo, useState } from "react";
import "../../styles/Coordinator.css";

const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:9999";

export default function Coordinator({ user }) {
  const [activeTab, setActiveTab] = useState("all");
  const [trips, setTrips] = useState([]);
  const [rows, setRows] = useState([]);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [orderForm, setOrderForm] = useState({
    date: "",
    driver: "",
    vehicleGroup: "",
    phone: "",
    customer: "",
    weight: "",
    distance: "",
    fare: "",
    pickup: "",
    delivery: "",
    note: "",
  });

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.reload();
  };

  const filteredTrips = useMemo(() => {
    if (activeTab === "all") return trips;
    return trips.filter((trip) =>
      activeTab === "new" ? trip.status === "Mới" : trip.status === "Đang chờ",
    );
  }, [activeTab, trips]);

  const handleFormChange = (event) => {
    const { name, value } = event.target;
    setOrderForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }));
  };

  const handleCreateOrder = (event) => {
    event.preventDefault();

    const nextTrip = {
      id: `ORD-${String(trips.length + 1).padStart(3, "0")}`,
      status: "Mới",
      title: orderForm.customer || "Đơn hàng mới",
      pickup: orderForm.pickup || "Chưa nhập điểm lấy hàng",
      delivery: orderForm.delivery || "Chưa nhập điểm giao hàng",
      weight: orderForm.weight ? `${orderForm.weight} kg` : "Chưa nhập",
      cargoType: orderForm.vehicleGroup || "Chưa chọn nhóm xe",
    };

    setTrips((currentTrips) => [nextTrip, ...currentTrips]);
    setOrderForm({
      date: "",
      driver: "",
      vehicleGroup: "",
      phone: "",
      customer: "",
      weight: "",
      distance: "",
      fare: "",
      pickup: "",
      delivery: "",
      note: "",
    });
    setIsCreateOpen(false);
    setMessage("Đã tạo đơn hàng mới.");
  };

  const handleExcelImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setMessage("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const token = localStorage.getItem("token");
      const response = await fetch(`${apiBase}/api/coordinator/import-excel`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Import Excel failed.");
      }

      setRows(data.rows || []);
      setMessage(`Đã import ${data.rows?.length || 0} dòng từ Excel.`);
    } catch (err) {
      setMessage(err.message || "Không thể import file Excel.");
    } finally {
      setImporting(false);
      event.target.value = "";
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
            <button className="nav-item">Bản đồ</button>
            <button className="nav-item">Tài xế</button>
            <button className="nav-item">Báo cáo</button>
          </nav>
        </div>

        <button className="nav-item nav-footer" onClick={handleLogout}>
          Cá nhân
        </button>
      </aside>

      <main className="content">
        <header className="topbar">
          <div className="search-box">
            <span className="search-icon">⌕</span>
            <input placeholder="Tìm kiếm đơn hàng, ID, hoặc tuyến đường..." />
          </div>
          <div className="topbar-actions">
            <label className="import-btn">
              {importing ? "Đang import..." : "+ Import Excel"}
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleExcelImport}
                hidden
              />
            </label>
            <button className="primary-btn" onClick={() => setIsCreateOpen(true)}>
              + Tạo đơn hàng
            </button>
            <div className="avatar">{user?.full_name?.[0] || "A"}</div>
          </div>
        </header>

        <section className="hero">
          <div>
            <h1>Danh sách đơn hàng</h1>
            <p>Quản lý và điều phối các chuyến vận chuyển đang hoạt động.</p>
          </div>
          <div className="filters">
            <button
              className={activeTab === "all" ? "filter active" : "filter"}
              onClick={() => setActiveTab("all")}
            >
              Tất cả đơn hàng
            </button>
            <button
              className={activeTab === "new" ? "filter active" : "filter"}
              onClick={() => setActiveTab("new")}
            >
              Mới 
            </button>
            <button
              className={activeTab === "waiting" ? "filter active" : "filter"}
              onClick={() => setActiveTab("waiting")}
            >
              Đang chờ 
            </button>
          </div>
        </section>

        {isCreateOpen && (
          <section className="create-order-panel" aria-label="Form tạo đơn hàng">
            <div className="create-order-card">
              <div className="create-order-head">
                <div>
                  <h2>Tạo đơn hàng</h2>
                  <p>Nhập thông tin đơn vận chuyển theo từng hàng để tránh bị tràn form.</p>
                </div>
                <button
                  className="close-btn"
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  aria-label="Đóng form tạo đơn hàng"
                >
                  ×
                </button>
              </div>

              <form className="create-order-form" onSubmit={handleCreateOrder}>
                <div className="form-row form-row-three">
                  <label className="form-field">
                    <span>Ngày tháng</span>
                    <input
                      type="date"
                      name="date"
                      value={orderForm.date}
                      onChange={handleFormChange}
                    />
                  </label>
                  <label className="form-field">
                    <span>Tài xế</span>
                    <input
                      name="driver"
                      value={orderForm.driver}
                      onChange={handleFormChange}
                      placeholder="Nhập tên tài xế"
                    />
                  </label>
                  <label className="form-field">
                    <span>Nhóm xe</span>
                    <select
                      name="vehicleGroup"
                      value={orderForm.vehicleGroup}
                      onChange={handleFormChange}
                    >
                      <option value="">Chọn nhóm xe</option>
                      <option value="Xe tải nhỏ">Xe tải nhỏ</option>
                      <option value="Xe tải trung">Xe tải trung</option>
                      <option value="Xe tải lớn">Xe tải lớn</option>
                    </select>
                  </label>
                </div>

                <div className="form-row form-row-phone-customer">
                  <label className="form-field form-field-short">
                    <span>SĐT</span>
                    <input
                      type="tel"
                      name="phone"
                      value={orderForm.phone}
                      onChange={handleFormChange}
                      placeholder="090..."
                    />
                  </label>
                  <label className="form-field">
                    <span>Khách hàng</span>
                    <input
                      name="customer"
                      value={orderForm.customer}
                      onChange={handleFormChange}
                      placeholder="Nhập tên khách hàng"
                    />
                  </label>
                </div>

                <div className="form-row form-row-metrics">
                  <label className="form-field form-field-short">
                    <span>Khối lượng</span>
                    <input
                      type="number"
                      min="0"
                      name="weight"
                      value={orderForm.weight}
                      onChange={handleFormChange}
                      placeholder="Kg"
                    />
                  </label>
                  <label className="form-field">
                    <span>Quãng đường</span>
                    <input
                      name="distance"
                      value={orderForm.distance}
                      onChange={handleFormChange}
                      placeholder="Nhập quãng đường"
                    />
                  </label>
                  <label className="form-field">
                    <span>Cước xe</span>
                    <input
                      name="fare"
                      value={orderForm.fare}
                      onChange={handleFormChange}
                      placeholder="Nhập cước xe"
                    />
                  </label>
                </div>

                <div className="form-row form-row-two">
                  <label className="form-field">
                    <span>Điểm lấy hàng</span>
                    <input
                      name="pickup"
                      value={orderForm.pickup}
                      onChange={handleFormChange}
                      placeholder="Địa chỉ lấy hàng"
                    />
                  </label>
                  <label className="form-field">
                    <span>Điểm giao hàng</span>
                    <input
                      name="delivery"
                      value={orderForm.delivery}
                      onChange={handleFormChange}
                      placeholder="Địa chỉ giao hàng"
                    />
                  </label>
                </div>

                <label className="form-field form-field-note">
                  <span>Note</span>
                  <textarea
                    name="note"
                    value={orderForm.note}
                    onChange={handleFormChange}
                    placeholder="Ghi chú thêm"
                    rows="3"
                  />
                </label>

                <div className="form-actions">
                  <button className="cancel-btn" type="button" onClick={() => setIsCreateOpen(false)}>
                    Hủy
                  </button>
                  <button className="primary-btn" type="submit">
                    Lưu đơn hàng
                  </button>
                </div>
              </form>
            </div>
          </section>
        )}

        {message && <div className="notice">{message}</div>}

        <section className="trip-grid">
          {filteredTrips.length === 0 ? (
            <article className="empty-state">
              <h3>Chưa có đơn hàng nào</h3>
              <p>Hãy tạo đơn mới hoặc import file Excel để nạp dữ liệu.</p>
            </article>
          ) : (
            filteredTrips.map((trip) => (
              <article className="trip-card" key={trip.id}>
                <div className="trip-head">
                  <span className="trip-id">{trip.id}</span>
                  <span className="trip-status">{trip.status}</span>
                </div>
                <h3>{trip.title}</h3>
                <div className="route-line">
                  <div className="point start" />
                  <div className="dashed" />
                  <div className="point end" />
                </div>
                <div className="trip-locations">
                  <div>
                    <span>ĐIỂM LẤY HÀNG</span>
                    <strong>{trip.pickup}</strong>
                  </div>
                  <div>
                    <span>ĐIỂM GIAO HÀNG</span>
                    <strong>{trip.delivery}</strong>
                  </div>
                </div>
                <div className="trip-meta">
                  <div>
                    <span>Khối lượng</span>
                    <strong>{trip.weight}</strong>
                  </div>
                  <div>
                    <span>Loại hàng</span>
                    <strong>{trip.cargoType}</strong>
                  </div>
                </div>
                <div className="trip-actions">
                  <button className="assign-btn">+ Phân công tài xế</button>
                  <button className="ghost-btn">⋯</button>
                </div>
              </article>
            ))
          )}
        </section>

        <section className="spreadsheet-panel">
          <div className="panel-head">
            <div>
              <h2>Import từ Excel</h2>
              <p>Hỗ trợ file giống bảng tính bạn gửi, dùng để nạp dữ liệu nhanh.</p>
            </div>
            <div className="upload-hint">.xlsx / .xls</div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ngày</th>
                  <th>Chấm công</th>
                  <th>BKS</th>
                  <th>Lái xe</th>
                  <th>Khách hàng</th>
                  <th>Hành trình</th>
                  <th>Quãng đường</th>
                  <th>Cước xe</th>
                  <th>Vé</th>
                  <th>KH đã thanh toán</th>
                  <th>Lái xe thu/chi</th>
                  <th>Đổ dầu</th>
                  <th>Ứng lương</th>
                  <th>Ghi chú</th>
                  <th>Doanh thu</th>
                  <th>Doanh thu</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan="16">Chưa có dữ liệu Excel được import.</td>
                  </tr>
                ) : (
                  rows.map((row, index) => (
                    <tr key={`${row.date}-${index}`}>
                      <td>{row.date}</td>
                      <td>{row.checkIn}</td>
                      <td>{row.plate}</td>
                      <td>{row.driver}</td>
                      <td>{row.customer}</td>
                      <td>{row.route}</td>
                      <td>{row.distance}</td>
                      <td>{row.fare}</td>
                      <td>{row.ticket}</td>
                      <td>{row.paid}</td>
                      <td>{row.driverIncome}</td>
                      <td>{row.fuel}</td>
                      <td>{row.advance}</td>
                      <td>{row.note}</td>
                      <td>{row.revenue1}</td>
                      <td>{row.revenue2}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
