const express = require('express');
const router = express.Router();

const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const coordinatorController = require('../controllers/coordinatorController');
const tripController = require('../controllers/tripController');

router.use(verifyToken, requireRole('coordinator'));

router.get('/dashboard', coordinatorController.getDashboard);
router.get('/vehicle-groups', coordinatorController.listVehicleGroups);
// Xe sẵn sàng nhận chuyến — nuôi ô chọn xe ở panel gán chuyến. Không lọc theo nhóm
// xe: điều phối được gán xe bất kỳ, cước vẫn bám nhóm xe ghi trong đơn.
router.get('/assignable-vehicles', coordinatorController.listAssignableVehicles);
router.get('/partners', coordinatorController.listPartners);
router.get('/incidents', coordinatorController.getIncidents);

// Xem Trip Pool (toàn bộ nhóm xe, hoặc filter theo vehicleGroupId) — read-only, không claim được
router.get('/trip-pool', tripController.getTripPool);

// Hủy / điều chuyển 1 trip cụ thể — ngoài luồng sự cố
router.patch('/trips/:id/cancel',   coordinatorController.cancelShipment);
router.patch('/trips/:id/reassign', coordinatorController.reassignShipment);

// Gán trước nhiều chuyến của CÙNG một đơn cho 1 tài xế — chạy tuần tự, chuyến sau
// tự mở khi chuyến trước hoàn thành. Chặn nếu tài đang vướng đơn khác.
router.post('/orders/:id/assign-driver', coordinatorController.assignOrderShipments);

// Xử lý chuyến giao thất bại: giao lại hay hoàn hàng, và khách có phải trả tiền
router.post('/trips/:id/resolve-failed', coordinatorController.resolveFailedShipment);

// Receipt request management (driver yêu cầu → coordinator xử lý)
router.get('/receipt-requests',          coordinatorController.getReceiptRequests);
router.get('/receipt-requests/:id',      coordinatorController.getReceiptRequestDetail);
router.post('/receipt-requests/:id/approve',        coordinatorController.approveReceiptRequest);
router.post('/receipt-requests/:id/reject',         coordinatorController.rejectReceiptRequest);

// Chi phí driver khai — coordinator là người duyệt/từ chối duy nhất (thay Manager)
const spendingController = require('../controllers/spendingController');
router.get('/expenses',               spendingController.listExpenses);
router.patch('/expenses/:id/approve', coordinatorController.approveExpense);
router.patch('/expenses/:id/reject',  coordinatorController.rejectExpense);
// Gỡ duyệt: cứu chi phí đã duyệt nhưng sai số tiền (tài xế không tự sửa được)
router.patch('/expenses/:id/unapprove', coordinatorController.unapproveExpense);

module.exports = router;
