import { Module } from '@nestjs/common';
import {
  WalletController,
  AdminWithdrawalsController,
  AdminPlatformWalletController,
} from './wallet.controller';
import { WalletService } from './wallet.service';
import { PaypalService } from './paypal.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [
    WalletController,
    AdminWithdrawalsController,
    AdminPlatformWalletController,
  ],
  providers: [WalletService, PaypalService],
})
export class WalletModule {}
