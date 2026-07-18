import { Module } from '@nestjs/common';
import {
  FareZonesController,
  AdminFareZonesController,
} from './fare-zones.controller';
import { FareZonesService } from './fare-zones.service';

@Module({
  controllers: [FareZonesController, AdminFareZonesController],
  providers: [FareZonesService],
})
export class FareZonesModule {}
