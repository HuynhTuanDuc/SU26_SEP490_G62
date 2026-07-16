const bonusService   = require('../services/bonusService');
const bonusRepository = require('../repositories/bonusRepository');

const _posInt = (v, label) => {
    const n = parseInt(v, 10);
    if (!n || n <= 0) throw Object.assign(new Error(`${label} không hợp lệ`), { status: 400 });
    return n;
};

const _send = (res, err) => {
    const code = err.status || (
        err.message.includes('không tìm thấy') || err.message.includes('không tồn tại') ? 404
        : err.message.includes('không hợp lệ') || err.message.includes('phải') ? 400
        : 500
    );
    res.status(code).json({ error: err.message });
};

// ─── List & stats ─────────────────────────────────────────────────────────────

const getAll = async (req, res) => {
    try {
        const { type, status, year, search, driver_id, page, limit } = req.query;
        if (type   && !bonusRepository.BONUS_TYPES.includes(type))
            return res.status(400).json({ error: 'Loại thưởng không hợp lệ' });
        if (status && !bonusRepository.BONUS_STATUSES.includes(status))
            return res.status(400).json({ error: 'Trạng thái không hợp lệ' });

        const result = await bonusService.getAll({
            type:     type   || null,
            status:   status || null,
            year:     year   ? Number(year) : null,
            search:   search?.trim() || null,
            driverId: driver_id ? Number(driver_id) : null,
            page:     page  || null,
            limit:    limit || null,
        });

        if (Array.isArray(result)) {
            res.json({ bonuses: result });
        } else {
            res.json({
                bonuses: result.rows,
                pagination: {
                    total: result.total, page: result.page,
                    limit: result.limit, totalPages: result.totalPages,
                },
            });
        }
    } catch (err) { _send(res, err); }
};

const getStats = async (req, res) => {
    try {
        const year = req.query.year ? Number(req.query.year) : null;
        const stats = await bonusService.getStats(year);
        res.json(stats);
    } catch (err) { _send(res, err); }
};

const getOne = async (req, res) => {
    try {
        const id    = _posInt(req.params.id, 'ID');
        const bonus = await bonusService.getById(id);
        res.json(bonus);
    } catch (err) { _send(res, err); }
};

// Driver xem thưởng của mình
const getMyBonuses = async (req, res) => {
    try {
        const rows = await bonusService.getByDriver(req.user.userId);
        res.json({ bonuses: rows });
    } catch (err) { _send(res, err); }
};

// ─── Tet ─────────────────────────────────────────────────────────────────────

const previewTet = async (req, res) => {
    try {
        const year = Number(req.query.year) || new Date().getFullYear();
        const data = await bonusService.previewTet(year);
        res.json({ year, previews: data });
    } catch (err) { _send(res, err); }
};

const generateTet = async (req, res) => {
    try {
        const year = Number(req.body.year) || new Date().getFullYear();
        const result = await bonusService.generateTet(year, req.user.userId);
        res.status(201).json({
            message: `Đã tạo ${result.inserted} phiếu thưởng Tết ${year}` +
                     (result.skipped ? ` (bỏ qua ${result.skipped} đã tồn tại)` : ''),
            ...result,
        });
    } catch (err) { _send(res, err); }
};

// ─── Create welfare / special ─────────────────────────────────────────────────

const create = async (req, res) => {
    try {
        const {
            driver_id, type, amount, notes, year,
            beneficiary_name, beneficiary_relation, proof_url,
        } = req.body;

        if (!driver_id) return res.status(400).json({ error: 'driver_id là bắt buộc' });
        if (!type)      return res.status(400).json({ error: 'type là bắt buộc' });
        if (!bonusRepository.BONUS_TYPES.includes(type))
            return res.status(400).json({ error: 'Loại thưởng không hợp lệ' });

        const bonus = await bonusService.createWelfare({
            driver_id: Number(driver_id),
            type,
            amount:    amount ? Number(amount) : null,
            notes,
            year:      year ? Number(year) : null,
            beneficiary_name,
            beneficiary_relation,
            proof_url,
        }, req.user.userId, req.user.role);

        const message = req.user.role === 'manager'
            ? 'Tạo và duyệt khoản thưởng/phúc lợi thành công'
            : 'Tạo khoản thưởng/phúc lợi thành công — đang chờ Manager duyệt';
        res.status(201).json({ message, bonus });
    } catch (err) { _send(res, err); }
};

// ─── Workflow ─────────────────────────────────────────────────────────────────

const approve = async (req, res) => {
    try {
        const id             = _posInt(req.params.id, 'ID');
        const adjustedAmount = req.body.amount != null ? Number(req.body.amount) : null;
        const bonus = await bonusService.approve(id, req.user.userId, adjustedAmount);
        res.json({ message: 'Đã duyệt khoản thưởng/phúc lợi', bonus });
    } catch (err) { _send(res, err); }
};

const reject = async (req, res) => {
    try {
        const id     = _posInt(req.params.id, 'ID');
        const reason = req.body.reason?.trim();
        if (!reason) return res.status(400).json({ error: 'Cần ghi lý do từ chối' });
        const bonus = await bonusService.reject(id, req.user.userId, reason);
        res.json({ message: 'Đã từ chối khoản thưởng/phúc lợi', bonus });
    } catch (err) { _send(res, err); }
};

const pay = async (req, res) => {
    try {
        const id    = _posInt(req.params.id, 'ID');
        const bonus = await bonusService.pay(id, req.user.userId);
        res.json({ message: 'Đã ghi nhận chi trả thưởng/phúc lợi', bonus });
    } catch (err) { _send(res, err); }
};

module.exports = {
    getAll,
    getStats,
    getOne,
    getMyBonuses,
    previewTet,
    generateTet,
    create,
    approve,
    reject,
    pay,
};
