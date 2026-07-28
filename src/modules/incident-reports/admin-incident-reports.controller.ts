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

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
@Controller('admin/incident-reports')
export class AdminIncidentReportsController {
  constructor(private incidentReportsService: IncidentReportsService) {}

  @Get()
  list(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.incidentReportsService.listForAdmin(
      status,
      Number(page) || 1,
      Number(limit) || 20,
    );
  }

  @Patch(':id/review')
  markReviewed(@Param('id') id: string) {
    return this.incidentReportsService.markReviewed(id);
  }
}
