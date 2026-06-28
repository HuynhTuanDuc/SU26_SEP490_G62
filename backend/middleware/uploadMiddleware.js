const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');
const { UPLOAD } = require('../constants/uploadConstants');

function makeCloudinaryStorage(folder) {
    return new CloudinaryStorage({
        cloudinary,
        params: {
            folder,
            allowed_formats: UPLOAD.ALLOWED_FORMATS,
            transformation: [
                { width: UPLOAD.IMAGE_MAX_WIDTH, quality: UPLOAD.CLOUDINARY_QUALITY, fetch_format: 'auto' },
            ],
        },
    });
}

function makeUploader(folder) {
    return multer({
        storage: makeCloudinaryStorage(folder),
        limits: { fileSize: UPLOAD.MAX_FILE_SIZE_BYTES },
        fileFilter: (_req, file, cb) => {
            if (!file.mimetype.startsWith('image/')) {
                return cb(new Error('Chỉ chấp nhận file ảnh'));
            }
            cb(null, true);
        },
    });
}

const uploadProof          = makeUploader(UPLOAD.FOLDERS.PROOF);
const uploadReceipt        = makeUploader(UPLOAD.FOLDERS.RECEIPT);
const uploadPaymentReceipt = makeUploader(UPLOAD.FOLDERS.PAYMENT_RECEIPT);
const uploadIncident       = makeUploader(UPLOAD.FOLDERS.INCIDENT);
const uploadAvatar         = makeUploader(UPLOAD.FOLDERS.AVATAR);
const uploadExpense        = makeUploader(UPLOAD.FOLDERS.EXPENSE);
const uploadMaintenanceBill = makeUploader(UPLOAD.FOLDERS.MAINTENANCE_BILL);
const uploadDebtRepayment              = makeUploader(UPLOAD.FOLDERS.DEBT_REPAYMENT);
const uploadCashCollectionReceipt      = makeUploader(UPLOAD.FOLDERS.CASH_COLLECTION_RECEIPT);
const uploadCompanyQr                  = makeUploader(UPLOAD.FOLDERS.COMPANY_QR);
const uploadReceiptCollectionProof     = makeUploader(UPLOAD.FOLDERS.RECEIPT_COLLECTION_PROOF);

// Dùng cho POST /trips/:id/complete — nhận 2 field: receipt + proof (proof chỉ có khi final)
const tripCompleteStorage = new CloudinaryStorage({
    cloudinary,
    params: async (_req, file) => ({
        folder: file.fieldname === 'proof' ? UPLOAD.FOLDERS.PROOF : UPLOAD.FOLDERS.RECEIPT,
        allowed_formats: UPLOAD.ALLOWED_FORMATS,
        transformation: [
            { width: UPLOAD.IMAGE_MAX_WIDTH, quality: UPLOAD.CLOUDINARY_QUALITY, fetch_format: 'auto' },
        ],
    }),
});

const uploadTripComplete = multer({
    storage: tripCompleteStorage,
    limits: { fileSize: UPLOAD.MAX_FILE_SIZE_BYTES },
    fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) return cb(new Error('Chỉ chấp nhận file ảnh'));
        cb(null, true);
    },
});

module.exports = { uploadProof, uploadReceipt, uploadPaymentReceipt, uploadIncident, uploadAvatar, uploadExpense, uploadMaintenanceBill, uploadTripComplete, uploadDebtRepayment, uploadCashCollectionReceipt, uploadCompanyQr, uploadReceiptCollectionProof };
