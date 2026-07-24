import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSavedAddressDto } from './dto/create-saved-address.dto';

@Injectable()
export class SavedAddressesService {
  constructor(private prisma: PrismaService) {}

  private toNumbers<T extends { lat: Prisma.Decimal; lng: Prisma.Decimal }>(
    row: T,
  ) {
    return { ...row, lat: Number(row.lat), lng: Number(row.lng) };
  }

  async list(userId: string) {
    const rows = await this.prisma.savedAddress.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => this.toNumbers(row));
  }

  async create(userId: string, dto: CreateSavedAddressDto) {
    const row = await this.prisma.savedAddress.create({
      data: {
        userId,
        label: dto.label,
        customLabel: dto.customLabel ?? null,
        address: dto.address,
        lat: dto.lat,
        lng: dto.lng,
      },
    });
    return this.toNumbers(row);
  }

  async remove(userId: string, id: string) {
    const row = await this.prisma.savedAddress.findUnique({ where: { id } });
    if (!row || row.userId !== userId) {
      throw new ForbiddenException('Not your saved address');
    }
    await this.prisma.savedAddress.delete({ where: { id } });
    return { deleted: true };
  }
}
