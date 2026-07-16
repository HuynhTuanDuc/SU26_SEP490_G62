import { AttendanceManagement } from "../../../components/shared-ui/AttendanceManagement";
import { managerService } from "../services/manager.service";

export default function AttendanceView() {
  return (
    <AttendanceManagement
      getGrid={managerService.getAttendanceGrid}
      markAttendance={managerService.markAttendance}
      clearAttendance={managerService.clearAttendance}
      getVehicleGroups={managerService.getVehicleGroupsForKpi}
    />
  );
}
