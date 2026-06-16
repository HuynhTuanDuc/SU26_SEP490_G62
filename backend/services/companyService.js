const companyRepository = require('../repositories/companyRepository');

const getCompanyInfo = async () => {
    return companyRepository.getCompanyInfo();
};

const updateCompanyInfo = async (fields, updatedBy) => {
    return companyRepository.upsertCompanyInfo({ ...fields, updatedBy });
};

const uploadBankQr = async (fileUrl, updatedBy) => {
    if (!fileUrl) throw new Error('Không có file ảnh QR');
    return companyRepository.updateBankQrUrl(fileUrl, updatedBy);
};

module.exports = { getCompanyInfo, updateCompanyInfo, uploadBankQr };
