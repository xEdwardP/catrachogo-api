import { Module } from '@nestjs/common';
import { IncidentReportsController } from './incident-reports.controller';
import { AdminIncidentReportsController } from './admin-incident-reports.controller';
import { IncidentReportsService } from './incident-reports.service';

@Module({
  controllers: [IncidentReportsController, AdminIncidentReportsController],
  providers: [IncidentReportsService],
})
export class IncidentReportsModule {}
