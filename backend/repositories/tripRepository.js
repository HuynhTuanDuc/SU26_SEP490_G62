const pool = require('../config/database');
const financialLedgerRepository = require('./financialLedgerRepository');
const activityLogRepository = require('./activityLogRepository');
const { money } = require('../utils/formatNumber');
const {
    SHIPMENT_STATUS,
    ACTIVE_STATUSES,
    BLOCKING_STATUSES,
    STATUS_TIMESTAMP_COL,
    UNDO_WINDOW_MS,
    UNDOABLE_TRANSITIONS,
} = require('../constants/tripConstants');
const {
    CUSTOMER_BILLABLE_EXPENSE_SQL,
    NO_LIVE_REIMBURSEMENT_VOUCHER_SQL,
} = require('../constants/expenseConstants');

// Địa chỉ pickup/delivery lưu trong trip_stops — dùng subquery để kéo ra
const PICKUP_SUBQ  = `(SELECT ts.address FROM trip_stops ts WHERE ts.shipment_id = os.id AND ts.stop_type = 'pickup'   ORDER BY ts.stop_index ASC  LIMIT 1)`;
const DELIVERY_SUBQ = `(SELECT ts.address FROM trip_stops ts WHERE ts.shipment_id = os.id AND ts.stop_type = 'delivery' ORDER BY ts.stop_index DESC LIMIT 1)`;
const RECEIPT_PAYMENT_TYPE_SQL = `COALESCE(sr.payment_type, o.payment_type)`;

// Số tiền phiếu thu khi phiếu CHƯA chốt (sr.amount còn NULL) — chỉ để tài xế xem trước.
// Cần alias `orr` (yêu cầu phiếu thu) và `o` (đơn) ở câu truy vấn gọi nó.
//
// Dùng CHUNG cho màn DANH SÁCH và màn CHI TIẾT phiếu thu của tài xế: trước đây danh sách cộng
// chi hộ khách vào tổng còn chi tiết thì không, nên cùng một phiếu chưa duyệt hiện hai số khác
// nhau tùy tài xế đang đứng ở màn nào.
//
// Công thức phải khớp approveReceiptRequest (BR-022D): tiền ứng trước trừ vào TOÀN BỘ số phải
// trả (cước + chi hộ), KHÔNG phải trừ vào cước rồi cộng chi hộ lên trên. Hai cách chỉ khác nhau
// khi khách ứng nhiều hơn cước — mà chuyến hủy vì hàng hư hại kéo cước về 0 nên đó là chuyện
// thường, không phải ca hiếm.
//
// Chỉ trừ tiền ứng ĐÃ XÁC NHẬN: 'pending' là kế toán mới nhập, tiền chưa về và chưa ghi sổ —
// approveReceiptRequest cũng từ chối chốt phiếu trong trạng thái đó.
const PENDING_RECEIPT_AMOUNT_SQL = `GREATEST(
    (SELECT COALESCE(SUM(COALESCE(os2.actual_price, os2.estimated_price)), 0)
     FROM order_shipments os2
     WHERE os2.order_id = orr.order_id
       AND os2.status NOT IN ('cancelled', 'failed'))
    + (SELECT COALESCE(SUM(e.amount), 0)
       FROM expenses e
       JOIN order_shipments os3 ON os3.id = e.shipment_id
       WHERE os3.order_id = orr.order_id
         AND e.status != 'rejected'
         AND ${CUSTOMER_BILLABLE_EXPENSE_SQL('e', 'os3')})
    - CASE WHEN o.prepaid_status = 'confirmed' THEN COALESCE(o.prepaid_amount, 0) ELSE 0 END,
    0
)`;

// Tài xế/xe hiện tại của chuyến được suy ra từ dòng shipment_assignment_history mới nhất
// (view v_shipment_current). owner_driver_id IS NULL ⇒ chuyến đang ở pool, không ai giữ.
const CURRENT_JOIN = `LEFT JOIN v_shipment_current sc ON sc.shipment_id = os.id`;

// Ghi 1 dòng lịch sử gán xe — nguồn sự thật tài xế/xe hiện tại của chuyến
const insertAssignmentHistory = async (
    client,
    { shipmentId, fromDriverId = null, fromVehicleId = null, toDriverId = null, toVehicleId = null, changedBy, changeReason, incidentId = null, notes = null },
) => {
    await client.query(
        `INSERT INTO shipment_assignment_history
             (shipment_id, from_driver_id, from_vehicle_id, to_driver_id, to_vehicle_id,
              changed_by, change_reason, incident_id, notes, changed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
        [shipmentId, fromDriverId, fromVehicleId, toDriverId, toVehicleId, changedBy, changeReason, incidentId, notes],
    );
};

const CLAIM_DRIVER_LOCK_NS = 62001;
const CLAIM_VEHICLE_LOCK_NS = 62002;

const lockClaimResources = async (client, driverId, vehicleId) => {
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [CLAIM_DRIVER_LOCK_NS, Number(driverId)]);
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [CLAIM_VEHICLE_LOCK_NS, Number(vehicleId)]);
};

const getDriverVehicleGroupId = async (driverId) => {
    const result = await pool.query(
        `SELECT v.vehicle_group_id
         FROM drivers d
         JOIN vehicles v ON d.vehicle_id = v.id
         WHERE d.profile_id = $1`,
        [driverId],
    );
    return result.rows[0]?.vehicle_group_id ?? null;
};

const getAvailableShipments = async ({ page = 1, limit = 5, vehicleGroupId = null } = {}) => {
    const offset = (page - 1) * limit;

    const rowsWhere  = vehicleGroupId
        ? `WHERE os.status = 'available' AND sc.owner_driver_id IS NULL AND vg.id = $3`
        : `WHERE os.status = 'available' AND sc.owner_driver_id IS NULL`;
    const countWhere = vehicleGroupId
        ? `WHERE os.status = 'available' AND sc.owner_driver_id IS NULL AND vg.id = $1`
        : `WHERE os.status = 'available' AND sc.owner_driver_id IS NULL`;

    const rowsParams  = vehicleGroupId ? [limit, offset, vehicleGroupId] : [limit, offset];
    const countParams = vehicleGroupId ? [vehicleGroupId] : [];

    const [rowsResult, countResult] = await Promise.all([
        pool.query(
            `SELECT
                os.id               AS shipment_id,
                os.order_id,
                os.shipment_index,
                ${PICKUP_SUBQ}      AS pickup_address,
                ${DELIVERY_SUBQ}    AS delivery_address,
                os.cargo_weight_kg::text,
                os.estimated_price::text,
                os.notes,
                os.created_at,
                o.cargo_name,
                o.notes             AS order_notes,
                o.payment_type,
                (SELECT COUNT(*)::int
                 FROM order_shipments os2
                 WHERE os2.order_id = os.order_id) AS total_order_legs,
                vg.id               AS vehicle_group_id,
                vg.name             AS vehicle_group_name,
                vg.max_load_weight_kg
             FROM order_shipments os
             JOIN orders o          ON o.id = os.order_id
             JOIN vehicle_groups vg ON vg.id = os.vehicle_group_id
             ${CURRENT_JOIN}
             ${rowsWhere}
             ORDER BY os.created_at ASC
             LIMIT $1 OFFSET $2`,
            rowsParams,
        ),
        pool.query(
            `SELECT COUNT(*)::int AS total
             FROM order_shipments os
             JOIN orders o ON o.id = os.order_id
             JOIN vehicle_groups vg ON vg.id = os.vehicle_group_id
             ${CURRENT_JOIN}
             ${countWhere}`,
            countParams,
        ),
    ]);

    const total      = Number(countResult.rows[0]?.total ?? 0);
    const totalPages = Math.ceil(total / limit);
    return { trips: rowsResult.rows, total, page, limit, totalPages };
};

const getActiveTrip = async (driverId) => {
    const result = await pool.query(
        `SELECT
            os.id,
            os.order_id,
            os.shipment_index,
            ${PICKUP_SUBQ}   AS pickup_address,
            ${DELIVERY_SUBQ} AS delivery_address,
            os.cargo_weight_kg,
            os.estimated_price,
            os.actual_price,
            os.status,
            os.notes,
            os.version,
            os.claimed_at,
            os.picking_at,
            os.transit_at,
            os.arrived_at,
            os.completed_at,
            o.cargo_name,
            o.notes AS order_notes,
            o.payment_type AS order_payment_type,
            (
                SELECT MAX(s2.shipment_index)
                FROM order_shipments s2
                WHERE s2.order_id = os.order_id
            ) AS max_shipment_index
         FROM order_shipments os
         JOIN orders o ON os.order_id = o.id
         ${CURRENT_JOIN}
         WHERE sc.owner_driver_id = $1
           AND os.status = ANY($2::text[])
         LIMIT 1`,
        [driverId, ACTIVE_STATUSES],
    );
    if (!result.rows[0]) return null;
    const row = result.rows[0];

    // Attach stops array (BR-011 — driver sees ordered stops for active trip)
    const stopsResult = await pool.query(
        `SELECT id, stop_index, stop_type, address, contact_name, contact_phone, arrived_at, completed_at, proof_url
         FROM trip_stops
         WHERE shipment_id = $1
         ORDER BY stop_index ASC`,
        [row.id],
    );

    return {
        ...row,
        is_final_shipment: Number(row.shipment_index) === Number(row.max_shipment_index),
        stops: stopsResult.rows,
    };
};

const getTripById = async (tripId) => {
    const result = await pool.query(
        `SELECT os.*, sc.owner_driver_id, sc.vehicle_id,
                o.cargo_name, o.notes AS order_notes,
                (SELECT ts.completed_at
                 FROM trip_stops ts
                 WHERE ts.shipment_id = os.id
                   AND ts.stop_type = 'pickup'
                 ORDER BY ts.stop_index ASC
                 LIMIT 1) AS pickup_completed_at
         FROM order_shipments os
         JOIN orders o ON os.order_id = o.id
         ${CURRENT_JOIN}
         WHERE os.id = $1`,
        [tripId],
    );
    return result.rows[0] ?? null;
};

const getTripByIdForUpdate = async (client, tripId) => {
    const result = await client.query(
        `SELECT os.*, sc.owner_driver_id, sc.vehicle_id,
                o.cargo_name, o.notes AS order_notes,
                (SELECT ts.completed_at
                 FROM trip_stops ts
                 WHERE ts.shipment_id = os.id
                   AND ts.stop_type = 'pickup'
                 ORDER BY ts.stop_index ASC
                 LIMIT 1) AS pickup_completed_at
         FROM order_shipments os
         JOIN orders o ON os.order_id = o.id
         ${CURRENT_JOIN}
         WHERE os.id = $1
         FOR UPDATE OF os`,
        [tripId],
    );
    return result.rows[0] ?? null;
};

// Trả về trip với đầy đủ thông tin như getActiveTrip (có order_payment_type, is_final_shipment)
// Dùng sau khi update status để trả về response đúng cho mobile
//
// is_final_shipment TRƯỚC ĐÂY tự tính SQL riêng ở đây (chỉ so status, không kiểm tra km
// đã nhập hay chưa) — LỆCH với công thức thật sự dùng để tạo yêu cầu phiếu thu ở
// getShipmentFinalStatus/requestOrderReceipt (có thêm điều kiện actual_distance_km). Mobile
// dựa vào field này để quyết định có hiện màn "gửi yêu cầu phiếu thu" hay không
// (needsReceiptRequest = trip.is_final_shipment && payment_type === 'cash'), nên lệch công
// thức nghĩa là UI có thể mời gửi yêu cầu ngay cả khi server sẽ từ chối vì chuyến khác chưa
// nhập km. Nay dùng LẠI đúng getShipmentFinalStatus để 2 nơi không bao giờ lệch nhau nữa.
const getFullTripById = async (tripId) => {
    const result = await pool.query(
        `SELECT
            os.id,
            os.order_id,
            os.shipment_index,
            ${PICKUP_SUBQ}   AS pickup_address,
            ${DELIVERY_SUBQ} AS delivery_address,
            os.cargo_weight_kg,
            os.estimated_price,
            os.actual_price,
            os.status,
            os.notes,
            os.version,
            os.claimed_at,
            os.picking_at,
            os.transit_at,
            os.arrived_at,
            os.completed_at,
            o.cargo_name,
            o.notes AS order_notes,
            o.payment_type AS order_payment_type,
            (
                SELECT MAX(s2.shipment_index)
                FROM order_shipments s2
                WHERE s2.order_id = os.order_id
            ) AS max_shipment_index
         FROM order_shipments os
         JOIN orders o ON os.order_id = o.id
         WHERE os.id = $1`,
        [tripId],
    );
    if (!result.rows[0]) return null;
    const row = result.rows[0];

    const { isMaxIndex, allOthersReady } = await getShipmentFinalStatus(tripId);
    return { ...row, is_final_shipment: isMaxIndex && allOthersReady };
};

const claimShipment = async (shipmentId, driverId, vehicleId) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await lockClaimResources(client, driverId, vehicleId);

        const vehicleCheck = await client.query(
            `SELECT
                v.id,
                v.plate_number,
                v.status,
                v.assigned_driver_id,
                v.vehicle_group_id,
                d.vehicle_id AS driver_vehicle_id
             FROM vehicles v
             JOIN drivers d ON d.profile_id = $2
             WHERE v.id = $1
             LIMIT 1`,
            [vehicleId, driverId],
        );
        const vehicle = vehicleCheck.rows[0];
        if (!vehicle || Number(vehicle.assigned_driver_id) !== Number(driverId) || Number(vehicle.driver_vehicle_id) !== Number(vehicleId)) {
            await client.query('ROLLBACK');
            throw new Error('DRIVER_VEHICLE_MISMATCH');
        }
        if (vehicle.status !== 'active') {
            await client.query('ROLLBACK');
            throw new Error('VEHICLE_UNAVAILABLE');
        }

        const vehicleMaintenanceCheck = await client.query(
            `SELECT id
             FROM maintenance_records
             WHERE vehicle_id = $1
               AND status IN ('open', 'pending_verification')
             LIMIT 1`,
            [vehicleId],
        );
        if (vehicleMaintenanceCheck.rows[0]) {
            await client.query('ROLLBACK');
            throw new Error('VEHICLE_MAINTENANCE');
        }

        const driverMaintenanceCheck = await client.query(
            `SELECT id
             FROM maintenance_records
             WHERE performed_by = $1
               AND vehicle_id <> $2
               AND status IN ('open', 'pending_verification')
             LIMIT 1`,
            [driverId, vehicleId],
        );
        if (driverMaintenanceCheck.rows[0]) {
            await client.query('ROLLBACK');
            throw new Error('DRIVER_MAINTENANCE');
        }

        const activeVehicleCheck = await client.query(
            `SELECT os.id FROM order_shipments os
             JOIN v_shipment_current sc ON sc.shipment_id = os.id
             WHERE sc.vehicle_id = $1
               AND os.status = ANY($2::text[])
             LIMIT 1`,
            [vehicleId, ACTIVE_STATUSES],
        );
        if (activeVehicleCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            throw new Error('ACTIVE_VEHICLE_TRIP');
        }

        const activeCheck = await client.query(
            `SELECT os.id FROM order_shipments os
             JOIN v_shipment_current sc ON sc.shipment_id = os.id
             WHERE sc.owner_driver_id = $1
               AND os.status = ANY($2::text[])
             LIMIT 1`,
            [driverId, ACTIVE_STATUSES],
        );
        if (activeCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            throw new Error('ACTIVE_TRIP');
        }

        const locked = await client.query(
            `SELECT os.id, os.order_id, os.status, os.vehicle_group_id, sc.owner_driver_id
             FROM order_shipments os
             LEFT JOIN v_shipment_current sc ON sc.shipment_id = os.id
             WHERE os.id = $1
             FOR UPDATE OF os`,
            [shipmentId],
        );
        if (!locked.rows[0]) {
            await client.query('ROLLBACK');
            return null;
        }
        const { order_id, status, owner_driver_id, vehicle_group_id } = locked.rows[0];

        if (status !== 'available' || owner_driver_id !== null) {
            await client.query('ROLLBACK');
            return null;
        }

        // BR-003: xe đang lái phải đúng nhóm xe mà chuyến yêu cầu.
        // Trip pool đã lọc theo nhóm nên giao diện không bao giờ hiện chuyến sai nhóm,
        // nhưng đó chỉ là lọc HIỂN THỊ — gọi thẳng API với id chuyến vẫn nhận được.
        // Bỏ qua nhóm là bỏ qua luôn giới hạn tải trọng (max_load_weight_kg của nhóm),
        // nên phải chặn ở tầng ghi. Cả dòng xe lẫn dòng chuyến đều đã nằm trong
        // transaction này và đã được advisory lock giữ, nên so ở đây là an toàn với
        // trường hợp điều phối đổi xe đúng lúc tài đang bấm nhận.
        if (Number(vehicle_group_id) !== Number(vehicle.vehicle_group_id)) {
            await client.query('ROLLBACK');
            throw new Error('VEHICLE_GROUP_MISMATCH');
        }

        // Chặn nếu driver đang có active trip trong CÙNG order (không chặn nếu đã hoàn thành)
        const sameOrderCheck = await client.query(
            `SELECT os.id FROM order_shipments os
             JOIN v_shipment_current sc ON sc.shipment_id = os.id
             WHERE os.order_id = $1
               AND sc.owner_driver_id = $2
               AND os.status = ANY($3::text[])
             LIMIT 1`,
            [order_id, driverId, ACTIVE_STATUSES],
        );
        if (sameOrderCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            throw new Error('SAME_ORDER');
        }

        const result = await client.query(
            `UPDATE order_shipments
             SET status          = $1,
                 claimed_at      = NOW(),
                 version         = version + 1,
                 updated_at      = NOW()
             WHERE id = $2
             RETURNING *`,
            [SHIPMENT_STATUS.CLAIMED, shipmentId],
        );
        const claimed = result.rows[0];

        await insertAssignmentHistory(client, {
            shipmentId: claimed.id,
            toDriverId: driverId,
            toVehicleId: vehicleId,
            changedBy: driverId,
            changeReason: 'self_claim',
        });

        await client.query('COMMIT');
        return claimed;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

// Coordinator xử lý chuyến giao thất bại.
//
// action='redeliver' → về TRANSIT, tài đi giao lại (xoá dấu thất bại để chuyến chạy
//                      lại bình thường; cancel_reason giữ nguyên làm vết audit).
// action='return'    → sang RETURNING, tài chở hàng về điểm lấy.
//
// Không ghi actual_price ở đây: lúc này tài xế CHƯA khai km thực tế. Giá chỉ chốt
// khi coordinator duyệt phiếu thu — computeReceiptAmount thấy returning_at khác NULL
// thì nhân đôi (km × đơn giá × 2) vì tài chạy cả chiều đi lẫn chiều về.
const resolveFailedShipment = async ({ shipmentId, action, coordinatorId }) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const lockedResult = await client.query(
            `SELECT id, status, order_id FROM order_shipments WHERE id = $1 FOR UPDATE`,
            [shipmentId],
        );
        const shipment = lockedResult.rows[0];
        if (!shipment) {
            await client.query('ROLLBACK');
            throw new Error('SHIPMENT_NOT_FOUND');
        }
        if (shipment.status !== SHIPMENT_STATUS.FAILED) {
            await client.query('ROLLBACK');
            throw new Error('NOT_FAILED');
        }

        let updated;
        if (action === 'redeliver') {
            const res = await client.query(
                `UPDATE order_shipments
                 SET status = $2,
                     failed_at = NULL,
                     failed_resolved_by = $3,
                     failed_resolved_at = NOW(),
                     version = version + 1,
                     updated_at = NOW()
                 WHERE id = $1
                 RETURNING *`,
                [shipmentId, SHIPMENT_STATUS.TRANSIT, coordinatorId],
            );
            updated = res.rows[0];
        } else {
            // Hoàn hàng: tài chạy CẢ HAI CHIỀU nên chuyến được tính GẤP ĐÔI cước.
            // Không ghi actual_price ở đây vì lúc này tài xế CHƯA khai km thực tế —
            // computeReceiptAmount sẽ nhân đôi khi thấy returning_at IS NOT NULL.
            // returning_at chính là dấu hiệu duy nhất, không cần cột phụ nào.
            const res = await client.query(
                `UPDATE order_shipments
                 SET status = $2,
                     returning_at = NOW(),
                     failed_resolved_by = $3,
                     failed_resolved_at = NOW(),
                     version = version + 1,
                     updated_at = NOW()
                 WHERE id = $1
                 RETURNING *`,
                [shipmentId, SHIPMENT_STATUS.RETURNING, coordinatorId],
            );
            updated = res.rows[0];
        }

        await client.query('COMMIT');

        // Audit cùng cơ chế với updateTripStatus (không có bảng shipment_status_history)
        activityLogRepository.logSafe({
            userId: coordinatorId,
            action: 'trip_failed_resolved',
            entityType: 'shipment',
            entityId: shipmentId,
            oldData: { status: SHIPMENT_STATUS.FAILED },
            newData: {
                status: updated.status,
                resolution: action,
            },
        });

        return updated;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

// Tính lại orders.derived_status dựa trên TOÀN BỘ chuyến của đơn — nguồn sự thật DUY
// NHẤT cho việc đơn đã đóng hay chưa. Trước đây có 2 nơi tự quyết định việc này theo
// 2 kiểu khác nhau và đều thiếu sót khi đơn có nhiều chuyến / nhiều tài xế:
//  - activateNextShipment chỉ nhìn "tài này còn chuyến kế tiếp không", coi đơn xong ngay
//    khi 1 tài hết việc — dù chuyến khác của đơn (do tài khác giữ) vẫn đang chạy.
//  - returnComplete chỉ đóng đơn khi CHÍNH chuyến vừa xong có shipment_index lớn nhất
//    (isFinalShipment) — nếu chuyến index lớn nhất lại là chuyến vừa bị hủy (vd. do sự
//    cố hàng hư hỏng), không chuyến nào còn lại thoả điều kiện này nữa → đơn treo mãi.
// Gọi hàm này sau MỌI lần 1 chuyến chuyển sang trạng thái kết thúc (completed/cancelled)
// để đơn luôn phản ánh đúng thực tế, không phụ thuộc thứ tự index hay driver nào vừa xong.
//
// Chỉ đóng đơn khi TẤT CẢ chuyến đã kết thúc (completed/cancelled) — còn chuyến đang
// chạy (kể cả của tài khác) thì giữ nguyên, chưa đóng:
//  - tất cả 'cancelled'                          → đơn 'cancelled'
//  - tất cả 'completed'                          → đơn 'completed'
//  - trộn completed + cancelled                  → đơn 'partial' (giao được một phần —
//    dùng đúng giá trị đã có sẵn trong CHECK constraint của orders.derived_status)
// Trả về trạng thái mới nếu có thay đổi, null nếu đơn vẫn còn chuyến đang chạy.
const recomputeOrderDerivedStatus = async (orderId, client = pool) => {
    const { rows: siblings } = await client.query(
        `SELECT status FROM order_shipments WHERE order_id = $1`,
        [orderId],
    );
    if (siblings.length === 0) return null;

    const isTerminal = (s) => [SHIPMENT_STATUS.COMPLETED, SHIPMENT_STATUS.CANCELLED].includes(s);
    if (!siblings.every((s) => isTerminal(s.status))) return null;

    const allCancelled = siblings.every((s) => s.status === SHIPMENT_STATUS.CANCELLED);
    const allCompleted = siblings.every((s) => s.status === SHIPMENT_STATUS.COMPLETED);
    const newStatus = allCancelled ? 'cancelled' : allCompleted ? 'completed' : 'partial';

    await client.query(
        `UPDATE orders SET derived_status = $2, updated_at = NOW() WHERE id = $1`,
        [orderId, newStatus],
    );
    return newStatus;
};

// Hủy 1 chuyến do sự cố "hàng hóa hư hại" (luồng Incident) — cho phép hủy ở BẤT KỲ
// trạng thái chưa kết thúc, kể cả đã lấy hàng/đang vận chuyển/đang hoàn hàng (khác
// coordinatorService.cancelShipment thông thường, hàm này còn tính lại trạng thái đơn
// ngay trong cùng transaction để đơn không bị "treo" sau khi chuyến bị hủy).
const cancelShipmentForCargoDamage = async ({ shipmentId, reason, coordinatorId }) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows: [shipment] } = await client.query(
            `SELECT id, status, order_id FROM order_shipments WHERE id = $1 FOR UPDATE`,
            [shipmentId],
        );
        if (!shipment) {
            await client.query('ROLLBACK');
            throw new Error('SHIPMENT_NOT_FOUND');
        }
        if ([SHIPMENT_STATUS.COMPLETED, SHIPMENT_STATUS.CANCELLED].includes(shipment.status)) {
            await client.query('ROLLBACK');
            throw new Error('ALREADY_TERMINAL');
        }

        const { rows: [updated] } = await client.query(
            `UPDATE order_shipments
             SET status = $2, cancel_reason = $3, cancelled_at = NOW(),
                 version = version + 1, updated_at = NOW()
             WHERE id = $1
             RETURNING *`,
            [shipmentId, SHIPMENT_STATUS.CANCELLED, reason],
        );

        // Chi phí của chuyến này có thể ĐÃ được duyệt (và ghi Nợ 3388 — chi hộ, phải thu
        // lại của khách) trước khi hàng hư. Hủy chuyến là lúc phiếu thu thôi đòi khách
        // khoản đó, nên phải chuyển sang Nợ 642 (DN chịu): để nguyên 3388 là treo một
        // khoản phải thu không bao giờ có ai trả. Tài xế vẫn được hoàn đủ tiền đã ứng —
        // chỉ đổi bên chịu chi phí.
        await financialLedgerRepository.reclassPassThroughToCompany(client, {
            shipmentId,
            reason: `Hủy chuyến #${shipmentId} vì hàng hư hại — chi hộ chuyển sang DN chịu`,
            actorId: coordinatorId,
        });

        await recomputeOrderDerivedStatus(shipment.order_id, client);

        await client.query('COMMIT');

        activityLogRepository.logSafe({
            userId: coordinatorId,
            action: 'trip_cancelled_cargo_damage',
            entityType: 'shipment',
            entityId: shipmentId,
            oldData: { status: shipment.status },
            newData: { status: updated.status, reason },
        });

        return updated;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

/// Coordinator gán TRƯỚC nhiều chuyến của CÙNG một order cho một tài xế.
//
// Cách hoạt động: ghi shipment_assignment_history (⇒ v_shipment_current.owner_driver_id
// trỏ về tài) nhưng GIỮ os.status = 'available' cho các chuyến sau. Chuyến có
// shipment_index nhỏ nhất được đưa lên 'claimed' luôn để tài chạy ngay; xong chuyến đó
// thì activateNextShipment tự kích hoạt chuyến kế tiếp. Nhờ vậy tài chỉ có 1 chuyến
// active tại một thời điểm (giữ BR-005) nhưng vẫn "nhận" cả 2/3/4 chuyến của đơn.
//
// getAvailableShipments lọc owner_driver_id IS NULL nên các chuyến đã pre-assign tự
// biến khỏi trip pool của tài khác — không cần đổi gì ở đó.
//
// XE RỜI KHỎI KHÁI NIỆM "XE BIÊN CHẾ CỦA TÀI". vehicleId truyền vào đây là xe CHẠY
// CHUYẾN NÀY, không nhất thiết là drivers.vehicle_id của tài. Bảng
// shipment_assignment_history vốn đã lưu to_vehicle_id theo từng chuyến nên hạ tầng
// không phải đổi — chỉ các guard cũ là ép hai khái niệm đó phải bằng nhau. Hệ quả có
// chủ ý: KHÔNG còn đối chiếu vehicles.assigned_driver_id ↔ drivers.vehicle_id ở đây.
//
// NHÓM XE KHÔNG CÒN LÀ RÀNG BUỘC ĐIỀU PHỐI. Trước đây chuyến chỉ nhận được xe cùng
// os.vehicle_group_id; giờ gán được xe bất kỳ miễn xe và tài đều SẴN SÀNG.
// os.vehicle_group_id giữ đúng MỘT vai trò là cơ sở tính cước (xem saveShipmentActualKm
// và getOrderShipments) — gán xe khác nhóm không được phép làm đổi giá đã chốt với khách.
//
// Điều kiện SẴN SÀNG (đối xứng với claimShipment và reassignShipmentAfterIncident):
//   xe  — status = 'active', không có phiếu bảo trì đang mở, không vướng chuyến khác
//   tài — không vướng chuyến của đơn khác, không đang phụ trách bảo trì xe khác
//
// CỐ Ý KHÔNG KIỂM TẢI TRỌNG. Phép so nhóm xe cũ vô tình là thứ duy nhất thực thi giới
// hạn tải (vehicle_groups.max_load_weight_kg chưa từng được dùng để chặn ở bất kỳ đâu),
// nên gỡ nó đi là gỡ luôn lớp bảo vệ đó. Nhóm dự án đã cân nhắc và chốt: điều phối viên
// tự chịu trách nhiệm chọn xe đủ tải, hệ thống không chặn. Đừng thêm guard tải trọng vào
// đây như một "lỗi bỏ sót" — nếu muốn đổi thì đổi ở cấp quyết định nghiệp vụ trước.
//
// Ràng buộc còn giữ: chỉ gán nhiều chuyến trong CÙNG order. Tài đang vướng chuyến của
// order khác (đang chạy, đang treo 'failed', hoặc đã được pre-assign) thì chặn.
const assignOrderShipmentsToDriver = async ({ orderId, shipmentIds, driverId, vehicleId, coordinatorId }) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Cùng advisory lock với claimShipment — nếu không, tài xế tự claim đúng lúc
        // coordinator đang gán thì hai bên cùng đọc "chưa có chuyến nào" rồi cùng ghi.
        await lockClaimResources(client, driverId, vehicleId);

        // Khoá toàn bộ chuyến của order để hai coordinator không gán chồng nhau
        const lockedResult = await client.query(
            `SELECT os.id, os.shipment_index, os.status, os.vehicle_group_id,
                    sc.owner_driver_id, sc.vehicle_id
             FROM order_shipments os
             LEFT JOIN v_shipment_current sc ON sc.shipment_id = os.id
             WHERE os.order_id = $1
             ORDER BY os.shipment_index ASC
             FOR UPDATE OF os`,
            [orderId],
        );
        const orderShipments = lockedResult.rows;
        if (orderShipments.length === 0) {
            await client.query('ROLLBACK');
            throw new Error('ORDER_NOT_FOUND');
        }

        const byId = new Map(orderShipments.map((s) => [Number(s.id), s]));
        const targets = [];
        for (const rawId of shipmentIds) {
            const shipment = byId.get(Number(rawId));
            if (!shipment) {
                await client.query('ROLLBACK');
                throw new Error('SHIPMENT_NOT_IN_ORDER');
            }
            if (shipment.status !== SHIPMENT_STATUS.AVAILABLE || shipment.owner_driver_id !== null) {
                await client.query('ROLLBACK');
                throw new Error('SHIPMENT_NOT_ASSIGNABLE');
            }
            targets.push(shipment);
        }

        // ── Xe có sẵn sàng không ─────────────────────────────────────────────
        // KHÔNG kiểm assigned_driver_id: xe chạy chuyến này không cần là xe biên chế
        // của tài. Chỉ hỏi đúng ba câu: xe còn dùng được, không nằm xưởng, không kẹt
        // chuyến khác.
        const vehicleResult = await client.query(
            `SELECT id, plate_number, status FROM vehicles WHERE id = $1`,
            [vehicleId],
        );
        const vehicle = vehicleResult.rows[0];
        if (!vehicle) {
            await client.query('ROLLBACK');
            throw new Error('VEHICLE_NOT_FOUND');
        }
        if (vehicle.status !== 'active') {
            await client.query('ROLLBACK');
            const err = new Error('VEHICLE_UNAVAILABLE');
            err.plateNumber = vehicle.plate_number;
            err.vehicleStatus = vehicle.status;
            throw err;
        }

        const vehicleMaintenanceResult = await client.query(
            `SELECT id FROM maintenance_records
             WHERE vehicle_id = $1 AND status IN ('open', 'pending_verification')
             LIMIT 1`,
            [vehicleId],
        );
        if (vehicleMaintenanceResult.rows[0]) {
            await client.query('ROLLBACK');
            const err = new Error('VEHICLE_MAINTENANCE');
            err.plateNumber = vehicle.plate_number;
            throw err;
        }

        // ── Tài có sẵn sàng không ────────────────────────────────────────────
        const driverMaintenanceResult = await client.query(
            `SELECT id FROM maintenance_records
             WHERE performed_by = $1 AND vehicle_id <> $2
               AND status IN ('open', 'pending_verification')
             LIMIT 1`,
            [driverId, vehicleId],
        );
        if (driverMaintenanceResult.rows[0]) {
            await client.query('ROLLBACK');
            throw new Error('DRIVER_MAINTENANCE');
        }

        // Vướng order khác: đang chạy, đang treo 'failed' (chờ coordinator xử lý — cả
        // hai hướng xử lý đều đưa chuyến về chạy tiếp), HOẶC đã pre-assign.
        const otherOrderResult = await client.query(
            `SELECT os.order_id
             FROM order_shipments os
             JOIN v_shipment_current sc ON sc.shipment_id = os.id
             WHERE sc.owner_driver_id = $1
               AND os.order_id <> $2
               AND (os.status = ANY($3::text[]) OR os.status = 'available')
             LIMIT 1`,
            [driverId, orderId, BLOCKING_STATUSES],
        );
        if (otherOrderResult.rows[0]) {
            await client.query('ROLLBACK');
            const err = new Error('OTHER_ORDER_ACTIVE');
            err.conflictingOrderId = otherOrderResult.rows[0].order_id;
            throw err;
        }

        // Xe đang vướng chuyến của order khác. Tính CẢ chuyến đã pre-assign ('available'
        // + có owner) cho đối xứng với guard của tài ngay trên: xe rời khỏi biên chế
        // nghĩa là hai tài khác nhau có thể cùng nhắm một chiếc xe, nên nếu chỉ chặn
        // chuyến đang chạy thì một xe pre-assign được vào hai đơn cùng lúc.
        const vehicleBusyResult = await client.query(
            `SELECT os.order_id
             FROM order_shipments os
             JOIN v_shipment_current sc ON sc.shipment_id = os.id
             WHERE sc.vehicle_id = $1
               AND os.order_id <> $2
               AND (os.status = ANY($3::text[]) OR os.status = 'available')
             LIMIT 1`,
            [vehicleId, orderId, BLOCKING_STATUSES],
        );
        if (vehicleBusyResult.rows[0]) {
            await client.query('ROLLBACK');
            const err = new Error('VEHICLE_BUSY_OTHER_ORDER');
            err.conflictingOrderId = vehicleBusyResult.rows[0].order_id;
            err.plateNumber = vehicle.plate_number;
            throw err;
        }

        for (const shipment of targets) {
            // fromVehicleId: chuyến có thể đã mang sẵn một xe mà chưa có tài (lúc tạo đơn
            // chọn BKS của xe chưa gán tài xế nào). Ghi lại để lịch sử đổi xe không đứt đoạn.
            await insertAssignmentHistory(client, {
                shipmentId: shipment.id,
                fromVehicleId: shipment.vehicle_id ?? null,
                toDriverId: driverId,
                toVehicleId: vehicleId,
                changedBy: coordinatorId,
                changeReason: 'initial_assign',
                notes: 'Điều phối viên gán trước chuyến trong đơn',
            });
        }

        // Chỉ kích hoạt ngay nếu tài chưa có chuyến nào còn giữ chân trong đơn này —
        // giữ đúng nguyên tắc 1 chuyến active tại một thời điểm. Dùng BLOCKING_STATUSES
        // để chuyến 'failed' chưa xử lý cũng được tính là còn dở dang.
        const hasBlockingInOrder = orderShipments.some((s) => BLOCKING_STATUSES.includes(s.status)
            && Number(s.owner_driver_id) === Number(driverId));

        let activated = null;
        if (!hasBlockingInOrder) {
            const first = targets.reduce(
                (min, s) => (min === null || s.shipment_index < min.shipment_index ? s : min),
                null,
            );
            const activateResult = await client.query(
                `UPDATE order_shipments
                 SET status = $1, claimed_at = NOW(), version = version + 1, updated_at = NOW()
                 WHERE id = $2
                 RETURNING *`,
                [SHIPMENT_STATUS.CLAIMED, first.id],
            );
            activated = activateResult.rows[0];
        }

        await client.query('COMMIT');
        return {
            assignedShipmentIds: targets.map((s) => Number(s.id)),
            activatedShipmentId: activated ? Number(activated.id) : null,
        };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

const activateNextShipment = async (completedShipmentId, driverId, vehicleId) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const cur = await client.query(
            `SELECT order_id, shipment_index FROM order_shipments WHERE id = $1`,
            [completedShipmentId],
        );
        if (!cur.rows[0]) { await client.query('ROLLBACK'); return null; }

        const { order_id, shipment_index } = cur.rows[0];

        // Chỉ auto-activate nếu coordinator đã pre-assign chuyến tiếp cho driver này
        // (history hiện tại trỏ owner = driverId AND status = 'available')
        // Pool trips (chưa gán) không auto-activate — driver tự claim từ pool
        const nextResult = await client.query(
            `UPDATE order_shipments os
             SET status     = $1,
                 claimed_at = NOW(),
                 version    = version + 1,
                 updated_at = NOW()
             FROM v_shipment_current sc
             WHERE sc.shipment_id = os.id
               AND os.order_id        = $2
               AND sc.owner_driver_id = $3
               AND os.status          = 'available'
               AND os.shipment_index  = (
                   SELECT MIN(os2.shipment_index)
                   FROM order_shipments os2
                   JOIN v_shipment_current sc2 ON sc2.shipment_id = os2.id
                   WHERE os2.order_id = $2
                     AND os2.shipment_index > $4
                     AND sc2.owner_driver_id = $3
               )
             RETURNING os.*`,
            [SHIPMENT_STATUS.CLAIMED, order_id, driverId, shipment_index],
        );

        if (nextResult.rows[0]) {
            const next = nextResult.rows[0];
            await client.query('COMMIT');
            return next;
        }

        // Tài này hết chuyến kế tiếp — nhưng đơn có thể còn chuyến khác đang chạy bởi
        // tài khác, nên KHÔNG tự đóng đơn ở đây mà tính lại từ TOÀN BỘ chuyến của đơn.
        await recomputeOrderDerivedStatus(order_id, client);
        await client.query('COMMIT');
        return null;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

// Đổi trạng thái chuyến — NGUYÊN TỬ.
//
// Trước đây hàm này chạy 3-5 câu lệnh rời qua pool: đổi status xong mà cập nhật
// trip_stops lỗi thì chuyến đã sang trạng thái mới trong khi các stop còn dở. Nay gói
// hết vào một giao dịch, và điều đó còn mở đường cho hoàn tác: trong cùng một giao
// dịch, NOW() của Postgres là MỘT giá trị duy nhất, nên dấu thời gian trên
// order_shipments và trên trip_stops bằng nhau tuyệt đối. Nhờ vậy undoTransition biết
// chính xác dòng trip_stops nào do bước này đặt, dòng nào tài xế đã tự bấm từ trước —
// chỉ xoá đúng phần của bước bị lùi.
//
// expectedVersion: khoá lạc quan. Cột `version` trước đây được +1 ở nhiều nơi nhưng
// không chỗ nào KIỂM — tăng mà không đọc thì không phải khoá. Client gửi version nó
// đang thấy; lệch nghĩa là có người/thiết bị khác vừa đổi chuyến, phải tải lại thay vì
// ghi đè. Để null thì bỏ qua, giữ đường cũ cho client chưa cập nhật.
const updateTripStatus = async (tripId, newStatus, cancelReason = null, actorId = null, expectedVersion = null) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows: [prev] } = await client.query(
            `SELECT status, version FROM order_shipments WHERE id = $1 FOR UPDATE`,
            [tripId],
        );
        if (!prev) throw new Error('Chuyến không tồn tại');

        if (expectedVersion !== null && expectedVersion !== undefined
            && Number(prev.version) !== Number(expectedVersion)) {
            const err = new Error('STALE_VERSION:Chuyến vừa được cập nhật ở nơi khác — hãy tải lại trước khi thao tác tiếp');
            err.code = 'STALE_VERSION';
            throw err;
        }

        // tsCol lấy từ bảng đông cứng STATUS_TIMESTAMP_COL nên nội suy vào SQL an toàn
        const tsCol = STATUS_TIMESTAMP_COL[newStatus];
        const sets = ['status = $2', 'updated_at = NOW()', 'version = version + 1'];
        const params = [tripId, newStatus];
        if (cancelReason) {
            params.push(cancelReason);
            sets.push(`cancel_reason = $${params.length}`);
        }
        if (tsCol) sets.push(`${tsCol} = NOW()`);

        const { rows: [row] } = await client.query(
            `UPDATE order_shipments SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
            params,
        );

        // Cập nhật mốc trip_stops theo vòng đời (chuyến A→B đơn giản thì tài xế không
        // bấm từng stop). Cùng giao dịch ⇒ cùng NOW() với các cột ở trên.
        if (newStatus === 'picking') {
            await client.query(
                `UPDATE trip_stops SET arrived_at = NOW()
                 WHERE shipment_id = $1 AND stop_type = 'pickup' AND arrived_at IS NULL
                   AND stop_index = (SELECT MIN(stop_index) FROM trip_stops WHERE shipment_id = $1 AND stop_type = 'pickup')`,
                [tripId],
            );
        } else if (newStatus === 'transit') {
            await client.query(
                `UPDATE trip_stops SET arrived_at = COALESCE(arrived_at, NOW()), completed_at = NOW()
                 WHERE shipment_id = $1 AND stop_type = 'pickup' AND completed_at IS NULL`,
                [tripId],
            );
        } else if (newStatus === 'arrived') {
            await client.query(
                `UPDATE trip_stops SET arrived_at = NOW()
                 WHERE shipment_id = $1 AND stop_type = 'delivery' AND arrived_at IS NULL
                   AND stop_index = (SELECT MIN(stop_index) FROM trip_stops WHERE shipment_id = $1 AND stop_type = 'delivery' AND arrived_at IS NULL)`,
                [tripId],
            );
        } else if (newStatus === 'completed') {
            await client.query(
                `UPDATE trip_stops SET arrived_at = COALESCE(arrived_at, NOW()), completed_at = NOW()
                 WHERE shipment_id = $1 AND stop_type = 'delivery' AND completed_at IS NULL`,
                [tripId],
            );
        }

        await client.query('COMMIT');

        // Audit: ai đổi trạng thái chuyến, từ status nào → status nào
        activityLogRepository.logSafe({
            userId: actorId,
            action: 'trip_status_change',
            entityType: 'shipment',
            entityId: tripId,
            oldData: { status: prev.status, version: Number(prev.version) },
            newData: {
                status: newStatus,
                version: Number(row.version),
                ...(cancelReason ? { cancel_reason: cancelReason } : {}),
            },
        });

        return row;
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        client.release();
    }
};

// Hoàn tác MỘT bước trạng thái vừa bấm nhầm (tầng 1 — tài xế tự làm tự lùi).
//
// Mọi kiểm tra nằm TRONG giao dịch, sau khi đã giữ khoá dòng. Đọc cửa sổ thời gian
// trước rồi mới khoá thì hai lần bấm sát nhau đều thấy "còn hạn" và cùng lùi.
//
// Cách nhận diện phần cần dọn: so BẰNG dấu thời gian của bước bị lùi. Dòng trip_stops
// nào mang đúng mốc đó là do bước này đặt; dòng tài xế đã tự bấm trước đó mang mốc
// khác nên giữ nguyên. Đây chính là lý do updateTripStatus phải nguyên tử.
const undoTransition = async (tripId, driverId, { expectedVersion } = {}) => {
    // BẮT BUỘC, khác với updateTripStatus (nơi version là tuỳ chọn để không phá client cũ).
    // Đây là API mới nên không có client cũ để giữ, mà thiếu nó thì một cú bấm đúp lúc
    // mạng lag sẽ lùi HAI bước: lệnh thứ hai đợi khoá xong, đọc lại thấy trạng thái đã
    // lùi một nấc, và nấc đó cũng nằm trong bảng hoàn tác nên nó lùi tiếp. Gửi cùng một
    // version hai lần thì lệnh sau chết ở đây, đúng như mong muốn.
    if (expectedVersion === null || expectedVersion === undefined) {
        throw new Error('VERSION_REQUIRED:Thiếu số phiên bản chuyến — hãy tải lại rồi thử lại');
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows: [trip] } = await client.query(
            `SELECT os.id, os.order_id, os.status, os.version,
                    os.picking_at, os.transit_at, os.arrived_at,
                    sc.owner_driver_id,
                    EXTRACT(EPOCH FROM (NOW() - os.picking_at)) * 1000 AS picking_age_ms,
                    EXTRACT(EPOCH FROM (NOW() - os.transit_at)) * 1000 AS transit_age_ms,
                    EXTRACT(EPOCH FROM (NOW() - os.arrived_at)) * 1000 AS arrived_age_ms
             FROM order_shipments os
             LEFT JOIN v_shipment_current sc ON sc.shipment_id = os.id
             WHERE os.id = $1
             FOR UPDATE OF os`,
            [tripId],
        );
        if (!trip) throw new Error('NOT_FOUND:Chuyến không tồn tại');
        if (Number(trip.owner_driver_id) !== Number(driverId)) {
            throw new Error('FORBIDDEN:Bạn không có quyền hoàn tác chuyến này');
        }

        const rule = UNDOABLE_TRANSITIONS[trip.status];
        if (!rule) throw new Error(`NOT_UNDOABLE:Không hoàn tác được bước "${trip.status}"`);

        if (Number(trip.version) !== Number(expectedVersion)) {
            const err = new Error('STALE_VERSION:Chuyến vừa được cập nhật ở nơi khác — hãy tải lại trước khi hoàn tác');
            err.code = 'STALE_VERSION';
            throw err;
        }

        const stamp = trip[rule.clear];
        const ageMs = Number(trip[`${rule.clear.replace(/_at$/, '')}_age_ms`]);
        if (!stamp || !Number.isFinite(ageMs)) {
            throw new Error('NOT_UNDOABLE:Không xác định được thời điểm của bước này');
        }
        if (ageMs > UNDO_WINDOW_MS) {
            const err = new Error(`WINDOW_EXPIRED:Đã quá ${Math.round(UNDO_WINDOW_MS / 1000)} giây kể từ lúc bấm — hãy báo điều phối để xử lý`);
            err.code = 'WINDOW_EXPIRED';
            throw err;
        }

        // Dọn trip_stops TRƯỚC, và so thẳng với cột trên order_shipments trong cùng câu
        // lệnh SQL.
        //
        // Không đưa dấu thời gian ra JS rồi truyền ngược vào: timestamptz của Postgres có
        // độ phân giải micro-giây, Date của JavaScript chỉ tới mili-giây. Đi một vòng qua
        // node-postgres là mất phần lẻ, và phép so BẰNG không khớp dòng nào — hoàn tác
        // "chạy thành công" mà không dọn gì cả. Tệ hơn: các điểm lấy hàng vẫn ở trạng thái
        // đã xong, nên lần bấm lại sẽ bỏ qua yêu cầu ảnh bắt buộc (BR-013).
        //
        // Vì so với cột gốc nên phải chạy TRƯỚC khi cột đó bị NULL. Cùng một giao dịch
        // nên không có cửa cho ai chen vào giữa.
        let stopsCleared = 0;
        if (trip.status === 'picking') {
            const r = await client.query(
                `UPDATE trip_stops ts SET arrived_at = NULL
                 FROM order_shipments os
                 WHERE os.id = $1 AND ts.shipment_id = $1
                   AND ts.stop_type = 'pickup' AND ts.arrived_at = os.picking_at`,
                [tripId],
            );
            stopsCleared = r.rowCount;
        } else if (trip.status === 'transit') {
            // Bước vào transit đặt completed_at, còn arrived_at chỉ đặt KHI trước đó rỗng
            // (COALESCE). Nên chỉ xoá arrived_at khi nó mang đúng mốc ấy — điểm mà tài xế
            // đã tự bấm đến từ trước mang mốc khác và phải được giữ nguyên.
            const r = await client.query(
                `UPDATE trip_stops ts
                 SET completed_at = NULL,
                     arrived_at   = CASE WHEN ts.arrived_at = os.transit_at THEN NULL ELSE ts.arrived_at END
                 FROM order_shipments os
                 WHERE os.id = $1 AND ts.shipment_id = $1
                   AND ts.stop_type = 'pickup' AND ts.completed_at = os.transit_at`,
                [tripId],
            );
            stopsCleared = r.rowCount;
        } else if (trip.status === 'arrived') {
            const r = await client.query(
                `UPDATE trip_stops ts SET arrived_at = NULL
                 FROM order_shipments os
                 WHERE os.id = $1 AND ts.shipment_id = $1
                   AND ts.stop_type = 'delivery' AND ts.arrived_at = os.arrived_at`,
                [tripId],
            );
            stopsCleared = r.rowCount;
        }

        const { rows: [row] } = await client.query(
            `UPDATE order_shipments
             SET status = $2, ${rule.clear} = NULL, version = version + 1, updated_at = NOW()
             WHERE id = $1 AND status = $3 AND version = $4
             RETURNING *`,
            [tripId, rule.back, trip.status, expectedVersion],
        );
        if (!row) throw new Error('CONFLICT:Chuyến vừa đổi trạng thái, không hoàn tác được');

        await client.query('COMMIT');

        // KHÔNG ghi activity_logs ở đây. Mọi thao tác lùi đi qua đúng một cửa —
        // reversalService.recordReversal — nên ghi cả hai nơi là ra hai dòng cho một
        // lần bấm, và người đọc nhật ký sau này sẽ tưởng tài xế bấm hoàn tác hai lần.
        // Trả đủ dữ liệu để cửa đó ghi được đầy đủ.
        return {
            trip: row,
            undoneFrom: trip.status,
            fromVersion: Number(trip.version),
            clearedColumn: rule.clear,
            clearedStamp: stamp,
            ageMs: Math.round(ageMs),
            stopsCleared,
        };
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        client.release();
    }
};

const releaseShipmentToPool = async (tripId, driverId, reason) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const cur = await client.query(
            `SELECT os.order_id, os.status, sc.owner_driver_id, sc.vehicle_id
             FROM order_shipments os
             LEFT JOIN v_shipment_current sc ON sc.shipment_id = os.id
             WHERE os.id = $1 FOR UPDATE OF os`,
            [tripId],
        );
        if (!cur.rows[0]) throw new Error('Chuyến không tồn tại');
        const { owner_driver_id: currentDriverId, vehicle_id: currentVehicleId } = cur.rows[0];

        // Trả trip về pool: xóa thời điểm claim, không còn cột owner/vehicle trên order_shipments
        await client.query(
            `UPDATE order_shipments
             SET status          = 'available',
                 claimed_at      = NULL,
                 notes           = CASE WHEN $1::text IS NOT NULL
                                       THEN COALESCE(notes || E'\n', '') || '[Released] ' || $1::text
                                       ELSE notes
                                   END,
                 updated_at      = NOW()
             WHERE id = $2`,
            [reason ?? null, tripId],
        );

        // Ghi audit: trả chuyến về pool (to_driver/to_vehicle = NULL)
        await insertAssignmentHistory(client, {
            shipmentId: tripId,
            fromDriverId: currentDriverId ?? driverId,
            fromVehicleId: currentVehicleId ?? null,
            toDriverId: null,
            toVehicleId: null,
            changedBy: driverId,
            changeReason: 'release_to_pool',
            notes: reason ? `Driver tự hủy: ${reason}` : 'Driver tự hủy chuyến',
        });

        await client.query('COMMIT');
        return { order_id: cur.rows[0].order_id, released: true };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

// Trả chi tiết (không chỉ true/false) để service phân biệt "không phải chuyến
// cuối" với "là chuyến cuối nhưng đang chờ chuyến khác nhập km" — cho phép báo
// đúng lý do thay vì im lặng.
//
// is_max_index KHÔNG so bằng shipment_index = MAX(...) tuyệt đối nữa: nếu đúng chuyến
// index lớn nhất bị HỦY (vd. sự cố hàng hư hỏng — cancelShipmentForCargoDamage), so tuyệt
// đối sẽ không bao giờ có chuyến nào khác thoả "= MAX" được nữa → không tài nào tạo được
// yêu cầu phiếu thu cho đơn cash (BR-018B), tiền các chuyến đã giao không bao giờ được đối
// soát. Nay so "không còn chuyến CHƯA BỊ HỦY nào có index lớn hơn" — chuyến index lớn nhất
// còn "sống" (chưa hủy) mới là chuyến khép lại đơn, đúng ý định ban đầu của isMaxIndex.
const getShipmentFinalStatus = async (tripId) => {
    const result = await pool.query(
        `SELECT
            NOT EXISTS (
                SELECT 1 FROM order_shipments s4
                WHERE s4.order_id = os.order_id
                  AND s4.status <> 'cancelled'
                  AND s4.shipment_index > os.shipment_index
            ) AS is_max_index,
            NOT EXISTS (
                SELECT 1 FROM order_shipments s3
                WHERE s3.order_id = os.order_id
                  AND s3.id != os.id
                  AND (
                      s3.status NOT IN ('completed', 'cancelled', 'failed')
                      OR (s3.status = 'completed' AND s3.is_price_manual != TRUE AND s3.actual_distance_km IS NULL)
                  )
            ) AS all_others_terminal
         FROM order_shipments os
         WHERE os.id = $1`,
        [tripId],
    );
    if (!result.rows[0]) return { isMaxIndex: false, allOthersReady: false };
    return { isMaxIndex: result.rows[0].is_max_index, allOthersReady: result.rows[0].all_others_terminal };
};

// Chuyến được coi là "final" khi: (1) shipment_index cao nhất, VÀ (2) mọi chuyến
// khác trong đơn đã ở trạng thái kết thúc, VÀ (3) nếu chuyến khác đó đã completed
// (và không phải giá cố định) thì PHẢI đã có actual_distance_km — tránh việc tài
// xế cuối gửi yêu cầu (và coordinator duyệt) trước khi tài xế chuyến khác kịp
// khai báo km thật, khiến hệ thống lặng lẽ dùng km ước tính lúc tạo đơn.
const isFinalShipment = async (tripId) => {
    const { isMaxIndex, allOthersReady } = await getShipmentFinalStatus(tripId);
    return isMaxIndex && allOthersReady;
};

const saveDeliveryProof = async (shipmentId, driverId, fileUrl) => {
    const result = await pool.query(
        `INSERT INTO delivery_proofs (shipment_id, captured_by, file_url, is_realtime, captured_at)
         VALUES ($1, $2, $3, TRUE, NOW())
         RETURNING *`,
        [shipmentId, driverId, fileUrl],
    );
    return result.rows[0];
};

const saveLoadingProof = async (shipmentId, driverId, fileUrl) => {
    const result = await pool.query(
        `INSERT INTO delivery_proofs (shipment_id, captured_by, file_url, is_realtime, captured_at)
         VALUES ($1, $2, $3, TRUE, NOW())
         RETURNING *`,
        [shipmentId, driverId, fileUrl],
    );
    return result.rows[0];
};

const reassignShipmentAfterIncident = async (
    shipmentId,
    {
        incidentId,
        fromDriverId,
        toDriverId,
        toVehicleId,
        changedBy,
        note,
        changeReason = 'incident_reassign',
        client: existingClient = null,
    },
) => {
    const client = existingClient ?? await pool.connect();
    const shouldManageTransaction = !existingClient;
    try {
        if (shouldManageTransaction) {
            await client.query('BEGIN');
        }

        const shipment = await getTripByIdForUpdate(client, shipmentId);
        if (!shipment) {
            throw new Error('Chuyến không tồn tại');
        }

        const validStatuses = [...ACTIVE_STATUSES, SHIPMENT_STATUS.FAILED];
        if (!validStatuses.includes(shipment.status)) {
            throw new Error('Chuyến không còn ở trạng thái cho phép điều chuyển');
        }

        if (Number(shipment.owner_driver_id) !== Number(fromDriverId)) {
            throw new Error('Thông tin tài xế hiện tại không còn khớp');
        }

        const vehicleRes = await client.query(
            `SELECT v.id, v.assigned_driver_id, v.status
             FROM vehicles v
             JOIN drivers d ON d.profile_id = $2 AND d.vehicle_id = v.id
             WHERE v.id = $1
             LIMIT 1`,
            [toVehicleId, toDriverId],
        );
        const vehicle = vehicleRes.rows[0];
        if (!vehicle || Number(vehicle.assigned_driver_id) !== Number(toDriverId)) {
            throw new Error('Tài xế thay thế chưa được gán đúng xe');
        }
        if (vehicle.status !== 'active') {
            throw new Error('Xe thay thế hiện không sẵn sàng vận hành');
        }

        const vehicleBusyRes = await client.query(
            `SELECT os.id
             FROM order_shipments os
             JOIN v_shipment_current sc ON sc.shipment_id = os.id
             WHERE sc.vehicle_id = $1
               AND os.status = ANY($2::text[])
               AND os.id <> $3
             LIMIT 1`,
            [toVehicleId, ACTIVE_STATUSES, shipmentId],
        );
        if (vehicleBusyRes.rows[0]) {
            throw new Error('Xe thay thế đang có chuyến hoạt động khác');
        }

        const maintenanceVehicleRes = await client.query(
            `SELECT id
             FROM maintenance_records
             WHERE vehicle_id = $1
               AND status IN ('open', 'pending_verification')
             LIMIT 1`,
            [toVehicleId],
        );
        if (maintenanceVehicleRes.rows[0]) {
            throw new Error('Xe thay thế đang trong bảo trì');
        }

        const maintenanceDriverRes = await client.query(
            `SELECT id
             FROM maintenance_records
             WHERE performed_by = $1
               AND vehicle_id <> $2
               AND status IN ('open', 'pending_verification')
             LIMIT 1`,
            [toDriverId, toVehicleId],
        );
        if (maintenanceDriverRes.rows[0]) {
            throw new Error('Tài xế thay thế đang phụ trách bảo trì xe khác');
        }

        const activeTripRes = await client.query(
            `SELECT os.id
             FROM order_shipments os
             JOIN v_shipment_current sc ON sc.shipment_id = os.id
             WHERE sc.owner_driver_id = $1
               AND os.status = ANY($2::text[])
               AND os.id <> $3
             LIMIT 1`,
            [toDriverId, ACTIVE_STATUSES, shipmentId],
        );
        if (activeTripRes.rows[0]) {
            throw new Error('Tài xế thay thế đang có chuyến hoạt động khác');
        }

        await insertAssignmentHistory(client, {
            shipmentId,
            fromDriverId,
            fromVehicleId: shipment.vehicle_id,
            toDriverId,
            toVehicleId,
            changedBy,
            changeReason,
            incidentId,
            notes: note ?? null,
        });

        if (shouldManageTransaction) {
            await client.query('COMMIT');
        }
        return shipment;
    } catch (error) {
        if (shouldManageTransaction) {
            await client.query('ROLLBACK');
        }
        throw error;
    } finally {
        if (shouldManageTransaction) {
            client.release();
        }
    }
};

const getDriverStats = async (driverId) => {
    const result = await pool.query(
        `SELECT
            COUNT(*) FILTER (
                WHERE claimed_at >= CURRENT_DATE
            )::int                                          AS today_total,
            COUNT(*) FILTER (
                WHERE status = $2
                  AND completed_at >= CURRENT_DATE
            )::int                                          AS today_completed,
            COUNT(*) FILTER (
                WHERE status = $2
                  AND DATE_TRUNC('month', completed_at) = DATE_TRUNC('month', NOW())
            )::int                                          AS month_completed
         FROM order_shipments os
         JOIN v_shipment_current sc ON sc.shipment_id = os.id
         WHERE sc.owner_driver_id = $1`,
        [driverId, SHIPMENT_STATUS.COMPLETED],
    );
    return result.rows[0];
};

const getDriverVehicleId = async (driverId) => {
    const result = await pool.query(
        'SELECT vehicle_id FROM drivers WHERE profile_id = $1',
        [driverId],
    );
    return result.rows[0]?.vehicle_id ?? null;
};

const getDriverOrderHistory = async (driverId, { limit = 30, offset = 0 } = {}) => {
    const result = await pool.query(
        `SELECT
            o.id            AS order_id,
            o.cargo_name,
            o.notes         AS order_notes,
            o.payment_type,
            o.derived_status AS order_status,
            o.created_at,
            (SELECT ts.address
             FROM trip_stops ts
             JOIN order_shipments os1 ON os1.id = ts.shipment_id
             WHERE os1.order_id = o.id AND ts.stop_type = 'pickup'
             ORDER BY os1.shipment_index ASC, ts.stop_index ASC LIMIT 1)  AS pickup_address,
            (SELECT ts.address
             FROM trip_stops ts
             JOIN order_shipments os2 ON os2.id = ts.shipment_id
             WHERE os2.order_id = o.id AND ts.stop_type = 'delivery'
             ORDER BY os2.shipment_index DESC, ts.stop_index DESC LIMIT 1) AS delivery_address,
            COUNT(os.id)::int                                               AS total_legs,
            (COUNT(os.id) FILTER (WHERE os.status = 'completed'))::int      AS completed_legs,
            SUM(os.estimated_price)                                         AS total_estimated_price,
            -- Từng chuyến ưu tiên actual_price đã chốt (vd hoàn hàng x2 giá), rơi về
            -- estimated_price nếu chuyến đó CHƯA chốt (BR-026) — cộng dồn SAU khi đã chọn
            -- đúng giá từng chuyến, không SUM(actual_price) thô vì đơn nhiều chuyến mà chỉ
            -- vài chuyến đã chốt sẽ bị hụt hẳn phần chưa chốt thay vì dùng tạm giá ước tính.
            SUM(COALESCE(NULLIF(os.actual_price, 0), os.estimated_price, 0)) AS total_actual_price,
            -- Cho FE biết để chú thích rõ "đã hoàn hàng ×2 cước" cạnh giá, tránh driver
            -- thắc mắc sao tiền không khớp giá báo ban đầu.
            BOOL_OR(os.returning_at IS NOT NULL)                            AS has_return_shipment,
            MIN(os.claimed_at)                                              AS first_claimed_at,
            (MAX(os.completed_at) FILTER (WHERE os.status = 'completed'))   AS last_completed_at,
            COUNT(*) OVER()::int                                            AS total_count
         FROM orders o
         JOIN order_shipments os ON os.order_id = o.id
         JOIN v_shipment_current sc ON sc.shipment_id = os.id AND sc.owner_driver_id = $1
         GROUP BY o.id, o.cargo_name, o.notes, o.payment_type, o.derived_status, o.created_at
         ORDER BY MIN(os.claimed_at) DESC NULLS LAST, o.created_at DESC
         LIMIT $2 OFFSET $3`,
        [driverId, limit, offset],
    );
    const total = Number(result.rows[0]?.total_count ?? 0);
    const rows  = result.rows.map(({ total_count, ...rest }) => rest);
    return { rows, total };
};

const getAvailableShipmentDetail = async (shipmentId) => {
    const result = await pool.query(
        `SELECT
            os.id               AS shipment_id,
            os.order_id,
            os.shipment_index,
            ${PICKUP_SUBQ}      AS pickup_address,
            ${DELIVERY_SUBQ}    AS delivery_address,
            os.cargo_weight_kg::text,
            os.estimated_price::text,
            os.notes,
            os.created_at,
            o.cargo_name,
            o.notes             AS order_notes,
            o.payment_type,
            vg.name             AS vehicle_group_name,
            (SELECT COUNT(*)::int
             FROM order_shipments os2
             WHERE os2.order_id = os.order_id) AS total_order_legs
         FROM order_shipments os
         JOIN orders o          ON o.id = os.order_id
         JOIN vehicle_groups vg ON vg.id = os.vehicle_group_id
         ${CURRENT_JOIN}
         WHERE os.id = $1
           AND os.status = 'available'
           AND sc.owner_driver_id IS NULL`,
        [shipmentId],
    );
    return result.rows[0] ?? null;
};

const getAvailableOrderDetail = async (orderId) => {
    const orderRes = await pool.query(
        `SELECT
            o.id,
            o.cargo_name,
            o.notes,
            o.payment_type,
            o.derived_status    AS status,
            o.created_at,
            (SELECT SUM(os.estimated_price) FROM order_shipments os WHERE os.order_id = o.id)::text AS total_estimated_price,
            (SELECT SUM(os.cargo_weight_kg)  FROM order_shipments os WHERE os.order_id = o.id)::text AS total_cargo_weight_kg,
            (SELECT COUNT(*)::int            FROM order_shipments os WHERE os.order_id = o.id)        AS total_legs
         FROM orders o
         WHERE o.id = $1 AND o.derived_status = 'open'`,
        [orderId],
    );
    if (!orderRes.rows[0]) return null;

    const shipmentsRes = await pool.query(
        `SELECT
            os.id,
            os.shipment_index,
            ${PICKUP_SUBQ}      AS pickup_address,
            ${DELIVERY_SUBQ}    AS delivery_address,
            os.cargo_weight_kg::text,
            os.estimated_price::text,
            os.notes,
            vg.name AS vehicle_group_name
         FROM order_shipments os
         JOIN orders o2         ON o2.id = os.order_id
         JOIN vehicle_groups vg ON vg.id = os.vehicle_group_id
         ${CURRENT_JOIN}
         WHERE os.order_id = $1
           AND os.status = 'available'
           AND sc.owner_driver_id IS NULL
         ORDER BY os.shipment_index ASC`,
        [orderId],
    );

    return {
        order:     orderRes.rows[0],
        shipments: shipmentsRes.rows,
    };
};

const getOrderWithShipments = async (orderId, driverId) => {
    const orderRes = await pool.query(
        `SELECT id, cargo_name, notes, payment_type, derived_status AS status, created_at
         FROM orders WHERE id = $1`,
        [orderId],
    );
    if (!orderRes.rows[0]) return null;

    const shipmentsRes = await pool.query(
        `SELECT
            os.id,
            os.order_id,
            os.shipment_index,
            ${PICKUP_SUBQ}   AS pickup_address,
            ${DELIVERY_SUBQ} AS delivery_address,
            os.cargo_weight_kg,
            os.estimated_price,
            os.actual_price,
            os.returning_at,
            os.status,
            os.notes,
            os.cancel_reason,
            os.claimed_at,
            os.picking_at,
            os.transit_at,
            os.arrived_at,
            os.completed_at,
            os.cancelled_at,
            (SELECT COALESCE(json_agg(dp.file_url ORDER BY dp.captured_at), '[]'::json)
             FROM delivery_proofs dp
             WHERE dp.shipment_id = os.id) AS receipt_urls,
            (SELECT dp.file_url
             FROM delivery_proofs dp
             WHERE dp.shipment_id = os.id
             ORDER BY dp.captured_at DESC LIMIT 1) AS proof_url
         FROM order_shipments os
         ${CURRENT_JOIN}
         WHERE os.order_id = $1 AND sc.owner_driver_id = $2
         ORDER BY os.shipment_index ASC`,
        [orderId, driverId],
    );
    if (!shipmentsRes.rows.length) return null;

    return {
        order:     orderRes.rows[0],
        shipments: shipmentsRes.rows,
    };
};

// Dùng cho bộ lọc nhóm xe ở màn trip pool của tài xế — nhóm đã ẩn không cần hiện
const getAllVehicleGroups = async () => {
    const result = await pool.query(
        `SELECT id, name FROM vehicle_groups WHERE status = 'active' ORDER BY id ASC`,
    );
    return result.rows;
};

// Tìm chuyến COMPLETED của driver cần nhập km hoặc tạo yêu cầu phiếu thu
// Hai trường hợp, xét theo thứ tự chuyến hoàn thành gần nhất trước (giữ đúng ưu tiên cũ):
//   1. Chưa nhập km (actual_distance_km IS NULL) — mọi driver của cash order
//   2. Driver của chuyến "khép lại đơn" đã nhập km nhưng chưa gửi yêu cầu phiếu thu
// Điều kiện (2) DÙNG LẠI getShipmentFinalStatus thay vì tự viết SQL riêng — trước đây có
// bản SQL riêng ở đây so shipment_index = MAX(...) tuyệt đối, hỏng khi đúng chuyến index
// lớn nhất bị HỦY (vd. sự cố hàng hư hỏng — cancelShipmentForCargoDamage): không chuyến nào
// còn khớp "= MAX" nữa nên không driver nào từng được nhắc gửi yêu cầu, tiền các chuyến đã
// giao không bao giờ được đối soát. Gọi chung 1 hàm cũng tránh 2 nơi tính "chuyến cuối"
// theo 2 công thức lệch nhau (nơi này trước đây thiếu điều kiện actual_distance_km của
// getShipmentFinalStatus).
const getPendingReceiptOrder = async (driverId) => {
    const { rows } = await pool.query(
        `SELECT
            os.id              AS shipment_id,
            os.order_id,
            os.shipment_index,
            os.estimated_price,
            os.actual_distance_km,
            o.cargo_name,
            ${PICKUP_SUBQ}     AS pickup_address,
            ${DELIVERY_SUBQ}   AS delivery_address,
            (
                SELECT MAX(s2.shipment_index)
                FROM order_shipments s2
                WHERE s2.order_id = os.order_id
            ) AS max_shipment_index
         FROM order_shipments os
         JOIN orders o ON o.id = os.order_id
         ${CURRENT_JOIN}
         WHERE sc.owner_driver_id = $1
           AND os.status = 'completed'
           AND o.payment_type = 'cash'
         ORDER BY os.completed_at DESC`,
        [driverId],
    );

    for (const row of rows) {
        const { actual_distance_km, ...shipment } = row;
        if (actual_distance_km === null) {
            return shipment;
        }

        const { isMaxIndex, allOthersReady } = await getShipmentFinalStatus(row.shipment_id);
        if (!isMaxIndex || !allOthersReady) continue;

        const { rows: existingRequests } = await pool.query(
            `SELECT 1 FROM order_receipt_requests WHERE order_id = $1`,
            [row.order_id],
        );
        if (existingRequests.length === 0) return shipment;
    }
    return null;
};

// Ghi km thực tế vào order_shipments — dùng cho tất cả driver (final hay không).
//
// Chuyến HOÀN HÀNG (returning_at có giá trị) chốt actual_price = km × đơn giá × 2 NGAY TẠI ĐÂY,
// bất kể payment_type của đơn. Lý do: updateShipmentActualPrice (coordinatorRepository) trước giờ
// CHỈ được gọi trong approveReceiptRequest, mà order_receipt_requests CHỈ được tạo cho đơn
// payment_type = 'cash' + driver cuối (requestOrderReceipt). Với đơn bank_transfer, không có
// request nào được tạo → actual_price không bao giờ được chốt → BR-026 fallback về estimated_price
// (giá MỘT CHIỀU cũ trước khi hoàn hàng) mãi mãi, doanh thu/KPI sai một nửa mà không có gì báo lỗi.
// Giá cố định do DN chốt tay (is_price_manual) thì giữ nguyên, không suy diễn theo km.
//
// ĐƠN GIÁ LẤY THEO NHÓM XE CỦA ĐƠN (os.vehicle_group_id) TRƯỚC, xe chạy thật chỉ là
// dự phòng khi chuyến không ghi nhóm. Từ khi coordinator gán được xe bất kỳ (kể cả khác
// nhóm), thứ tự cũ — xe trước, đơn sau — biến việc điều một chiếc xe to hơn vào phút
// chót thành một lần tăng giá với khách mà không ai duyệt: tài khai km xong là cước tự
// nhảy theo bảng giá của nhóm xe mới. Giá đã chốt với khách phải bám nhóm xe ghi trong
// đơn, bất kể cuối cùng chiếc nào chạy.
const saveShipmentActualKm = async (shipmentId, km) => {
    await pool.query(
        `WITH pricing AS (
            SELECT COALESCE(vg_order.price_per_km, vg_vehicle.price_per_km, 0) AS price_per_km
            FROM order_shipments os2
            LEFT JOIN v_shipment_current sc ON sc.shipment_id = os2.id
            LEFT JOIN vehicles v ON v.id = sc.vehicle_id
            LEFT JOIN vehicle_groups vg_vehicle ON vg_vehicle.id = v.vehicle_group_id
            LEFT JOIN vehicle_groups vg_order ON vg_order.id = os2.vehicle_group_id
            WHERE os2.id = $2
         )
         UPDATE order_shipments os
         SET actual_distance_km = $1,
             actual_price = CASE
                 WHEN os.returning_at IS NOT NULL AND os.is_price_manual IS NOT TRUE AND pricing.price_per_km > 0
                 THEN $1::numeric * pricing.price_per_km * 2
                 ELSE os.actual_price
             END,
             updated_at = NOW()
         FROM pricing
         WHERE os.id = $2`,
        [km, shipmentId],
    );
};

// Tạo yêu cầu phiếu thu cấp Order — chỉ driver cuối của cash order (BR-008B)
// Km đã được lưu trước đó qua saveShipmentActualKm
const createOrderReceiptRequest = async (orderId, driverId, shipmentId) => {
    const result = await pool.query(
        `INSERT INTO order_receipt_requests (order_id, requesting_shipment_id, driver_id)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [orderId, shipmentId, driverId],
    );
    return result.rows[0];
};

// Lấy trạng thái yêu cầu phiếu thu cấp Order (null nếu chưa gửi)
const getOrderReceiptRequestByOrderId = async (orderId) => {
    const result = await pool.query(
        `SELECT * FROM order_receipt_requests WHERE order_id = $1`,
        [orderId],
    );
    return result.rows[0] ?? null;
};

// Danh sách phiếu thu của driver (đã được coordinator tạo)
const getDriverReceipts = async (driverId, { page = 1, limit = 20 } = {}) => {
    const offset = (page - 1) * limit;
    // Query từ order_receipt_requests (source of truth) + LEFT JOIN shipment_receipts
    // để hiển thị cả dữ liệu cũ (approve trước khi có INSERT receipt) lẫn dữ liệu mới
    const result = await pool.query(
        `SELECT
            orr.id                                                             AS orr_id,
            sr.id                                                              AS shipment_receipt_id,
            orr.status                                                         AS request_status,
            ${RECEIPT_PAYMENT_TYPE_SQL}                                       AS payment_type,
            -- sr.amount (đã gồm cước + chi hộ − trả trước, chốt khi duyệt);
            -- fallback cho phiếu chưa duyệt / dữ liệu cũ — xem PENDING_RECEIPT_AMOUNT_SQL.
            -- Loại chuyến 'cancelled'/'failed' (vd. hủy do sự cố hàng hư hỏng) khỏi tổng —
            -- khớp đúng rule ở computeReceiptAmount, nếu không estimated_price của chuyến hư
            -- hỏng vẫn bị cộng vào số tài xế thấy trong lúc phiếu còn chờ duyệt.
            COALESCE(sr.amount, ${PENDING_RECEIPT_AMOUNT_SQL})                 AS amount,
            COALESCE(sr.collected_at, orr.processed_at, orr.requested_at)    AS collected_at,
            COALESCE(sr.notes, orr.coordinator_notes)                         AS notes,
            orr.coordinator_notes                                              AS rejection_reason,
            o.id                                                               AS order_id,
            o.cargo_name,
            c.full_name                                                        AS customer_name,
            c.company_name                                                     AS customer_company,
            c.phone                                                            AS customer_phone,
            (SELECT COALESCE(SUM(e.amount), 0)
             FROM expenses e
             WHERE e.shipment_id = orr.requesting_shipment_id
               AND e.status != 'rejected')::text                              AS total_expenses,
            (SELECT COALESCE(SUM(e.amount), 0)
             FROM expenses e
             JOIN order_shipments os4 ON os4.id = e.shipment_id
             WHERE os4.order_id = orr.order_id
               AND e.status != 'rejected'
               AND ${CUSTOMER_BILLABLE_EXPENSE_SQL('e', 'os4')})::text        AS pass_through_total
         FROM order_receipt_requests orr
         JOIN orders o                   ON o.id  = orr.order_id
         LEFT JOIN shipment_receipts sr  ON sr.order_receipt_request_id = orr.id
         LEFT JOIN customers c           ON c.id  = o.customer_id
         WHERE orr.driver_id = $1
         ORDER BY COALESCE(sr.collected_at, orr.processed_at, orr.requested_at) DESC
         LIMIT $2 OFFSET $3`,
        [driverId, limit, offset],
    );
    return result.rows;
};

// Chi tiết 1 phiếu thu — driver dùng để show cho khách.
// Khoá tra cứu là order_receipt_requests.id (xem ghi chú ở recordReceiptCollection).
// Response KHÔNG còn trường `receipt_id`/`actual_receipt_id`: đó là một số nguyên mà ý
// nghĩa đổi theo trạng thái dữ liệu (COALESCE(sr.id, orr.id)), client cầm nó thì không
// biết mình đang giữ khoá bảng nào. Hai khoá giờ trả riêng: `orr_id` và
// `shipment_receipt_id`.
const getDriverReceiptDetail = async (orrId, driverId) => {
    const COLS = `
            orr.id                       AS orr_id,
            orr.status                   AS request_status,
            orr.coordinator_notes        AS rejection_reason,
            orr.driver_notes             AS driver_notes,
            orr.requesting_shipment_id   AS shipment_id,
            sr.id                        AS shipment_receipt_id,
            sr.payment_type              AS payment_type,
            o.payment_type               AS order_payment_type,
            o.customer_id                AS customer_id,
            -- Chỉ hiện tiền ứng ĐÃ XÁC NHẬN — đúng bằng số được trừ khỏi tiền khách phải trả.
            -- Hiện khoản 'pending' (kế toán mới nhập, tiền chưa về) là báo tài xế một dòng
            -- "đã trả trước" không hề được trừ vào tổng bên dưới.
            CASE WHEN o.prepaid_status = 'confirmed'
                 THEN COALESCE(o.prepaid_amount, 0) ELSE 0 END AS prepaid_amount,
            -- Phiếu chưa chốt dùng CHUNG công thức với màn danh sách (PENDING_RECEIPT_AMOUNT_SQL):
            -- trước đây chỗ này bỏ quên phần chi hộ khách nên hai màn hiện hai số khác nhau.
            COALESCE(sr.amount, ${PENDING_RECEIPT_AMOUNT_SQL})
                                         AS amount,
            COALESCE(sr.collected_at, orr.processed_at) AS collected_at,
            COALESCE(sr.notes, orr.coordinator_notes)   AS notes,
            o.id                         AS order_id,
            o.cargo_name,
            o.cargo_weight_kg,
            c.full_name                  AS customer_name,
            c.company_name               AS customer_company,
            c.phone                      AS customer_phone,
            c.address                    AS customer_address,
            os.actual_distance_km,
            os.estimated_distance_km,
            os.actual_price,
            os.estimated_price,
            p_driver.full_name           AS driver_name,
            p_driver.phone               AS driver_phone,
            v.plate_number,
            p_coord.full_name            AS coordinator_name,
            EXISTS(SELECT 1 FROM debts d
                   WHERE d.shipment_id = orr.requesting_shipment_id
                     AND d.debt_type = 'driver') AS has_driver_debt,
            EXISTS(SELECT 1 FROM debts d
                   WHERE d.shipment_id = orr.requesting_shipment_id
                     AND d.debt_type = 'customer') AS has_customer_debt,
            EXISTS(SELECT 1 FROM financial_transactions ft
                   WHERE ft.ref_type = 'shipment'
                     AND ft.ref_id   = orr.requesting_shipment_id
                     AND ft.event_type = 'bank_receipt') AS bank_confirmed,
            (SELECT ts.address FROM trip_stops ts
             WHERE ts.shipment_id = orr.requesting_shipment_id
               AND ts.stop_type = 'pickup'
             ORDER BY ts.stop_index ASC  LIMIT 1) AS pickup_address,
            (SELECT ts.address FROM trip_stops ts
             WHERE ts.shipment_id = orr.requesting_shipment_id
               AND ts.stop_type = 'delivery'
             ORDER BY ts.stop_index DESC LIMIT 1) AS delivery_address,
            (SELECT json_agg(ts.address ORDER BY ts.stop_index ASC) FROM trip_stops ts
             WHERE ts.shipment_id = orr.requesting_shipment_id
               AND ts.stop_type = 'pickup')  AS pickup_addresses,
            (SELECT json_agg(ts.address ORDER BY ts.stop_index ASC) FROM trip_stops ts
             WHERE ts.shipment_id = orr.requesting_shipment_id
               AND ts.stop_type = 'delivery') AS delivery_addresses`;

    const JOINS = `
         JOIN orders o                   ON o.id    = orr.order_id
         LEFT JOIN customers c           ON c.id    = o.customer_id
         JOIN order_shipments os         ON os.id   = orr.requesting_shipment_id
         LEFT JOIN v_shipment_current sc ON sc.shipment_id = os.id
         LEFT JOIN profiles p_driver     ON p_driver.id = orr.driver_id
         LEFT JOIN vehicles v            ON v.id    = sc.vehicle_id`;

    const result = await pool.query(
        `SELECT ${COLS}
         FROM order_receipt_requests orr
         LEFT JOIN shipment_receipts sr  ON sr.order_receipt_request_id = orr.id
         ${JOINS}
         LEFT JOIN profiles p_coord      ON p_coord.id  = COALESCE(sr.created_by, orr.processed_by)
         WHERE orr.id = $1 AND orr.driver_id = $2`,
        [orrId, driverId],
    );
    return result.rows[0] ?? null;
};

// Toàn bộ chuyến + chi phí của 1 order — dùng để show tổng cộng cho khách ở màn hình chi tiết phiếu thu
const getOrderShipmentsWithExpenses = async (orderId) => {
    const [shipmentsResult, expensesResult] = await Promise.all([
        pool.query(
            `SELECT
                os.id,
                os.shipment_index,
                os.status,
                os.actual_price,
                os.estimated_price,
                os.actual_distance_km,
                os.estimated_distance_km,
                os.completed_at,
                p.full_name   AS driver_name,
                v.plate_number,
                (SELECT ts.address FROM trip_stops ts
                 WHERE ts.shipment_id = os.id AND ts.stop_type = 'pickup'
                 ORDER BY ts.stop_index ASC  LIMIT 1) AS pickup_address,
                (SELECT ts.address FROM trip_stops ts
                 WHERE ts.shipment_id = os.id AND ts.stop_type = 'delivery'
                 ORDER BY ts.stop_index DESC LIMIT 1) AS delivery_address,
                (SELECT json_agg(ts.address ORDER BY ts.stop_index ASC) FROM trip_stops ts
                 WHERE ts.shipment_id = os.id AND ts.stop_type = 'pickup')  AS pickup_addresses,
                (SELECT json_agg(ts.address ORDER BY ts.stop_index ASC) FROM trip_stops ts
                 WHERE ts.shipment_id = os.id AND ts.stop_type = 'delivery') AS delivery_addresses
             FROM order_shipments os
             LEFT JOIN v_shipment_current sc ON sc.shipment_id = os.id
             LEFT JOIN profiles p ON p.id = sc.owner_driver_id
             LEFT JOIN vehicles v ON v.id   = sc.vehicle_id
             WHERE os.order_id = $1
             ORDER BY os.shipment_index ASC`,
            [orderId],
        ),
        pool.query(
            `SELECT
                e.id, e.shipment_id, e.expense_type, e.amount::text AS amount,
                e.description, e.expense_date,
                COALESCE(
                    json_agg(ea.file_url ORDER BY ea.id) FILTER (WHERE ea.file_url IS NOT NULL),
                    '[]'
                ) AS receipt_urls
             FROM expenses e
             JOIN order_shipments os ON os.id = e.shipment_id
             LEFT JOIN expense_attachments ea ON ea.expense_id = e.id
             WHERE os.order_id = $1
             GROUP BY e.id
             ORDER BY e.shipment_id, e.expense_date, e.id`,
            [orderId],
        ),
    ]);

    const expensesByShipment = {};
    for (const exp of expensesResult.rows) {
        if (!expensesByShipment[exp.shipment_id]) expensesByShipment[exp.shipment_id] = [];
        expensesByShipment[exp.shipment_id].push(exp);
    }

    return shipmentsResult.rows.map((s) => ({
        ...s,
        expenses: expensesByShipment[s.id] ?? [],
    }));
};

const resubmitReceiptRequest = async (orrId, driverId, driverNotes) => {
    const result = await pool.query(
        `UPDATE order_receipt_requests
         SET status = 'pending', driver_notes = $3, requested_at = NOW()
         WHERE id = $1 AND driver_id = $2 AND status = 'rejected'
         RETURNING id`,
        [orrId, driverId, driverNotes ?? null],
    );
    if (!result.rows[0]) throw new Error('Không tìm thấy yêu cầu hoặc yêu cầu chưa bị từ chối');
    return result.rows[0];
};

const recordReceiptCollection = async (orrId, driverId, { paymentType, proofUrl, notes, collectedAmount }) => {
    // Khoá tra cứu DUY NHẤT là order_receipt_requests.id — khoá nghiệp vụ của "phiếu thu
    // của đơn này" (UNIQUE theo order_id). KHÔNG nhận shipment_receipts.id: hai bảng dùng
    // sequence độc lập cùng START WITH 100000 nên dải ID chồng nhau, một số nguyên trần
    // không đủ phân biệt. Trước đây `WHERE (sr.id = $1 OR orr.id = $1) LIMIT 1` có thể
    // khớp hai hàng khác nhau của cùng một tài xế rồi nhặt bừa — ghi payment_type sang
    // phiếu của đơn khác, hoặc báo "đã ghi nhận" cho phiếu thật ra chưa ghi.
    //
    // ORDER BY: schema không chặn nhiều shipment_receipts trỏ về cùng một
    // order_receipt_requests, nên ưu tiên phiếu CHƯA ghi nhận (đúng cái tài xế đang
    // thao tác), rồi tie-break bằng sr.id để kết quả luôn xác định.
    const FIND_SQL = `
        SELECT sr.id AS sr_id, sr.payment_type,
               orr.requesting_shipment_id AS shipment_id,
               orr.order_id, orr.driver_id,
               o.customer_id, o.partner_id,
               COALESCE(sr.amount,
                   (SELECT GREATEST(
                       COALESCE(SUM(os2.actual_price),0) - COALESCE(MAX(o2.prepaid_amount),0), 0
                   ) FROM order_shipments os2
                    JOIN orders o2 ON o2.id = os2.order_id
                    WHERE os2.order_id = orr.order_id AND os2.actual_price IS NOT NULL
                      AND os2.status NOT IN ('cancelled', 'failed'))
               ) AS amount
        FROM shipment_receipts sr
        JOIN order_receipt_requests orr ON orr.id = sr.order_receipt_request_id
        JOIN orders o ON o.id = orr.order_id
        WHERE orr.id = $1
          AND orr.driver_id = $2
        ORDER BY (sr.payment_type IS NOT NULL) ASC, sr.id ASC
        LIMIT 1`;

    const found = await pool.query(FIND_SQL, [orrId, driverId]);
    const rec = found.rows[0];
    if (!rec) throw new Error('Không tìm thấy phiếu thu hoặc bạn không có quyền');
    if (rec.payment_type !== null) throw new Error('Phiếu thu đã được ghi nhận thanh toán rồi');

    // Đơn đối tác (rec.partner_id) → khoản ghi nợ thuộc về ĐỐI TÁC (người thuê công ty),
    // không phải khách chủ hàng. Đơn thường → công nợ khách như cũ.
    const isPartnerOrder = !!rec.partner_id;
    const debtorType   = isPartnerOrder ? 'partner'  : 'customer';
    const debtorCustId = isPartnerOrder ? null        : rec.customer_id;
    const debtorPartId = isPartnerOrder ? rec.partner_id : null;
    const hasDebtor    = isPartnerOrder || !!rec.customer_id;

    const receiptAmount  = Number(rec.amount);
    // collectedAmount: số tiền tài xế thực nhận từ khách (có thể ít hơn, đủ, hoặc hơn)
    const rawCollected   = collectedAmount ? Number(collectedAmount) : null;
    const isPartial      = rawCollected !== null && rawCollected < receiptAmount - 0.01;
    const totalCollected = rawCollected !== null ? rawCollected : receiptAmount;
    const excessAmount   = Math.max(0, totalCollected - receiptAmount);
    const shortfall      = isPartial ? receiptAmount - totalCollected : 0;

    // Phiếu thu 0đ là hợp lệ, KHÔNG phải lỗi dữ liệu: mọi chuyến của đơn bị hủy vì hàng
    // hư hại (doanh thu 0, toàn bộ chi phí chuyển sang DN chịu) hoặc khách đã trả trước
    // đủ. Không có gì để thu ⇒ không được sinh công nợ: debts.total_amount có CHECK > 0
    // nên INSERT 0 sẽ ném lỗi Postgres thô ra tận app tài xế. Vẫn ghi payment_type +
    // ảnh bằng chứng để phiếu đóng lại đúng quy trình.
    const NOTHING_TO_COLLECT = receiptAmount <= 0.01;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Cập nhật payment_type — điều kiện IS NULL chống race:
        // 2 request song song (double-tap/mạng chập chờn) thì chỉ 1 request thắng,
        // request kia bị chặn tại đây (tránh tạo nợ + ghi sổ 2 lần)
        const { rowCount: claimedCount } = await client.query(
            `UPDATE shipment_receipts
             SET payment_type = $1
             WHERE id = $2
               AND payment_type IS NULL`,
            [paymentType, rec.sr_id],
        );
        if (claimedCount === 0) throw new Error('Phiếu thu đã được ghi nhận thanh toán rồi');

        if (paymentType === 'cash_collected') {
            // Driver cầm tiền mặt → Driver Debt = số thực nhận (không phải toàn bộ phiếu thu).
            // Không thu được đồng nào (phiếu 0đ vì hàng hư hại, hoặc khách chưa trả gì) thì
            // KHÔNG có nợ tài xế để ghi — debts.total_amount CHECK > 0 sẽ ném lỗi thô.
            let driverDebt = null;
            if (totalCollected > 0.01) {
                const debtNote = notes
                    ? `Tài xế đã thu tiền mặt từ khách — chưa nộp về công ty. ${notes}`
                    : 'Tài xế đã thu tiền mặt từ khách — chưa nộp về công ty';
                ({ rows: [driverDebt] } = await client.query(
                    `INSERT INTO debts (
                        debt_type, driver_id, customer_id, partner_id, order_id, shipment_id,
                        total_amount, due_date, notes, updated_by, created_at, updated_at
                    )
                     VALUES ('driver', $1, NULL, NULL, $2, $3, $4,
                        CURRENT_DATE + INTERVAL '30 days',
                        $5, $1, NOW(), NOW())
                     RETURNING id`,
                    [driverId, rec.order_id, rec.shipment_id, totalCollected, debtNote],
                ));
                // Tiền tài xế cầm = CƯỚC + CHI HỘ. Ghi Có 131 toàn bộ thì 131 bị Có thừa
                // đúng bằng phần chi hộ còn 3388 treo Nợ mãi — tách hai vế tại đây.
                await financialLedgerRepository.insertCustomerCashIn(client, {
                    eventType: 'driver_debt_created',
                    debitAccount: '1388',
                    amount: totalCollected,
                    orderId: rec.order_id,
                    description: `Tài xế thu tiền mặt từ khách — phiếu thu #${rec.sr_id}, đơn #${rec.order_id}`,
                    refType: 'debt', refId: driverDebt.id, actorId: driverId,
                });
            }

            // TH2 — CẤN TRỪ CHI PHÍ TÀI ĐÃ ỨNG: tiền khách đưa gồm cả phần chi hộ/chi phí
            // tài trả trước; tài giữ lại phần mình đã ứng là hợp lệ. Cấn tự động các expense
            // đã duyệt (reimbursement 'pending') của CHÍNH tài này trong CHÍNH đơn này vào nợ,
            // mỗi khoản 1 dòng debt_payments 'offset' confirmed + 1 bút toán, không cấn quá nợ.
            //
            // Không có nợ tài xế (không thu được đồng nào) ⇒ không cấn trừ được gì; chi phí
            // tài đã ứng vẫn giữ reimbursement_status = 'pending' để hoàn qua lương (TH1).
            const { rows: offsetables } = driverDebt ? await client.query(
                `SELECT e.id, e.expense_type, e.amount, os.status AS shipment_status
                 FROM expenses e
                 JOIN order_shipments os ON os.id = e.shipment_id
                 LEFT JOIN v_shipment_current sc ON sc.shipment_id = e.shipment_id
                 WHERE os.order_id = $1
                   AND e.status = 'approved'
                   AND e.reimbursement_status = 'pending'
                   AND ${NO_LIVE_REIMBURSEMENT_VOUCHER_SQL('e')}
                   AND COALESCE(sc.owner_driver_id, e.created_by) = $2
                 ORDER BY e.id
                 FOR UPDATE OF e`,
                [rec.order_id, driverId],
            ) : { rows: [] };
            let remainingDebt = Number(totalCollected);
            for (const exp of offsetables) {
                const offsetAmount = Math.min(Number(exp.amount), remainingDebt);
                if (offsetAmount <= 0) break;
                await client.query(
                    `INSERT INTO debt_payments
                        (debt_id, amount, payment_method, status, paid_at, confirmed_at, confirmed_by, created_by, notes)
                     VALUES ($1, $2, 'offset', 'confirmed', NOW(), NOW(), $3, $3,
                             $4)`,
                    [driverDebt.id, offsetAmount, driverId,
                     `Cấn trừ chi phí tài đã ứng (${exp.expense_type}) — expense #${exp.id}`],
                );
                // Chi phí đã được GHI NHẬN từ lúc duyệt (Nợ 3388/642 | Có 334) — bước này
                // chỉ TẤT TOÁN khoản phải trả tài xế bằng cách trừ vào nợ thu hộ mà tài
                // đang giữ: Nợ 334 | Có 1388, không có tiền ra khỏi quỹ.
                //
                // Ghi lại Nợ 3388/642 ở đây là ghi nhận chi phí lần hai cho cùng một hoá đơn.
                await financialLedgerRepository.insertTransaction(client, {
                    eventType: 'driver_debt_paid',
                    debitAccount: '334', creditAccount: '1388',
                    amount: offsetAmount,
                    description: `Hoàn tài xế bằng cấn trừ nợ thu hộ — chi phí #${exp.id} (${exp.expense_type})`,
                    refType: 'debt', refId: driverDebt.id, actorId: driverId,
                });
                await client.query(
                    `UPDATE expenses SET reimbursement_status = 'offset_debt', reimbursed_at = NOW(), updated_at = NOW() WHERE id = $1`,
                    [exp.id],
                );
                remainingDebt -= offsetAmount;
            }

            if (proofUrl) {
                await client.query(
                    `INSERT INTO payment_receipts (payment_id, file_url) VALUES ($1, $2)`,
                    [rec.sr_id, proofUrl],
                );
            }
            // Thanh toán một phần: phần còn thiếu → Customer Debt
            // KHÔNG ghi FT: doanh thu (131/511) đã ghi đủ khi duyệt phiếu thu (shipment_revenue);
            // phần phải thu còn lại đã nằm sẵn trên 131 — ghi thêm sẽ đội doanh thu.
            if (shortfall > 0.01 && hasDebtor) {
                const who = isPartnerOrder ? 'Đối tác' : 'Khách';
                await client.query(
                    `INSERT INTO debts (
                        debt_type, driver_id, customer_id, partner_id, order_id, shipment_id,
                        total_amount, due_date, notes, updated_by, created_at, updated_at
                    )
                     VALUES ($1, NULL, $2, $3, $4, $5, $6,
                        CURRENT_DATE + INTERVAL '30 days',
                        $7, $8, NOW(), NOW())`,
                    [
                        debtorType, debtorCustId, debtorPartId,
                        rec.order_id, rec.shipment_id, shortfall,
                        `${who} chưa trả đủ — còn thiếu (đã trả ${money(totalCollected)} / tổng ${money(receiptAmount)})`,
                        driverId,
                    ],
                );
            }
        } else if (paymentType === 'bank_transfer') {
            // Khách chuyển khoản về công ty → lưu bằng chứng, không tạo debt
            if (proofUrl) {
                await client.query(
                    `INSERT INTO payment_receipts (payment_id, file_url) VALUES ($1, $2)`,
                    [rec.sr_id, proofUrl],
                );
            }
        } else if (paymentType === 'client_credit' && !NOTHING_TO_COLLECT) {
            // Ghi nợ công ty → Customer Debt, hoặc Partner Debt nếu là đơn đối tác.
            // KHÔNG ghi FT: doanh thu đã ghi khi duyệt phiếu thu — nợ theo dõi ở bảng debts.
            // Phiếu 0đ (hàng hư hại / đã trả trước đủ): không có gì để nợ — bỏ qua, phiếu
            // vẫn được đóng bằng payment_type ở trên.
            const who = isPartnerOrder ? 'Đối tác' : 'Khách hàng';
            await client.query(
                `INSERT INTO debts (
                    debt_type, driver_id, customer_id, partner_id, order_id, shipment_id,
                    total_amount, due_date, notes, updated_by, created_at, updated_at
                )
                 VALUES ($1, NULL, $2, $3, $4, $5, $6,
                    CURRENT_DATE + INTERVAL '30 days',
                    $7, $8, NOW(), NOW())`,
                [
                    debtorType, debtorCustId, debtorPartId,
                    rec.order_id, rec.shipment_id, receiptAmount,
                    `${who} chưa thanh toán — ghi nhận công nợ`,
                    driverId,
                ],
            );
        }

        // Phần thừa → tự động phân bổ vào nợ cũ của khách (oldest → newest)
        // Áp dụng cho cash_collected khi khách trả thừa để thanh toán nợ cũ.
        // excessAllocated: số THỰC SỰ phân bổ được — có tiền thừa không đồng nghĩa với
        // đã cấn trừ (khách có thể không còn nợ cũ nào). Tầng trên cần phân biệt để
        // không báo "đã phân bổ xong" khi chưa phân bổ được đồng nào.
        let excessAllocated = 0;
        if (excessAmount >= 0.01 && rec.customer_id && paymentType === 'cash_collected') {
            // Postgres cấm FOR UPDATE + GROUP BY — dùng LATERAL để vẫn lock được dòng debts
            const { rows: oldDebts } = await client.query(
                `SELECT d.id AS debt_id,
                        GREATEST(0, d.total_amount - paid.paid) AS remaining
                 FROM debts d
                 LEFT JOIN LATERAL (
                     SELECT COALESCE(SUM(dp.amount) FILTER (WHERE dp.status = 'confirmed'), 0) AS paid
                     FROM debt_payments dp
                     WHERE dp.debt_id = d.id
                 ) paid ON TRUE
                 WHERE d.customer_id = $1
                   AND d.debt_type = 'customer'
                   AND d.order_id != $2
                   AND GREATEST(0, d.total_amount - paid.paid) > 0.01
                 ORDER BY d.created_at ASC, d.id ASC
                 FOR UPDATE OF d`,
                [rec.customer_id, rec.order_id],
            );

            if (oldDebts.length > 0) {
                let rem       = excessAmount;
                const ids     = [];
                const amounts = [];
                for (const debt of oldDebts) {
                    if (rem < 0.01) break;
                    const alloc = Math.min(rem, Number(debt.remaining));
                    if (alloc < 0.01) continue;
                    ids.push(Number(debt.debt_id));
                    amounts.push(alloc);
                    rem -= alloc;
                }
                if (ids.length > 0) {
                    // status = 'pending': tiền thừa driver đang cầm, phải chờ kế toán xác nhận
                    // mới được ghi giảm nợ khách (driver không tự confirm — permission matrix).
                    // method = 'offset': tiền đã nằm trong nợ tài xế (driver_debt_created) —
                    // khi confirm KHÔNG ghi thêm FT tiền mặt (tránh đếm trùng).
                    await client.query(
                        `INSERT INTO debt_payments
                             (debt_id, amount, payment_method, status,
                              paid_at, created_by, notes)
                         SELECT unnest($1::int[]), unnest($2::numeric[]),
                                'offset', 'pending', NOW(), $3, $4`,
                        [
                            ids, amounts,
                            driverId,
                            `Phân bổ từ phiếu thu #${rec.sr_id} — khách trả thừa, chờ kế toán xác nhận`,
                        ],
                    );
                    excessAllocated = amounts.reduce((sum, a) => sum + a, 0);
                }
            }
        }

        await client.query('COMMIT');
        return {
            // shipmentReceiptId: khoá phía kế toán (accountant tra confirm-bank-transfer
            // theo sr.id). Hàm này nhận orr.id nên PHẢI trả sr.id ra ngoài, đừng để tầng
            // trên suy ra từ tham số đầu vào — hai dải khoá khác nhau.
            shipmentReceiptId: rec.sr_id,
            excessDistributed: excessAmount >= 0.01 && excessAllocated > 0.01,
            excessAmount,
            excessAllocated,
            partialPayment: isPartial,
            shortfall,
            // Phiếu 0đ: đã đóng nhưng KHÔNG sinh công nợ nào — tầng trên cần biết để báo
            // "không phải thu" thay vì "đã ghi nhận công nợ khách".
            nothingToCollect: NOTHING_TO_COLLECT,
            receiptAmount,
        };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

// Số tiền phiếu thu của một yêu cầu — dùng để biết phiếu có phải 0đ hay không TRƯỚC khi
// bắt tài xế chụp ảnh bằng chứng. Cùng công thức COALESCE với recordReceiptCollection.
const getReceiptAmountForDriver = async (orrId, driverId) => {
    const { rows } = await pool.query(
        `SELECT COALESCE(sr.amount,
                   (SELECT GREATEST(
                       COALESCE(SUM(os2.actual_price),0) - COALESCE(MAX(o2.prepaid_amount),0), 0
                   ) FROM order_shipments os2
                    JOIN orders o2 ON o2.id = os2.order_id
                    WHERE os2.order_id = orr.order_id AND os2.actual_price IS NOT NULL
                      AND os2.status NOT IN ('cancelled', 'failed'))
               ) AS amount
         FROM shipment_receipts sr
         JOIN order_receipt_requests orr ON orr.id = sr.order_receipt_request_id
         WHERE orr.id = $1 AND orr.driver_id = $2
         ORDER BY (sr.payment_type IS NOT NULL) ASC, sr.id ASC
         LIMIT 1`,
        [orrId, driverId],
    );
    return rows[0] ? Number(rows[0].amount) : null;
};

const getOrderCustomerId = async (orderId) => {
    const { rows } = await pool.query(`SELECT customer_id FROM orders WHERE id = $1`, [orderId]);
    return rows[0]?.customer_id ?? null;
};

const getOrderPaymentType = async (orderId) => {
    const { rows } = await pool.query(`SELECT payment_type FROM orders WHERE id = $1`, [orderId]);
    return rows[0]?.payment_type ?? null;
};

// Chưa thanh toán khi driver báo nợ (không qua flow phiếu thu — ghi nợ trực tiếp trên trip).
// Đơn đối tác → công nợ ĐỐI TÁC; đơn thường → công nợ khách.
const createCustomerDebtForTrip = async ({ customerId, driverId, shipmentId, orderId, amount, notes }) => {
    const { rows: [ord] } = await pool.query(`SELECT partner_id FROM orders WHERE id = $1`, [orderId]);
    const partnerId = ord?.partner_id ?? null;

    const { rows: [debt] } = await pool.query(
        `INSERT INTO debts (debt_type, customer_id, partner_id, driver_id, shipment_id, order_id, total_amount, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
         RETURNING *`,
        [
            partnerId ? 'partner' : 'customer',
            partnerId ? null : customerId,
            partnerId,
            driverId, shipmentId, orderId, amount, notes ?? null,
        ],
    );
    return debt;
};

module.exports = {
    insertAssignmentHistory,
    getDriverVehicleGroupId,
    getDriverVehicleId,
    getAvailableShipments,
    getAllVehicleGroups,
    getActiveTrip,
    getTripById,
    getTripByIdForUpdate,
    getFullTripById,
    getPendingReceiptOrder,
    saveShipmentActualKm,
    createOrderReceiptRequest,
    getOrderReceiptRequestByOrderId,
    claimShipment,
    assignOrderShipmentsToDriver,
    resolveFailedShipment,
    cancelShipmentForCargoDamage,
    recomputeOrderDerivedStatus,
    updateTripStatus,
    undoTransition,
    releaseShipmentToPool,
    isFinalShipment,
    getShipmentFinalStatus,
    saveDeliveryProof,
    saveLoadingProof,
    reassignShipmentAfterIncident,
    activateNextShipment,
    getDriverStats,
    getDriverOrderHistory,
    getAvailableShipmentDetail,
    getAvailableOrderDetail,
    getOrderWithShipments,
    getDriverReceipts,
    getDriverReceiptDetail,
    getReceiptAmountForDriver,
    getOrderShipmentsWithExpenses,
    resubmitReceiptRequest,
    recordReceiptCollection,
    getOrderCustomerId,
    getOrderPaymentType,
    createCustomerDebtForTrip,
};
