const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/accountantPayrollController');

router.get('/advances',                ctrl.getSalaryAdvances);
router.patch('/advances/:id/disburse', ctrl.disburseAdvance);
router.post('/generate',               ctrl.generatePayrolls);
router.get('/settlements',             ctrl.getTerminationSettlements);

router.get('/',               ctrl.getPayrolls);
router.patch('/:id/confirm',  ctrl.confirmPayroll);
router.patch('/:id/pay',      ctrl.markPayrollPaid);
router.patch('/:id/revert',   ctrl.revertPayroll);
router.patch('/:id/adjust',   ctrl.adjustPayroll);

module.exports = router;
