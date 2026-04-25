import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type DailyBarWrite = {
  date: Date;
  open: Prisma.Decimal;
  high: Prisma.Decimal;
  low: Prisma.Decimal;
  close: Prisma.Decimal;
  volume: Prisma.Decimal;
  source: string;
};

export type SymbolLatestBars = {
  ticker: string;
  latestClose: Prisma.Decimal;
  latestVolume: Prisma.Decimal;
  previousClose: Prisma.Decimal | null;
};

export type TrackedSymbol = {
  ticker: string;
  name: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class MarketDataRepository {
  constructor(private readonly prisma: PrismaService) {}

  async seedDefaultSymbols(tickers: readonly string[]): Promise<void> {
    if (tickers.length === 0) {
      return;
    }

    await this.prisma.$transaction(
      tickers.map((ticker) =>
        this.prisma.symbol.upsert({
          where: { ticker },
          create: { ticker, isActive: true },
          update: {},
        }),
      ),
    );
  }

  async findActiveSymbols(): Promise<Array<{ id: string; ticker: string }>> {
    return this.prisma.symbol.findMany({
      where: { isActive: true },
      orderBy: { ticker: 'asc' },
      select: { id: true, ticker: true },
    });
  }

  async listTrackedSymbols(): Promise<TrackedSymbol[]> {
    return this.prisma.symbol.findMany({
      orderBy: { ticker: 'asc' },
      select: {
        ticker: true,
        name: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async createTrackedSymbol(
    ticker: string,
    name?: string,
  ): Promise<TrackedSymbol> {
    return this.prisma.symbol.upsert({
      where: { ticker },
      create: {
        ticker,
        name,
        isActive: true,
      },
      update: {
        name: name ?? undefined,
        isActive: true,
      },
      select: {
        ticker: true,
        name: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async toggleSymbolActive(ticker: string): Promise<TrackedSymbol | null> {
    const existing = await this.prisma.symbol.findUnique({
      where: { ticker },
      select: { isActive: true },
    });
    if (!existing) {
      return null;
    }

    return this.prisma.symbol.update({
      where: { ticker },
      data: { isActive: !existing.isActive },
      select: {
        ticker: true,
        name: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findOrCreateSymbolByTicker(ticker: string): Promise<{ id: string }> {
    const row = await this.prisma.symbol.upsert({
      where: { ticker },
      create: { ticker, isActive: true },
      update: {},
      select: { id: true },
    });
    return row;
  }

  async upsertDailyBars(
    symbolId: string,
    bars: DailyBarWrite[],
  ): Promise<void> {
    if (bars.length === 0) {
      return;
    }

    await this.prisma.$transaction(
      bars.map((bar) =>
        this.prisma.dailyPrice.upsert({
          where: {
            symbolId_date: {
              symbolId,
              date: bar.date,
            },
          },
          create: {
            symbolId,
            date: bar.date,
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            volume: bar.volume,
            source: bar.source,
          },
          update: {
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            volume: bar.volume,
            source: bar.source,
          },
        }),
      ),
    );
  }

  /**
   * Latest up to two daily rows per symbol within the lookback window (DB only).
   */
  async findLatestBarsPerSymbol(
    lookbackDays = 450,
  ): Promise<SymbolLatestBars[]> {
    const cutoff = new Date();
    cutoff.setUTCHours(0, 0, 0, 0);
    cutoff.setUTCDate(cutoff.getUTCDate() - lookbackDays);

    const rows = await this.prisma.dailyPrice.findMany({
      where: { date: { gte: cutoff } },
      orderBy: [{ symbolId: 'asc' }, { date: 'desc' }],
      include: { symbol: { select: { ticker: true } } },
    });

    const bySymbol = new Map<
      string,
      {
        ticker: string;
        latestClose: Prisma.Decimal;
        latestVolume: Prisma.Decimal;
        previousClose: Prisma.Decimal | null;
      }
    >();

    for (const row of rows) {
      const existing = bySymbol.get(row.symbolId);
      if (!existing) {
        bySymbol.set(row.symbolId, {
          ticker: row.symbol.ticker,
          latestClose: row.close,
          latestVolume: row.volume,
          previousClose: null,
        });
        continue;
      }
      if (existing.previousClose === null) {
        bySymbol.set(row.symbolId, {
          ...existing,
          previousClose: row.close,
        });
      }
    }

    return Array.from(bySymbol.values()).sort((a, b) =>
      a.ticker.localeCompare(b.ticker),
    );
  }
}
