const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { verifyToken, requireRole } = require('../middleware/authMiddleware');

router.use(verifyToken);
router.use(requireRole('manager'));

router.get('/', adminController.getAllUsers);

router.post('/', adminController.createUser);
router.put('/:id', adminController.updateUser);
router.patch('/:id/status', adminController.toggleUserStatus);
router.post('/:id/reset-password', adminController.resetUserPassword);
router.patch('/:id/employment', adminController.updateDriverEmployment);
router.post('/:id/terminate', adminController.terminateDriverContract);

module.exports = router;
