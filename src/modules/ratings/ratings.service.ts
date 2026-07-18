import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

import { CreateRatingDto } from './dto/create-rating.dto';
import { paginationParams } from '../../common/utils/pagination.util';

@Injectable()
export class RatingsService {
  constructor(private prisma: PrismaService) {}

  async createRating(raterId: string, dto: CreateRatingDto) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: dto.tripId },
      include: { driver: true },
    });
    if (!trip) throw new BadRequestException('Trip not found');
    if (trip.status !== 'completed')
      throw new BadRequestException('Trip must be completed before rating');

    const isPassenger = trip.passengerId === raterId;
    const isDriver = trip.driver?.userId === raterId;
    if (!isPassenger && !isDriver)
      throw new ForbiddenException('You were not part of this trip');

    const validTarget = isPassenger
      ? trip.driver?.userId === dto.ratedId
      : trip.passengerId === dto.ratedId;
    if (!validTarget)
      throw new BadRequestException(
        'ratedId must be the other participant of the trip',
      );

    const existing = await this.prisma.rating.findFirst({
      where: { tripId: dto.tripId, raterId },
    });
    if (existing) throw new ConflictException('You already rated this trip');

    const rating = await this.prisma.rating.create({
      data: {
        tripId: dto.tripId,
        raterId,
        ratedId: dto.ratedId,
        score: dto.score,
        comment: dto.comment,
      },
    });

    const ratedDriver = await this.prisma.driver.findUnique({
      where: { userId: dto.ratedId },
    });
    if (ratedDriver) {
      const agg = await this.prisma.rating.aggregate({
        where: { ratedId: dto.ratedId },
        _avg: { score: true },
      });
      await this.prisma.driver.update({
        where: { id: ratedDriver.id },
        data: { averageRating: agg._avg.score ?? 0 },
      });
    }

    return rating;
  }

  async getRatingsForUser(userId: string, page = 1, limit = 20) {
    const { take, skip } = paginationParams(page, limit);
    const [ratings, total] = await Promise.all([
      this.prisma.rating.findMany({
        where: { ratedId: userId },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.rating.count({ where: { ratedId: userId } }),
    ]);
    return { data: ratings, total, page, limit };
  }
}
