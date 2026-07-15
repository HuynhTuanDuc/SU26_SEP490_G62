const express = require('express');
const router = express.Router();

const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const customerController = require('../controllers/customerController');

router.use(verifyToken, requireRole('coordinator', 'manager'));

router.get('/',      customerController.getAll);
router.get('/:id',   customerController.getOne);
router.post('/',     customerController.create);
router.put('/:id',   customerController.update);
router.delete('/:id', customerController.remove);

module.exports = router;
