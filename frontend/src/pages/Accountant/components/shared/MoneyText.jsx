import { money } from "../../../../utils/formatNumber";

// Hiển thị một khoản tiền. Mọi quy tắc định dạng nằm ở utils/formatNumber — component
// này chỉ lo phần bọc thẻ và lớp CSS.
//
// Trước đây nó dùng Intl style:"currency" nên ra "1.500.000 ₫" (ký hiệu ₫, có dấu cách)
// trong khi phần còn lại của hệ thống in "1.500.000đ" — cùng một số, hai cách viết,
// ngay cạnh nhau trên cùng một màn hình.
export function MoneyText({ amount, className = "", fallback }) {
  return <span className={className}>{money(amount, fallback)}</span>;
}
