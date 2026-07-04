const express = require('express');
const managerController = require('../controllers/managerController');
const { verifyToken, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(verifyToken);
router.use(requireRole('manager'));

router.get('/dashboard', managerController.getDashboard);
router.get('/salary-advances', managerController.getSalaryAdvances);
router.patch('/salary-advances/:id/approve', managerController.approveSalaryAdvance);
router.patch('/salary-advances/:id/reject', managerController.rejectSalaryAdvance);

router.get('/debt-repayments', managerController.getPendingDebtRepayments);
router.patch('/debt-repayments/:paymentId/confirm', managerController.confirmDebtRepayment);
router.patch('/debt-repayments/:paymentId/reject', managerController.rejectDebtRepayment);

router.get('/payrolls',              managerController.getPayrolls);
router.patch('/payrolls/:id/review', managerController.reviewPayroll);

router.get('/receipt-requests', managerController.getReceiptRequests);
router.get('/partners', managerController.getPartners);
router.post('/partners', managerController.createPartner);
router.put('/partners/:id', managerController.updatePartner);
router.get('/partners/:id/debts', managerController.getPartnerDebtDetails);

module.exports = router;
