import React, { useEffect, useState } from "react";
import { Alert, Form, Input, InputNumber, Modal, Select, message } from "antd";
import { fetchDriverOptions } from "./vehicleManagementApi";

export default function VehicleModal({ open, onClose, onSubmit, editingVehicle, vehicleGroups }) {
  const [form] = Form.useForm();
  const [driverOptions, setDriverOptions] = useState([]);
  const [loadingDrivers, setLoadingDrivers] = useState(false);
  const canEditDriverAssignment = !editingVehicle || editingVehicle.status === "active";

  useEffect(() => {
    if (!open) return;

    const loadDrivers = async () => {
      try {
        setLoadingDrivers(true);
        const data = await fetchDriverOptions(editingVehicle?.id);
        setDriverOptions(data.drivers || []);
      } catch (err) {
        message.error(err.message);
      } finally {
        setLoadingDrivers(false);
      }
    };

    loadDrivers();
  }, [editingVehicle?.id, open]);

  useEffect(() => {
    if (!open) return;

    if (editingVehicle) {
      form.setFieldsValue({
        plate_number: editingVehicle.plate_number,
        vehicle_group_id: editingVehicle.vehicle_group_id,
        brand: editingVehicle.brand || "",
        model: editingVehicle.model || "",
        load_capacity_kg: editingVehicle.load_capacity_kg ? Number(editingVehicle.load_capacity_kg) : null,
        manufacture_year: editingVehicle.manufacture_year || null,
        purchase_date: editingVehicle.purchase_date || null,
        assigned_driver_id: editingVehicle.assigned_driver_id || null,
      });
      return;
    }

    form.resetFields();
  }, [editingVehicle, form, open]);

  const handleOk = async () => {
    const values = await form.validateFields();
    await onSubmit(values);
  };

  return (
    <Modal
      open={open}
      title={editingVehicle ? "Update Vehicle" : "Create Vehicle"}
      onCancel={onClose}
      onOk={handleOk}
      okText="Save"
      cancelText="Cancel"
      destroyOnClose
      width={720}
    >
      <Form form={form} layout="vertical">
        {editingVehicle ? (
          <Alert
            type="info"
            showIcon
            message="Vehicle lifecycle status is managed by action buttons."
            description="Use Send to Maintenance, Verify Maintenance, Mark Broken, Restore, or Retire from the vehicle list."
            style={{ marginBottom: 16 }}
          />
        ) : null}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Form.Item
            label="Plate Number"
            name="plate_number"
            rules={[{ required: true, message: "Plate number is required" }]}
          >
            <Input placeholder="51H-12345" />
          </Form.Item>

          <Form.Item
            label="Vehicle Group"
            name="vehicle_group_id"
            rules={[{ required: true, message: "Vehicle group is required" }]}
          >
            <Select
              options={vehicleGroups.map((group) => ({ label: `${group.name} (#${group.id})`, value: group.id }))}
              placeholder="Select vehicle group"
            />
          </Form.Item>

          <Form.Item label="Brand" name="brand">
            <Input placeholder="Hyundai" />
          </Form.Item>

          <Form.Item label="Model" name="model">
            <Input placeholder="Porter" />
          </Form.Item>

          <Form.Item
            label="Load Capacity (kg)"
            name="load_capacity_kg"
            rules={[{ type: "number", min: 0.01, message: "Load capacity must be positive" }]}
          >
            <InputNumber style={{ width: "100%" }} min={0.01} precision={2} />
          </Form.Item>

          <Form.Item
            label="Manufacture Year"
            name="manufacture_year"
            rules={[
              {
                validator: (_, value) => {
                  if (!value) return Promise.resolve();
                  const currentYear = new Date().getFullYear();
                  if (value > currentYear) {
                    return Promise.reject(new Error("Manufacture year cannot be in the future"));
                  }
                  return Promise.resolve();
                },
              },
            ]}
          >
            <InputNumber style={{ width: "100%" }} min={1900} precision={0} />
          </Form.Item>

          <Form.Item label="Purchase Date" name="purchase_date">
            <Input type="date" />
          </Form.Item>
        </div>

        <Form.Item label="Assigned Driver" name="assigned_driver_id">
          <Select
            allowClear
            loading={loadingDrivers}
            disabled={!canEditDriverAssignment}
            placeholder="Select driver"
            options={driverOptions.map((driver) => ({
              label: `${driver.full_name} - ${driver.email}${driver.current_vehicle_plate ? ` (${driver.current_vehicle_plate})` : ""}${driver.has_active_shipment ? " - delivering" : ""}${driver.has_unverified_maintenance ? " - pending maintenance verification" : ""}${driver.is_assignable ? "" : " - unavailable"}`,
              value: driver.id,
              disabled: !driver.is_assignable,
            }))}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
