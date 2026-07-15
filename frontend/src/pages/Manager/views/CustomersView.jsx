import { CustomerManagement } from "../../../components/shared-ui/CustomerManagement";
import { managerService } from "../services/manager.service";

export default function CustomersView() {
  return (
    <CustomerManagement
      getCustomers={managerService.getCustomers}
      createCustomer={managerService.createCustomer}
      updateCustomer={managerService.updateCustomer}
      deleteCustomer={managerService.deleteCustomer}
    />
  );
}
