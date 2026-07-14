import { useState, useEffect } from "react";
import { Pagination, Select, SelectItem } from "@heroui/react";

const PAGE_SIZES = ["5", "10", "15", "20"];

export function PaginationBar({ page, pageSize, totalItems, totalPages, onPageChange, onPageSizeChange }) {
  const [localSize, setLocalSize] = useState(String(pageSize));

  useEffect(() => {
    setLocalSize(String(pageSize));
  }, [pageSize]);

  const from = totalItems === 0 ? 0 : Math.min((page - 1) * pageSize + 1, totalItems);
  const to = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex items-center justify-between flex-wrap gap-3 px-1">
      <span className="text-xs text-gray-400 select-none">
        {totalItems === 0 ? "Không có dữ liệu" : `Hiển thị ${from}–${to} / ${totalItems} mục`}
      </span>

      <div className="flex items-center gap-3">
        {onPageSizeChange && (
          <Select
            size="sm"
            variant="bordered"
            selectedKeys={new Set([localSize])}
            disallowEmptySelection
            onSelectionChange={(keys) => {
              const str = [...keys][0];
              if (!str) return;
              setLocalSize(str);
              onPageSizeChange(Number(str));
            }}
            className="w-[120px]"
            aria-label="Số dòng mỗi trang"
          >
            {PAGE_SIZES.map((s) => <SelectItem key={s} textValue={`${s} / trang`}>{s} / trang</SelectItem>)}
          </Select>
        )}

        {totalPages > 1 && (
          <Pagination
            total={totalPages}
            page={page}
            onChange={onPageChange}
            color="primary"
            size="sm"
            showControls
            classNames={{ wrapper: "shadow-sm" }}
          />
        )}
      </div>
    </div>
  );
}

export default PaginationBar;
