import { BadRequestException, Injectable } from '@nestjs/common';
import { PaperOrderSide, PaperOrderStatus } from '@prisma/client';
import { PaperTradingService } from '../paper-trading/paper-trading.service';

export type PlaceOrderInput = {
  symbol: string;
  side: PaperOrderSide;
  quantity: number;
  signalId?: string;
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
  signalId: string | null;
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
  signalId: string | null;
};

export type OrdersListQuery = {
  accountId?: string;
  symbol?: string;
  signalId?: string;
  status?: PaperOrderStatus;
  limit?: number;
  offset?: number;
};

export type OrdersCursorPage = {
  items: AttributedOrderListItem[];
  nextCursor: string | null;
  limit: number;
};

@Injectable()
export class OrdersService {
  constructor(private readonly paperTradingService: PaperTradingService) {}

  async placeOrder(
    input: PlaceOrderInput,
    userEmail: string,
    accountId?: string,
  ): Promise<AttributedOrder> {
    const placed = await this.paperTradingService.placeMarketOrder(
      input,
      userEmail,
      accountId,
    );
    return {
      userEmail,
      ...placed,
    };
  }

  async cancelOrder(
    orderId: string,
    userEmail: string,
    accountId?: string,
  ): Promise<{ userEmail: string; orderId: string; status: 'CANCELED' }> {
    const canceled = await this.paperTradingService.cancelOrder(
      orderId,
      userEmail,
      accountId,
    );
    return {
      userEmail,
      ...canceled,
    };
  }

  async listOrders(
    userEmail: string,
    query: OrdersListQuery = {},
  ): Promise<AttributedOrderListItem[]> {
    const rows = await this.paperTradingService.listOrders(
      userEmail,
      {
        symbol: query.symbol,
        signalId: query.signalId,
        status: query.status,
        limit: query.limit,
        offset: query.offset,
      },
      query.accountId,
    );
    return rows.map((row) => ({
      userEmail,
      ...row,
    }));
  }

  async listOrdersPage(input: {
    userEmail: string;
    accountId?: string;
    symbol?: string;
    signalId?: string;
    status?: PaperOrderStatus;
    limit: number;
    cursor?: string;
  }): Promise<OrdersCursorPage> {
    const cursor = this.decodeCursor(input.cursor);
    const page = await this.paperTradingService.listOrdersPage({
      userEmail: input.userEmail,
      accountId: input.accountId,
      symbol: input.symbol,
      signalId: input.signalId,
      status: input.status,
      limit: input.limit,
      cursor,
    });
    return {
      items: page.items.map((row) => ({ userEmail: input.userEmail, ...row })),
      nextCursor: page.nextCursor ? this.encodeCursor(page.nextCursor) : null,
      limit: input.limit,
    };
  }

  private encodeCursor(cursor: { requestedAt: string; orderId: string }): string {
    return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
  }

  private decodeCursor(
    cursorRaw?: string,
  ): { requestedAt: Date; orderId: string } | undefined {
    if (!cursorRaw) {
      return undefined;
    }
    try {
      const decoded = JSON.parse(
        Buffer.from(cursorRaw, 'base64url').toString('utf8'),
      ) as { requestedAt?: string; orderId?: string };
      if (!decoded.requestedAt || !decoded.orderId) {
        throw new BadRequestException('invalid cursor.');
      }
      const requestedAt = new Date(decoded.requestedAt);
      if (Number.isNaN(requestedAt.getTime())) {
        throw new BadRequestException('invalid cursor.');
      }
      return { requestedAt, orderId: decoded.orderId };
    } catch {
      throw new BadRequestException('invalid cursor.');
    }
  }
}
