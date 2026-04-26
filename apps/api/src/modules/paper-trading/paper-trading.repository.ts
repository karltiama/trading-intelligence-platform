import { Injectable } from '@nestjs/common';
import { PaperOrderSide, PaperOrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const DEFAULT_STARTING_CASH = new Prisma.Decimal('100000');
const DEFAULT_CURRENCY = 'USD';
const DEFAULT_ACCOUNT_ID = 'paper-default';
const DEFAULT_USER_EMAIL = 'local-default@paper.local';
const DEFAULT_USER_DISPLAY_NAME = 'Local Default User';
export const DEFAULT_ACCOUNT_CONTEXT_EMAIL = DEFAULT_USER_EMAIL;

export type PaperAccountState = {
  id: string;
  startingCash: Prisma.Decimal;
  cashBalance: Prisma.Decimal;
  currency: string;
};

export type PaperSymbolQuote = {
  symbolId: string;
  ticker: string;
  latestClose: Prisma.Decimal | null;
};

export type PaperPositionState = {
  id: string;
  quantity: Prisma.Decimal;
  averageCost: Prisma.Decimal;
  realizedPnl: Prisma.Decimal;
};

export type PaperOrderState = {
  id: string;
  status: PaperOrderStatus;
};

export type PaperOrderListRow = {
  id: string;
  symbol: string;
  side: PaperOrderSide;
  type: 'MARKET';
  status: PaperOrderStatus;
  quantity: Prisma.Decimal;
  requestedAt: Date;
  filledAt: Date | null;
  canceledAt: Date | null;
};

export type PaperOrderListFilters = {
  symbol?: string;
  status?: PaperOrderStatus;
  limit?: number;
  offset?: number;
};

export type PaperPositionListRow = {
  symbolId: string;
  symbol: string;
  quantity: Prisma.Decimal;
  averageCost: Prisma.Decimal;
  realizedPnl: Prisma.Decimal;
  updatedAt: Date;
};

export type LatestPriceRow = {
  symbolId: string;
  close: Prisma.Decimal;
  date: Date;
};

@Injectable()
export class PaperTradingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateDefaultAccount(): Promise<PaperAccountState> {
    const defaultUserId = await this.getOrCreateUserIdByEmail(DEFAULT_USER_EMAIL);
    const existing = await this.prisma.paperAccount.findUnique({
      where: { id: DEFAULT_ACCOUNT_ID },
      select: {
        id: true,
        userId: true,
        startingCash: true,
        cashBalance: true,
        currency: true,
      },
    });
    if (existing) {
      if (!existing.userId) {
        await this.prisma.paperAccount.update({
          where: { id: existing.id },
          data: { userId: defaultUserId },
        });
      }
      return existing;
    }

    try {
      return await this.prisma.paperAccount.create({
        data: {
          id: DEFAULT_ACCOUNT_ID,
          userId: defaultUserId,
          startingCash: DEFAULT_STARTING_CASH,
          cashBalance: DEFAULT_STARTING_CASH,
          currency: DEFAULT_CURRENCY,
        },
        select: {
          id: true,
          startingCash: true,
          cashBalance: true,
          currency: true,
        },
      });
    } catch {
      const resolved = await this.prisma.paperAccount.findUnique({
        where: { id: DEFAULT_ACCOUNT_ID },
        select: {
          id: true,
          userId: true,
          startingCash: true,
          cashBalance: true,
          currency: true,
        },
      });
      if (!resolved) {
        throw new Error('Failed to resolve default paper account.');
      }
      if (!resolved.userId) {
        await this.prisma.paperAccount.update({
          where: { id: resolved.id },
          data: { userId: defaultUserId },
        });
      }
      return resolved;
    }
  }

  async getOrCreateAccountForUserEmail(
    userEmail: string,
  ): Promise<PaperAccountState> {
    const normalizedEmail = userEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      return this.getOrCreateDefaultAccount();
    }

    const userId = await this.getOrCreateUserIdByEmail(normalizedEmail);
    const existing = await this.prisma.paperAccount.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        startingCash: true,
        cashBalance: true,
        currency: true,
      },
    });
    if (existing) {
      return existing;
    }

    return this.prisma.paperAccount.create({
      data: {
        userId,
        startingCash: DEFAULT_STARTING_CASH,
        cashBalance: DEFAULT_STARTING_CASH,
        currency: DEFAULT_CURRENCY,
      },
      select: {
        id: true,
        startingCash: true,
        cashBalance: true,
        currency: true,
      },
    });
  }

  private async getOrCreateUserIdByEmail(email: string): Promise<string> {
    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      return existing.id;
    }

    try {
      const created = await this.prisma.user.create({
        data: {
          email,
          displayName:
            email === DEFAULT_USER_EMAIL
              ? DEFAULT_USER_DISPLAY_NAME
              : email.split('@')[0] ?? 'Paper User',
        },
        select: { id: true },
      });
      return created.id;
    } catch {
      const resolved = await this.prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (!resolved) {
        throw new Error(`Failed to resolve user for paper account: ${email}`);
      }
      return resolved.id;
    }
  }

  async findSymbolQuote(ticker: string): Promise<PaperSymbolQuote | null> {
    const symbol = await this.prisma.symbol.findUnique({
      where: { ticker },
      select: {
        id: true,
        ticker: true,
        dailyPrices: {
          orderBy: { date: 'desc' },
          take: 1,
          select: { close: true },
        },
      },
    });
    if (!symbol) {
      return null;
    }

    return {
      symbolId: symbol.id,
      ticker: symbol.ticker,
      latestClose: symbol.dailyPrices[0]?.close ?? null,
    };
  }

  async findPosition(
    accountId: string,
    symbolId: string,
  ): Promise<PaperPositionState | null> {
    return this.prisma.paperPosition.findUnique({
      where: { accountId_symbolId: { accountId, symbolId } },
      select: {
        id: true,
        quantity: true,
        averageCost: true,
        realizedPnl: true,
      },
    });
  }

  async createFilledOrder(params: {
    accountId: string;
    symbolId: string;
    side: PaperOrderSide;
    quantity: Prisma.Decimal;
    price: Prisma.Decimal;
    notional: Prisma.Decimal;
  }): Promise<{ orderId: string; filledAt: Date }> {
    return this.prisma.$transaction(async (tx) => {
      const filledAt = new Date();
      const order = await tx.paperOrder.create({
        data: {
          accountId: params.accountId,
          symbolId: params.symbolId,
          side: params.side,
          type: 'MARKET',
          status: 'FILLED',
          quantity: params.quantity,
          requestedAt: filledAt,
          filledAt,
        },
        select: { id: true },
      });

      await tx.paperFill.create({
        data: {
          accountId: params.accountId,
          orderId: order.id,
          symbolId: params.symbolId,
          side: params.side,
          quantity: params.quantity,
          price: params.price,
          notional: params.notional,
          filledAt,
        },
      });

      return { orderId: order.id, filledAt };
    });
  }

  async updateAccountCash(
    accountId: string,
    nextCashBalance: Prisma.Decimal,
  ): Promise<void> {
    await this.prisma.paperAccount.update({
      where: { id: accountId },
      data: { cashBalance: nextCashBalance },
    });
  }

  async upsertPosition(params: {
    accountId: string;
    symbolId: string;
    quantity: Prisma.Decimal;
    averageCost: Prisma.Decimal;
    realizedPnl: Prisma.Decimal;
  }): Promise<void> {
    await this.prisma.paperPosition.upsert({
      where: {
        accountId_symbolId: {
          accountId: params.accountId,
          symbolId: params.symbolId,
        },
      },
      create: {
        accountId: params.accountId,
        symbolId: params.symbolId,
        quantity: params.quantity,
        averageCost: params.averageCost,
        realizedPnl: params.realizedPnl,
      },
      update: {
        quantity: params.quantity,
        averageCost: params.averageCost,
        realizedPnl: params.realizedPnl,
      },
    });
  }

  async findOrderForAccount(
    accountId: string,
    orderId: string,
  ): Promise<PaperOrderState | null> {
    return this.prisma.paperOrder.findUnique({
      where: { id: orderId, accountId },
      select: { id: true, status: true },
    });
  }

  async cancelNewOrderForAccount(
    accountId: string,
    orderId: string,
  ): Promise<boolean> {
    const result = await this.prisma.paperOrder.updateMany({
      where: { id: orderId, accountId, status: 'NEW' },
      data: { status: 'CANCELED', canceledAt: new Date() },
    });
    return result.count > 0;
  }

  async listOrders(
    accountId: string,
    filters: PaperOrderListFilters = {},
  ): Promise<PaperOrderListRow[]> {
    const rows = await this.prisma.paperOrder.findMany({
      where: {
        accountId,
        status: filters.status,
        symbol: filters.symbol
          ? { ticker: filters.symbol.toUpperCase() }
          : undefined,
      },
      orderBy: { requestedAt: 'desc' },
      take: filters.limit,
      skip: filters.offset ?? 0,
      select: {
        id: true,
        side: true,
        type: true,
        status: true,
        quantity: true,
        requestedAt: true,
        filledAt: true,
        canceledAt: true,
        symbol: { select: { ticker: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      symbol: row.symbol.ticker,
      side: row.side,
      type: row.type,
      status: row.status,
      quantity: row.quantity,
      requestedAt: row.requestedAt,
      filledAt: row.filledAt,
      canceledAt: row.canceledAt,
    }));
  }

  async listPositions(accountId: string): Promise<PaperPositionListRow[]> {
    const rows = await this.prisma.paperPosition.findMany({
      where: { accountId },
      orderBy: { updatedAt: 'desc' },
      select: {
        symbolId: true,
        quantity: true,
        averageCost: true,
        realizedPnl: true,
        updatedAt: true,
        symbol: { select: { ticker: true } },
      },
    });

    return rows.map((row) => ({
      symbolId: row.symbolId,
      symbol: row.symbol.ticker,
      quantity: row.quantity,
      averageCost: row.averageCost,
      realizedPnl: row.realizedPnl,
      updatedAt: row.updatedAt,
    }));
  }

  async findLatestPricesForSymbols(
    symbolIds: string[],
  ): Promise<Record<string, LatestPriceRow>> {
    if (symbolIds.length === 0) {
      return {};
    }

    const rows = await this.prisma.dailyPrice.findMany({
      where: { symbolId: { in: symbolIds } },
      orderBy: [{ symbolId: 'asc' }, { date: 'desc' }],
      select: {
        symbolId: true,
        close: true,
        date: true,
      },
    });

    const latestBySymbol: Record<string, LatestPriceRow> = {};
    for (const row of rows) {
      if (!latestBySymbol[row.symbolId]) {
        latestBySymbol[row.symbolId] = {
          symbolId: row.symbolId,
          close: row.close,
          date: row.date,
        };
      }
    }

    return latestBySymbol;
  }
}
