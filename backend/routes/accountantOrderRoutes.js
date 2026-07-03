const express = require('express');
const router = express.Router();

const accountantOrderController = require('../controllers/accountantOrderController');

router.get('/lookup', accountantOrderController.getVehicleDriverLookup);
router.get('/', accountantOrderController.getOrders);
router.post('/', accountantOrderController.createOrder);
router.post('/import', accountantOrderController.importOrders);
router.get('/:id/shipments', accountantOrderController.getShipments);
router.put('/:id', accountantOrderController.updateOrder);
router.post('/:id/shipments/:shipmentId/driver-payment', accountantOrderController.confirmDriverPayment);
router.get('/:id/payments', accountantOrderController.getPayments);
router.post('/:id/payments', accountantOrderController.createPayment);

module.exports = router;
