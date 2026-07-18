import {
  Injectable,
  HttpException,
  HttpStatus,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FareCalculationService } from './fare-calculation.service';
import { TripCandidatesCache } from '../matching/trip-candidates.cache';
import { DriversService } from '../drivers/drivers.service';
import { TrackingService } from '../tracking/tracking.service';
import { CreateTripDto } from './dto/create-trip.dto';

@Injectable()
export class TripsService {
  constructor(
    private prisma: PrismaService,
    private fareCalc: FareCalculationService,
    private driversService: DriversService,
    private candidatesCache: TripCandidatesCache,
    private tracking: TrackingService,
  ) {}

  async createTrip(passengerId: string, dto: CreateTripDto) {
    const { distanceKm, fare } = await this.fareCalc.estimate(
      dto.originLat, dto.originLng, dto.destinationLat, dto.destinationLng,
    );

    const wallet = await this.prisma.wallet.findUnique({ where: { userId: passengerId } });
    if (!wallet || Number(wallet.balance) < fare) {
      throw new HttpException('Insufficient balance, please top up your wallet', HttpStatus.PAYMENT_REQUIRED);
    }

    const trip = await this.prisma.trip.create({
      data: {
        passengerId,
        originLat: dto.originLat, originLng: dto.originLng, originAddress: dto.originAddress,
        destinationLat: dto.destinationLat, destinationLng: dto.destinationLng, destinationAddress: dto.destinationAddress,
        distanceKm, fare, status: 'pending',
      },
    });

    // Matching: se buscan candidatos cercanos y se guardan en caché — esto es lo que
    // la primera versión del sprint explicaba en texto (Paso original "Matching simplificado")
    // pero nunca conectaba con createTrip.
    const nearbyDriverIds = await this.driversService.findNearby(dto.originLat, dto.originLng);
    this.candidatesCache.set(trip.id, nearbyDriverIds);

    return trip;
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

    this.candidatesCache.clear(tripId); // ya se resolvió, nadie más debe verlo como pendiente
    return this.prisma.trip.findUnique({ where: { id: tripId } });
  }

  async rejectTrip(tripId: string, driverId: string) {
    this.candidatesCache.removeDriver(tripId, driverId);
    return { rejected: true };
  }

  async startTrip(tripId: string, driverId: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip || trip.driverId !== driverId) throw new ForbiddenException('Not your trip');
    if (trip.status !== 'accepted') throw new BadRequestException('Trip must be accepted first');

    return this.prisma.trip.update({
      where: { id: tripId },
      data: { status: 'in_progress', startedAt: new Date() },
    });
  }

  async cancelTrip(tripId: string, requesterId: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId }, include: { driver: true } });
    if (!trip) throw new NotFoundException();

    const isPassenger = trip.passengerId === requesterId;
    const isDriver = trip.driver?.userId === requesterId;
    if (!isPassenger && !isDriver) throw new ForbiddenException('Not your trip');
    if (!['pending', 'accepted'].includes(trip.status)) {
      throw new BadRequestException('Trip can only be cancelled while pending or accepted');
    }

    this.candidatesCache.clear(tripId);
    return this.prisma.trip.update({ where: { id: tripId }, data: { status: 'cancelled' } });
  }

  async getTripDetail(tripId: string, requesterId: string, requesterRole: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { passenger: true, driver: { include: { user: true } } },
    });
    if (!trip) throw new NotFoundException();

    const isParticipant = trip.passengerId === requesterId || trip.driver?.userId === requesterId;
    if (!isParticipant && requesterRole !== 'admin') {
      throw new ForbiddenException('You are not part of this trip');
    }

    const includePhones = isParticipant && ['accepted', 'in_progress'].includes(trip.status);

    return {
      id: trip.id,
      status: trip.status,
      fare: Number(trip.fare),
      distanceKm: Number(trip.distanceKm),
      ...(includePhones && trip.driver ? { driverPhone: trip.driver.user.phone } : {}),
      ...(includePhones ? { passengerPhone: trip.passenger.phone } : {}),
    };
  }

  async getDriverLocationForTrip(tripId: string) {
    return this.tracking.getLastLocationForTrip(tripId);
  }
}