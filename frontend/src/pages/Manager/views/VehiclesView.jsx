import { useEffect, useState } from "react";
import {
  Button, Input, Select, SelectItem, Chip, Spinner, Textarea,
  Dropdown, DropdownTrigger, DropdownMenu, DropdownItem,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
} from "@heroui/react";
import {
  RiSearchLine, RiAddLine, RiMore2Line, RiToolsLine,
  RiEyeLine, RiPencilLine, RiUserSharedLine, RiAlertLine, RiDeleteBinLine,
  RiCheckboxCircleLine, RiCheckLine, RiCloseLine,
} from "react-icons/ri";
import { useRoleRealtime } from "../../../hooks/useRoleRealtime";
import { StatusBadge } from "../../../components/shared-ui/StatusBadge";
import VehicleGroupFormModal from "../modals/VehicleGroupFormModal";
import VehicleFormModal from "../modals/VehicleFormModal";
import VehicleDetailModal from "../modals/VehicleDetailModal";
import {
  SendToMaintenanceModal, VerifyMaintenanceModal, MarkBrokenModal, RestoreVehicleModal, RetireVehicleModal,
} from "../modals/VehicleLifecycleModals";
import { managerService } from "../services/manager.service";

const MAINTENANCE_TYPE_LABEL = { scheduled: "Bảo dưỡng định kỳ", repair: "Sửa chữa", inspection: "Kiểm tra", emergency: "Khẩn cấp" };

const formatDateTime = (value) => {
  if (!value) return "Chưa có";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("vi-VN");
};

const canAssignDriver = (v) => v.status === "active";
const canUnassignDriver = (v) => Boolean(v.assigned_driver_id) && ["active", "maintenance", "broken"].includes(v.status);

export default function VehiclesView({ user }) {
  // Vehicle groups
  const [vehicleGroups, setVehicleGroups] = useState([]);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [groupDeleteTarget, setGroupDeleteTarget] = useState(null);

  // Vehicles
  const [vehicles, setVehicles] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [sortBy, setSortBy] = useState("");
  const [vehicleModalOpen, setVehicleModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [detailVehicle, setDetailVehicle] = useState(null);
  const [assignmentHistory, setAssignmentHistory] = useState([]);
  const [unassignTarget, setUnassignTarget] = useState(null);

  // Lifecycle modals
  const [maintenanceTarget, setMaintenanceTarget] = useState(null);
  const [maintenanceDriverOptions, setMaintenanceDriverOptions] = useState([]);
  const [loadingMaintenanceDrivers, setLoadingMaintenanceDrivers] = useState(false);
  const [verifyTarget, setVerifyTarget] = useState(null);
  const [brokenTarget, setBrokenTarget] = useState(null);
  const [restoreTarget, setRestoreTarget] = useState(null);
  const [retireTarget, setRetireTarget] = useState(null);

  // Maintenance requests
  const [maintenanceRequests, setMaintenanceRequests] = useState([]);
  const [rejectRequestTarget, setRejectRequestTarget] = useState(null);
  const [rejectRequestReason, setRejectRequestReason] = useState("");
  const [processingRequestId, setProcessingRequestId] = useState(null);

  const loadVehicleGroups = async () => {
    try {
      const data = await managerService.getVehicleGroups();
      setVehicleGroups(data.vehicleGroups || []);
    } catch (err) { alert(err.message); }
  };

  const loadVehicles = async (opts = {}) => {
    setLoading(true);
    try {
      const data = await managerService.getVehicles({
        page: opts.page || pagination.page,
        limit: opts.limit || pagination.limit,
        search: opts.search ?? search,
        status: opts.status ?? statusFilter,
        vehicle_group_id: opts.group ?? groupFilter,
        sort: opts.sort ?? sortBy,
      });
      setVehicles(data.items || []);
      setPagination({ page: data.pagination?.page || 1, limit: data.pagination?.limit || 10, total: data.pagination?.total || 0 });
    } catch (err) { alert(err.message); } finally { setLoading(false); }
  };

  const loadMaintenanceRequests = async () => {
    try {
      const data = await managerService.getMaintenanceRequests();
      setMaintenanceRequests(data.requests || []);
    } catch (err) { alert(err.message); }
  };

  useEffect(() => {
    loadVehicleGroups();
    loadVehicles({ page: 1 });
    loadMaintenanceRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useRoleRealtime(user, {
    onMessage: (payload) => {
      if (payload?.type === "manager.vehicles.changed") {
        loadVehicleGroups();
        loadVehicles();
        loadMaintenanceRequests();
      }
    },
  });

  // ─── Vehicle groups ─────────────────────────────────────────────────────
  const handleGroupSubmit = async (values) => {
    try {
      if (editingGroup) await managerService.updateVehicleGroup(editingGroup.id, { ...values, upgrade_allowed: editingGroup.upgrade_allowed });
      else await managerService.createVehicleGroup({ ...values, upgrade_allowed: false });
      setGroupModalOpen(false);
      setEditingGroup(null);
      await loadVehicleGroups();
    } catch (err) { alert(err.message); }
  };

  const handleGroupDelete = async () => {
    try {
      await managerService.deleteVehicleGroup(groupDeleteTarget.id);
      setGroupDeleteTarget(null);
      await loadVehicleGroups();
    } catch (err) { alert(err.message); }
  };

  // ─── Vehicles CRUD ──────────────────────────────────────────────────────
  const handleVehicleSubmit = async (values) => {
    try {
      if (editingVehicle) await managerService.updateVehicle(editingVehicle.id, values);
      else await managerService.createVehicle(values);
      setVehicleModalOpen(false);
      setEditingVehicle(null);
      await loadVehicles();
    } catch (err) { alert(err.message); }
  };

  const openDetail = async (vehicle) => {
    try {
      const data = await managerService.getVehicleDetail(vehicle.id);
      setDetailVehicle(data.vehicle);
      managerService.getVehicleAssignmentHistory(vehicle.id).then((res) => setAssignmentHistory(res.history || [])).catch(() => setAssignmentHistory([]));
    } catch (err) { alert(err.message); }
  };

  const handleDriverToggle = (vehicle) => {
    if (vehicle.assigned_driver_id) setUnassignTarget(vehicle);
    else { setEditingVehicle(vehicle); setVehicleModalOpen(true); }
  };

  const confirmUnassign = async () => {
    try {
      await managerService.assignVehicleDriver(unassignTarget.id, null);
      setUnassignTarget(null);
      await loadVehicles();
    } catch (err) { alert(err.message); }
  };

  // ─── Lifecycle actions ──────────────────────────────────────────────────
  const handleSendToMaintenance = async (vehicle) => {
    setMaintenanceTarget(vehicle);
    setLoadingMaintenanceDrivers(true);
    try {
      const data = await managerService.getDriverOptions(vehicle.id);
      setMaintenanceDriverOptions(data.drivers || []);
    } catch (err) { alert(err.message); } finally { setLoadingMaintenanceDrivers(false); }
  };

  const submitMaintenance = async (values) => {
    await managerService.sendVehicleToMaintenance(maintenanceTarget.id, values);
    setMaintenanceTarget(null);
    await loadVehicles();
  };

  const handleVerifyMaintenance = async (vehicle) => {
    try {
      const data = await managerService.getVehicleDetail(vehicle.id);
      setVerifyTarget(data.vehicle);
    } catch (err) { alert(err.message); }
  };

  const submitVerify = async (values) => {
    await managerService.verifyVehicleMaintenance(verifyTarget.id, values);
    setVerifyTarget(null);
    await loadVehicles();
  };

  const submitBroken = async (values) => {
    await managerService.markVehicleBroken(brokenTarget.id, values);
    setBrokenTarget(null);
    await loadVehicles();
  };

  const submitRestore = async (values) => {
    await managerService.restoreVehicle(restoreTarget.id, values);
    setRestoreTarget(null);
    await loadVehicles();
  };

  const submitRetire = async (values) => {
    await managerService.retireVehicle(retireTarget.id, values);
    setRetireTarget(null);
    await loadVehicles();
  };

  // ─── Maintenance requests ───────────────────────────────────────────────
  const handleApproveRequest = async (request) => {
    setProcessingRequestId(request.id);
    try {
      await managerService.approveMaintenanceRequest(request.id);
      await Promise.all([loadMaintenanceRequests(), loadVehicles()]);
    } catch (err) { alert(err.message); } finally { setProcessingRequestId(null); }
  };

  const handleRejectRequest = async () => {
    if (!rejectRequestReason.trim()) { alert("Cần ghi lý do từ chối"); return; }
    setProcessingRequestId(rejectRequestTarget.id);
    try {
      await managerService.rejectMaintenanceRequest(rejectRequestTarget.id, { reason: rejectRequestReason.trim() });
      setRejectRequestTarget(null);
      setRejectRequestReason("");
      await loadMaintenanceRequests();
    } catch (err) { alert(err.message); } finally { setProcessingRequestId(null); }
  };

  const getActionItems = (vehicle) => {
    const items = [
      { key: "details", label: "Chi tiết", icon: RiEyeLine, onPress: () => openDetail(vehicle) },
      { key: "edit", label: "Sửa", icon: RiPencilLine, color: "primary", onPress: () => { setEditingVehicle(vehicle); setVehicleModalOpen(true); } },
    ];
    items.push({
      key: "driver",
      label: vehicle.assigned_driver_id ? "Bỏ gán tài xế" : "Gán tài xế",
      icon: RiUserSharedLine,
      color: "primary",
      isDisabled: vehicle.assigned_driver_id ? !canUnassignDriver(vehicle) : !canAssignDriver(vehicle),
      onPress: () => handleDriverToggle(vehicle),
    });
    if (vehicle.status === "active") {
      items.push(
        { key: "maintenance", label: "Gửi bảo dưỡng", icon: RiToolsLine, color: "warning", onPress: () => handleSendToMaintenance(vehicle) },
        { key: "broken", label: "Đánh dấu hỏng", icon: RiAlertLine, color: "danger", onPress: () => setBrokenTarget(vehicle) },
        { key: "retire", label: "Thu hồi", icon: RiDeleteBinLine, color: "danger", onPress: () => setRetireTarget(vehicle) },
      );
    }
    if (vehicle.status === "maintenance") {
      items.push({ key: "verify", label: "Xác nhận bảo dưỡng", icon: RiCheckboxCircleLine, color: "success", onPress: () => handleVerifyMaintenance(vehicle) });
    }
    if (vehicle.status === "broken") {
      items.push(
        { key: "maintenance", label: "Gửi bảo dưỡng", icon: RiToolsLine, color: "warning", onPress: () => handleSendToMaintenance(vehicle) },
        { key: "restore", label: "Khôi phục", icon: RiCheckboxCircleLine, color: "success", onPress: () => setRestoreTarget(vehicle) },
      );
    }
    return items;
  };

  const currentEditingGroupMissing = editingVehicle?.vehicle_group_id
    && !vehicleGroups.some((g) => Number(g.id) === Number(editingVehicle.vehicle_group_id));
  const selectableVehicleGroups = currentEditingGroupMissing
    ? [...vehicleGroups, { id: editingVehicle.vehicle_group_id, name: editingVehicle.vehicle_group_name || `Nhóm #${editingVehicle.vehicle_group_id}` }]
    : vehicleGroups;

  return (
    <div className="flex flex-col gap-5">
      {/* Vehicle groups */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-sm font-bold text-gray-800">Nhóm xe</div>
            <div className="text-xs text-gray-400">{vehicleGroups.length} nhóm xe</div>
          </div>
          <Button color="primary" size="sm" startContent={<RiAddLine size={16} />} onPress={() => { setEditingGroup(null); setGroupModalOpen(true); }}>
            Thêm nhóm xe
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {vehicleGroups.map((g) => (
            <div key={g.id} className="rounded-xl border border-gray-100 p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-800">{g.name}</span>
                <span className="text-xs text-gray-400">{Number(g.price_per_km).toLocaleString()}/km</span>
              </div>
              <p className="text-xs text-gray-400 line-clamp-2">{g.description || "Không có mô tả"}</p>
              <div className="flex flex-wrap gap-1">
                <Chip size="sm" variant="flat" color="primary">{g.vehicle_count} tổng</Chip>
                <Chip size="sm" variant="flat" color="success">{g.active_vehicle_count} hoạt động</Chip>
                <Chip size="sm" variant="flat" color="warning">{g.maintenance_vehicle_count} bảo trì</Chip>
                <Chip size="sm" variant="flat" color="danger">{g.broken_vehicle_count} hỏng</Chip>
              </div>
              <div className="flex gap-1 justify-end mt-1">
                <Button size="sm" variant="flat" color="primary" startContent={<RiPencilLine size={13} />} onPress={() => { setEditingGroup(g); setGroupModalOpen(true); }}>Sửa</Button>
                <Button size="sm" variant="flat" color="danger" startContent={<RiDeleteBinLine size={13} />} onPress={() => setGroupDeleteTarget(g)}>Ẩn</Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Maintenance requests */}
      {maintenanceRequests.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-1">
            <RiToolsLine size={16} className="text-blue-600" />
            <span className="text-sm font-bold text-gray-800">Yêu cầu bảo dưỡng chờ duyệt</span>
          </div>
          <p className="text-xs text-gray-400 mb-3">{maintenanceRequests.length} yêu cầu từ tài xế</p>
          <div className="overflow-x-auto">
          <Table removeWrapper aria-label="Yêu cầu bảo dưỡng" classNames={{ th: "px-4 first:pl-5 last:pr-5", td: "px-4 py-3 first:pl-5 last:pr-5" }}>
            <TableHeader>
              <TableColumn>XE</TableColumn>
              <TableColumn>TÀI XẾ</TableColumn>
              <TableColumn>LOẠI</TableColumn>
              <TableColumn>LÝ DO</TableColumn>
              <TableColumn>NGÀY GỬI</TableColumn>
              <TableColumn> </TableColumn>
            </TableHeader>
            <TableBody items={maintenanceRequests}>
              {(r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-semibold text-sm">{r.plate_number}</span>
                      <span className="text-xs text-gray-400">{[r.brand, r.model].filter(Boolean).join(" ")}</span>
                    </div>
                  </TableCell>
                  <TableCell>{r.requested_by_name || "—"}</TableCell>
                  <TableCell><Chip size="sm" variant="flat" color="primary">{MAINTENANCE_TYPE_LABEL[r.maintenance_type] || r.maintenance_type}</Chip></TableCell>
                  <TableCell>{r.request_reason}</TableCell>
                  <TableCell>{formatDateTime(r.created_at)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="flat" color="success" startContent={<RiCheckLine size={13} />} isLoading={processingRequestId === r.id} onPress={() => handleApproveRequest(r)}>Duyệt</Button>
                      <Button size="sm" variant="flat" color="danger" startContent={<RiCloseLine size={13} />} isDisabled={processingRequestId === r.id} onPress={() => { setRejectRequestTarget(r); setRejectRequestReason(""); }}>Từ chối</Button>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>
        </div>
      )}

      {/* Vehicles */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-sm font-bold text-gray-800">Danh sách xe</div>
            <div className="text-xs text-gray-400">{pagination.total} xe</div>
          </div>
          <Button color="primary" size="sm" startContent={<RiAddLine size={16} />} onPress={() => { setEditingVehicle(null); setVehicleModalOpen(true); }}>
            Thêm xe
          </Button>
        </div>

        <div className="grid grid-cols-4 gap-3 mb-4">
          <Input placeholder="Tìm theo biển số" value={search} onValueChange={setSearch} onKeyDown={(e) => e.key === "Enter" && loadVehicles({ page: 1 })} startContent={<RiSearchLine size={14} className="text-gray-400" />} variant="bordered" size="sm" isClearable />
          <Select selectedKeys={statusFilter ? [statusFilter] : []} onSelectionChange={(k) => setStatusFilter([...k][0] ?? "")} placeholder="Tất cả trạng thái" variant="bordered" size="sm">
            <SelectItem key="active">Hoạt động</SelectItem>
            <SelectItem key="maintenance">Bảo trì</SelectItem>
            <SelectItem key="broken">Hỏng</SelectItem>
            <SelectItem key="retired">Đã thu hồi</SelectItem>
          </Select>
          <Select selectedKeys={groupFilter ? [groupFilter] : []} onSelectionChange={(k) => setGroupFilter([...k][0] ?? "")} placeholder="Tất cả nhóm xe" variant="bordered" size="sm">
            {vehicleGroups.map((g) => <SelectItem key={String(g.id)}>{g.name}</SelectItem>)}
          </Select>
          <Select selectedKeys={new Set([sortBy])} onSelectionChange={(k) => setSortBy([...k][0] ?? "")} placeholder="Sắp xếp" variant="bordered" size="sm">
            <SelectItem key="" textValue="Mặc định">Mặc định</SelectItem>
            <SelectItem key="plate" textValue="Biển số A→Z">Biển số A→Z</SelectItem>
            <SelectItem key="status" textValue="Trạng thái">Trạng thái</SelectItem>
          </Select>
          <Button color="primary" size="sm" onPress={() => loadVehicles({ page: 1 })}>Áp dụng</Button>
        </div>

        <div className="overflow-x-auto">
        <Table
          removeWrapper
          aria-label="Danh sách xe"
          classNames={{ th: "px-4 first:pl-5 last:pr-5", td: "px-4 py-3 first:pl-5 last:pr-5" }}
          bottomContent={
            Math.ceil(pagination.total / pagination.limit) > 1 ? (
              <div className="flex justify-center py-3">
                <div className="flex gap-1">
                  {Array.from({ length: Math.ceil(pagination.total / pagination.limit) }, (_, i) => i + 1).map((p) => (
                    <button key={p} onClick={() => loadVehicles({ page: p })} className={`w-7 h-7 rounded-lg text-xs font-medium ${p === pagination.page ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-100"}`}>{p}</button>
                  ))}
                </div>
              </div>
            ) : null
          }
        >
          <TableHeader>
            <TableColumn>BIỂN SỐ</TableColumn>
            <TableColumn>NHÓM XE</TableColumn>
            <TableColumn>XE</TableColumn>
            <TableColumn>TÀI XẾ ĐƯỢC GÁN</TableColumn>
            <TableColumn>TRẠNG THÁI</TableColumn>
            <TableColumn> </TableColumn>
          </TableHeader>
          <TableBody items={vehicles} isLoading={loading} loadingContent={<Spinner color="primary" />} emptyContent="Chưa có xe nào.">
            {(v) => (
              <TableRow key={v.id}>
                <TableCell><span className="font-semibold text-sm">{v.plate_number}</span></TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="text-sm">{v.vehicle_group_name}</span>
                    <span className="text-xs text-gray-400">#{v.vehicle_group_id}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="text-sm">{[v.brand, v.model].filter(Boolean).join(" ") || "Chưa cập nhật"}</span>
                    <span className="text-xs text-gray-400">{v.load_capacity_kg ? `${v.load_capacity_kg} kg` : "Chưa có tải trọng"}{v.manufacture_year ? ` · ${v.manufacture_year}` : ""}</span>
                  </div>
                </TableCell>
                <TableCell>
                  {v.assigned_driver_id ? (
                    <div className="flex flex-col">
                      <span className="text-sm">{v.assigned_driver_name}</span>
                      <span className="text-xs text-gray-400">{v.assigned_driver_email}</span>
                    </div>
                  ) : <span className="text-xs text-gray-300">Chưa gán</span>}
                </TableCell>
                <TableCell><StatusBadge status={v.status} /></TableCell>
                <TableCell>
                  <Dropdown>
                    <DropdownTrigger>
                      <Button isIconOnly size="sm" variant="light"><RiMore2Line size={16} /></Button>
                    </DropdownTrigger>
                    <DropdownMenu aria-label={`Thao tác xe ${v.plate_number}`}>
                      {getActionItems(v).map((item) => (
                        <DropdownItem
                          key={item.key}
                          color={item.color}
                          isDisabled={item.isDisabled}
                          onPress={item.onPress}
                          startContent={item.icon ? <item.icon size={15} /> : null}
                        >
                          {item.label}
                        </DropdownItem>
                      ))}
                    </DropdownMenu>
                  </Dropdown>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        </div>
      </div>

      {/* Modals */}
      <VehicleGroupFormModal open={groupModalOpen} editingGroup={editingGroup} onClose={() => { setGroupModalOpen(false); setEditingGroup(null); }} onSubmit={handleGroupSubmit} />

      <Modal isOpen={!!groupDeleteTarget} onOpenChange={(open) => !open && setGroupDeleteTarget(null)} size="sm">
        <ModalContent>
          <ModalHeader>Ẩn nhóm xe {groupDeleteTarget?.name}</ModalHeader>
          <ModalBody><p className="text-sm text-gray-500">Nhóm xe sẽ bị ẩn khỏi danh sách hoạt động và không dùng được để gán xe mới.</p></ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setGroupDeleteTarget(null)}>Hủy</Button>
            <Button color="danger" onPress={handleGroupDelete}>Ẩn</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <VehicleFormModal
        open={vehicleModalOpen}
        editingVehicle={editingVehicle}
        vehicleGroups={selectableVehicleGroups}
        onClose={() => { setVehicleModalOpen(false); setEditingVehicle(null); }}
        onSubmit={handleVehicleSubmit}
      />

      <VehicleDetailModal open={!!detailVehicle} vehicle={detailVehicle} assignmentHistory={assignmentHistory} onClose={() => setDetailVehicle(null)} />

      <Modal isOpen={!!unassignTarget} onOpenChange={(open) => !open && setUnassignTarget(null)} size="sm">
        <ModalContent>
          <ModalHeader>Bỏ gán tài xế</ModalHeader>
          <ModalBody><p className="text-sm text-gray-500">Bỏ gán tài xế khỏi xe {unassignTarget?.plate_number}?</p></ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setUnassignTarget(null)}>Hủy</Button>
            <Button color="primary" onPress={confirmUnassign}>Xác nhận</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <SendToMaintenanceModal
        open={!!maintenanceTarget}
        vehicle={maintenanceTarget}
        driverOptions={maintenanceDriverOptions}
        loadingDrivers={loadingMaintenanceDrivers}
        onClose={() => { setMaintenanceTarget(null); setMaintenanceDriverOptions([]); }}
        onSubmit={submitMaintenance}
      />
      <VerifyMaintenanceModal open={!!verifyTarget} vehicle={verifyTarget} onClose={() => setVerifyTarget(null)} onSubmit={submitVerify} />
      <MarkBrokenModal open={!!brokenTarget} vehicle={brokenTarget} onClose={() => setBrokenTarget(null)} onSubmit={submitBroken} />
      <RestoreVehicleModal open={!!restoreTarget} vehicle={restoreTarget} onClose={() => setRestoreTarget(null)} onSubmit={submitRestore} />
      <RetireVehicleModal open={!!retireTarget} vehicle={retireTarget} onClose={() => setRetireTarget(null)} onSubmit={submitRetire} />

      <Modal isOpen={!!rejectRequestTarget} onOpenChange={(open) => !open && setRejectRequestTarget(null)} size="sm">
        <ModalContent>
          <ModalHeader>Từ chối yêu cầu bảo dưỡng{rejectRequestTarget ? ` — xe ${rejectRequestTarget.plate_number}` : ""}</ModalHeader>
          <ModalBody>
            <Textarea placeholder="Lý do từ chối (bắt buộc)" value={rejectRequestReason} onValueChange={setRejectRequestReason} minRows={3} variant="bordered" />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setRejectRequestTarget(null)}>Hủy</Button>
            <Button color="danger" isLoading={processingRequestId === rejectRequestTarget?.id} onPress={handleRejectRequest}>Từ chối</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
