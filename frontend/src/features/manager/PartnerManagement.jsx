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
      message.error(error.message || "Không thể tải danh sách đối tác.");
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
        message.success("Đã cập nhật đối tác.");
      } else {
        await createManagerPartner(values);
        message.success("Đã tạo đối tác mới.");
      }
      setModalOpen(false);
      setEditingPartner(null);
      form.resetFields();
      await loadPartners();
    } catch (error) {
      if (error?.errorFields) return;
      message.error(error.message || "Không thể lưu đối tác.");
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
      message.error(error.message || "Không thể tải công nợ đối tác.");
      setDebtDrawerOpen(false);
    } finally {
      setDebtLoading(false);
    }
  };

  const partnerColumns = [
    {
      title: "Đối tác",
      key: "company",
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{record.company_name}</Text>
          <Text type="secondary">{record.short_name || `#${record.id}`}</Text>
        </Space>
      ),
    },
    {
      title: "Người liên hệ",
      dataIndex: "contact_person",
      key: "contact_person",
      render: (value) => value || <Text type="secondary">Chưa cập nhật</Text>,
    },
    {
      title: "Liên hệ",
      key: "contact",
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text>{record.phone || "-"}</Text>
          <Text type="secondary">{record.email || "Không có email"}</Text>
          <Text type="secondary">{record.tax_code || "Chưa có MST"}</Text>
        </Space>
      ),
    },
    {
      title: "Công nợ",
      key: "debt",
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong style={{ color: Number(record.total_remaining || 0) > 0 ? C.error : C.success }}>
            {formatCurrency(record.total_remaining)}
          </Text>
          <Text type="secondary">{record.debt_count || 0} khoản nợ</Text>
        </Space>
      ),
    },
    {
      title: "Trạng thái",
      key: "status",
      render: (_, record) => (
        Number(record.total_remaining || 0) > 0
          ? <Tag color="red">CÓ CÔNG NỢ</Tag>
          : <Tag color="green">KHÔNG NỢ</Tag>
      ),
    },
    {
      title: "Thao tác",
      key: "actions",
      render: (_, record) => (
        <Space>
          <Button size="small" onClick={() => openEditModal(record)}>
            Sửa
          </Button>
          <Button
            type="primary"
            size="small"
            ghost
            disabled={Number(record.debt_count || 0) === 0}
            onClick={() => openDebtDrawer(record)}
          >
            Xem công nợ
          </Button>
        </Space>
      ),
    },
  ];

  const debtColumns = [
    {
      title: "Đơn/Chuyến",
      key: "refs",
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>Order #{record.order_id || "-"}</Text>
          <Text type="secondary">Shipment #{record.shipment_id || "-"}</Text>
        </Space>
      ),
    },
    {
      title: "Khách hàng",
      key: "customer",
      render: (_, record) => record.customer_company || record.customer_name || <Text type="secondary">Không có</Text>,
    },
    {
      title: "Hàng hóa",
      dataIndex: "cargo_name",
      key: "cargo_name",
      render: (value) => value || <Text type="secondary">Không có</Text>,
    },
    {
      title: "Tổng nợ",
      dataIndex: "total_amount",
      key: "total_amount",
      render: (value) => formatCurrency(value),
    },
    {
      title: "Đã thu",
      dataIndex: "paid_amount",
      key: "paid_amount",
      render: (value) => <Text style={{ color: C.success }}>{formatCurrency(value)}</Text>,
    },
    {
      title: "Còn lại",
      dataIndex: "remaining",
      key: "remaining",
      render: (value) => <Text strong style={{ color: Number(value || 0) > 0 ? C.error : C.success }}>{formatCurrency(value)}</Text>,
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      render: (value) => <Tag color={debtStatusColors[value] || "default"}>{String(value || "").toUpperCase()}</Tag>,
    },
    {
      title: "Hạn",
      dataIndex: "due_date",
      key: "due_date",
      render: (value) => value ? new Date(value).toLocaleDateString("vi-VN") : <Text type="secondary">Không có</Text>,
    },
  ];

  const totalRemaining = Number(summary.total_remaining || 0);

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <PartnerStatCard
            icon={<Building2 size={20} />}
            title="Tổng đối tác"
            value={summary.total_partners || 0}
            subtitle="Danh bạ đối tác manager đang theo dõi"
            accent="#3B4FD8"
          />
        </Col>
        <Col xs={24} md={8}>
          <PartnerStatCard
            icon={<FileSearch size={20} />}
            title="Đối tác có công nợ"
            value={summary.partners_with_debt || 0}
            subtitle="Chỉ hiển thị khi đối tác thực sự còn nợ"
            accent="#B76E00"
          />
        </Col>
        <Col xs={24} md={8}>
          <PartnerStatCard
            icon={<Wallet size={20} />}
            title="Tổng còn phải thu"
            value={formatCurrency(totalRemaining)}
            subtitle="Tổng giá trị công nợ partner hiện có"
            accent="#BA1A1A"
          />
        </Col>
      </Row>

      <PageContainer>
        <CardSection style={{ paddingBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <Title level={4} style={{ margin: 0, color: C.onSurface }}>
                Danh sách đối tác
              </Title>
              <Text style={{ color: C.onSurfaceVariant }}>
                Quản lý thông tin đối tác và xem công nợ nếu đối tác đang còn phải thanh toán.
              </Text>
            </div>
            <Space wrap>
              <Input
                placeholder="Tìm theo tên công ty, người liên hệ..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onPressEnter={() => loadPartners(search)}
                style={{ width: 280 }}
                allowClear
              />
              <Button onClick={() => loadPartners(search)}>Tìm</Button>
              <Button type="primary" icon={<Plus size={16} />} onClick={openCreateModal}>
                Thêm đối tác
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
              emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có đối tác nào." />,
            }}
            scroll={{ x: "max-content" }}
          />
        </div>
      </PageContainer>

      <Modal
        open={modalOpen}
        title={editingPartner ? "Cập nhật đối tác" : "Thêm đối tác"}
        okText={editingPartner ? "Lưu thay đổi" : "Tạo đối tác"}
        cancelText="Hủy"
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
                label="Tên công ty"
                name="company_name"
                rules={[{ required: true, message: "Vui lòng nhập tên đối tác" }]}
              >
                <Input placeholder="Công ty ABC" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Tên viết tắt" name="short_name">
                <Input placeholder="ABC Logistics" />
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item label="Người liên hệ" name="contact_person">
                <Input placeholder="Nguyen Van A" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Số điện thoại" name="phone">
                <Input placeholder="090..." />
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item label="Email" name="email">
                <Input placeholder="partner@example.com" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Hạn thanh toán (ngày)" name="payment_term_days">
                <Input type="number" min={0} placeholder="15 / 30 / 45" />
              </Form.Item>
            </Col>

            <Col xs={24}>
              <Form.Item label="Địa chỉ" name="address">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item label="Mã số thuế" name="tax_code">
                <Input placeholder="0312345678" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Số đăng ký kinh doanh" name="business_registration_number">
                <Input placeholder="0312345678-001" />
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item label="Ngân hàng" name="bank_name">
                <Input placeholder="Vietcombank" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Số tài khoản" name="bank_account_number">
                <Input placeholder="001122334455" />
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item label="Chủ tài khoản" name="bank_account_name">
                <Input placeholder="TEN DOI TAC" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Ghi chú" name="notes">
                <Input.TextArea rows={3} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Drawer
        open={debtDrawerOpen}
        width={920}
        title={selectedPartner ? `Công nợ đối tác: ${selectedPartner.company_name}` : "Công nợ đối tác"}
        onClose={() => {
          setDebtDrawerOpen(false);
          setSelectedPartner(null);
          setSelectedPartnerDebts([]);
        }}
      >
        {selectedPartner ? (
          <Space direction="vertical" size="large" style={{ width: "100%" }}>
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="Tên viết tắt">{selectedPartner.short_name || "Chưa cập nhật"}</Descriptions.Item>
              <Descriptions.Item label="Người liên hệ">{selectedPartner.contact_person || "Chưa cập nhật"}</Descriptions.Item>
              <Descriptions.Item label="Số điện thoại">{selectedPartner.phone || "Chưa cập nhật"}</Descriptions.Item>
              <Descriptions.Item label="Email">{selectedPartner.email || "Chưa cập nhật"}</Descriptions.Item>
              <Descriptions.Item label="Mã số thuế">{selectedPartner.tax_code || "Chưa cập nhật"}</Descriptions.Item>
              <Descriptions.Item label="DKKD">{selectedPartner.business_registration_number || "Chưa cập nhật"}</Descriptions.Item>
              <Descriptions.Item label="Hạn thanh toán">{selectedPartner.payment_term_days ? `${selectedPartner.payment_term_days} ngày` : "Chưa cập nhật"}</Descriptions.Item>
              <Descriptions.Item label="Ngân hàng">{selectedPartner.bank_name || "Chưa cập nhật"}</Descriptions.Item>
              <Descriptions.Item label="Số tài khoản">{selectedPartner.bank_account_number || "Chưa cập nhật"}</Descriptions.Item>
              <Descriptions.Item label="Chủ tài khoản">{selectedPartner.bank_account_name || "Chưa cập nhật"}</Descriptions.Item>
              <Descriptions.Item label="Địa chỉ">{selectedPartner.address || "Chưa cập nhật"}</Descriptions.Item>
            </Descriptions>

            <Row gutter={[16, 16]}>
              <Col span={8}>
                <Statistic title="Số khoản nợ" value={selectedPartnerDebts.length} />
              </Col>
              <Col span={8}>
                <Statistic
                  title="Tổng nợ"
                  value={selectedPartnerDebts.reduce((sum, item) => sum + Number(item.total_amount || 0), 0)}
                  formatter={(value) => formatCurrency(value)}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title="Còn lại"
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
                emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Đối tác này hiện không có công nợ." />,
              }}
              scroll={{ x: "max-content" }}
            />
          </Space>
        ) : null}
      </Drawer>
    </Space>
  );
}
