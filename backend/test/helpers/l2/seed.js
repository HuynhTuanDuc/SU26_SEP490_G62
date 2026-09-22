/**
 * Seed dữ liệu tối thiểu cho test L2 — tương ứng "Minimum Test Accounts / Minimum
 * Domain Data" mà Test Plan §3.2 yêu cầu, và là cột "Given (Precondition + Seed Data)"
 * trong biểu mẫu 5.2.
 *
 * Token ký thẳng bằng jsonwebtoken với đúng payload mà authService.signAccessToken tạo
 * ra ({ userId, email, role, tokenType: 'access' }). Đây là chủ ý: L2 đo chuỗi
 * controller → service → repository → DB, không phải đo lại luồng đăng nhập (đã có
 * test riêng, và có TC-INT-AuthController-* đi qua endpoint thật).
 */
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getPool } = require('./testDb');

const PASSWORD = 'MatKhau@123';
let HASH = null;

const bam = () => {
    if (!HASH) HASH = bcrypt.hashSync(PASSWORD, 4);
    return HASH;
};

const layRoleId = async (ten) => {
    const { rows } = await getPool().query('SELECT id FROM roles WHERE name = $1', [ten]);
    if (!rows[0]) throw new Error(`Chưa có role "${ten}" trong DB test`);
    return rows[0].id;
};

/** Tạo 1 tài khoản + hồ sơ, trả về { id, email, role, token } */
const createUser = async ({ role, email = null, fullName = null, phone = null, isActive = true }) => {
    const roleId = await layRoleId(role);
    const { rows } = await getPool().query(
        `INSERT INTO accounts (email, password_hash, role_id, is_active)
         VALUES ($1, $2, $3, $4) RETURNING id, email`,
        [email, bam(), roleId, isActive],
    );
    const account = rows[0];

    await getPool().query(
        `INSERT INTO profiles (id, full_name, phone, role_id) VALUES ($1, $2, $3, $4)`,
        [account.id, fullName ?? `${role} ${account.id}`, phone, roleId],
    );

    return {
        id: account.id,
        email: account.email,
        role,
        password: PASSWORD,
        token: signToken({ id: account.id, email: account.email, role }),
    };
};

const signToken = ({ id, email, role }) => jwt.sign(
    { userId: id, email, role, tokenType: 'access' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' },
);

/** Bộ tài khoản chuẩn dùng lại ở hầu hết ca test */
const seedStandardAccounts = async () => ({
    driver: await createUser({ role: 'driver', email: 'driver1@l2.test', fullName: 'Tài Xế Một', phone: '0901000001' }),
    driver2: await createUser({ role: 'driver', email: 'driver2@l2.test', fullName: 'Tài Xế Hai', phone: '0901000002' }),
    coordinator: await createUser({ role: 'coordinator', email: 'coord@l2.test', fullName: 'Điều Phối' }),
    accountant: await createUser({ role: 'accountant', email: 'acc@l2.test', fullName: 'Kế Toán' }),
    manager: await createUser({ role: 'manager', email: 'mgr@l2.test', fullName: 'Quản Lý' }),
});

/** Nhóm xe + xe, gán tài xế nếu truyền driverId */
const createVehicleGroupWithVehicle = async ({ groupName = '5m2', pricePerKm = 12000, plate = '51C-100.01', driverId = null } = {}) => {
    const { rows: g } = await getPool().query(
        `INSERT INTO vehicle_groups (name, price_per_km) VALUES ($1, $2) RETURNING id`,
        [groupName, pricePerKm],
    );
    const groupId = g[0].id;

    const { rows: v } = await getPool().query(
        `INSERT INTO vehicles (plate_number, vehicle_group_id, assigned_driver_id, status)
         VALUES ($1, $2, $3, 'active') RETURNING id`,
        [plate, groupId, driverId],
    );

    if (driverId) {
        await getPool().query(
            `INSERT INTO drivers (profile_id, vehicle_id, default_vehicle_group_id, license_number, hire_date)
             VALUES ($1, $2, $3, $4, CURRENT_DATE - 365)
             ON CONFLICT (profile_id) DO UPDATE SET vehicle_id = EXCLUDED.vehicle_id`,
            [driverId, v[0].id, groupId, `GPLX-${driverId}`],
        );
    }

    return { groupId, vehicleId: v[0].id };
};

const auth = (token) => ['Authorization', `Bearer ${token}`];

module.exports = { createUser, seedStandardAccounts, createVehicleGroupWithVehicle, signToken, auth, PASSWORD };
