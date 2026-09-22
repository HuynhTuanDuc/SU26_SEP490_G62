/**
 * L1 Unit Test — coordinatorService (phần tính tiền phiếu thu)
 *
 * PHẠM VI CÓ CHỦ Ý: file này 66KB, phần lớn là orchestrator giao dịch (approveReceiptRequest,
 * cancelShipment, reassignShipment, assignOrderShipments, importExcel) — chúng mở client từ
 * pool và chạy BEGIN/COMMIT/ROLLBACK quanh hàng chục lời gọi repository, thuộc Level 2
 * (Report 5.2). Ở L1 tôi phủ hai hàm THUẦN được export ra ngoài, và đó cũng là phần đáng
 * bảo vệ nhất vì chúng quyết định SỐ TIỀN in trên phiếu thu:
 *
 *   computeReceiptAmount        — số tiền thật sự bị chốt khi coordinator bấm Duyệt
 *   resolveShipmentActualRevenue — số tiền hiện ở màn xem trước
 *
 * Comment trong code nói rõ hai hàm PHẢI khớp nhau. Lệch nhau thì coordinator nhìn thấy
 * một con số rồi chốt ra một con số khác — có test bất biến riêng cho việc đó (TC-030..032).
 */
jest.mock('../../config/database', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../../config/logger', () => ({
    warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));
jest.mock('../../repositories/orderRepository');
jest.mock('../../repositories/expenseRepository');
jest.mock('../../repositories/incidentRepository');
jest.mock('../../repositories/coordinatorRepository');
jest.mock('../../repositories/financialLedgerRepository');
jest.mock('../../services/notificationGateway', () => ({
    broadcastToRole: jest.fn(), broadcastToUser: jest.fn(), notifyCreated: jest.fn(),
}));

const { computeReceiptAmount, resolveShipmentActualRevenue } = require('../../services/coordinatorService');

/** Chuyến bình thường: 100km × 12.000đ = 1.200.000đ */
const chuyen = (o = {}) => ({
    id: 100, status: 'completed', price_per_km: 12_000, is_price_manual: false,
    actual_distance_km: 100, estimated_distance_km: 90, estimated_price: null,
    returning_at: null, actual_price: null, owner_driver_id: 5, ...o,
});

const snapshot = (shipments, extra = {}) => ({
    shipments, primaryShipment: shipments[0] ?? null, prepaid_amount: 0, ...extra,
});

describe('coordinatorService.computeReceiptAmount — chuyến tính theo km', () => {
    it('TC-UNIT-CoordinatorService-001 — real mileage times the vehicle group rate', () => {
        const kq = computeReceiptAmount(snapshot([chuyen()]));

        expect(kq.actual_income).toBe(1_200_000);
        expect(kq.actual_km).toBe(100);
        expect(kq.price_per_km).toBe(12_000);
    });

    it('TC-UNIT-CoordinatorService-002 — BLOCKS closing the receipt while real mileage is missing', () => {
        expect(() => computeReceiptAmount(snapshot([chuyen({ actual_distance_km: null })])))
            .toThrow('Chuyến #100 chưa có số km thực tế');
    });

    it('TC-UNIT-CoordinatorService-003 — mileage of 0 is blocked as well', () => {
        expect(() => computeReceiptAmount(snapshot([chuyen({ actual_distance_km: 0 })])))
            .toThrow('chưa có số km thực tế');
    });

    it('TC-UNIT-CoordinatorService-004 — estimated mileage must NEVER silently stand in for the real figure', () => {
        // estimated_distance_km = 90 vẫn có, nhưng thiếu km thật thì phải chặn chứ không
        // được rơi về 90 — rơi về là chốt sai tiền mà không ai biết.
        expect(() => computeReceiptAmount(snapshot([
            chuyen({ actual_distance_km: undefined, estimated_distance_km: 90 }),
        ]))).toThrow('chưa có số km thực tế');
    });

    it('TC-UNIT-CoordinatorService-005 — blocks when the vehicle rate is missing', () => {
        expect(() => computeReceiptAmount(snapshot([chuyen({ price_per_km: 0 })])))
            .toThrow('chưa có đơn giá xe hợp lệ');
    });

    it('TC-UNIT-CoordinatorService-006 — an empty trip list reports a pricing configuration error', () => {
        expect(() => computeReceiptAmount(snapshot([])))
            .toThrow('Không thể lấy cấu hình giá cho đơn hàng');
        expect(() => computeReceiptAmount(null))
            .toThrow('Không thể lấy cấu hình giá cho đơn hàng');
    });
});

describe('coordinatorService.computeReceiptAmount — chuyến hoàn hàng tính GẤP ĐÔI', () => {
    it('TC-UNIT-CoordinatorService-007 — a returning_at timestamp doubles the fare, the driver drove both ways', () => {
        const kq = computeReceiptAmount(snapshot([chuyen({ returning_at: '2026-08-18T10:00:00Z' })]));

        expect(kq.actual_income).toBe(2_400_000);
        expect(kq.shipment_breakdown[0]).toMatchObject({ is_returned: true, actual_km: 100 });
    });

    it('TC-UNIT-CoordinatorService-008 — a return trip already marked completed is still charged double', () => {
        const kq = computeReceiptAmount(snapshot([
            chuyen({ status: 'completed', returning_at: '2026-08-18T10:00:00Z' }),
        ]));

        expect(kq.actual_income).toBe(2_400_000);
    });

    it('TC-UNIT-CoordinatorService-009 — a return trip missing its mileage is blocked', () => {
        expect(() => computeReceiptAmount(snapshot([
            chuyen({ returning_at: '2026-08-18T10:00:00Z', actual_distance_km: null }),
        ]))).toThrow('chưa có số km thực tế');
    });

    it('TC-UNIT-CoordinatorService-010 — a return trip missing its rate is blocked', () => {
        expect(() => computeReceiptAmount(snapshot([
            chuyen({ returning_at: '2026-08-18T10:00:00Z', price_per_km: null }),
        ]))).toThrow('chưa có đơn giá xe hợp lệ');
    });
});

describe('coordinatorService.computeReceiptAmount — giá cố định do doanh nghiệp chốt tay', () => {
    it('TC-UNIT-CoordinatorService-011 — a fixed price wins outright and is NOT recomputed from mileage', () => {
        const kq = computeReceiptAmount(snapshot([
            chuyen({ is_price_manual: true, estimated_price: 3_000_000, actual_distance_km: 999 }),
        ]));

        expect(kq.actual_income).toBe(3_000_000);
        expect(kq.shipment_breakdown[0].is_price_manual).toBe(true);
    });

    it('TC-UNIT-CoordinatorService-012 — a fixed price wins over the return branch too, no doubling', () => {
        const kq = computeReceiptAmount(snapshot([
            chuyen({ is_price_manual: true, estimated_price: 3_000_000, returning_at: '2026-08-18T10:00:00Z' }),
        ]));

        expect(kq.actual_income).toBe(3_000_000);
    });

    it('TC-UNIT-CoordinatorService-013 — a fixed price wins over the cancelled status too', () => {
        const kq = computeReceiptAmount(snapshot([
            chuyen({ is_price_manual: true, estimated_price: 3_000_000, status: 'cancelled' }),
        ]));

        expect(kq.actual_income).toBe(3_000_000);
    });

    it('TC-UNIT-CoordinatorService-014 — a fixed price with no valid fare is blocked', () => {
        expect(() => computeReceiptAmount(snapshot([
            chuyen({ is_price_manual: true, estimated_price: 0 }),
        ]))).toThrow('Chuyến #100 là giá cố định nhưng chưa có giá cước hợp lệ');
    });

    it('TC-UNIT-CoordinatorService-015 — a fixed price with no real mileage falls back to the estimate for display', () => {
        const kq = computeReceiptAmount(snapshot([
            chuyen({ is_price_manual: true, estimated_price: 3_000_000, actual_distance_km: null, estimated_distance_km: 90 }),
        ]));

        expect(kq.shipment_breakdown[0].actual_km).toBe(90);
    });
});

describe('coordinatorService.computeReceiptAmount — chuyến hủy/thất bại không phát sinh doanh thu', () => {
    it.each([['cancelled'], ['failed'], ['CANCELLED'], ['Failed']])(
        'TC-UNIT-CoordinatorService-016 — status %s yields zero revenue and demands no mileage',
        (trangThai) => {
            const kq = computeReceiptAmount(snapshot([
                chuyen({ status: trangThai, actual_distance_km: null }),
            ]));

            expect(kq.actual_income).toBe(0);
            expect(kq.actual_km).toBe(0);
        },
    );
});

describe('coordinatorService.computeReceiptAmount — cộng gộp nhiều chuyến trong một đơn', () => {
    it('TC-UNIT-CoordinatorService-017 — total mileage and total revenue are summed across every trip', () => {
        const kq = computeReceiptAmount(snapshot([
            chuyen({ id: 100, actual_distance_km: 100 }),
            chuyen({ id: 101, actual_distance_km: 50 }),
        ]));

        expect(kq.actual_km).toBe(150);
        expect(kq.actual_income).toBe(1_800_000);
        expect(kq.shipment_breakdown).toHaveLength(2);
    });

    it('TC-UNIT-CoordinatorService-018 — a cancelled trip inside the order does not inflate the total', () => {
        const kq = computeReceiptAmount(snapshot([
            chuyen({ id: 100, actual_distance_km: 100 }),
            chuyen({ id: 101, status: 'cancelled', actual_distance_km: 80 }),
        ]));

        expect(kq.actual_income).toBe(1_200_000);
        expect(kq.actual_km).toBe(100);
    });

    it('TC-UNIT-CoordinatorService-019 — a SINGLE trip missing its mileage blocks the whole receipt', () => {
        expect(() => computeReceiptAmount(snapshot([
            chuyen({ id: 100, actual_distance_km: 100 }),
            chuyen({ id: 101, actual_distance_km: null }),
        ]))).toThrow('Chuyến #101 chưa có số km thực tế');
    });

    it('TC-UNIT-CoordinatorService-020 — the displayed rate comes from the primary trip of the driver', () => {
        const ds = [
            chuyen({ id: 100, price_per_km: 12_000, owner_driver_id: 9 }),
            chuyen({ id: 101, price_per_km: 20_000, owner_driver_id: 5 }),
        ];

        const kq = computeReceiptAmount({ shipments: ds, primaryShipment: ds[1], prepaid_amount: 0 });

        expect(kq.shipment_id).toBe(101);
        expect(kq.price_per_km).toBe(20_000);
    });

    it('TC-UNIT-CoordinatorService-021 — falls back to the first trip when no primary trip can be identified', () => {
        const kq = computeReceiptAmount({
            shipments: [chuyen({ id: 100 }), chuyen({ id: 101 })], primaryShipment: null, prepaid_amount: 0,
        });

        expect(kq.shipment_id).toBe(100);
    });
});

describe('coordinatorService.computeReceiptAmount — trừ tiền khách đã trả trước', () => {
    it('TC-UNIT-CoordinatorService-022 — amount still due equals total revenue minus the prepaid amount', () => {
        const kq = computeReceiptAmount(snapshot([chuyen()], { prepaid_amount: 200_000 }));

        expect(kq.gross_amount).toBe(1_200_000);
        expect(kq.prepaid_amount).toBe(200_000);
        expect(kq.remaining_amount).toBe(1_000_000);
    });

    it('TC-UNIT-CoordinatorService-023 — a prepayment larger than the total leaves 0 due, NEVER a negative figure', () => {
        const kq = computeReceiptAmount(snapshot([chuyen()], { prepaid_amount: 5_000_000 }));

        expect(kq.remaining_amount).toBe(0);
    });

    it('TC-UNIT-CoordinatorService-024 — a prepayment exactly equal to the total leaves 0 due (boundary)', () => {
        const kq = computeReceiptAmount(snapshot([chuyen()], { prepaid_amount: 1_200_000 }));

        expect(kq.remaining_amount).toBe(0);
    });

    it('TC-UNIT-CoordinatorService-025 — a negative prepaid amount is clamped to 0', () => {
        const kq = computeReceiptAmount(snapshot([chuyen()], { prepaid_amount: -500_000 }));

        expect(kq.prepaid_amount).toBe(0);
        expect(kq.remaining_amount).toBe(1_200_000);
    });

    it('TC-UNIT-CoordinatorService-026 — the prepaid amount defaults to 0 when absent', () => {
        const kq = computeReceiptAmount({ shipments: [chuyen()], primaryShipment: null });

        expect(kq.prepaid_amount).toBe(0);
    });
});

describe('coordinatorService.resolveShipmentActualRevenue — số hiện ở màn xem trước', () => {
    it('TC-UNIT-CoordinatorService-027 — an already settled price is used exactly as stored', () => {
        expect(resolveShipmentActualRevenue(chuyen({ actual_price: 1_500_000 }))).toBe(1_500_000);
    });

    it.each([['cancelled'], ['failed']])(
        'TC-UNIT-CoordinatorService-028 — a %s trip yields zero revenue even if a price was recorded by mistake',
        (trangThai) => {
            expect(resolveShipmentActualRevenue(chuyen({ status: trangThai, actual_price: 9_000_000 }))).toBe(0);
        },
    );

    it('TC-UNIT-CoordinatorService-029 — missing mileage or rate yields 0 rather than NaN', () => {
        expect(resolveShipmentActualRevenue(chuyen({ actual_distance_km: 0 }))).toBe(0);
        expect(resolveShipmentActualRevenue(chuyen({ price_per_km: 0 }))).toBe(0);
        expect(resolveShipmentActualRevenue({})).toBe(0);
    });
});

describe('coordinatorService — BẤT BIẾN: màn xem trước phải khớp số sẽ bị chốt', () => {
    // Comment trong code nói rõ hai hàm phải khớp nhau. Lệch nhau thì coordinator nhìn
    // thấy một con số ở màn xem trước rồi bấm Duyệt ra một con số khác — từng là bug
    // thật: dòng "Doanh thu" hiện đúng MỘT NỬA số tiền của chuyến hoàn hàng.
    const khop = (s) => {
        const chot = computeReceiptAmount(snapshot([s])).shipment_breakdown[0].actual_income;
        const xemTruoc = resolveShipmentActualRevenue(s);
        return { chot, xemTruoc };
    };

    it('TC-UNIT-CoordinatorService-030 — return trip: both the preview and the settled figure double the fare', () => {
        const { chot, xemTruoc } = khop(chuyen({ returning_at: '2026-08-18T10:00:00Z' }));

        expect(xemTruoc).toBe(2_400_000);
        expect(xemTruoc).toBe(chot);
    });

    it('TC-UNIT-CoordinatorService-031 — cancelled trip: both yield 0', () => {
        const { chot, xemTruoc } = khop(chuyen({ status: 'cancelled' }));

        expect(xemTruoc).toBe(0);
        expect(xemTruoc).toBe(chot);
    });

    it('TC-UNIT-CoordinatorService-032 — fixed price: both take exactly the price the company set', () => {
        const { chot, xemTruoc } = khop(
            chuyen({ is_price_manual: true, estimated_price: 3_000_000, actual_distance_km: 999 }),
        );

        expect(xemTruoc).toBe(3_000_000);
        expect(xemTruoc).toBe(chot);
    });

    it('TC-UNIT-CoordinatorService-033 — ordinary trip: both are mileage times rate', () => {
        const { chot, xemTruoc } = khop(chuyen());

        expect(xemTruoc).toBe(1_200_000);
        expect(xemTruoc).toBe(chot);
    });
});
