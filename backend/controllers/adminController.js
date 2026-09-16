const adminService = require('../services/adminService');

const getAllUsers = async (req, res) => {
    try {
        const users = await adminService.getAllUsers();
        res.json({ users });
    } catch (err) {
        console.error('Error fetching all users:', err);
        const status = err.status || 500;
        res.status(status).json({ error: err.status ? err.message : 'Failed to fetch users', details: err.message });
    }
};

const createUser = async (req, res) => {
    try {
        const {
            email,
            full_name,
            phone,
            role,
            gender,
            dob,
            city,
            address,
            country,
            national_id,
            tax_code,
            emergency_contact_name,
            emergency_contact_phone,
            notes,
            hire_date,
        } = req.body;
        const created = await adminService.createUser(
            email, full_name, phone, role, gender, dob, city,
            address, country, national_id, tax_code,
            emergency_contact_name, emergency_contact_phone, notes, req.user?.userId ?? null,
            { hireDate: hire_date },
        );
        // Nhân viên không có email: mật khẩu khởi tạo chỉ tồn tại trong response này,
        // client phải hiển thị để quản lý giao tận tay.
        res.status(201).json({
            message: created.welcomeEmailSent
                ? 'Tạo người dùng thành công — thông tin đăng nhập đã gửi qua email.'
                : 'Tạo người dùng thành công. Nhân viên này chưa có email nên hãy giao mật khẩu tận tay.',
            id: created.id,
            welcome_email_sent: created.welcomeEmailSent,
            initial_password: created.initialPassword,
        });
    } catch (err) {
        console.error('Error creating user:', err);
        const status = err.status || 500;
        const errorMsg = err.status ? err.message : 'Lỗi máy chủ.';
        res.status(status).json({ error: errorMsg, details: err.message });
    }
};

const updateUser = async (req, res) => {
    try {
        const userId = req.params.id;
        const {
            full_name,
            phone,
            role,
            gender,
            dob,
            city,
            address,
            country,
            national_id,
            tax_code,
            emergency_contact_name,
            emergency_contact_phone,
            notes,
            email,
            hire_date,
        } = req.body;
        await adminService.updateUser(
            userId, full_name, phone, role, gender, dob, city,
            address, country, national_id, tax_code,
            emergency_contact_name, emergency_contact_phone, notes, email, req.user?.userId ?? null,
            { hireDate: hire_date },
        );
        res.json({ message: 'Cập nhật thành công.' });
    } catch (err) {
        console.error('Error updating user:', err);
        const status = err.status || 500;
        const errorMsg = err.status ? err.message : 'Lỗi máy chủ.';
        res.status(status).json({ error: errorMsg, details: err.message });
    }
};

const toggleUserStatus = async (req, res) => {
    try {
        const userId = req.params.id;
        const { is_active } = req.body;
        const currentUserId = req.user.userId;

        const result = await adminService.toggleUserStatus(userId, is_active, currentUserId);
        const action = is_active ? 'mở khóa' : 'khóa';
        const message = result.changed
            ? `Đã ${action} tài khoản.`
            : `Tài khoản đã ở trạng thái ${is_active ? 'hoạt động' : 'đã khóa'}.`;

        res.json({ message, user: result });
    } catch (err) {
        console.error('Error toggling user status:', err);
        const status = err.status || 500;
        res.status(status).json({ error: err.status ? err.message : 'Lỗi máy chủ', details: err.message });
    }
};

const resetUserPassword = async (req, res) => {
    try {
        const userId = req.params.id;
        const currentUserId = req.user.userId;
        const result = await adminService.resetUserPassword(userId, currentUserId);
        // Không có email thì mật khẩu mới chỉ tồn tại trong response này — client phải
        // hiển thị cho quản lý giao tận tay, không có lần thứ hai để lấy lại.
        res.json({
            message: result.resetEmailSent
                ? 'Đã reset mật khẩu — mật khẩu tạm thời đã được gửi qua email của nhân viên.'
                : 'Đã reset mật khẩu. Nhân viên này chưa có email nên hãy giao mật khẩu tạm thời tận tay.',
            reset_email_sent: result.resetEmailSent,
            new_password: result.newPassword,
        });
    } catch (err) {
        console.error('Error resetting user password:', err);
        const status = err.status || 500;
        res.status(status).json({ error: err.status ? err.message : 'Lỗi máy chủ', details: err.message });
    }
};

// PATCH /api/admin/users/:id/employment — hồ sơ công việc của tài xế.
// Body: { hire_date?, termination_date? }. termination_date: không gửi = giữ nguyên,
// gửi null/'' = xoá (tài quay lại làm hoặc nhập nhầm).
const updateDriverEmployment = async (req, res) => {
    try {
        const body = req.body ?? {};
        const employment = await adminService.updateDriverEmployment(
            req.params.id,
            {
                hireDate: body.hire_date,
                terminationDate: Object.prototype.hasOwnProperty.call(body, 'termination_date')
                    ? body.termination_date
                    : undefined,
            },
            req.user?.userId ?? null,
        );
        res.json({ message: 'Đã cập nhật hồ sơ công việc.', employment });
    } catch (err) {
        console.error('Error updating driver employment:', err);
        const status = err.status || 500;
        const errorMsg = err.status ? err.message : 'Lỗi máy chủ.';
        res.status(status).json({ error: errorMsg, details: err.message });
    }
};

// POST /api/admin/users/:id/terminate — chấm dứt hợp đồng tài xế.
// Body: { termination_date, reason? }. termination_date = ngày làm việc cuối cùng; tài
// khoản bị khoá ngay khi ghi nhận.
const terminateDriverContract = async (req, res) => {
    try {
        const body = req.body ?? {};
        const result = await adminService.terminateDriverContract(
            req.params.id,
            { terminationDate: body.termination_date, reason: body.reason },
            req.user?.userId ?? null,
        );
        res.json({ message: 'Đã chấm dứt hợp đồng và khoá tài khoản.', ...result });
    } catch (err) {
        console.error('Error terminating driver contract:', err);
        const status = err.status || 500;
        const errorMsg = err.status ? err.message : 'Lỗi máy chủ.';
        res.status(status).json({ error: errorMsg, details: err.message });
    }
};

module.exports = {
    getAllUsers,
    createUser,
    updateUser,
    updateDriverEmployment,
    terminateDriverContract,
    resetUserPassword,
    toggleUserStatus,
};
