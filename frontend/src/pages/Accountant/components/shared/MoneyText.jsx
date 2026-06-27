const VND = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

export function MoneyText({ amount, className = "", fallback = "—" }) {
  if (amount == null || isNaN(Number(amount))) return <span className={className}>{fallback}</span>;
  return <span className={className}>{VND.format(Number(amount))}</span>;
}
