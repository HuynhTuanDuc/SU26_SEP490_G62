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
        } = req.body;
        const newId = await adminService.createUser(
            email, full_name, phone, role, gender, dob, city,
            address, country, national_id, tax_code,
            emergency_contact_name, emergency_contact_phone, notes,
        );
        res.status(201).json({ message: 'Tao nguoi dung thanh cong.', id: newId });
    } catch (err) {
        console.error('Error creating user:', err);
        const status = err.status || 500;
        const errorMsg = err.status ? err.message : 'Loi may chu.';
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
        } = req.body;
        await adminService.updateUser(
            userId, full_name, phone, role, gender, dob, city,
            address, country, national_id, tax_code,
            emergency_contact_name, emergency_contact_phone, notes,
        );
        res.json({ message: 'Cap nhat thanh cong.' });
    } catch (err) {
        console.error('Error updating user:', err);
        const status = err.status || 500;
        const errorMsg = err.status ? err.message : 'Loi may chu.';
        res.status(status).json({ error: errorMsg, details: err.message });
    }
};

const toggleUserStatus = async (req, res) => {
    try {
        const userId = req.params.id;
        const { is_active } = req.body;
        const currentUserId = req.user.userId;

        const result = await adminService.toggleUserStatus(userId, is_active, currentUserId);
        const action = is_active ? 'mo khoa' : 'khoa';
        const message = result.changed
            ? `Da ${action} tai khoan.`
            : `Tai khoan da o trang thai ${is_active ? 'hoat dong' : 'da khoa'}.`;

        res.json({ message, user: result });
    } catch (err) {
        console.error('Error toggling user status:', err);
        const status = err.status || 500;
        res.status(status).json({ error: err.status ? err.message : 'Loi may chu', details: err.message });
    }
};

module.exports = {
    getAllUsers,
    createUser,
    updateUser,
    toggleUserStatus,
};
