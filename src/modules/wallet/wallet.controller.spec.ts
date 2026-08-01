import {
  WalletController,
  AdminWithdrawalsController,
  AdminPlatformWalletController,
} from './wallet.controller';
import { WalletService } from './wallet.service';

describe('WalletController', () => {
  let controller: WalletController;
  let walletService: jest.Mocked<
    Pick<
      WalletService,
      | 'getWallet'
      | 'createTopupOrder'
      | 'confirmTopup'
      | 'getTransactions'
      | 'requestWithdrawal'
    >
  >;

  beforeEach(() => {
    walletService = {
      getWallet: jest.fn(),
      createTopupOrder: jest.fn(),
      confirmTopup: jest.fn(),
      getTransactions: jest.fn(),
      requestWithdrawal: jest.fn(),
    };
    controller = new WalletController(
      walletService as unknown as WalletService,
    );
  });

  it('fetches the wallet balance for the authenticated user', () => {
    const req = { user: { userId: 'user-1' } };
    controller.getWallet(req as any);
    expect(walletService.getWallet).toHaveBeenCalledWith('user-1');
  });

  it('confirms a top-up using the order id, never a client-supplied amount', () => {
    const req = { user: { userId: 'user-1' } };
    controller.confirm(req as any, { orderId: 'order-1' });
    expect(walletService.confirmTopup).toHaveBeenCalledWith(
      'user-1',
      'order-1',
    );
  });

  it('requests a withdrawal on behalf of the authenticated driver', () => {
    const req = { user: { userId: 'driver-user-1' } };
    controller.requestWithdrawal(req as any, {
      paypalEmail: 'driver@example.com',
      amount: 100,
    });
    expect(walletService.requestWithdrawal).toHaveBeenCalledWith(
      'driver-user-1',
      'driver@example.com',
      100,
    );
  });
});

describe('AdminWithdrawalsController', () => {
  let controller: AdminWithdrawalsController;
  let walletService: jest.Mocked<
    Pick<WalletService, 'listWithdrawals' | 'resolveWithdrawal'>
  >;

  beforeEach(() => {
    walletService = {
      listWithdrawals: jest.fn(),
      resolveWithdrawal: jest.fn(),
    };
    controller = new AdminWithdrawalsController(
      walletService as unknown as WalletService,
    );
  });

  it('defaults pagination to page 1 / limit 20 when listing withdrawals', () => {
    controller.list(undefined, undefined, undefined);
    expect(walletService.listWithdrawals).toHaveBeenCalledWith(
      undefined,
      1,
      20,
      undefined,
    );
  });

  it('passes the search query param when listing withdrawals', () => {
    controller.list('pending', '1', '20', 'jane@example.com');
    expect(walletService.listWithdrawals).toHaveBeenCalledWith(
      'pending',
      1,
      20,
      'jane@example.com',
    );
  });

  it('resolves a withdrawal using the authenticated admin as the resolver', () => {
    const req = { user: { userId: 'admin-1' } };
    controller.resolve(req as any, 'wr-1', { status: 'completed' } as any);
    expect(walletService.resolveWithdrawal).toHaveBeenCalledWith(
      'wr-1',
      'admin-1',
      'completed',
    );
  });
});

describe('AdminPlatformWalletController', () => {
  let controller: AdminPlatformWalletController;
  let walletService: jest.Mocked<
    Pick<WalletService, 'getPlatformWallet' | 'getPlatformTransactions'>
  >;

  beforeEach(() => {
    walletService = {
      getPlatformWallet: jest.fn(),
      getPlatformTransactions: jest.fn(),
    };
    controller = new AdminPlatformWalletController(
      walletService as unknown as WalletService,
    );
  });

  it('delegates the platform wallet balance lookup to the service', () => {
    controller.getPlatformWallet();
    expect(walletService.getPlatformWallet).toHaveBeenCalled();
  });

  it('defaults pagination to page 1 / limit 20 for platform transactions', () => {
    controller.getPlatformTransactions(undefined, undefined);
    expect(walletService.getPlatformTransactions).toHaveBeenCalledWith(1, 20);
  });
});
