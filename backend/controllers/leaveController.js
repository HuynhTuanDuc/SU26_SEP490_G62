const leaveService = require('../services/leaveService');

// GET /api/leave/me?month=6&year=2026
const getMyLeaves = async (req, res) => {
    try {
        const { month, year } = req.query;
        const data = await leaveService.getMyLeaves(req.user.userId, { month, year });
        res.json({ leaves: data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// GET /api/leave/summary?month=6&year=2026
const getSummary = async (req, res) => {
    try {
        const { month, year } = req.query;
        const data = await leaveService.getSummary(req.user.userId, { month, year });
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// POST /api/leave
// Body: { leaveDate, leaveType, reason? }
const createLeave = async (req, res) => {
    try {
        const { leaveDate, leaveType, reason } = req.body;
        const leave = await leaveService.createLeave(req.user.userId, {
            leaveDate, leaveType, reason,
        });
        res.status(201).json({ message: 'Đăng ký nghỉ thành công', leave });
    } catch (err) {
        const code = err.message.includes('đã có') || err.message.includes('duplicate') ? 409
            : err.message.includes('bắt buộc') ? 400
            : 400;
        res.status(code).json({ error: err.message });
    }
};

// DELETE /api/leave/:id
const deleteLeave = async (req, res) => {
    try {
        const id = Number(req.params.id);
        await leaveService.deleteLeave(req.user.userId, id);
        res.json({ message: 'Đã huỷ đăng ký nghỉ' });
    } catch (err) {
        const code = err.message.toLowerCase().includes('không thể huỷ') ? 422 : 400;
        res.status(code).json({ error: err.message });
    }
};

module.exports = { getMyLeaves, getSummary, createLeave, deleteLeave };
