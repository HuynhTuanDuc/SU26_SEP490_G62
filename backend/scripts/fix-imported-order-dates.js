/**
 * Sửa ngày chạy của đơn ngoài bị import sai kỳ, rồi tính lại KPI.
 *
 * Vì sao cần: file Excel để cột ngày ở định dạng kiểu Mỹ (m/d/yy). Kế toán gõ "12/8" định
 * là 12 tháng 8, Excel lưu thành serial của 8 THÁNG 12 nhưng ô vẫn hiện "12/8/26". Import
 * đọc serial (đúng) nên completed_at thành 2026-12-08 — doanh thu rơi vào KPI tháng 12,
 * bảng lương tháng 8 không thấy gì.
 *
 * Script chỉ đụng các chuyến của đơn IMPORT (orders.import_fingerprint IS NOT NULL) có
 * completed_at đúng ngày sai đã biết. KPI được tính lại cho CẢ HAI kỳ: kỳ cũ để trừ doanh
 * thu ra, kỳ mới để cộng vào.
 *
 * Dùng:
 *   node scripts/fix-imported-order-dates.js                 # chạy thử, KHÔNG ghi gì
 *   node scripts/fix-imported-order-dates.js --apply         # ghi thật
 *   ENV_FILE=.env.clouddev.local node scripts/fix-imported-order-dates.js   # chọn DB khác
 *
 * Có thể đổi ngày qua biến môi trường: FROM_DATE, TO_DATE (mặc định bên dưới).
 */
require('dotenv').config({ path: process.env.ENV_FILE || '.env' });

const pool = require('../config/database');
const kpiRepository = require('../repositories/kpiRepository');

const FROM_DATE = process.env.FROM_DATE || '2026-12-08'; // ngày bị hiểu nhầm (8 tháng 12)
const TO_DATE   = process.env.TO_DATE   || '2026-08-12'; // ngày đúng (12 tháng 8)
const APPLY     = process.argv.includes('--apply');

const { money } = require('../utils/formatNumber');

(async () => {
    console.log(`DB: ${process.env.DB_NAME}@${process.env.DB_HOST}:${process.env.DB_PORT}`);
    console.log(`Đổi ngày chạy: ${FROM_DATE}  →  ${TO_DATE}`);
    console.log(APPLY ? '*** CHẾ ĐỘ GHI THẬT ***' : '(chạy thử — không ghi gì, thêm --apply để ghi)');
    console.log('');

    const { rows: affected } = await pool.query(
        `SELECT os.id AS shipment_id, os.order_id, os.completed_at,
                os.actual_price, sc.owner_driver_id, p.full_name AS driver_name
         FROM order_shipments os
         JOIN orders o ON o.id = os.order_id
         LEFT JOIN v_shipment_current sc ON sc.shipment_id = os.id
         LEFT JOIN profiles p ON p.id = sc.owner_driver_id
         WHERE o.import_fingerprint IS NOT NULL
           AND os.completed_at::date = $1::date
         ORDER BY os.id`,
        [FROM_DATE],
    );

    if (affected.length === 0) {
        console.log('Không có chuyến nào khớp — không cần sửa.');
        await pool.end();
        return;
    }

    console.log(`Tìm thấy ${affected.length} chuyến:`);
    for (const s of affected) {
        console.log(`  chuyến #${s.shipment_id} (đơn #${s.order_id}) — ${s.driver_name ?? 'chưa gán tài'} — ${money(s.actual_price)}`);
    }

    // Tính lại KPI cho CẢ hai kỳ: kỳ cũ (trừ ra) và kỳ mới (cộng vào).
    const periods = new Set();
    const addPeriod = (iso) => { const d = new Date(iso); periods.add(`${d.getMonth() + 1}/${d.getFullYear()}`); };
    addPeriod(FROM_DATE); addPeriod(TO_DATE);
    const driverIds = [...new Set(affected.map((s) => s.owner_driver_id).filter(Boolean))];

    console.log('');
    console.log(`Sẽ tính lại KPI cho ${driverIds.length} tài xế × các kỳ: ${[...periods].join(', ')}`);

    if (!APPLY) {
        console.log('\nChạy thử xong — chưa ghi gì. Thêm --apply để thực hiện.');
        await pool.end();
        return;
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Giữ nguyên giờ trong ngày, chỉ dời phần NGÀY — tránh làm lệch thứ tự các chuyến
        // trong cùng ngày và tránh nhảy múi giờ.
        const { rowCount } = await client.query(
            `UPDATE order_shipments os
             SET completed_at = $2::date + (os.completed_at - os.completed_at::date),
                 updated_at = NOW()
             FROM orders o
             WHERE o.id = os.order_id
               AND o.import_fingerprint IS NOT NULL
               AND os.completed_at::date = $1::date`,
            [FROM_DATE, TO_DATE],
        );
        await client.query('COMMIT');
        console.log(`\nĐã cập nhật ${rowCount} chuyến.`);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Lỗi — đã rollback, không có gì thay đổi:', err.message);
        await client.release();
        await pool.end();
        process.exit(1);
    }
    client.release();

    // KPI tính ngoài transaction: recalculateDriverKPI tự mở kết nối riêng, và một lần
    // tính hỏng cũng không được kéo theo rollback phần ngày đã sửa đúng.
    for (const driverId of driverIds) {
        for (const period of periods) {
            const [m, y] = period.split('/').map(Number);
            try {
                await kpiRepository.recalculateDriverKPI(driverId, m, y);
                console.log(`  KPI tài #${driverId} kỳ ${period}: đã tính lại`);
            } catch (err) {
                console.error(`  KPI tài #${driverId} kỳ ${period}: LỖI — ${err.message}`);
            }
        }
    }

    const { rows: after } = await pool.query(
        `SELECT k.driver_id, p.full_name, k.month, k.year, k.total_revenue
         FROM kpi_records k LEFT JOIN profiles p ON p.id = k.driver_id
         WHERE k.driver_id = ANY($1::int[])
         ORDER BY k.year, k.month, k.driver_id`,
        [driverIds],
    );
    console.log('\nKPI sau khi sửa:');
    for (const r of after) {
        console.log(`  ${r.full_name} — ${r.month}/${r.year}: ${money(r.total_revenue)}`);
    }

    await pool.end();
})().catch(async (err) => {
    console.error('Lỗi:', err.message);
    await pool.end().catch(() => {});
    process.exit(1);
});
