import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';

describe('DriversController', () => {
  let controller: DriversController;
  let driversService: jest.Mocked<
    Pick<
      DriversService,
      | 'completeProfile'
      | 'getDriverIdByUserId'
      | 'updateAvailability'
      | 'getPendingRequest'
      | 'getSummary'
      | 'getPublicProfile'
    >
  >;

  beforeEach(() => {
    driversService = {
      completeProfile: jest.fn(),
      getDriverIdByUserId: jest.fn(),
      updateAvailability: jest.fn(),
      getPendingRequest: jest.fn(),
      getSummary: jest.fn(),
      getPublicProfile: jest.fn(),
    };
    controller = new DriversController(
      driversService as unknown as DriversService,
    );
  });

  it('completes the driver profile for the authenticated user', () => {
    const req = { user: { userId: 'user-1' } };
    const dto = { vehicleType: 'car' } as any;
    controller.completeProfile(req as any, dto);
    expect(driversService.completeProfile).toHaveBeenCalledWith('user-1', dto);
  });

  it('resolves the driver id before updating availability', async () => {
    driversService.getDriverIdByUserId.mockResolvedValue('driver-1');
    const req = { user: { userId: 'user-1' } };

    await controller.updateAvailability(req as any, { available: true });

    expect(driversService.getDriverIdByUserId).toHaveBeenCalledWith('user-1');
    expect(driversService.updateAvailability).toHaveBeenCalledWith(
      'driver-1',
      true,
    );
  });

  it('resolves the driver id before fetching the trip summary', async () => {
    driversService.getDriverIdByUserId.mockResolvedValue('driver-1');
    const req = { user: { userId: 'user-1' } };

    await controller.summary(req as any);

    expect(driversService.getSummary).toHaveBeenCalledWith('driver-1');
  });

  it('exposes the public driver profile by id without authentication context', () => {
    controller.getPublicProfile('driver-1');
    expect(driversService.getPublicProfile).toHaveBeenCalledWith('driver-1');
  });
});
