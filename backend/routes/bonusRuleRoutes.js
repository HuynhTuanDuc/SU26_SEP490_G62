const express = require('express');
const router = express.Router();

const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const bonusRuleController = require('../controllers/bonusRuleController');

// Configure Bonus Rules — Manager only (theo Permission Matrix)
router.use(verifyToken, requireRole('manager'));

router.get('/',      bonusRuleController.getAll);
router.get('/:id',   bonusRuleController.getOne);
router.post('/',     bonusRuleController.create);
router.put('/:id',   bonusRuleController.update);
router.delete('/:id', bonusRuleController.remove);

module.exports = router;
