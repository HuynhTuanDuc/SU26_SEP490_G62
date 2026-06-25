import { apiRequest } from "../../services/apiClient";

export async function fetchVehicleGroups() {
  return apiRequest("/api/admin/vehicle-groups");
}

export async function fetchVehicleGroupDetail(id) {
  return apiRequest(`/api/admin/vehicle-groups/${id}`);
}

export async function createVehicleGroup(payload) {
  return apiRequest("/api/admin/vehicle-groups", {
    method: "POST",
    body: payload,
  });
}

export async function updateVehicleGroup(id, payload) {
  return apiRequest(`/api/admin/vehicle-groups/${id}`, {
    method: "PUT",
    body: payload,
  });
}

export async function deleteVehicleGroup(id) {
  return apiRequest(`/api/admin/vehicle-groups/${id}`, {
    method: "DELETE",
  });
}

export async function fetchVehicles(params = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, String(value));
    }
  });

  const query = searchParams.toString();
  return apiRequest(`/api/admin/vehicles${query ? `?${query}` : ""}`);
}

export async function fetchVehicleDetail(id) {
  return apiRequest(`/api/admin/vehicles/${id}`);
}

export async function createVehicle(payload) {
  return apiRequest("/api/admin/vehicles", {
    method: "POST",
    body: payload,
  });
}

export async function updateVehicle(id, payload) {
  return apiRequest(`/api/admin/vehicles/${id}`, {
    method: "PUT",
    body: payload,
  });
}

export async function changeVehicleStatus(id, status) {
  return apiRequest(`/api/admin/vehicles/${id}/status`, {
    method: "PATCH",
    body: { status },
  });
}

export async function sendVehicleToMaintenance(id, payload) {
  return apiRequest(`/api/admin/vehicles/${id}/send-to-maintenance`, {
    method: "POST",
    body: payload,
  });
}

export async function completeVehicleMaintenance(id, payload = {}) {
  return apiRequest(`/api/admin/vehicles/${id}/complete-maintenance`, {
    method: "POST",
    body: payload,
  });
}

export async function verifyVehicleMaintenance(id, payload = {}) {
  return apiRequest(`/api/admin/vehicles/${id}/verify-maintenance`, {
    method: "POST",
    body: payload,
  });
}

export async function markVehicleBroken(id, payload) {
  return apiRequest(`/api/admin/vehicles/${id}/mark-broken`, {
    method: "POST",
    body: payload,
  });
}

export async function restoreVehicle(id, payload = {}) {
  return apiRequest(`/api/admin/vehicles/${id}/restore`, {
    method: "POST",
    body: payload,
  });
}

export async function retireVehicle(id, payload = {}) {
  return apiRequest(`/api/admin/vehicles/${id}/retire`, {
    method: "POST",
    body: payload,
  });
}

export async function assignVehicleDriver(id, assignedDriverId) {
  return apiRequest(`/api/admin/vehicles/${id}/driver-assignment`, {
    method: "PATCH",
    body: { assigned_driver_id: assignedDriverId ?? null },
  });
}

export async function softDeleteVehicle(id) {
  return apiRequest(`/api/admin/vehicles/${id}`, {
    method: "DELETE",
  });
}

export async function fetchDriverOptions(vehicleId) {
  const query = vehicleId ? `?vehicle_id=${vehicleId}` : "";
  return apiRequest(`/api/admin/vehicles/driver-options${query}`);
}
