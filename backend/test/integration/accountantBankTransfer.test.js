const { setupL2Suite } = require('./support');
const routeGuardCases = require('./routeGuardCases');
const { runRouteGuardSuite } = require('./routeGuardSupport');

const ctx = setupL2Suite();

// Controller này hiện chỉ được phủ ở mức cổng chặn quyền. Chưa có ca nghiệp vụ nào đi
// hết Controller → Service → Repository → DB — xem cột Ghi chú của Sheet2 trong
// Report 5.2 để biết đây là khoảng trống đã ghi nhận, không phải bỏ sót.
runRouteGuardSuite(ctx, 'AccountantBankTransfer', routeGuardCases.AccountantBankTransfer);
