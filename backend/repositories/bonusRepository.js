const pool = require('../config/database');
const financialLedgerRepository = require('./financialLedgerRepository');

const BONUS_TYPES    = ['tet_annual', 'welfare_wedding', 'welfare_funeral', 'welfare_birthday', 'holiday_overtime', 'special'];
const BONUS_STATUSES = ['pending', 'approved', 'rejected', 'paid'];

// ─── Tet bonus helpers ────────────────────────────────────────────────────────

/**
 * Tính thưởng Tết cho 1 driver dựa trên hire_date và số ngày nghỉ không lương theo tháng.
 *
 * Công thức (PDF Điều II §6):
 *   months_incomplete < 3  → 1.000.000 × months_full   (max 12.000.000)
 *   months_incomplete 3-5  → 500.000   × months_in_range (max  6.000.000)
 *   months_incomplete ≥ 6  → 0
 *
 * Thưởng thâm niên: 2.000.000 nếu hire_date + 1 năm ≤ 31/12/year
 */
const _calcTet = (driverId, hireDate, year, unpaidByMonth) => {
    const hire      = new Date(hireDate);
    const fromMonth = hire.getFullYear() === year ? hire.getMonth() : 0; // 0-indexed
    const toMonth   = 11;
    const monthsInRange = toMonth - fromMonth + 1;

    let monthsFull = 0;
    for (let m = fromMonth; m <= toMonth; m++) {
        if (!unpaidByMonth[m + 1]) monthsFull++; // unpaidByMonth is 1-indexed
    }
    const monthsIncomplete = monthsInRange - monthsFull;

    // Thưởng thâm niên: làm liên tục > 1 năm tính đến cuối năm
    const oneYearMark = new Date(hire);
    oneYearMark.setFullYear(oneYearMark.getFullYear() + 1);
    const seniorityBonus = oneYearMark <= new Date(year, 11, 31) ? 2_000_000 : 0;

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
    const { rows: drivers } = await pool.query(
        `SELECT d.profile_id AS driver_id, d.hire_date,
                p.full_name, p.phone,
                vg.name AS vehicle_group
         FROM drivers d
         JOIN profiles p ON p.id = d.profile_id
         LEFT JOIN vehicles v ON v.id = d.vehicle_id
         LEFT JOIN vehicle_groups vg ON vg.id = v.vehicle_group_id
         ORDER BY p.full_name`,
    );
    if (!drivers.length) return [];

    const driverIds = drivers.map((d) => d.driver_id);

    const { rows: leaveRows } = await pool.query(
        `SELECT driver_id,
                EXTRACT(MONTH FROM leave_date)::int AS month,
                COUNT(*) AS cnt
         FROM leave_requests
         WHERE driver_id = ANY($1)
           AND EXTRACT(YEAR FROM leave_date) = $2
           AND leave_type = 'unpaid'
           AND status     = 'approved'
         GROUP BY driver_id, EXTRACT(MONTH FROM leave_date)`,
        [driverIds, year],
    );

    const leaveMap = {};
    for (const r of leaveRows) {
        if (!leaveMap[r.driver_id]) leaveMap[r.driver_id] = {};
        leaveMap[r.driver_id][r.month] = Number(r.cnt);
    }

    // Load existing tet records for this year (to flag already-generated)
    const { rows: existing } = await pool.query(
        `SELECT driver_id FROM driver_bonuses WHERE type = 'tet_annual' AND year = $1`,
        [year],
    );
    const alreadyGenerated = new Set(existing.map((r) => r.driver_id));

    return drivers.map((d) => {
        const calc = _calcTet(d.driver_id, d.hire_date, year, leaveMap[d.driver_id] || {});
        return {
            ...calc,
            full_name:       d.full_name,
            phone:           d.phone,
            vehicle_group:   d.vehicle_group,
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
    LEFT JOIN vehicles v    ON v.id = d.vehicle_id
    LEFT JOIN vehicle_groups vg ON vg.id = v.vehicle_group_id
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
    const { rows: [row] } = await pool.query(
        `UPDATE driver_bonuses
         SET status = 'approved', approved_by = $2, approved_at = NOW(), updated_at = NOW()${amountClause}
         WHERE id = $1 AND status = 'pending'
         RETURNING id`,
        params,
    );
    if (!row) throw new Error('Không tìm thấy hoặc trạng thái không hợp lệ (cần pending)');
    return getById(id);
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
