const pool = require('../config/database');
const financialLedgerRepository = require('./financialLedgerRepository');
const { UNPAID_DAY_CASE_SQL } = require('../constants/payrollConstants');

const BONUS_TYPES    = ['tet_annual', 'welfare_wedding', 'welfare_funeral', 'welfare_birthday', 'holiday_overtime', 'special'];
const BONUS_STATUSES = ['pending', 'approved', 'rejected', 'paid'];

// ─── Ai còn được nhận thưởng ──────────────────────────────────────────────────
//
// Kiểm ở CẢ bước tạo lẫn bước duyệt. Trước đây chỉ kiểm lúc tạo, nên phiếu tạo khi tài
// khoản còn hoạt động (kế toán tạo chờ duyệt, hay thưởng Tết sinh hàng loạt) vẫn duyệt
// được sau khi tài khoản đã bị khoá / tài xế đã nghỉ việc.
//
// Thưởng Tết năm Y (alias `a` = accounts, `d` = drivers): chỉ tài xế CÒN LÀM tới hết năm:
//  • vào làm sau 31/12 → chưa làm ngày nào trong năm. Trước đây vẫn được xét đủ 12
//    tháng (không có ngày nghỉ nào được ghi) và ăn trọn 12.000.000;
//  • có ngày nghỉ việc trước 31/12 → không có thưởng Tết năm đó;
//  • tài khoản đã khoá mà không ghi ngày nghỉ việc → không biết còn làm tới đâu, loại ra
//    như mọi khoản phúc lợi khác (chỉ áp cho nhân viên đang hoạt động). Khoá sau khi
//    nghỉ việc từ 31/12 trở đi thì vẫn được xét.
const TET_ELIGIBLE_SQL = (yearSql) => `(
    d.hire_date <= make_date(${yearSql}, 12, 31)
    AND (d.termination_date IS NULL OR d.termination_date >= make_date(${yearSql}, 12, 31))
    AND (a.is_active = TRUE OR d.termination_date IS NOT NULL)
)`;

// Người nhận của phiếu `alias` còn đủ điều kiện: thưởng Tết theo quy tắc trên, mọi khoản
// khác (hiếu hỉ, sinh nhật, đặc biệt...) thì tài khoản phải đang hoạt động.
const RECIPIENT_ELIGIBLE_SQL = (alias) => `EXISTS (
    SELECT 1
    FROM accounts a
    LEFT JOIN drivers d ON d.profile_id = a.id
    WHERE a.id = ${alias}.driver_id
      AND (
            (${alias}.type <> 'tet_annual' AND a.is_active = TRUE)
         OR (${alias}.type =  'tet_annual' AND ${TET_ELIGIBLE_SQL(`${alias}.year`)})
      )
)`;

// ─── Tet bonus helpers ────────────────────────────────────────────────────────

/**
 * Tính thưởng Tết cho 1 driver dựa trên ngày vào làm và số công không lương theo tháng.
 * "Tháng đủ 28 công" dùng cùng định nghĩa với tính lương: vắng không vượt quá phần dư
 * ngày lịch so với quota 28 thì vẫn tính là đủ công (xem accountantPayrollRepository).
 *
 * Công thức (PDF Điều II §6):
 *   months_incomplete < 3  → 1.000.000 × months_full   (max 12.000.000)
 *   months_incomplete 3-5  → 500.000   × months_in_range (max  6.000.000)
 *   months_incomplete ≥ 6  → 0
 *
 * Tháng được xét chuyên cần (months_in_range) = các tháng làm TRỌN trong năm: tháng vào
 * làm chỉ được xét nếu vào làm đúng mùng 1. Trước đây tháng vào làm luôn được xét và gần
 * như luôn "đủ công" (không có ngày nghỉ nào được ghi trước ngày vào làm), nên tài vào làm
 * 28/12 vẫn ăn 1.000.000 cho tháng 12. Tháng làm dở cũng KHÔNG bị tính là tháng thiếu
 * công — vào làm giữa tháng không phải lỗi chuyên cần, không được đẩy tài xuống bậc 500.000.
 * (Tài nghỉ việc trong năm không có thưởng Tết — đã loại ở previewTetBonuses.)
 *
 * Thưởng thâm niên: 2.000.000 nếu hire_date + 1 năm ≤ 31/12/year, tức vào làm từ năm trước.
 *
 * hireDate: chuỗi 'YYYY-MM-DD' (không qua Date để khỏi lệch múi giờ).
 * unpaidByMonth: { [tháng 1-12]: số công không lương } — cùng quy tắc với bảng lương.
 */
const _calcTet = (driverId, hireDate, year, unpaidByMonth) => {
    const [hy, hm, hd] = String(hireDate).slice(0, 10).split('-').map(Number);
    let firstMonth;
    if (hy < year)        firstMonth = 1;
    else if (hy === year) firstMonth = hd === 1 ? hm : hm + 1;
    else                  firstMonth = 13; // vào làm sau năm tính thưởng — không có tháng nào
    const monthsInRange = Math.max(0, 12 - firstMonth + 1);

    let monthsFull = 0;
    for (let m = firstMonth; m <= 12; m++) {
        // "đủ 28 công" khớp đúng định nghĩa dùng trong tính lương: tháng dài hơn 28 ngày
        // lịch có phần dư được miễn trừ tự nhiên, chỉ vắng NHIỀU HƠN phần dư đó mới tính
        // là thiếu công (accountantPayrollRepository._calcDriverPayroll dùng cùng công thức).
        const daysInMonth  = new Date(year, m, 0).getDate();
        const allowedSlack = Math.max(0, daysInMonth - 28);
        const unpaidDays   = Number(unpaidByMonth[m] || 0);
        if (unpaidDays <= allowedSlack) monthsFull++;
    }
    const monthsIncomplete = monthsInRange - monthsFull;

    // Thưởng thâm niên: làm liên tục > 1 năm tính đến cuối năm
    const seniorityBonus = hy < year ? 2_000_000 : 0;

    // Thưởng chuyên cần
    let attendanceBonus;
    if (monthsIncomplete >= 6) {
        attendanceBonus = 0;
    } else if (monthsIncomplete >= 3) {
        attendanceBonus = Math.min(monthsInRange * 500_000, 6_000_000);
    } else {
        attendanceBonus = Math.min(monthsFull * 1_000_000, 12_000_000);
    }

    return {
        driver_id:               driverId,
        months_full_count:       monthsFull,
        months_incomplete_count: monthsIncomplete,
        seniority_bonus:         seniorityBonus,
        attendance_bonus:        attendanceBonus,
        total:                   seniorityBonus + attendanceBonus,
    };
};

const previewTetBonuses = async (year) => {
    const y = Number(year);
    // Chỉ xét tài xế CÒN LÀM tới hết năm tính thưởng — cùng quy tắc bước duyệt dùng lại
    // (TET_ELIGIBLE_SQL), để phiếu đã sinh không duyệt được khi tài xế hết đủ điều kiện.
    const { rows: drivers } = await pool.query(
        `SELECT d.profile_id AS driver_id,
                to_char(d.hire_date, 'YYYY-MM-DD') AS hire_date,
                p.full_name, p.phone,
                vg.name AS vehicle_group
         FROM drivers d
         JOIN profiles p ON p.id = d.profile_id
         JOIN accounts a ON a.id = d.profile_id
         -- Nhóm CỐ ĐỊNH (biên chế), không phải nhóm của xe đang cầm — để nhãn nhóm
         -- ở màn Thưởng khớp với màn KPI và Bảng lương.
         LEFT JOIN vehicle_groups vg ON vg.id = d.default_vehicle_group_id
         WHERE ${TET_ELIGIBLE_SQL('$1::int')}
         ORDER BY p.full_name`,
        [y],
    );
    if (!drivers.length) return [];

    const driverIds = drivers.map((d) => d.driver_id);

    // Công không lương theo tháng — CÙNG quy tắc với bảng lương (UNPAID_DAY_CASE_SQL):
    // khử trùng theo ngày (đơn nghỉ + chấm vắng cùng ngày chỉ trừ 1 công), chấm công thắng
    // đơn nghỉ, nửa công trừ 0.5, ngày lễ miễn trừ. Trước đây đếm riêng ở đây và lệch bảng
    // lương ở cả bốn điểm đó — một tháng bảng lương coi là đủ công vẫn có thể bị thưởng Tết
    // coi là thiếu công, và ngược lại.
    const { rows: unpaidRows } = await pool.query(
        `WITH cand AS (
            SELECT ao2.driver_id, ao2.work_date AS d
            FROM attendance_overrides ao2
            WHERE ao2.driver_id = ANY($1)
              AND ao2.status IN ('absent_unexcused', 'half_day')
              AND ao2.work_date BETWEEN make_date($2::int, 1, 1) AND make_date($2::int, 12, 31)
            UNION
            SELECT lr2.driver_id, lr2.leave_date
            FROM leave_requests lr2
            WHERE lr2.driver_id = ANY($1)
              AND lr2.leave_type = 'unpaid' AND lr2.status = 'approved'
              AND lr2.leave_date BETWEEN make_date($2::int, 1, 1) AND make_date($2::int, 12, 31)
        )
        SELECT cand.driver_id,
               EXTRACT(MONTH FROM cand.d)::int      AS month,
               SUM(${UNPAID_DAY_CASE_SQL})::numeric AS unpaid_days
        FROM cand
        LEFT JOIN attendance_overrides ao
               ON ao.driver_id = cand.driver_id AND ao.work_date = cand.d
        LEFT JOIN leave_requests lr
               ON lr.driver_id = cand.driver_id AND lr.leave_date = cand.d
              AND lr.leave_type = 'unpaid' AND lr.status = 'approved'
        WHERE NOT EXISTS (SELECT 1 FROM company_holidays h WHERE h.holiday_date = cand.d)
        GROUP BY cand.driver_id, EXTRACT(MONTH FROM cand.d)`,
        [driverIds, y],
    );

    const unpaidMap = {};
    for (const r of unpaidRows) {
        if (!unpaidMap[r.driver_id]) unpaidMap[r.driver_id] = {};
        unpaidMap[r.driver_id][r.month] = Number(r.unpaid_days);
    }

    // Load existing tet records for this year (to flag already-generated)
    const { rows: existing } = await pool.query(
        `SELECT driver_id FROM driver_bonuses WHERE type = 'tet_annual' AND year = $1`,
        [y],
    );
    const alreadyGenerated = new Set(existing.map((r) => r.driver_id));

    return drivers.map((d) => {
        const calc = _calcTet(d.driver_id, d.hire_date, y, unpaidMap[d.driver_id] || {});
        return {
            ...calc,
            full_name:       d.full_name,
            phone:           d.phone,
            vehicle_group:   d.vehicle_group,
            hire_date:       d.hire_date,
            already_exists:  alreadyGenerated.has(d.driver_id),
        };
    });
};

const generateTetBonuses = async (year, createdBy) => {
    const previews = await previewTetBonuses(year);
    const toInsert = previews.filter((p) => !p.already_exists);

    if (!toInsert.length) return { inserted: 0, skipped: previews.length };

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        let inserted = 0;
        for (const p of toInsert) {
            await client.query(
                `INSERT INTO driver_bonuses
                    (driver_id, type, year, amount,
                     months_full_count, months_incomplete_count,
                     seniority_bonus, attendance_bonus,
                     status, requested_by, created_at, updated_at)
                 VALUES ($1,'tet_annual',$2,$3,$4,$5,$6,$7,'pending',$8,NOW(),NOW())
                 ON CONFLICT DO NOTHING`,
                [p.driver_id, year, p.total,
                 p.months_full_count, p.months_incomplete_count,
                 p.seniority_bonus, p.attendance_bonus,
                 createdBy],
            );
            inserted++;
        }

        await client.query('COMMIT');
        return { inserted, skipped: previews.length - toInsert.length };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

// ─── Base SELECT ──────────────────────────────────────────────────────────────

const BASE = `
    SELECT
        db.id, db.driver_id, db.type, db.year, db.amount, db.notes,
        db.months_full_count, db.months_incomplete_count,
        db.seniority_bonus,   db.attendance_bonus,
        db.beneficiary_name,  db.beneficiary_relation, db.proof_url,
        db.status,            db.rejection_reason,
        db.requested_by,      db.approved_by,  db.paid_by,
        db.requested_at,      db.approved_at,  db.paid_at,
        db.created_at,        db.updated_at,
        p.full_name     AS driver_name,
        p.phone         AS driver_phone,
        vg.name         AS vehicle_group,
        req.full_name   AS requested_by_name,
        apr.full_name   AS approved_by_name,
        pai.full_name   AS paid_by_name
    FROM driver_bonuses db
    JOIN profiles p   ON p.id  = db.driver_id
    LEFT JOIN drivers d     ON d.profile_id = db.driver_id
    -- Nhóm CỐ ĐỊNH (biên chế) — xem chú thích ở getDriversForBonus
    LEFT JOIN vehicle_groups vg ON vg.id = d.default_vehicle_group_id
    LEFT JOIN profiles req  ON req.id = db.requested_by
    LEFT JOIN profiles apr  ON apr.id = db.approved_by
    LEFT JOIN profiles pai  ON pai.id = db.paid_by
`;

// ─── Queries ──────────────────────────────────────────────────────────────────

// sort resolved via allowlist, never interpolated directly from user input
const BONUS_SORTS = {
    oldest:        'db.created_at ASC',
    'amount-desc': 'db.amount DESC',
    'amount-asc':  'db.amount ASC',
};

const getAll = async ({ type, status, year, search, driverId, sort, page, limit } = {}) => {
    const conds  = [];
    const params = [];
    let   i      = 1;

    if (type)     { conds.push(`db.type = $${i++}`);      params.push(type);     }
    if (status)   { conds.push(`db.status = $${i++}`);    params.push(status);   }
    if (year)     { conds.push(`db.year = $${i++}`);      params.push(year);     }
    if (driverId) { conds.push(`db.driver_id = $${i++}`); params.push(driverId); }
    if (search)   {
        conds.push(`(p.full_name ILIKE $${i} OR p.phone ILIKE $${i})`);
        params.push(`%${search}%`);
        i++;
    }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const orderClause = BONUS_SORTS[sort] ?? 'db.created_at DESC';

    if (!limit) {
        const { rows } = await pool.query(`${BASE} ${where} ORDER BY ${orderClause}`, params);
        return rows;
    }

    const safeLimit  = Math.min(100, Math.max(1, Number(limit) || 20));
    const safePage   = Math.max(1, Number(page) || 1);
    const offset     = (safePage - 1) * safeLimit;

    const [{ rows }, { rows: countRows }] = await Promise.all([
        pool.query(`${BASE} ${where} ORDER BY ${orderClause} LIMIT $${i} OFFSET $${i + 1}`, [...params, safeLimit, offset]),
        pool.query(`SELECT COUNT(*)::int AS total FROM driver_bonuses db JOIN profiles p ON p.id = db.driver_id ${where}`, params),
    ]);

    return {
        rows,
        total: countRows[0]?.total ?? 0,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.max(1, Math.ceil((countRows[0]?.total ?? 0) / safeLimit)),
    };
};

const getById = async (id) => {
    const { rows } = await pool.query(`${BASE} WHERE db.id = $1`, [id]);
    return rows[0] ?? null;
};

const getByDriver = async (driverId) => {
    const { rows } = await pool.query(
        `${BASE} WHERE db.driver_id = $1 ORDER BY db.created_at DESC`,
        [driverId],
    );
    return rows;
};

const create = async ({
    driver_id, type, year, amount, notes,
    beneficiary_name, beneficiary_relation, proof_url,
}, createdBy) => {
    const { rows: [row] } = await pool.query(
        `INSERT INTO driver_bonuses
            (driver_id, type, year, amount, notes,
             beneficiary_name, beneficiary_relation, proof_url,
             status, requested_by, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,NOW(),NOW())
         RETURNING id`,
        [driver_id, type, year, amount, notes ?? null,
         beneficiary_name ?? null, beneficiary_relation ?? null, proof_url ?? null,
         createdBy],
    );
    return getById(row.id);
};

const approve = async (id, approvedBy, adjustedAmount) => {
    const params = [id, approvedBy];
    let amountClause = '';
    if (adjustedAmount != null) {
        params.push(Number(adjustedAmount));
        amountClause = `, amount = $${params.length}`;
    }
    // Điều kiện người nhận nằm NGAY trong câu UPDATE: kiểm riêng rồi mới ghi thì tài khoản
    // vẫn có thể bị khoá xen vào giữa hai câu.
    const { rows: [row] } = await pool.query(
        `UPDATE driver_bonuses db
         SET status = 'approved', approved_by = $2, approved_at = NOW(), updated_at = NOW()${amountClause}
         WHERE db.id = $1 AND db.status = 'pending'
           AND ${RECIPIENT_ELIGIBLE_SQL('db')}
         RETURNING db.id`,
        params,
    );
    if (!row) throw await _approveBlockedError(id);
    return getById(id);
};

// Không duyệt được thì nói rõ vì sao: phiếu không còn chờ duyệt, hay người nhận đã hết đủ
// điều kiện (manager cần biết để bấm Từ chối thay vì thử lại).
const _approveBlockedError = async (id) => {
    const { rows: [cur] } = await pool.query(
        `SELECT db.status, db.type, db.year, p.full_name
         FROM driver_bonuses db
         JOIN profiles p ON p.id = db.driver_id
         WHERE db.id = $1`,
        [id],
    );
    if (!cur || cur.status !== 'pending') {
        return new Error('Không tìm thấy hoặc trạng thái không hợp lệ (cần pending)');
    }
    const message = cur.type === 'tet_annual'
        ? `${cur.full_name} không còn đủ điều kiện nhận thưởng Tết ${cur.year} `
          + '(tài khoản đã bị khoá hoặc đã nghỉ việc trước 31/12). Hãy từ chối phiếu này.'
        : `Tài khoản của ${cur.full_name} đã bị khoá — không thể duyệt thưởng. Hãy từ chối phiếu này.`;
    return Object.assign(new Error(message), { status: 409 });
};

const reject = async (id, rejectedBy, reason) => {
    const { rows: [row] } = await pool.query(
        `UPDATE driver_bonuses
         SET status = 'rejected', approved_by = $2,
             rejection_reason = $3, approved_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND status = 'pending'
         RETURNING id`,
        [id, rejectedBy, reason],
    );
    if (!row) throw new Error('Không tìm thấy hoặc trạng thái không hợp lệ (cần pending)');
    return getById(id);
};

const pay = async (id, paidBy) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { rows: [row] } = await client.query(
            `UPDATE driver_bonuses
             SET status = 'paid', paid_by = $2, paid_at = NOW(), updated_at = NOW()
             WHERE id = $1 AND status = 'approved'
             RETURNING id, type, amount, driver_id`,
            [id, paidBy],
        );
        if (!row) throw new Error('Không tìm thấy hoặc trạng thái không hợp lệ (cần approved)');

        // Chi thưởng lẻ ngoài kỳ lương (tiền mặt) — phải vào nhật ký tài chính
        await financialLedgerRepository.insertTransaction(client, {
            eventType: 'bonus_paid',
            debitAccount: '642', creditAccount: '1111',
            amount: Number(row.amount),
            description: `Chi thưởng/phúc lợi ngoài kỳ lương (${row.type}) — phiếu thưởng #${row.id}, tài xế #${row.driver_id}`,
            refType: null, refId: null, actorId: paidBy,
        });

        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
    return getById(id);
};

const getStats = async (year) => {
    const { rows: [row] } = await pool.query(
        `SELECT
             COUNT(*)                                            AS total_count,
             COUNT(*) FILTER (WHERE status = 'pending')         AS pending_count,
             COUNT(*) FILTER (WHERE status = 'approved')        AS approved_count,
             COUNT(*) FILTER (WHERE status = 'paid')            AS paid_count,
             COUNT(*) FILTER (WHERE status = 'rejected')        AS rejected_count,
             COALESCE(SUM(amount) FILTER (WHERE status IN ('approved','paid')), 0) AS approved_total,
             COALESCE(SUM(amount) FILTER (WHERE status = 'paid'),               0) AS paid_total
         FROM driver_bonuses
         WHERE ($1::int IS NULL OR year = $1)`,
        [year ?? null],
    );
    return row;
};

// Danh sách người nhận thưởng cho dropdown "Tạo phúc lợi" — thưởng Tết/hiếu hỉ/sinh nhật/
// đặc biệt áp dụng cho MỌI nhân viên (không chỉ tài xế), khớp với driver_bonuses.driver_id
// vốn tham chiếu profiles(id) chung, không giới hạn role ở tầng schema.
const staffExists = async (profileId) => {
    const { rows } = await pool.query(
        `SELECT 1 FROM profiles p JOIN accounts a ON a.id = p.id WHERE p.id = $1 AND a.is_active = TRUE`,
        [profileId],
    );
    return rows.length > 0;
};

const getStaffLookup = async () => {
    const { rows } = await pool.query(
        `SELECT p.id, p.full_name, p.phone, r.name AS role
         FROM profiles p
         JOIN accounts a ON a.id = p.id
         JOIN roles r    ON r.id = p.role_id
         WHERE a.is_active = TRUE
         ORDER BY p.full_name ASC`
    );
    return rows;
};

module.exports = {
    BONUS_TYPES,
    BONUS_STATUSES,
    previewTetBonuses,
    generateTetBonuses,
    _calcTet, // hàm thuần — xuất để unit test các quy tắc thưởng Tết
    getAll,
    getById,
    getByDriver,
    create,
    approve,
    reject,
    pay,
    getStats,
    getStaffLookup,
    staffExists,
};
