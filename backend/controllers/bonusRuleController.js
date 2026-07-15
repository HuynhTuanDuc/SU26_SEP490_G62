const bonusRuleService = require('../services/bonusRuleService');

const sendError = (res, err) => {
    const code = err.message.includes('không tồn tại') ? 404
        : err.message.includes('bắt buộc') || err.message.includes('không hợp lệ') || err.message.includes('Cần nhập') ? 400
        : 500;
    res.status(code).json({ error: err.message });
};

const getAll = async (req, res) => {
    try {
        const rules = await bonusRuleService.listRules(req.query);
        res.json({ rules });
    } catch (err) { sendError(res, err); }
};

const getOne = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!id) return res.status(400).json({ error: 'ID không hợp lệ' });
        const rule = await bonusRuleService.getRuleById(id);
        res.json({ rule });
    } catch (err) { sendError(res, err); }
};

const create = async (req, res) => {
    try {
        const rule = await bonusRuleService.createRule(req.body);
        res.status(201).json({ message: 'Đã tạo quy tắc thưởng', rule });
    } catch (err) { sendError(res, err); }
};

const update = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!id) return res.status(400).json({ error: 'ID không hợp lệ' });
        const rule = await bonusRuleService.updateRule(id, req.body);
        res.json({ message: 'Đã cập nhật quy tắc thưởng', rule });
    } catch (err) { sendError(res, err); }
};

const remove = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!id) return res.status(400).json({ error: 'ID không hợp lệ' });
        await bonusRuleService.deleteRule(id);
        res.json({ message: 'Đã xóa quy tắc thưởng' });
    } catch (err) { sendError(res, err); }
};

module.exports = { getAll, getOne, create, update, remove };
