import { BadRequestException } from '@nestjs/common';
import { ApiError } from '@paypal/paypal-server-sdk';
import { PaypalService } from './paypal.service';

const fakeApiError = () =>
  new ApiError(
    {
      request: {
        method: 'POST',
        url: 'https://api.paypal.com/v2/checkout/orders',
      },
      response: { statusCode: 500, headers: {}, body: '{}' },
    },
    'PayPal API error',
  );

describe('PaypalService', () => {
  let service: PaypalService;
  let ordersController: { createOrder: jest.Mock; captureOrder: jest.Mock };

  beforeEach(() => {
    process.env.PAYPAL_CLIENT_ID = 'test-client-id';
    process.env.PAYPAL_CLIENT_SECRET = 'test-client-secret';

    service = new PaypalService();
    ordersController = { createOrder: jest.fn(), captureOrder: jest.fn() };
    (service as any).ordersController = ordersController;
  });

  describe('createOrder', () => {
    it('returns the order id and approve link on success', async () => {
      ordersController.createOrder.mockResolvedValue({
        result: {
          id: 'order-1',
          links: [
            { rel: 'self', href: 'http://self' },
            { rel: 'approve', href: 'http://approve' },
          ],
        },
      });

      const result = await service.createOrder(
        100,
        'http://return',
        'http://cancel',
      );

      expect(result).toEqual({
        orderId: 'order-1',
        approveUrl: 'http://approve',
      });
    });

    it('returns null approveUrl when PayPal does not include an approve link', async () => {
      ordersController.createOrder.mockResolvedValue({
        result: { id: 'order-1', links: [] },
      });

      const result = await service.createOrder(100);

      expect(result.approveUrl).toBeNull();
    });

    it('translates a PayPal ApiError into a BadRequestException', async () => {
      ordersController.createOrder.mockRejectedValue(fakeApiError());

      await expect(service.createOrder(100)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rethrows unexpected errors instead of swallowing them', async () => {
      ordersController.createOrder.mockRejectedValue(new Error('boom'));

      await expect(service.createOrder(100)).rejects.toThrow('boom');
    });
  });

  describe('captureOrder', () => {
    it('reports verified with the captured amount when PayPal completes the order', async () => {
      ordersController.captureOrder.mockResolvedValue({
        result: {
          status: 'COMPLETED',
          purchaseUnits: [
            { payments: { captures: [{ amount: { value: '42.00' } }] } },
          ],
        },
      });

      const result = await service.captureOrder('order-1');

      expect(result).toEqual({ verified: true, capturedAmount: 42 });
    });

    it('reports not verified when the order status is not COMPLETED', async () => {
      ordersController.captureOrder.mockResolvedValue({
        result: { status: 'PENDING', purchaseUnits: [] },
      });

      const result = await service.captureOrder('order-1');

      expect(result.verified).toBe(false);
    });

    it('never throws on a PayPal ApiError — reports not verified instead', async () => {
      ordersController.captureOrder.mockRejectedValue(fakeApiError());

      await expect(service.captureOrder('order-1')).resolves.toEqual({
        verified: false,
        capturedAmount: 0,
      });
    });
  });
});
