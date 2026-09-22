/**
 * L1 Unit Test — emailService
 *
 * CỐ Ý KHÔNG assert nguyên văn HTML: nội dung thư là quyết định thiết kế, đổi câu chữ
 * là chuyện bình thường. Test bám vào đó sẽ đỏ mỗi lần sửa chính tả và ngủ quên khi có
 * lỗi thật (writing-good-tests §"No change detectors").
 *
 * Khoá lại đúng những thứ hỏng là có hậu quả:
 *   - chưa cấu hình SMTP thì TUYỆT ĐỐI không gọi gửi thư;
 *   - gửi đúng người nhận;
 *   - mã xác nhận / mật khẩu tạm PHẢI có mặt trong thư (thiếu là người dùng không
 *     đăng nhập được);
 *   - SMTP hỏng không được làm sập luồng nghiệp vụ đang gọi.
 */
jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

const nodemailer = require('nodemailer');
const emailService = require('../../services/emailService');

const ENV_GOC = { ...process.env };
let sendMail;

beforeEach(() => {
    jest.clearAllMocks();
    sendMail = jest.fn().mockResolvedValue({ messageId: 'abc' });
    nodemailer.createTransport.mockReturnValue({ sendMail });
    process.env.SMTP_USER = 'noreply@logiscount.vn';
    process.env.SMTP_PASS = 'matkhau';
    delete process.env.SMTP_FROM;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_HOST;
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    process.env = { ...ENV_GOC };
    jest.restoreAllMocks();
});

/** Lấy mailOptions của lần gửi gần nhất */
const thuVuaGui = () => sendMail.mock.calls.at(-1)[0];

describe('emailService — chốt chặn khi SMTP chưa cấu hình', () => {
    it('TC-UNIT-EmailService-001 — sends nothing when SMTP_USER is missing', async () => {
        delete process.env.SMTP_USER;

        await emailService.sendPasswordResetCodeEmail('a@b.vn', 'A', 'ABC123');

        expect(nodemailer.createTransport).not.toHaveBeenCalled();
        expect(sendMail).not.toHaveBeenCalled();
    });

    it('TC-UNIT-EmailService-002 — sends nothing while SMTP_USER is still the sample value', async () => {
        process.env.SMTP_USER = 'your_email@gmail.com';

        await emailService.sendPasswordResetCodeEmail('a@b.vn', 'A', 'ABC123');

        expect(sendMail).not.toHaveBeenCalled();
    });

    it.each([
        ['sendWelcomeEmail', ['a@b.vn', 'MatKhau1', 'A', 'driver']],
        ['sendEmailChangeVerificationCode', ['a@b.vn', 'A', 'ABC123']],
        ['sendPasswordResetCodeEmail', ['a@b.vn', 'A', 'ABC123']],
        ['sendPasswordResetEmail', ['a@b.vn', 'MatKhau1', 'A']],
    ])('TC-UNIT-EmailService-003 — %s also honours the unconfigured-SMTP guard', async (ham, args) => {
        delete process.env.SMTP_USER;

        await emailService[ham](...args);

        expect(sendMail).not.toHaveBeenCalled();
    });
});

describe('emailService — cấu hình kết nối SMTP', () => {
    it('TC-UNIT-EmailService-004 — defaults to Gmail on port 587 with secure off', async () => {
        await emailService.sendPasswordResetCodeEmail('a@b.vn', 'A', 'ABC123');

        expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({
            host: 'smtp.gmail.com', port: 587, secure: false,
        }));
    });

    it('TC-UNIT-EmailService-005 — port 465 turns secure on (SMTPS)', async () => {
        process.env.SMTP_PORT = '465';

        await emailService.sendPasswordResetCodeEmail('a@b.vn', 'A', 'ABC123');

        expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({
            port: '465', secure: true,
        }));
    });

    it('TC-UNIT-EmailService-006 — any port other than 465 leaves secure OFF', async () => {
        process.env.SMTP_PORT = '2525';

        await emailService.sendPasswordResetCodeEmail('a@b.vn', 'A', 'ABC123');

        expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({ secure: false }));
    });

    it('TC-UNIT-EmailService-007 — a custom host is honoured', async () => {
        process.env.SMTP_HOST = 'smtp.sendgrid.net';

        await emailService.sendPasswordResetCodeEmail('a@b.vn', 'A', 'ABC123');

        expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({
            host: 'smtp.sendgrid.net',
        }));
    });

    it('TC-UNIT-EmailService-008 — SMTP credentials are taken from the environment', async () => {
        await emailService.sendPasswordResetCodeEmail('a@b.vn', 'A', 'ABC123');

        expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({
            auth: { user: 'noreply@logiscount.vn', pass: 'matkhau' },
        }));
    });
});

describe('emailService — địa chỉ người gửi', () => {
    it('TC-UNIT-EmailService-009 — uses SMTP_FROM as the sender when it is set', async () => {
        process.env.SMTP_FROM = 'hotro@logiscount.vn';

        await emailService.sendPasswordResetCodeEmail('a@b.vn', 'A', 'ABC123');

        expect(thuVuaGui().from).toContain('hotro@logiscount.vn');
    });

    it('TC-UNIT-EmailService-010 — falls back to SMTP_USER when SMTP_FROM is absent', async () => {
        await emailService.sendPasswordResetCodeEmail('a@b.vn', 'A', 'ABC123');

        expect(thuVuaGui().from).toContain('noreply@logiscount.vn');
    });
});

describe('emailService.sendPasswordResetCodeEmail', () => {
    it('TC-UNIT-EmailService-011 — reaches the right recipient with the confirmation code in the body', async () => {
        await emailService.sendPasswordResetCodeEmail('taixe@logiscount.vn', 'Lê Văn Tài', 'XK7P2M');

        const thu = thuVuaGui();
        expect(thu.to).toBe('taixe@logiscount.vn');
        expect(thu.subject).toBe('Mã xác nhận đặt lại mật khẩu');
        expect(thu.html).toContain('XK7P2M');
        expect(thu.html).toContain('Lê Văn Tài');
    });

    it('TC-UNIT-EmailService-012 — with no name it uses the default greeting and never prints undefined', async () => {
        await emailService.sendPasswordResetCodeEmail('a@b.vn', null, 'XK7P2M');

        expect(thuVuaGui().html).not.toContain('undefined');
    });
});

describe('emailService.sendEmailChangeVerificationCode', () => {
    it('TC-UNIT-EmailService-013 — the email-change code appears in the message under the right subject', async () => {
        await emailService.sendEmailChangeVerificationCode('cu@logiscount.vn', 'A', 'QQ88ZZ');

        const thu = thuVuaGui();
        expect(thu.to).toBe('cu@logiscount.vn');
        expect(thu.subject).toBe('Mã xác nhận thay đổi email');
        expect(thu.html).toContain('QQ88ZZ');
    });
});

describe('emailService.sendWelcomeEmail', () => {
    it('TC-UNIT-EmailService-014 — the welcome mail carries the email and the temporary password needed to sign in', async () => {
        await emailService.sendWelcomeEmail('moi@logiscount.vn', 'MatKhauTam1', 'Nguyễn A', 'driver');

        const thu = thuVuaGui();
        expect(thu.to).toBe('moi@logiscount.vn');
        expect(thu.html).toContain('moi@logiscount.vn');
        expect(thu.html).toContain('MatKhauTam1');
    });

    it('TC-UNIT-EmailService-015 — the role is printed in upper case', async () => {
        await emailService.sendWelcomeEmail('moi@logiscount.vn', 'MatKhauTam1', 'Nguyễn A', 'coordinator');

        expect(thuVuaGui().html).toContain('COORDINATOR');
    });
});

describe('emailService.sendPasswordResetEmail', () => {
    it('TC-UNIT-EmailService-016 — the admin reset mail carries the temporary password', async () => {
        await emailService.sendPasswordResetEmail('taixe@logiscount.vn', 'TamThoi9', 'Lê Văn Tài');

        const thu = thuVuaGui();
        expect(thu.subject).toBe('Mật khẩu đăng nhập của bạn đã được đặt lại');
        expect(thu.html).toContain('TamThoi9');
    });
});

describe('emailService — SMTP hỏng không được làm sập luồng gọi', () => {
    it.each([
        ['sendWelcomeEmail', ['a@b.vn', 'MatKhau1', 'A', 'driver']],
        ['sendEmailChangeVerificationCode', ['a@b.vn', 'A', 'ABC123']],
        ['sendPasswordResetCodeEmail', ['a@b.vn', 'A', 'ABC123']],
        ['sendPasswordResetEmail', ['a@b.vn', 'MatKhau1', 'A']],
    ])('TC-UNIT-EmailService-017 — %s swallows the SMTP failure and returns normally', async (ham, args) => {
        sendMail.mockRejectedValue(new Error('SMTP 535 auth failed'));

        await expect(emailService[ham](...args)).resolves.toBeUndefined();
        expect(console.error).toHaveBeenCalled();
    });
});
