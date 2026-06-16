const pool = require('../config/database');

const getCompanyInfo = async () => {
    const result = await pool.query(
        `SELECT id, company_name, hotline, bank_name, bank_account_number, bank_account_name, bank_qr_url, updated_at
         FROM company_info WHERE id = 1`,
    );
    return result.rows[0] ?? null;
};

const upsertCompanyInfo = async ({ companyName, hotline, bankName, bankAccountNumber, bankAccountName, updatedBy }) => {
    const result = await pool.query(
        `INSERT INTO company_info (id, company_name, hotline, bank_name, bank_account_number, bank_account_name, updated_at, updated_by)
         VALUES (1, $1, $2, $3, $4, $5, NOW(), $6)
         ON CONFLICT (id) DO UPDATE SET
             company_name        = COALESCE(EXCLUDED.company_name,        company_info.company_name),
             hotline             = COALESCE(EXCLUDED.hotline,             company_info.hotline),
             bank_name           = COALESCE(EXCLUDED.bank_name,           company_info.bank_name),
             bank_account_number = COALESCE(EXCLUDED.bank_account_number, company_info.bank_account_number),
             bank_account_name   = COALESCE(EXCLUDED.bank_account_name,   company_info.bank_account_name),
             updated_at          = NOW(),
             updated_by          = EXCLUDED.updated_by
         RETURNING *`,
        [companyName ?? null, hotline ?? null, bankName ?? null, bankAccountNumber ?? null, bankAccountName ?? null, updatedBy],
    );
    return result.rows[0];
};

const updateBankQrUrl = async (url, updatedBy) => {
    const result = await pool.query(
        `INSERT INTO company_info (id, bank_qr_url, updated_at, updated_by)
         VALUES (1, $1, NOW(), $2)
         ON CONFLICT (id) DO UPDATE SET bank_qr_url = $1, updated_at = NOW(), updated_by = $2
         RETURNING *`,
        [url, updatedBy],
    );
    return result.rows[0];
};

module.exports = { getCompanyInfo, upsertCompanyInfo, updateBankQrUrl };
