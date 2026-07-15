import { CustomerManagement } from "../../../components/shared-ui/CustomerManagement";
import { coordinatorService } from "../services/coordinator.service";

export default function CustomersView() {
  return (
    <CustomerManagement
      getCustomers={coordinatorService.getCustomers}
      createCustomer={coordinatorService.createCustomer}
      updateCustomer={coordinatorService.updateCustomer}
      deleteCustomer={coordinatorService.deleteCustomer}
    />
  );
}
