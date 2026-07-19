const express = require('express');
const router = express.Router();

const accountantFinanceController      = require('../controllers/accountantFinanceController');
const accountantDebtController         = require('../controllers/accountantDebtController');
const accountantPaymentController      = require('../controllers/accountantPaymentController');
const accountantReportController       = require('../controllers/accountantReportController');
const accountantBankTransferController = require('../controllers/accountantBankTransferController');
const accountantLedgerController       = require('../controllers/accountantLedgerController');
const accountantOrderRoutes   = require('./accountantOrderRoutes');
const accountantPayrollRoutes = require('./accountantPayrollRoutes');
const { verifyToken, requireRole } = require('../middleware/authMiddleware');

router.use(verifyToken, requireRole('accountant'));

router.get('/finance/stats',      accountantFinanceController.getFinanceStats);
router.get('/reports/overview',  accountantReportController.getOverview);

// Danh sách nhóm xe (dùng cho dropdown sửa nhóm KPI cố định của tài xế ở màn Bảng lương)
router.get('/vehicle-groups', (req, res) => {
    const coordinatorController = require('../controllers/coordinatorController');
    return coordinatorController.listVehicleGroups(req, res);
});
router.use('/orders', accountantOrderRoutes);
router.use('/payroll', accountantPayrollRoutes);
router.get('/debts', accountantDebtController.getDebts);
router.get('/debts/stats', accountantDebtController.getDebtStats);
router.get('/debts/grouped', accountantDebtController.getDebtsGrouped);
router.get('/debts/person/:personType/:personId', accountantDebtController.getDebtsByPerson);

router.get ('/debts/payment/history', accountantPaymentController.getAllPaymentHistory);
router.get ('/debts/payment/history/:personType/:personId', accountantPaymentController.getPaymentHistory);
router.post('/debts/payment/preview',    accountantPaymentController.previewAllocation);
router.post('/debts/payment/allocate',   accountantPaymentController.allocatePayment);
router.post('/debts/payment/by-shipment', accountantPaymentController.paymentByShipment);
router.post('/debts/payment/by-debt',    accountantPaymentController.paymentByDebt);

router.get ('/receipts/bank-transfer',                              accountantBankTransferController.getPendingBankTransfers);
router.post('/receipts/:receiptId/confirm-bank-transfer',           accountantBankTransferController.confirmBankTransfer);

// Quản lý chi — xem chi phí tài xế (đối chiếu), phiếu chi thủ công
// (Accountant tạo → Manager duyệt → Accountant xác nhận chi), tổng hợp chi
const spendingController = require('../controllers/spendingController');
const { uploadPaymentVoucher } = require('../middleware/uploadMiddleware');
const handleUpload = (middleware) => (req, res, next) => {
    middleware(req, res, (err) => {
        if (err) return res.status(422).json({ error: err.message });
        next();
    });
};
router.get  ('/expenses',          spendingController.listExpenses);
router.get  ('/vouchers',          spendingController.listVouchers);
router.post ('/vouchers',          handleUpload(uploadPaymentVoucher.single('proof')), spendingController.createVoucher);
router.patch('/vouchers/:id/pay',  spendingController.payVoucher);
router.get  ('/spending-summary',  spendingController.getSpendingSummary);

// Nhật ký tài chính (append-only ledger) + xuất kỳ kế toán
router.get ('/ledger',        accountantLedgerController.getJournal);
router.get ('/ledger/stats',  accountantLedgerController.getJournalStats);
router.post('/ledger/export', accountantLedgerController.exportPeriod);
router.post('/ledger/:id/reverse', accountantLedgerController.reverseEntry);

module.exports = router;
