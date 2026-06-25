const { describe, it, beforeEach, mock } = require('node:test');
const assert = require('node:assert');
const companyService = require('../../services/companyService');
const companyRepository = require('../../repositories/companyRepository');

describe('Company Service Unit Tests (L1)', () => {
    beforeEach(() => {
        mock.restoreAll();
    });

    it('getCompanyInfo - should call repository and return info', async () => {
        mock.method(companyRepository, 'getCompanyInfo', async () => ({ company_name: 'Test Co' }));
        const info = await companyService.getCompanyInfo();
        assert.strictEqual(info.company_name, 'Test Co');
    });

    it('updateCompanyInfo - should call upsert with updatedBy', async () => {
        mock.method(companyRepository, 'upsertCompanyInfo', async (data) => data);
        const result = await companyService.updateCompanyInfo({ companyName: 'New Co' }, 1);
        assert.strictEqual(result.companyName, 'New Co');
        assert.strictEqual(result.updatedBy, 1);
    });

    it('uploadBankQr - should update QR code successfully', async () => {
        mock.method(companyRepository, 'updateBankQrUrl', async (url, updatedBy) => ({ bank_qr_url: url, updated_by: updatedBy }));
        const result = await companyService.uploadBankQr('http://example.com/qr.png', 2);
        assert.strictEqual(result.bank_qr_url, 'http://example.com/qr.png');
        assert.strictEqual(result.updated_by, 2);
    });

    it('uploadBankQr - should throw if no url provided', async () => {
        await assert.rejects(
            companyService.uploadBankQr('', 2),
            /Không có file ảnh QR/
        );
    });
});
