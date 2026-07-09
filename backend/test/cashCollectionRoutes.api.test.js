const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const request = require('supertest');
const { setupTestDb } = require('./helpers/testDb');
const { signAccessToken } = require('./helpers/authToken');
const { installCloudinaryMock } = require('./helpers/cloudinaryMock');

let pool;
let teardown;
let app;
let driverToken;
let coordinatorToken;
let uninstallCloudinaryMock;

// NOTE ON THIS WHOLE FILE:
// cashCollectionRepository.js (backend/repositories/cashCollectionRepository.js) queries a
// `cash_collections` table (and joins order_shipments/orders on cc.shipment_id) that does NOT
// exist in the real schema — `DB script/DB script.sql` has no CREATE TABLE cash_collections
// statement (grep confirms zero matches). The actual driver cash-collection flow implemented
// against the real schema is `shipment_receipts` + `record-collection` (see debtRoutes.js /
// receiptRoutes and CLAUDE.md section 14/15). This confirms what
// backend/test/cashCollection/cashCollectionService.test.js already documents at L1 (it only
// exercises the service against a *mocked* repo, never against a real DB) — cashCollectionRoutes
// is orphaned/dead code that 500s against the real database. These L3 tests assert that current,
// broken-but-real behavior rather than pretending the endpoints work.
describe('Cash Collection Routes API Tests (L3)', () => {
    before(async () => {
        process.env.JWT_SECRET = process.env.JWT_SECRET || 'TEST_SECRET';
        uninstallCloudinaryMock = installCloudinaryMock();
        ({ pool, teardown } = await setupTestDb());

        const cashCollectionRoutes = require('../routes/cashCollectionRoutes');
        app = express();
        app.use(express.json());
        app.use('/api/cash-collections', cashCollectionRoutes);

        driverToken = signAccessToken({ userId: 1, email: 'driver@test.com', role: 'driver' });
        coordinatorToken = signAccessToken({ userId: 2, email: 'coord@test.com', role: 'coordinator' });
    });

    after(async () => {
        await teardown();
        uninstallCloudinaryMock();
    });

    beforeEach(async () => {
        await pool.query('TRUNCATE profiles, roles, accounts RESTART IDENTITY CASCADE');
        await pool.query(`INSERT INTO roles (id, name) VALUES (2, 'driver'), (3, 'coordinator') ON CONFLICT DO NOTHING`);
        await pool.query(`
            INSERT INTO accounts (id, email, password_hash, role_id, is_active) VALUES
            (1, 'driver@test.com', 'hash', 2, true),
            (2, 'coord@test.com', 'hash', 3, true)
        `);
        await pool.query(`
            INSERT INTO profiles (id, full_name, role_id) VALUES
            (1, 'Driver One', 2),
            (2, 'Coordinator One', 3)
        `);
    });

    describe('GET /api/cash-collections/me', () => {
        it('without a token -> 403', async () => {
            const res = await request(app).get('/api/cash-collections/me');
            assert.strictEqual(res.status, 403);
        });

        it('as a coordinator -> 403 (driver only)', async () => {
            const res = await request(app).get('/api/cash-collections/me').set('Authorization', `Bearer ${coordinatorToken}`);
            assert.strictEqual(res.status, 403);
        });

        it('as a driver -> 500 because cash_collections table does not exist in the real schema', async () => {
            const res = await request(app).get('/api/cash-collections/me').set('Authorization', `Bearer ${driverToken}`);
            assert.strictEqual(res.status, 500);
            assert.match(res.body.error, /relation "cash_collections" does not exist/);
        });
    });

    describe('GET /api/cash-collections/summary', () => {
        it('without a token -> 403', async () => {
            const res = await request(app).get('/api/cash-collections/summary');
            assert.strictEqual(res.status, 403);
        });

        it('as a driver -> 500 because cash_collections table does not exist in the real schema', async () => {
            const res = await request(app).get('/api/cash-collections/summary').set('Authorization', `Bearer ${driverToken}`);
            assert.strictEqual(res.status, 500);
            assert.match(res.body.error, /relation "cash_collections" does not exist/);
        });
    });

    describe('GET /api/cash-collections/:id', () => {
        it('without a token -> 403', async () => {
            const res = await request(app).get('/api/cash-collections/1');
            assert.strictEqual(res.status, 403);
        });

        it('with an invalid (non-numeric) id -> 400 before ever touching the DB', async () => {
            const res = await request(app).get('/api/cash-collections/abc').set('Authorization', `Bearer ${driverToken}`);
            assert.strictEqual(res.status, 400);
            assert.strictEqual(res.body.error, 'ID không hợp lệ');
        });

        it('with a numeric id as a driver -> 500 because cash_collections table does not exist', async () => {
            const res = await request(app).get('/api/cash-collections/1').set('Authorization', `Bearer ${driverToken}`);
            assert.strictEqual(res.status, 500);
            assert.match(res.body.error, /relation "cash_collections" does not exist/);
        });
    });

    describe('POST /api/cash-collections', () => {
        it('without a token -> 403', async () => {
            const res = await request(app).post('/api/cash-collections');
            assert.strictEqual(res.status, 403);
        });

        it('without an amount -> 400 (validated before hitting the DB)', async () => {
            const res = await request(app)
                .post('/api/cash-collections')
                .set('Authorization', `Bearer ${driverToken}`)
                .attach('receipt', Buffer.from('fake-image-bytes'), { filename: 'receipt.jpg', contentType: 'image/jpeg' });
            assert.strictEqual(res.status, 400);
            assert.strictEqual(res.body.error, 'Số tiền là bắt buộc');
        });

        it('without a receipt file -> 400 (BR-018 evidence requirement, validated before hitting the DB)', async () => {
            const res = await request(app)
                .post('/api/cash-collections')
                .set('Authorization', `Bearer ${driverToken}`)
                .field('amount', '300000');
            assert.strictEqual(res.status, 400);
            assert.strictEqual(res.body.error, 'Ảnh biên lai là bắt buộc (BR-018)');
        });

        it('with amount and receipt -> 400 because cash_collections table does not exist (createCollection catches all errors as 400)', async () => {
            const res = await request(app)
                .post('/api/cash-collections')
                .set('Authorization', `Bearer ${driverToken}`)
                .field('amount', '300000')
                .attach('receipt', Buffer.from('fake-image-bytes'), { filename: 'receipt.jpg', contentType: 'image/jpeg' });
            assert.strictEqual(res.status, 400);
            assert.match(res.body.error, /relation "cash_collections" does not exist/);
        });
    });
});
