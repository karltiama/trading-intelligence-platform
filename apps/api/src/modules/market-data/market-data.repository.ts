import { Injectable } from '@nestjs/common';
import { Prisma, UniverseType } from '@prisma/client';
import { H1_MAX_BARS_PER_SYMBOL, H1_TIMEFRAME } from './market-data-hourly.constants';
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
  latestDate: Date;
  latestClose: Prisma.Decimal;
  latestVolume: Prisma.Decimal;
  previousClose: Prisma.Decimal | null;
};

export type StoredDailyBar = {
  symbol: string;
  open: Prisma.Decimal;
  high: Prisma.Decimal;
  low: Prisma.Decimal;
  close: Prisma.Decimal;
  volume: Prisma.Decimal;
  date: Date;
};

export type HourlyBarWrite = {
  timestamp: Date;
  open: Prisma.Decimal;
  high: Prisma.Decimal;
  low: Prisma.Decimal;
  close: Prisma.Decimal;
  volume: Prisma.Decimal;
};

export type StoredHourlyBar = {
  symbol: string;
  open: Prisma.Decimal;
  high: Prisma.Decimal;
  low: Prisma.Decimal;
  close: Prisma.Decimal;
  volume: Prisma.Decimal;
  timestamp: Date;
};

export type TrackedSymbol = {
  id: string;
  ticker: string;
  name: string | null;
  isActive: boolean;
  universeType: UniverseType;
  lastSeenAt: Date | null;
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
          create: { ticker, isActive: true, universeType: 'CORE' },
          update: { isActive: true, universeType: 'CORE' },
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

  async findCoreSymbols(): Promise<Array<{ id: string; ticker: string }>> {
    return this.prisma.symbol.findMany({
      where: { isActive: true, universeType: 'CORE' },
      orderBy: { ticker: 'asc' },
      select: { id: true, ticker: true },
    });
  }

  async listTrackedSymbols(): Promise<TrackedSymbol[]> {
    return this.prisma.symbol.findMany({
      orderBy: { ticker: 'asc' },
      select: {
        id: true,
        ticker: true,
        name: true,
        isActive: true,
        universeType: true,
        lastSeenAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async createTrackedSymbol(
    ticker: string,
    name?: string,
    universeType: UniverseType = 'ON_DEMAND',
  ): Promise<TrackedSymbol> {
    return this.prisma.symbol.upsert({
      where: { ticker },
      create: {
        ticker,
        name,
        isActive: true,
        universeType,
        lastSeenAt: new Date(),
      },
      update: {
        name: name ?? undefined,
        isActive: true,
        universeType,
        lastSeenAt: new Date(),
      },
      select: {
        id: true,
        ticker: true,
        name: true,
        isActive: true,
        universeType: true,
        lastSeenAt: true,
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
        id: true,
        ticker: true,
        name: true,
        isActive: true,
        universeType: true,
        lastSeenAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findSymbolByTicker(ticker: string): Promise<{
    id: string;
    ticker: string;
    isActive: boolean;
    universeType: UniverseType;
    lastSeenAt: Date | null;
  } | null> {
    const normalizedTicker = ticker.trim().toUpperCase();
    if (!normalizedTicker) {
      return null;
    }
    return this.prisma.symbol.findUnique({
      where: { ticker: normalizedTicker },
      select: {
        id: true,
        ticker: true,
        isActive: true,
        universeType: true,
        lastSeenAt: true,
      },
    });
  }

  async touchSymbolLastSeenAt(ticker: string): Promise<void> {
    await this.prisma.symbol.update({
      where: { ticker },
      data: { lastSeenAt: new Date() },
    });
  }

  async getTrackedSymbolByTicker(
    ticker: string,
  ): Promise<TrackedSymbol | null> {
    return this.prisma.symbol.findUnique({
      where: { ticker },
      select: {
        id: true,
        ticker: true,
        name: true,
        isActive: true,
        universeType: true,
        lastSeenAt: true,
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
    for (const bar of bars) {
      await this.prisma.dailyPrice.upsert({
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
      });
    }
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
      where: {
        date: { gte: cutoff },
        symbol: { isActive: true },
      },
      orderBy: [{ symbolId: 'asc' }, { date: 'desc' }],
      include: { symbol: { select: { ticker: true } } },
    });

    const bySymbol = new Map<
      string,
      {
        ticker: string;
        latestDate: Date;
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
          latestDate: row.date,
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

  async findStoredDailyBarsByTicker(
    ticker: string,
    limit: number,
  ): Promise<StoredDailyBar[]> {
    const normalizedTicker = ticker.trim().toUpperCase();
    if (!normalizedTicker || limit < 1) {
      return [];
    }

    const rows = await this.prisma.dailyPrice.findMany({
      where: {
        symbol: {
          ticker: normalizedTicker,
        },
      },
      orderBy: { date: 'desc' },
      take: limit,
      select: {
        open: true,
        high: true,
        low: true,
        close: true,
        volume: true,
        date: true,
        symbol: {
          select: {
            ticker: true,
          },
        },
      },
    });

    return rows.map((row) => ({
      symbol: row.symbol.ticker,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
      date: row.date,
    }));
  }

  // --- H1 tactical cache (Candle only) ---
  // Intelligence layer (signals, market-state, dashboard) must NOT read/write this section.
  // Only timeframe H1; bounded by prune + trim in MarketDataService.syncHourlyBars.

  async upsertHourlyBars(
    symbolId: string,
    bars: HourlyBarWrite[],
  ): Promise<void> {
    if (bars.length === 0) {
      return;
    }
    for (const bar of bars) {
      await this.prisma.candle.upsert({
        where: {
          symbolId_timeframe_timestamp: {
            symbolId,
            timeframe: H1_TIMEFRAME,
            timestamp: bar.timestamp,
          },
        },
        create: {
          symbolId,
          timeframe: H1_TIMEFRAME,
          timestamp: bar.timestamp,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume,
        },
        update: {
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume,
        },
      });
    }
  }

  async latestHourlyTimestamp(symbolId: string): Promise<Date | null> {
    const row = await this.prisma.candle.findFirst({
      where: { symbolId, timeframe: H1_TIMEFRAME },
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true },
    });
    return row?.timestamp ?? null;
  }

  async pruneHourlyBars(symbolId: string, olderThan: Date): Promise<number> {
    const result = await this.prisma.candle.deleteMany({
      where: {
        symbolId,
        timeframe: H1_TIMEFRAME,
        timestamp: { lt: olderThan },
      },
    });
    return result.count;
  }

  async trimHourlyBarsToMax(symbolId: string, maxBars: number): Promise<number> {
    if (maxBars < 1) {
      return 0;
    }
    const rows = await this.prisma.candle.findMany({
      where: { symbolId, timeframe: H1_TIMEFRAME },
      orderBy: { timestamp: 'desc' },
      select: { id: true },
      skip: maxBars,
    });
    if (rows.length === 0) {
      return 0;
    }
    const result = await this.prisma.candle.deleteMany({
      where: { id: { in: rows.map((row) => row.id) } },
    });
    return result.count;
  }

  async findHourlyBarsByTicker(
    ticker: string,
    limit: number,
  ): Promise<StoredHourlyBar[]> {
    const normalizedTicker = ticker.trim().toUpperCase();
    if (!normalizedTicker || limit < 1) {
      return [];
    }

    const rows = await this.prisma.candle.findMany({
      where: {
        timeframe: H1_TIMEFRAME,
        symbol: { ticker: normalizedTicker },
      },
      orderBy: { timestamp: 'desc' },
      take: limit,
      select: {
        open: true,
        high: true,
        low: true,
        close: true,
        volume: true,
        timestamp: true,
        symbol: { select: { ticker: true } },
      },
    });

    return rows.map((row) => ({
      symbol: row.symbol.ticker,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
      timestamp: row.timestamp,
    }));
  }
}
