import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { WalletService } from './wallet.service';
import { TopupCreateOrderDto } from './dto/topup-create-order.dto';
import { TopupConfirmDto } from './dto/topup-confirm.dto';
import { RequestWithdrawalDto } from './dto/request-withdrawal.dto';
import { ResolveWithdrawalDto } from './dto/resolve-withdrawal.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@UseGuards(AuthGuard('jwt'))
@Controller('wallet')
export class WalletController {
  constructor(private walletService: WalletService) {}

  @Get()
  getWallet(@Request() req) {
    return this.walletService.getWallet(req.user.userId);
  }

  @UseGuards(RolesGuard)
  @Roles('passenger')
  @Post('topup/create-order')
  createOrder(@Body() dto: TopupCreateOrderDto) {
    return this.walletService.createTopupOrder(
      dto.amount,
      dto.returnUrl,
      dto.cancelUrl,
    );
  }

  @UseGuards(RolesGuard)
  @Roles('passenger')
  @Post('topup/confirm')
  confirm(@Request() req, @Body() dto: TopupConfirmDto) {
    return this.walletService.confirmTopup(req.user.userId, dto.orderId);
  }

  @Get('transactions')
  getTransactions(
    @Request() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.walletService.getTransactions(
      req.user.userId,
      Number(page) || 1,
      Number(limit) || 20,
    );
  }

  @Post('withdrawal')
  requestWithdrawal(@Request() req, @Body() dto: RequestWithdrawalDto) {
    return this.walletService.requestWithdrawal(
      req.user.userId,
      dto.paypalEmail,
      dto.amount,
    );
  }
}

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
@Controller('admin/withdrawals')
export class AdminWithdrawalsController {
  constructor(private walletService: WalletService) {}

  @Get()
  list(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.walletService.listWithdrawals(
      status,
      Number(page) || 1,
      Number(limit) || 20,
      search,
    );
  }

  @Patch(':id')
  resolve(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: ResolveWithdrawalDto,
  ) {
    return this.walletService.resolveWithdrawal(
      id,
      req.user.userId,
      dto.status,
    );
  }
}

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
@Controller('admin/platform-wallet')
export class AdminPlatformWalletController {
  constructor(private walletService: WalletService) {}

  @Get()
  getPlatformWallet() {
    return this.walletService.getPlatformWallet();
  }

  @Get('transactions')
  getPlatformTransactions(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.walletService.getPlatformTransactions(
      Number(page) || 1,
      Number(limit) || 20,
    );
  }
}
