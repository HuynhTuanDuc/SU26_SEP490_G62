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
    expense_recorded:      'Chi phí vận hành',
    payroll_paid:          'Chi lương',
    bonus_paid:            'Chi thưởng ngoài kỳ',
    advance_disbursed:     'Giải ngân ứng lương',
    advance_recovered:     'Hoàn ứng lương',
};

// GET /api/accountant/ledger?event_type=&from=&to=&exported=&page=&pageSize=
const getJournal = async (req, res) => {
    try {
        const { event_type, from, to, exported } = req.query;
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

        const header = ['id', 'ngay_phat_sinh', 'loai_su_kien', 'dien_giai', 'tk_no', 'tk_co', 'so_tien', 'ref_type', 'ref_id'];
        const lines = rows.map((r) => [
            r.id,
            new Date(r.occurred_at).toISOString(),
            EVENT_TYPE_LABEL[r.event_type] ?? r.event_type,
            _csvEscape(r.description),
            r.debit_account,
            r.credit_account,
            r.amount,
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

module.exports = { getJournal, getJournalStats, exportPeriod };
