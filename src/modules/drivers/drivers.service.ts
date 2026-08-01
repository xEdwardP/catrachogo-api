import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TripCandidatesCache } from '../matching/trip-candidates.cache';
import { NotificationsService } from '../notifications/notifications.service';
import { CompleteProfileDto } from './dto/complete-profile.dto';
import {
  Prisma,
  VerificationStatus,
} from '../../../generated/prisma/client';
import { paginationParams } from '../../common/utils/pagination.util';

@Injectable()
export class DriversService {
  constructor(
    private prisma: PrismaService,
    private candidatesCache: TripCandidatesCache,
    private notifications: NotificationsService,
  ) {}

  async getDriverIdByUserId(userId: string): Promise<string> {
    const driver = await this.prisma.driver.findUnique({ where: { userId } });
    if (!driver)
      throw new ForbiddenException('User is not a registered driver');
    return driver.id;
  }

  async completeProfile(userId: string, dto: CompleteProfileDto) {
    const existing = await this.prisma.driver.findUnique({ where: { userId } });
    if (existing)
      throw new ConflictException('Driver profile already completed');

    const driver = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { profilePhotoUrl: dto.profilePhotoUrl },
      });

      return tx.driver.create({
        data: {
          userId,
          vehicleType: dto.vehicleType,
          licenseNumber: dto.licenseNumber,
          idFrontUrl: dto.idFrontUrl,
          idBackUrl: dto.idBackUrl,
          vehicleRegistrationUrl: dto.vehicleRegistrationUrl,
          selfieWithIdUrl: dto.selfieWithIdUrl,
          vehicles: { create: dto.vehicle },
        },
      });
    });

    await this.notifications.pushToAdmins(
      'Nuevo conductor pendiente',
      'Un conductor completó su perfil y espera aprobación de documentos.',
      { type: 'driver_pending_approval', driverId: driver.id },
    );

    return driver;
  }

  async updateAvailability(driverId: string, available: boolean) {
    if (available) {
      const driver = await this.prisma.driver.findUnique({
        where: { id: driverId },
      });
      if (driver?.verificationStatus !== 'approved') {
        throw new ForbiddenException(
          'Your documents must be approved before going online',
        );
      }
    }
    return this.prisma.driver.update({
      where: { id: driverId },
      data: { available },
    });
  }

  async findNearby(
    lat: number,
    lng: number,
    radiusKm = 5,
    limit = 5,
  ): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ driver_id: string }[]>`
      SELECT DISTINCT ON (d.id) d.id AS driver_id
      FROM drivers d
      JOIN location_tracking lt ON lt.driver_id = d.id
      WHERE d.available = true
        AND ST_DWithin(
          ST_SetSRID(ST_MakePoint(lt.lng, lt.lat), 4326)::geography,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          ${radiusKm * 1000}
        )
      ORDER BY d.id, lt.recorded_at DESC
      LIMIT ${limit}
    `;
    return rows.map((r) => r.driver_id);
  }

  async getPendingRequest(driverId: string) {
    const tripId = this.candidatesCache.getPendingFor(driverId);
    if (!tripId) return null;

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { passenger: true },
    });
    if (!trip || trip.status !== 'pending') return null;

    return {
      id: trip.id,
      passengerName: trip.passenger.name,
      originAddress: trip.originAddress,
      distanceKm: Number(trip.distanceKm),
      fare: Number(trip.fare),
    };
  }

  async getSummary(driverId: string) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [aggregate, driver] = await Promise.all([
      this.prisma.trip.aggregate({
        where: {
          driverId,
          status: 'completed',
          completedAt: { gte: startOfDay },
        },
        _sum: { fare: true },
        _count: true,
      }),
      this.prisma.driver.findUnique({ where: { id: driverId } }),
    ]);

    return {
      earningsToday: Number(aggregate._sum.fare ?? 0),
      tripsToday: aggregate._count,
      averageRating: Number(driver?.averageRating ?? 0),
      available: driver?.available ?? false,
    };
  }

  async getPublicProfile(driverId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      include: { user: true, vehicles: true },
    });
    if (!driver) throw new NotFoundException();

    return {
      id: driver.id,
      userId: driver.userId,
      name: driver.user.name,
      profilePhotoUrl: driver.user.profilePhotoUrl,
      averageRating: Number(driver.averageRating ?? 0),
      vehicle: driver.vehicles[0] ?? null,
    };
  }

  async getByIdForAdmin(driverId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      include: { user: { omit: { passwordHash: true } }, vehicles: true },
    });
    if (!driver) throw new NotFoundException('Driver not found');

    return { ...driver, averageRating: Number(driver.averageRating ?? 0) };
  }

  async listByStatus(
    status?: string,
    page = 1,
    limit = 20,
    search?: string,
  ) {
    if (
      status &&
      !Object.values(VerificationStatus).includes(status as VerificationStatus)
    ) {
      throw new BadRequestException(
        `Invalid status. Must be one of: ${Object.values(VerificationStatus).join(', ')}`,
      );
    }

    const { take, skip } = paginationParams(page, limit);
    const where: Prisma.DriverWhereInput = {
      ...(status ? { verificationStatus: status as VerificationStatus } : {}),
      ...(search
        ? {
            OR: [
              { user: { name: { contains: search, mode: 'insensitive' } } },
              {
                vehicles: {
                  some: { plate: { contains: search, mode: 'insensitive' } },
                },
              },
            ],
          }
        : {}),
    };

    const [drivers, total] = await Promise.all([
      this.prisma.driver.findMany({
        where,
        include: { user: { omit: { passwordHash: true } }, vehicles: true },
        orderBy: { userId: 'asc' },
        take,
        skip,
      }),
      this.prisma.driver.count({ where }),
    ]);

    return {
      data: drivers.map((d) => ({
        ...d,
        averageRating: Number(d.averageRating ?? 0),
      })),
      total,
      page,
      limit,
    };
  }

  async updateVerification(driverId: string, status: 'approved' | 'rejected') {
    const existing = await this.prisma.driver.findUnique({
      where: { id: driverId },
    });
    if (!existing) throw new NotFoundException('Driver not found');

    const driver = await this.prisma.driver.update({
      where: { id: driverId },
      data: {
        verificationStatus: status,
        approvedAt: status === 'approved' ? new Date() : null,
      },
    });

    await this.notifications.create(
      driver.userId,
      'driver_verification_updated',
      status === 'approved' ? 'Documentos aprobados' : 'Documentos rechazados',
      status === 'approved'
        ? 'Tus documentos fueron aprobados. Ya puedes conectarte para recibir viajes.'
        : 'Tus documentos fueron rechazados. Revisa tu perfil y vuelve a intentarlo.',
    );

    return driver;
  }
}
