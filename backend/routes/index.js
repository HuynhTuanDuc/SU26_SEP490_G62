const express = require('express');
const router = express.Router();

// Import all route modules
const authRoutes = require('./authRoutes');
const tripRoutes = require('./tripRoutes');
const profileRoutes = require('./profileRoutes');
const coordinatorRoutes = require('./coordinatorRoutes');
const orderRoutes = require('./orderRoutes');
const driverRoutes = require('./driverRoutes');
const adminRoutes = require('./adminRoutes');
const expenseRoutes = require('./expenseRoutes');
const incidentRoutes = require('./incidentRoutes');
const notificationRoutes = require('./notificationRoutes');
const kpiRoutes = require('./kpiRoutes');
const payrollRoutes = require('./payrollRoutes');
const debtRoutes = require('./debtRoutes');
const vehicleManagementRoutes = require('./vehicleManagementRoutes');
const leaveRoutes = require('./leaveRoutes');
const accountantRoutes = require('./accountantRoutes');
const cashCollectionRoutes   = require('./cashCollectionRoutes');
const companyRoutes          = require('./companyRoutes');
const managerRoutes          = require('./managerRoutes');
const bonusRoutes            = require('./bonusRoutes');


// Register route modules
router.use('/auth', authRoutes);
router.use('/orders', orderRoutes);
router.use('/accountant', accountantRoutes);
router.use('/api/trips', tripRoutes);
router.use('/api/profile', profileRoutes);
router.use('/api/coordinator', coordinatorRoutes);
router.use('/api/orders', orderRoutes);
router.use('/api/drivers', driverRoutes);
router.use('/api/admin', adminRoutes);
router.use('/api/admin', vehicleManagementRoutes);
router.use('/api/expenses', expenseRoutes);
router.use('/api/incidents', incidentRoutes);
router.use('/api/notifications', notificationRoutes);
router.use('/api/kpi', kpiRoutes);
router.use('/api/payroll', payrollRoutes);
router.use('/api/debts', debtRoutes);
router.use('/api/leave',            leaveRoutes);
router.use('/api/cash-collections', cashCollectionRoutes);
router.use('/api/company',          companyRoutes);
router.use('/api/manager',          managerRoutes);
router.use('/api/bonuses',          bonusRoutes);

module.exports = router;
