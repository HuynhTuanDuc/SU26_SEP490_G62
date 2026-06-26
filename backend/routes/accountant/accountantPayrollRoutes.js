const express = require('express');
const router = express.Router();
const ctrl = require('../../controllers/accountant/accountantPayrollController');

// Static routes first (before parameterized)
router.get('/advances',                ctrl.getSalaryAdvances);
router.patch('/advances/:id/disburse', ctrl.disburseAdvance);
router.post('/generate',               ctrl.generatePayrolls);

// Payroll CRUD
router.get('/',               ctrl.getPayrolls);
router.patch('/:id/confirm',  ctrl.confirmPayroll);
router.patch('/:id/pay',      ctrl.markPayrollPaid);

module.exports = router;
