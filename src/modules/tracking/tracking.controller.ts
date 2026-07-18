import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsLatitude, IsLongitude, IsOptional, IsUUID } from 'class-validator';
import { TrackingService } from './tracking.service';
import { DriversService } from '../drivers/drivers.service';

class RecordLocationDto {
  @IsLatitude() lat!: number;
  @IsLongitude() lng!: number;
  @IsOptional() @IsUUID() tripId?: string;
}

@UseGuards(AuthGuard('jwt'))
@Controller('tracking')
export class TrackingController {
  constructor(
    private tracking: TrackingService,
    private drivers: DriversService,
  ) {}

  @Post('location')
  async record(@Request() req, @Body() dto: RecordLocationDto) {
    const driverId = await this.drivers.getDriverIdByUserId(req.user.userId);
    return this.tracking.recordLocation(driverId, dto.lat, dto.lng, dto.tripId);
  }
}
