import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { TripsService } from './trips.service';
import { FareCalculationService } from './fare-calculation.service';
import { DriversService } from '../drivers/drivers.service';
import { TripCandidatesCache } from '../matching/trip-candidates.cache';
import { TrackingService } from '../tracking/tracking.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('TripsService', () => {
  let service: TripsService;
  let prisma: any;
  let tx: any;
  let fareCalc: jest.Mocked<
    Pick<
      FareCalculationService,
      'estimate' | 'calculateDistanceKm' | 'resolveClosestZone'
    >
  >;
  let driversService: jest.Mocked<Pick<DriversService, 'findNearby'>>;
  let candidatesCache: jest.Mocked<TripCandidatesCache>;
  let tracking: jest.Mocked<Pick<TrackingService, 'getLastLocationForTrip'>>;
  let notifications: jest.Mocked<
    Pick<NotificationsService, 'create' | 'pushOnly' | 'pushToAdmins'>
  >;

  const PLATFORM_USER_ID = 'platform-user';

  beforeEach(() => {
    process.env.PLATFORM_USER_ID = PLATFORM_USER_ID;
    process.env.PLATFORM_COMMISSION_RATE = '0.1';
    process.env.CANCELLATION_FEE_AMOUNT = '25';
    process.env.CANCELLATION_FEE_DRIVER_SHARE = '0.8';
    process.env.NO_SHOW_GRACE_PERIOD_MINUTES = '5';

    tx = {
      trip: { update: jest.fn() },
      wallet: {
        update: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      walletTransaction: { create: jest.fn() },
    };

    prisma = {
      user: { findUnique: jest.fn() },
      trip: { findUnique: jest.fn(), update: jest.fn() },
      wallet: { findUnique: jest.fn() },
      driver: { findMany: jest.fn() },
      rating: { findFirst: jest.fn() },
      $executeRaw: jest.fn(),
      $transaction: jest.fn((cb: any) => cb(tx)),
    };

    fareCalc = {
      estimate: jest.fn(),
      calculateDistanceKm: jest.fn(),
      resolveClosestZone: jest.fn(),
    };
    driversService = { findNearby: jest.fn() };
    candidatesCache = {
      set: jest.fn(),
      isCandidate: jest.fn(),
      getPendingFor: jest.fn(),
      removeDriver: jest.fn(),
      clear: jest.fn(),
    } as unknown as jest.Mocked<TripCandidatesCache>;
    tracking = { getLastLocationForTrip: jest.fn() };
    notifications = {
      create: jest.fn(),
      pushOnly: jest.fn(),
      pushToAdmins: jest.fn(),
    };

    service = new TripsService(
      prisma,
      fareCalc as unknown as FareCalculationService,
      driversService as unknown as DriversService,
      candidatesCache,
      tracking as unknown as TrackingService,
      notifications as unknown as NotificationsService,
    );
  });

  const decimalTrip = (overrides: Record<string, any> = {}) => ({
    id: 'trip-1',
    passengerId: 'passenger-1',
    driverId: 'driver-1',
    status: 'pending',
    fare: 100,
    distanceKm: 10,
    originLat: 14.1,
    originLng: -87.2,
    originAddress: 'Origin',
    destinationLat: 14.2,
    destinationLng: -87.3,
    destinationAddress: 'Destination',
    arrivedAt: null,
    cancelReason: null,
    driver: { userId: 'driver-user-1' },
    ...overrides,
  });

  describe('createTrip', () => {
    it('rejects when the passenger has no phone number on file', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'passenger-1',
        phone: null,
      });

      await expect(
        service.createTrip('passenger-1', {
          originLat: 14.1,
          originLng: -87.2,
          originAddress: 'A',
          destinationLat: 14.2,
          destinationLng: -87.3,
          destinationAddress: 'B',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(fareCalc.estimate).not.toHaveBeenCalled();
    });

    it('rejects with 402 when the wallet balance is insufficient', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'passenger-1',
        phone: '+50412345678',
      });
      fareCalc.estimate.mockResolvedValue({ distanceKm: 10, fare: 100 });
      prisma.wallet.findUnique.mockResolvedValue({ balance: 50 });

      await expect(
        service.createTrip('passenger-1', {
          originLat: 14.1,
          originLng: -87.2,
          originAddress: 'A',
          destinationLat: 14.2,
          destinationLng: -87.3,
          destinationAddress: 'B',
        }),
      ).rejects.toBeInstanceOf(HttpException);
    });

    it('notifies only the nearby drivers found for the trip', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'passenger-1',
        phone: '+50412345678',
      });
      fareCalc.estimate.mockResolvedValue({ distanceKm: 10, fare: 100 });
      prisma.wallet.findUnique.mockResolvedValue({ balance: 500 });
      prisma.trip.create = jest
        .fn()
        .mockResolvedValue(decimalTrip({ status: 'pending', driverId: null }));
      driversService.findNearby.mockResolvedValue(['driver-1', 'driver-2']);
      prisma.driver.findMany.mockResolvedValue([
        { userId: 'user-driver-1' },
        { userId: 'user-driver-2' },
      ]);

      await service.createTrip('passenger-1', {
        originLat: 14.1,
        originLng: -87.2,
        originAddress: 'A',
        destinationLat: 14.2,
        destinationLng: -87.3,
        destinationAddress: 'B',
      });

      expect(notifications.pushOnly).toHaveBeenCalledWith(
        ['user-driver-1', 'user-driver-2'],
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ type: 'trip_request' }),
      );
    });

    it('does not push notifications when no drivers are nearby', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'passenger-1',
        phone: '+50412345678',
      });
      fareCalc.estimate.mockResolvedValue({ distanceKm: 10, fare: 100 });
      prisma.wallet.findUnique.mockResolvedValue({ balance: 500 });
      prisma.trip.create = jest
        .fn()
        .mockResolvedValue(decimalTrip({ driverId: null }));
      driversService.findNearby.mockResolvedValue([]);

      await service.createTrip('passenger-1', {
        originLat: 14.1,
        originLng: -87.2,
        originAddress: 'A',
        destinationLat: 14.2,
        destinationLng: -87.3,
        destinationAddress: 'B',
      });

      expect(notifications.pushOnly).not.toHaveBeenCalled();
    });
  });

  describe('acceptTrip', () => {
    it('rejects when the driver was never offered the trip', async () => {
      candidatesCache.isCandidate.mockReturnValue(false);
      await expect(
        service.acceptTrip('trip-1', 'driver-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('rejects with a conflict when another driver already took the trip', async () => {
      candidatesCache.isCandidate.mockReturnValue(true);
      prisma.$executeRaw.mockResolvedValue(0);

      await expect(
        service.acceptTrip('trip-1', 'driver-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('accepts the trip and notifies the passenger', async () => {
      candidatesCache.isCandidate.mockReturnValue(true);
      prisma.$executeRaw.mockResolvedValue(1);
      prisma.trip.findUnique.mockResolvedValue(
        decimalTrip({ status: 'accepted' }),
      );

      const result = await service.acceptTrip('trip-1', 'driver-1');

      expect(candidatesCache.clear).toHaveBeenCalledWith('trip-1');
      expect(notifications.create).toHaveBeenCalledWith(
        'passenger-1',
        'trip_accepted',
        expect.any(String),
        expect.any(String),
        'trip-1',
      );
      expect(result.fare).toBe(100);
    });
  });

  describe('startTrip', () => {
    it('rejects when the trip does not belong to the driver', async () => {
      prisma.trip.findUnique.mockResolvedValue(
        decimalTrip({ driverId: 'other-driver' }),
      );
      await expect(
        service.startTrip('trip-1', 'driver-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects when the trip is not accepted yet', async () => {
      prisma.trip.findUnique.mockResolvedValue(
        decimalTrip({ status: 'pending' }),
      );
      await expect(
        service.startTrip('trip-1', 'driver-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('starts an accepted trip and notifies the passenger', async () => {
      prisma.trip.findUnique.mockResolvedValue(
        decimalTrip({ status: 'accepted' }),
      );
      prisma.trip.update.mockResolvedValue(
        decimalTrip({ status: 'in_progress' }),
      );

      const result = await service.startTrip('trip-1', 'driver-1');

      expect(prisma.trip.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'trip-1' },
          data: expect.objectContaining({ status: 'in_progress' }),
        }),
      );
      expect(notifications.create).toHaveBeenCalled();
      expect(result.status).toBe('in_progress');
    });
  });

  describe('reportNoShow', () => {
    it('rejects when the grace period has not elapsed', async () => {
      prisma.trip.findUnique.mockResolvedValue(
        decimalTrip({ status: 'accepted', arrivedAt: new Date() }),
      );
      await expect(
        service.reportNoShow('trip-1', 'driver-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects when the driver never marked arrival', async () => {
      prisma.trip.findUnique.mockResolvedValue(
        decimalTrip({ status: 'accepted', arrivedAt: null }),
      );
      await expect(
        service.reportNoShow('trip-1', 'driver-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('splits the cancellation fee 80/20 between driver and platform', async () => {
      const arrivedAt = new Date(Date.now() - 10 * 60 * 1000); // 10 min ago > 5 min grace period
      prisma.trip.findUnique.mockResolvedValue(
        decimalTrip({ status: 'accepted', arrivedAt }),
      );
      tx.trip.update.mockResolvedValue(decimalTrip({ status: 'cancelled' }));
      tx.wallet.update
        .mockResolvedValueOnce({ id: 'passenger-wallet' }) // passenger charge
        .mockResolvedValueOnce({ id: 'driver-wallet' }); // driver payout
      tx.wallet.findUniqueOrThrow.mockResolvedValue({ id: 'platform-wallet' });

      await service.reportNoShow('trip-1', 'driver-1');

      expect(tx.wallet.update).toHaveBeenNthCalledWith(1, {
        where: { userId: 'passenger-1' },
        data: { balance: { decrement: 25 } },
      });
      expect(tx.walletTransaction.create).toHaveBeenNthCalledWith(1, {
        data: expect.objectContaining({
          type: 'cancellation_fee',
          amount: -25,
        }),
      });
      expect(tx.wallet.update).toHaveBeenNthCalledWith(2, {
        where: { userId: 'driver-user-1' },
        data: { balance: { increment: 20 } }, // 25 * 0.8
      });
      expect(tx.wallet.update).toHaveBeenNthCalledWith(3, {
        where: { id: 'platform-wallet' },
        data: { balance: { increment: 5 } }, // 25 - 20
      });
    });
  });

  describe('cancelTrip', () => {
    it('throws NotFoundException when the trip does not exist', async () => {
      prisma.trip.findUnique.mockResolvedValue(null);
      await expect(
        service.cancelTrip('missing', 'user-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects when the requester is neither the passenger nor the driver', async () => {
      prisma.trip.findUnique.mockResolvedValue(decimalTrip());
      await expect(
        service.cancelTrip('trip-1', 'stranger'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects cancelling a trip that is already in progress', async () => {
      prisma.trip.findUnique.mockResolvedValue(
        decimalTrip({ status: 'in_progress' }),
      );
      await expect(
        service.cancelTrip('trip-1', 'passenger-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('persists the cancellation reason', async () => {
      prisma.trip.findUnique.mockResolvedValue(
        decimalTrip({ status: 'pending' }),
      );
      tx.trip.update.mockResolvedValue(
        decimalTrip({ status: 'cancelled', cancelReason: 'Changed my mind' }),
      );

      await service.cancelTrip('trip-1', 'passenger-1', 'Changed my mind');

      expect(tx.trip.update).toHaveBeenCalledWith({
        where: { id: 'trip-1' },
        data: { status: 'cancelled', cancelReason: 'Changed my mind' },
      });
    });

    it('does not charge a fee when a pending (not-yet-accepted) trip is cancelled', async () => {
      prisma.trip.findUnique.mockResolvedValue(
        decimalTrip({ status: 'pending' }),
      );
      tx.trip.update.mockResolvedValue(decimalTrip({ status: 'cancelled' }));

      await service.cancelTrip('trip-1', 'passenger-1');

      expect(tx.wallet.update).not.toHaveBeenCalled();
    });

    it('charges the passenger a late-cancellation fee when cancelling an accepted trip', async () => {
      prisma.trip.findUnique.mockResolvedValue(
        decimalTrip({ status: 'accepted' }),
      );
      tx.trip.update.mockResolvedValue(decimalTrip({ status: 'cancelled' }));
      tx.wallet.update
        .mockResolvedValueOnce({ id: 'passenger-wallet' })
        .mockResolvedValueOnce({ id: 'driver-wallet' });
      tx.wallet.findUniqueOrThrow.mockResolvedValue({ id: 'platform-wallet' });

      await service.cancelTrip('trip-1', 'passenger-1');

      expect(tx.wallet.update).toHaveBeenNthCalledWith(1, {
        where: { userId: 'passenger-1' },
        data: { balance: { decrement: 25 } },
      });
    });

    it('does not charge a fee when the driver cancels an accepted trip', async () => {
      prisma.trip.findUnique.mockResolvedValue(
        decimalTrip({ status: 'accepted' }),
      );
      tx.trip.update.mockResolvedValue(decimalTrip({ status: 'cancelled' }));

      await service.cancelTrip('trip-1', 'driver-user-1');

      expect(tx.wallet.update).not.toHaveBeenCalled();
    });
  });

  describe('completeTrip', () => {
    it('throws NotFoundException when the trip does not exist', async () => {
      prisma.trip.findUnique.mockResolvedValue(null);
      await expect(
        service.completeTrip('missing', 'driver-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects when the trip does not belong to the driver', async () => {
      prisma.trip.findUnique.mockResolvedValue(
        decimalTrip({ driverId: 'other' }),
      );
      await expect(
        service.completeTrip('trip-1', 'driver-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects when the trip is not in progress', async () => {
      prisma.trip.findUnique.mockResolvedValue(
        decimalTrip({ status: 'accepted' }),
      );
      await expect(
        service.completeTrip('trip-1', 'driver-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('splits the fare using the 10% platform commission and pays out the rest to the driver', async () => {
      prisma.trip.findUnique.mockResolvedValue(
        decimalTrip({ status: 'in_progress' }),
      );
      tx.trip.update.mockResolvedValue(
        decimalTrip({
          status: 'completed',
          fare: 100,
          driver: { userId: 'driver-user-1' },
        }),
      );
      tx.wallet.update
        .mockResolvedValueOnce({ id: 'passenger-wallet' })
        .mockResolvedValueOnce({ id: 'driver-wallet' });
      tx.wallet.findUniqueOrThrow.mockResolvedValue({ id: 'platform-wallet' });

      const result = await service.completeTrip('trip-1', 'driver-1');

      expect(tx.wallet.update).toHaveBeenNthCalledWith(1, {
        where: { userId: 'passenger-1' },
        data: { balance: { decrement: 100 } },
      });
      expect(tx.wallet.update).toHaveBeenNthCalledWith(2, {
        where: { userId: 'driver-user-1' },
        data: { balance: { increment: 90 } }, // fare - 10% commission
      });
      expect(tx.wallet.update).toHaveBeenNthCalledWith(3, {
        where: { id: 'platform-wallet' },
        data: { balance: { increment: 10 } },
      });
      expect(result.driverEarnings).toBe(90);
      expect(result.platformFee).toBe(10);
      expect(notifications.create).toHaveBeenCalledTimes(2);
    });
  });
});
