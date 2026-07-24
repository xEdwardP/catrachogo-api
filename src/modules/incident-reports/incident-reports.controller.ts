import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { IncidentReportsService } from './incident-reports.service';
import { CreateIncidentReportDto } from './dto/create-incident-report.dto';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('passenger')
@Controller('incident-reports')
export class IncidentReportsController {
  constructor(private incidentReportsService: IncidentReportsService) {}

  @Post()
  create(@Request() req, @Body() dto: CreateIncidentReportDto) {
    return this.incidentReportsService.create(req.user.userId, dto);
  }
}
