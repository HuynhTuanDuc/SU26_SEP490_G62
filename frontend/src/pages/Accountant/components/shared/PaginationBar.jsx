import { Pagination, Select, SelectItem } from "@heroui/react";

const PAGE_SIZES = ["5", "10", "15", "20"];

/**
 * Reusable pagination bar: item-count info + page-size selector + page nav.
 *
 * Props:
 *   page             – current page (1-based)
 *   pageSize         – current page size
 *   totalItems       – total number of items
 *   totalPages       – total number of pages
 *   onPageChange     – (page: number) => void
 *   onPageSizeChange – (size: number) => void
 */
export function PaginationBar({
  page,
  pageSize,
  totalItems,
  totalPages,
  onPageChange,
  onPageSizeChange,
}) {
  const from = totalItems === 0 ? 0 : Math.min((page - 1) * pageSize + 1, totalItems);
  const to   = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex items-center justify-between flex-wrap gap-3 px-1">
      <span className="text-xs text-gray-400 select-none">
        {totalItems === 0
          ? "Không có dữ liệu"
          : `Hiển thị ${from}–${to} / ${totalItems} mục`}
      </span>

      <div className="flex items-center gap-3">
        <Select
          size="sm"
          variant="bordered"
          selectedKeys={new Set([String(pageSize)])}
          onSelectionChange={(keys) => {
            const val = Number([...keys][0]);
            if (val) onPageSizeChange(val);
          }}
          className="w-[120px]"
          aria-label="Số dòng mỗi trang"
        >
          {PAGE_SIZES.map((s) => (
            <SelectItem key={s}>{s} / trang</SelectItem>
          ))}
        </Select>

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
