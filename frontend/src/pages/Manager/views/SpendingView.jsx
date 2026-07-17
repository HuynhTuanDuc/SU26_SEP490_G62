import { SpendingManagement } from "../../../components/shared-ui/SpendingManagement";
import { managerService } from "../services/manager.service";

// Manager: duyệt chi phí tài xế + duyệt phiếu chi. Không tạo/chi phiếu (việc của kế toán).
export default function SpendingView() {
  return (
    <SpendingManagement
      canModerateExpense
      canModerateVoucher
      api={{
        listExpenses: managerService.getSpendingExpenses,
        approveExpense: managerService.approveExpense,
        rejectExpense: managerService.rejectExpense,
        listVouchers: managerService.getVouchers,
        approveVoucher: managerService.approveVoucher,
        rejectVoucher: managerService.rejectVoucher,
        getSummary: managerService.getSpendingSummary,
      }}
    />
  );
}
