import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import VehicleList from '../../src/features/admin/VehicleList';
import * as api from '../../src/features/admin/vehicleManagementApi';

vi.mock('../../src/features/admin/vehicleManagementApi', () => ({
  fetchVehicleGroups: vi.fn().mockResolvedValue({ vehicleGroups: [{ id: 1, name: 'Group A' }] }),
  fetchVehicles: vi.fn().mockResolvedValue({
    items: [{ id: 1, plate_number: '29A-123.45', vehicle_group_id: 1, status: 'active', vehicle_group_name: 'Group A' }],
    pagination: { page: 1, limit: 10, total: 1 }
  }),
  createVehicle: vi.fn(),
  updateVehicle: vi.fn(),
  fetchVehicleDetail: vi.fn(),
  fetchDriverOptions: vi.fn().mockResolvedValue({ drivers: [] }),
  assignVehicleDriver: vi.fn(),
  sendVehicleToMaintenance: vi.fn(),
  markVehicleBroken: vi.fn(),
  retireVehicle: vi.fn(),
  restoreVehicle: vi.fn(),
  verifyVehicleMaintenance: vi.fn()
}));


Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

describe('VehicleList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('L1-VM-FE-01: renders vehicle table and fetches initial data', async () => {
    render(<VehicleList />);

    await waitFor(() => {
      expect(api.fetchVehicleGroups).toHaveBeenCalled();
      expect(api.fetchVehicles).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }));
      expect(screen.getByText('29A-123.45')).toBeInTheDocument();
    });
  });

  it('L1-VM-FE-02: handles search and filtering', async () => {
    render(<VehicleList />);

    await waitFor(() => {
      expect(screen.getByText('29A-123.45')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search by plate number/i);
    fireEvent.change(searchInput, { target: { value: '29A' } });

    const applyBtn = screen.getByRole('button', { name: /apply/i });
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(api.fetchVehicles).toHaveBeenCalledWith(expect.objectContaining({ search: '29A', page: 1 }));
    });
  });

  it('L1-VM-FE-03: opens add vehicle modal', async () => {
    render(<VehicleList />);

    const addBtn = screen.getByRole('button', { name: /add vehicle/i });
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });
});
