import { Module } from '@nestjs/common';
import {
  WalletController,
  AdminWithdrawalsController,
} from './wallet.controller';
import { WalletService } from './wallet.service';
import { PaypalService } from './paypal.service';

@Module({
  controllers: [WalletController, AdminWithdrawalsController],
  providers: [WalletService, PaypalService],
})
export class WalletModule {}
