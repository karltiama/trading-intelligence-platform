import { Injectable } from '@nestjs/common';
import {
  PaperOrderSide,
  PaperOrderStatus,
  Prisma,
  TradeSource,
  UniverseType,
} from '@prisma/client';
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

export type ResolveAccountInput = {
  userEmail: string;
  accountId?: string;
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

export type OrderTradeRationale = {
  strategyName: string | null;
  reason: string;
  confidence: number | null;
  entryPrice: number | null;
  stopLoss: number | null;
  targetPrice: number | null;
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
  signalId: string | null;
  source: TradeSource;
  note: string | null;
  stopLossPrice: Prisma.Decimal | null;
  takeProfitPrice: Prisma.Decimal | null;
  fillPrice: Prisma.Decimal | null;
  symbolUniverseType: UniverseType;
  tradeRationale: OrderTradeRationale | null;
};

export type PaperOrderListFilters = {
  symbol?: string;
  signalId?: string;
  status?: PaperOrderStatus;
  limit?: number;
  offset?: number;
  cursorRequestedAt?: Date;
  cursorOrderId?: string;
};

export type PaperPositionListRow = {
  symbolId: string;
  symbol: string;
  quantity: Prisma.Decimal;
  averageCost: Prisma.Decimal;
  realizedPnl: Prisma.Decimal;
  openedAt: Date;
  updatedAt: Date;
};

export type PaperAccountSnapshotRow = {
  asOf: Date;
  cashBalance: Prisma.Decimal;
  positionsValue: Prisma.Decimal;
  totalEquity: Prisma.Decimal;
  unrealizedPnl: Prisma.Decimal;
  realizedPnl: Prisma.Decimal;
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
    const defaultUserId =
      await this.getOrCreateUserIdByEmail(DEFAULT_USER_EMAIL);
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

  async resolveAccountForUser(
    input: ResolveAccountInput,
  ): Promise<PaperAccountState | null> {
    const normalizedEmail = input.userEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      return null;
    }

    if (!input.accountId) {
      return this.getOrCreateAccountForUserEmail(normalizedEmail);
    }

    const userId = await this.getOrCreateUserIdByEmail(normalizedEmail);
    return this.prisma.paperAccount.findFirst({
      where: {
        id: input.accountId,
        userId,
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
              : (email.split('@')[0] ?? 'Paper User'),
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

  async findSignalSymbolLink(
    signalId: string,
  ): Promise<{ id: string; symbolId: string } | null> {
    return this.prisma.signal.findUnique({
      where: { id: signalId },
      select: { id: true, symbolId: true },
    });
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
    signalId?: string | null;
    source: TradeSource;
    note?: string | null;
    stopLossPrice?: Prisma.Decimal | null;
    takeProfitPrice?: Prisma.Decimal | null;
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
          signalId: params.signalId ?? null,
          source: params.source,
          note: params.note ?? null,
          stopLossPrice: params.stopLossPrice ?? null,
          takeProfitPrice: params.takeProfitPrice ?? null,
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

  async findOrderLevelsRow(
    accountId: string,
    orderId: string,
  ): Promise<{
    id: string;
    status: PaperOrderStatus;
    side: PaperOrderSide;
    symbolId: string;
    stopLossPrice: Prisma.Decimal | null;
    takeProfitPrice: Prisma.Decimal | null;
    fillPrice: Prisma.Decimal | null;
  } | null> {
    const row = await this.prisma.paperOrder.findFirst({
      where: { id: orderId, accountId },
      select: {
        id: true,
        status: true,
        side: true,
        symbolId: true,
        stopLossPrice: true,
        takeProfitPrice: true,
        fill: { select: { price: true } },
      },
    });
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      status: row.status,
      side: row.side,
      symbolId: row.symbolId,
      stopLossPrice: row.stopLossPrice,
      takeProfitPrice: row.takeProfitPrice,
      fillPrice: row.fill?.price ?? null,
    };
  }

  async updateFilledBuyOrderLevels(
    accountId: string,
    orderId: string,
    data: {
      stopLossPrice: Prisma.Decimal | null;
      takeProfitPrice: Prisma.Decimal | null;
    },
  ): Promise<boolean> {
    const result = await this.prisma.paperOrder.updateMany({
      where: {
        id: orderId,
        accountId,
        status: 'FILLED',
        side: 'BUY',
      },
      data: {
        stopLossPrice: data.stopLossPrice,
        takeProfitPrice: data.takeProfitPrice,
        updatedAt: new Date(),
      },
    });
    return result.count > 0;
  }

  async findLatestFilledBuyOrdersForSymbols(
    accountId: string,
    symbolIds: string[],
  ): Promise<
    Record<
      string,
      {
        orderId: string;
        stopLossPrice: number | null;
        takeProfitPrice: number | null;
      }
    >
  > {
    if (symbolIds.length === 0) {
      return {};
    }
    const rows = await this.prisma.paperOrder.findMany({
      where: {
        accountId,
        symbolId: { in: symbolIds },
        side: 'BUY',
        status: 'FILLED',
      },
      orderBy: [{ filledAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        symbolId: true,
        stopLossPrice: true,
        takeProfitPrice: true,
      },
    });

    const bySymbol: Record<
      string,
      {
        orderId: string;
        stopLossPrice: number | null;
        takeProfitPrice: number | null;
      }
    > = {};
    for (const row of rows) {
      if (bySymbol[row.symbolId]) {
        continue;
      }
      bySymbol[row.symbolId] = {
        orderId: row.id,
        stopLossPrice: row.stopLossPrice ? Number(row.stopLossPrice) : null,
        takeProfitPrice: row.takeProfitPrice
          ? Number(row.takeProfitPrice)
          : null,
      };
    }
    return bySymbol;
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
    const cursorWhere =
      filters.cursorRequestedAt && filters.cursorOrderId
        ? {
            OR: [
              { requestedAt: { lt: filters.cursorRequestedAt } },
              {
                requestedAt: filters.cursorRequestedAt,
                id: { lt: filters.cursorOrderId },
              },
            ],
          }
        : undefined;

    const rows = await this.prisma.paperOrder.findMany({
      where: {
        accountId,
        status: filters.status,
        signalId: filters.signalId?.trim() || undefined,
        symbol: filters.symbol
          ? { ticker: filters.symbol.toUpperCase() }
          : undefined,
        ...cursorWhere,
      },
      orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
      take: filters.limit,
      skip: filters.offset ?? 0,
      select: {
        id: true,
        signalId: true,
        source: true,
        note: true,
        stopLossPrice: true,
        takeProfitPrice: true,
        side: true,
        type: true,
        status: true,
        quantity: true,
        requestedAt: true,
        filledAt: true,
        canceledAt: true,
        symbol: { select: { ticker: true, universeType: true } },
        fill: { select: { price: true } },
        signal: {
          select: {
            strategyName: true,
            reason: true,
            confidence: true,
            entryPrice: true,
            stopLoss: true,
            targetPrice: true,
          },
        },
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
      signalId: row.signalId,
      source: row.source,
      note: row.note,
      stopLossPrice: row.stopLossPrice,
      takeProfitPrice: row.takeProfitPrice,
      fillPrice: row.fill?.price ?? null,
      symbolUniverseType: row.symbol.universeType,
      tradeRationale: this.toOrderTradeRationale(row.signal, row.note),
    }));
  }

  private toOrderTradeRationale(
    signal: {
      strategyName: string;
      reason: string;
      confidence: number | null;
      entryPrice: Prisma.Decimal | null;
      stopLoss: Prisma.Decimal | null;
      targetPrice: Prisma.Decimal | null;
    } | null,
    note: string | null,
  ): OrderTradeRationale | null {
    if (signal) {
      return {
        strategyName: signal.strategyName,
        reason: signal.reason,
        confidence: signal.confidence,
        entryPrice: signal.entryPrice ? Number(signal.entryPrice) : null,
        stopLoss: signal.stopLoss ? Number(signal.stopLoss) : null,
        targetPrice: signal.targetPrice ? Number(signal.targetPrice) : null,
      };
    }
    if (note?.trim()) {
      return {
        strategyName: null,
        reason: note.trim(),
        confidence: null,
        entryPrice: null,
        stopLoss: null,
        targetPrice: null,
      };
    }
    return null;
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
        openedAt: true,
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
      openedAt: row.openedAt,
      updatedAt: row.updatedAt,
    }));
  }

  async listAccountSnapshots(
    accountId: string,
    limit = 30,
  ): Promise<PaperAccountSnapshotRow[]> {
    const rows = await this.prisma.paperAccountSnapshot.findMany({
      where: { accountId },
      orderBy: { asOf: 'desc' },
      take: limit,
      select: {
        asOf: true,
        cashBalance: true,
        positionsValue: true,
        totalEquity: true,
        unrealizedPnl: true,
        realizedPnl: true,
      },
    });
    return rows;
  }

  async upsertSnapshotForUtcDay(
    accountId: string,
    snapshot: {
      cashBalance: Prisma.Decimal;
      positionsValue: Prisma.Decimal;
      totalEquity: Prisma.Decimal;
      unrealizedPnl: Prisma.Decimal;
      realizedPnl: Prisma.Decimal;
      asOf?: Date;
    },
  ): Promise<void> {
    const asOf = snapshot.asOf ?? new Date();
    const dayStart = new Date(asOf);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    const existing = await this.prisma.paperAccountSnapshot.findFirst({
      where: {
        accountId,
        asOf: { gte: dayStart, lt: dayEnd },
      },
      select: { id: true },
    });

    const data = {
      cashBalance: snapshot.cashBalance,
      positionsValue: snapshot.positionsValue,
      totalEquity: snapshot.totalEquity,
      unrealizedPnl: snapshot.unrealizedPnl,
      realizedPnl: snapshot.realizedPnl,
      asOf,
    };

    if (existing) {
      await this.prisma.paperAccountSnapshot.update({
        where: { id: existing.id },
        data,
      });
      return;
    }

    await this.prisma.paperAccountSnapshot.create({
      data: {
        accountId,
        ...data,
      },
    });
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
