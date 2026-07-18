import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TrackingService {
  constructor(private prisma: PrismaService) {}

  async recordLocation(driverId: string, lat: number, lng: number, tripId?: string) {
    return this.prisma.locationTracking.create({ data: { driverId, lat, lng, tripId } });
  }

  async getLastLocationForTrip(tripId: string) {
    return this.prisma.locationTracking.findFirst({
      where: { tripId },
      orderBy: { recordedAt: 'desc' },
    });
  }
}