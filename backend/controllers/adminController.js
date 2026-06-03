const profileRepository = require('../repositories/profileRepository');
const { parsePaginationQuery, buildPaginationMeta } = require('../utils/pagination');
const bcrypt = require('bcryptjs');

const getAllUsers = async (req, res) => {
    try {
        const { page, limit, offset } = parsePaginationQuery(req.query, { defaultLimit: 15, maxLimit: 100 });
        const { rows, total } = await profileRepository.getAllUsers({
            page,
            limit,
            offset,
            search: String(req.query.search || '').trim(),
            sortField: req.query.sortField || 'id',
            sortDir: req.query.sortDir || 'asc',
        });

        res.json({
            users: rows,
            pagination: buildPaginationMeta({ total, page, limit }),
        });
    } catch (err) {
        console.error('Error fetching all users:', err);
        res.status(500).json({ error: 'Failed to fetch users', details: err.message });
    }
};

const createUser = async (req, res) => {
    try {
        const { email, password, full_name, phone, role } = req.body;
        if (!email || !password || !role) {
            return res.status(400).json({ error: 'Thiếu thông tin bắt buộc (email, password, role).' });
        }

        const roleId = await profileRepository.getRoleIdByName(role);
        if (!roleId) return res.status(400).json({ error: 'Vai trò không hợp lệ.' });

        const existingAccount = await profileRepository.getAccountByEmail(email);
        if (existingAccount) return res.status(409).json({ error: 'Email đã tồn tại.' });

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        const newId = await profileRepository.adminCreateUser(email, passwordHash, roleId, full_name || '', phone || null);
        res.status(201).json({ message: 'Tạo người dùng thành công.', id: newId });
    } catch (err) {
        console.error('Error creating user:', err);
        const errorMsg = err.code === '23505' ? 'Số điện thoại hoặc Email đã tồn tại.' : 'Lỗi máy chủ.';
        res.status(500).json({ error: errorMsg, details: err.message });
    }
};

const updateUser = async (req, res) => {
    try {
        const userId = req.params.id;
        const { full_name, phone, role } = req.body;
        
        if (!role) return res.status(400).json({ error: 'Vai trò không được để trống.' });

        const roleId = await profileRepository.getRoleIdByName(role);
        if (!roleId) return res.status(400).json({ error: 'Vai trò không hợp lệ.' });

        await profileRepository.adminUpdateUser(userId, { full_name, phone }, roleId);
        res.json({ message: 'Cập nhật thành công.' });
    } catch (err) {
        console.error('Error updating user:', err);
        const errorMsg = err.code === '23505' ? 'Số điện thoại đã tồn tại.' : 'Lỗi máy chủ.';
        res.status(500).json({ error: errorMsg, details: err.message });
    }
};

const toggleUserStatus = async (req, res) => {
    try {
        const userId = req.params.id;
        const { is_active } = req.body;
        
        if (is_active === undefined) return res.status(400).json({ error: 'Thiếu is_active.' });
        
        if (Number(userId) === req.user.userId) {
            return res.status(400).json({ error: 'Không thể tự khoá tài khoản của chính mình.' });
        }

        await profileRepository.adminToggleUserStatus(userId, is_active);
        res.json({ message: `Đã ${is_active ? 'mở khoá' : 'khoá'} tài khoản.` });
    } catch (err) {
        console.error('Error toggling user status:', err);
        res.status(500).json({ error: 'Lỗi máy chủ', details: err.message });
    }
};

module.exports = {
    getAllUsers,
    createUser,
    updateUser,
    toggleUserStatus,
};
