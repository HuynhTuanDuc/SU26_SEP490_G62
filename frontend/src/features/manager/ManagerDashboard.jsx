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
    return notification.message || "Tai xe da hoan tat bao duong. Vui long kiem tra va xac nhan.";
  }
  if (payload?.type === "maintenance.completed") {
    return payload.message || "Tai xe da hoan tat bao duong. Vui long kiem tra va xac nhan.";
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
      message.error(error.message || "Khong the tai du lieu manager.");
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
      { key: "advances", count: workflow.pending_advances || 0, label: "yeu cau ung luong", tone: "blue" },
      { key: "repayments", count: workflow.pending_repayments || 0, label: "yeu cau nop tien", tone: "orange" },
      { key: "receipts", count: (workflow.pending_receipts || 0) + (workflow.processing_receipts || 0), label: "phieu thu dang cho", tone: "green" },
    ];
  }, [overview]);

  const handleRejectAdvance = (record) => {
    let reasonInput = "";
    Modal.confirm({
      title: "Tu choi yeu cau ung luong",
      content: (
        <Input.TextArea
          rows={4}
          placeholder="Ly do tu choi"
          onChange={(event) => {
            reasonInput = event.target.value;
          }}
        />
      ),
      okText: "Tu choi",
      okButtonProps: { danger: true },
      cancelText: "Huy",
      onOk: async () => {
        setActingId(`advance-reject-${record.id}`);
        try {
          await rejectManagerSalaryAdvance(record.id, reasonInput);
          message.success("Da tu choi yeu cau ung luong.");
          await refreshAll();
        } catch (error) {
          message.error(error.message || "Khong the tu choi yeu cau.");
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
      message.success("Da phe duyet yeu cau ung luong.");
      await refreshAll();
    } catch (error) {
      message.error(error.message || "Khong the phe duyet yeu cau.");
    } finally {
      setActingId(null);
    }
  };

  const handleRejectRepayment = (record) => {
    let reasonInput = "";
    Modal.confirm({
      title: "Tu choi nop tien",
      content: (
        <Input.TextArea
          rows={4}
          placeholder="Nhap ly do tu choi"
          onChange={(event) => {
            reasonInput = event.target.value;
          }}
        />
      ),
      okText: "Tu choi",
      okButtonProps: { danger: true },
      cancelText: "Huy",
      onOk: async () => {
        setActingId(`repayment-reject-${record.id}`);
        try {
          await rejectManagerDebtRepayment(record.id, reasonInput);
          message.success("Da tu choi yeu cau nop tien.");
          await refreshAll();
        } catch (error) {
          message.error(error.message || "Khong the tu choi yeu cau.");
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
      message.success("Da xac nhan nop tien.");
      await refreshAll();
    } catch (error) {
      message.error(error.message || "Khong the xac nhan nop tien.");
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
      message.success("Da cap nhat thong tin cong ty.");
      await refreshAll();
    } catch (error) {
      if (error?.errorFields) return;
      message.error(error.message || "Khong the cap nhat thong tin cong ty.");
    } finally {
      setSavingCompany(false);
    }
  };

  const advanceColumns = [
    {
      title: "Tai xe",
      key: "driver",
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{record.driver_name}</Text>
          <Text type="secondary">{record.driver_email}</Text>
        </Space>
      ),
    },
    {
      title: "Ky ung",
      key: "period",
      render: (_, record) => `${record.request_month}/${record.request_year}`,
    },
    {
      title: "So tien",
      dataIndex: "amount",
      key: "amount",
      render: (value) => <Text strong>{formatCurrency(value)}</Text>,
    },
    {
      title: "Ly do",
      dataIndex: "reason",
      key: "reason",
      render: (value) => value || <Text type="secondary">Khong co</Text>,
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
            Duyet
          </Button>
          <Button
            danger
            size="small"
            disabled={record.status !== "pending"}
            loading={actingId === `advance-reject-${record.id}`}
            onClick={() => handleRejectAdvance(record)}
          >
            Tu choi
          </Button>
        </Space>
      ),
    },
  ];

  const repaymentColumns = [
    {
      title: "Tai xe",
      key: "driver",
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{record.driver_name}</Text>
          <Text type="secondary">Debt #{record.debt_id}</Text>
        </Space>
      ),
    },
    {
      title: "Don hang",
      dataIndex: "cargo_name",
      key: "cargo_name",
      render: (value) => value || <Text type="secondary">Cong no noi bo</Text>,
    },
    {
      title: "So tien nop",
      dataIndex: "amount",
      key: "amount",
      render: (value) => <Text strong>{formatCurrency(value)}</Text>,
    },
    {
      title: "Tong cong no",
      dataIndex: "total_amount",
      key: "total_amount",
      render: (value) => formatCurrency(value),
    },
    {
      title: "Phuong thuc",
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
            Xac nhan
          </Button>
          <Button
            danger
            size="small"
            loading={actingId === `repayment-reject-${record.id}`}
            onClick={() => handleRejectRepayment(record)}
          >
            Tu choi
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
              Quan ly cong viec lien phong ban trong mot man hinh.
            </Title>
            <Text style={{ color: "rgba(255,255,255,0.82)", fontSize: 15 }}>
              Theo doi cac diem nghen giua tai xe, dieu phoi va ke toan, phe duyet yeu cau quan trong va giu thong tin cong ty luon san sang cho van hanh.
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
            title="Nhan su dang hoat dong"
            subtitle={`${overview?.workforce?.driver_count || 0} tai xe, ${overview?.workforce?.active_staff || 0} nhan su van phong`}
            value={overview?.workforce?.active_users || 0}
            accent="#3B4FD8"
          />
        </Col>
        <Col xs={24} md={12} xl={6}>
          <SummaryCard
            icon={<Truck size={20} />}
            title="Xe san sang"
            subtitle={`${overview?.fleet?.maintenance || 0} bao tri, ${overview?.fleet?.broken || 0} hu hong`}
            value={overview?.fleet?.active || 0}
            accent="#1E7E34"
          />
        </Col>
        <Col xs={24} md={12} xl={6}>
          <SummaryCard
            icon={<Coins size={20} />}
            title="Cong no can thu"
            subtitle={`${finance?.pending_payments_count || 0} don chua thu du`}
            value={formatCurrency(finance?.total_receivables)}
            accent="#B76E00"
          />
        </Col>
        <Col xs={24} md={12} xl={6}>
          <SummaryCard
            icon={<ArrowRightLeft size={20} />}
            title="Tien cho phe duyet"
            subtitle="Ung luong va nop tien dang cho manager"
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
                title="Hang doi phe duyet"
                description="Xu ly cac quyet dinh tai chinh can manager xac nhan de quy trinh tiep tuc khong bi dung."
              />
            </CardSection>
            <div style={{ padding: "0 24px 24px" }}>
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 16, borderRadius: 12 }}
                message="Luong cong viec hop tac"
                description="Tai xe gui yeu cau, manager phe duyet, sau do ke toan va dieu phoi tiep tuc xu ly. Cac bang ben duoi duoc dong bo real-time khi co thay doi."
              />
              <Space direction="vertical" size="large" style={{ width: "100%" }}>
                <div>
                  <QueueHeader
                    title="Ung luong"
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
                    locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Khong co yeu cau ung luong." /> }}
                    scroll={{ x: "max-content" }}
                  />
                </div>

                <div>
                  <QueueHeader
                    title="Nop tien cong no"
                    description="Xac nhan tai xe da nop tien ve cong ty hay yeu cau bo sung."
                    extra={<Text type="secondary">{debtRepayments.length} pending</Text>}
                  />
                  <Table
                    style={{ marginTop: 12 }}
                    loading={loading}
                    rowKey="id"
                    columns={repaymentColumns}
                    dataSource={debtRepayments}
                    pagination={{ pageSize: 5 }}
                    locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Khong co yeu cau nop tien." /> }}
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
                  description="Theo doi nhung yeu cau phieu thu coordinator dang can xu ly."
                />
              </CardSection>
              <div style={{ padding: "0 24px 24px" }}>
                <List
                  loading={loading}
                  dataSource={receiptRequests.slice(0, 6)}
                  locale={{ emptyText: "Khong co yeu cau phieu thu." }}
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
                            <Text>{item.driver_name || "Chua co tai xe"} {"->"} {item.customer_name || "Khach le"}</Text>
                            <Text type="secondary">{item.cargo_name || "Khong co ten hang"} {"|"} {formatCurrency(item.receipt_amount)}</Text>
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
                  description="Thong tin ngan hang va lien he duoc driver va doi tac su dung xuyen suot trong quy trinh."
                />
              </CardSection>
              <div style={{ padding: "0 24px 24px" }}>
                <Form form={companyForm} layout="vertical">
                  <Form.Item label="Ten cong ty" name="company_name">
                    <Input placeholder="Cong ty Van tai..." />
                  </Form.Item>
                  <Form.Item label="Hotline" name="hotline">
                    <Input placeholder="090..." />
                  </Form.Item>
                  <Form.Item label="Ngan hang" name="bank_name">
                    <Input placeholder="VCB, ACB..." />
                  </Form.Item>
                  <Form.Item label="So tai khoan" name="bank_account_number">
                    <Input placeholder="123456789" />
                  </Form.Item>
                  <Form.Item label="Chu tai khoan" name="bank_account_name">
                    <Input placeholder="Cong ty / Dai dien" />
                  </Form.Item>
                  <Space style={{ width: "100%", justifyContent: "space-between" }}>
                    <Text type="secondary">
                      {companyInfo?.updated_at ? `Cap nhat lan cuoi: ${new Date(companyInfo.updated_at).toLocaleString("vi-VN")}` : "Chua co ban ghi cong ty."}
                    </Text>
                    <Button type="primary" loading={savingCompany} onClick={handleSaveCompany}>
                      Luu thay doi
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
                  Tong quan tai chinh
                </Title>
              </Space>
              <Row gutter={16}>
                <Col span={12}>
                  <Statistic title="Tong doanh thu" value={Number(finance?.total_revenue || 0)} suffix="đ" formatter={(value) => currency.format(Number(value || 0))} />
                </Col>
                <Col span={12}>
                  <Statistic title="Thuc thu" value={Number(finance?.total_collected || 0)} suffix="đ" formatter={(value) => currency.format(Number(value || 0))} />
                </Col>
              </Row>
              <Descriptions size="small" column={1} bordered>
                <Descriptions.Item label="Don chua thu du">{finance?.pending_payments_count || 0}</Descriptions.Item>
                <Descriptions.Item label="Cong no can theo doi">{formatCurrency(finance?.total_receivables)}</Descriptions.Item>
                <Descriptions.Item label="Tien ung luong dang cho">{formatCurrency(overview?.workflow?.pending_advances_amount)}</Descriptions.Item>
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
                  Phan bo vai tro
                </Title>
              </Space>
              <Row gutter={[12, 12]}>
                <Col span={12}><QueuePill count={overview?.workforce?.manager_count || 0} label="manager" tone="red" /></Col>
                <Col span={12}><QueuePill count={overview?.workforce?.coordinator_count || 0} label="coordinator" tone="blue" /></Col>
                <Col span={12}><QueuePill count={overview?.workforce?.accountant_count || 0} label="accountant" tone="green" /></Col>
                <Col span={12}><QueuePill count={overview?.workforce?.driver_count || 0} label="driver" tone="orange" /></Col>
              </Row>
              <Text style={{ color: C.onSurfaceVariant }}>
                Dung cac tab Nguoi dung va Quan ly xe de can thiep chi tiet, con bang nay giup manager nhin nhanh muc tai nguyen dang phan bo cho van hanh.
              </Text>
            </Space>
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
