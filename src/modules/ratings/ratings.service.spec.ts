import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { RatingsService } from './ratings.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('RatingsService', () => {
  let service: RatingsService;
  let prisma: any;
  let notifications: jest.Mocked<Pick<NotificationsService, 'create'>>;

  beforeEach(() => {
    prisma = {
      trip: { findUnique: jest.fn() },
      rating: {
        findFirst: jest.fn(),
        create: jest.fn(),
        aggregate: jest.fn(),
      },
      driver: { findUnique: jest.fn(), update: jest.fn() },
    };
    notifications = { create: jest.fn() };

    service = new RatingsService(
      prisma,
      notifications as unknown as NotificationsService,
    );
  });

  const dto = {
    tripId: 'trip-1',
    ratedId: 'driver-user-1',
    score: 5,
    comment: 'Great',
  };

  it('rejects when the trip does not exist', async () => {
    prisma.trip.findUnique.mockResolvedValue(null);
    await expect(
      service.createRating('passenger-1', dto as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects rating a trip that is not completed', async () => {
    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-1',
      status: 'in_progress',
      passengerId: 'passenger-1',
      driver: { userId: 'driver-user-1' },
    });
    await expect(
      service.createRating('passenger-1', dto as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a rater who was not part of the trip', async () => {
    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-1',
      status: 'completed',
      passengerId: 'passenger-1',
      driver: { userId: 'driver-user-1' },
    });
    await expect(
      service.createRating('stranger', dto as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects when ratedId is not the other participant of the trip', async () => {
    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-1',
      status: 'completed',
      passengerId: 'passenger-1',
      driver: { userId: 'driver-user-1' },
    });
    await expect(
      service.createRating('passenger-1', {
        ...dto,
        ratedId: 'someone-else',
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a second rating for the same trip by the same rater', async () => {
    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-1',
      status: 'completed',
      passengerId: 'passenger-1',
      driver: { userId: 'driver-user-1' },
    });
    prisma.rating.findFirst.mockResolvedValue({ id: 'existing-rating' });
    await expect(
      service.createRating('passenger-1', dto as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('recomputes the driver average rating when the rated user is a driver', async () => {
    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-1',
      status: 'completed',
      passengerId: 'passenger-1',
      driver: { userId: 'driver-user-1' },
    });
    prisma.rating.findFirst.mockResolvedValue(null);
    prisma.rating.create.mockResolvedValue({ id: 'rating-1' });
    prisma.driver.findUnique.mockResolvedValue({ id: 'driver-1' });
    prisma.rating.aggregate.mockResolvedValue({ _avg: { score: 4.5 } });

    await service.createRating('passenger-1', dto);

    expect(prisma.driver.update).toHaveBeenCalledWith({
      where: { id: 'driver-1' },
      data: { averageRating: 4.5 },
    });
    expect(notifications.create).toHaveBeenCalledWith(
      'driver-user-1',
      'rating_received',
      expect.any(String),
      expect.any(String),
      'trip-1',
    );
  });

  it('does not touch driver.averageRating when the rated user is a passenger', async () => {
    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-1',
      status: 'completed',
      passengerId: 'passenger-1',
      driver: { userId: 'driver-user-1' },
    });
    prisma.rating.findFirst.mockResolvedValue(null);
    prisma.rating.create.mockResolvedValue({ id: 'rating-1' });
    prisma.driver.findUnique.mockResolvedValue(null); // ratedId is not a driver

    await service.createRating('driver-user-1', {
      tripId: 'trip-1',
      ratedId: 'passenger-1',
      score: 5,
    });

    expect(prisma.driver.update).not.toHaveBeenCalled();
  });
});
