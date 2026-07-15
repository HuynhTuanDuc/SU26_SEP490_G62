import { useEffect, useState } from "react";
import { Autocomplete, AutocompleteItem } from "@heroui/react";

// Cache ở module-level — chỉ gọi VietQR API 1 lần cho cả phiên, dùng lại giữa các lần mount.
let banksCache = null;
let banksPromise = null;

const loadBanks = () => {
  if (banksCache) return Promise.resolve(banksCache);
  if (!banksPromise) {
    banksPromise = fetch("https://api.vietqr.io/v2/banks")
      .then((res) => res.json())
      .then((json) => {
        banksCache = json.data || [];
        return banksCache;
      })
      .catch(() => {
        banksPromise = null;
        return [];
      });
  }
  return banksPromise;
};

/**
 * Ô chọn ngân hàng — danh sách lấy từ API công khai VietQR (không cần API key).
 * Vẫn cho gõ tự do (allowsCustomValue) để không chặn dữ liệu ngân hàng cũ đã lưu dạng text.
 */
export function BankSelect({ value, onChange, label = "Ngân hàng", size = "sm", variant = "bordered" }) {
  const [banks, setBanks] = useState(banksCache || []);
  const [loading, setLoading] = useState(!banksCache);

  useEffect(() => {
    let cancelled = false;
    loadBanks().then((data) => {
      if (!cancelled) {
        setBanks(data);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const selectedBank = banks.find((b) => b.shortName === value);

  return (
    <Autocomplete
      label={label}
      variant={variant}
      size={size}
      isLoading={loading}
      inputValue={value || ""}
      onInputChange={(v) => onChange?.(v)}
      onSelectionChange={(key) => {
        const bank = banks.find((b) => String(b.id) === key);
        if (bank) onChange?.(bank.shortName);
      }}
      allowsCustomValue
      defaultItems={banks}
      listboxProps={{ emptyContent: loading ? "Đang tải danh sách ngân hàng..." : "Không tìm thấy ngân hàng." }}
      inputProps={{
        startContent: selectedBank?.logo ? (
          <img src={selectedBank.logo} alt={selectedBank.shortName} className="w-5 h-5 object-contain flex-shrink-0" />
        ) : null,
      }}
    >
      {(bank) => (
        <AutocompleteItem key={String(bank.id)} textValue={bank.shortName}>
          <div className="flex items-center gap-2">
            {bank.logo && <img src={bank.logo} alt={bank.shortName} className="w-6 h-6 object-contain flex-shrink-0" />}
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium truncate">{bank.shortName}</span>
              <span className="text-xs text-gray-400 truncate">{bank.name}</span>
            </div>
          </div>
        </AutocompleteItem>
      )}
    </Autocomplete>
  );
}

export default BankSelect;
