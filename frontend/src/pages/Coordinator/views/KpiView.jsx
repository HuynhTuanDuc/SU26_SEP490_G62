import { KpiLeaderboard } from "../../../components/shared-ui/KpiLeaderboard";
import { coordinatorService } from "../services/coordinator.service";

export default function KpiView() {
  return (
    <KpiLeaderboard
      getVehicleGroups={coordinatorService.getVehicleGroups}
      getAllDriversKPI={coordinatorService.getAllDriversKPI}
      getLeaderboardByGroup={coordinatorService.getLeaderboardByGroup}
      onUpdateDriverGroup={coordinatorService.updateDriverVehicleGroup}
    />
  );
}
