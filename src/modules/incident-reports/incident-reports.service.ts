import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateIncidentReportDto } from './dto/create-incident-report.dto';
import type { IncidentReportStatus } from '../../../generated/prisma/client';

@Injectable()
export class IncidentReportsService {
  constructor(private prisma: PrismaService) {}

  async create(reporterId: string, dto: CreateIncidentReportDto) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: dto.tripId },
    });
    if (!trip) throw new NotFoundException();
    if (trip.passengerId !== reporterId) {
      throw new ForbiddenException('Not your trip');
    }

    const report = await this.prisma.incidentReport.create({
      data: {
        reporterId,
        tripId: trip.id,
        reportedDriverId: trip.driverId,
        category: dto.category,
        description: dto.description,
      },
    });
    return { id: report.id };
  }

  async listForAdmin(status?: IncidentReportStatus) {
    const rows = await this.prisma.incidentReport.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      include: {
        reporter: { select: { id: true, name: true } },
        reportedDriver: {
          include: { user: { select: { id: true, name: true } } },
        },
        trip: { select: { destinationAddress: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      category: row.category,
      description: row.description,
      status: row.status,
      createdAt: row.createdAt,
      tripId: row.tripId,
      trip: row.trip,
      reporter: row.reporter,
      reportedDriver: row.reportedDriver
        ? { id: row.reportedDriver.id, name: row.reportedDriver.user.name }
        : null,
    }));
  }

  async markReviewed(id: string) {
    await this.prisma.incidentReport.update({
      where: { id },
      data: { status: 'reviewed' },
    });
    return { reviewed: true };
  }
}
