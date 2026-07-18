import { RiArrowRightLine } from "react-icons/ri";

const toAddress = (s) => (typeof s === "string" ? s : s?.address) || "";

// Hiển thị hành trình nhiều điểm lấy/trả — đánh số thứ tự rõ ràng thay vì nối
// bằng dấu phẩy (dễ nhầm với dấu phẩy trong chính địa chỉ, vd "Cầu Giấy, Hà Nội").
export function RouteStops({ pickups = [], deliveries = [], className = "" }) {
  const stops = [
    ...pickups.map(toAddress).filter(Boolean).map((address) => ({ address, kind: "Lấy" })),
    ...deliveries.map(toAddress).filter(Boolean).map((address) => ({ address, kind: "Trả" })),
  ];

  if (stops.length === 0) return <span className="text-gray-300">—</span>;

  // 1 điểm lấy → 1 điểm trả: giữ kiểu hiển thị quen thuộc, không cần đánh số
  if (stops.length === 2 && stops[0].kind === "Lấy" && stops[1].kind === "Trả") {
    return (
      <span className={`inline-flex items-center gap-1 min-w-0 ${className}`}>
        <span className="truncate">{stops[0].address}</span>
        <RiArrowRightLine className="text-gray-300 flex-shrink-0" size={12} />
        <span className="truncate">{stops[1].address}</span>
      </span>
    );
  }

  if (stops.length === 1) return <span className={`truncate block ${className}`}>{stops[0].address}</span>;

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {stops.map((s, i) => {
        const isPickup = s.kind === "Lấy";
        return (
          <div key={i} className="flex items-center gap-1.5 min-w-0">
            <span
              className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold flex-shrink-0 ${
                isPickup ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"
              }`}
            >
              {i + 1}
            </span>
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold flex-shrink-0 ${
                isPickup ? "bg-green-50 text-green-700" : "bg-orange-50 text-orange-700"
              }`}
            >
              {isPickup ? "Lấy" : "Trả"}
            </span>
            <span className="truncate">{s.address}</span>
          </div>
        );
      })}
    </div>
  );
}

export default RouteStops;
