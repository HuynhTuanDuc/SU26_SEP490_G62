const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { verifyToken, requireRole } = require('../middleware/authMiddleware');

router.use(verifyToken);
router.use(requireRole('manager'));

router.get('/users', adminController.getAllUsers);

router.post('/users', adminController.createUser);
router.put('/users/:id', adminController.updateUser);
router.patch('/users/:id/status', adminController.toggleUserStatus);
router.post('/users/:id/reset-password', adminController.resetUserPassword);

module.exports = router;
