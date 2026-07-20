const assert = require('node:assert');
const request = require('supertest');

/**
 * Shared fixture: mật khẩu thật (không phải chuỗi 'hash' giả) dùng để seed accounts trong
 * các test API — cho phép các luồng API thực sự đăng nhập qua POST /auth/login (luồng
 * chức năng "Đăng nhập") thay vì ký JWT tắt, đúng tinh thần "đăng nhập là bước con của
 * mọi luồng nghiệp vụ".
 */
const TEST_PASSWORD = 'Test@12345';
const TEST_PASSWORD_HASH = '$2a$10$zZ0TfcouYmiyJBqyf4W2L.UAn28kwvCrhru/5rM2FRm.Cvb3RNeaK';

/** Đăng nhập thật qua HTTP — trả về access token để dùng cho các request tiếp theo. */
async function loginAs(app, email, password = TEST_PASSWORD) {
    const res = await request(app).post('/auth/login').send({ email, password });
    assert.strictEqual(res.status, 200, `login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.token;
}

module.exports = { TEST_PASSWORD, TEST_PASSWORD_HASH, loginAs };
