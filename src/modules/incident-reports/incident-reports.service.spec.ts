import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { IncidentReportsService } from './incident-reports.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('IncidentReportsService', () => {
  let service: IncidentReportsService;
  let prisma: any;
  let notifications: jest.Mocked<Pick<NotificationsService, 'pushToAdmins'>>;

  beforeEach(() => {
    prisma = {
      trip: { findUnique: jest.fn() },
      incidentReport: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    notifications = { pushToAdmins: jest.fn() };

    service = new IncidentReportsService(
      prisma,
      notifications as unknown as NotificationsService,
    );
  });

  describe('create', () => {
    it('throws NotFoundException when the trip does not exist', async () => {
      prisma.trip.findUnique.mockResolvedValue(null);

      await expect(
        service.create('reporter-1', {
          tripId: 'missing',
          category: 'other',
          description: 'x',
        } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects when the reporter was not the passenger on that trip', async () => {
      prisma.trip.findUnique.mockResolvedValue({
        id: 'trip-1',
        passengerId: 'passenger-1',
        driverId: 'driver-1',
      });

      await expect(
        service.create('stranger', {
          tripId: 'trip-1',
          category: 'other',
          description: 'x',
        } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('creates the report and notifies admins', async () => {
      prisma.trip.findUnique.mockResolvedValue({
        id: 'trip-1',
        passengerId: 'passenger-1',
        driverId: 'driver-1',
      });
      prisma.incidentReport.create.mockResolvedValue({ id: 'report-1' });

      const result = await service.create('passenger-1', {
        tripId: 'trip-1',
        category: 'driver_behavior',
        description: 'Went too fast',
      } as any);

      expect(result).toEqual({ id: 'report-1' });
      expect(notifications.pushToAdmins).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('driver_behavior'),
        expect.objectContaining({
          type: 'incident_report_submitted',
          reportId: 'report-1',
        }),
      );
    });
  });

  describe('markReviewed', () => {
    it('throws NotFoundException when the report does not exist', async () => {
      prisma.incidentReport.findUnique.mockResolvedValue(null);

      await expect(service.markReviewed('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.incidentReport.update).not.toHaveBeenCalled();
    });

    it('marks an existing report as reviewed', async () => {
      prisma.incidentReport.findUnique.mockResolvedValue({ id: 'report-1' });
      prisma.incidentReport.update.mockResolvedValue({
        id: 'report-1',
        status: 'reviewed',
      });

      const result = await service.markReviewed('report-1');

      expect(prisma.incidentReport.update).toHaveBeenCalledWith({
        where: { id: 'report-1' },
        data: { status: 'reviewed' },
      });
      expect(result).toEqual({ reviewed: true });
    });
  });

  describe('listForAdmin', () => {
    it('rejects an invalid status filter', async () => {
      await expect(service.listForAdmin('not-a-status')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
