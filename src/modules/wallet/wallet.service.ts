import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaypalService } from './paypal.service';
import { NotificationsService } from '../notifications/notifications.service';
import { paginationParams } from '../../common/utils/pagination.util';
import {
  Prisma,
  WithdrawalStatus,
} from '../../../generated/prisma/client';

@Injectable()
export class WalletService {
  constructor(
    private prisma: PrismaService,
    private paypal: PaypalService,
    private notifications: NotificationsService,
  ) {}

  async getWallet(userId: string) {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundException('Wallet not found');
    return { balance: Number(wallet.balance) };
  }

  async createTopupOrder(
    amount: number,
    returnUrl?: string,
    cancelUrl?: string,
  ): Promise<{ orderId: string; approveUrl: string | null }> {
    return this.paypal.createOrder(amount, returnUrl, cancelUrl);
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
      if (!wallet || Number(wallet.balance) < amount) {
        throw new BadRequestException({
          message: 'Insufficient balance',
          code: 'insufficient_balance',
        });
      }

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
      const withdrawal = await tx.withdrawalRequest.create({
        data: { driverId: driver.id, paypalEmail, amount, status: 'pending' },
      });
      return { ...withdrawal, amount: Number(withdrawal.amount) };
    });
  }

  async listWithdrawals(
    status?: string,
    page = 1,
    limit = 20,
    search?: string,
  ) {
    if (
      status &&
      !Object.values(WithdrawalStatus).includes(status as WithdrawalStatus)
    ) {
      throw new BadRequestException(
        `Invalid status. Must be one of: ${Object.values(WithdrawalStatus).join(', ')}`,
      );
    }

    const { take, skip } = paginationParams(page, limit);
    const where: Prisma.WithdrawalRequestWhereInput = {
      ...(status ? { status: status as WithdrawalStatus } : {}),
      ...(search
        ? {
            OR: [
              {
                driver: {
                  user: { name: { contains: search, mode: 'insensitive' } },
                },
              },
              { paypalEmail: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [withdrawals, total] = await Promise.all([
      this.prisma.withdrawalRequest.findMany({
        where,
        orderBy: { requestedAt: 'desc' },
        include: {
          driver: { include: { user: { omit: { passwordHash: true } } } },
        },
        take,
        skip,
      }),
      this.prisma.withdrawalRequest.count({ where }),
    ]);

    return {
      data: withdrawals.map((w) => ({ ...w, amount: Number(w.amount) })),
      total,
      page,
      limit,
    };
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

    const driver = await this.prisma.driver.findUnique({
      where: { id: request.driverId },
    });
    if (!driver) throw new NotFoundException('Driver not found');

    if (status === 'rejected') {
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

    const resolved = await this.prisma.withdrawalRequest.update({
      where: { id: requestId },
      data: { status, resolvedAt: new Date(), adminId },
    });

    await this.notifications.create(
      driver.userId,
      'withdrawal_resolved',
      status === 'completed' ? 'Retiro aprobado' : 'Retiro rechazado',
      status === 'completed'
        ? `Tu retiro de L.${Number(request.amount).toFixed(2)} fue procesado.`
        : `Tu retiro de L.${Number(request.amount).toFixed(2)} fue rechazado y el monto volvió a tu wallet.`,
    );

    return resolved;
  }

  async getPlatformWallet() {
    const wallet = await this.prisma.wallet.findUniqueOrThrow({
      where: { userId: process.env.PLATFORM_USER_ID },
    });
    return { balance: Number(wallet.balance) };
  }

  async getPlatformTransactions(page = 1, limit = 20) {
    const wallet = await this.prisma.wallet.findUniqueOrThrow({
      where: { userId: process.env.PLATFORM_USER_ID },
    });
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
}
