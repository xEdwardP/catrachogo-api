import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';
import { FareCalculationService } from './fare-calculation.service';
import { DriversService } from '../drivers/drivers.service';

describe('TripsController', () => {
  let controller: TripsController;
  let tripsService: jest.Mocked<
    Pick<
      TripsService,
      | 'createTrip'
      | 'acceptTrip'
      | 'startTrip'
      | 'reportNoShow'
      | 'cancelTrip'
      | 'getHistory'
      | 'getTripDetail'
      | 'completeTrip'
    >
  >;
  let fareCalc: jest.Mocked<Pick<FareCalculationService, 'estimate'>>;
  let driversService: jest.Mocked<Pick<DriversService, 'getDriverIdByUserId'>>;

  beforeEach(() => {
    tripsService = {
      createTrip: jest.fn(),
      acceptTrip: jest.fn(),
      startTrip: jest.fn(),
      reportNoShow: jest.fn(),
      cancelTrip: jest.fn(),
      getHistory: jest.fn(),
      getTripDetail: jest.fn(),
      completeTrip: jest.fn(),
    };
    fareCalc = { estimate: jest.fn() };
    driversService = { getDriverIdByUserId: jest.fn() };

    controller = new TripsController(
      tripsService as unknown as TripsService,
      fareCalc as unknown as FareCalculationService,
      driversService as unknown as DriversService,
    );
  });

  it('estimates a fare without requiring a driver id lookup', () => {
    const dto = {
      originLat: 14.1,
      originLng: -87.2,
      destinationLat: 14.2,
      destinationLng: -87.3,
    };
    controller.estimate(dto);
    expect(fareCalc.estimate).toHaveBeenCalledWith(14.1, -87.2, 14.2, -87.3);
    expect(driversService.getDriverIdByUserId).not.toHaveBeenCalled();
  });

  it('creates a trip on behalf of the authenticated passenger', () => {
    const req = { user: { userId: 'passenger-1' } };
    const dto = { originLat: 14.1 } as any;
    controller.create(req as any, dto);
    expect(tripsService.createTrip).toHaveBeenCalledWith('passenger-1', dto);
  });

  it('resolves the driver id before accepting a trip', async () => {
    driversService.getDriverIdByUserId.mockResolvedValue('driver-1');
    const req = { user: { userId: 'user-1' } };

    await controller.accept(req as any, 'trip-1');

    expect(driversService.getDriverIdByUserId).toHaveBeenCalledWith('user-1');
    expect(tripsService.acceptTrip).toHaveBeenCalledWith('trip-1', 'driver-1');
  });

  it('passes the optional cancellation reason through to the service', () => {
    const req = { user: { userId: 'user-1' } };
    controller.cancel(req as any, 'trip-1', { reason: 'Changed my mind' });
    expect(tripsService.cancelTrip).toHaveBeenCalledWith(
      'trip-1',
      'user-1',
      'Changed my mind',
    );
  });

  it('passes the requester role through when fetching trip history', () => {
    const req = { user: { userId: 'user-1', role: 'driver' } };
    controller.getHistory(req as any, '2', '10');
    expect(tripsService.getHistory).toHaveBeenCalledWith(
      'user-1',
      'driver',
      2,
      10,
    );
  });

  it('passes the requester role through when fetching trip detail', () => {
    const req = { user: { userId: 'user-1', role: 'passenger' } };
    controller.getDetail(req as any, 'trip-1');
    expect(tripsService.getTripDetail).toHaveBeenCalledWith(
      'trip-1',
      'user-1',
      'passenger',
    );
  });

  it('resolves the driver id before completing a trip', async () => {
    driversService.getDriverIdByUserId.mockResolvedValue('driver-1');
    const req = { user: { userId: 'user-1' } };

    await controller.complete(req as any, 'trip-1');

    expect(tripsService.completeTrip).toHaveBeenCalledWith(
      'trip-1',
      'driver-1',
    );
  });
});
