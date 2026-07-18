import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FareZoneDto } from './dto/fare-zone.dto';

@Injectable()
export class FareZonesService {
  constructor(private prisma: PrismaService) {}

  async list() {
    const zones = await this.prisma.fareZone.findMany();
    return zones.map((z) => ({
      ...z,
      baseFare: Number(z.baseFare),
      farePerKm: Number(z.farePerKm),
      centerLat: Number(z.centerLat),
      centerLng: Number(z.centerLng),
    }));
  }

  create(dto: FareZoneDto) {
    return this.prisma.fareZone.create({ data: dto });
  }

  async update(id: string, dto: Partial<FareZoneDto>) {
    const existing = await this.prisma.fareZone.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Fare zone not found');
    return this.prisma.fareZone.update({ where: { id }, data: dto });
  }
}
