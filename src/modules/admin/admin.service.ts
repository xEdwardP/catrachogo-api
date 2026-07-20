import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const TRIP_STATUSES = [
  'pending',
  'accepted',
  'in_progress',
  'completed',
  'cancelled',
] as const;

const DAILY_COMPLETED_DAYS = 14;

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  async getStats() {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [
      statusCounts,
      todayAggregate,
      availableDrivers,
      pendingDrivers,
      pendingWithdrawals,
      dailyCompleted,
    ] = await Promise.all([
      this.prisma.trip.groupBy({ by: ['status'], _count: true }),
      this.prisma.trip.aggregate({
        where: { status: 'completed', completedAt: { gte: startOfToday } },
        _sum: { fare: true },
        _count: true,
      }),
      this.prisma.driver.count({ where: { available: true } }),
      this.prisma.driver.count({ where: { verificationStatus: 'pending' } }),
      this.prisma.withdrawalRequest.count({ where: { status: 'pending' } }),
      this.getDailyCompletedTrips(startOfToday, DAILY_COMPLETED_DAYS),
    ]);

    const tripsByStatus = Object.fromEntries(
      TRIP_STATUSES.map((status) => [status, 0]),
    ) as Record<(typeof TRIP_STATUSES)[number], number>;
    for (const row of statusCounts) {
      tripsByStatus[row.status] = row._count;
    }

    return {
      tripsByStatus,
      revenueToday: Number(todayAggregate._sum.fare ?? 0),
      tripsCompletedToday: todayAggregate._count,
      availableDrivers,
      pendingDrivers,
      pendingWithdrawals,
      dailyCompleted,
    };
  }

  private async getDailyCompletedTrips(startOfToday: Date, days: number) {
    const dayStarts: Date[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const start = new Date(startOfToday);
      start.setDate(start.getDate() - i);
      dayStarts.push(start);
    }

    return Promise.all(
      dayStarts.map(async (start) => {
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        const aggregate = await this.prisma.trip.aggregate({
          where: { status: 'completed', completedAt: { gte: start, lt: end } },
          _sum: { fare: true },
          _count: true,
        });
        return {
          date: start.toISOString().slice(0, 10),
          tripsCompleted: aggregate._count,
          revenue: Number(aggregate._sum.fare ?? 0),
        };
      }),
    );
  }
}
