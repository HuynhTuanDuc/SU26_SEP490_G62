import React, { useEffect, useState } from "react";
import {
  Button,
  Descriptions,
  Dropdown,
  Form,
  Image,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Timeline,
  Typography,
  message,
} from "antd";
import {
  CarOutlined,
  DeleteOutlined,
  EditOutlined,
  EllipsisOutlined,
  EyeOutlined,
  SearchOutlined,
  ToolOutlined,
  UserSwitchOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import VehicleModal from "./VehicleModal";
import {
  assignVehicleDriver,
  createVehicle,
  fetchVehicleDetail,
  fetchDriverOptions,
  fetchVehicleGroups,
  fetchVehicles,
  markVehicleBroken,
  retireVehicle,
  restoreVehicle,
  sendVehicleToMaintenance,
  updateVehicle,
  verifyVehicleMaintenance,
} from "./vehicleManagementApi";
import VehicleGroupList from "./VehicleGroupList";

const { Text, Title } = Typography;

const statusColorMap = {
  active: "green",
  maintenance: "orange",
  broken: "red",
  retired: "default",
};

const statusOptions = [
  { label: "All Statuses", value: "" },
  { label: "Active", value: "active" },
  { label: "Maintenance", value: "maintenance" },
  { label: "Broken", value: "broken" },
  { label: "Retired", value: "retired" },
];

const formatDateTime = (value) => {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const MAINTENANCE_ACTIONS = new Set(["send_to_maintenance", "complete_maintenance"]);
const INCIDENT_ACTIONS = new Set(["mark_broken", "restore_vehicle"]);

const normalizeBillPics = (value) => {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === "string" && item.trim());
};

const canAssignDriverToVehicle = (record) => record.status === "active";

const canUnassignDriverFromVehicle = (record) =>
  Boolean(record.assigned_driver_id) && ["active", "maintenance", "broken"].includes(record.status);

const buildActionMenuItems = (record, handlers) => {
  const items = [
    {
      key: "details",
      icon: <EyeOutlined />,
      label: "Details",
      onClick: () => handlers.openDetail(record),
    },
    {
      key: "edit",
      icon: <EditOutlined />,
      label: "Edit",
      onClick: () => handlers.handleOpenEdit(record),
    },
  ];

  if (record.assigned_driver_id) {
    items.push({
      key: "unassign",
      icon: <UserSwitchOutlined />,
      label: "Unassign Driver",
      disabled: !canUnassignDriverFromVehicle(record),
      onClick: () => handlers.handleDriverToggle(record),
    });
  } else {
    items.push({
      key: "assign",
      icon: <UserSwitchOutlined />,
      label: "Assign Driver",
      disabled: !canAssignDriverToVehicle(record),
      onClick: () => handlers.handleDriverToggle(record),
    });
  }

  if (record.status === "active") {
    items.push(
      {
        key: "maintenance",
        icon: <ToolOutlined />,
        label: "Send to Maintenance",
        onClick: () => handlers.handleSendToMaintenance(record),
      },
      {
        key: "broken",
        icon: <WarningOutlined />,
        label: "Mark Broken",
        danger: true,
        onClick: () => handlers.handleMarkBroken(record),
      },
      {
        key: "retire",
        icon: <DeleteOutlined />,
        label: "Retire",
        onClick: () => handlers.handleRetire(record),
      }
    );
  }

  if (record.status === "maintenance") {
    items.push({
      key: "verify-maintenance",
      icon: <ToolOutlined />,
      label: record.active_maintenance_status === "pending_verification" ? "Verify Maintenance" : "Check Maintenance",
      onClick: () => handlers.handleVerifyMaintenance(record),
    });
  }

  if (record.status === "broken") {
    items.push(
      {
        key: "maintenance",
        icon: <ToolOutlined />,
        label: "Send to Maintenance",
        onClick: () => handlers.handleSendToMaintenance(record),
      },
      {
        key: "restore",
        icon: <ToolOutlined />,
        label: "Restore",
        onClick: () => handlers.handleRestore(record),
      }
    );
  }

  return items;
};

const buildHistoryTimelineItems = (items) =>
  items.map((item) => ({
    color: statusColorMap[item.to_status] || "blue",
    children: (
      <Space direction="vertical" size={0}>
        <Text strong>{item.action_type}</Text>
        <Text type="secondary">
          {String(item.from_status).toUpperCase()} {"->"} {String(item.to_status).toUpperCase()}
        </Text>
        <Text type="secondary">
          {item.created_by_name || "Manager"} | {formatDateTime(item.created_at)}
        </Text>
        {item.note ? <Text>{item.note}</Text> : null}
      </Space>
    ),
  }));

export default function VehicleList() {
  const [vehicles, setVehicles] = useState([]);
  const [vehicleGroups, setVehicleGroups] = useState([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [detailVehicle, setDetailVehicle] = useState(null);

  const [maintenanceForm] = Form.useForm();
  const [failureForm] = Form.useForm();
  const [verifyMaintenanceForm] = Form.useForm();
  const [restoreForm] = Form.useForm();
  const [retireForm] = Form.useForm();

  const [maintenanceTarget, setMaintenanceTarget] = useState(null);
  const [verifyMaintenanceTarget, setVerifyMaintenanceTarget] = useState(null);
  const [brokenTarget, setBrokenTarget] = useState(null);
  const [restoreTarget, setRestoreTarget] = useState(null);
  const [retireTarget, setRetireTarget] = useState(null);
  const [maintenanceDriverOptions, setMaintenanceDriverOptions] = useState([]);
  const [loadingMaintenanceDrivers, setLoadingMaintenanceDrivers] = useState(false);

  const loadMaintenanceDriverOptions = async (vehicle) => {
    if (!vehicle?.id) {
      setMaintenanceDriverOptions([]);
      return [];
    }

    try {
      setLoadingMaintenanceDrivers(true);
      const data = await fetchDriverOptions(vehicle.id);
      const drivers = data.drivers || [];
      setMaintenanceDriverOptions(drivers);
      return drivers;
    } catch (err) {
      setMaintenanceDriverOptions([]);
      message.error(err.message);
      return [];
    } finally {
      setLoadingMaintenanceDrivers(false);
    }
  };

  const maintenanceDriverSelectOptions = maintenanceDriverOptions.map((driver) => ({
    label: `${driver.full_name} - ${driver.email}${driver.is_selected_vehicle_driver ? " (assigned driver)" : ""}${driver.has_active_shipment ? " - delivering" : ""}${driver.has_unverified_maintenance ? " - during other maintenance" : ""}`,
    value: driver.id,
    disabled: !driver.is_maintenance_eligible,
  }));

  const loadVehicleGroups = async () => {
    try {
      const data = await fetchVehicleGroups();
      setVehicleGroups(data.vehicleGroups || []);
    } catch (err) {
      message.error(err.message);
    }
  };

  const loadVehicles = async ({
    page = pagination.current,
    limit = pagination.pageSize,
    searchValue = search,
    statusValue = statusFilter,
    groupValue = groupFilter,
  } = {}) => {
    try {
      setLoading(true);
      const data = await fetchVehicles({
        page,
        limit,
        search: searchValue,
        status: statusValue,
        vehicle_group_id: groupValue,
      });

      setVehicles(data.items || []);
      setPagination({
        current: data.pagination?.page || page,
        pageSize: data.pagination?.limit || limit,
        total: data.pagination?.total || 0,
      });
    } catch (err) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVehicleGroups();
    loadVehicles({ page: 1 });
  }, []);

  const handleTableChange = (nextPagination) => {
    loadVehicles({
      page: nextPagination.current,
      limit: nextPagination.pageSize,
    });
  };

  const handleFilterSubmit = () => {
    loadVehicles({ page: 1, searchValue: search, statusValue: statusFilter, groupValue: groupFilter });
  };

  const handleOpenCreate = () => {
    setEditingVehicle(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (vehicle) => {
    setEditingVehicle(vehicle);
    setModalOpen(true);
  };

  const handleSubmit = async (values) => {
    try {
      if (editingVehicle) {
        await updateVehicle(editingVehicle.id, values);
        message.success("Vehicle updated");
      } else {
        await createVehicle(values);
        message.success("Vehicle created");
      }

      setModalOpen(false);
      setEditingVehicle(null);
      await loadVehicles();
    } catch (err) {
      message.error(err.message);
    }
  };

  const openDetail = async (vehicle) => {
    try {
      const data = await fetchVehicleDetail(vehicle.id);
      setDetailVehicle(data.vehicle);
    } catch (err) {
      message.error(err.message);
    }
  };

  const handleDriverToggle = (vehicle) => {
    if (vehicle.assigned_driver_id) {
      Modal.confirm({
        title: `Unassign driver from ${vehicle.plate_number}?`,
        onOk: async () => {
          try {
            await assignVehicleDriver(vehicle.id, null);
            message.success("Driver unassigned");
            await loadVehicles();
          } catch (err) {
            message.error(err.message);
          }
        },
      });
      return;
    }

    handleOpenEdit(vehicle);
  };

  const handleSendToMaintenance = async (vehicle) => {
    maintenanceForm.resetFields();
    maintenanceForm.setFieldsValue({
      maintenance_type: "scheduled",
      maintenance_date: new Date().toISOString().slice(0, 10),
      performed_by: vehicle.assigned_driver_id || undefined,
    });
    setMaintenanceTarget(vehicle);
    await loadMaintenanceDriverOptions(vehicle);
  };

  const submitMaintenance = async () => {
    try {
      const values = await maintenanceForm.validateFields();
      await sendVehicleToMaintenance(maintenanceTarget.id, values);
      message.success("Vehicle sent to maintenance");
      setMaintenanceTarget(null);
      await loadVehicles();
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err.message);
    }
  };

  const handleVerifyMaintenance = async (vehicle) => {
    try {
      verifyMaintenanceForm.resetFields();
      const data = await fetchVehicleDetail(vehicle.id);
      setVerifyMaintenanceTarget(data.vehicle);
    } catch (err) {
      message.error(err.message);
    }
  };

  const submitVerifyMaintenance = async () => {
    try {
      const values = await verifyMaintenanceForm.validateFields();
      await verifyVehicleMaintenance(verifyMaintenanceTarget.id, values);
      message.success("Maintenance verified");
      setVerifyMaintenanceTarget(null);
      await loadVehicles();
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err.message);
    }
  };

  const handleMarkBroken = (vehicle) => {
    failureForm.resetFields();
    failureForm.setFieldsValue({ severity_level: "medium" });
    setBrokenTarget(vehicle);
  };

  const submitBroken = async () => {
    try {
      const values = await failureForm.validateFields();
      await markVehicleBroken(brokenTarget.id, values);
      message.success("Vehicle marked as broken");
      setBrokenTarget(null);
      await loadVehicles();
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err.message);
    }
  };

  const handleRestore = (vehicle) => {
    restoreForm.resetFields();
    setRestoreTarget(vehicle);
  };

  const submitRestore = async () => {
    try {
      const values = await restoreForm.validateFields();
      await restoreVehicle(restoreTarget.id, values);
      message.success("Vehicle restored");
      setRestoreTarget(null);
      await loadVehicles();
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err.message);
    }
  };

  const handleRetire = (vehicle) => {
    retireForm.resetFields();
    setRetireTarget(vehicle);
  };

  const submitRetire = async () => {
    try {
      const values = await retireForm.validateFields();
      await retireVehicle(retireTarget.id, values);
      message.success("Vehicle retired");
      setRetireTarget(null);
      await loadVehicles();
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err.message);
    }
  };

  const columns = [
    {
      title: "Plate",
      dataIndex: "plate_number",
      key: "plate_number",
      render: (value) => <Text strong>{value}</Text>,
    },
    {
      title: "Group",
      key: "vehicle_group",
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text>{record.vehicle_group_name}</Text>
          <Text type="secondary">#{record.vehicle_group_id}</Text>
        </Space>
      ),
    },
    {
      title: "Vehicle",
      key: "vehicle",
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text>{[record.brand, record.model].filter(Boolean).join(" ") || "Not set"}</Text>
          <Text type="secondary">
            {record.load_capacity_kg ? `${record.load_capacity_kg} kg` : "No capacity"}
            {record.manufacture_year ? ` | ${record.manufacture_year}` : ""}
          </Text>
        </Space>
      ),
    },
    {
      title: "Assigned Driver",
      key: "assigned_driver",
      render: (_, record) =>
        record.assigned_driver_id ? (
          <Space direction="vertical" size={0}>
            <Text>{record.assigned_driver_name}</Text>
            <Text type="secondary">{record.assigned_driver_email}</Text>
          </Space>
        ) : (
          <Text type="secondary">Unassigned</Text>
        ),
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status) => <Tag color={statusColorMap[status] || "default"}>{String(status || "").toUpperCase()}</Tag>,
    },
    {
      title: "Actions",
      key: "actions",
      width: 80,
      render: (_, record) => (
        <Dropdown
          trigger={["click"]}
          menu={{
            items: buildActionMenuItems(record, {
              openDetail,
              handleOpenEdit,
              handleDriverToggle,
              handleSendToMaintenance,
              handleVerifyMaintenance,
              handleMarkBroken,
              handleRestore,
              handleRetire,
            }),
          }}
        >
          <Button icon={<EllipsisOutlined />} aria-label={`Actions for vehicle ${record.plate_number}`} />
        </Dropdown>
      ),
    },
  ];

  const maintenanceHistory = (detailVehicle?.status_history || []).filter((item) => MAINTENANCE_ACTIONS.has(item.action_type));
  const incidentHistory = (detailVehicle?.status_history || []).filter((item) => INCIDENT_ACTIONS.has(item.action_type));
  const currentEditingGroupMissing = editingVehicle?.vehicle_group_id
    && !vehicleGroups.some((group) => Number(group.id) === Number(editingVehicle.vehicle_group_id));
  const selectableVehicleGroups = currentEditingGroupMissing
    ? [
      ...vehicleGroups,
      {
        id: editingVehicle.vehicle_group_id,
        name: editingVehicle.vehicle_group_name || `Group #${editingVehicle.vehicle_group_id}`,
        status: editingVehicle.vehicle_group_status || "hidden",
      },
    ]
    : vehicleGroups;

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <VehicleGroupList
        embedded
        vehicleGroups={vehicleGroups}
        onVehicleGroupsChange={setVehicleGroups}
      />

      <div style={{ padding: 24, background: "#fff", borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
          <div>
            <Title level={3} style={{ margin: 0 }}>
              Vehicles
            </Title>
            <Text type="secondary">{pagination.total} vehicles</Text>
          </div>
          <Button type="primary" icon={<CarOutlined />} onClick={handleOpenCreate}>
            Add Vehicle
          </Button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 12, marginBottom: 16 }}>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Search by plate number"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onPressEnter={handleFilterSubmit}
          />
          <Select options={statusOptions} value={statusFilter} onChange={setStatusFilter} />
          <Select
            options={[{ label: "All Groups", value: "" }, ...vehicleGroups.map((group) => ({ label: group.name, value: group.id }))]}
            value={groupFilter}
            onChange={setGroupFilter}
          />
          <Button type="primary" onClick={handleFilterSubmit}>
            Apply
          </Button>
        </div>

        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={vehicles}
          pagination={pagination}
          onChange={handleTableChange}
          scroll={{ x: "max-content" }}
        />
      </div>

      <VehicleModal
        open={modalOpen}
        editingVehicle={editingVehicle}
        vehicleGroups={selectableVehicleGroups}
        onClose={() => {
          setModalOpen(false);
          setEditingVehicle(null);
        }}
        onSubmit={handleSubmit}
      />

      <Modal
        open={Boolean(detailVehicle)}
        title={detailVehicle ? `Vehicle: ${detailVehicle.plate_number}` : "Vehicle Details"}
        onCancel={() => setDetailVehicle(null)}
        footer={null}
        width={900}
      >
        {detailVehicle ? (
          <Space direction="vertical" style={{ width: "100%" }} size="large">
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Status">
                <Tag color={statusColorMap[detailVehicle.status] || "default"}>{String(detailVehicle.status).toUpperCase()}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Vehicle Group">{detailVehicle.vehicle_group_name}</Descriptions.Item>
              <Descriptions.Item label="Price Per Km">{Number(detailVehicle.price_per_km).toLocaleString()}</Descriptions.Item>
              <Descriptions.Item label="Brand">{detailVehicle.brand || "Not set"}</Descriptions.Item>
              <Descriptions.Item label="Model">{detailVehicle.model || "Not set"}</Descriptions.Item>
              <Descriptions.Item label="Load Capacity">
                {detailVehicle.load_capacity_kg ? `${detailVehicle.load_capacity_kg} kg` : "Not set"}
              </Descriptions.Item>
              <Descriptions.Item label="Manufacture Year">{detailVehicle.manufacture_year || "Not set"}</Descriptions.Item>
              <Descriptions.Item label="Purchase Date">{detailVehicle.purchase_date || "Not set"}</Descriptions.Item>
              <Descriptions.Item label="Assigned Driver">
                {detailVehicle.assigned_driver_name
                  ? `${detailVehicle.assigned_driver_name} (${detailVehicle.assigned_driver_email})`
                  : "Unassigned"}
              </Descriptions.Item>
              <Descriptions.Item label="Driver License">
                {detailVehicle.assigned_driver_license_number || "Not set"}
              </Descriptions.Item>
              <Descriptions.Item label="Open Maintenance">
                {detailVehicle.active_maintenance_id
                  ? `#${detailVehicle.active_maintenance_id} | ${detailVehicle.active_maintenance_type} | ${detailVehicle.active_maintenance_description || "No description"} | ${detailVehicle.active_maintenance_performed_by_name || "No driver"} | ${detailVehicle.active_maintenance_status || "open"}`
                  : "None"}
              </Descriptions.Item>
              <Descriptions.Item label="Open Breakdown Incident">
                {detailVehicle.active_failure_id
                  ? `#${detailVehicle.active_failure_id} | ${detailVehicle.active_failure_type} | ${detailVehicle.active_failure_severity}`
                  : "None"}
              </Descriptions.Item>
              <Descriptions.Item label="Created At">{formatDateTime(detailVehicle.created_at)}</Descriptions.Item>
              <Descriptions.Item label="Updated At">{formatDateTime(detailVehicle.updated_at)}</Descriptions.Item>
            </Descriptions>

            <div>
              <Title level={5}>Maintenance History</Title>
              {maintenanceHistory.length > 0 ? (
                <Timeline items={buildHistoryTimelineItems(maintenanceHistory)} />
              ) : (
                <Text type="secondary">No maintenance history.</Text>
              )}
            </div>

            <div>
              <Title level={5}>Incident History</Title>
              {incidentHistory.length > 0 ? (
                <Timeline items={buildHistoryTimelineItems(incidentHistory)} />
              ) : (
                <Text type="secondary">No incident history.</Text>
              )}
            </div>
          </Space>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(maintenanceTarget)}
        title={maintenanceTarget ? `Send ${maintenanceTarget.plate_number} to maintenance` : "Send to Maintenance"}
        onCancel={() => {
          setMaintenanceTarget(null);
          setMaintenanceDriverOptions([]);
        }}
        onOk={submitMaintenance}
        okText="Confirm"
      >
        <Form form={maintenanceForm} layout="vertical">
          <Form.Item label="Maintenance Type" name="maintenance_type" rules={[{ required: true, message: "Maintenance type is required" }]}>
            <Select
              options={[
                { label: "Scheduled", value: "scheduled" },
                { label: "Repair", value: "repair" },
                { label: "Inspection", value: "inspection" },
                { label: "Emergency", value: "emergency" },
              ]}
            />
          </Form.Item>
          <Form.Item label="Description" name="description" rules={[{ required: true, message: "Description is required" }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item label="Maintenance Date" name="maintenance_date" rules={[{ required: true, message: "Maintenance date is required" }]}>
            <Input type="date" />
          </Form.Item>
          <Form.Item
            label="Performed By"
            name="performed_by"
            rules={[{ required: true, message: "Performed by driver is required" }]}
          >
            <Select
              loading={loadingMaintenanceDrivers}
              placeholder="Select maintenance driver"
              options={maintenanceDriverSelectOptions}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={Boolean(verifyMaintenanceTarget)}
        title={verifyMaintenanceTarget ? `Verify maintenance for ${verifyMaintenanceTarget.plate_number}` : "Verify Maintenance"}
        onCancel={() => {
          setVerifyMaintenanceTarget(null);
        }}
        onOk={submitVerifyMaintenance}
        okText="Verify"
        okButtonProps={{ disabled: verifyMaintenanceTarget?.active_maintenance_status !== "pending_verification" }}
      >
        <Form form={verifyMaintenanceForm} layout="vertical">
          <Form.Item label="Bill Images">
            {normalizeBillPics(verifyMaintenanceTarget?.active_maintenance_bill_pics).length > 0 ? (
              <Image.PreviewGroup>
                <Space wrap size="middle">
                  {normalizeBillPics(verifyMaintenanceTarget?.active_maintenance_bill_pics).map((url, index) => (
                    <Image
                      key={`${url}-${index}`}
                      src={url}
                      alt={`Maintenance bill ${index + 1}`}
                      width={120}
                      height={120}
                      style={{ objectFit: "cover", borderRadius: 8 }}
                    />
                  ))}
                </Space>
              </Image.PreviewGroup>
            ) : (
              <Text type="secondary">No bill images uploaded yet.</Text>
            )}
          </Form.Item>
          <Form.Item label="Verification Note" name="verification_note" rules={[{ required: true, message: "Verification note is required" }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
          {verifyMaintenanceTarget?.active_maintenance_status !== "pending_verification" ? (
            <Text type="secondary">This maintenance is still waiting for the driver to upload bill images and mark it ready.</Text>
          ) : null}
        </Form>
      </Modal>

      <Modal
        open={Boolean(brokenTarget)}
        title={brokenTarget ? `Mark ${brokenTarget.plate_number} as broken` : "Mark Broken"}
        onCancel={() => setBrokenTarget(null)}
        onOk={submitBroken}
        okText="Confirm"
      >
        <Form form={failureForm} layout="vertical">
          <Form.Item label="Failure Type" name="failure_type" rules={[{ required: true, message: "Failure type is required" }]}>
            <Input placeholder="engine_failure" />
          </Form.Item>
          <Form.Item label="Severity" name="severity_level" rules={[{ required: true, message: "Severity is required" }]}>
            <Select
              options={[
                { label: "Low", value: "low" },
                { label: "Medium", value: "medium" },
                { label: "High", value: "high" },
                { label: "Critical", value: "critical" },
              ]}
            />
          </Form.Item>
          <Form.Item label="Description" name="description" rules={[{ required: true, message: "Description is required" }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item label="Note" name="note">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={Boolean(restoreTarget)}
        title={restoreTarget ? `Restore ${restoreTarget.plate_number}` : "Restore Vehicle"}
        onCancel={() => setRestoreTarget(null)}
        onOk={submitRestore}
        okText="Restore"
      >
        <Form form={restoreForm} layout="vertical">
          <Form.Item label="Resolution Note" name="resolution_note" rules={[{ required: true, message: "Resolution note is required" }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={Boolean(retireTarget)}
        title={retireTarget ? `Retire ${retireTarget.plate_number}` : "Retire Vehicle"}
        onCancel={() => setRetireTarget(null)}
        onOk={submitRetire}
        okText="Retire"
        okButtonProps={{ danger: true }}
      >
        <Form form={retireForm} layout="vertical">
          <Form.Item label="Retirement Note" name="note" rules={[{ required: true, message: "Retirement note is required" }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
