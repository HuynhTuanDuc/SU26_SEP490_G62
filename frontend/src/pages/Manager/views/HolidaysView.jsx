import { useEffect, useMemo, useState } from "react";
import { Button, Input, Select, SelectItem, Chip, Spinner, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/react";
import { RiCalendarLine, RiAddLine, RiDeleteBinLine } from "react-icons/ri";
import { PaginationBar } from "../../../components/shared-ui/PaginationBar";
import { managerService } from "../services/manager.service";

const WEEKDAYS = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];
const PAGE_SIZE = 10;

const fmtDate = (iso) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

export default function HolidaysView() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [page, setPage] = useState(1);

  const load = async (y = year) => {
    setLoading(true);
    try {
      const data = await managerService.getHolidays(y);
      setHolidays(data.holidays || []);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(year); }, [year]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPage(1); }, [year]);

  const totalPages = Math.max(1, Math.ceil(holidays.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedHolidays = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return holidays.slice(start, start + PAGE_SIZE);
  }, [holidays, safePage]);

  const handleAdd = async () => {
    if (!newDate) { alert("Chọn ngày lễ"); return; }
    if (!newName.trim()) { alert("Nhập tên ngày lễ"); return; }
    setSaving(true);
    try {
      await managerService.createHoliday({ holiday_date: newDate, name: newName.trim() });
      setModalOpen(false);
      setNewDate("");
      setNewName("");
      const addedYear = new Date(newDate).getFullYear();
      if (addedYear !== year) setYear(addedYear); else await load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const dateKey = String(deleteTarget.holiday_date).slice(0, 10);
      await managerService.deleteHoliday(dateKey);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      alert(err.message);
    }
  };

  const yearOptions = [];
  for (let y = currentYear - 1; y <= currentYear + 2; y += 1) yearOptions.push(y);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center justify-between gap-4 flex-wrap mb-2">
        <div className="flex items-center gap-3">
          <RiCalendarLine size={18} className="text-blue-600" />
          <span className="text-sm font-bold text-gray-800">Ngày lễ trong năm</span>
          <Select
            selectedKeys={[String(year)]}
            onSelectionChange={(keys) => setYear(Number([...keys][0]))}
            variant="bordered"
            size="sm"
            className="w-32"
          >
            {yearOptions.map((y) => <SelectItem key={String(y)}>{`Năm ${y}`}</SelectItem>)}
          </Select>
        </div>
        <Button color="primary" size="sm" startContent={<RiAddLine size={16} />} onPress={() => setModalOpen(true)}>
          Thêm ngày lễ
        </Button>
      </div>

      <p className="text-xs text-gray-400 mb-4">
        Ngày lễ được nghỉ hưởng nguyên lương. Tài xế có chuyến hoàn thành trong ngày lễ được tự động
        cộng thêm 100% lương ngày (tổng 200%) vào bảng lương tháng đó. Ngày âm lịch (Tết, Giỗ Tổ)
        thay đổi hằng năm — nhớ cập nhật khi sang năm mới.
      </p>

      {loading ? (
        <div className="flex justify-center py-10"><Spinner color="primary" /></div>
      ) : holidays.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-8">Chưa có ngày lễ nào cho năm {year}.</p>
      ) : (
        <>
          <div className="flex flex-col divide-y divide-gray-50">
            {pagedHolidays.map((h) => (
              <div key={h.holiday_date} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-gray-800 w-24">{fmtDate(h.holiday_date)}</span>
                  <Chip size="sm" variant="flat">{WEEKDAYS[new Date(h.holiday_date).getDay()]}</Chip>
                  <span className="text-sm text-gray-600">{h.name}</span>
                </div>
                <Button isIconOnly size="sm" variant="light" color="danger" onPress={() => setDeleteTarget(h)}>
                  <RiDeleteBinLine size={15} />
                </Button>
              </div>
            ))}
          </div>
          {holidays.length > 0 && (
            <div className="mt-3">
              <PaginationBar
                page={safePage}
                pageSize={PAGE_SIZE}
                totalItems={holidays.length}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </div>
          )}
        </>
      )}

      <Modal isOpen={modalOpen} onOpenChange={(open) => !open && setModalOpen(false)} size="sm">
        <ModalContent>
          <ModalHeader>Thêm ngày lễ</ModalHeader>
          <ModalBody className="gap-3">
            <Input type="date" label="Ngày" value={newDate} onValueChange={setNewDate} variant="bordered" />
            <Input label="Tên ngày lễ" placeholder="VD: Tết Âm lịch (mùng 1)" value={newName} onValueChange={setNewName} variant="bordered" />
            <p className="text-xs text-gray-400">Chọn trùng ngày đã có sẽ cập nhật tên ngày lễ đó.</p>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setModalOpen(false)}>Đóng</Button>
            <Button color="primary" isLoading={saving} onPress={handleAdd}>Lưu</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)} size="sm">
        <ModalContent>
          <ModalHeader>Xóa ngày lễ</ModalHeader>
          <ModalBody>
            <p className="text-sm text-gray-500">Xóa ngày lễ {deleteTarget ? fmtDate(deleteTarget.holiday_date) : ""}?</p>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setDeleteTarget(null)}>Đóng</Button>
            <Button color="danger" onPress={handleDelete}>Xóa</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
