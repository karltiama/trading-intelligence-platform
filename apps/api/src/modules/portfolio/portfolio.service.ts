import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MarketDataRepository } from '../market-data/market-data.repository';
import { MarketDataService } from '../market-data/market-data.service';
import type { MarkPriceSource } from '../market-data/mark-price.util';
import { PaperTradingRepository } from '../paper-trading/paper-trading.repository';

export type PortfolioPositionRow = {
  userEmail: string;
  symbol: string;
  quantity: number;
  averageCost: number;
  costBasis: number | null;
  currentPrice: number | null;
  marketValue: number | null;
  unrealizedPnl: number | null;
  pctGain: number | null;
  weightPct: number | null;
  daysHeld: number | null;
  realizedPnl: number;
  stopLossPrice: number | null;
  takeProfitPrice: number | null;
  pctToStop: number | null;
  pctToTarget: number | null;
  linkedOrderId: string | null;
  priceSource: MarkPriceSource | null;
  asOf: string | null;
};

export type PortfolioSummary = {
  userEmail: string;
  currency: string;
  startingCash: number;
  cashBalance: number;
  positionsValue: number;
  totalEquity: number;
  totalReturn: number;
  totalReturnPct: number | null;
  cashPct: number | null;
  investedPct: number | null;
  positionCount: number;
  positionsWithoutStop: number;
  unrealizedPnl: number;
  realizedPnl: number;
  asOf: string | null;
};

export type PortfolioSnapshotRow = {
  asOf: string;
  cashBalance: number;
  positionsValue: number;
  totalEquity: number;
  unrealizedPnl: number;
  realizedPnl: number;
};

export type PortfolioView = {
  summary: PortfolioSummary;
  positions: PortfolioPositionRow[];
};

type PortfolioComputation = PortfolioView & {
  accountId: string;
  snapshotDecimals: {
    cashBalance: Prisma.Decimal;
    positionsValue: Prisma.Decimal;
    totalEquity: Prisma.Decimal;
    unrealizedPnl: Prisma.Decimal;
    realizedPnl: Prisma.Decimal;
    asOf: Date | null;
  };
};

@Injectable()
export class PortfolioService {
  constructor(
    private readonly paperTradingRepository: PaperTradingRepository,
    private readonly marketDataService: MarketDataService,
    private readonly marketDataRepository: MarketDataRepository,
  ) {}

  async getPortfolio(
    userEmail: string,
    accountId?: string,
  ): Promise<PortfolioView> {
    const computed = await this.computePortfolioView(userEmail, accountId);
    await this.paperTradingRepository.upsertSnapshotForUtcDay(
      computed.accountId,
      {
        cashBalance: computed.snapshotDecimals.cashBalance,
        positionsValue: computed.snapshotDecimals.positionsValue,
        totalEquity: computed.snapshotDecimals.totalEquity,
        unrealizedPnl: computed.snapshotDecimals.unrealizedPnl,
        realizedPnl: computed.snapshotDecimals.realizedPnl,
        asOf: computed.snapshotDecimals.asOf ?? undefined,
      },
    );

    return {
      summary: computed.summary,
      positions: computed.positions,
    };
  }

  async getHistory(
    userEmail: string,
    accountId?: string,
    limit = 30,
  ): Promise<PortfolioSnapshotRow[]> {
    const account = await this.resolveAccountOrThrow(userEmail, accountId);
    const rows = await this.paperTradingRepository.listAccountSnapshots(
      account.id,
      limit,
    );

    return rows.map((row) => ({
      asOf: row.asOf.toISOString(),
      cashBalance: row.cashBalance.toNumber(),
      positionsValue: row.positionsValue.toNumber(),
      totalEquity: row.totalEquity.toNumber(),
      unrealizedPnl: row.unrealizedPnl.toNumber(),
      realizedPnl: row.realizedPnl.toNumber(),
    }));
  }

  async getPositions(
    userEmail: string,
    accountId?: string,
  ): Promise<PortfolioPositionRow[]> {
    const computed = await this.computePortfolioView(userEmail, accountId);
    return computed.positions;
  }

  async getSummary(
    userEmail: string,
    accountId?: string,
  ): Promise<PortfolioSummary> {
    const computed = await this.computePortfolioView(userEmail, accountId);
    return computed.summary;
  }

  private async resolveAccountOrThrow(
    userEmail: string,
    accountId?: string,
  ): Promise<{
    id: string;
    startingCash: Prisma.Decimal;
    cashBalance: Prisma.Decimal;
    currency: string;
  }> {
    const account = await this.paperTradingRepository.resolveAccountForUser({
      userEmail,
      accountId,
    });
    if (!account) {
      throw new NotFoundException(
        accountId
          ? `Paper account not found for current user: ${accountId}`
          : 'Paper account not found for current user.',
      );
    }
    return account;
  }

  private async computePortfolioView(
    userEmail: string,
    accountId?: string,
  ): Promise<PortfolioComputation> {
    const account = await this.resolveAccountOrThrow(userEmail, accountId);
    const positions = await this.paperTradingRepository.listPositions(
      account.id,
    );
    const openPositions = positions.filter((position) =>
      position.quantity.gt(0),
    );

    await this.marketDataService.ensureHourlyBarsForSymbols(
      openPositions.map((position) => position.symbol),
    );

    const latestPrices =
      await this.marketDataRepository.findLatestMarkPricesForSymbols(
        openPositions.map((position) => position.symbolId),
      );
    const latestOrders =
      await this.paperTradingRepository.findLatestFilledBuyOrdersForSymbols(
        account.id,
        openPositions.map((position) => position.symbolId),
      );

    let positionsValue = new Prisma.Decimal(0);
    let unrealizedPnl = new Prisma.Decimal(0);
    let realizedPnl = new Prisma.Decimal(0);
    let asOf: Date | null = null;
    let positionsWithoutStop = 0;

    for (const position of positions) {
      realizedPnl = realizedPnl.add(position.realizedPnl);
    }

    const nowMs = Date.now();
    const positionRows: PortfolioPositionRow[] = openPositions.map(
      (position) => {
        const latest = latestPrices[position.symbolId];
        const orderLevels = latestOrders[position.symbolId];
        const averageCost = position.averageCost.toNumber();
        const quantity = position.quantity.toNumber();
        const costBasis = position.averageCost.mul(position.quantity);
        const stopLossPrice = orderLevels?.stopLossPrice ?? null;
        const takeProfitPrice = orderLevels?.takeProfitPrice ?? null;

        if (stopLossPrice === null) {
          positionsWithoutStop += 1;
        }

        if (!latest) {
          return {
            userEmail,
            symbol: position.symbol,
            quantity,
            averageCost,
            costBasis: costBasis.toNumber(),
            currentPrice: null,
            marketValue: null,
            unrealizedPnl: null,
            pctGain: null,
            weightPct: null,
            daysHeld: this.daysHeld(position.openedAt, nowMs),
            realizedPnl: position.realizedPnl.toNumber(),
            stopLossPrice,
            takeProfitPrice,
            pctToStop: null,
            pctToTarget: null,
            linkedOrderId: orderLevels?.orderId ?? null,
            priceSource: null,
            asOf: null,
          };
        }

        const currentPrice = latest.close.toNumber();
        const marketValue = latest.close.mul(position.quantity);
        const unrealized = marketValue.sub(costBasis);

        positionsValue = positionsValue.add(marketValue);
        unrealizedPnl = unrealizedPnl.add(unrealized);

        if (!asOf || latest.asOf > asOf) {
          asOf = latest.asOf;
        }

        return {
          userEmail,
          symbol: position.symbol,
          quantity,
          averageCost,
          costBasis: costBasis.toNumber(),
          currentPrice,
          marketValue: marketValue.toNumber(),
          unrealizedPnl: unrealized.toNumber(),
          pctGain:
            averageCost > 0
              ? ((currentPrice - averageCost) / averageCost) * 100
              : null,
          weightPct: null,
          daysHeld: this.daysHeld(position.openedAt, nowMs),
          realizedPnl: position.realizedPnl.toNumber(),
          stopLossPrice,
          takeProfitPrice,
          pctToStop: this.pctDistanceAbove(stopLossPrice, currentPrice),
          pctToTarget: this.pctDistanceToTarget(takeProfitPrice, currentPrice),
          linkedOrderId: orderLevels?.orderId ?? null,
          priceSource: latest.source,
          asOf: latest.asOf.toISOString(),
        };
      },
    );

    const totalEquity = account.cashBalance.add(positionsValue);
    const startingCash = account.startingCash.toNumber();
    const totalEquityNumber = totalEquity.toNumber();
    const totalReturn = totalEquityNumber - startingCash;

    const positionsWithWeights = positionRows.map((position) => ({
      ...position,
      weightPct:
        position.marketValue !== null && totalEquityNumber > 0
          ? (position.marketValue / totalEquityNumber) * 100
          : null,
    }));

    return {
      accountId: account.id,
      summary: {
        userEmail,
        currency: account.currency,
        startingCash,
        cashBalance: account.cashBalance.toNumber(),
        positionsValue: positionsValue.toNumber(),
        totalEquity: totalEquityNumber,
        totalReturn,
        totalReturnPct:
          startingCash > 0 ? (totalReturn / startingCash) * 100 : null,
        cashPct:
          totalEquityNumber > 0
            ? (account.cashBalance.toNumber() / totalEquityNumber) * 100
            : null,
        investedPct:
          totalEquityNumber > 0
            ? (positionsValue.toNumber() / totalEquityNumber) * 100
            : null,
        positionCount: openPositions.length,
        positionsWithoutStop,
        unrealizedPnl: unrealizedPnl.toNumber(),
        realizedPnl: realizedPnl.toNumber(),
        asOf: asOf?.toISOString() ?? null,
      },
      positions: positionsWithWeights,
      snapshotDecimals: {
        cashBalance: account.cashBalance,
        positionsValue,
        totalEquity,
        unrealizedPnl,
        realizedPnl,
        asOf,
      },
    };
  }

  private daysHeld(openedAt: Date, nowMs: number): number {
    const diffMs = nowMs - openedAt.getTime();
    return Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
  }

  private pctDistanceAbove(
    floorPrice: number | null,
    currentPrice: number,
  ): number | null {
    if (floorPrice === null || currentPrice <= 0) {
      return null;
    }
    return ((currentPrice - floorPrice) / currentPrice) * 100;
  }

  private pctDistanceToTarget(
    targetPrice: number | null,
    currentPrice: number,
  ): number | null {
    if (targetPrice === null || currentPrice <= 0) {
      return null;
    }
    return ((targetPrice - currentPrice) / currentPrice) * 100;
  }
}
