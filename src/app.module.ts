import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { TripsModule } from './modules/trips/trips.module';
import { TrackingModule } from './modules/tracking/tracking.module';
import { DriversModule } from './modules/drivers/drivers.module';
import { MatchingModule } from './modules/matching/matching.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { RatingsModule } from './modules/ratings/ratings.module';
import { AdminModule } from './modules/admin/admin.module';
import { FareZonesModule } from './modules/fare-zones/fare-zones.module';
import { NotificationsModule } from './modules/notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1_000, limit: 5 },
      { name: 'medium', ttl: 60_000, limit: 120 },
      { name: 'long', ttl: 3_600_000, limit: 2000 },
    ]),
    PrismaModule,
    AuthModule,
    TripsModule,
    TrackingModule,
    DriversModule,
    MatchingModule,
    WalletModule,
    RatingsModule,
    AdminModule,
    FareZonesModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
