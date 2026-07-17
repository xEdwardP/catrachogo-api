import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class DriversService {
  constructor(private prisma: PrismaService) {}

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
    };
  }
}
