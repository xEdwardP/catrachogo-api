import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { DriversModule } from '../drivers/drivers.module';
import { TripsModule } from '../trips/trips.module';

@Module({
  imports: [DriversModule, TripsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
