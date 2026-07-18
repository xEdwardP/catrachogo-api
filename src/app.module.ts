import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { DriversController } from './modules/drivers/drivers.controller';
import { DriversService } from './modules/drivers/drivers.service';
import { TripsService } from './modules/trips/trips.service';
import { TrackingService } from './modules/tracking/tracking.service';
import { TripsModule } from './modules/trips/trips.module';
import { TrackingModule } from './modules/tracking/tracking.module';
import { DriversModule } from './modules/drivers/drivers.module';
import { MatchingModule } from './modules/matching/matching.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }]),
    PrismaModule,
    AuthModule,
    TripsModule,
    TrackingModule,
    DriversModule,
    MatchingModule,
  ],
  controllers: [AppController, DriversController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }, DriversService, TripsService, TrackingService],
})
export class AppModule {}
