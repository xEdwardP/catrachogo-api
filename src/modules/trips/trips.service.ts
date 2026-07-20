import {
  Injectable,
  HttpException,
  HttpStatus,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FareCalculationService } from './fare-calculation.service';
import { TripCandidatesCache } from '../matching/trip-candidates.cache';
import { DriversService } from '../drivers/drivers.service';
import { TrackingService } from '../tracking/tracking.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { paginationParams } from '../../common/utils/pagination.util';

@Injectable()
export class TripsService {
  constructor(
    private prisma: PrismaService,
    private fareCalc: FareCalculationService,
    private driversService: DriversService,
    private candidatesCache: TripCandidatesCache,
    private tracking: TrackingService,
  ) {}

  private toTripNumbers<
    T extends {
      fare: Prisma.Decimal;
      distanceKm: Prisma.Decimal;
      originLat: Prisma.Decimal;
      originLng: Prisma.Decimal;
      destinationLat: Prisma.Decimal;
      destinationLng: Prisma.Decimal;
    },
  >(trip: T) {
    return {
      ...trip,
      fare: Number(trip.fare),
      distanceKm: Number(trip.distanceKm),
      originLat: Number(trip.originLat),
      originLng: Number(trip.originLng),
      destinationLat: Number(trip.destinationLat),
      destinationLng: Number(trip.destinationLng),
    };
  }

  async createTrip(passengerId: string, dto: CreateTripDto) {
    const passenger = await this.prisma.user.findUnique({
      where: { id: passengerId },
    });
    if (!passenger?.phone) {
      throw new BadRequestException(
        'Please add a phone number before requesting a trip',
      );
    }

    const { distanceKm, fare } = await this.fareCalc.estimate(
      dto.originLat,
      dto.originLng,
      dto.destinationLat,
      dto.destinationLng,
    );

    const wallet = await this.prisma.wallet.findUnique({
      where: { userId: passengerId },
    });
    if (!wallet || Number(wallet.balance) < fare) {
      throw new HttpException(
        'Insufficient balance, please top up your wallet',
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    const trip = await this.prisma.trip.create({
      data: {
        passengerId,
        originLat: dto.originLat,
        originLng: dto.originLng,
        originAddress: dto.originAddress,
        destinationLat: dto.destinationLat,
        destinationLng: dto.destinationLng,
        destinationAddress: dto.destinationAddress,
        distanceKm,
        fare,
        status: 'pending',
      },
    });

    const nearbyDriverIds = await this.driversService.findNearby(
      dto.originLat,
      dto.originLng,
    );
    this.candidatesCache.set(trip.id, nearbyDriverIds);

    return this.toTripNumbers(trip);
  }

  async acceptTrip(tripId: string, driverId: string) {
    if (!this.candidatesCache.isCandidate(tripId, driverId)) {
      throw new ForbiddenException('This trip was not offered to you');
    }

    const result = await this.prisma.$executeRaw`
      UPDATE trips
      SET driver_id = ${driverId}, status = 'accepted'
      WHERE id = ${tripId}::uuid AND status = 'pending' AND driver_id IS NULL
    `;
    if (result === 0) {
      throw new ConflictException('Trip already taken by another driver');
    }

    this.candidatesCache.clear(tripId);
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    return this.toTripNumbers(trip!);
  }

  async rejectTrip(tripId: string, driverId: string) {
    this.candidatesCache.removeDriver(tripId, driverId);
    return { rejected: true };
  }

  async startTrip(tripId: string, driverId: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip || trip.driverId !== driverId)
      throw new ForbiddenException('Not your trip');
    if (trip.status !== 'accepted')
      throw new BadRequestException('Trip must be accepted first');

    const updated = await this.prisma.trip.update({
      where: { id: tripId },
      data: { status: 'in_progress', startedAt: new Date() },
    });
    return this.toTripNumbers(updated);
  }

  async cancelTrip(tripId: string, requesterId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { driver: true },
    });
    if (!trip) throw new NotFoundException();

    const isPassenger = trip.passengerId === requesterId;
    const isDriver = trip.driver?.userId === requesterId;
    if (!isPassenger && !isDriver)
      throw new ForbiddenException('Not your trip');
    if (!['pending', 'accepted'].includes(trip.status)) {
      throw new BadRequestException(
        'Trip can only be cancelled while pending or accepted',
      );
    }

    this.candidatesCache.clear(tripId);
    const updated = await this.prisma.trip.update({
      where: { id: tripId },
      data: { status: 'cancelled' },
    });
    return this.toTripNumbers(updated);
  }

  async getTripDetail(
    tripId: string,
    requesterId: string,
    requesterRole: string,
  ) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        passenger: true,
        driver: { include: { user: true, vehicles: true } },
      },
    });
    if (!trip) throw new NotFoundException();

    const isParticipant =
      trip.passengerId === requesterId || trip.driver?.userId === requesterId;
    if (!isParticipant && requesterRole !== 'admin') {
      throw new ForbiddenException('You are not part of this trip');
    }

    const includePhones =
      isParticipant && ['accepted', 'in_progress'].includes(trip.status);

    const ratedByMe = isParticipant
      ? (await this.prisma.rating.findFirst({
          where: { tripId: trip.id, raterId: requesterId },
          select: { id: true },
        })) !== null
      : false;

    return {
      id: trip.id,
      status: trip.status,
      fare: Number(trip.fare),
      distanceKm: Number(trip.distanceKm),
      originAddress: trip.originAddress,
      originLat: Number(trip.originLat),
      originLng: Number(trip.originLng),
      destinationAddress: trip.destinationAddress,
      destinationLat: Number(trip.destinationLat),
      destinationLng: Number(trip.destinationLng),
      driverId: trip.driverId,
      ratedByMe,
      ...(includePhones && trip.driver
        ? {
            driverPhone: trip.driver.user.phone,
            driver: {
              id: trip.driver.id,
              userId: trip.driver.userId,
              name: trip.driver.user.name,
              profilePhotoUrl: trip.driver.user.profilePhotoUrl,
              averageRating: Number(trip.driver.averageRating ?? 0),
              vehicle: trip.driver.vehicles[0] ?? null,
            },
          }
        : {}),
      ...(includePhones ? { passengerPhone: trip.passenger.phone } : {}),
    };
  }

  async getDriverLocationForTrip(tripId: string) {
    return this.tracking.getLastLocationForTrip(tripId);
  }

  async completeTrip(tripId: string, driverId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { driver: true },
    });
    if (!trip) throw new NotFoundException();
    if (trip.driverId !== driverId)
      throw new ForbiddenException('Not your trip');
    if (trip.status !== 'in_progress')
      throw new BadRequestException('Trip must be in progress to complete');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.trip.update({
        where: { id: tripId },
        data: { status: 'completed', completedAt: new Date() },
        include: { driver: true },
      });

      const passengerWallet = await tx.wallet.update({
        where: { userId: updated.passengerId },
        data: { balance: { decrement: updated.fare } },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: passengerWallet.id,
          type: 'trip_charge',
          amount: -updated.fare,
          tripReferenceId: updated.id,
        },
      });

      const driverWallet = await tx.wallet.update({
        where: { userId: updated.driver!.userId },
        data: { balance: { increment: updated.fare } },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: driverWallet.id,
          type: 'trip_payout',
          amount: updated.fare,
          tripReferenceId: updated.id,
        },
      });

      return updated;
    });
  }

  async getHistory(userId: string, role: string, page = 1, limit = 20) {
    const { take, skip } = paginationParams(page, limit);
    const where =
      role === 'driver' ? { driver: { userId } } : { passengerId: userId };

    const [trips, total] = await Promise.all([
      this.prisma.trip.findMany({
        where,
        orderBy: { requestedAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.trip.count({ where }),
    ]);

    const ratings = await this.prisma.rating.findMany({
      where: { raterId: userId, tripId: { in: trips.map((t) => t.id) } },
      select: { tripId: true },
    });
    const ratedTripIds = new Set(ratings.map((r) => r.tripId));

    return {
      data: trips.map((t) => ({
        ...this.toTripNumbers(t),
        ratedByMe: ratedTripIds.has(t.id),
      })),
      total,
      page,
      limit,
    };
  }

  async listAll(status: string | undefined, page = 1, limit = 20) {
    const { take, skip } = paginationParams(page, limit);
    const where = status ? { status: status as any } : {};

    const [trips, total] = await Promise.all([
      this.prisma.trip.findMany({
        where,
        orderBy: { requestedAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.trip.count({ where }),
    ]);

    return {
      data: trips.map((t) => this.toTripNumbers(t)),
      total,
      page,
      limit,
    };
  }
}
