import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateIncidentReportDto } from './dto/create-incident-report.dto';
import { IncidentReportStatus } from '../../../generated/prisma/client';
import { paginationParams } from '../../common/utils/pagination.util';

@Injectable()
export class IncidentReportsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

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

    await this.notifications.pushToAdmins(
      'Nuevo reporte de incidencia',
      `Categoría: ${dto.category}`,
      { type: 'incident_report_submitted', reportId: report.id },
    );

    return { id: report.id };
  }

  async listForAdmin(status?: string, page = 1, limit = 20) {
    if (
      status &&
      !Object.values(IncidentReportStatus).includes(
        status as IncidentReportStatus,
      )
    ) {
      throw new BadRequestException(
        `Invalid status. Must be one of: ${Object.values(IncidentReportStatus).join(', ')}`,
      );
    }

    const { take, skip } = paginationParams(page, limit);
    const where = status ? { status: status as IncidentReportStatus } : {};

    const [rows, total] = await Promise.all([
      this.prisma.incidentReport.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          reporter: { select: { id: true, name: true } },
          reportedDriver: {
            include: { user: { select: { id: true, name: true } } },
          },
          trip: { select: { destinationAddress: true } },
        },
        take,
        skip,
      }),
      this.prisma.incidentReport.count({ where }),
    ]);

    return {
      data: rows.map((row) => ({
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
      })),
      total,
      page,
      limit,
    };
  }

  async markReviewed(id: string) {
    const existing = await this.prisma.incidentReport.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Incident report not found');

    await this.prisma.incidentReport.update({
      where: { id },
      data: { status: 'reviewed' },
    });
    return { reviewed: true };
  }
}
