import { TrackingService } from './tracking.service';

describe('TrackingService', () => {
  let service: TrackingService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      locationTracking: { create: jest.fn(), findFirst: jest.fn() },
    };
    service = new TrackingService(prisma);
  });

  it('records a location for a driver', async () => {
    await service.recordLocation('driver-1', 14.1, -87.2, 'trip-1');

    expect(prisma.locationTracking.create).toHaveBeenCalledWith({
      data: { driverId: 'driver-1', lat: 14.1, lng: -87.2, tripId: 'trip-1' },
    });
  });

  it('returns null when there is no recorded location for the trip', async () => {
    prisma.locationTracking.findFirst.mockResolvedValue(null);
    await expect(service.getLastLocationForTrip('trip-1')).resolves.toBeNull();
  });

  it('converts the last recorded location to numbers', async () => {
    const recordedAt = new Date();
    prisma.locationTracking.findFirst.mockResolvedValue({
      lat: 14.1,
      lng: -87.2,
      recordedAt,
    });

    const result = await service.getLastLocationForTrip('trip-1');

    expect(result).toEqual({ lat: 14.1, lng: -87.2, recordedAt });
    expect(prisma.locationTracking.findFirst).toHaveBeenCalledWith({
      where: { tripId: 'trip-1' },
      orderBy: { recordedAt: 'desc' },
    });
  });
});
