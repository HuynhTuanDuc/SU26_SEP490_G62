const express = require('express');
const managerController = require('../controllers/managerController');
const tripController = require('../controllers/tripController');
const { verifyToken, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(verifyToken);
router.use(requireRole('manager'));

router.get('/dashboard', managerController.getDashboard);

// Xem Trip Pool (read-only, không claim được)
router.get('/trip-pool', tripController.getTripPool);

// Danh sách nhóm xe (dùng chung cho KPI/Leaderboard filter, giống Coordinator)
router.get('/vehicle-groups', (req, res) => {
    const coordinatorController = require('../controllers/coordinatorController');
    return coordinatorController.listVehicleGroups(req, res);
});

// Hủy / điều chuyển 1 trip cụ thể — ngoài luồng sự cố
router.patch('/trips/:id/cancel',   managerController.cancelShipment);
router.patch('/trips/:id/reassign', managerController.reassignShipment);

// Xem + resolve sự cố (resolve dùng chung route /api/incidents/:id/status)
router.get('/incidents', managerController.getIncidents);
router.get('/salary-advances', managerController.getSalaryAdvances);
router.patch('/salary-advances/:id/approve', managerController.approveSalaryAdvance);
router.patch('/salary-advances/:id/reject', managerController.rejectSalaryAdvance);

router.get('/debt-repayments', managerController.getPendingDebtRepayments);
router.patch('/debt-repayments/:paymentId/confirm', managerController.confirmDebtRepayment);
router.patch('/debt-repayments/:paymentId/reject', managerController.rejectDebtRepayment);

router.get('/payrolls',              managerController.getPayrolls);
router.patch('/payrolls/:id/review', managerController.reviewPayroll);

router.get('/receipt-requests', managerController.getReceiptRequests);

// Duyệt / từ chối chi phí driver khai (song song quyền của Coordinator)
router.patch('/expenses/:id/approve', managerController.approveExpense);
router.patch('/expenses/:id/reject',  managerController.rejectExpense);
router.get('/partners', managerController.getPartners);
router.post('/partners', managerController.createPartner);
router.put('/partners/:id', managerController.updatePartner);
router.get('/partners/:id/debts', managerController.getPartnerDebtDetails);

module.exports = router;
