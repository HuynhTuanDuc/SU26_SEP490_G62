import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Row,
  Space,
  Statistic,
  Tag,
  Table,
  Typography,
  message,
} from "antd";
import {
  ArrowRightLeft,
  Building2,
  ClipboardList,
  Coins,
  Truck,
  Users,
} from "lucide-react";
import PageContainer, { CardSection } from "../../components/common/PageContainer";
import { C } from "../../styles/theme";
import { useRoleRealtime } from "../../hooks/useRoleRealtime";
import {
  approveManagerSalaryAdvance,
  confirmManagerDebtRepayment,
  fetchCompanyInfo,
  fetchManagerDashboard,
  fetchManagerDebtRepayments,
  fetchManagerReceiptRequests,
  fetchManagerSalaryAdvances,
  rejectManagerDebtRepayment,
  rejectManagerSalaryAdvance,
  updateCompanyInfo,
} from "./managerApi";

const { Title, Text } = Typography;
const currency = new Intl.NumberFormat("vi-VN");

function formatCurrency(value) {
  return `${currency.format(Number(value || 0))}đ`;
}

function getManagerRealtimeMessage(payload) {
  const notification = payload?.notification;
  if (payload?.type === "notification.created" && notification?.type === "MAINTENANCE_COMPLETED") {
    return notification.message || "Tài xế đã hoàn tất bảo dưỡng. Vui lòng kiểm tra và xác nhận.";
  }
  if (payload?.type === "maintenance.completed") {
    return payload.message || "Tài xế đã hoàn tất bảo dưỡng. Vui lòng kiểm tra và xác nhận.";
  }
  return null;
}

function QueuePill({ count, label, tone = "blue" }) {
  const toneMap = {
    blue: { bg: "#EAF2FF", color: "#2146C7" },
    orange: { bg: "#FFF3E0", color: "#B76E00" },
    red: { bg: "#FFE6E4", color: "#BA1A1A" },
    green: { bg: "#E7F7EC", color: "#1E7E34" },
  };
  const style = toneMap[tone] || toneMap.blue;

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        borderRadius: 999,
        background: style.bg,
        color: style.color,
        fontWeight: 600,
        fontSize: 13,
      }}
    >
      <span>{count}</span>
      <span>{label}</span>
    </div>
  );
}

function SummaryCard({ icon, title, subtitle, value, accent }) {
  return (
    <Card
      bordered={false}
      style={{
        borderRadius: 18,
        minHeight: 168,
        background: `linear-gradient(140deg, #ffffff 0%, ${accent}14 100%)`,
        boxShadow: "0 18px 40px rgba(11,28,48,0.06)",
      }}
      bodyStyle={{ height: "100%" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, height: "100%" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              background: `${accent}18`,
              color: accent,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {icon}
          </div>
          <div>
            <Text style={{ color: C.onSurfaceVariant, fontSize: 13 }}>{title}</Text>
            <Title level={3} style={{ margin: "8px 0 6px", color: C.onSurface }}>
              {value}
            </Title>
            <Text style={{ color: C.onSurfaceVariant }}>{subtitle}</Text>
          </div>
        </div>
      </div>
    </Card>
  );
}

function QueueHeader({ title, description, extra }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
      <div>
        <Title level={4} style={{ margin: 0, color: C.onSurface }}>
          {title}
        </Title>
        <Text style={{ color: C.onSurfaceVariant }}>{description}</Text>
      </div>
      {extra}
    </div>
  );
}

export default function ManagerDashboard({ user }) {
  const [dashboard, setDashboard] = useState(null);
  const [salaryAdvances, setSalaryAdvances] = useState([]);
  const [debtRepayments, setDebtRepayments] = useState([]);
  const [receiptRequests, setReceiptRequests] = useState([]);
  const [companyInfo, setCompanyInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingCompany, setSavingCompany] = useState(false);
  const [actingId, setActingId] = useState(null);
  const [companyForm] = Form.useForm();

  const refreshAll = async () => {
    setLoading(true);
    try {
      const [dashboardData, advancesData, repaymentsData, receiptsData, companyData] = await Promise.all([
        fetchManagerDashboard(),
        fetchManagerSalaryAdvances({ status: "all", limit: 20 }),
        fetchManagerDebtRepayments(),
        fetchManagerReceiptRequests(),
        fetchCompanyInfo(),
      ]);

      setDashboard(dashboardData);
      setSalaryAdvances(advancesData.advances || []);
      setDebtRepayments(repaymentsData.repayments || []);
      setReceiptRequests(receiptsData.requests || []);
      setCompanyInfo(companyData.info || {});
      companyForm.setFieldsValue({
        company_name: companyData.info?.company_name || "",
        hotline: companyData.info?.hotline || "",
        bank_name: companyData.info?.bank_name || "",
        bank_account_number: companyData.info?.bank_account_number || "",
        bank_account_name: companyData.info?.bank_account_name || "",
      });
    } catch (error) {
      message.error(error.message || "Không thể tải dữ liệu manager.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshAll();
  }, []);

  useRoleRealtime(user, {
    onMessage: (payload) => {
      if (!payload?.type) return;

      const realtimeMessage = getManagerRealtimeMessage(payload);
      if (realtimeMessage) {
        message.info(realtimeMessage);
      }

      if (
        payload.type === "manager.workflow.changed" ||
        payload.type === "manager.users.changed" ||
        payload.type === "manager.vehicles.changed" ||
        payload.type === "coordinator.receipt_requests.changed" ||
        payload.type === "notification.created" ||
        payload.type === "maintenance.completed"
      ) {
        refreshAll();
      }
    },
  });

  const overview = dashboard?.overview;
  const finance = dashboard?.finance;

  const queueStats = useMemo(() => {
    const workflow = overview?.workflow || {};
    return [
      { key: "advances", count: workflow.pending_advances || 0, label: "yêu cầu ứng lương", tone: "blue" },
      { key: "repayments", count: workflow.pending_repayments || 0, label: "yêu cầu nộp tiền", tone: "orange" },
      { key: "receipts", count: (workflow.pending_receipts || 0) + (workflow.processing_receipts || 0), label: "phiếu thu đang chờ", tone: "green" },
    ];
  }, [overview]);

  const handleRejectAdvance = (record) => {
    let reasonInput = "";
    Modal.confirm({
      title: "Từ chối yêu cầu ứng lương",
      content: (
        <Input.TextArea
          rows={4}
          placeholder="Lý do từ chối"
          onChange={(event) => {
            reasonInput = event.target.value;
          }}
        />
      ),
      okText: "Từ chối",
      okButtonProps: { danger: true },
      cancelText: "Hủy",
      onOk: async () => {
        setActingId(`advance-reject-${record.id}`);
        try {
          await rejectManagerSalaryAdvance(record.id, reasonInput);
          message.success("Đã từ chối yêu cầu ứng lương.");
          await refreshAll();
        } catch (error) {
          message.error(error.message || "Không thể từ chối yêu cầu.");
        } finally {
          setActingId(null);
        }
      },
    });
  };

  const handleApproveAdvance = async (record) => {
    setActingId(`advance-approve-${record.id}`);
    try {
      await approveManagerSalaryAdvance(record.id);
      message.success("Đã phê duyệt yêu cầu ứng lương.");
      await refreshAll();
    } catch (error) {
      message.error(error.message || "Không thể phê duyệt yêu cầu.");
    } finally {
      setActingId(null);
    }
  };

  const handleRejectRepayment = (record) => {
    let reasonInput = "";
    Modal.confirm({
      title: "Từ chối nộp tiền",
      content: (
        <Input.TextArea
          rows={4}
          placeholder="Nhập lý do từ chối"
          onChange={(event) => {
            reasonInput = event.target.value;
          }}
        />
      ),
      okText: "Từ chối",
      okButtonProps: { danger: true },
      cancelText: "Hủy",
      onOk: async () => {
        setActingId(`repayment-reject-${record.id}`);
        try {
          await rejectManagerDebtRepayment(record.id, reasonInput);
          message.success("Đã từ chối yêu cầu nộp tiền.");
          await refreshAll();
        } catch (error) {
          message.error(error.message || "Không thể từ chối yêu cầu.");
        } finally {
          setActingId(null);
        }
      },
    });
  };

  const handleConfirmRepayment = async (record) => {
    setActingId(`repayment-confirm-${record.id}`);
    try {
      await confirmManagerDebtRepayment(record.id);
      message.success("Đã xác nhận nộp tiền.");
      await refreshAll();
    } catch (error) {
      message.error(error.message || "Không thể xác nhận nộp tiền.");
    } finally {
      setActingId(null);
    }
  };

  const handleSaveCompany = async () => {
    try {
      const values = await companyForm.validateFields();
      setSavingCompany(true);
      const result = await updateCompanyInfo(values);
      setCompanyInfo(result.info || {});
      message.success("Đã cập nhật thông tin công ty.");
      await refreshAll();
    } catch (error) {
      if (error?.errorFields) return;
      message.error(error.message || "Không thể cập nhật thông tin công ty.");
    } finally {
      setSavingCompany(false);
    }
  };

  const advanceColumns = [
    {
      title: "Tài xế",
      key: "driver",
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{record.driver_name}</Text>
          <Text type="secondary">{record.driver_email}</Text>
        </Space>
      ),
    },
    {
      title: "Kỳ ứng",
      key: "period",
      render: (_, record) => `${record.request_month}/${record.request_year}`,
    },
    {
      title: "Số tiền",
      dataIndex: "amount",
      key: "amount",
      render: (value) => <Text strong>{formatCurrency(value)}</Text>,
    },
    {
      title: "Lý do",
      dataIndex: "reason",
      key: "reason",
      render: (value) => value || <Text type="secondary">Không có</Text>,
    },
    {
      title: "Trang thai",
      dataIndex: "status",
      key: "status",
      render: (value) => {
        const map = { pending: "gold", approved: "green", rejected: "red", paid: "blue" };
        return <Tag color={map[value] || "default"}>{String(value || "").toUpperCase()}</Tag>;
      },
    },
    {
      title: "Thao tac",
      key: "actions",
      render: (_, record) => (
        <Space>
          <Button
            type="primary"
            size="small"
            disabled={record.status !== "pending"}
            loading={actingId === `advance-approve-${record.id}`}
            onClick={() => handleApproveAdvance(record)}
          >
            Duyệt
          </Button>
          <Button
            danger
            size="small"
            disabled={record.status !== "pending"}
            loading={actingId === `advance-reject-${record.id}`}
            onClick={() => handleRejectAdvance(record)}
          >
            Từ chối
          </Button>
        </Space>
      ),
    },
  ];

  const repaymentColumns = [
    {
      title: "Tài xế",
      key: "driver",
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{record.driver_name}</Text>
          <Text type="secondary">Debt #{record.debt_id}</Text>
        </Space>
      ),
    },
    {
      title: "Đơn hàng",
      dataIndex: "cargo_name",
      key: "cargo_name",
      render: (value) => value || <Text type="secondary">Công nợ nội bộ</Text>,
    },
    {
      title: "Số tiền nộp",
      dataIndex: "amount",
      key: "amount",
      render: (value) => <Text strong>{formatCurrency(value)}</Text>,
    },
    {
      title: "Tổng công nợ",
      dataIndex: "total_amount",
      key: "total_amount",
      render: (value) => formatCurrency(value),
    },
    {
      title: "Phương thức",
      dataIndex: "payment_method",
      key: "payment_method",
      render: (value) => <Tag>{String(value || "cash").replaceAll("_", " ").toUpperCase()}</Tag>,
    },
    {
      title: "Thao tac",
      key: "actions",
      render: (_, record) => (
        <Space>
          <Button
            type="primary"
            size="small"
            loading={actingId === `repayment-confirm-${record.id}`}
            onClick={() => handleConfirmRepayment(record)}
          >
            Xác nhận
          </Button>
          <Button
            danger
            size="small"
            loading={actingId === `repayment-reject-${record.id}`}
            onClick={() => handleRejectRepayment(record)}
          >
            Từ chối
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <div
        style={{
          borderRadius: 24,
          padding: 28,
          background: "linear-gradient(135deg, #0B1C30 0%, #1D3268 55%, #3B4FD8 100%)",
          color: "#fff",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: "auto -8% -42% auto",
            width: 360,
            height: 360,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 70%)",
          }}
        />
        <Space direction="vertical" size="middle" style={{ position: "relative", width: "100%" }}>
          <div>
            <Tag color="cyan" style={{ borderRadius: 999, paddingInline: 12, paddingBlock: 5, fontWeight: 700 }}>
              MANAGER WORKFLOW
            </Tag>
          </div>
          <div style={{ maxWidth: 780 }}>
            <Title level={2} style={{ color: "#fff", margin: 0 }}>
              Quản lý công việc liên phòng ban trong một màn hình.
            </Title>
            <Text style={{ color: "rgba(255,255,255,0.82)", fontSize: 15 }}>
              Theo dõi các điểm nghẽn giữa tài xế, điều phối và kế toán, phê duyệt yêu cầu quan trọng và giữ thông tin công ty luôn sẵn sàng cho vận hành.
            </Text>
          </div>
          <Space wrap size="middle">
            {queueStats.map((item) => (
              <QueuePill key={item.key} count={item.count} label={item.label} tone={item.tone} />
            ))}
          </Space>
        </Space>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12} xl={6}>
          <SummaryCard
            icon={<Users size={20} />}
            title="Nhân sự đang hoạt động"
            subtitle={`${overview?.workforce?.driver_count || 0} tài xế, ${overview?.workforce?.active_staff || 0} nhân sự văn phòng`}
            value={overview?.workforce?.active_users || 0}
            accent="#3B4FD8"
          />
        </Col>
        <Col xs={24} md={12} xl={6}>
          <SummaryCard
            icon={<Truck size={20} />}
            title="Xe sẵn sàng"
            subtitle={`${overview?.fleet?.maintenance || 0} bảo trì, ${overview?.fleet?.broken || 0} hư hỏng`}
            value={overview?.fleet?.active || 0}
            accent="#1E7E34"
          />
        </Col>
        <Col xs={24} md={12} xl={6}>
          <SummaryCard
            icon={<Coins size={20} />}
            title="Công nợ cần thu"
            subtitle={`${finance?.pending_payments_count || 0} đơn chưa thu đủ`}
            value={formatCurrency(finance?.total_receivables)}
            accent="#B76E00"
          />
        </Col>
        <Col xs={24} md={12} xl={6}>
          <SummaryCard
            icon={<ArrowRightLeft size={20} />}
            title="Tiền chờ phê duyệt"
            subtitle="Ứng lương và nộp tiền đang chờ manager"
            value={formatCurrency(overview?.workflow?.pending_advances_amount || 0)}
            accent="#BA1A1A"
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={16}>
          <PageContainer>
            <CardSection>
              <QueueHeader
                title="Hàng đợi phê duyệt"
                description="Xử lý các quyết định tài chính cần manager xác nhận để quy trình tiếp tục không bị đứng."
              />
            </CardSection>
            <div style={{ padding: "0 24px 24px" }}>
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 16, borderRadius: 12 }}
                message="Luồng công việc hợp tác"
                description="Tài xế gửi yêu cầu, manager phê duyệt, sau đó kế toán và điều phối tiếp tục xử lý. Các bảng bên dưới được đồng bộ real-time khi có thay đổi."
              />
              <Space direction="vertical" size="large" style={{ width: "100%" }}>
                <div>
                  <QueueHeader
                    title="Ứng lương"
                    description="Driver request -> Manager approve -> Accountant disburse"
                    extra={<Text type="secondary">{salaryAdvances.filter((item) => item.status === "pending").length} pending</Text>}
                  />
                  <Table
                    style={{ marginTop: 12 }}
                    loading={loading}
                    rowKey="id"
                    columns={advanceColumns}
                    dataSource={salaryAdvances}
                    pagination={{ pageSize: 5 }}
                    locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có yêu cầu ứng lương." /> }}
                    scroll={{ x: "max-content" }}
                  />
                </div>

                <div>
                  <QueueHeader
                    title="Nộp tiền công nợ"
                    description="Xác nhận tài xế đã nộp tiền về công ty hay yêu cầu bổ sung."
                    extra={<Text type="secondary">{debtRepayments.length} pending</Text>}
                  />
                  <Table
                    style={{ marginTop: 12 }}
                    loading={loading}
                    rowKey="id"
                    columns={repaymentColumns}
                    dataSource={debtRepayments}
                    pagination={{ pageSize: 5 }}
                    locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có yêu cầu nộp tiền." /> }}
                    scroll={{ x: "max-content" }}
                  />
                </div>
              </Space>
            </div>
          </PageContainer>
        </Col>

        <Col xs={24} xl={8}>
          <Space direction="vertical" size="large" style={{ width: "100%" }}>
            <PageContainer>
              <CardSection>
                <QueueHeader
                  title="Receipt Requests"
                  description="Theo dõi những yêu cầu phiếu thu coordinator đang cần xử lý."
                />
              </CardSection>
              <div style={{ padding: "0 24px 24px" }}>
                <List
                  loading={loading}
                  dataSource={receiptRequests.slice(0, 6)}
                  locale={{ emptyText: "Không có yêu cầu phiếu thu." }}
                  renderItem={(item) => (
                    <List.Item style={{ paddingInline: 0 }}>
                      <List.Item.Meta
                        title={
                          <Space wrap>
                            <Text strong>Order #{item.order_id}</Text>
                            <Tag color={item.status === "pending" ? "gold" : item.status === "processing" ? "blue" : "default"}>
                              {String(item.status || "").toUpperCase()}
                            </Tag>
                          </Space>
                        }
                        description={
                          <Space direction="vertical" size={2}>
                            <Text>{item.driver_name || "Chưa có tài xế"} {"->"} {item.customer_name || "Khách lẻ"}</Text>
                            <Text type="secondary">{item.cargo_name || "Không có tên hàng"} {"|"} {formatCurrency(item.receipt_amount)}</Text>
                          </Space>
                        }
                      />
                    </List.Item>
                  )}
                />
              </div>
            </PageContainer>

            <PageContainer>
              <CardSection>
                <QueueHeader
                  title="Company Setup"
                  description="Thông tin ngân hàng và liên hệ được driver và đối tác sử dụng xuyên suốt trong quy trình."
                />
              </CardSection>
              <div style={{ padding: "0 24px 24px" }}>
                <Form form={companyForm} layout="vertical">
                  <Form.Item label="Tên công ty" name="company_name">
                    <Input placeholder="Công ty Vận tải..." />
                  </Form.Item>
                  <Form.Item label="Hotline" name="hotline">
                    <Input placeholder="090..." />
                  </Form.Item>
                  <Form.Item label="Ngân hàng" name="bank_name">
                    <Input placeholder="VCB, ACB..." />
                  </Form.Item>
                  <Form.Item label="Số tài khoản" name="bank_account_number">
                    <Input placeholder="123456789" />
                  </Form.Item>
                  <Form.Item label="Chủ tài khoản" name="bank_account_name">
                    <Input placeholder="Công ty / Đại diện" />
                  </Form.Item>
                  <Space style={{ width: "100%", justifyContent: "space-between" }}>
                    <Text type="secondary">
                      {companyInfo?.updated_at ? `Cập nhật lần cuối: ${new Date(companyInfo.updated_at).toLocaleString("vi-VN")}` : "Chưa có bản ghi công ty."}
                    </Text>
                    <Button type="primary" loading={savingCompany} onClick={handleSaveCompany}>
                      Lưu thay đổi
                    </Button>
                  </Space>
                </Form>
              </div>
            </PageContainer>
          </Space>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card
            bordered={false}
            style={{ borderRadius: 18, boxShadow: "0 12px 32px rgba(11,28,48,0.05)" }}
            bodyStyle={{ padding: 24 }}
          >
            <Space direction="vertical" size="middle" style={{ width: "100%" }}>
              <Space>
                <Building2 size={18} color={C.primary} />
                <Title level={4} style={{ margin: 0 }}>
                  Tổng quan tài chính
                </Title>
              </Space>
              <Row gutter={16}>
                <Col span={12}>
                  <Statistic title="Tổng doanh thu" value={Number(finance?.total_revenue || 0)} suffix="đ" formatter={(value) => currency.format(Number(value || 0))} />
                </Col>
                <Col span={12}>
                  <Statistic title="Thực thu" value={Number(finance?.total_collected || 0)} suffix="đ" formatter={(value) => currency.format(Number(value || 0))} />
                </Col>
              </Row>
              <Descriptions size="small" column={1} bordered>
                <Descriptions.Item label="Đơn chưa thu đủ">{finance?.pending_payments_count || 0}</Descriptions.Item>
                <Descriptions.Item label="Công nợ cần theo dõi">{formatCurrency(finance?.total_receivables)}</Descriptions.Item>
                <Descriptions.Item label="Tiền ứng lương đang chờ">{formatCurrency(overview?.workflow?.pending_advances_amount)}</Descriptions.Item>
              </Descriptions>
            </Space>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card
            bordered={false}
            style={{ borderRadius: 18, boxShadow: "0 12px 32px rgba(11,28,48,0.05)" }}
            bodyStyle={{ padding: 24 }}
          >
            <Space direction="vertical" size="middle" style={{ width: "100%" }}>
              <Space>
                <ClipboardList size={18} color={C.primary} />
                <Title level={4} style={{ margin: 0 }}>
                  Phân bổ vai trò
                </Title>
              </Space>
              <Row gutter={[12, 12]}>
                <Col span={12}><QueuePill count={overview?.workforce?.manager_count || 0} label="manager" tone="red" /></Col>
                <Col span={12}><QueuePill count={overview?.workforce?.coordinator_count || 0} label="coordinator" tone="blue" /></Col>
                <Col span={12}><QueuePill count={overview?.workforce?.accountant_count || 0} label="accountant" tone="green" /></Col>
                <Col span={12}><QueuePill count={overview?.workforce?.driver_count || 0} label="driver" tone="orange" /></Col>
              </Row>
              <Text style={{ color: C.onSurfaceVariant }}>
                Dùng các tab Người dùng và Quản lý xe để can thiệp chi tiết, còn bảng này giúp manager nhìn nhanh mức tài nguyên đang phân bổ cho vận hành.
              </Text>
            </Space>
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
