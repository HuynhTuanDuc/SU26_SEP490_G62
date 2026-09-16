const pool = require('../config/database');

// Hồ sơ công việc của tài xế: ngày vào làm / ngày nghỉ việc (ngày làm việc cuối cùng,
// NULL = đang làm). Hai mốc này quyết định bảng lương, chấm công, thưởng Tết tính công
// trong khoảng nào. Ngày trả về dạng 'YYYY-MM-DD' — chuỗi, không qua Date để khỏi lệch
// múi giờ khi so sánh.
const EMPLOYMENT_COLUMNS = `
    profile_id                              AS driver_id,
    to_char(hire_date, 'YYYY-MM-DD')        AS hire_date,
    to_char(termination_date, 'YYYY-MM-DD') AS termination_date`;

const ACTIVE_TRIP_STATUSES = ['claimed', 'picking', 'transit', 'arrived', 'returning'];

const getEmployment = async (driverId) => {
    const { rows: [row] } = await pool.query(
        `SELECT ${EMPLOYMENT_COLUMNS} FROM drivers WHERE profile_id = $1`,
        [driverId],
    );
    return row ?? null;
};

const updateEmployment = async (driverId, hireDate, terminationDate) => {
    const { rows: [row] } = await pool.query(
        `UPDATE drivers SET hire_date = $2, termination_date = $3
         WHERE profile_id = $1
         RETURNING ${EMPLOYMENT_COLUMNS}`,
        [driverId, hireDate, terminationDate],
    );
    return row ?? null;
};

// Phiếu lương ĐÃ CHỐT (không còn 'pending') đầu tiên của tài trong khoảng tháng
// [fromMonth, toMonth] — hai đầu là ngày mùng 1 'YYYY-MM-01', toMonth null = không giới
// hạn trên. Dời ngày vào làm / nghỉ việc qua một kỳ đã chốt làm số công kỳ đó lệch với
// số tiền đã duyệt/đã trả, nên nơi gọi dùng hàm này để chặn.
const findLockedPayroll = async (driverId, fromMonth, toMonth = null) => {
    const { rows: [row] } = await pool.query(
        `SELECT payroll_month, payroll_year, status
         FROM payrolls
         WHERE driver_id = $1
           AND status <> 'pending'
           AND make_date(payroll_year, payroll_month, 1) >= $2::date
           AND ($3::date IS NULL OR make_date(payroll_year, payroll_month, 1) <= $3::date)
         ORDER BY payroll_year, payroll_month
         LIMIT 1`,
        [driverId, fromMonth, toMonth],
    );
    return row ?? null;
};

// Dấu vết chuyến của tài, dùng trước khi chấm dứt hợp đồng:
//  • activeTrips — chuyến đang chạy dở: khoá tài khoản lúc này là bỏ hàng giữa đường;
//  • lastCompletedDate — ngày gần nhất tài hoàn thành chuyến. Ngày làm cuối không được
//    trước ngày này: doanh thu chuyến đó vẫn vào kỳ lương mà ngày công lại không tính.
const getTripFootprint = async (driverId) => {
    const { rows: [row] } = await pool.query(
        `SELECT COUNT(*) FILTER (WHERE os.status = ANY($2::text[]))::int AS active_trips,
                to_char(MAX(os.completed_at::date) FILTER (WHERE os.status = 'completed'), 'YYYY-MM-DD')
                    AS last_completed_date
         FROM order_shipments os
         JOIN v_shipment_current sc ON sc.shipment_id = os.id
         WHERE sc.owner_driver_id = $1`,
        [driverId, ACTIVE_TRIP_STATUSES],
    );
    return {
        activeTrips: Number(row?.active_trips ?? 0),
        lastCompletedDate: row?.last_completed_date ?? null,
    };
};

const ADVANCE_CANCEL_REASON = 'Tài xế chấm dứt hợp đồng — yêu cầu chưa giải ngân được huỷ tự động.';

// Chấm dứt hợp đồng — MỘT giao dịch: ghi ngày làm cuối, khoá tài khoản, trả xe biên chế,
// huỷ yêu cầu ứng lương chưa giải ngân. Làm lẻ từng bước thì lỗi giữa chừng để lại tài
// "đã nghỉ" mà vẫn đăng nhập được, hoặc tài khoản bị khoá mà không có ngày nghỉ việc
// (bảng lương loại hẳn → mất trắng lương các ngày đã làm).
//
// Ứng lương ĐÃ giải ngân thì để nguyên: vẫn trừ vào lương kỳ cuối như thường lệ.
const terminateContract = async (driverId, terminationDate) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows: [current] } = await client.query(
            `SELECT d.vehicle_id, v.plate_number
             FROM drivers d
             LEFT JOIN vehicles v ON v.id = d.vehicle_id
             WHERE d.profile_id = $1
             FOR UPDATE OF d`,
            [driverId],
        );
        if (!current) {
            await client.query('ROLLBACK');
            return null;
        }

        const { rows: [employment] } = await client.query(
            `UPDATE drivers SET termination_date = $2, vehicle_id = NULL
             WHERE profile_id = $1
             RETURNING ${EMPLOYMENT_COLUMNS}`,
            [driverId, terminationDate],
        );
        // Xe giữ liên kết ở cả hai phía (drivers.vehicle_id ↔ vehicles.assigned_driver_id,
        // đều UNIQUE) — gỡ một phía thì xe vẫn không giao được cho tài mới
        const { rows: releasedVehicles } = await client.query(
            `UPDATE vehicles SET assigned_driver_id = NULL, updated_at = NOW()
             WHERE assigned_driver_id = $1
             RETURNING id, plate_number`,
            [driverId],
        );
        await client.query(
            `UPDATE accounts SET is_active = FALSE, updated_at = NOW() WHERE id = $1`,
            [driverId],
        );
        const { rows: rejectedAdvances } = await client.query(
            `UPDATE salary_advances
             SET status = 'rejected', reject_reason = $2, updated_at = NOW()
             WHERE driver_id = $1 AND status IN ('pending', 'approved')
             RETURNING id, amount::text, request_month, request_year`,
            [driverId, ADVANCE_CANCEL_REASON],
        );

        await client.query('COMMIT');

        const plates = new Set(releasedVehicles.map((v) => v.plate_number));
        if (current.plate_number) plates.add(current.plate_number);
        return { employment, releasedVehicles: [...plates], rejectedAdvances };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

module.exports = {
    getEmployment,
    updateEmployment,
    findLockedPayroll,
    getTripFootprint,
    terminateContract,
};
