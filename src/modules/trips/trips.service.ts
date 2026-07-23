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
import { NotificationsService } from '../notifications/notifications.service';
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
    private notifications: NotificationsService,
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

  private readonly PLATFORM_COMMISSION_RATE = Number(
    process.env.PLATFORM_COMMISSION_RATE ?? 0.1,
  );

  private readonly CANCELLATION_FEE_AMOUNT = Number(
    process.env.CANCELLATION_FEE_AMOUNT ?? 25,
  );
  private readonly CANCELLATION_FEE_DRIVER_SHARE = Number(
    process.env.CANCELLATION_FEE_DRIVER_SHARE ?? 0.8,
  );

  private async getCommissionBreakdownsByTripIds(tripIds: string[]) {
    const map = new Map<
      string,
      { driverEarnings?: number; platformFee?: number }
    >();
    if (tripIds.length === 0) return map;

    const txns = await this.prisma.walletTransaction.findMany({
      where: {
        tripReferenceId: { in: tripIds },
        type: { in: ['trip_payout', 'platform_commission'] },
      },
      select: { tripReferenceId: true, type: true, amount: true },
    });
    for (const txn of txns) {
      const entry = map.get(txn.tripReferenceId!) ?? {};
      if (txn.type === 'trip_payout') entry.driverEarnings = Number(txn.amount);
      if (txn.type === 'platform_commission')
        entry.platformFee = Number(txn.amount);
      map.set(txn.tripReferenceId!, entry);
    }
    return map;
  }

  private async getCommissionBreakdown(tripId: string) {
    const map = await this.getCommissionBreakdownsByTripIds([tripId]);
    return map.get(tripId) ?? {};
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
      WHERE id = ${tripId} AND status = 'pending' AND driver_id IS NULL
    `;
    if (result === 0) {
      throw new ConflictException('Trip already taken by another driver');
    }

    this.candidatesCache.clear(tripId);
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });

    await this.notifications.create(
      trip!.passengerId,
      'trip_accepted',
      'Tu viaje fue aceptado',
      `Un conductor va en camino a ${trip!.originAddress}.`,
      trip!.id,
    );

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

    await this.notifications.create(
      updated.passengerId,
      'trip_started',
      'Tu viaje ha comenzado',
      `Tu viaje hacia ${updated.destinationAddress} está en curso.`,
      updated.id,
    );

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

    const chargeFee = isPassenger && trip.status === 'accepted';

    this.candidatesCache.clear(tripId);

    const { driverShare, ...result } = await this.prisma.$transaction(
      async (tx) => {
        const updated = await tx.trip.update({
          where: { id: tripId },
          data: { status: 'cancelled' },
        });

        if (!chargeFee) {
          return {
            ...updated,
            cancellationFee: null as number | null,
            driverShare: null as number | null,
          };
        }

        const fee = this.CANCELLATION_FEE_AMOUNT;
        const driverShare = Number(
          (fee * this.CANCELLATION_FEE_DRIVER_SHARE).toFixed(2),
        );
        const platformShare = Number((fee - driverShare).toFixed(2));

        const passengerWallet = await tx.wallet.update({
          where: { userId: trip.passengerId },
          data: { balance: { decrement: fee } },
        });
        await tx.walletTransaction.create({
          data: {
            walletId: passengerWallet.id,
            type: 'cancellation_fee',
            amount: -fee,
            tripReferenceId: updated.id,
          },
        });

        const driverWallet = await tx.wallet.update({
          where: { userId: trip.driver!.userId },
          data: { balance: { increment: driverShare } },
        });
        await tx.walletTransaction.create({
          data: {
            walletId: driverWallet.id,
            type: 'cancellation_payout',
            amount: driverShare,
            tripReferenceId: updated.id,
          },
        });

        const platformWallet = await tx.wallet.findUniqueOrThrow({
          where: { userId: process.env.PLATFORM_USER_ID },
        });
        await tx.wallet.update({
          where: { id: platformWallet.id },
          data: { balance: { increment: platformShare } },
        });
        await tx.walletTransaction.create({
          data: {
            walletId: platformWallet.id,
            type: 'platform_commission',
            amount: platformShare,
            tripReferenceId: updated.id,
          },
        });

        return { ...updated, cancellationFee: fee, driverShare };
      },
    );

    const recipientUserId = isPassenger
      ? trip.driver?.userId
      : trip.passengerId;
    if (recipientUserId) {
      await this.notifications.create(
        recipientUserId,
        'trip_cancelled',
        'Viaje cancelado',
        chargeFee && driverShare !== null
          ? `El viaje hacia ${trip.destinationAddress} fue cancelado. Recibiste L.${driverShare.toFixed(2)} por la cancelación tardía.`
          : `El viaje hacia ${trip.destinationAddress} fue cancelado.`,
        trip.id,
      );
    }

    return this.toTripNumbers(result);
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

    const commissionBreakdown =
      trip.status === 'completed'
        ? await this.getCommissionBreakdown(trip.id)
        : {};

    return {
      id: trip.id,
      status: trip.status,
      fare: Number(trip.fare),
      distanceKm: Number(trip.distanceKm),
      ...commissionBreakdown,
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
      ...(includePhones
        ? {
            passengerPhone: trip.passenger.phone,
            passenger: {
              name: trip.passenger.name,
              profilePhotoUrl: trip.passenger.profilePhotoUrl,
            },
          }
        : {}),
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

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.trip.update({
        where: { id: tripId },
        data: { status: 'completed', completedAt: new Date() },
        include: { driver: true },
      });

      const fare = Number(updated.fare);
      const platformFee = Number(
        (fare * this.PLATFORM_COMMISSION_RATE).toFixed(2),
      );
      const driverEarnings = Number((fare - platformFee).toFixed(2));

      const passengerWallet = await tx.wallet.update({
        where: { userId: updated.passengerId },
        data: { balance: { decrement: fare } },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: passengerWallet.id,
          type: 'trip_charge',
          amount: -fare,
          tripReferenceId: updated.id,
        },
      });

      const driverWallet = await tx.wallet.update({
        where: { userId: updated.driver!.userId },
        data: { balance: { increment: driverEarnings } },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: driverWallet.id,
          type: 'trip_payout',
          amount: driverEarnings,
          tripReferenceId: updated.id,
        },
      });

      const platformWallet = await tx.wallet.findUniqueOrThrow({
        where: { userId: process.env.PLATFORM_USER_ID },
      });
      await tx.wallet.update({
        where: { id: platformWallet.id },
        data: { balance: { increment: platformFee } },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: platformWallet.id,
          type: 'platform_commission',
          amount: platformFee,
          tripReferenceId: updated.id,
        },
      });

      return { ...updated, fare, driverEarnings, platformFee };
    });

    await this.notifications.create(
      result.passengerId,
      'trip_completed',
      'Viaje completado',
      `Tu viaje ha finalizado. Se cobraron L.${result.fare.toFixed(2)} de tu wallet.`,
      result.id,
    );
    await this.notifications.create(
      result.driver!.userId,
      'trip_completed',
      'Viaje completado',
      `Recibiste L.${result.driverEarnings.toFixed(2)} (Comisión CatrachoGo 10%: L.${result.platformFee.toFixed(2)}).`,
      result.id,
    );

    return result;
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

    const commissionBreakdowns = await this.getCommissionBreakdownsByTripIds(
      trips.filter((t) => t.status === 'completed').map((t) => t.id),
    );

    return {
      data: trips.map((t) => ({
        ...this.toTripNumbers(t),
        ratedByMe: ratedTripIds.has(t.id),
        ...(commissionBreakdowns.get(t.id) ?? {}),
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
