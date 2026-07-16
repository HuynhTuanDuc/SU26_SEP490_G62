const express          = require('express');
const bonusController  = require('../controllers/bonusController');
const { verifyToken, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(verifyToken);

// ─── Driver ──────────────────────────────────────────────────────────────────
router.get('/my', requireRole('driver'), bonusController.getMyBonuses);

// ─── Manager + Accountant (read) ─────────────────────────────────────────────
router.get('/',            requireRole('manager', 'accountant'), bonusController.getAll);
router.get('/stats',       requireRole('manager', 'accountant'), bonusController.getStats);
router.get('/staff-lookup', requireRole('manager', 'accountant'), bonusController.getStaffLookup);
router.get('/:id',         requireRole('manager', 'accountant'), bonusController.getOne);

// ─── Tet (manager only) ───────────────────────────────────────────────────────
router.get('/tet/preview',    requireRole('manager'), bonusController.previewTet);
router.post('/tet/generate',  requireRole('manager'), bonusController.generateTet);

// ─── Create welfare / special (manager + accountant) ─────────────────────────
router.post('/', requireRole('manager', 'accountant'), bonusController.create);

// ─── Approve / Reject (manager only) ─────────────────────────────────────────
router.patch('/:id/approve', requireRole('manager'), bonusController.approve);
router.patch('/:id/reject',  requireRole('manager'), bonusController.reject);

// ─── Pay (accountant only) ───────────────────────────────────────────────────
router.patch('/:id/pay', requireRole('accountant'), bonusController.pay);

module.exports = router;
