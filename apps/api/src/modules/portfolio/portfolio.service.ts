import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaperTradingRepository } from '../paper-trading/paper-trading.repository';

export type PortfolioPositionRow = {
  symbol: string;
  quantity: number;
  averageCost: number;
  currentPrice: number | null;
  marketValue: number | null;
  unrealizedPnl: number | null;
  realizedPnl: number;
  asOf: string | null;
};

export type PortfolioSummary = {
  currency: string;
  cashBalance: number;
  positionsValue: number;
  totalEquity: number;
  unrealizedPnl: number;
  realizedPnl: number;
  asOf: string | null;
};

@Injectable()
export class PortfolioService {
  constructor(private readonly paperTradingRepository: PaperTradingRepository) {}

  async getPositions(): Promise<PortfolioPositionRow[]> {
    const account = await this.paperTradingRepository.getOrCreateDefaultAccount();
    const positions = await this.paperTradingRepository.listPositions(account.id);
    const latestPrices = await this.paperTradingRepository.findLatestPricesForSymbols(
      positions.map((p) => p.symbolId),
    );

    return positions.map((position) => {
      const latest = latestPrices[position.symbolId];
      if (!latest) {
        return {
          symbol: position.symbol,
          quantity: position.quantity.toNumber(),
          averageCost: position.averageCost.toNumber(),
          currentPrice: null,
          marketValue: null,
          unrealizedPnl: null,
          realizedPnl: position.realizedPnl.toNumber(),
          asOf: null,
        };
      }

      const marketValue = latest.close.mul(position.quantity);
      const costBasis = position.averageCost.mul(position.quantity);
      const unrealizedPnl = marketValue.sub(costBasis);

      return {
        symbol: position.symbol,
        quantity: position.quantity.toNumber(),
        averageCost: position.averageCost.toNumber(),
        currentPrice: latest.close.toNumber(),
        marketValue: marketValue.toNumber(),
        unrealizedPnl: unrealizedPnl.toNumber(),
        realizedPnl: position.realizedPnl.toNumber(),
        asOf: latest.date.toISOString(),
      };
    });
  }

  async getSummary(): Promise<PortfolioSummary> {
    const account = await this.paperTradingRepository.getOrCreateDefaultAccount();
    const positions = await this.paperTradingRepository.listPositions(account.id);
    const latestPrices = await this.paperTradingRepository.findLatestPricesForSymbols(
      positions.map((p) => p.symbolId),
    );

    let positionsValue = new Prisma.Decimal(0);
    let unrealizedPnl = new Prisma.Decimal(0);
    let realizedPnl = new Prisma.Decimal(0);
    let asOf: Date | null = null;

    for (const position of positions) {
      realizedPnl = realizedPnl.add(position.realizedPnl);
      const latest = latestPrices[position.symbolId];
      if (!latest) {
        continue;
      }

      const marketValue = latest.close.mul(position.quantity);
      const costBasis = position.averageCost.mul(position.quantity);
      positionsValue = positionsValue.add(marketValue);
      unrealizedPnl = unrealizedPnl.add(marketValue.sub(costBasis));

      if (!asOf || latest.date > asOf) {
        asOf = latest.date;
      }
    }

    return {
      currency: account.currency,
      cashBalance: account.cashBalance.toNumber(),
      positionsValue: positionsValue.toNumber(),
      totalEquity: account.cashBalance.add(positionsValue).toNumber(),
      unrealizedPnl: unrealizedPnl.toNumber(),
      realizedPnl: realizedPnl.toNumber(),
      asOf: asOf?.toISOString() ?? null,
    };
  }
}
