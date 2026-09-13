const accountantDebtRepository = require('../repositories/accountantDebtRepository');
const { posInt, posAmount, enumVal, pageParams, validDate, sendError, err400 } = require('../utils/accountantValidate');
const { money } = require('../utils/formatNumber');

const DEBT_TYPES   = ['customer', 'driver', 'partner'];
const DEBT_STATUSES = ['paid', 'partial', 'unpaid'];

// Trần một khoản khai tay. Không phải giới hạn nghiệp vụ mà là chốt chặn gõ nhầm:
// thừa một số 0 là công nợ sai gấp 10 lần và ăn thẳng vào lương tài xế.
const MAX_MANUAL_DEBT = 5_000_000_000;

const getDebts = async (req, res) => {
    try {
        const { page, limit } = pageParams(req.query);
        enumVal(req.query.debt_type, DEBT_TYPES,    'Loại công nợ');
        enumVal(req.query.status,    DEBT_STATUSES, 'Trạng thái công nợ');

        const result = await accountantDebtRepository.getAllDebts({
            debtType:       req.query.debt_type || null,
            status:         req.query.status    || null,
            customerSearch: req.query.customer?.trim() || null,
            driverSearch:   req.query.driver?.trim()   || null,
            page,
            limit,
        });

        res.json(result);
    } catch (err) {
        sendError(res, err);
    }
};

const getDebtStats = async (_req, res) => {
    try {
        const stats = await accountantDebtRepository.getDebtStats();
        res.json(stats);
    } catch (err) {
        sendError(res, err);
    }
};

const getDebtsGrouped = async (req, res) => {
    try {
        const { page, limit } = pageParams(req.query);
        enumVal(req.query.debt_type, DEBT_TYPES,    'Loại công nợ');
        enumVal(req.query.status,    DEBT_STATUSES, 'Trạng thái công nợ');

        const result = await accountantDebtRepository.getDebtsGroupedByPerson({
            debtType:       req.query.debt_type || null,
            status:         req.query.status    || null,
            customerSearch: req.query.customer?.trim() || null,
            driverSearch:   req.query.driver?.trim()   || null,
            page,
            limit,
        });

        res.json(result);
    } catch (err) {
        sendError(res, err);
    }
};

const getDebtsByPerson = async (req, res) => {
    try {
        const { personType, personId } = req.params;
        const { customer_ids } = req.query;

        if (!DEBT_TYPES.includes(personType))
            throw err400('Loại đối tượng không hợp lệ.');

        if (customer_ids) {
            const ids = customer_ids.split(',').map(Number).filter((n) => n > 0);
            if (ids.length === 0)
                throw err400('Danh sách mã khách hàng không hợp lệ.');
            const debts = await accountantDebtRepository.getDebtsByCustomerIds(ids);
            return res.json({ debts });
        }

        const id = posInt(personId, 'Mã đối tượng');
        const debts = await accountantDebtRepository.getDebtsByPerson(personType, id);
        res.json({ debts });
    } catch (err) {
        sendError(res, err);
    }
};

// POST /accountant/debts/:id/transfer-to-driver — Body: { driverId, notes? }
// Chuyển toàn bộ số dư còn lại của 1 công nợ khách hàng sang công nợ tài xế mới.
const transferToDriver = async (req, res) => {
    try {
        const debtId = posInt(req.params.id, 'Mã công nợ');
        const driverId = posInt(req.body.driverId, 'Tài xế');
        const result = await accountantDebtRepository.transferToDriver(
            debtId, { toDriverId: driverId, notes: req.body.notes?.trim() || null }, req.user.userId,
        );
        res.json({ message: 'Đã chuyển công nợ sang tài xế.', ...result });
    } catch (err) {
        sendError(res, err);
    }
};

// ─── Công nợ khai tay ────────────────────────────────────────────────────────

/** Gom validate dùng chung cho tạo và sửa. */
const validateManualDebtBody = (body, { requireOwner = true } = {}) => {
    const totalAmount = posAmount(body.total_amount, 'Số tiền công nợ');
    if (totalAmount > MAX_MANUAL_DEBT) {
        throw err400(`Số tiền công nợ vượt mức cho phép (tối đa ${money(MAX_MANUAL_DEBT)}) — kiểm tra lại xem có thừa số 0 không.`);
    }

    // Ngày phát sinh: bắt buộc, và KHÔNG được ở tương lai. Nợ cũ mà ghi ngày tương lai
    // thì tuổi nợ âm, báo cáo quá hạn sai hết.
    const incurredOn = validDate(body.incurred_on, 'Ngày phát sinh');
    if (!incurredOn) throw err400('Ngày phát sinh công nợ là bắt buộc.');
    const today = new Date(); today.setHours(23, 59, 59, 999);
    if (new Date(incurredOn) > today) throw err400('Ngày phát sinh không được ở tương lai.');

    const dueDate = body.due_date ? validDate(body.due_date, 'Hạn thanh toán') : null;
    if (dueDate && new Date(dueDate) < new Date(incurredOn)) {
        throw err400('Hạn thanh toán không được trước ngày phát sinh.');
    }

    const notes = body.notes?.trim() || null;
    if (!notes) throw err400('Cần ghi rõ lý do / diễn giải khoản công nợ này.');
    if (notes.length > 500) throw err400('Diễn giải không quá 500 ký tự.');

    const result = { totalAmount, incurredOn, dueDate, notes };

    if (requireOwner) {
        result.debtType = enumVal(body.debt_type, DEBT_TYPES, 'Loại công nợ');
        result.ownerId = posInt(body.owner_id, 'Đối tượng công nợ');
    }
    return result;
};

// GET /accountant/debts/owners?type=customer|driver|partner&q= — nguồn cho ô chọn
const searchDebtOwners = async (req, res) => {
    try {
        const ownerType = enumVal(req.query.type, DEBT_TYPES, 'Loại công nợ');
        const owners = await accountantDebtRepository.searchDebtOwners(ownerType, req.query.q || '');
        res.json({ owners });
    } catch (err) {
        sendError(res, err);
    }
};

// POST /accountant/debts/manual — khai công nợ có từ trước khi dùng phần mềm
const createManualDebt = async (req, res) => {
    try {
        const payload = validateManualDebtBody(req.body);
        const debt = await accountantDebtRepository.createManualDebt({
            ...payload, createdBy: req.user.userId,
        });
        res.status(201).json({ message: 'Đã ghi nhận công nợ.', debt });
    } catch (err) {
        sendError(res, err);
    }
};

// PUT /accountant/debts/manual/:id — chỉ sửa được khi chưa phát sinh thanh toán
const updateManualDebt = async (req, res) => {
    try {
        const debtId = posInt(req.params.id, 'Mã công nợ');
        const payload = validateManualDebtBody(req.body, { requireOwner: false });
        const debt = await accountantDebtRepository.updateManualDebt(debtId, payload, req.user.userId);
        res.json({ message: 'Đã cập nhật công nợ.', debt });
    } catch (err) {
        sendError(res, err);
    }
};

// DELETE /accountant/debts/manual/:id — chỉ xoá được khi chưa phát sinh thanh toán
const deleteManualDebt = async (req, res) => {
    try {
        const debtId = posInt(req.params.id, 'Mã công nợ');
        await accountantDebtRepository.deleteManualDebt(debtId, req.user.userId);
        res.json({ message: 'Đã xoá công nợ.' });
    } catch (err) {
        sendError(res, err);
    }
};

module.exports = {
    getDebts, getDebtStats, getDebtsGrouped, getDebtsByPerson, transferToDriver,
    createManualDebt, updateManualDebt, deleteManualDebt, searchDebtOwners,
};
