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
import { PaypalService } from './modules/wallet/paypal.service';
import { WalletService } from './modules/wallet/wallet.service';
import { WalletController } from './modules/wallet/wallet.controller';
import { WalletModule } from './modules/wallet/wallet.module';
import { RatingsService } from './modules/ratings/ratings.service';
import { RatingsController } from './modules/ratings/ratings.controller';
import { RatingsModule } from './modules/ratings/ratings.module';
import { AdminController } from './modules/admin/admin.controller';
import { AdminModule } from './modules/admin/admin.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }]),
    PrismaModule,
    AuthModule,
    TripsModule,
    TrackingModule,
    DriversModule,
    MatchingModule,
    WalletModule,
    RatingsModule,
    AdminModule,
  ],
  controllers: [AppController, DriversController, WalletController, RatingsController, AdminController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }, DriversService, TripsService, TrackingService, PaypalService, WalletService, RatingsService],
})
export class AppModule {}
