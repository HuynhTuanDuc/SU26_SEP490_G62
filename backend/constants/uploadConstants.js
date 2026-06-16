const UPLOAD = Object.freeze({
    MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024,      // 10 MB
    IMAGE_MAX_WIDTH: 1200,
    CLOUDINARY_QUALITY: 'auto:good',
    ALLOWED_FORMATS: ['jpg', 'jpeg', 'png', 'webp'],
    FOLDERS: {
        PROOF:           'g62/completion-proofs',
        RECEIPT:         'g62/receipts',
        PAYMENT_RECEIPT: 'g62/payment-receipts',
        INCIDENT:        'g62/incidents',
        AVATAR:          'g62/avatars',
        EXPENSE:         'g62/expenses',
        MAINTENANCE_BILL:        'g62/maintenance-bills',
        DEBT_REPAYMENT:          'g62/debt-repayments',
        CASH_COLLECTION_RECEIPT: 'g62/cash-collection-receipts',
        COMPANY_QR:              'g62/company-qr',
    },
});

module.exports = { UPLOAD };
