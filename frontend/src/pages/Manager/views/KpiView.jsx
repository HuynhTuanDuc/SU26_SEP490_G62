import { KpiLeaderboard } from "../../../components/shared-ui/KpiLeaderboard";
import { managerService } from "../services/manager.service";

export default function KpiView() {
  return (
    <KpiLeaderboard
      getVehicleGroups={managerService.getVehicleGroupsForKpi}
      getAllDriversKPI={managerService.getAllDriversKPI}
      getLeaderboardByGroup={managerService.getLeaderboardByGroup}
    />
  );
}
