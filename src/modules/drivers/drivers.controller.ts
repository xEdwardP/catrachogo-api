import {
  Controller,
  Post,
  Patch,
  Get,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DriversService } from './drivers.service';
import { CompleteProfileDto } from './dto/complete-profile.dto';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';

@UseGuards(AuthGuard('jwt'))
@Controller('drivers')
export class DriversController {
  constructor(private driversService: DriversService) {}

  @Post('complete-profile')
  completeProfile(@Request() req, @Body() dto: CompleteProfileDto) {
    return this.driversService.completeProfile(req.user.userId, dto);
  }

  @Patch('availability')
  async updateAvailability(@Request() req, @Body() dto: UpdateAvailabilityDto) {
    const driverId = await this.driversService.getDriverIdByUserId(
      req.user.userId,
    );
    return this.driversService.updateAvailability(driverId, dto.available);
  }

  @Get('pending-requests')
  async pendingRequests(@Request() req) {
    const driverId = await this.driversService.getDriverIdByUserId(
      req.user.userId,
    );
    return this.driversService.getPendingRequest(driverId);
  }

  @Get('summary')
  async summary(@Request() req) {
    const driverId = await this.driversService.getDriverIdByUserId(
      req.user.userId,
    );
    return this.driversService.getSummary(driverId);
  }

  @Get(':id')
  getPublicProfile(@Param('id') id: string) {
    return this.driversService.getPublicProfile(id);
  }
}
