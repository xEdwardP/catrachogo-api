import {
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { IncidentReportsService } from './incident-reports.service';
import type { IncidentReportStatus } from '../../../generated/prisma/client';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
@Controller('admin/incident-reports')
export class AdminIncidentReportsController {
  constructor(private incidentReportsService: IncidentReportsService) {}

  @Get()
  list(@Query('status') status?: IncidentReportStatus) {
    return this.incidentReportsService.listForAdmin(status);
  }

  @Patch(':id/review')
  markReviewed(@Param('id') id: string) {
    return this.incidentReportsService.markReviewed(id);
  }
}
