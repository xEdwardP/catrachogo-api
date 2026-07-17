import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { DriversController } from './modules/drivers/drivers.controller';
import { DriversService } from './modules/drivers/drivers.service';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }]),
    PrismaModule,
    AuthModule,
  ],
  controllers: [AppController, DriversController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }, DriversService],
})
export class AppModule {}
