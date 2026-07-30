import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { PaypalService } from './paypal.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('WalletService', () => {
  let service: WalletService;
  let prisma: any;
  let tx: any;
  let paypal: jest.Mocked<Pick<PaypalService, 'createOrder' | 'captureOrder'>>;
  let notifications: jest.Mocked<Pick<NotificationsService, 'create'>>;

  beforeEach(() => {
    tx = {
      driver: { findUnique: jest.fn() },
      wallet: { findUnique: jest.fn(), update: jest.fn() },
      walletTransaction: { create: jest.fn() },
      withdrawalRequest: { create: jest.fn() },
    };
    prisma = {
      wallet: { findUnique: jest.fn(), update: jest.fn() },
      walletTransaction: { create: jest.fn() },
      withdrawalRequest: { findUnique: jest.fn(), update: jest.fn() },
      driver: { findUnique: jest.fn() },
      $transaction: jest.fn((cb: any) => cb(tx)),
    };
    paypal = { createOrder: jest.fn(), captureOrder: jest.fn() };
    notifications = { create: jest.fn() };

    service = new WalletService(
      prisma,
      paypal as unknown as PaypalService,
      notifications as unknown as NotificationsService,
    );
  });

  describe('requestWithdrawal', () => {
    it('throws NotFoundException when the requester is not a registered driver', async () => {
      tx.driver.findUnique.mockResolvedValue(null);

      await expect(
        service.requestWithdrawal('user-1', 'user@example.com', 100),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects with code "insufficient_balance" when the wallet balance is too low', async () => {
      tx.driver.findUnique.mockResolvedValue({ id: 'driver-1' });
      tx.wallet.findUnique.mockResolvedValue({ id: 'wallet-1', balance: 50 });

      await expect(
        service.requestWithdrawal('user-1', 'user@example.com', 100),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'insufficient_balance' }),
      });
    });

    it('debits the wallet and creates a pending withdrawal request', async () => {
      tx.driver.findUnique.mockResolvedValue({ id: 'driver-1' });
      tx.wallet.findUnique.mockResolvedValue({ id: 'wallet-1', balance: 200 });
      tx.withdrawalRequest.create.mockResolvedValue({
        id: 'wr-1',
        amount: 100,
        status: 'pending',
      });

      const result = await service.requestWithdrawal(
        'user-1',
        'user@example.com',
        100,
      );

      expect(tx.wallet.update).toHaveBeenCalledWith({
        where: { id: 'wallet-1' },
        data: { balance: { decrement: 100 } },
      });
      expect(tx.withdrawalRequest.create).toHaveBeenCalledWith({
        data: {
          driverId: 'driver-1',
          paypalEmail: 'user@example.com',
          amount: 100,
          status: 'pending',
        },
      });
      expect(result.amount).toBe(100); // Decimal converted to number
    });
  });

  describe('confirmTopup', () => {
    it('rejects when PayPal could not verify the order', async () => {
      paypal.captureOrder.mockResolvedValue({
        verified: false,
        capturedAmount: 0,
      });

      await expect(
        service.confirmTopup('user-1', 'order-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects when the captured amount is zero or negative', async () => {
      paypal.captureOrder.mockResolvedValue({
        verified: true,
        capturedAmount: 0,
      });

      await expect(
        service.confirmTopup('user-1', 'order-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('credits the wallet using only the amount PayPal confirms was captured', async () => {
      // A client could try to pass a different amount but confirmTopup only
      // takes (userId, orderId) — the credited amount always comes from PayPal.
      paypal.captureOrder.mockResolvedValue({
        verified: true,
        capturedAmount: 42,
      });
      tx.wallet.update.mockResolvedValue({ id: 'wallet-1', balance: 142 });

      const result = await service.confirmTopup('user-1', 'order-1');

      expect(tx.wallet.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { balance: { increment: 42 } },
      });
      expect(tx.walletTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'paypal_topup',
          amount: 42,
          paypalReferenceId: 'order-1',
        }),
      });
      expect(result.balance).toBe(142);
    });
  });

  describe('listWithdrawals', () => {
    it('rejects an invalid status filter', async () => {
      await expect(
        service.listWithdrawals('not-a-status'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('resolveWithdrawal', () => {
    it('throws NotFoundException when the request does not exist', async () => {
      prisma.withdrawalRequest.findUnique.mockResolvedValue(null);
      await expect(
        service.resolveWithdrawal('wr-1', 'admin-1', 'completed'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects when the request was already resolved', async () => {
      prisma.withdrawalRequest.findUnique.mockResolvedValue({
        id: 'wr-1',
        status: 'completed',
      });
      await expect(
        service.resolveWithdrawal('wr-1', 'admin-1', 'completed'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refunds the wallet when a withdrawal request is rejected', async () => {
      prisma.withdrawalRequest.findUnique.mockResolvedValue({
        id: 'wr-1',
        status: 'pending',
        driverId: 'driver-1',
        amount: 100,
      });
      prisma.driver.findUnique.mockResolvedValue({
        id: 'driver-1',
        userId: 'user-1',
      });
      prisma.wallet.findUnique.mockResolvedValue({
        id: 'wallet-1',
        balance: 0,
      });
      prisma.withdrawalRequest.update.mockResolvedValue({
        id: 'wr-1',
        status: 'rejected',
      });

      await service.resolveWithdrawal('wr-1', 'admin-1', 'rejected');

      expect(prisma.wallet.update).toHaveBeenCalledWith({
        where: { id: 'wallet-1' },
        data: { balance: { increment: 100 } },
      });
      expect(notifications.create).toHaveBeenCalledWith(
        'user-1',
        'withdrawal_resolved',
        expect.any(String),
        expect.any(String),
      );
    });

    it('does not touch the wallet when a withdrawal request is completed', async () => {
      prisma.withdrawalRequest.findUnique.mockResolvedValue({
        id: 'wr-1',
        status: 'pending',
        driverId: 'driver-1',
        amount: 100,
      });
      prisma.driver.findUnique.mockResolvedValue({
        id: 'driver-1',
        userId: 'user-1',
      });
      prisma.withdrawalRequest.update.mockResolvedValue({
        id: 'wr-1',
        status: 'completed',
      });

      await service.resolveWithdrawal('wr-1', 'admin-1', 'completed');

      expect(prisma.wallet.update).not.toHaveBeenCalled();
    });
  });
});
