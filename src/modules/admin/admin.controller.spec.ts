import { AdminController } from './admin.controller';
import { DriversService } from '../drivers/drivers.service';
import { TripsService } from '../trips/trips.service';
import { AdminService } from './admin.service';

describe('AdminController', () => {
  let controller: AdminController;
  let driversService: jest.Mocked<
    Pick<
      DriversService,
      'listByStatus' | 'getByIdForAdmin' | 'updateVerification'
    >
  >;
  let tripsService: jest.Mocked<Pick<TripsService, 'listAll'>>;
  let adminService: jest.Mocked<Pick<AdminService, 'getStats'>>;

  beforeEach(() => {
    driversService = {
      listByStatus: jest.fn(),
      getByIdForAdmin: jest.fn(),
      updateVerification: jest.fn(),
    };
    tripsService = { listAll: jest.fn() };
    adminService = { getStats: jest.fn() };

    controller = new AdminController(
      driversService as unknown as DriversService,
      tripsService as unknown as TripsService,
      adminService as unknown as AdminService,
    );
  });

  it('delegates dashboard stats to AdminService', () => {
    controller.getStats();
    expect(adminService.getStats).toHaveBeenCalled();
  });

  it('defaults pagination to page 1 / limit 20 when listing drivers', () => {
    controller.listDrivers(undefined, undefined, undefined);
    expect(driversService.listByStatus).toHaveBeenCalledWith(
      undefined,
      1,
      20,
      undefined,
    );
  });

  it('parses page/limit query params when listing drivers', () => {
    controller.listDrivers('approved', '3', '50');
    expect(driversService.listByStatus).toHaveBeenCalledWith(
      'approved',
      3,
      50,
      undefined,
    );
  });

  it('passes the search query param when listing drivers', () => {
    controller.listDrivers('approved', '1', '20', 'juan');
    expect(driversService.listByStatus).toHaveBeenCalledWith(
      'approved',
      1,
      20,
      'juan',
    );
  });

  it('delegates single driver lookup by id', () => {
    controller.getDriver('driver-1');
    expect(driversService.getByIdForAdmin).toHaveBeenCalledWith('driver-1');
  });

  it('delegates verification updates with the requested status', () => {
    controller.updateVerification('driver-1', {
      verificationStatus: 'approved',
    });
    expect(driversService.updateVerification).toHaveBeenCalledWith(
      'driver-1',
      'approved',
    );
  });

  it('defaults pagination to page 1 / limit 20 when listing trips', () => {
    controller.listTrips(undefined, undefined, undefined);
    expect(tripsService.listAll).toHaveBeenCalledWith(undefined, 1, 20);
  });
});
