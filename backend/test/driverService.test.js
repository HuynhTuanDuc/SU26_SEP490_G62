const { describe, it, afterEach, mock } = require('node:test');
const assert = require('node:assert');

const vehicleManagementRepository = require('../repositories/vehicleManagementRepository');
const driverService = require('../services/driverService');

describe('Driver Service', () => {
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
            (err) => err.statusCode === 400 && err.message === 'cost must be greater than 0',
        );
    });

    it('should persist maintenance cost when driver completes maintenance', async () => {
        mock.method(vehicleManagementRepository, 'getActiveMaintenanceRecordForDriver', async () => ({
            id: 21,
            bill_pics: ['https://example.com/bill.jpg'],
        }));
        mock.method(vehicleManagementRepository, 'completeMaintenanceRecordAndSetStatus', async () => ({}));

        const result = await driverService.completeMaintenance(7, 11, { cost: 450000 });

        assert.deepStrictEqual(result, { maintenanceRecordId: 21 });
        assert.strictEqual(vehicleManagementRepository.completeMaintenanceRecordAndSetStatus.mock.calls.length, 1);
        assert.strictEqual(
            vehicleManagementRepository.completeMaintenanceRecordAndSetStatus.mock.calls[0].arguments[0].cost,
            450000,
        );
    });
});
