/**
 * Thưởng cho tài khoản ĐÃ KHOÁ.
 *
 * Bug đã sửa: tài khoản chỉ được kiểm lúc TẠO phiếu. Phiếu tạo khi tài khoản còn hoạt động
 * (kế toán tạo chờ duyệt, hay thưởng Tết sinh hàng loạt) vẫn duyệt được sau khi tài khoản bị
 * khoá / tài xế nghỉ việc — rồi được cộng vào lương hoặc chi lẻ.
 *
 * Quy tắc sau khi sửa (bonusRepository.RECIPIENT_ELIGIBLE_SQL, kiểm ngay trong câu duyệt):
 *   - khoản thường (hiếu hỉ, sinh nhật, đặc biệt...): tài khoản phải đang hoạt động;
 *   - thưởng Tết năm Y: cùng điều kiện với previewTetBonuses — còn làm tới 31/12/Y.
 * Không duyệt được thì 409 kèm lý do, phiếu giữ nguyên 'pending' để manager từ chối.
 */
const assert = require('node:assert');
const { setupTestDb } = require('../helpers/testDb');

let pool;
let teardown;
let bonusService;
let bonusRepository;

const MANAGER = 1;
const ACCOUNTANT = 3;
const ACTIVE = 4;           // đang làm
const LOCKED = 5;           // bị khoá, không ghi ngày nghỉ việc
const QUIT_MID_YEAR = 6;    // làm tới 30/06/2025, đã khoá
const QUIT_AFTER_YEAR = 7;  // làm tới 15/01/2026, đã khoá → vẫn đủ năm 2025

const insertPending = async (driverId, type, year = 2025) => {
    const { rows: [row] } = await pool.query(
        `INSERT INTO driver_bonuses (driver_id, type, year, amount, status, requested_by)
         VALUES ($1, $2, $3, 500000, 'pending', $4) RETURNING id`,
        [driverId, type, year, ACCOUNTANT],
    );
    return row.id;
};

const statusOf = async (id) =>
    (await pool.query('SELECT status FROM driver_bonuses WHERE id = $1', [id])).rows[0].status;

beforeAll(async () => {
    ({ pool, teardown } = await setupTestDb());
    bonusService = require('../../services/bonusService');
    bonusRepository = require('../../repositories/bonusRepository');

    await pool.query(`
        TRUNCATE financial_transactions, driver_bonuses, drivers, profiles, roles, accounts
        RESTART IDENTITY CASCADE
    `);
    await pool.query(`INSERT INTO roles (id, name) VALUES (1,'manager'),(2,'coordinator'),(3,'accountant'),(4,'driver')`);
    await pool.query(`
        INSERT INTO accounts (id, email, password_hash, role_id, is_active) VALUES
        (1,'m@t.com','h',1,TRUE), (3,'kt@t.com','h',3,TRUE),
        (4,'d4@t.com','h',4,TRUE), (5,'d5@t.com','h',4,FALSE),
        (6,'d6@t.com','h',4,FALSE), (7,'d7@t.com','h',4,FALSE)
    `);
    await pool.query(`
        INSERT INTO profiles (id, full_name, role_id) VALUES
        (1,'Manager',1), (3,'Ke Toan',3),
        (4,'Tai Dang Lam',4), (5,'Tai Bi Khoa',4), (6,'Tai Nghi Giua Nam',4), (7,'Tai Nghi Sau Tet',4)
    `);
    await pool.query(`
        INSERT INTO drivers (profile_id, license_number, hire_date, termination_date) VALUES
        (4,'L4','2023-01-01',NULL), (5,'L5','2023-01-01',NULL),
        (6,'L6','2023-01-01','2025-06-30'), (7,'L7','2023-01-01','2026-01-15')
    `);
});

afterAll(async () => {
    await teardown();
});

describe('Thưởng — tài khoản đã khoá không được duyệt thưởng', () => {
    it('kế toán tạo phiếu khi tài còn làm, tài bị khoá, manager duyệt → 409, phiếu vẫn chờ duyệt', async () => {
        await pool.query('UPDATE accounts SET is_active = TRUE WHERE id = $1', [LOCKED]);
        const bonus = await bonusService.createWelfare(
            { driver_id: LOCKED, type: 'special', amount: 300000 }, ACCOUNTANT, 'accountant',
        );
        assert.strictEqual(bonus.status, 'pending');

        await pool.query('UPDATE accounts SET is_active = FALSE WHERE id = $1', [LOCKED]);

        await assert.rejects(
            () => bonusService.approve(bonus.id, MANAGER, null),
            (err) => {
                assert.strictEqual(err.status, 409);
                assert.match(err.message, /Tài khoản của Tai Bi Khoa đã bị khoá/);
                return true;
            },
        );
        assert.strictEqual(await statusOf(bonus.id), 'pending');

        // Manager vẫn phải dọn được phiếu treo.
        const rejected = await bonusService.reject(bonus.id, MANAGER, 'Tài khoản đã khoá');
        assert.strictEqual(rejected.status, 'rejected');
    });

    it('manager tạo thẳng cho tài khoản đã khoá → bị chặn ngay lúc tạo, không sinh phiếu', async () => {
        await assert.rejects(
            () => bonusService.createWelfare({ driver_id: LOCKED, type: 'welfare_birthday' }, MANAGER, 'manager'),
            { message: `Nhân viên #${LOCKED} không tồn tại hoặc đã bị khóa` },
        );
        const { rows } = await pool.query(
            "SELECT 1 FROM driver_bonuses WHERE driver_id = $1 AND type = 'welfare_birthday'", [LOCKED],
        );
        assert.strictEqual(rows.length, 0);
    });

    it('tài đã nghỉ việc: khoản thường không duyệt được dù đã nghỉ sau 31/12', async () => {
        const id = await insertPending(QUIT_AFTER_YEAR, 'welfare_wedding');
        await assert.rejects(() => bonusRepository.approve(id, MANAGER, null), { status: 409 });
        assert.strictEqual(await statusOf(id), 'pending');
    });

    it('tài đang làm: vẫn duyệt được, kể cả khi manager sửa số tiền', async () => {
        const id = await insertPending(ACTIVE, 'special');
        const approved = await bonusRepository.approve(id, MANAGER, 750000);
        assert.strictEqual(approved.status, 'approved');
        assert.strictEqual(Number(approved.amount), 750000);
    });

    it('thưởng Tết 2025: duyệt theo đúng điều kiện của bảng xem trước', async () => {
        const preview = await bonusRepository.previewTetBonuses(2025);
        assert.deepStrictEqual(preview.map((p) => p.driver_id).sort(), [ACTIVE, QUIT_AFTER_YEAR]);

        for (const driverId of [ACTIVE, QUIT_AFTER_YEAR]) {
            const id = await insertPending(driverId, 'tet_annual');
            assert.strictEqual((await bonusRepository.approve(id, MANAGER, null)).status, 'approved');
        }
        for (const driverId of [LOCKED, QUIT_MID_YEAR]) {
            const id = await insertPending(driverId, 'tet_annual');
            await assert.rejects(
                () => bonusRepository.approve(id, MANAGER, null),
                (err) => {
                    assert.strictEqual(err.status, 409);
                    assert.match(err.message, /không còn đủ điều kiện nhận thưởng Tết 2025/);
                    return true;
                },
            );
            assert.strictEqual(await statusOf(id), 'pending');
        }
    });

    it('phiếu không còn chờ duyệt: giữ thông báo trạng thái cũ, không nhầm thành lỗi tài khoản', async () => {
        const id = await insertPending(ACTIVE, 'special');
        await pool.query("UPDATE driver_bonuses SET status = 'paid' WHERE id = $1", [id]);
        await assert.rejects(
            () => bonusRepository.approve(id, MANAGER, null),
            { message: 'Không tìm thấy hoặc trạng thái không hợp lệ (cần pending)' },
        );
    });
});
