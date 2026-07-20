import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TrackingService {
  constructor(private prisma: PrismaService) {}

  async recordLocation(driverId: string, lat: number, lng: number, tripId?: string) {
    await this.prisma.locationTracking.create({ data: { driverId, lat, lng, tripId } });
    return { recorded: true };
  }

  async getLastLocationForTrip(tripId: string) {
    const location = await this.prisma.locationTracking.findFirst({
      where: { tripId },
      orderBy: { recordedAt: 'desc' },
    });
    if (!location) return null;
    return {
      lat: Number(location.lat),
      lng: Number(location.lng),
      recordedAt: location.recordedAt,
    };
  }
}