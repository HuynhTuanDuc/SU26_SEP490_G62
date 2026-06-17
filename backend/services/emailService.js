const nodemailer = require('nodemailer');

const createTransporter = () => {
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: process.env.SMTP_PORT || 587,
        secure: process.env.SMTP_PORT === '465',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });
};

const sendWelcomeEmail = async (toEmail, rawPassword, fullName, role) => {
    try {

        if (!process.env.SMTP_USER || process.env.SMTP_USER === 'your_email@gmail.com') {
            console.log(`[Email Service] Cần cấu hình SMTP trong .env để gửi mail tới ${toEmail}`);
            return;
        }

        const transporter = createTransporter();
        const mailOptions = {
            from: `"Hệ thống Quản lý (Admin)" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
            to: toEmail,
            subject: 'Thông tin tài khoản đăng nhập hệ thống',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; line-height: 1.5; color: #333;">
                    <h2 style="color: #4F46E5;">Chào mừng ${fullName || 'bạn'} gia nhập hệ thống Logiscount!</h2>
                    <p>Tài khoản của bạn đã được quản trị viên tạo thành công với vai trò: <strong>${role.toUpperCase()}</strong>.</p>
                    <p>Dưới đây là thông tin đăng nhập của bạn:</p>
                    <div style="background-color: #F3F4F6; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <p style="margin: 5px 0;"><strong>Email:</strong> ${toEmail}</p>
                        <p style="margin: 5px 0;"><strong>Mật khẩu:</strong> <span style="color: #DC2626; font-weight: bold;">${rawPassword}</span></p>
                    </div>
                    <p>Vui lòng đăng nhập và đổi mật khẩu ngay trong lần đăng nhập đầu tiên để đảm bảo bảo mật.</p>
                    <p>Trân trọng,<br/>Đội ngũ Quản trị Logiscount.</p>
                    <p style="color: #9CA3AF;">Email này được gửi tự động, vui lòng không trả lời.</p>
                </div>
            `,
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`[Email Service] Đã gửi thư tới ${toEmail} thành công (Message ID: ${info.messageId})`);
    } catch (error) {
        console.error('[Email Service] Lỗi khi gửi thư:', error);

    }
};

const sendEmailChangeVerificationCode = async (toEmail, fullName, code) => {
    try {
        if (!process.env.SMTP_USER || process.env.SMTP_USER === 'your_email@gmail.com') {
            console.log(`[Email Service] Can cau hinh SMTP de gui ma xac nhan doi email toi ${toEmail}: ${code}`);
            return;
        }

        const transporter = createTransporter();
        const mailOptions = {
            from: `"He thong Quan ly (Security)" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
            to: toEmail,
            subject: 'Ma xac nhan thay doi email',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; line-height: 1.5; color: #333;">
                    <h2 style="color: #1D4ED8;">Xin chao ${fullName || 'ban'},</h2>
                    <p>Ban vua yeu cau thay doi email dang nhap cho tai khoan cua minh.</p>
                    <p>Nhap ma xac nhan ben duoi de tiep tuc:</p>
                    <div style="background-color: #EFF6FF; padding: 18px; border-radius: 8px; margin: 20px 0; text-align: center;">
                        <span style="font-size: 28px; letter-spacing: 6px; font-weight: 700; color: #1D4ED8;">${code}</span>
                    </div>
                    <p>Ma co hieu luc trong 10 phut. Neu ban khong thuc hien yeu cau nay, hay bo qua email.</p>
                </div>
            `,
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`[Email Service] Da gui ma xac nhan doi email toi ${toEmail} (Message ID: ${info.messageId})`);
    } catch (error) {
        console.error('[Email Service] Loi khi gui ma xac nhan doi email:', error);
    }
};

module.exports = {
    sendWelcomeEmail,
    sendEmailChangeVerificationCode,
};
