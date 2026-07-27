import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { DriversService } from '../drivers/drivers.service';
import { TripsService } from '../trips/trips.service';
import { AdminService } from './admin.service';
import { ResolveWithdrawalDto } from '../wallet/dto/resolve-withdrawal.dto';

import { IsIn } from 'class-validator';
class UpdateVerificationDto {
  @IsIn(['approved', 'rejected']) verificationStatus!: 'approved' | 'rejected';
}

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(
    private driversService: DriversService,
    private tripsService: TripsService,
    private adminService: AdminService,
  ) {}

  @Get('stats')
  getStats() {
    return this.adminService.getStats();
  }

  @Get('drivers')
  listDrivers(@Query('status') status?: string) {
    return this.driversService.listByStatus(status);
  }

  @Get('drivers/:id')
  getDriver(@Param('id') id: string) {
    return this.driversService.getByIdForAdmin(id);
  }

  @Patch('drivers/:id/verification')
  updateVerification(
    @Param('id') id: string,
    @Body() dto: UpdateVerificationDto,
  ) {
    return this.driversService.updateVerification(id, dto.verificationStatus);
  }

  @Get('trips')
  listTrips(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.tripsService.listAll(
      status,
      Number(page) || 1,
      Number(limit) || 20,
    );
  }
}
