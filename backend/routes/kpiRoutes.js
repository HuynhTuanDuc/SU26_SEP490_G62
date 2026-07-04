const express = require('express');
const router  = express.Router();

const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const kpiController = require('../controllers/kpiController');

// ─── Phân quyền ───────────────────────────────────────────────────────────────
// Driver     → chỉ xem KPI & leaderboard của bản thân
// Coordinator/Manager → xem tất cả driver, filter theo nhóm xe
// Accountant → xem KPI của 1 driver cụ thể (phục vụ tính lương)

const driverOnly     = [verifyToken, requireRole('driver')];
const staffOnly      = [verifyToken, requireRole('coordinator', 'manager')];
const financeStaff   = [verifyToken, requireRole('coordinator', 'manager', 'accountant')];

// ─── Driver routes ────────────────────────────────────────────────────────────

router.get('/me',          driverOnly, kpiController.getMyKPI);
router.get('/leaderboard', driverOnly, kpiController.getLeaderboard);

module.exports = router;
