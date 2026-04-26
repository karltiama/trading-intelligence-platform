import { Injectable } from '@nestjs/common';
import { PaperOrderSide, PaperOrderStatus } from '@prisma/client';
import { PaperTradingService } from '../paper-trading/paper-trading.service';

export type PlaceOrderInput = {
  symbol: string;
  side: PaperOrderSide;
  quantity: number;
};

export type AttributedOrder = {
  userEmail: string;
  orderId: string;
  status: string;
  symbol: string;
  side: PaperOrderSide;
  quantity: number;
  fillPrice: number;
  fillNotional: number;
  cashBalance: number;
};

export type AttributedOrderListItem = {
  userEmail: string;
  orderId: string;
  symbol: string;
  side: PaperOrderSide;
  type: 'MARKET';
  status: string;
  quantity: number;
  requestedAt: string;
  filledAt: string | null;
  canceledAt: string | null;
};

export type OrdersListQuery = {
  symbol?: string;
  status?: PaperOrderStatus;
  limit?: number;
  offset?: number;
};

@Injectable()
export class OrdersService {
  constructor(private readonly paperTradingService: PaperTradingService) {}

  async placeOrder(input: PlaceOrderInput, userEmail: string): Promise<AttributedOrder> {
    const placed = await this.paperTradingService.placeMarketOrder(input, userEmail);
    return {
      userEmail,
      ...placed,
    };
  }

  async cancelOrder(
    orderId: string,
    userEmail: string,
  ): Promise<{ userEmail: string; orderId: string; status: 'CANCELED' }> {
    const canceled = await this.paperTradingService.cancelOrder(orderId, userEmail);
    return {
      userEmail,
      ...canceled,
    };
  }

  async listOrders(
    userEmail: string,
    query: OrdersListQuery = {},
  ): Promise<AttributedOrderListItem[]> {
    const rows = await this.paperTradingService.listOrders(userEmail, query);
    return rows.map((row) => ({
      userEmail,
      ...row,
    }));
  }
}
