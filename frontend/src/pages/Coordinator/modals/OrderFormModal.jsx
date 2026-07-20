import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button, Input, Select, SelectItem, Textarea,
} from "@heroui/react";
import { RiCloseLine, RiAddLine, RiDeleteBinLine } from "react-icons/ri";

const getTodayStr = () => new Date().toISOString().slice(0, 10);

export default function OrderFormModal({
  open,
  editingTrip,
  form,
  formErrors,
  vehicleGroups,
  partners,
  creating,
  totalFare,
  onClose,
  onSubmit,
  updateField,
  updateTripField,
  updateTripStopList,
  addTripStop,
  removeTripStop,
  addTrip,
  removeTrip,
  getAvailablePlates,
  getTripFare,
  getSuggestedFare,
}) {
  return (
    <Modal isOpen={open} onOpenChange={(isOpen) => !isOpen && onClose()} size="4xl" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <span className="text-base font-bold text-gray-900">
            {editingTrip ? `Chỉnh sửa đơn #${editingTrip.orderId}` : "Tạo đơn hàng mới"}
          </span>
          <span className="text-xs font-normal text-gray-400">
            {editingTrip ? "Cập nhật thông tin đơn hàng để điều phối chính xác." : "Điền thông tin đơn hàng để tạo chuyến mới."}
          </span>
        </ModalHeader>
        <ModalBody className="gap-5">
          <div>
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Thông tin đơn hàng</div>
            <div className="grid grid-cols-3 gap-3">
              <Input
                type="date"
                label="Ngày giao hàng"
                value={form.date || ""}
                onValueChange={(v) => updateField("date", v)}
                min={editingTrip ? undefined : getTodayStr()}
                isInvalid={!!formErrors.date}
                errorMessage={formErrors.date}
                variant="bordered"
              />
              <Input
                label="SĐT"
                value={form.customer_phone}
                onValueChange={(v) => updateField("customer_phone", v)}
                isInvalid={!!formErrors.customer_phone}
                errorMessage={formErrors.customer_phone}
                variant="bordered"
              />
              <Input
                label="Khách hàng"
                value={form.customer_name}
                onValueChange={(v) => updateField("customer_name", v)}
                isInvalid={!!formErrors.customer_name}
                errorMessage={formErrors.customer_name}
                variant="bordered"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Hàng hóa"
              placeholder="Không bắt buộc"
              value={form.cargo_name}
              onValueChange={(v) => updateField("cargo_name", v)}
              variant="bordered"
            />
            <Input
              label="Khối lượng (kg)"
              type="number"
              min="0"
              step="0.01"
              value={form.cargo_weight_kg}
              onValueChange={(v) => updateField("cargo_weight_kg", v)}
              isInvalid={!!formErrors.cargo_weight_kg}
              errorMessage={formErrors.cargo_weight_kg}
              variant="bordered"
            />
          </div>

          <Input
            label="Khách trả trước"
            type="number"
            min="0"
            step="0.01"
            placeholder="VD: 500000"
            value={form.prepaid_amount}
            onValueChange={(v) => updateField("prepaid_amount", v)}
            isInvalid={!!formErrors.prepaid_amount}
            errorMessage={formErrors.prepaid_amount}
            variant="bordered"
          />

          <div className="flex items-center gap-3">
            <Button
              size="sm"
              color={form.is_partner ? "primary" : "default"}
              variant={form.is_partner ? "solid" : "flat"}
              onPress={() => updateField("is_partner", !form.is_partner)}
            >
              Đơn từ đối tác liên kết
            </Button>
          </div>

          {form.is_partner && (
            <Select
              label="Đối tác"
              placeholder="Chọn đối tác"
              selectedKeys={form.partner_name ? [form.partner_name] : []}
              onSelectionChange={(keys) => updateField("partner_name", [...keys][0] ?? "")}
              isInvalid={!!formErrors.partner_name}
              errorMessage={formErrors.partner_name}
              variant="bordered"
            >
              {partners.map((partner) => (
                <SelectItem key={partner.company_name}>
                  {partner.contact_person ? `${partner.company_name} - ${partner.contact_person}` : partner.company_name}
                </SelectItem>
              ))}
            </Select>
          )}

          <div>
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Chuyến xe</div>
            <div className="flex flex-col gap-3">
              {form.trips.map((trip, index) => (
                <div key={index} className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-blue-900">Chuyến {index + 1}</span>
                    {form.trips.length > 1 && (
                      <Button size="sm" variant="light" color="danger" startContent={<RiDeleteBinLine size={14} />} onPress={() => removeTrip(index)}>
                        Xóa
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <Select
                      label="Nhóm xe"
                      placeholder="Chọn nhóm xe"
                      selectedKeys={trip.vehicle_group_id ? [String(trip.vehicle_group_id)] : []}
                      onSelectionChange={(keys) => {
                        const value = [...keys][0];
                        updateTripField(index, "vehicle_group_id", value ? Number(value) : "");
                        updateTripField(index, "plate", "");
                      }}
                      isInvalid={!!formErrors[`trip_${index}_vehicle_group_id`]}
                      errorMessage={formErrors[`trip_${index}_vehicle_group_id`]}
                      variant="bordered"
                    >
                      {vehicleGroups.map((group) => <SelectItem key={String(group.id)}>{group.name}</SelectItem>)}
                    </Select>

                    <Select
                      label="BKS"
                      placeholder={trip.vehicle_group_id ? "Chọn BKS" : "Chọn nhóm xe trước"}
                      isDisabled={!trip.vehicle_group_id}
                      selectedKeys={trip.plate ? [trip.plate] : []}
                      onSelectionChange={(keys) => updateTripField(index, "plate", [...keys][0] ?? "")}
                      isInvalid={!!formErrors[`trip_${index}_plate`]}
                      errorMessage={formErrors[`trip_${index}_plate`]}
                      variant="bordered"
                    >
                      {[
                        ...(trip.plate && !getAvailablePlates(trip.vehicle_group_id).some((v) => v.plate_number === trip.plate)
                          ? [{ plate_number: trip.plate, assigned_driver_name: null }]
                          : []),
                        ...getAvailablePlates(trip.vehicle_group_id),
                      ].map((v) => (
                        <SelectItem key={v.plate_number}>
                          {v.assigned_driver_name ? `${v.plate_number} - ${v.assigned_driver_name}` : v.plate_number}
                        </SelectItem>
                      ))}
                    </Select>

                    <Input
                      label="Quãng đường (km)"
                      type="number"
                      min="0"
                      step="0.1"
                      placeholder="VD: 120"
                      value={trip.distance}
                      onValueChange={(v) => updateTripField(index, "distance", v)}
                      isInvalid={!!formErrors[`trip_${index}_distance`]}
                      errorMessage={formErrors[`trip_${index}_distance`]}
                      variant="bordered"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-2">
                      <Input
                        label="Điểm lấy hàng"
                        placeholder="Địa chỉ lấy hàng"
                        value={trip.pickup_address || ""}
                        onValueChange={(v) => updateTripField(index, "pickup_address", v)}
                        isInvalid={!!formErrors[`trip_${index}_pickup_address`]}
                        errorMessage={formErrors[`trip_${index}_pickup_address`]}
                        variant="bordered"
                      />
                      {(trip.pickup_addresses || [trip.pickup_address]).slice(1).map((address, extraIndex) => {
                        const stopIndex = extraIndex + 1;
                        return (
                          <div key={`pickup-${stopIndex}`} className="flex gap-2">
                            <Input
                              placeholder={`Điểm lấy #${stopIndex + 1}`}
                              value={address || ""}
                              onValueChange={(v) => updateTripStopList(index, "pickup_addresses", stopIndex, v)}
                              variant="bordered"
                            />
                            <Button isIconOnly size="sm" variant="light" color="danger" onPress={() => removeTripStop(index, "pickup_addresses", stopIndex)}>
                              <RiCloseLine size={16} />
                            </Button>
                          </div>
                        );
                      })}
                      <Button size="sm" variant="bordered" startContent={<RiAddLine size={14} />} onPress={() => addTripStop(index, "pickup_addresses")}>
                        Thêm điểm lấy
                      </Button>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Input
                        label="Điểm giao hàng"
                        placeholder="Địa chỉ giao hàng"
                        value={trip.delivery_address || ""}
                        onValueChange={(v) => updateTripField(index, "delivery_address", v)}
                        isInvalid={!!formErrors[`trip_${index}_delivery_address`]}
                        errorMessage={formErrors[`trip_${index}_delivery_address`]}
                        variant="bordered"
                      />
                      {(trip.delivery_addresses || [trip.delivery_address]).slice(1).map((address, extraIndex) => {
                        const stopIndex = extraIndex + 1;
                        return (
                          <div key={`delivery-${stopIndex}`} className="flex gap-2">
                            <Input
                              placeholder={`Điểm giao #${stopIndex + 1}`}
                              value={address || ""}
                              onValueChange={(v) => updateTripStopList(index, "delivery_addresses", stopIndex, v)}
                              variant="bordered"
                            />
                            <Button isIconOnly size="sm" variant="light" color="danger" onPress={() => removeTripStop(index, "delivery_addresses", stopIndex)}>
                              <RiCloseLine size={16} />
                            </Button>
                          </div>
                        );
                      })}
                      <Button size="sm" variant="bordered" startContent={<RiAddLine size={14} />} onPress={() => addTripStop(index, "delivery_addresses")}>
                        Thêm điểm giao
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-end gap-3">
                    <Input
                      label="Cước xe"
                      type="number"
                      min="0"
                      step="1000"
                      placeholder={`Gợi ý: ${Number(getSuggestedFare(trip) || 0).toLocaleString("vi-VN")} đ`}
                      value={trip.price}
                      onValueChange={(v) => updateTripField(index, "price", v)}
                      variant="bordered"
                      className="max-w-xs"
                      description={
                        trip.price
                          ? `Đơn giá gợi ý theo km × đơn giá nhóm xe: ${Number(getSuggestedFare(trip) || 0).toLocaleString("vi-VN")} đ`
                          : "Để trống sẽ tự tính theo quãng đường × đơn giá nhóm xe"
                      }
                    />
                  </div>
                </div>
              ))}

              <div className="flex items-center justify-between">
                <Button variant="bordered" startContent={<RiAddLine size={16} />} onPress={addTrip}>
                  Thêm chuyến
                </Button>
                {totalFare > 0 && (
                  <span className="text-sm font-bold text-blue-900">
                    Tổng cước: {totalFare.toLocaleString("vi-VN")} đ
                  </span>
                )}
              </div>
            </div>
          </div>

          <Textarea
            label="Ghi chú"
            value={form.note}
            onValueChange={(v) => updateField("note", v)}
            minRows={3}
            variant="bordered"
          />
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={onClose}>Hủy</Button>
          <Button color="primary" isLoading={creating} onPress={onSubmit}>
            {editingTrip ? "Cập nhật" : "Tạo đơn"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
