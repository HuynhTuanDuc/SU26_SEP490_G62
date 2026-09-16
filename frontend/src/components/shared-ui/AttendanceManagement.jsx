import { useEffect, useMemo, useState } from "react";
import { notify } from "./Toast";
import { confirmDialog } from "./confirm";
import {
  Button, Input, Select, SelectItem, Spinner, Chip,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
} from "@heroui/react";
import { RiCalendarCheckLine, RiSearchLine } from "react-icons/ri";
import { PaginationBar } from "./PaginationBar";

const now = new Date();
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const YEARS = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i);
const PAGE_SIZE = 10;

const STATUS_STYLE = {
  present:          { bg: "bg-green-100 dark:bg-green-500/15",  text: "text-green-700 dark:text-green-300",  dot: "bg-green-500" },
  holiday:          { bg: "bg-violet-100 dark:bg-violet-500/15", text: "text-violet-700 dark:text-violet-300", dot: "bg-violet-500" },
  holiday_worked:   { bg: "bg-fuchsia-200 dark:bg-fuchsia-500/25", text: "text-fuchsia-800 dark:text-fuchsia-200", dot: "bg-fuchsia-600" },
  leave_paid:       { bg: "bg-blue-100 dark:bg-blue-500/15",   text: "text-blue-700 dark:text-blue-300",   dot: "bg-blue-500" },
  leave_unpaid:     { bg: "bg-amber-100 dark:bg-amber-500/15",  text: "text-amber-700 dark:text-amber-300",  dot: "bg-amber-500" },
  absent_unexcused: { bg: "bg-rose-100 dark:bg-rose-500/15",   text: "text-rose-700 dark:text-rose-300",   dot: "bg-rose-500" },
  half_day:         { bg: "bg-orange-100 dark:bg-orange-500/15", text: "text-orange-700 dark:text-orange-300", dot: "bg-orange-500" },
  // Ngoài thời gian làm việc (trước ngày vào làm / sau ngày nghỉ việc) — không tính công, không chấm được
  not_employed:     { bg: "bg-gray-50 dark:bg-white/5",          text: "text-gray-300 dark:text-gray-600",    dot: "bg-gray-300 dark:bg-gray-600" },
  terminated:       { bg: "bg-gray-50 dark:bg-white/5",          text: "text-gray-300 dark:text-gray-600",    dot: "bg-gray-400 dark:bg-gray-500" },
};

// Trạng thái lạ (BE thêm mới mà FE chưa cập nhật) không được làm vỡ cả lưới
const styleOf = (status) => STATUS_STYLE[status] ?? {
  bg: "bg-gray-100 dark:bg-white/10", text: "text-gray-600 dark:text-gray-300", dot: "bg-gray-400",
};

const WEEKDAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

// Sắp ngày trong tháng thành lưới tuần (Thứ 2 → Chủ nhật), ô trống ở đầu/cuối = null
const buildWeekGrid = (days) => {
  if (!days.length) return [];
  const firstDow = (new Date(days[0].work_date).getDay() + 6) % 7; // 0=T2
  const cells = [...Array(firstDow).fill(null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
};

function DriverDetailModal({ driver, statusLabels, onClose, onMark, onClear, marking }) {
  const [dayModal, setDayModal] = useState(null); // { work_date, status, override_id }

  if (!driver) return null;
  const weeks = buildWeekGrid(driver.days);

  return (
    <>
      <Modal isOpen={!!driver} onOpenChange={(open) => !open && onClose()} size="2xl">
        <ModalContent>
          <ModalHeader className="flex flex-col items-start gap-0.5">
            <span>{driver.full_name}</span>
            <span className="text-xs font-normal text-gray-400 dark:text-gray-400">
              {driver.plate_number || "Chưa gán xe"} · {driver.vehicle_group_name || "—"}
              {driver.hire_date ? ` · Vào làm ${driver.hire_date.split("-").reverse().join("/")}` : ""}
              {driver.termination_date ? ` · Làm tới ${driver.termination_date.split("-").reverse().join("/")}` : ""}
            </span>
          </ModalHeader>
          <ModalBody className="gap-4">
            <div className="flex flex-wrap gap-2">
              {Object.entries(driver.summary).map(([status, count]) => (
                <Chip key={status} size="sm" variant="flat" className={`${styleOf(status).bg} ${styleOf(status).text}`}>
                  {statusLabels[status]}: {count}
                </Chip>
              ))}
            </div>

            <div className="rounded-xl border border-gray-100 dark:border-white/10 overflow-hidden">
              <div className="grid grid-cols-7 bg-gray-50 dark:bg-white/5 border-b border-gray-100 dark:border-white/10">
                {WEEKDAY_LABELS.map((w) => (
                  <div key={w} className="text-center text-[11px] font-semibold text-gray-400 dark:text-gray-400 py-2">{w}</div>
                ))}
              </div>
              <div className="flex flex-col divide-y divide-gray-50 dark:divide-white/10">
                {weeks.map((week, wi) => (
                  <div key={wi} className="grid grid-cols-7 divide-x divide-gray-50 dark:divide-white/10">
                    {week.map((day, di) => {
                      if (!day) return <div key={di} className="h-16 bg-gray-50/40 dark:bg-white/5" />;
                      const style = styleOf(day.status);
                      const dayNum = new Date(day.work_date).getDate();
                      // Trước ngày vào làm: không tính công, BE cũng chặn chấm — khoá ô luôn
                      const locked = day.editable === false;
                      const isHoliday = Boolean(day.holiday_name) && !locked;
                      return (
                        <button
                          key={di}
                          disabled={locked}
                          onClick={() => setDayModal(day)}
                          title={locked ? statusLabels[day.status] : isHoliday ? day.holiday_name : undefined}
                          className={`h-16 flex flex-col items-center justify-center gap-0.5 transition-all ${style.bg}
                                     ${locked ? "cursor-not-allowed" : "hover:brightness-95"}
                                     ${isHoliday ? "ring-1 ring-inset ring-violet-400/60" : ""}`}
                        >
                          <span className={`text-xs font-semibold ${style.text}`}>{dayNum}</span>
                          {isHoliday ? (
                            <span className={`text-[9px] font-bold leading-none ${style.text}`}>
                              {day.status === "holiday_worked" ? "LỄ ×2" : "LỄ"}
                            </span>
                          ) : (
                            <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
              {Object.entries(statusLabels).map(([status, label]) => (
                <div key={status} className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${styleOf(status).dot}`} /> {label}
                </div>
              ))}
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={onClose}>Đóng</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={!!dayModal} onOpenChange={(open) => !open && setDayModal(null)} size="sm">
        <ModalContent>
          <ModalHeader>
            Ngày {dayModal ? new Date(dayModal.work_date).toLocaleDateString("vi-VN") : ""}
          </ModalHeader>
          <ModalBody className="gap-2">
            {dayModal?.holiday_name && (
              <div className="rounded-xl border border-violet-200 dark:border-violet-500/25 bg-violet-50 dark:bg-violet-500/10 p-3">
                <p className="text-xs font-bold text-violet-700 dark:text-violet-300">
                  Ngày lễ — {dayModal.holiday_name}
                </p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                  Được nghỉ hưởng nguyên lương, không trừ công dù có nghỉ. Nếu tài xế đi làm
                  hôm nay thì ngày đó tính <b>200% lương</b>.
                  {dayModal.has_completed_trip
                    ? " Hệ thống đã ghi nhận có chuyến hoàn thành trong ngày → đã tự tính ×2."
                    : " Chưa có chuyến nào hoàn thành trong ngày — nếu tài vẫn đi làm, bấm nút bên dưới để tính ×2."}
                </p>
              </div>
            )}
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Trạng thái hiện tại: <strong>{dayModal ? statusLabels[dayModal.status] : ""}</strong>
              {dayModal?.leave_request_id && !dayModal?.override_id && (
                <span className="block text-xs text-gray-400 dark:text-gray-400 mt-1">Tự động từ đơn nghỉ tài xế đã gửi.</span>
              )}
            </p>
          </ModalBody>
          <ModalFooter className="flex-wrap gap-2">
            {dayModal?.override_id && (
              <Button
                variant="flat" color="default" size="sm" isLoading={marking}
                onPress={async () => { await onClear(driver.driver_id, dayModal.work_date); setDayModal(null); }}
              >
                Xoá đánh dấu
              </Button>
            )}

            {/* Ngày lễ chỉ có 1 quyết định: tài có đi làm hôm đó không. Không trừ công
                được nên ẩn hẳn nút vắng/nửa công thay vì để bấm rồi BE báo lỗi. */}
            {dayModal?.holiday_name ? (
              <Button
                size="sm" isLoading={marking}
                className="bg-fuchsia-600 text-white"
                isDisabled={dayModal?.status === "holiday_worked"}
                onPress={async () => { await onMark(driver.driver_id, dayModal.work_date, "holiday_worked"); setDayModal(null); }}
              >
                Đi làm ngày lễ (×2 công)
              </Button>
            ) : (
              <>
                <Button
                  variant="flat" color="success" size="sm" isLoading={marking}
                  isDisabled={dayModal?.status === "present"}
                  onPress={async () => { await onMark(driver.driver_id, dayModal.work_date, "present"); setDayModal(null); }}
                >
                  Đánh dấu Có mặt
                </Button>
                <Button
                  variant="flat" className="bg-orange-100 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300" size="sm" isLoading={marking}
                  isDisabled={dayModal?.status === "half_day" || !!dayModal?.leave_request_id}
                  onPress={async () => { await onMark(driver.driver_id, dayModal.work_date, "half_day"); setDayModal(null); }}
                >
                  Nửa công (nghỉ nửa buổi)
                </Button>
                <Button
                  variant="flat" color="danger" size="sm" isLoading={marking}
                  isDisabled={dayModal?.status === "absent_unexcused" || !!dayModal?.leave_request_id}
                  onPress={async () => { await onMark(driver.driver_id, dayModal.work_date, "absent_unexcused"); setDayModal(null); }}
                >
                  Vắng không phép
                </Button>
              </>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}

export function AttendanceManagement({ getGrid, markAttendance, clearAttendance, getVehicleGroups }) {
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [vehicleGroupId, setVehicleGroupId] = useState("");
  const [vehicleGroups, setVehicleGroups] = useState([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(false);
  const [drivers, setDrivers] = useState([]);
  const [statusLabels, setStatusLabels] = useState({});
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    getVehicleGroups().then((data) => setVehicleGroups(data.vehicleGroups || data.vehicle_groups || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const params = { month: String(month), year: String(year) };
      if (vehicleGroupId) params.vehicle_group_id = vehicleGroupId;
      const data = await getGrid(params);
      setDrivers(data.drivers || []);
      setStatusLabels(data.status_labels || {});
    } catch (error) {
      notify.error(error.message || "Không thể tải dữ liệu chấm công.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [month, year, vehicleGroupId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPage(1); }, [search, month, year, vehicleGroupId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return drivers;
    return drivers.filter((d) => (d.full_name || "").toLowerCase().includes(q) || (d.plate_number || "").toLowerCase().includes(q));
  }, [drivers, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = useMemo(() => {
    const safePage = Math.min(page, totalPages);
    return filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  }, [filtered, page, totalPages]);

  const handleMark = async (driverId, workDate, status) => {
    setMarking(true);
    try {
      await markAttendance({ driver_id: driverId, work_date: workDate, status });
      await load();
      notify.success("Đã cập nhật chấm công.");
      setSelectedDriver((prev) => {
        if (!prev || prev.driver_id !== driverId) return prev;
        const fresh = drivers.find((d) => d.driver_id === driverId);
        return fresh || prev;
      });
    } catch (error) {
      notify.error(error.message || "Không thể chấm công.");
    } finally {
      setMarking(false);
    }
  };

  const handleClear = async (driverId, workDate) => {
    if (!(await confirmDialog({
      title: "Xóa chấm công",
      description: "Xóa trạng thái chấm công của tài xế trong ngày này?",
      confirmLabel: "Xóa",
      danger: true,
    }))) return;
    setMarking(true);
    try {
      await clearAttendance(driverId, workDate);
      await load();
      notify.success("Đã xóa chấm công.");
    } catch (error) {
      notify.error(error.message || "Không thể xoá đánh dấu.");
    } finally {
      setMarking(false);
    }
  };

  // Sau khi load() cập nhật drivers, đồng bộ modal đang mở (nếu có) với dữ liệu mới
  useEffect(() => {
    if (!selectedDriver) return;
    const fresh = drivers.find((d) => d.driver_id === selectedDriver.driver_id);
    if (fresh) setSelectedDriver(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drivers]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Select label="Tháng" selectedKeys={[String(month)]} onSelectionChange={(k) => setMonth(Number([...k][0]))} variant="bordered" size="sm" className="w-28">
          {MONTHS.map((m) => <SelectItem key={String(m)}>{`Tháng ${m}`}</SelectItem>)}
        </Select>
        <Select label="Năm" selectedKeys={[String(year)]} onSelectionChange={(k) => setYear(Number([...k][0]))} variant="bordered" size="sm" className="w-28">
          {YEARS.map((y) => <SelectItem key={String(y)} textValue={String(y)}>{String(y)}</SelectItem>)}
        </Select>
        <Select
          label="Nhóm xe" placeholder="Tất cả nhóm xe" variant="bordered" size="sm" className="w-52"
          selectedKeys={new Set([vehicleGroupId])}
          onSelectionChange={(k) => setVehicleGroupId([...k][0] ?? "")}
        >
          <SelectItem key="" textValue="Tất cả nhóm xe">Tất cả nhóm xe</SelectItem>
          {vehicleGroups.map((g) => <SelectItem key={String(g.id)} textValue={g.name}>{g.name}</SelectItem>)}
        </Select>
        <Input
          placeholder="Tìm theo tên tài xế, biển số..."
          value={search}
          onValueChange={setSearch}
          startContent={<RiSearchLine size={14} className="text-gray-400 dark:text-gray-400" />}
          variant="bordered"
          size="sm"
          className="w-72"
          isClearable
        />
      </div>

      <div className="bg-white dark:bg-[#161922] rounded-2xl border border-gray-100 dark:border-white/10 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-white/10">
          <div className="text-sm font-bold text-gray-800 dark:text-gray-100">Chấm công tài xế</div>
          <div className="text-xs text-gray-400 dark:text-gray-400">Mặc định mọi ngày là "Có mặt" — chỉ cần đánh dấu ngoại lệ (vắng không phép, hoặc điều chỉnh lại nếu tài xế xin nghỉ nhưng thực tế vẫn đi làm). Ngày lễ viền tím: nghỉ vẫn hưởng nguyên lương, đi làm được tính 200%.</div>
        </div>

        {loading ? (
          <div className="flex justify-center py-14"><Spinner color="primary" /></div>
        ) : paged.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-gray-400 text-center py-10">Không có tài xế nào phù hợp.</p>
        ) : (
          <div className="flex flex-col divide-y divide-gray-50 dark:divide-white/10">
            {paged.map((d) => (
              <div key={d.driver_id} className="flex items-center justify-between px-5 py-3.5 gap-4 flex-wrap">
                <div className="flex flex-col min-w-0">
                  <span className="font-semibold text-sm text-gray-800 dark:text-gray-100">{d.full_name}</span>
                  <span className="text-xs text-gray-400 dark:text-gray-400">{d.plate_number || "Chưa gán xe"} · {d.vehicle_group_name || "—"}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {Object.entries(d.summary).filter(([, c]) => c > 0).map(([status, count]) => (
                    <Chip key={status} size="sm" variant="flat" className={`${styleOf(status).bg} ${styleOf(status).text}`}>
                      {statusLabels[status]}: {count}
                    </Chip>
                  ))}
                  <Button size="sm" variant="flat" color="primary" startContent={<RiCalendarCheckLine size={14} />} onPress={() => setSelectedDriver(d)}>
                    Xem lịch
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-100 dark:border-white/10">
            <PaginationBar page={page} pageSize={PAGE_SIZE} totalItems={filtered.length} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </div>

      <DriverDetailModal
        driver={selectedDriver}
        statusLabels={statusLabels}
        onClose={() => setSelectedDriver(null)}
        onMark={handleMark}
        onClear={handleClear}
        marking={marking}
      />
    </div>
  );
}
