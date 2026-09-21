/**
 * L1 Unit Test — companyService
 * Service mỏng: chỉ có 1 điểm quyết định thật (chặn upload QR rỗng) + gắn người sửa.
 */
jest.mock('../../repositories/companyRepository');

const companyRepository = require('../../repositories/companyRepository');
const companyService = require('../../services/companyService');

beforeEach(() => jest.clearAllMocks());

describe('companyService.uploadBankQr', () => {
    it('TC-UNIT-CompanyService-001 — stores the bank QR image together with the updating user', async () => {
        companyRepository.updateBankQrUrl.mockResolvedValue({ bank_qr_url: 'https://cdn/qr.png' });

        const result = await companyService.uploadBankQr('https://cdn/qr.png', 3);

        expect(companyRepository.updateBankQrUrl).toHaveBeenCalledWith('https://cdn/qr.png', 3);
        expect(result).toEqual({ bank_qr_url: 'https://cdn/qr.png' });
    });

    it('TC-UNIT-CompanyService-002 — rejects an empty QR file and writes nothing to the database', async () => {
        await expect(companyService.uploadBankQr(null, 3)).rejects.toThrow('Không có file ảnh QR');

        expect(companyRepository.updateBankQrUrl).not.toHaveBeenCalled();
    });
});

describe('companyService.updateCompanyInfo', () => {
    it('TC-UNIT-CompanyService-003 — attaches the updating user to the payload sent to the repository', async () => {
        companyRepository.upsertCompanyInfo.mockResolvedValue({ id: 1 });

        await companyService.updateCompanyInfo({ company_name: 'LogisCount', hotline: '1900' }, 3);

        expect(companyRepository.upsertCompanyInfo).toHaveBeenCalledWith({
            company_name: 'LogisCount', hotline: '1900', updatedBy: 3,
        });
    });
});
