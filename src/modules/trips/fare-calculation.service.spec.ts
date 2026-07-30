import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { FareCalculationService } from './fare-calculation.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('FareCalculationService', () => {
  let service: FareCalculationService;
  let prisma: { $queryRaw: jest.Mock };
  const originalApiKey = process.env.GOOGLE_MAPS_API_KEY;

  beforeEach(() => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    prisma = { $queryRaw: jest.fn() };
    service = new FareCalculationService(prisma as unknown as PrismaService);
  });

  afterAll(() => {
    if (originalApiKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = originalApiKey;
  });

  describe('isWithinHonduras', () => {
    it('returns true when PostGIS reports the point is contained', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([{ within: true }]);
      await expect(service.isWithinHonduras(14.1, -87.2)).resolves.toBe(true);
    });

    it('returns false when the boundary table has no match', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([]);
      await expect(service.isWithinHonduras(0, 0)).resolves.toBe(false);
    });
  });

  describe('calculateDistanceKm', () => {
    it('uses the Google Directions distance when the API call succeeds', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key';
      (service as any).googleMaps.directions = jest.fn().mockResolvedValue({
        data: { routes: [{ legs: [{ distance: { value: 12000 } }] }] },
      });

      const km = await service.calculateDistanceKm(14.1, -87.2, 14.2, -87.3);

      expect(km).toBe(12);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('falls back to the straight-line PostGIS distance when GOOGLE_MAPS_API_KEY is missing', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([{ distance_km: 10 }]);

      const km = await service.calculateDistanceKm(14.1, -87.2, 14.2, -87.3);

      expect(km).toBeCloseTo(13); // 10km straight-line * 1.3 padding factor
    });

    it('falls back to the straight-line distance when the Google API call throws', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key';
      (service as any).googleMaps.directions = jest
        .fn()
        .mockRejectedValue(new Error('network error'));
      prisma.$queryRaw.mockResolvedValueOnce([{ distance_km: 5 }]);

      const km = await service.calculateDistanceKm(14.1, -87.2, 14.2, -87.3);

      expect(km).toBeCloseTo(6.5);
    });
  });

  describe('resolveClosestZone', () => {
    it('throws InternalServerErrorException when no fare zones are configured', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([]);
      await expect(
        service.resolveClosestZone(14.1, -87.2),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it('returns the nearest zone row', async () => {
      const zone = { id: 'zone-1', base_fare: 20, fare_per_km: 5 };
      prisma.$queryRaw.mockResolvedValueOnce([zone]);
      await expect(service.resolveClosestZone(14.1, -87.2)).resolves.toEqual(
        zone,
      );
    });
  });

  describe('estimate', () => {
    it('rejects when the origin is outside Honduras', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([{ within: false }]);

      await expect(service.estimate(0, 0, 14.2, -87.3)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1); // short-circuits, destination never checked
    });

    it('rejects when the destination is outside Honduras', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([{ within: true }])
        .mockResolvedValueOnce([{ within: false }]);

      await expect(service.estimate(14.1, -87.2, 0, 0)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('computes the fare from the closest zone and the fallback distance', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([{ within: true }]) // origin check
        .mockResolvedValueOnce([{ within: true }]) // destination check
        .mockResolvedValueOnce([{ distance_km: 10 }]) // straight-line fallback (no API key)
        .mockResolvedValueOnce([
          { id: 'zone-1', base_fare: 20, fare_per_km: 5 },
        ]); // closest zone

      const result = await service.estimate(14.1, -87.2, 14.2, -87.3);

      // distanceKm = 10 * 1.3 = 13 ; fare = 20 + 13 * 5 = 85
      expect(result).toEqual({ distanceKm: 13, fare: 85 });
    });
  });
});
