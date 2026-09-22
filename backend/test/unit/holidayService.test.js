/**
 * L1 Unit Test — holidayService
 * Dependency duy nhất (holidayRepository) được mock hoàn toàn.
 */
jest.mock('../../repositories/holidayRepository');

const holidayRepository = require('../../repositories/holidayRepository');
const holidayService = require('../../services/holidayService');

beforeEach(() => jest.clearAllMocks());

describe('holidayService.createHoliday', () => {
    it('TC-UNIT-HolidayService-001 — records a holiday when both date and name are valid', async () => {
        holidayRepository.upsertHoliday.mockResolvedValue({ holiday_date: '2026-09-02', name: 'Quốc khánh' });

        const result = await holidayService.createHoliday('2026-09-02', 'Quốc khánh');

        expect(holidayRepository.upsertHoliday).toHaveBeenCalledWith('2026-09-02', 'Quốc khánh');
        expect(result).toEqual({ holiday_date: '2026-09-02', name: 'Quốc khánh' });
    });

    it('TC-UNIT-HolidayService-002 — trims surrounding whitespace from the holiday name before saving', async () => {
        holidayRepository.upsertHoliday.mockResolvedValue({});

        await holidayService.createHoliday('2026-01-01', '   Tết Dương lịch   ');

        expect(holidayRepository.upsertHoliday).toHaveBeenCalledWith('2026-01-01', 'Tết Dương lịch');
    });

    it('TC-UNIT-HolidayService-003 — rejects an unparsable date without touching the repository', async () => {
        await expect(holidayService.createHoliday('khong-phai-ngay', 'Tết'))
            .rejects.toThrow('Ngày lễ không hợp lệ');

        expect(holidayRepository.upsertHoliday).not.toHaveBeenCalled();
    });

    it('TC-UNIT-HolidayService-004 — rejects a missing date without touching the repository', async () => {
        await expect(holidayService.createHoliday(null, 'Tết'))
            .rejects.toThrow('Ngày lễ không hợp lệ');

        expect(holidayRepository.upsertHoliday).not.toHaveBeenCalled();
    });

    it('TC-UNIT-HolidayService-005 — treats a whitespace-only name as empty', async () => {
        await expect(holidayService.createHoliday('2026-09-02', '    '))
            .rejects.toThrow('Tên ngày lễ là bắt buộc');

        expect(holidayRepository.upsertHoliday).not.toHaveBeenCalled();
    });

    it('TC-UNIT-HolidayService-006 — rejects a missing holiday name', async () => {
        await expect(holidayService.createHoliday('2026-09-02', undefined))
            .rejects.toThrow('Tên ngày lễ là bắt buộc');

        expect(holidayRepository.upsertHoliday).not.toHaveBeenCalled();
    });
});

describe('holidayService.deleteHoliday', () => {
    it('TC-UNIT-HolidayService-007 — completes normally when one row is deleted', async () => {
        holidayRepository.deleteHoliday.mockResolvedValue(1);

        await expect(holidayService.deleteHoliday('2026-09-02')).resolves.toBeUndefined();

        expect(holidayRepository.deleteHoliday).toHaveBeenCalledWith('2026-09-02');
    });

    it('TC-UNIT-HolidayService-008 — reports not found when no row is deleted', async () => {
        holidayRepository.deleteHoliday.mockResolvedValue(0);

        await expect(holidayService.deleteHoliday('2026-09-02'))
            .rejects.toThrow('Không tìm thấy ngày lễ');
    });

    it('TC-UNIT-HolidayService-009 — rejects an invalid date before calling the repository', async () => {
        await expect(holidayService.deleteHoliday('32/13/2026'))
            .rejects.toThrow('Ngày lễ không hợp lệ');

        expect(holidayRepository.deleteHoliday).not.toHaveBeenCalled();
    });
});

describe('holidayService.listHolidays', () => {
    it('TC-UNIT-HolidayService-010 — passes the year down to the repository and returns the list unchanged', async () => {
        holidayRepository.listHolidays.mockResolvedValue([{ holiday_date: '2026-09-02', name: 'Quốc khánh' }]);

        const result = await holidayService.listHolidays(2026);

        expect(holidayRepository.listHolidays).toHaveBeenCalledWith(2026);
        expect(result).toEqual([{ holiday_date: '2026-09-02', name: 'Quốc khánh' }]);
    });
});
