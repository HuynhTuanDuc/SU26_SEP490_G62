// Hằng số + công thức ngày công DÙNG CHUNG cho màn ước tính (payrollRepository), bảng
// lương chốt chính thức (accountantPayrollRepository) và thưởng Tết (bonusRepository).
// Mỗi nơi tự khai riêng là sớm muộn cũng lệch nhau — tài xế xem trước một con số rồi
// nhận về một con số khác.

// "28 công" là đơn giá quy đổi 1 ngày lương (base/28), KHÔNG phải trần số ngày được trả.
const WORKING_DAYS_PER_MONTH = 28;
const PHONE_ALLOWANCE        = 200_000;
// BHXH vùng I 2025: mức lương đóng 5.310.000 — NLĐ đóng 10.5%, DN đóng 21.5%
const INSURANCE_SALARY_BASE  = 5_310_000;
const BHXH_EMPLOYEE_RATE     = 0.105;
const BHXH_COMPANY_RATE      = 0.215;

// Số công bị trừ của MỘT ngày lịch đã có đơn nghỉ và/hoặc chấm công. Cần hai alias:
// `ao` = attendance_overrides, `lr` = leave_requests (không lương, đã duyệt) của đúng
// ngày đó. Thứ tự ưu tiên: CHẤM CÔNG thắng ĐƠN NGHỈ — chấm công là thứ điều phối/quản lý
// quan sát được tại chỗ, còn đơn nghỉ là thứ tài xế tự khai:
//   chấm 'absent_unexcused'        → 1
//   chấm 'half_day'                → 0.5 (có đi làm nửa ngày)
//   chấm 'present'/'holiday_worked'→ 0   (đi làm thật, dù có đơn nghỉ)
//   chỉ có đơn nghỉ không lương    → 1
// Ngày lễ được miễn trừ ở nơi dùng (Điều V.1 — nghỉ lễ hưởng nguyên lương).
const UNPAID_DAY_CASE_SQL = `
    CASE
        WHEN ao.status = 'absent_unexcused' THEN 1
        WHEN ao.status = 'half_day'         THEN 0.5
        WHEN ao.status IS NOT NULL          THEN 0
        WHEN lr.leave_date IS NOT NULL      THEN 1
        ELSE 0
    END`;

// NGÀY CÔNG của một tài xế trong kỳ. Tham số: $1 driver_id, $2 tháng, $3 năm.
// Trả về 1 dòng (không có dòng nào nếu driver_id không phải tài xế):
//   days_in_month     số ngày lịch của tháng (28-31)
//   employed_days     số ngày thuộc thời gian làm việc: từ MAX(mùng 1, hire_date) tới
//                     MIN(cuối tháng, termination_date). = days_in_month nếu làm trọn
//                     tháng, = 0 nếu vào làm sau kỳ hoặc đã nghỉ việc trước kỳ
//   hire_date         'YYYY-MM-DD'
//   termination_date  'YYYY-MM-DD' — ngày làm việc cuối cùng, NULL = đang làm
//   unpaid_days       số công không lương (NUMERIC, có thể lẻ .5)
//
// Vì sao phải chặn theo hire_date / termination_date: trước đây mọi ngày trong tháng mặc
// định là ngày đi làm, nên tài vào làm ngày 25 vẫn nhận đủ lương cứng cả tháng, còn tài
// nghỉ việc giữa tháng thì hoặc nhận đủ tháng (chưa bị khoá), hoặc mất trắng (đã khoá).
// Ngày ngoài thời gian làm việc không phải "nghỉ", mà là chưa/không còn quan hệ lao động:
// không tính công, và cũng không tính là ngày nghỉ.
//
// Vì sao unpaid_days phải gộp một truy vấn thay vì cộng ba truy vấn rời: một ngày lịch
// có thể vừa có đơn nghỉ không lương, vừa có bản ghi chấm công. Đếm rời rồi cộng lại là
// trừ HAI công cho MỘT ngày — tài xế senior mất 321.429đ mỗi ngày dính, và bảng lương đã
// rời trạng thái 'pending' thì không sửa lại được nữa. Đường vào có thật: điều phối chấm
// 'absent_unexcused' trước, tài xế đăng ký nghỉ bù sau (leaveService cho đăng ký lùi tới
// 3 tháng). Trọng số từng ngày: xem UNPAID_DAY_CASE_SQL.
//
// Tập ngày ứng viên chỉ gồm ngày CÓ trừ công tiềm năng, nằm trong khoảng làm việc; ngày
// chỉ có chấm 'present' không lọt vào nên không sinh dòng thừa. UNIQUE(driver_id,
// work_date) và UNIQUE(driver_id, leave_date) bảo đảm hai LEFT JOIN không nhân bản dòng.
const WORK_DAYS_SQL = `
    WITH period AS (
        SELECT make_date($3::int, $2::int, 1)                                   AS first_d,
               (make_date($3::int, $2::int, 1) + INTERVAL '1 month - 1 day')::date AS last_d
    ),
    emp AS (
        SELECT GREATEST(p.first_d, d.hire_date)                          AS from_d,
               LEAST(p.last_d, COALESCE(d.termination_date, p.last_d))   AS to_d,
               p.last_d - p.first_d + 1                                  AS days_in_month,
               d.hire_date,
               d.termination_date
        FROM period p
        JOIN drivers d ON d.profile_id = $1
    ),
    cand AS (
        SELECT ao2.work_date AS d
        FROM attendance_overrides ao2, emp
        WHERE ao2.driver_id = $1
          AND ao2.status IN ('absent_unexcused', 'half_day')
          AND ao2.work_date BETWEEN emp.from_d AND emp.to_d
        UNION
        SELECT lr2.leave_date
        FROM leave_requests lr2, emp
        WHERE lr2.driver_id = $1
          AND lr2.leave_type = 'unpaid' AND lr2.status = 'approved'
          AND lr2.leave_date BETWEEN emp.from_d AND emp.to_d
    )
    SELECT
        emp.days_in_month::int                        AS days_in_month,
        GREATEST(0, emp.to_d - emp.from_d + 1)::int   AS employed_days,
        to_char(emp.hire_date, 'YYYY-MM-DD')          AS hire_date,
        to_char(emp.termination_date, 'YYYY-MM-DD')   AS termination_date,
        (
            SELECT COALESCE(SUM(${UNPAID_DAY_CASE_SQL}), 0)::numeric
            FROM cand
            LEFT JOIN attendance_overrides ao
                   ON ao.driver_id = $1 AND ao.work_date = cand.d
            LEFT JOIN leave_requests lr
                   ON lr.driver_id = $1 AND lr.leave_date = cand.d
                  AND lr.leave_type = 'unpaid' AND lr.status = 'approved'
            WHERE NOT EXISTS (
                SELECT 1 FROM company_holidays h WHERE h.holiday_date = cand.d
            )
        )                                             AS unpaid_days
    FROM emp
`;

// Các khoản gắn với THỜI GIAN LÀM VIỆC trong kỳ — lương cứng, phụ cấp điện thoại, BHXH.
//
//   lương cứng  = base/28 × (employed_days − unpaid_days)
//   phụ cấp ĐT  = 200.000 × employed_days / days_in_month
//   BHXH        = (5.310.000 × employed_days / days_in_month) × tỉ lệ đóng
//
// Phụ cấp và BHXH chia theo số ngày THUỘC BIÊN CHẾ, không theo số công thực đi làm: tài
// xế đủ tháng mà nghỉ không lương vài ngày vẫn nhận nguyên phụ cấp, đóng nguyên BHXH như
// trước — chỉ người vào làm / nghỉ việc giữa tháng mới bị chia tỉ lệ. Đủ tháng thì tỉ lệ
// = 1, ra đúng 200.000 / 557.550 / 1.141.650 như các hằng số cũ.
//
// proRatedBase trả về chưa làm tròn: bảng lương chốt Math.round trước khi lưu, màn ước
// tính giữ số lẻ rồi toFixed(2) — giữ nguyên cách mỗi bên vốn làm.
const prorateByEmployment = ({ baseSalary, daysInMonth, employedDays, unpaidDays }) => {
    const actualWorkDays      = Math.max(0, employedDays - unpaidDays);
    const ratio               = daysInMonth > 0 ? Math.min(1, Math.max(0, employedDays / daysInMonth)) : 0;
    const insuranceSalaryBase = Math.round(INSURANCE_SALARY_BASE * ratio);
    return {
        actualWorkDays,
        proRatedBase:      (baseSalary / WORKING_DAYS_PER_MONTH) * actualWorkDays,
        phoneAllowance:    Math.round(PHONE_ALLOWANCE * ratio),
        insuranceSalaryBase,
        insuranceEmployee: Math.round(insuranceSalaryBase * BHXH_EMPLOYEE_RATE),
        insuranceCompany:  Math.round(insuranceSalaryBase * BHXH_COMPANY_RATE),
    };
};

// Tiền ứng lương đã giải ngân của kỳ được trừ vào lương kỳ đó như thường lệ — nhưng không
// quá số lương làm ra (payableBeforeAdvance = lương gộp + hoàn chi phí − BHXH). Kỳ lương
// cuối khi nghỉ việc giữa tháng có thể thấp hơn số đã ứng; trước đây phiếu khi đó ra số âm
// và phần tài xế còn nợ lại không nằm ở đâu để thu. Phần vượt (advanceCarriedOver) được
// chuyển thành công nợ tài xế lúc chi lương (accountantPayrollRepository.markPayrollPaid).
const splitAdvance = (advancePaid, payableBeforeAdvance) => {
    const advanceDeduction = Math.min(advancePaid, Math.max(0, payableBeforeAdvance));
    return { advanceDeduction, advanceCarriedOver: advancePaid - advanceDeduction };
};

module.exports = {
    WORKING_DAYS_PER_MONTH,
    PHONE_ALLOWANCE,
    INSURANCE_SALARY_BASE,
    BHXH_EMPLOYEE_RATE,
    BHXH_COMPANY_RATE,
    UNPAID_DAY_CASE_SQL,
    WORK_DAYS_SQL,
    prorateByEmployment,
    splitAdvance,
};
