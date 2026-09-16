const financialLedgerRepository = require('../repositories/financialLedgerRepository');

const EVENT_TYPE_LABEL = {
    shipment_revenue:      'Doanh thu chuyến',
    prepaid_received:      'Khách ứng trước',
    prepaid_refunded:      'Hoàn tiền ứng trước',
    cash_receipt:          'Thu tiền mặt',
    bank_receipt:          'Thu chuyển khoản',
    driver_debt_created:   'Phát sinh nợ tài xế',
    driver_debt_paid:      'Tài xế nộp tiền',
    customer_debt_created: 'Phát sinh nợ khách hàng',
    customer_payment:      'Khách hàng thanh toán',
    pass_through_cost:     'Chi hộ khách',
    // Nửa còn lại của 3388, ngược chiều với chi hộ: tiền HÀNG công ty thu giúp khách
    // khi giao, đang giữ và phải trả lại. Không phải doanh thu, không phải khách nợ.
    collect_on_behalf_held: 'Thu hộ khách (COD)',
    // Vế đóng lại: đã trả tiền thu hộ cho người bán. Hai dòng này luôn đi thành cặp —
    // nhìn hiệu số của chúng là biết công ty còn đang giữ hộ bao nhiêu.
    collect_on_behalf_returned: 'Trả tiền thu hộ cho người bán',
    expense_recorded:      'Chi phí vận hành',
    expense_reimbursed:    'Hoàn tiền tài xế đã ứng',
    payroll_paid:          'Chi lương',
    bonus_paid:            'Chi thưởng ngoài kỳ',
    advance_disbursed:     'Giải ngân ứng lương',
    advance_recovered:     'Hoàn ứng lương',
    // Hai dòng dưới đây vốn bị bỏ sót: CSDL cho phép ghi nhưng bảng nhãn không có,
    // nên trên màn Sổ nhật ký chúng hiện tên máy và ô lọc trả 400 cho đúng chúng.
    // Test B10 đối chiếu bảng này với CHECK trong CSDL để không sót lần nữa.
    debt_transferred:      'Chuyển nợ khách sang tài xế',
    opening_balance:       'Số dư đầu kỳ',
    // Tiền ứng lương vượt số lương kỳ đó (thường là kỳ lương cuối khi nghỉ việc giữa
    // tháng) → chuyển thành công nợ tài xế để kế toán thu: Nợ 1388 | Có 141
    advance_to_debt:       'Ứng lương chưa hoàn chuyển nợ tài xế',
};

// GET /api/accountant/ledger?event_type=&from=&to=&exported=&page=&pageSize=
const getJournal = async (req, res) => {
    try {
        const { event_type, from, to, exported, sort } = req.query;
        const page     = Math.max(1, Number(req.query.page) || 1);
        const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 50));

        if (event_type && !EVENT_TYPE_LABEL[event_type]) {
            return res.status(400).json({ error: 'Loại sự kiện không hợp lệ' });
        }

        const rows = await financialLedgerRepository.getJournal({
            eventType: event_type || null,
            from: from || null,
            to:   to   || null,
            exported: exported || null,
            sort: sort || null,
            limit: pageSize,
            offset: (page - 1) * pageSize,
        });

        const total = rows.length > 0 ? Number(rows[0].total_count) : 0;
        res.json({
            transactions: rows.map(({ total_count, ...r }) => ({
                ...r,
                event_label: EVENT_TYPE_LABEL[r.event_type] ?? r.event_type,
            })),
            total, page, pageSize,
            eventTypes: EVENT_TYPE_LABEL,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// GET /api/accountant/ledger/stats?from=&to=
const getJournalStats = async (req, res) => {
    try {
        const { from, to } = req.query;
        const rows = await financialLedgerRepository.getJournalStats({ from: from || null, to: to || null });
        res.json({
            stats: rows.map((r) => ({ ...r, event_label: EVENT_TYPE_LABEL[r.event_type] ?? r.event_type })),
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

const _csvEscape = (value) => {
    const s = value === null || value === undefined ? '' : String(value);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// POST /api/accountant/ledger/export  Body: { from, to }
// Chốt các bản ghi chưa export trong kỳ → CSV, đánh dấu exported_at + export_batch_id
const exportPeriod = async (req, res) => {
    try {
        const { from, to } = req.body;
        if (!from || !to) return res.status(400).json({ error: 'Vui lòng chọn kỳ kế toán (từ ngày, đến ngày)' });
        if (new Date(from) > new Date(to)) return res.status(400).json({ error: 'Từ ngày phải trước đến ngày' });

        const { batchId, rows } = await financialLedgerRepository.exportPeriod({
            from, to, accountantId: req.user.userId,
        });

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Không có bút toán nào chưa xuất trong kỳ này' });
        }

        // Không còn cột tách cước/chi hộ: sổ đã ghi sẵn hai dòng riêng (Có 3388 phần chi hộ,
        // Có 131 phần cước) ngay tại thời điểm tiền về, MISA đọc thẳng tk_co là đủ.
        // but_toan_dao: id bút toán gốc khi dòng này là bút toán điều chỉnh của kỳ đã xuất.
        const header = [
            'id', 'ngay_phat_sinh', 'loai_su_kien', 'dien_giai', 'tk_no', 'tk_co',
            'so_tien', 'but_toan_dao', 'ref_type', 'ref_id',
        ];
        const lines = rows.map((r) => [
            r.id,
            new Date(r.occurred_at).toISOString(),
            EVENT_TYPE_LABEL[r.event_type] ?? r.event_type,
            _csvEscape(r.description),
            r.debit_account,
            r.credit_account,
            r.amount,
            r.reversal_of_id ?? '',
            r.ref_type ?? '',
            r.ref_id ?? '',
        ].join(','));

        // BOM để Excel/MISA đọc đúng UTF-8 tiếng Việt
        const csv = `﻿${header.join(',')}\n${lines.join('\n')}`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${batchId}.csv"`);
        res.setHeader('X-Export-Batch-Id', batchId);
        res.send(csv);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Không có endpoint đảo bút toán thủ công. Bút toán đảo chỉ sinh ra từ luồng nghiệp vụ
// (VD: hủy xác nhận khoản nộp → debtRepository.voidRepayment vừa set debt_payments='voided'
// vừa đảo dòng sổ tương ứng). Cho sửa sổ trực tiếp sẽ khiến sổ lệch với bản ghi nghiệp vụ,
// vì không tồn tại chiều đồng bộ ngược từ sổ về nghiệp vụ.
// EVENT_TYPE_LABEL xuất ra để test đối chiếu được với danh sách CHECK trong CSDL:
// bảng này vừa là nhãn hiển thị vừa là bộ kiểm hợp lệ của tham số lọc, nên thiếu
// một dòng là hỏng cả hai chỗ cùng lúc.
module.exports = { getJournal, getJournalStats, exportPeriod, EVENT_TYPE_LABEL };
