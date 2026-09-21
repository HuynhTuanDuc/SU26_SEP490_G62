const request = require('supertest');
const { startTestDb, stopTestDb, resetData, getPool } = require('../helpers/l2/testDb');
const { buildTestApp } = require('../helpers/l2/testApp');
const { seedStandardAccounts, createVehicleGroupWithVehicle } = require('../helpers/l2/seed');
const domain = require('../helpers/l2/domain');

jest.mock('@google/generative-ai', () => require('../helpers/aiSdkStub'), { virtual: true });
jest.mock('@anthropic-ai/sdk', () => require('../helpers/aiSdkStub'), { virtual: true });

const TEST_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

const setupL2Suite = () => {
    const ctx = { app: null };

    beforeAll(async () => {
        await startTestDb();
        ctx.app = buildTestApp();
    });

    beforeEach(async () => {
        await resetData();
    });

    afterAll(async () => {
        await stopTestDb();
    });

    return ctx;
};

const authHeader = (token) => ({ Authorization: `Bearer ${token}` });

const api = (app) => request(app);

const attachImage = (req, field = 'receipt', filename = `${field}.jpg`) =>
    req.attach(field, TEST_JPEG, { filename, contentType: 'image/jpeg' });

const seedDriverWorld = async () => {
    const accounts = await seedStandardAccounts();
    const driverVehicle = await createVehicleGroupWithVehicle({
        groupName: '5m2',
        plate: '51C-100.01',
        driverId: accounts.driver.id,
    });
    const driver2Vehicle = await createVehicleGroupWithVehicle({
        groupName: '7m4',
        plate: '51C-100.02',
        driverId: accounts.driver2.id,
    });

    return {
        accounts,
        driverVehicle,
        driver2Vehicle,
        pool: getPool(),
    };
};

const setAccountActive = async (accountId, isActive) => {
    await getPool().query('UPDATE accounts SET is_active = $2 WHERE id = $1', [accountId, isActive]);
};

const getRoleName = async (userId) => {
    const { rows } = await getPool().query(
        `SELECT r.name
           FROM accounts a
           JOIN roles r ON r.id = a.role_id
          WHERE a.id = $1`,
        [userId],
    );
    return rows[0]?.name ?? null;
};

const getNotificationsForUsers = async (userIds, type = null) => {
    const params = [userIds];
    let where = 'WHERE user_id = ANY($1)';
    if (type) {
        params.push(type);
        where += ` AND type = $${params.length}`;
    }

    const { rows } = await getPool().query(
        `SELECT user_id, title, body, type, entity_id
           FROM notifications
           ${where}
          ORDER BY id`,
        params,
    );
    return rows;
};

const insertLeaveRequest = async ({ driverId, leaveDate, leaveType = 'paid', reason = 'Xin nghi qua han', status = 'approved' }) => {
    const { rows } = await getPool().query(
        `INSERT INTO leave_requests (driver_id, leave_date, leave_type, reason, status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [driverId, leaveDate, leaveType, reason, status],
    );
    return rows[0];
};

const insertDriverDebt = async ({ driverId, orderId = null, shipmentId = null, totalAmount = 350000, dueDate }) => {
    const { rows } = await getPool().query(
        `INSERT INTO debts (debt_type, driver_id, order_id, shipment_id, total_amount, due_date, notes, created_at, updated_at)
         VALUES ('driver', $1, $2, $3, $4, $5, 'Qua han test', NOW(), NOW())
         RETURNING *`,
        [driverId, orderId, shipmentId, totalAmount, dueDate],
    );
    return rows[0];
};

const insertNotification = async ({
    userId,
    title = 'Thong bao test',
    body = 'Noi dung test',
    type = 'SYSTEM_ALERT',
    entityType = null,
    entityId = null,
    isRead = false,
}) => {
    const { rows } = await getPool().query(
        `INSERT INTO notifications (user_id, title, body, type, entity_type, entity_id, is_read)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [userId, title, body, type, entityType, entityId, isRead],
    );
    return rows[0];
};

const upsertCompanyInfo = async ({
    companyName = 'LogisCount Test Co',
    hotline = '19001234',
    bankName = 'Vietcombank',
    bankAccountNumber = '123456789',
    bankAccountName = 'LOGISCOUNT TEST',
    bankQrUrl = null,
    updatedBy = null,
}) => {
    const { rows } = await getPool().query(
        `INSERT INTO company_info
             (id, company_name, hotline, bank_name, bank_account_number, bank_account_name, bank_qr_url, updated_at, updated_by)
         VALUES (1, $1, $2, $3, $4, $5, $6, NOW(), $7)
         ON CONFLICT (id) DO UPDATE SET
             company_name = EXCLUDED.company_name,
             hotline = EXCLUDED.hotline,
             bank_name = EXCLUDED.bank_name,
             bank_account_number = EXCLUDED.bank_account_number,
             bank_account_name = EXCLUDED.bank_account_name,
             bank_qr_url = EXCLUDED.bank_qr_url,
             updated_at = NOW(),
             updated_by = EXCLUDED.updated_by
         RETURNING *`,
        [companyName, hotline, bankName, bankAccountNumber, bankAccountName, bankQrUrl, updatedBy],
    );
    return rows[0];
};

module.exports = {
    api,
    attachImage,
    authHeader,
    domain,
    getNotificationsForUsers,
    getPool,
    getRoleName,
    insertNotification,
    insertDriverDebt,
    insertLeaveRequest,
    seedDriverWorld,
    setAccountActive,
    setupL2Suite,
    upsertCompanyInfo,
};
