const express = require('express');
const router = express.Router();

const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const { uploadExcel } = require('../middleware/excelUploadMiddleware');
const coordinatorController = require('../controllers/coordinatorController');

router.use(verifyToken, requireRole('coordinator'));

router.get('/vehicle-options', coordinatorController.listVehicleOptions);

router.post('/import-excel', uploadExcel.single('file'), coordinatorController.importExcel);

module.exports = router;
