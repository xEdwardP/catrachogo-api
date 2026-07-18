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
import { TripsService } from './trips.service';
import { FareCalculationService } from './fare-calculation.service';
import { EstimateTripDto } from './dto/estimate-trip.dto';
import { CreateTripDto } from './dto/create-trip.dto';
import { DriversService } from '../drivers/drivers.service';

@UseGuards(AuthGuard('jwt'))
@Controller('trips')
export class TripsController {
  constructor(
    private tripsService: TripsService,
    private fareCalc: FareCalculationService,
    private driversService: DriversService,
  ) {}

  @Post('estimate')
  estimate(@Body() dto: EstimateTripDto) {
    return this.fareCalc.estimate(
      dto.originLat,
      dto.originLng,
      dto.destinationLat,
      dto.destinationLng,
    );
  }

  @Post()
  create(@Request() req, @Body() dto: CreateTripDto) {
    return this.tripsService.createTrip(req.user.userId, dto);
  }

  @Patch(':id/accept')
  async accept(@Request() req, @Param('id') id: string) {
    const driverId = await this.driversService.getDriverIdByUserId(
      req.user.userId,
    );
    return this.tripsService.acceptTrip(id, driverId);
  }

  @Patch(':id/reject')
  async reject(@Request() req, @Param('id') id: string) {
    const driverId = await this.driversService.getDriverIdByUserId(
      req.user.userId,
    );
    return this.tripsService.rejectTrip(id, driverId);
  }

  @Patch(':id/start')
  async start(@Request() req, @Param('id') id: string) {
    const driverId = await this.driversService.getDriverIdByUserId(
      req.user.userId,
    );
    return this.tripsService.startTrip(id, driverId);
  }

  @Patch(':id/cancel')
  cancel(@Request() req, @Param('id') id: string) {
    return this.tripsService.cancelTrip(id, req.user.userId);
  }

  @Get(':id')
  getDetail(@Request() req, @Param('id') id: string) {
    return this.tripsService.getTripDetail(id, req.user.userId, req.user.role);
  }

  @Get(':id/driver-location')
  getDriverLocation(@Param('id') id: string) {
    return this.tripsService.getDriverLocationForTrip(id);
  }
}
