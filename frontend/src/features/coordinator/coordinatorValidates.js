//Lấy date, 10 chữ đầu chuỗi 
export const getTodayStr = () => new Date().toISOString().slice(0, 10);

// null -> "", loại bỏ dấu , toàn bộ 
export const normalizeNumericText = (value) => String(value ?? "").replace(/,/g, "").trim(); 

//Kiểm tra số hợp lệ
export const isFiniteNumber = (value) => Number.isFinite(Number(value)); 

export const formatDateForInput = (dateStr) => {
  if (!dateStr) return "";

  const parts = String(dateStr).split('/');

  if (parts.length === 3) {
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`; //return yyyy-mm-dd
  }

  const date = new Date(dateStr);
  if (!Number.isNaN(date.getTime())) {
    return date.toISOString().slice(0, 10);//chuyển format yyyy-mm-dd, lấy 10 kí tự đầu 
  }
  return "";
};

//Đổi chuỗi thành chữ thường, loại bỏ khoảng trắng đầu cuối
export const normalizeStatus = (status) => String(status ?? "").trim().toLowerCase();

//Đổi số thành định dạng tiền tệ Việt Nam, thêm "đ" vào cuối
export const formatCurrency = (value) => `${Number(value || 0).toLocaleString("vi-VN")} đ`;



//Giải quyết giá trị cước phí, trả về giá trị đầu tiên hợp lệ (số dương), nếu không có thì trả về 0
export const resolveFareValue = (...values) => {
  for (const value of values) {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue) && numericValue > 0) return numericValue;
  }
  return 0;
};
//Xem có thể hủy chuyến được ko
export const canCancelTrip = (trip) => {
  const statuses = Array.isArray(trip.trips) && trip.trips.length > 0
    ? trip.trips.map((item) => normalizeStatus(item.status))
    : [normalizeStatus(trip.status)];
  return Boolean(trip.orderId) && statuses.some((status) => !["completed", "cancelled", "failed"].includes(status));
};