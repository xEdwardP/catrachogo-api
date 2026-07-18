import { Module } from '@nestjs/common';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';
import { FareCalculationService } from './fare-calculation.service';
import { DriversModule } from '../drivers/drivers.module';
import { TrackingModule } from '../tracking/tracking.module';
import { MatchingModule } from '../matching/matching.module';

@Module({
  imports: [DriversModule, TrackingModule, MatchingModule],
  controllers: [TripsController],
  providers: [TripsService, FareCalculationService],
  exports: [MatchingModule, TripsService],
})
export class TripsModule {}
