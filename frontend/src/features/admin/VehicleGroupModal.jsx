import React, { useEffect } from "react";
import { Form, Input, InputNumber, Modal } from "antd";

export default function VehicleGroupModal({ open, onClose, onSubmit, editingGroup }) {
  const [form] = Form.useForm();

  useEffect(() => {
    if (!open) return;

    if (editingGroup) {
      form.setFieldsValue({
        name: editingGroup.name,
        description: editingGroup.description || "",
        max_load_weight_kg: editingGroup.max_load_weight_kg ? Number(editingGroup.max_load_weight_kg) : null,
        price_per_km: Number(editingGroup.price_per_km),
      });
      return;
    }

    form.resetFields();
  }, [editingGroup, form, open]);

  const handleOk = async () => {
    const values = await form.validateFields();
    await onSubmit(values);
  };

  return (
    <Modal
      open={open}
      title={editingGroup ? "Update Vehicle Group" : "Create Vehicle Group"}
      onCancel={onClose}
      onOk={handleOk}
      okText="Save"
      cancelText="Cancel"
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Form.Item
          label="Name"
          name="name"
          rules={[{ required: true, message: "Name is required" }]}
        >
          <Input placeholder="1T25" />
        </Form.Item>

        <Form.Item label="Description" name="description">
          <Input.TextArea rows={3} placeholder="Vehicle group description" />
        </Form.Item>

        <Form.Item
          label="Max Load Weight (kg)"
          name="max_load_weight_kg"
          rules={[{ type: "number", min: 0.01, message: "Value must be positive" }]}
        >
          <InputNumber style={{ width: "100%" }} min={0.01} precision={2} />
        </Form.Item>

        <Form.Item
          label="Price Per Km"
          name="price_per_km"
          rules={[{ required: true, message: "Price per km is required" }]}
        >
          <InputNumber style={{ width: "100%" }} min={0} precision={2} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
