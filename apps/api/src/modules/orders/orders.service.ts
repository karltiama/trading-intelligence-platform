import { BadRequestException, Injectable } from '@nestjs/common';
import {
  PaperOrderSide,
  PaperOrderStatus,
  TradeSource,
  UniverseType,
} from '@prisma/client';
import { MarketDataRepository } from '../market-data/market-data.repository';
import { MarketDataService } from '../market-data/market-data.service';
import { PaperTradingRepository } from '../paper-trading/paper-trading.repository';
import { PaperTradingService } from '../paper-trading/paper-trading.service';

const MAX_RISK_PER_TRADE_PERCENT = 0.01;
const STOP_BUFFER_PERCENT = 0.005;
const DEFAULT_STOP_LOOKBACK = 20;
const MAX_SUGGESTED_STOP_DISTANCE_PERCENT = 0.08;

export type PlaceOrderInput = {
  symbol: string;
  side: PaperOrderSide;
  quantity: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
  source: TradeSource;
  signalId?: string;
  note?: string | null;
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
  source: TradeSource;
  note: string | null;
  stopLossPrice: number | null;
  takeProfitPrice: number | null;
  riskPerShare: number | null;
  totalRisk: number | null;
  riskPercent: number | null;
  riskRewardRatio: number | null;
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
  source: TradeSource;
  note: string | null;
  stopLossPrice: number | null;
  takeProfitPrice: number | null;
  fillPrice: number | null;
  symbolUniverseType: UniverseType;
  tradeRationale: {
    strategyName: string | null;
    reason: string;
    confidence: number | null;
    entryPrice: number | null;
    stopLoss: number | null;
    targetPrice: number | null;
  } | null;
};

export type StopSuggestion = {
  symbol: string;
  lookback: number;
  swingLow: number;
  suggestedStopLoss: number;
  referencePrice: number;
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
  constructor(
    private readonly paperTradingService: PaperTradingService,
    private readonly marketDataService: MarketDataService,
    private readonly marketDataRepository: MarketDataRepository,
    private readonly paperTradingRepository: PaperTradingRepository,
  ) {}

  async placeOrder(
    input: PlaceOrderInput,
    userEmail: string,
    accountId?: string,
  ): Promise<AttributedOrder> {
    const normalizedSymbol = input.symbol.trim().toUpperCase();
    const preparedInput: PlaceOrderInput = {
      ...input,
      symbol: normalizedSymbol,
    };
    if (preparedInput.source === 'MANUAL') {
      await this.ensureManualSymbolReady(normalizedSymbol);
    }
    const riskSnapshot = await this.validateRiskOrThrow(
      preparedInput,
      userEmail,
      accountId,
    );
    const placed = await this.paperTradingService.placeMarketOrder(
      preparedInput,
      userEmail,
      accountId,
    );
    if (preparedInput.source === 'MANUAL') {
      await this.marketDataRepository.touchSymbolLastSeenAt(normalizedSymbol);
    }
    return {
      userEmail,
      ...placed,
      riskPerShare: riskSnapshot?.riskPerShare ?? null,
      totalRisk: riskSnapshot?.totalRisk ?? null,
      riskPercent: riskSnapshot?.riskPercent ?? null,
      riskRewardRatio: riskSnapshot?.riskRewardRatio ?? null,
    };
  }

  async suggestStopLoss(
    symbol: string,
    lookback = DEFAULT_STOP_LOOKBACK,
  ): Promise<StopSuggestion> {
    const normalized = symbol.trim().toUpperCase();
    if (!normalized) {
      throw new BadRequestException('symbol is required.');
    }
    const effectiveLookback =
      Number.isFinite(lookback) && lookback >= 5 && lookback <= 100
        ? Math.floor(lookback)
        : DEFAULT_STOP_LOOKBACK;
    // Refresh bars first so suggestions are based on current market context, not stale DB rows.
    await this.marketDataService.syncDailyBars(
      normalized,
      Math.max(effectiveLookback + 10, 60),
    );
    const bars = await this.marketDataService.getBars(
      normalized,
      effectiveLookback + 1,
    );
    if (bars.length < 2) {
      throw new BadRequestException(
        `Not enough market data to suggest stop loss for ${normalized}.`,
      );
    }
    const recent = bars.slice(-effectiveLookback);
    const swingLow = recent.reduce(
      (min, bar) => Math.min(min, bar.low),
      recent[0].low,
    );
    const referencePrice = recent[recent.length - 1].close;
    const rawSuggestedStopLoss = swingLow * (1 - STOP_BUFFER_PERCENT);
    const cappedMinStopLoss =
      referencePrice * (1 - MAX_SUGGESTED_STOP_DISTANCE_PERCENT);
    const suggestedStopLoss = Math.max(rawSuggestedStopLoss, cappedMinStopLoss);
    return {
      symbol: normalized,
      lookback: effectiveLookback,
      swingLow,
      suggestedStopLoss,
      referencePrice,
    };
  }

  private async ensureManualSymbolReady(symbol: string): Promise<void> {
    const existing = await this.marketDataRepository.findSymbolByTicker(symbol);
    if (!existing) {
      throw new BadRequestException(
        `Symbol ${symbol} is not tracked. Add it first from tracked symbols.`,
      );
    }
    if (!existing.isActive) {
      throw new BadRequestException(
        `Symbol ${symbol} is inactive and cannot be traded.`,
      );
    }
    const bars = await this.marketDataService.getBars(symbol, 1);
    if (bars.length === 0) {
      await this.marketDataService.syncDailyBars(symbol, 30);
    }
  }

  private async validateRiskOrThrow(
    input: PlaceOrderInput,
    userEmail: string,
    accountId?: string,
  ): Promise<{
    riskPerShare: number;
    totalRisk: number;
    riskPercent: number;
    riskRewardRatio: number | null;
  } | null> {
    if (input.side !== 'BUY') {
      return null;
    }
    if (!Number.isFinite(input.stopLossPrice ?? Number.NaN)) {
      throw new BadRequestException(
        'stopLossPrice is required and must be a valid number for BUY orders.',
      );
    }
    if (
      input.takeProfitPrice !== undefined &&
      input.takeProfitPrice !== null &&
      !Number.isFinite(input.takeProfitPrice)
    ) {
      throw new BadRequestException(
        'takeProfitPrice must be a valid number when provided.',
      );
    }
    const mark = await this.marketDataService.resolveSymbolMarkPrice(
      input.symbol,
    );
    if (!mark) {
      throw new BadRequestException(
        `No reference price available for risk validation: ${input.symbol}`,
      );
    }
    const account = await this.paperTradingRepository.resolveAccountForUser({
      userEmail,
      accountId,
    });
    if (!account) {
      throw new BadRequestException(
        'paper account not found for current user.',
      );
    }
    const entryPrice = mark.close;
    const stopLossPrice = input.stopLossPrice as number;
    if (stopLossPrice >= entryPrice) {
      throw new BadRequestException(
        `stopLossPrice must be below reference price (${entryPrice.toFixed(2)}).`,
      );
    }
    const riskPerShare = entryPrice - stopLossPrice;
    const totalRisk = riskPerShare * input.quantity;
    if (totalRisk <= 0) {
      throw new BadRequestException('totalRisk must be greater than 0.');
    }
    const accountEquity = account.cashBalance.toNumber();
    if (accountEquity <= 0) {
      throw new BadRequestException('account equity must be greater than 0.');
    }
    const riskPercent = totalRisk / accountEquity;
    if (riskPercent > MAX_RISK_PER_TRADE_PERCENT) {
      throw new BadRequestException(
        `Risk per trade exceeds limit (${(MAX_RISK_PER_TRADE_PERCENT * 100).toFixed(2)}%).`,
      );
    }
    let riskRewardRatio: number | null = null;
    if (input.takeProfitPrice != null) {
      const rewardPerShare = input.takeProfitPrice - entryPrice;
      if (rewardPerShare > 0) {
        riskRewardRatio = rewardPerShare / riskPerShare;
      }
    }
    return {
      riskPerShare,
      totalRisk,
      riskPercent,
      riskRewardRatio,
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

  async updateOrderLevels(
    orderId: string,
    input: {
      stopLossPrice?: number;
      takeProfitPrice?: number;
    },
    userEmail: string,
    accountId?: string,
  ): Promise<{
    userEmail: string;
    orderId: string;
    stopLossPrice: number | null;
    takeProfitPrice: number | null;
  }> {
    const updated = await this.paperTradingService.updateOrderLevels(
      orderId,
      input,
      userEmail,
      accountId,
    );
    return {
      userEmail,
      ...updated,
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

  private encodeCursor(cursor: {
    requestedAt: string;
    orderId: string;
  }): string {
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
