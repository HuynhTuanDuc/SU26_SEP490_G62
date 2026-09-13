const { mock } = require('./helpers/nodeTestMock');
const assert = require('node:assert');

const vehicleManagementRepository = require('../repositories/vehicleManagementRepository');
const notificationService = require('../services/notificationService');
const notificationGateway = require('../services/notificationGateway');
const receiptValidationService = require('../services/receiptValidationService');
const driverService = require('../services/driverService');

describe('Driver Service', () => {
    beforeEach(() => {
        // Không mock thì test unit đi gọi Postgres thật rồi rơi vào nhánh fail-safe —
        // vẫn xanh, nhưng chậm và che mất ý định của từng ca.
        mock.method(vehicleManagementRepository, 'getMaintenanceCostHistory', async () => []);
    });

    afterEach(() => {
        mock.restoreAll();
    });

    it('should require maintenance cost when driver completes maintenance', async () => {
        mock.method(vehicleManagementRepository, 'getActiveMaintenanceRecordForDriver', async () => ({
            id: 21,
            bill_pics: ['https://example.com/bill.jpg'],
        }));

        await assert.rejects(
            () => driverService.completeMaintenance(7, 11, {}),
            // Gọi với payload rỗng = KHÔNG nhập chi phí. Câu cũ ('cost must be greater
            // than 0') mô tả sai tình huống — thiếu hẳn ô nhập, chứ không phải nhập số 0.
            (err) => err.statusCode === 400 && err.message === 'Chi phí bảo dưỡng là bắt buộc',
        );
    });

    // Tài xế up ảnh TRƯỚC khi nhập tiền thì lúc upload chưa có số tiền để đối chiếu →
    // phải chặn được ở bước hoàn tất, nếu không là vượt rào toàn bộ kiểm tra hóa đơn.
    it('should reject completion when claimed cost does not match the uploaded bills', async () => {
        mock.method(vehicleManagementRepository, 'getActiveMaintenanceRecordForDriver', async () => ({
            id: 21,
            bill_pics: ['https://example.com/bill.jpg'],
        }));
        mock.method(vehicleManagementRepository, 'completeMaintenanceRecordAndSetStatus', async () => ({}));
        mock.method(receiptValidationService, 'validateMaintenanceBills', async () => ({
            verdict: 'rejected',
            blocked: true,
            reject_reason: 'Hóa đơn ghi tổng 200.000đ, bạn khai 5.000.000đ, lệch 4.800.000đ.',
            reasons: [{ code: 'AMOUNT_MISMATCH', severity: 'error', message: 'lệch 4.800.000đ' }],
        }));

        await assert.rejects(
            () => driverService.completeMaintenance(7, 11, { cost: 5_000_000 }),
            (err) => err.statusCode === 422 && err.invalidBill === true,
        );
        assert.strictEqual(vehicleManagementRepository.completeMaintenanceRecordAndSetStatus.mock.calls.length, 0);
    });

    it('should accept completion when claimed cost matches the sum of the uploaded bills', async () => {
        mock.method(vehicleManagementRepository, 'getActiveMaintenanceRecordForDriver', async () => ({
            id: 21,
            bill_pics: ['https://example.com/bill-1.jpg', 'https://example.com/bill-2.jpg'],
        }));
        mock.method(vehicleManagementRepository, 'completeMaintenanceRecordAndSetStatus', async () => ({}));
        mock.method(vehicleManagementRepository, 'getVehicleById', async () => ({ id: 11, plate_number: '51A-12345', status: 'maintenance' }));
        mock.method(notificationGateway, 'broadcastToRole', () => {});
        mock.method(notificationService, 'getUserIdsByRole', async () => []);
        mock.method(notificationService, 'createForUsers', async () => []);
        mock.method(receiptValidationService, 'validateMaintenanceBills', async () => ({
            verdict: 'passed', blocked: false, reject_reason: null, reasons: [],
        }));

        await driverService.completeMaintenance(7, 11, { cost: 600_000 });

        assert.strictEqual(vehicleManagementRepository.completeMaintenanceRecordAndSetStatus.mock.calls.length, 1);
    });

    // Model lỗi/ảnh mờ → KHÔNG chặn tài xế, nhưng khoản đó phải hiện ra trước mắt người
    // duyệt. Lớp cũ fail-open im lặng nên sự cố hạ tầng đồng nghĩa với không ai kiểm nữa.
    it('không chặn tài xế khi không đọc được hóa đơn, nhưng báo người duyệt phải kiểm', async () => {
        mock.method(vehicleManagementRepository, 'getActiveMaintenanceRecordForDriver', async () => ({
            id: 21,
            bill_pics: ['https://example.com/bill.jpg'],
        }));
        mock.method(vehicleManagementRepository, 'completeMaintenanceRecordAndSetStatus', async () => ({}));
        mock.method(vehicleManagementRepository, 'getVehicleById', async () => ({ id: 11, plate_number: '51A-12345', status: 'maintenance' }));
        mock.method(notificationGateway, 'broadcastToRole', () => {});
        mock.method(notificationService, 'getUserIdsByRole', async () => []);
        mock.method(notificationService, 'createForUsers', async () => []);
        mock.method(receiptValidationService, 'validateMaintenanceBills', async () => ({
            verdict: 'needs_review',
            blocked: false,
            reject_reason: null,
            reasons: [{
                code: 'EXTRACTION_TIMEOUT', severity: 'warning',
                message: 'Quá thời gian đọc hóa đơn. Người duyệt vui lòng kiểm tra bằng mắt.',
            }],
        }));

        const result = await driverService.completeMaintenance(7, 11, { cost: 5_000_000 });

        assert.strictEqual(vehicleManagementRepository.completeMaintenanceRecordAndSetStatus.mock.calls.length, 1);
        assert.strictEqual(result.receipt_verdict, 'needs_review');
        // Số điểm cần kiểm phải đi vào thông báo, nếu không thì trạng thái này vô dụng.
        const completedBroadcast = notificationGateway.broadcastToRole.mock.calls
            .map((call) => call.arguments[1])
            .find((payload) => payload.type === 'maintenance.completed');
        assert.match(completedBroadcast.message, /1 điểm cần kiểm tra/);
    });

    it('should persist maintenance cost when driver completes maintenance', async () => {
        mock.method(vehicleManagementRepository, 'getActiveMaintenanceRecordForDriver', async () => ({
            id: 21,
            bill_pics: ['https://example.com/bill.jpg'],
        }));
        mock.method(receiptValidationService, 'validateMaintenanceBills', async () => ({
            verdict: 'passed', blocked: false, reject_reason: null, reasons: [],
        }));
        mock.method(vehicleManagementRepository, 'completeMaintenanceRecordAndSetStatus', async () => ({}));
        mock.method(vehicleManagementRepository, 'getVehicleById', async () => ({
            id: 11,
            plate_number: '51A-12345',
            status: 'maintenance',
        }));
        mock.method(notificationGateway, 'broadcastToRole', () => {});
        mock.method(notificationService, 'getUserIdsByRole', async () => [5, 8]);
        mock.method(notificationService, 'createForUsers', async () => []);

        const result = await driverService.completeMaintenance(7, 11, { cost: 450000 });

        assert.strictEqual(result.maintenanceRecordId, 21);
        assert.strictEqual(result.receipt_verdict, 'passed');
        assert.strictEqual(vehicleManagementRepository.completeMaintenanceRecordAndSetStatus.mock.calls.length, 1);
        assert.strictEqual(
            vehicleManagementRepository.completeMaintenanceRecordAndSetStatus.mock.calls[0].arguments[0].cost,
            450000,
        );
        assert.strictEqual(notificationGateway.broadcastToRole.mock.calls.length, 3);
        assert.deepStrictEqual(notificationService.getUserIdsByRole.mock.calls[0].arguments, ['manager']);
        assert.deepStrictEqual(notificationService.createForUsers.mock.calls[0].arguments[0], [5, 8]);
        assert.strictEqual(
            notificationService.createForUsers.mock.calls[0].arguments[1].message,
            'Tài xế đã hoàn tất bảo dưỡng xe 51A-12345. Vui lòng kiểm tra hóa đơn và xác nhận.',
        );
    });
});

describe('Driver Service — cảnh báo chi phí bất thường tới tay người duyệt', () => {
    afterEach(() => {
        mock.restoreAll();
    });

    const setupCompletion = () => {
        mock.method(vehicleManagementRepository, 'getActiveMaintenanceRecordForDriver', async () => ({
            id: 21, vehicle_id: 11, maintenance_type: 'scheduled',
            bill_pics: ['https://example.com/bill.jpg'],
        }));
        mock.method(vehicleManagementRepository, 'completeMaintenanceRecordAndSetStatus', async () => ({}));
        mock.method(vehicleManagementRepository, 'getVehicleById', async () => ({ id: 11, plate_number: '51A-12345', status: 'maintenance' }));
        mock.method(notificationGateway, 'broadcastToRole', () => {});
        mock.method(notificationService, 'getUserIdsByRole', async () => []);
        mock.method(notificationService, 'createForUsers', async () => []);
    };

    const completedMessage = () => notificationGateway.broadcastToRole.mock.calls
        .map((call) => call.arguments[1])
        .find((payload) => payload.type === 'maintenance.completed').message;

    it('lịch sử xe được truyền vào lớp kiểm tra kèm đúng loại bảo dưỡng', async () => {
        setupCompletion();
        mock.method(vehicleManagementRepository, 'getMaintenanceCostHistory', async () => ([
            { cost: 1_200_000, maintenance_type: 'scheduled' },
            { cost: 1_350_000, maintenance_type: 'scheduled' },
            { cost: 1_500_000, maintenance_type: 'scheduled' },
        ]));
        const spy = mock.method(receiptValidationService, 'validateMaintenanceBills', async () => ({
            verdict: 'passed', blocked: false, reject_reason: null, reasons: [],
        }));

        await driverService.completeMaintenance(7, 11, { cost: 1_400_000 });

        const context = spy.mock.calls[0].arguments[1];
        assert.strictEqual(context.costHistory.length, 3);
        assert.strictEqual(context.maintenanceType, 'scheduled');
    });

    it('chi phí cao bất thường không chặn tài xế nhưng phải hiện trong thông báo', async () => {
        // Hóa đơn có thể hoàn toàn thật — đây là tín hiệu "nhìn kỹ", không phải từ chối.
        setupCompletion();
        mock.method(vehicleManagementRepository, 'getMaintenanceCostHistory', async () => []);
        mock.method(receiptValidationService, 'validateMaintenanceBills', async () => ({
            verdict: 'needs_review',
            blocked: false,
            reject_reason: null,
            reasons: [{ code: 'COST_OUTLIER', severity: 'warning', message: 'Chi phí cao bất thường' }],
        }));

        const result = await driverService.completeMaintenance(7, 11, { cost: 4_800_000 });

        assert.strictEqual(result.receipt_verdict, 'needs_review');
        assert.strictEqual(vehicleManagementRepository.completeMaintenanceRecordAndSetStatus.mock.calls.length, 1);
        assert.match(completedMessage(), /1 điểm cần kiểm tra/);
    });

    it('không lấy được lịch sử thì mất một lớp cảnh báo chứ không hỏng bước hoàn tất', async () => {
        setupCompletion();
        mock.method(vehicleManagementRepository, 'getMaintenanceCostHistory', async () => { throw new Error('DB down'); });
        const spy = mock.method(receiptValidationService, 'validateMaintenanceBills', async () => ({
            verdict: 'passed', blocked: false, reject_reason: null, reasons: [],
        }));

        await driverService.completeMaintenance(7, 11, { cost: 1_400_000 });

        assert.deepStrictEqual(spy.mock.calls[0].arguments[1].costHistory, []);
        assert.strictEqual(vehicleManagementRepository.completeMaintenanceRecordAndSetStatus.mock.calls.length, 1);
    });
});
