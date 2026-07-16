const express = require('express');
const router  = express.Router();

const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const attendanceController = require('../controllers/attendanceController');

router.use(verifyToken);
router.use(requireRole('manager', 'coordinator'));

router.get('/grid',                       attendanceController.getMonthlyGrid);
router.post('/',                          attendanceController.markAttendance);
router.delete('/:driverId/:workDate',     attendanceController.clearAttendance);

module.exports = router;
