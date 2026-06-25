import React, { useEffect, useState } from "react";
import {
  Button,
  Col,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import { Building2, FileSearch, Plus, Wallet } from "lucide-react";
import PageContainer, { CardSection } from "../../components/common/PageContainer";
import { useRoleRealtime } from "../../hooks/useRoleRealtime";
import { C } from "../../styles/theme";
import {
  createManagerPartner,
  fetchManagerPartnerDebts,
  fetchManagerPartners,
  updateManagerPartner,
} from "./managerApi";

const { Title, Text } = Typography;
const currency = new Intl.NumberFormat("vi-VN");

const debtStatusColors = {
  paid: "green",
  partial: "gold",
  unpaid: "red",
  overdue: "volcano",
};

function formatCurrency(value) {
  return `${currency.format(Number(value || 0))}d`;
}

function PartnerStatCard({ icon, title, value, subtitle, accent }) {
  return (
    <div
      style={{
        borderRadius: 18,
        padding: 20,
        background: `linear-gradient(135deg, #ffffff 0%, ${accent}12 100%)`,
        border: `1px solid ${C.outlineVariant}55`,
        boxShadow: "0 10px 28px rgba(11,28,48,0.05)",
        height: "100%",
      }}
    >
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: `${accent}18`,
            color: accent,
          }}
        >
          {icon}
        </div>
        <div>
          <Text style={{ color: C.onSurfaceVariant }}>{title}</Text>
          <Title level={3} style={{ margin: "8px 0 4px", color: C.onSurface }}>
            {value}
          </Title>
          <Text style={{ color: C.onSurfaceVariant }}>{subtitle}</Text>
        </div>
      </Space>
    </div>
  );
}

export default function PartnerManagement({ user }) {
  const [partners, setPartners] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState(null);
  const [saving, setSaving] = useState(false);
  const [debtDrawerOpen, setDebtDrawerOpen] = useState(false);
  const [debtLoading, setDebtLoading] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState(null);
  const [selectedPartnerDebts, setSelectedPartnerDebts] = useState([]);
  const [form] = Form.useForm();

  const loadPartners = async (nextSearch = search) => {
    try {
      setLoading(true);
      const data = await fetchManagerPartners(nextSearch);
      setPartners(data.partners || []);
      setSummary(data.summary || {});
    } catch (error) {
      message.error(error.message || "Khong the tai danh sach doi tac.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPartners("");
  }, []);

  useRoleRealtime(user, {
    onMessage: (payload) => {
      if (payload?.type === "manager.partners.changed") {
        loadPartners();
      }
    },
  });

  const openCreateModal = () => {
    setEditingPartner(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEditModal = (partner) => {
    setEditingPartner(partner);
    form.setFieldsValue({
      company_name: partner.company_name || "",
      short_name: partner.short_name || "",
      contact_person: partner.contact_person || "",
      phone: partner.phone || "",
      email: partner.email || "",
      address: partner.address || "",
      tax_code: partner.tax_code || "",
      business_registration_number: partner.business_registration_number || "",
      payment_term_days: partner.payment_term_days ?? "",
      bank_name: partner.bank_name || "",
      bank_account_number: partner.bank_account_number || "",
      bank_account_name: partner.bank_account_name || "",
      notes: partner.notes || "",
    });
    setModalOpen(true);
  };

  const handleSavePartner = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      if (editingPartner) {
        await updateManagerPartner(editingPartner.id, values);
        message.success("Da cap nhat doi tac.");
      } else {
        await createManagerPartner(values);
        message.success("Da tao doi tac moi.");
      }
      setModalOpen(false);
      setEditingPartner(null);
      form.resetFields();
      await loadPartners();
    } catch (error) {
      if (error?.errorFields) return;
      message.error(error.message || "Khong the luu doi tac.");
    } finally {
      setSaving(false);
    }
  };

  const openDebtDrawer = async (partner) => {
    try {
      setDebtDrawerOpen(true);
      setSelectedPartner(partner);
      setDebtLoading(true);
      const data = await fetchManagerPartnerDebts(partner.id);
      setSelectedPartner(data.partner || partner);
      setSelectedPartnerDebts(data.debts || []);
    } catch (error) {
      message.error(error.message || "Khong the tai cong no doi tac.");
      setDebtDrawerOpen(false);
    } finally {
      setDebtLoading(false);
    }
  };

  const partnerColumns = [
    {
      title: "Doi tac",
      key: "company",
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{record.company_name}</Text>
          <Text type="secondary">{record.short_name || `#${record.id}`}</Text>
        </Space>
      ),
    },
    {
      title: "Nguoi lien he",
      dataIndex: "contact_person",
      key: "contact_person",
      render: (value) => value || <Text type="secondary">Chua cap nhat</Text>,
    },
    {
      title: "Lien he",
      key: "contact",
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text>{record.phone || "-"}</Text>
          <Text type="secondary">{record.email || "Khong co email"}</Text>
          <Text type="secondary">{record.tax_code || "Chua co MST"}</Text>
        </Space>
      ),
    },
    {
      title: "Cong no",
      key: "debt",
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong style={{ color: Number(record.total_remaining || 0) > 0 ? C.error : C.success }}>
            {formatCurrency(record.total_remaining)}
          </Text>
          <Text type="secondary">{record.debt_count || 0} khoan no</Text>
        </Space>
      ),
    },
    {
      title: "Trang thai",
      key: "status",
      render: (_, record) => (
        Number(record.total_remaining || 0) > 0
          ? <Tag color="red">CO CONG NO</Tag>
          : <Tag color="green">KHONG NO</Tag>
      ),
    },
    {
      title: "Thao tac",
      key: "actions",
      render: (_, record) => (
        <Space>
          <Button size="small" onClick={() => openEditModal(record)}>
            Sua
          </Button>
          <Button
            type="primary"
            size="small"
            ghost
            disabled={Number(record.debt_count || 0) === 0}
            onClick={() => openDebtDrawer(record)}
          >
            Xem cong no
          </Button>
        </Space>
      ),
    },
  ];

  const debtColumns = [
    {
      title: "Don/Chuyen",
      key: "refs",
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>Order #{record.order_id || "-"}</Text>
          <Text type="secondary">Shipment #{record.shipment_id || "-"}</Text>
        </Space>
      ),
    },
    {
      title: "Khach hang",
      key: "customer",
      render: (_, record) => record.customer_company || record.customer_name || <Text type="secondary">Khong co</Text>,
    },
    {
      title: "Hang hoa",
      dataIndex: "cargo_name",
      key: "cargo_name",
      render: (value) => value || <Text type="secondary">Khong co</Text>,
    },
    {
      title: "Tong no",
      dataIndex: "total_amount",
      key: "total_amount",
      render: (value) => formatCurrency(value),
    },
    {
      title: "Da thu",
      dataIndex: "paid_amount",
      key: "paid_amount",
      render: (value) => <Text style={{ color: C.success }}>{formatCurrency(value)}</Text>,
    },
    {
      title: "Con lai",
      dataIndex: "remaining",
      key: "remaining",
      render: (value) => <Text strong style={{ color: Number(value || 0) > 0 ? C.error : C.success }}>{formatCurrency(value)}</Text>,
    },
    {
      title: "Trang thai",
      dataIndex: "status",
      key: "status",
      render: (value) => <Tag color={debtStatusColors[value] || "default"}>{String(value || "").toUpperCase()}</Tag>,
    },
    {
      title: "Han",
      dataIndex: "due_date",
      key: "due_date",
      render: (value) => value ? new Date(value).toLocaleDateString("vi-VN") : <Text type="secondary">Khong co</Text>,
    },
  ];

  const totalRemaining = Number(summary.total_remaining || 0);

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <PartnerStatCard
            icon={<Building2 size={20} />}
            title="Tong doi tac"
            value={summary.total_partners || 0}
            subtitle="Danh ba doi tac manager dang theo doi"
            accent="#3B4FD8"
          />
        </Col>
        <Col xs={24} md={8}>
          <PartnerStatCard
            icon={<FileSearch size={20} />}
            title="Doi tac co cong no"
            value={summary.partners_with_debt || 0}
            subtitle="Chi hien thi khi doi tac thuc su con no"
            accent="#B76E00"
          />
        </Col>
        <Col xs={24} md={8}>
          <PartnerStatCard
            icon={<Wallet size={20} />}
            title="Tong con phai thu"
            value={formatCurrency(totalRemaining)}
            subtitle="Tong gia tri cong no partner hien co"
            accent="#BA1A1A"
          />
        </Col>
      </Row>

      <PageContainer>
        <CardSection style={{ paddingBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <Title level={4} style={{ margin: 0, color: C.onSurface }}>
                Danh sach doi tac
              </Title>
              <Text style={{ color: C.onSurfaceVariant }}>
                Quan ly thong tin doi tac va xem cong no neu doi tac dang con phai thanh toan.
              </Text>
            </div>
            <Space wrap>
              <Input
                placeholder="Tim theo ten cong ty, nguoi lien he..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onPressEnter={() => loadPartners(search)}
                style={{ width: 280 }}
                allowClear
              />
              <Button onClick={() => loadPartners(search)}>Tim</Button>
              <Button type="primary" icon={<Plus size={16} />} onClick={openCreateModal}>
                Them doi tac
              </Button>
            </Space>
          </div>
        </CardSection>

        <div style={{ padding: "0 24px 24px" }}>
          <Table
            rowKey="id"
            loading={loading}
            columns={partnerColumns}
            dataSource={partners}
            pagination={{ pageSize: 10 }}
            locale={{
              emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chua co doi tac nao." />,
            }}
            scroll={{ x: "max-content" }}
          />
        </div>
      </PageContainer>

      <Modal
        open={modalOpen}
        title={editingPartner ? "Cap nhat doi tac" : "Them doi tac"}
        okText={editingPartner ? "Luu thay doi" : "Tao doi tac"}
        cancelText="Huy"
        onCancel={() => {
          setModalOpen(false);
          setEditingPartner(null);
          form.resetFields();
        }}
        onOk={handleSavePartner}
        confirmLoading={saving}
        width={960}
        styles={{
          body: {
            maxHeight: "72vh",
            overflowY: "auto",
            paddingRight: 8,
          },
        }}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                label="Ten cong ty"
                name="company_name"
                rules={[{ required: true, message: "Vui long nhap ten doi tac" }]}
              >
                <Input placeholder="Cong ty ABC" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Ten viet tat" name="short_name">
                <Input placeholder="ABC Logistics" />
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item label="Nguoi lien he" name="contact_person">
                <Input placeholder="Nguyen Van A" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="So dien thoai" name="phone">
                <Input placeholder="090..." />
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item label="Email" name="email">
                <Input placeholder="partner@example.com" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Han thanh toan (ngay)" name="payment_term_days">
                <Input type="number" min={0} placeholder="15 / 30 / 45" />
              </Form.Item>
            </Col>

            <Col xs={24}>
              <Form.Item label="Dia chi" name="address">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item label="Ma so thue" name="tax_code">
                <Input placeholder="0312345678" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="So dang ky kinh doanh" name="business_registration_number">
                <Input placeholder="0312345678-001" />
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item label="Ngan hang" name="bank_name">
                <Input placeholder="Vietcombank" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="So tai khoan" name="bank_account_number">
                <Input placeholder="001122334455" />
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item label="Chu tai khoan" name="bank_account_name">
                <Input placeholder="TEN DOI TAC" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Ghi chu" name="notes">
                <Input.TextArea rows={3} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Drawer
        open={debtDrawerOpen}
        width={920}
        title={selectedPartner ? `Cong no doi tac: ${selectedPartner.company_name}` : "Cong no doi tac"}
        onClose={() => {
          setDebtDrawerOpen(false);
          setSelectedPartner(null);
          setSelectedPartnerDebts([]);
        }}
      >
        {selectedPartner ? (
          <Space direction="vertical" size="large" style={{ width: "100%" }}>
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="Ten viet tat">{selectedPartner.short_name || "Chua cap nhat"}</Descriptions.Item>
              <Descriptions.Item label="Nguoi lien he">{selectedPartner.contact_person || "Chua cap nhat"}</Descriptions.Item>
              <Descriptions.Item label="So dien thoai">{selectedPartner.phone || "Chua cap nhat"}</Descriptions.Item>
              <Descriptions.Item label="Email">{selectedPartner.email || "Chua cap nhat"}</Descriptions.Item>
              <Descriptions.Item label="Ma so thue">{selectedPartner.tax_code || "Chua cap nhat"}</Descriptions.Item>
              <Descriptions.Item label="DKKD">{selectedPartner.business_registration_number || "Chua cap nhat"}</Descriptions.Item>
              <Descriptions.Item label="Han thanh toan">{selectedPartner.payment_term_days ? `${selectedPartner.payment_term_days} ngay` : "Chua cap nhat"}</Descriptions.Item>
              <Descriptions.Item label="Ngan hang">{selectedPartner.bank_name || "Chua cap nhat"}</Descriptions.Item>
              <Descriptions.Item label="So tai khoan">{selectedPartner.bank_account_number || "Chua cap nhat"}</Descriptions.Item>
              <Descriptions.Item label="Chu tai khoan">{selectedPartner.bank_account_name || "Chua cap nhat"}</Descriptions.Item>
              <Descriptions.Item label="Dia chi">{selectedPartner.address || "Chua cap nhat"}</Descriptions.Item>
            </Descriptions>

            <Row gutter={[16, 16]}>
              <Col span={8}>
                <Statistic title="So khoan no" value={selectedPartnerDebts.length} />
              </Col>
              <Col span={8}>
                <Statistic
                  title="Tong no"
                  value={selectedPartnerDebts.reduce((sum, item) => sum + Number(item.total_amount || 0), 0)}
                  formatter={(value) => formatCurrency(value)}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title="Con lai"
                  value={selectedPartnerDebts.reduce((sum, item) => sum + Number(item.remaining || 0), 0)}
                  formatter={(value) => formatCurrency(value)}
                />
              </Col>
            </Row>

            <Table
              rowKey="id"
              loading={debtLoading}
              columns={debtColumns}
              dataSource={selectedPartnerDebts}
              pagination={{ pageSize: 6 }}
              locale={{
                emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Doi tac nay hien khong co cong no." />,
              }}
              scroll={{ x: "max-content" }}
            />
          </Space>
        ) : null}
      </Drawer>
    </Space>
  );
}
