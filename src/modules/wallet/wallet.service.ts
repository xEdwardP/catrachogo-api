import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaypalService } from './paypal.service';
import { paginationParams } from '../../common/utils/pagination.util';

@Injectable()
export class WalletService {
  constructor(
    private prisma: PrismaService,
    private paypal: PaypalService,
  ) {}

  async getWallet(userId: string) {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundException('Wallet not found');
    return { balance: Number(wallet.balance) };
  }

  async createTopupOrder(amount: number): Promise<{ orderId: string }> {
    const orderId = await this.paypal.createOrder(amount);
    return { orderId };
  }

  async confirmTopup(userId: string, orderId: string) {
    const { verified, capturedAmount } =
      await this.paypal.captureOrder(orderId);
    if (!verified || capturedAmount <= 0) {
      throw new BadRequestException('PayPal order could not be verified');
    }

    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.update({
        where: { userId },
        data: { balance: { increment: capturedAmount } },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'paypal_topup',
          amount: capturedAmount,
          paypalReferenceId: orderId,
        },
      });
      return { balance: Number(wallet.balance) };
    });
  }

  async getTransactions(userId: string, page = 1, limit = 20) {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundException('Wallet not found');

    const { take, skip } = paginationParams(page, limit);
    const [transactions, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.walletTransaction.count({ where: { walletId: wallet.id } }),
    ]);

    return {
      data: transactions.map((t) => ({ ...t, amount: Number(t.amount) })),
      total,
      page,
      limit,
    };
  }

  async requestWithdrawal(
    driverUserId: string,
    paypalEmail: string,
    amount: number,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const driver = await tx.driver.findUnique({
        where: { userId: driverUserId },
      });
      if (!driver) throw new NotFoundException('Driver not found');

      const wallet = await tx.wallet.findUnique({
        where: { userId: driverUserId },
      });
      if (!wallet || Number(wallet.balance) < amount)
        throw new BadRequestException('Insufficient balance');

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: amount } },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'withdrawal_adjustment',
          amount: -amount,
        },
      });
      return tx.withdrawalRequest.create({
        data: { driverId: driver.id, paypalEmail, amount, status: 'pending' },
      });
    });
  }

  async listWithdrawals(status?: string) {
    return this.prisma.withdrawalRequest.findMany({
      where: status ? { status: status as any } : {},
      orderBy: { requestedAt: 'desc' },
      include: { driver: { include: { user: true } } },
    });
  }

  async resolveWithdrawal(
    requestId: string,
    adminId: string,
    status: 'completed' | 'rejected',
  ) {
    const request = await this.prisma.withdrawalRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException('Withdrawal request not found');
    if (request.status !== 'pending')
      throw new BadRequestException('Request already resolved');

    if (status === 'rejected') {
      const driver = await this.prisma.driver.findUnique({
        where: { id: request.driverId },
      });
      if (!driver) throw new NotFoundException('Driver not found');
      const wallet = await this.prisma.wallet.findUnique({
        where: { userId: driver.userId },
      });
      if (!wallet) throw new NotFoundException('Wallet not found');

      await this.prisma.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: request.amount } },
      });
      await this.prisma.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'withdrawal_adjustment',
          amount: request.amount,
        },
      });
    }

    return this.prisma.withdrawalRequest.update({
      where: { id: requestId },
      data: { status, resolvedAt: new Date(), adminId },
    });
  }
}
