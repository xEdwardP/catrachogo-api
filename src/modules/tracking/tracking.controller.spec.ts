import { TrackingController } from './tracking.controller';
import { TrackingService } from './tracking.service';
import { DriversService } from '../drivers/drivers.service';

describe('TrackingController', () => {
  let controller: TrackingController;
  let tracking: jest.Mocked<Pick<TrackingService, 'recordLocation'>>;
  let drivers: jest.Mocked<Pick<DriversService, 'getDriverIdByUserId'>>;

  beforeEach(() => {
    tracking = { recordLocation: jest.fn() };
    drivers = { getDriverIdByUserId: jest.fn() };
    controller = new TrackingController(
      tracking as unknown as TrackingService,
      drivers as unknown as DriversService,
    );
  });

  it('resolves the driver id from the authenticated user before recording the location', async () => {
    drivers.getDriverIdByUserId.mockResolvedValue('driver-1');
    const req = { user: { userId: 'user-1' } };

    await controller.record(req as any, {
      lat: 14.1,
      lng: -87.2,
      tripId: 'trip-1',
    });

    expect(drivers.getDriverIdByUserId).toHaveBeenCalledWith('user-1');
    expect(tracking.recordLocation).toHaveBeenCalledWith(
      'driver-1',
      14.1,
      -87.2,
      'trip-1',
    );
  });
});
