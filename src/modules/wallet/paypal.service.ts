import { Injectable, BadRequestException } from '@nestjs/common';
import {
  Client,
  Environment,
  LogLevel,
  OrdersController,
  CheckoutPaymentIntent,
  ApiError,
} from '@paypal/paypal-server-sdk';
import { getEnvOrThrow } from '../../common/utils/env.util';

@Injectable()
export class PaypalService {
  private ordersController: OrdersController;

  constructor() {
    const client = new Client({
      clientCredentialsAuthCredentials: {
        oAuthClientId: getEnvOrThrow('PAYPAL_CLIENT_ID'),
        oAuthClientSecret: getEnvOrThrow('PAYPAL_CLIENT_SECRET'),
      },
      environment:
        process.env.PAYPAL_MODE === 'live'
          ? Environment.Production
          : Environment.Sandbox,
      logging: {
        logLevel: LogLevel.Info,
        logRequest: { logBody: false },
        logResponse: { logHeaders: false },
      },
    });
    this.ordersController = new OrdersController(client);
  }

  async createOrder(amount: number): Promise<string> {
    try {
      const { result } = await this.ordersController.createOrder({
        body: {
          intent: CheckoutPaymentIntent.Capture,
          purchaseUnits: [
            { amount: { currencyCode: 'USD', value: amount.toFixed(2) } },
          ],
        },
      });
      return result.id!;
    } catch (error) {
      if (error instanceof ApiError)
        throw new BadRequestException('Could not create PayPal order');
      throw error;
    }
  }

  async captureOrder(
    orderId: string,
  ): Promise<{ verified: boolean; capturedAmount: number }> {
    try {
      const { result } = await this.ordersController.captureOrder({
        id: orderId,
      });
      const capturedAmount = Number(
        result.purchaseUnits?.[0]?.payments?.captures?.[0]?.amount?.value ?? 0,
      );
      return { verified: result.status === 'COMPLETED', capturedAmount };
    } catch (error) {
      if (error instanceof ApiError)
        return { verified: false, capturedAmount: 0 };
      throw error;
    }
  }
}
