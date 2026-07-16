import { AttendanceManagement } from "../../../components/shared-ui/AttendanceManagement";
import { coordinatorService } from "../services/coordinator.service";

export default function AttendanceView() {
  return (
    <AttendanceManagement
      getGrid={coordinatorService.getAttendanceGrid}
      markAttendance={coordinatorService.markAttendance}
      clearAttendance={coordinatorService.clearAttendance}
      getVehicleGroups={coordinatorService.getVehicleGroups}
    />
  );
}
