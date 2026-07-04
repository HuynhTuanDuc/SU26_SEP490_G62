import React, { useCallback, useEffect, useState } from "react";
import {
  Button, Card, Col, Input, Modal, Row, Select, Space,
  Statistic, Table, Tag, Typography, message,
} from "antd";
import { CheckCircle, Search } from "lucide-react";
import PageContainer, { CardSection } from "../../components/common/PageContainer";
import { C } from "../../styles/theme";
import { fetchManagerPayrolls, reviewManagerPayroll } from "./managerApi";

const { Text } = Typography;
const { Option } = Select;

const fmt = (v) => new Intl.NumberFormat("vi-VN").format(Number(v || 0)) + "đ";

const net = (r) =>
  (r.base_salary || 0) +
  (r.revenue_bonus || 0) +
  (r.kpi_bonus || 0) +
  (r.top_driver_bonus || 0) +
  (r.other_bonus || 0) -
  (r.insurance_employee || 0) -
  (r.driver_debt_deduction || 0) -
  (r.advance_deduction || 0) -
  (r.other_deduction || 0);

const STATUS_TAG = {
  pending:  <Tag color="orange">Chờ xác nhận</Tag>,
  reviewed: <Tag color="blue">Đã xác nhận</Tag>,
  approved: <Tag color="green">Đã duyệt</Tag>,
  paid:     <Tag color="purple">Đã chi</Tag>,
};

const NOW = new Date();
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const YEARS  = [NOW.getFullYear(), NOW.getFullYear() - 1, NOW.getFullYear() - 2];

export default function ManagerPayrollPage() {
  const [payrolls, setPayrolls] = useState([]);
  const [stats,    setStats]    = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [search,   setSearch]   = useState("");
  const [month,    setMonth]    = useState(NOW.getMonth() + 1);
  const [year,     setYear]     = useState(NOW.getFullYear());
  const [status,   setStatus]   = useState("");
  const [reviewing, setReviewing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchManagerPayrolls({ month, year, status: status || undefined, search: search || undefined });
      setPayrolls(res.payrolls || []);
      setStats(res.stats || null);
    } catch (e) {
      message.error(e.message || "Lỗi tải bảng lương");
    } finally {
      setLoading(false);
    }
  }, [month, year, status, search]);

  useEffect(() => { load(); }, [load]);

  const handleReview = async (record) => {
    setReviewing(record.id);
    try {
      await reviewManagerPayroll(record.id);
      message.success("Đã xác nhận bảng lương");
      load();
    } catch (e) {
      message.error(e.message || "Lỗi xác nhận");
    } finally {
      setReviewing(null);
    }
  };

  const columns = [
    {
      title: "Tài xế",
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.full_name}</div>
          <div style={{ color: C.onSurfaceVariant, fontSize: 12 }}>{r.phone}</div>
        </div>
      ),
    },
    {
      title: "Kỳ lương",
      render: (_, r) => `T${r.payroll_month}/${r.payroll_year}`,
      width: 90,
    },
    {
      title: "Lương cơ bản",
      render: (_, r) => fmt(r.base_salary),
      align: "right",
    },
    {
      title: "Thưởng",
      render: (_, r) =>
        fmt((r.revenue_bonus || 0) + (r.kpi_bonus || 0) + (r.top_driver_bonus || 0) + (r.other_bonus || 0)),
      align: "right",
    },
    {
      title: "Khấu trừ",
      render: (_, r) =>
        fmt((r.insurance_employee || 0) + (r.driver_debt_deduction || 0) + (r.advance_deduction || 0) + (r.other_deduction || 0)),
      align: "right",
    },
    {
      title: "Thực lĩnh",
      render: (_, r) => (
        <span style={{ fontWeight: 700, color: C.primary }}>{fmt(net(r))}</span>
      ),
      align: "right",
    },
    {
      title: "Trạng thái",
      render: (_, r) => STATUS_TAG[r.status] || <Tag>{r.status}</Tag>,
      width: 130,
      align: "center",
    },
    {
      title: "Thao tác",
      width: 130,
      align: "center",
      render: (_, r) =>
        r.status === "pending" ? (
          <Button
            size="small"
            type="primary"
            icon={<CheckCircle size={14} />}
            loading={reviewing === r.id}
            onClick={() => handleReview(r)}
          >
            Xác nhận
          </Button>
        ) : null,
    },
  ];

  const pending  = payrolls.filter((p) => p.status === "pending").length;
  const reviewed = payrolls.filter((p) => p.status === "reviewed").length;

  return (
    <PageContainer>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small" style={{ borderRadius: 10 }}>
            <Statistic title="Tổng bảng lương" value={payrolls.length} valueStyle={{ color: C.onSurface }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" style={{ borderRadius: 10 }}>
            <Statistic title="Chờ xác nhận" value={pending} valueStyle={{ color: "#B76E00" }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" style={{ borderRadius: 10 }}>
            <Statistic title="Đã xác nhận" value={reviewed} valueStyle={{ color: "#2146C7" }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" style={{ borderRadius: 10 }}>
            <Statistic
              title="Tổng thực lĩnh"
              value={fmt(payrolls.reduce((s, r) => s + net(r), 0))}
              valueStyle={{ color: C.primary, fontSize: 16 }}
            />
          </Card>
        </Col>
      </Row>

      <CardSection>
        <Space wrap style={{ marginBottom: 16 }}>
          <Select value={month} onChange={setMonth} style={{ width: 100 }}>
            {MONTHS.map((m) => <Option key={m} value={m}>Tháng {m}</Option>)}
          </Select>
          <Select value={year} onChange={setYear} style={{ width: 100 }}>
            {YEARS.map((y) => <Option key={y} value={y}>{y}</Option>)}
          </Select>
          <Select value={status} onChange={setStatus} style={{ width: 150 }} placeholder="Tất cả trạng thái">
            <Option value="">Tất cả</Option>
            <Option value="pending">Chờ xác nhận</Option>
            <Option value="reviewed">Đã xác nhận</Option>
            <Option value="approved">Đã duyệt</Option>
            <Option value="paid">Đã chi</Option>
          </Select>
          <Input
            prefix={<Search size={14} />}
            placeholder="Tìm tài xế..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 200 }}
            allowClear
          />
          <Button onClick={load}>Làm mới</Button>
        </Space>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={payrolls}
          loading={loading}
          size="small"
          pagination={{ pageSize: 20, showSizeChanger: false }}
          locale={{ emptyText: "Không có bảng lương nào" }}
        />
      </CardSection>
    </PageContainer>
  );
}
