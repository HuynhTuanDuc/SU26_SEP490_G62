import React, { useCallback, useEffect, useState } from "react";
import {
  Alert, Button, Card, Col, Descriptions, Form, Input,
  InputNumber, Modal, Row, Select, Space, Spin, Statistic,
  Table, Tabs, Tag, Typography, message,
} from "antd";
import { CheckCircle, Gift, PlusCircle, RefreshCw, XCircle } from "lucide-react";
import PageContainer, { CardSection } from "../../components/common/PageContainer";
import { C } from "../../styles/theme";
import {
  approveManagerBonus,
  createManagerBonus,
  fetchDriverList,
  fetchManagerBonuses,
  fetchManagerBonusStats,
  generateTetBonuses,
  previewTetBonuses,
  rejectManagerBonus,
} from "./managerApi";

const { Text, Title } = Typography;
const { Option } = Select;
const { TabPane } = Tabs;

const NOW = new Date();
const YEARS = [NOW.getFullYear(), NOW.getFullYear() - 1, NOW.getFullYear() - 2];

const fmt = (v) => new Intl.NumberFormat("vi-VN").format(Number(v || 0)) + "đ";

const TYPE_LABEL = {
  tet_annual:       "Thưởng Tết",
  welfare_wedding:  "Phúc lợi - Kết hôn",
  welfare_funeral:  "Phúc lợi - Tang gia",
  welfare_birthday: "Phúc lợi - Sinh nhật",
  holiday_overtime: "Làm thêm ngày lễ",
  special:          "Thưởng đặc biệt",
};

const WELFARE_AMOUNT = {
  welfare_birthday: 200_000,
  welfare_wedding:  1_000_000,
};

const STATUS_TAG = {
  pending:  <Tag color="orange">Chờ duyệt</Tag>,
  approved: <Tag color="blue">Đã duyệt</Tag>,
  rejected: <Tag color="red">Từ chối</Tag>,
  paid:     <Tag color="green">Đã chi</Tag>,
};

export default function ManagerBonusPage() {
  const [tab, setTab] = useState("list");

  const [bonuses,  setBonuses]  = useState([]);
  const [stats,    setStats]    = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [year,     setYear]     = useState(NOW.getFullYear());
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");

  const [approveModal, setApproveModal] = useState(null);
  const [rejectModal,  setRejectModal]  = useState(null);
  const [adjustAmount, setAdjustAmount] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [acting, setActing] = useState(false);

  const [tetYear,    setTetYear]    = useState(NOW.getFullYear());
  const [preview,    setPreview]    = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [drivers,     setDrivers]     = useState([]);
  const [createForm]                  = Form.useForm();
  const [creating,    setCreating]    = useState(false);
  const [welfareType, setWelfareType] = useState("");

  const loadBonuses = useCallback(async () => {
    setLoading(true);
    try {
      const [bonusRes, statsRes] = await Promise.all([
        fetchManagerBonuses({ year, type: typeFilter || undefined, status: statusFilter || undefined }),
        fetchManagerBonusStats(year),
      ]);
      setBonuses(bonusRes.bonuses || bonusRes || []);
      setStats(statsRes);
    } catch (e) {
      message.error(e.message || "Lỗi tải dữ liệu thưởng");
    } finally {
      setLoading(false);
    }
  }, [year, typeFilter, statusFilter]);

  useEffect(() => { loadBonuses(); }, [loadBonuses]);

  useEffect(() => {
    fetchDriverList()
      .then((res) => setDrivers((res.users || []).filter((u) => u.role === "driver")))
      .catch(() => {});
  }, []);

  const handleApprove = async () => {
    setActing(true);
    try {
      await approveManagerBonus(approveModal.id, adjustAmount ?? undefined);
      message.success("Đã duyệt thưởng");
      setApproveModal(null);
      loadBonuses();
    } catch (e) {
      message.error(e.message || "Lỗi duyệt");
    } finally {
      setActing(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) { message.warning("Vui lòng nhập lý do từ chối"); return; }
    setActing(true);
    try {
      await rejectManagerBonus(rejectModal.id, rejectReason.trim());
      message.success("Đã từ chối");
      setRejectModal(null);
      setRejectReason("");
      loadBonuses();
    } catch (e) {
      message.error(e.message || "Lỗi từ chối");
    } finally {
      setActing(false);
    }
  };

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      const data = await previewTetBonuses(tetYear);
      setPreview(data);
    } catch (e) {
      message.error(e.message || "Lỗi preview");
    } finally {
      setPreviewing(false);
    }
  };

  const handleGenerate = async () => {
    Modal.confirm({
      title: `Tạo thưởng Tết ${tetYear}`,
      content: `Hệ thống sẽ tự động tính và tạo phiếu thưởng Tết ${tetYear} cho tất cả tài xế chưa có. Tiếp tục?`,
      okText: "Tạo thưởng",
      cancelText: "Hủy",
      onOk: async () => {
        setGenerating(true);
        try {
          const res = await generateTetBonuses(tetYear);
          message.success(`Đã tạo ${res.inserted} phiếu thưởng Tết (bỏ qua ${res.skipped} đã tồn tại)`);
          setPreview(null);
          loadBonuses();
        } catch (e) {
          message.error(e.message || "Lỗi tạo thưởng Tết");
        } finally {
          setGenerating(false);
        }
      },
    });
  };

  const handleCreate = async (values) => {
    setCreating(true);
    try {
      await createManagerBonus(values);
      message.success("Đã tạo phúc lợi thành công");
      createForm.resetFields();
      setWelfareType("");
      loadBonuses();
      setTab("list");
    } catch (e) {
      message.error(e.message || "Lỗi tạo phúc lợi");
    } finally {
      setCreating(false);
    }
  };

  const onWelfareTypeChange = (t) => {
    setWelfareType(t);
    const auto = WELFARE_AMOUNT[t];
    if (auto) createForm.setFieldValue("amount", auto);
    else createForm.setFieldValue("amount", undefined);
  };

  const columns = [
    {
      title: "Tài xế",
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.driver_name}</div>
          <div style={{ color: C.onSurfaceVariant, fontSize: 12 }}>{r.driver_phone}</div>
        </div>
      ),
    },
    {
      title: "Loại",
      render: (_, r) => TYPE_LABEL[r.type] || r.type,
      width: 170,
    },
    {
      title: "Năm",
      dataIndex: "year",
      width: 60,
      align: "center",
    },
    {
      title: "Số tiền",
      render: (_, r) => <span style={{ fontWeight: 600 }}>{fmt(r.amount)}</span>,
      align: "right",
      width: 130,
    },
    {
      title: "Ghi chú",
      render: (_, r) => (
        <div>
          {r.notes && <div>{r.notes}</div>}
          {r.beneficiary_name && (
            <div style={{ color: C.onSurfaceVariant, fontSize: 12 }}>
              {r.beneficiary_name} ({r.beneficiary_relation})
            </div>
          )}
          {r.rejection_reason && (
            <div style={{ color: "#BA1A1A", fontSize: 12 }}>Lý do: {r.rejection_reason}</div>
          )}
        </div>
      ),
    },
    {
      title: "Trạng thái",
      render: (_, r) => STATUS_TAG[r.status] || <Tag>{r.status}</Tag>,
      width: 110,
      align: "center",
    },
    {
      title: "Thao tác",
      width: 160,
      align: "center",
      render: (_, r) =>
        r.status === "pending" ? (
          <Space size={6}>
            <Button
              size="small"
              type="primary"
              icon={<CheckCircle size={13} />}
              onClick={() => { setApproveModal(r); setAdjustAmount(r.amount); }}
            >
              Duyệt
            </Button>
            <Button
              size="small"
              danger
              icon={<XCircle size={13} />}
              onClick={() => { setRejectModal(r); setRejectReason(""); }}
            >
              Từ chối
            </Button>
          </Space>
        ) : null,
    },
  ];

  const tetPreviewCols = [
    { title: "Tài xế",        dataIndex: "full_name",              width: 160 },
    { title: "Nhóm xe",       dataIndex: "vehicle_group",          width: 140 },
    { title: "Tháng đủ",      dataIndex: "months_full_count",      width: 90, align: "center" },
    { title: "Tháng thiếu",   dataIndex: "months_incomplete_count",width: 90, align: "center" },
    { title: "Thâm niên",     render: (_, r) => fmt(r.seniority_bonus),  align: "right", width: 110 },
    { title: "Chuyên cần",    render: (_, r) => fmt(r.attendance_bonus), align: "right", width: 110 },
    {
      title: "Tổng",
      render: (_, r) => <b>{fmt(r.total)}</b>,
      align: "right",
      width: 120,
    },
    {
      title: "Đã tồn tại",
      render: (_, r) => r.already_exists ? <Tag color="green">Có</Tag> : <Tag color="orange">Chưa</Tag>,
      align: "center",
      width: 90,
    },
  ];

  const needFuneral    = ["welfare_funeral"].includes(welfareType);
  const needBeneficiary = ["welfare_wedding", "welfare_funeral"].includes(welfareType);
  const isAutoAmount   = !!WELFARE_AMOUNT[welfareType];

  return (
    <PageContainer>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        {[
          { label: "Chờ duyệt",  value: stats?.pending_count  || 0, color: "#B76E00" },
          { label: "Đã duyệt",   value: stats?.approved_count || 0, color: "#2146C7" },
          { label: "Tổng đã duyệt", value: fmt(stats?.approved_total || 0), color: "#2146C7" },
          { label: "Tổng đã chi",   value: fmt(stats?.paid_total || 0),     color: "#1E7E34" },
        ].map((s) => (
          <Col span={6} key={s.label}>
            <Card size="small" style={{ borderRadius: 10 }}>
              <Statistic title={s.label} value={s.value} valueStyle={{ color: s.color, fontSize: 18 }} />
            </Card>
          </Col>
        ))}
      </Row>

      <Tabs activeKey={tab} onChange={setTab}>
        <TabPane tab="Duyệt thưởng" key="list">
          <Space wrap style={{ marginBottom: 16 }}>
            <Select value={year} onChange={setYear} style={{ width: 90 }}>
              {YEARS.map((y) => <Option key={y} value={y}>{y}</Option>)}
            </Select>
            <Select value={typeFilter} onChange={setTypeFilter} style={{ width: 200 }} placeholder="Tất cả loại">
              <Option value="">Tất cả loại</Option>
              {Object.entries(TYPE_LABEL).map(([k, v]) => <Option key={k} value={k}>{v}</Option>)}
            </Select>
            <Select value={statusFilter} onChange={setStatusFilter} style={{ width: 150 }}>
              <Option value="">Tất cả trạng thái</Option>
              <Option value="pending">Chờ duyệt</Option>
              <Option value="approved">Đã duyệt</Option>
              <Option value="rejected">Từ chối</Option>
              <Option value="paid">Đã chi</Option>
            </Select>
            <Button icon={<RefreshCw size={14} />} onClick={loadBonuses}>Làm mới</Button>
          </Space>

          <Table
            rowKey="id"
            columns={columns}
            dataSource={bonuses}
            loading={loading}
            size="small"
            pagination={{ pageSize: 20, showSizeChanger: false }}
            locale={{ emptyText: "Không có phiếu thưởng nào" }}
          />
        </TabPane>

        <TabPane tab="Thưởng Tết" key="tet">
          <Card style={{ borderRadius: 10, marginBottom: 16 }}>
            <Space align="center" wrap>
              <Text strong>Năm:</Text>
              <Select value={tetYear} onChange={setTetYear} style={{ width: 90 }}>
                {YEARS.map((y) => <Option key={y} value={y}>{y}</Option>)}
              </Select>
              <Button onClick={handlePreview} loading={previewing}>
                Xem trước
              </Button>
              <Button
                type="primary"
                icon={<Gift size={14} />}
                loading={generating}
                onClick={handleGenerate}
                disabled={!preview}
              >
                Tạo thưởng Tết {tetYear}
              </Button>
            </Space>

            {preview && (
              <div style={{ marginTop: 16 }}>
                <Alert
                  type="info"
                  style={{ marginBottom: 12, borderRadius: 8 }}
                  message={`${preview.filter((p) => !p.already_exists).length} tài xế sẽ được tạo phiếu thưởng mới · ${preview.filter((p) => p.already_exists).length} đã có sẵn`}
                  showIcon
                />
                <Table
                  rowKey="driver_id"
                  columns={tetPreviewCols}
                  dataSource={preview}
                  size="small"
                  pagination={false}
                  scroll={{ y: 360 }}
                />
              </div>
            )}
          </Card>
        </TabPane>

        <TabPane tab="Tạo phúc lợi" key="create">
          <Card style={{ borderRadius: 10, maxWidth: 560 }}>
            <Form
              form={createForm}
              layout="vertical"
              onFinish={handleCreate}
              initialValues={{ year: NOW.getFullYear() }}
            >
              <Form.Item name="driver_id" label="Tài xế" rules={[{ required: true, message: "Chọn tài xế" }]}>
                <Select
                  showSearch
                  placeholder="Chọn tài xế..."
                  optionFilterProp="children"
                  filterOption={(input, option) =>
                    option.children?.toLowerCase().includes(input.toLowerCase())
                  }
                >
                  {drivers.map((d) => (
                    <Option key={d.id} value={d.id}>
                      {d.full_name} — {d.phone}
                    </Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item name="type" label="Loại phúc lợi" rules={[{ required: true, message: "Chọn loại" }]}>
                <Select placeholder="Chọn loại..." onChange={onWelfareTypeChange}>
                  <Option value="welfare_wedding">Kết hôn (1.000.000đ)</Option>
                  <Option value="welfare_funeral">Tang gia (tự chọn 500K / 1M)</Option>
                  <Option value="welfare_birthday">Sinh nhật (200.000đ)</Option>
                  <Option value="holiday_overtime">Làm thêm ngày lễ</Option>
                  <Option value="special">Thưởng đặc biệt</Option>
                </Select>
              </Form.Item>

              <Form.Item name="year" label="Năm" rules={[{ required: true }]}>
                <Select>
                  {YEARS.map((y) => <Option key={y} value={y}>{y}</Option>)}
                </Select>
              </Form.Item>

              {needBeneficiary && (
                <>
                  <Form.Item
                    name="beneficiary_name"
                    label="Tên thân nhân"
                    rules={[{ required: true, message: "Nhập tên thân nhân" }]}
                  >
                    <Input placeholder="Họ và tên..." />
                  </Form.Item>
                  <Form.Item
                    name="beneficiary_relation"
                    label="Quan hệ"
                    rules={[{ required: true, message: "Chọn quan hệ" }]}
                  >
                    <Select placeholder="Chọn...">
                      <Option value="self">Bản thân</Option>
                      <Option value="spouse">Vợ/Chồng</Option>
                      <Option value="parent">Bố/Mẹ</Option>
                      <Option value="child">Con</Option>
                    </Select>
                  </Form.Item>
                </>
              )}

              <Form.Item
                name="amount"
                label={isAutoAmount ? "Số tiền (tự động)" : "Số tiền (đồng)"}
                rules={[{ required: true, message: "Nhập số tiền" }]}
              >
                <InputNumber
                  style={{ width: "100%" }}
                  min={0}
                  step={100000}
                  formatter={(v) => v ? Number(v).toLocaleString("vi-VN") : ""}
                  parser={(v) => v?.replace(/\./g, "").replace(/,/g, "") || ""}
                  disabled={isAutoAmount}
                  placeholder="0"
                />
              </Form.Item>

              <Form.Item name="notes" label="Ghi chú">
                <Input.TextArea rows={2} placeholder="Ghi chú (tuỳ chọn)..." />
              </Form.Item>

              <Button type="primary" htmlType="submit" loading={creating} icon={<PlusCircle size={14} />}>
                Tạo phúc lợi
              </Button>
            </Form>
          </Card>
        </TabPane>
      </Tabs>

      <Modal
        open={!!approveModal}
        title="Duyệt thưởng"
        okText="Xác nhận duyệt"
        cancelText="Hủy"
        confirmLoading={acting}
        onOk={handleApprove}
        onCancel={() => setApproveModal(null)}
      >
        {approveModal && (
          <>
            <Descriptions size="small" column={1} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Tài xế">{approveModal.driver_name}</Descriptions.Item>
              <Descriptions.Item label="Loại">{TYPE_LABEL[approveModal.type]}</Descriptions.Item>
              <Descriptions.Item label="Số tiền gốc">{fmt(approveModal.amount)}</Descriptions.Item>
            </Descriptions>
            <Form layout="vertical">
              <Form.Item label="Số tiền duyệt (có thể điều chỉnh)">
                <InputNumber
                  style={{ width: "100%" }}
                  value={adjustAmount}
                  onChange={setAdjustAmount}
                  min={0}
                  step={100000}
                  formatter={(v) => v ? Number(v).toLocaleString("vi-VN") : ""}
                  parser={(v) => v?.replace(/\./g, "").replace(/,/g, "") || ""}
                />
              </Form.Item>
            </Form>
          </>
        )}
      </Modal>

      <Modal
        open={!!rejectModal}
        title="Từ chối thưởng"
        okText="Xác nhận từ chối"
        okButtonProps={{ danger: true }}
        cancelText="Hủy"
        confirmLoading={acting}
        onOk={handleReject}
        onCancel={() => { setRejectModal(null); setRejectReason(""); }}
      >
        {rejectModal && (
          <>
            <Descriptions size="small" column={1} style={{ marginBottom: 12 }}>
              <Descriptions.Item label="Tài xế">{rejectModal.driver_name}</Descriptions.Item>
              <Descriptions.Item label="Loại">{TYPE_LABEL[rejectModal.type]}</Descriptions.Item>
              <Descriptions.Item label="Số tiền">{fmt(rejectModal.amount)}</Descriptions.Item>
            </Descriptions>
            <Form layout="vertical">
              <Form.Item label="Lý do từ chối" required>
                <Input.TextArea
                  rows={3}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Nhập lý do..."
                />
              </Form.Item>
            </Form>
          </>
        )}
      </Modal>
    </PageContainer>
  );
}
