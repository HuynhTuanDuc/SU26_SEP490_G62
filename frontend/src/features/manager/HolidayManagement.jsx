import React, { useEffect, useState } from "react";
import {
  Button, Input, Modal, Popconfirm, Select, Space, Table, Tag, Typography, message,
} from "antd";
import { CalendarOutlined, DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { apiRequest } from "../../services/apiClient";

const { Text } = Typography;

const WEEKDAYS = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];

const fmtDate = (iso) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

export default function HolidayManagement() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async (y = year) => {
    try {
      setLoading(true);
      const data = await apiRequest(`/api/admin/holidays?year=${y}`);
      setHolidays(data.holidays || []);
    } catch (err) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(year); }, [year]);

  const handleAdd = async () => {
    if (!newDate) { message.warning("Chọn ngày lễ"); return; }
    if (!newName.trim()) { message.warning("Nhập tên ngày lễ"); return; }
    try {
      setSaving(true);
      await apiRequest("/api/admin/holidays", {
        method: "POST",
        body: { holiday_date: newDate, name: newName.trim() },
      });
      message.success("Đã lưu ngày lễ");
      setModalOpen(false);
      setNewDate("");
      setNewName("");
      const addedYear = new Date(newDate).getFullYear();
      if (addedYear !== year) setYear(addedYear); else await load();
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (record) => {
    try {
      const dateKey = String(record.holiday_date).slice(0, 10);
      await apiRequest(`/api/admin/holidays/${dateKey}`, { method: "DELETE" });
      message.success("Đã xóa ngày lễ");
      await load();
    } catch (err) {
      message.error(err.message);
    }
  };

  const yearOptions = [];
  for (let y = currentYear - 1; y <= currentYear + 2; y += 1) {
    yearOptions.push({ label: `Năm ${y}`, value: y });
  }

  const columns = [
    {
      title: "Ngày",
      dataIndex: "holiday_date",
      key: "holiday_date",
      width: 160,
      render: (v) => <Text strong>{fmtDate(v)}</Text>,
    },
    {
      title: "Thứ",
      key: "weekday",
      width: 120,
      render: (_, r) => <Tag>{WEEKDAYS[new Date(r.holiday_date).getDay()]}</Tag>,
    },
    {
      title: "Tên ngày lễ",
      dataIndex: "name",
      key: "name",
    },
    {
      title: "",
      key: "actions",
      width: 80,
      render: (_, r) => (
        <Popconfirm
          title={`Xóa ngày lễ ${fmtDate(r.holiday_date)}?`}
          okText="Xóa"
          okButtonProps={{ danger: true }}
          cancelText="Huỷ"
          onConfirm={() => handleDelete(r)}
        >
          <Button danger type="text" icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div style={{ padding: 24, background: "#fff", borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 8, flexWrap: "wrap" }}>
        <Space>
          <CalendarOutlined style={{ fontSize: 18, color: "#1677ff" }} />
          <Text strong style={{ fontSize: 16 }}>Ngày lễ trong năm</Text>
          <Select options={yearOptions} value={year} onChange={setYear} style={{ width: 130 }} />
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          Thêm ngày lễ
        </Button>
      </div>

      <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
        Ngày lễ được nghỉ hưởng nguyên lương. Tài xế có chuyến hoàn thành trong ngày lễ được tự động
        cộng thêm 100% lương ngày (tổng 200%) vào bảng lương tháng đó. Ngày âm lịch (Tết, Giỗ Tổ)
        thay đổi hằng năm — nhớ cập nhật khi sang năm mới.
      </Text>

      <Table
        rowKey="holiday_date"
        columns={columns}
        dataSource={holidays}
        loading={loading}
        pagination={false}
        size="middle"
        locale={{ emptyText: `Chưa có ngày lễ nào cho năm ${year}` }}
      />

      <Modal
        title="Thêm / sửa ngày lễ"
        open={modalOpen}
        onOk={handleAdd}
        okText="Lưu"
        confirmLoading={saving}
        cancelText="Huỷ"
        onCancel={() => setModalOpen(false)}
      >
        <Space direction="vertical" style={{ width: "100%" }} size={12}>
          <div>
            <Text strong>Ngày</Text>
            <Input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              style={{ marginTop: 4 }}
            />
          </div>
          <div>
            <Text strong>Tên ngày lễ</Text>
            <Input
              placeholder="VD: Tết Âm lịch (mùng 1)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onPressEnter={handleAdd}
              style={{ marginTop: 4 }}
            />
          </div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Chọn trùng ngày đã có sẽ cập nhật tên ngày lễ đó.
          </Text>
        </Space>
      </Modal>
    </div>
  );
}
