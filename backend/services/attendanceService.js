const attendanceRepository = require('../repositories/attendanceRepository');
const notificationService  = require('./notificationService');

class AttendanceError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.name = 'AttendanceError';
        this.status = status;
    }
}

const STATUS_LABEL = {
    present:           'Có mặt',
    holiday:           'Nghỉ lễ (hưởng nguyên lương)',
    holiday_worked:    'Đi làm ngày lễ (200% lương)',
    leave_paid:        'Nghỉ phép (hưởng lương)',
    leave_unpaid:      'Nghỉ không lương',
    absent_unexcused:  'Vắng không phép',
    half_day:          'Nửa công (nghỉ nửa buổi)',
    not_employed:      'Chưa vào làm',
    terminated:        'Đã nghỉ việc',
};

// Trạng thái của ngày NGOÀI thời gian làm việc — không tính công, không chấm được
const OUTSIDE_EMPLOYMENT = ['not_employed', 'terminated'];

// Ngày ngoài thời gian làm việc (trước ngày vào làm / sau ngày nghỉ việc) đè lên MỌI
// trạng thái: không có quan hệ lao động thì không có công để tính, cũng không có gì để
// chấm — bảng lương bỏ qua những ngày này (WORK_DAYS_SQL). Trước đây lưới mặc định mọi
// ngày là "Có mặt", nên tài vào làm ngày 25 hiện đủ công cả tháng.
//
// Ngày lễ đè lên mọi trạng thái còn lại: theo Điều V.1 chính sách lương, ngày lễ được
// nghỉ mà vẫn hưởng nguyên lương — nên không có khái niệm "vắng" hay "nghỉ không
// lương" trong ngày lễ. Chỉ còn hai khả năng: nghỉ lễ, hoặc đi làm và ăn 200%.
const resolveDayStatus = (row) => {
    if (row.before_hire) return 'not_employed';
    if (row.after_termination) return 'terminated';
    if (row.holiday_name) {
        return (row.override_status === 'holiday_worked' || row.has_completed_trip)
            ? 'holiday_worked'
            : 'holiday';
    }
    if (row.override_status) return row.override_status;
    if (row.leave_request_id) return row.leave_type === 'paid' ? 'leave_paid' : 'leave_unpaid';
    return 'present';
};

// Gộp override + leave_request thành 1 danh sách theo tài xế, mỗi tài xế có mảng ngày
// với trạng thái hiệu lực đã tính sẵn — tiện cho FE vẽ lưới tháng.
const getMonthlyGrid = async ({ month, year, driverId, vehicleGroupId }) => {
    const m = Number(month);
    const y = Number(year);
    if (!m || m < 1 || m > 12) throw new AttendanceError('Tháng không hợp lệ (1-12)');
    if (!y || y < 2020 || y > 2100) throw new AttendanceError('Năm không hợp lệ');

    const rows = await attendanceRepository.getMonthlyGrid({
        month: m, year: y,
        driverId: driverId ? Number(driverId) : null,
        vehicleGroupId: vehicleGroupId ? Number(vehicleGroupId) : null,
    });

    const driversMap = new Map();
    for (const r of rows) {
        if (!driversMap.has(r.driver_id)) {
            driversMap.set(r.driver_id, {
                driver_id: r.driver_id,
                full_name: r.full_name,
                plate_number: r.plate_number,
                vehicle_group_name: r.vehicle_group_name,
                hire_date: r.hire_date,
                termination_date: r.termination_date,
                days: [],
                summary: {
                    present: 0, holiday: 0, holiday_worked: 0,
                    leave_paid: 0, leave_unpaid: 0, absent_unexcused: 0, half_day: 0,
                    not_employed: 0, terminated: 0,
                },
            });
        }
        const driver = driversMap.get(r.driver_id);
        const status = resolveDayStatus(r);

        driver.days.push({
            work_date: r.work_date,
            status,
            status_label: STATUS_LABEL[status],
            override_id: r.override_id,
            override_notes: r.override_notes,
            leave_request_id: r.leave_request_id,
            holiday_name: r.holiday_name ?? null,
            has_completed_trip: Boolean(r.has_completed_trip),
            editable: !OUTSIDE_EMPLOYMENT.includes(status),
        });
        driver.summary[status] += 1;
    }

    return { drivers: Array.from(driversMap.values()), status_labels: STATUS_LABEL };
};

// Ngày dạng YYYY-MM-DD → DD/MM/YYYY cho người đọc
const fmtDate = (d) => {
    const [y, m, day] = String(d).slice(0, 10).split('-');
    return `${day}/${m}/${y}`;
};

const MARK_NOTIF = {
    present:          { title: 'Chấm công: Có mặt',           body: 'được ghi nhận đi làm bình thường.' },
    absent_unexcused: { title: 'Chấm công: Vắng không phép',  body: 'bị ghi nhận vắng không phép — ngày này bị trừ công khi tính lương.' },
    half_day:         { title: 'Chấm công: Nửa công',         body: 'được ghi nhận nửa công (nghỉ nửa buổi) — trừ 0,5 ngày công.' },
    holiday_worked:   { title: 'Chấm công: Đi làm ngày lễ',   body: 'được ghi nhận đi làm ngày lễ — ngày này tính 200% lương.' },
};

// Gửi thông báo cho tài xế, không chặn luồng chấm công nếu gửi lỗi
const notifyDriver = (driverId, workDate, status, notes) => {
    const cfg = MARK_NOTIF[status];
    if (!cfg) return;
    const note = notes?.trim() ? ` Ghi chú: ${notes.trim()}` : '';
    notificationService.createForUser(driverId, {
        title: cfg.title,
        message: `Ngày ${fmtDate(workDate)} ${cfg.body}${note}`,
        type: 'ATTENDANCE_UPDATED',
        entityType: 'attendance',
        entityId: null,
    }, { displayMode: 'alert' }).catch(() => {});
};

// Tài xế xem chấm công của CHÍNH MÌNH — driverId lấy từ token, không nhận từ query,
// nên không thể xem của người khác. Trả đúng cấu trúc ngày như lưới của kế toán.
const getMyMonth = async (driverId, { month, year }) => {
    const { drivers, status_labels } = await getMonthlyGrid({ month, year, driverId });
    const me = drivers[0];
    return {
        month: Number(month),
        year: Number(year),
        days: me?.days ?? [],
        summary: me?.summary ?? {},
        status_labels,
    };
};

const markAttendance = async ({ driverId, workDate, status, notes }, markedBy) => {
    if (!driverId) throw new AttendanceError('driver_id là bắt buộc');
    if (!workDate) throw new AttendanceError('work_date là bắt buộc');
    if (!['present', 'absent_unexcused', 'half_day', 'holiday_worked'].includes(status)) {
        throw new AttendanceError('Trạng thái không hợp lệ (chỉ đánh dấu được: present, absent_unexcused, half_day, holiday_worked)');
    }
    // So sánh theo chuỗi ngày giờ Việt Nam, KHÔNG dùng new Date(workDate) > new Date():
    // 'YYYY-MM-DD' được parse thành 00:00 UTC = 07:00 giờ VN, nên chấm công cho chính
    // hôm nay trước 7h sáng sẽ bị hiểu nhầm là "ngày trong tương lai" và bị chặn oan.
    const day = String(workDate).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
        throw new AttendanceError('Ngày chấm công không hợp lệ (định dạng YYYY-MM-DD)');
    }
    const todayVN = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
    if (day > todayVN) {
        throw new AttendanceError('Không thể chấm công cho ngày trong tương lai');
    }

    // Ngày ngoài thời gian làm việc — bảng lương không tính công những ngày này, nên chấm
    // vào đó chỉ sinh dữ liệu vô nghĩa (và gửi cho tài một thông báo "vắng không phép"
    // sai). So sánh chuỗi YYYY-MM-DD, cùng lý do với trên.
    const employment = await attendanceRepository.getEmploymentDates(Number(driverId));
    if (!employment) throw new AttendanceError('Không tìm thấy tài xế', 404);
    if (day < employment.hire_date) {
        throw new AttendanceError(`Tài xế vào làm từ ${fmtDate(employment.hire_date)} — ngày ${fmtDate(day)} chưa thuộc thời gian làm việc nên không chấm công được.`);
    }
    if (employment.termination_date && day > employment.termination_date) {
        throw new AttendanceError(`Tài xế đã nghỉ việc (ngày làm cuối ${fmtDate(employment.termination_date)}) — ngày ${fmtDate(day)} không còn thuộc thời gian làm việc nên không chấm công được.`);
    }

    // Chấm lùi vào kỳ lương ĐÃ CHỐT làm số công lệch với số tiền đã trả — chặn lại,
    // muốn điều chỉnh thì phải mở lại bảng lương kỳ đó trước.
    const [y, m] = day.split('-').map(Number);
    const payrollStatus = await attendanceRepository.getPayrollStatus(Number(driverId), m, y);
    if (payrollStatus && payrollStatus !== 'pending') {
        throw new AttendanceError(`Bảng lương tháng ${m}/${y} đã chốt (${payrollStatus}) — không sửa chấm công kỳ này được. Mở lại bảng lương trước nếu cần điều chỉnh.`);
    }

    // Ngày lễ hưởng nguyên lương nên không trừ công được; ngược lại "đi làm ngày lễ"
    // chỉ có nghĩa đúng vào ngày lễ. Chặn ở đây để kế toán không chấm ra trạng thái
    // mà lương không hiểu.
    const holidayName = await attendanceRepository.isHoliday(workDate);
    if (holidayName && ['absent_unexcused', 'half_day'].includes(status)) {
        throw new AttendanceError(`${workDate} là ngày lễ (${holidayName}) — được nghỉ hưởng nguyên lương, không trừ công. Nếu tài xế có đi làm hôm đó, chọn "Đi làm ngày lễ" để tính 200%.`);
    }
    if (!holidayName && status === 'holiday_worked') {
        throw new AttendanceError('Chỉ đánh dấu "Đi làm ngày lễ" cho ngày nằm trong danh mục ngày lễ của công ty');
    }

    if (status === 'absent_unexcused' || status === 'half_day') {
        const leave = await attendanceRepository.findApprovedLeave(Number(driverId), workDate);
        if (leave) {
            throw new AttendanceError('Ngày này tài xế đã có đơn nghỉ được duyệt — không thể đánh dấu vắng không phép/nửa công. Nếu cần điều chỉnh, đánh dấu "Có mặt" để ghi đè.');
        }
    }

    const saved = await attendanceRepository.upsertOverride({
        driverId: Number(driverId),
        workDate,
        status,
        notes,
        markedBy,
    });

    // Chấm công ăn thẳng vào lương (vắng/nửa công trừ tiền, đi làm ngày lễ cộng 200%)
    // nên tài xế phải được báo day, đừng để tới lúc nhận lương mới biết rồi khiếu nại.
    notifyDriver(Number(driverId), workDate, status, notes);

    return saved;
};

const clearAttendance = async (driverId, workDate) => {
    const deleted = await attendanceRepository.deleteOverride(Number(driverId), workDate);
    if (!deleted) throw new AttendanceError('Không tìm thấy đánh dấu chấm công để xoá', 404);

    // Gỡ đánh dấu cũng ảnh hưởng lương (bỏ trừ công / bỏ 200%) nên phải báo lại
    notificationService.createForUser(Number(driverId), {
        title: 'Chấm công: đã gỡ đánh dấu',
        message: `Đánh dấu chấm công ngày ${fmtDate(workDate)} đã được gỡ — ngày này quay lại trạng thái mặc định.`,
        type: 'ATTENDANCE_UPDATED',
        entityType: 'attendance',
        entityId: null,
    }, { displayMode: 'alert' }).catch(() => {});

    return deleted;
};

module.exports = { AttendanceError, STATUS_LABEL, getMonthlyGrid, getMyMonth, markAttendance, clearAttendance };
