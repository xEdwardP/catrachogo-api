import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DriversService } from './drivers.service';
import { TripCandidatesCache } from '../matching/trip-candidates.cache';
import { NotificationsService } from '../notifications/notifications.service';

describe('DriversService', () => {
  let service: DriversService;
  let prisma: any;
  let tx: any;
  let candidatesCache: jest.Mocked<Pick<TripCandidatesCache, 'getPendingFor'>>;
  let notifications: jest.Mocked<
    Pick<NotificationsService, 'create' | 'pushToAdmins'>
  >;

  beforeEach(() => {
    tx = {
      user: { update: jest.fn() },
      driver: { create: jest.fn() },
    };
    prisma = {
      driver: { findUnique: jest.fn(), update: jest.fn() },
      $transaction: jest.fn((cb: any) => cb(tx)),
      $queryRaw: jest.fn(),
    };
    candidatesCache = { getPendingFor: jest.fn() };
    notifications = { create: jest.fn(), pushToAdmins: jest.fn() };

    service = new DriversService(
      prisma,
      candidatesCache as unknown as TripCandidatesCache,
      notifications as unknown as NotificationsService,
    );
  });

  describe('updateVerification', () => {
    it('throws NotFoundException when the driver does not exist', async () => {
      prisma.driver.findUnique.mockResolvedValue(null);

      await expect(
        service.updateVerification('missing', 'approved'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.driver.update).not.toHaveBeenCalled();
    });

    it('approves a driver and sets approvedAt', async () => {
      prisma.driver.findUnique.mockResolvedValue({
        id: 'driver-1',
        userId: 'user-1',
      });
      prisma.driver.update.mockResolvedValue({
        id: 'driver-1',
        userId: 'user-1',
      });

      await service.updateVerification('driver-1', 'approved');

      expect(prisma.driver.update).toHaveBeenCalledWith({
        where: { id: 'driver-1' },
        data: { verificationStatus: 'approved', approvedAt: expect.any(Date) },
      });
      expect(notifications.create).toHaveBeenCalledWith(
        'user-1',
        'driver_verification_updated',
        expect.any(String),
        expect.any(String),
      );
    });

    it('rejects a driver and clears approvedAt', async () => {
      prisma.driver.findUnique.mockResolvedValue({
        id: 'driver-1',
        userId: 'user-1',
      });
      prisma.driver.update.mockResolvedValue({
        id: 'driver-1',
        userId: 'user-1',
      });

      await service.updateVerification('driver-1', 'rejected');

      expect(prisma.driver.update).toHaveBeenCalledWith({
        where: { id: 'driver-1' },
        data: { verificationStatus: 'rejected', approvedAt: null },
      });
    });
  });

  describe('updateAvailability', () => {
    it('rejects going online when documents are not approved', async () => {
      prisma.driver.findUnique.mockResolvedValue({
        id: 'driver-1',
        verificationStatus: 'pending',
      });

      await expect(
        service.updateAvailability('driver-1', true),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.driver.update).not.toHaveBeenCalled();
    });

    it('allows going online once approved', async () => {
      prisma.driver.findUnique.mockResolvedValue({
        id: 'driver-1',
        verificationStatus: 'approved',
      });
      prisma.driver.update.mockResolvedValue({
        id: 'driver-1',
        available: true,
      });

      await service.updateAvailability('driver-1', true);

      expect(prisma.driver.update).toHaveBeenCalledWith({
        where: { id: 'driver-1' },
        data: { available: true },
      });
    });

    it('always allows going offline regardless of verification status', async () => {
      prisma.driver.update.mockResolvedValue({
        id: 'driver-1',
        available: false,
      });

      await service.updateAvailability('driver-1', false);

      expect(prisma.driver.findUnique).not.toHaveBeenCalled();
      expect(prisma.driver.update).toHaveBeenCalledWith({
        where: { id: 'driver-1' },
        data: { available: false },
      });
    });
  });

  describe('completeProfile', () => {
    it('rejects when the driver profile already exists', async () => {
      prisma.driver.findUnique.mockResolvedValue({ id: 'driver-1' });

      await expect(
        service.completeProfile('user-1', {
          vehicleType: 'sedan',
          licenseNumber: 'ABC123',
          idFrontUrl: 'front.jpg',
          idBackUrl: 'back.jpg',
          vehicleRegistrationUrl: 'reg.jpg',
          selfieWithIdUrl: 'selfie.jpg',
          vehicle: { plate: 'HAB1234', model: 'Corolla', color: 'Red' },
        } as any),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('notifies admins once the profile is created', async () => {
      prisma.driver.findUnique.mockResolvedValue(null);
      tx.driver.create.mockResolvedValue({ id: 'driver-1', userId: 'user-1' });

      await service.completeProfile('user-1', {
        profilePhotoUrl: 'photo.jpg',
        vehicleType: 'sedan',
        licenseNumber: 'ABC123',
        idFrontUrl: 'front.jpg',
        idBackUrl: 'back.jpg',
        vehicleRegistrationUrl: 'reg.jpg',
        selfieWithIdUrl: 'selfie.jpg',
        vehicle: { plate: 'HAB1234', model: 'Corolla', color: 'Red' },
      } as any);

      expect(notifications.pushToAdmins).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          type: 'driver_pending_approval',
          driverId: 'driver-1',
        }),
      );
    });
  });

  describe('findNearby', () => {
    it('orders candidates by real distance, not by driver UUID', async () => {
      prisma.$queryRaw.mockResolvedValue([
        { driver_id: 'driver-close' },
        { driver_id: 'driver-far' },
      ]);

      const result = await service.findNearby(14.1, -87.2, 5, 5);

      expect(result).toEqual(['driver-close', 'driver-far']);
      const [query] = prisma.$queryRaw.mock.calls[0];
      const sql = query.join('');
      expect(sql).toContain('ST_Distance');
      expect(sql).toContain('ORDER BY distance_m ASC');
    });
  });

  describe('listByStatus', () => {
    it('rejects an invalid status filter', async () => {
      await expect(service.listByStatus('not-a-status')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
