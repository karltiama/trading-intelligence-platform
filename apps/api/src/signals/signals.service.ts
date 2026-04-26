import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SignalStatus, StrategyName } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { scoreTrendPullback } from './signal-scoring';

export type SignalListFilters = {
  status?: SignalStatus;
  strategyName?: StrategyName;
  symbol?: string;
};

type SignalRow = {
  id: string;
  symbol: string;
  strategyName: StrategyName;
  status: SignalStatus;
  confidence: number | null;
  entryPrice: number | null;
  stopLoss: number | null;
  targetPrice: number | null;
  riskReward: number | null;
  timeHorizon: string | null;
  reason: string;
  signalDate: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ScanSummary = {
  strategyName: StrategyName;
  scannedSymbols: number;
  qualifiedSignals: number;
  upsertedSignals: number;
  expiredSignals: number;
  skippedSymbols: number;
  asOf: string;
};

@Injectable()
export class SignalsService {
  constructor(private readonly prisma: PrismaService) {}

  async scanTrendPullbackSignals(): Promise<ScanSummary> {
    const strategyName = StrategyName.TREND_PULLBACK;

    const symbols = await this.prisma.symbol.findMany({
      where: { isActive: true },
      orderBy: { ticker: 'asc' },
      select: {
        id: true,
        ticker: true,
        dailyPrices: {
          orderBy: { date: 'asc' },
          take: 260,
          select: {
            date: true,
            close: true,
            low: true,
            high: true,
            volume: true,
          },
        },
      },
    });

    let qualifiedSignals = 0;
    let upsertedSignals = 0;
    let skippedSymbols = 0;
    const activeKeys = new Set<string>();
    const now = new Date();

    for (const symbol of symbols) {
      if (symbol.dailyPrices.length < 200) {
        skippedSymbols += 1;
        continue;
      }

      const closes = symbol.dailyPrices.map((bar) => Number(bar.close));
      const volumes = symbol.dailyPrices.map((bar) => Number(bar.volume));
      const latestBar = symbol.dailyPrices[symbol.dailyPrices.length - 1];
      const score = scoreTrendPullback({
        closes,
        volumes,
        latestHigh: Number(latestBar.high),
        latestLow: Number(latestBar.low),
      });

      if (!score.isValid) {
        continue;
      }

      qualifiedSignals += 1;
      const signalDate = new Date(latestBar.date);
      signalDate.setUTCHours(0, 0, 0, 0);
      const datePart = signalDate.toISOString().slice(0, 10);
      const signalKey = `${symbol.ticker}|${strategyName}|${datePart}`;
      activeKeys.add(signalKey);
      const expiresAt = new Date(signalDate);
      expiresAt.setUTCDate(expiresAt.getUTCDate() + 10);

      await this.prisma.signal.upsert({
        where: { signalKey },
        create: {
          symbolId: symbol.id,
          strategyName,
          status: SignalStatus.ACTIVE,
          signalKey,
          signalDate,
          confidence: score.confidence,
          entryPrice:
            score.entryPrice === null ? null : new Prisma.Decimal(score.entryPrice),
          stopLoss: score.stopLoss === null ? null : new Prisma.Decimal(score.stopLoss),
          targetPrice:
            score.targetPrice === null ? null : new Prisma.Decimal(score.targetPrice),
          riskReward:
            score.riskReward === null ? null : new Prisma.Decimal(score.riskReward),
          timeHorizon: score.timeHorizon,
          reason: score.reason,
          expiresAt,
        },
        update: {
          status: SignalStatus.ACTIVE,
          confidence: score.confidence,
          entryPrice:
            score.entryPrice === null ? null : new Prisma.Decimal(score.entryPrice),
          stopLoss: score.stopLoss === null ? null : new Prisma.Decimal(score.stopLoss),
          targetPrice:
            score.targetPrice === null ? null : new Prisma.Decimal(score.targetPrice),
          riskReward:
            score.riskReward === null ? null : new Prisma.Decimal(score.riskReward),
          timeHorizon: score.timeHorizon,
          reason: score.reason,
          expiresAt,
          updatedAt: now,
        },
      });
      upsertedSignals += 1;
    }

    const activeRows = await this.prisma.signal.findMany({
      where: {
        strategyName,
        status: SignalStatus.ACTIVE,
      },
      select: {
        id: true,
        signalKey: true,
      },
    });

    const toExpire = activeRows
      .filter((row) => !activeKeys.has(row.signalKey))
      .map((row) => row.id);

    let expiredSignals = 0;
    if (toExpire.length > 0) {
      const result = await this.prisma.signal.updateMany({
        where: { id: { in: toExpire } },
        data: {
          status: SignalStatus.EXPIRED,
          updatedAt: now,
        },
      });
      expiredSignals = result.count;
    }

    return {
      strategyName,
      scannedSymbols: symbols.length,
      qualifiedSignals,
      upsertedSignals,
      expiredSignals,
      skippedSymbols,
      asOf: now.toISOString(),
    };
  }

  async list(filters: SignalListFilters = {}): Promise<SignalRow[]> {
    const rows = await this.prisma.signal.findMany({
      where: {
        status: filters.status,
        strategyName: filters.strategyName,
        symbol: filters.symbol
          ? { ticker: filters.symbol.trim().toUpperCase() }
          : undefined,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        symbol: {
          select: {
            ticker: true,
          },
        },
      },
      take: 200,
    });
    return rows.map((row) => this.toSignalRow(row));
  }

  async getById(id: string): Promise<SignalRow> {
    const row = await this.prisma.signal.findUnique({
      where: { id },
      include: {
        symbol: {
          select: {
            ticker: true,
          },
        },
      },
    });
    if (!row) {
      throw new NotFoundException(`Signal not found: ${id}`);
    }
    return this.toSignalRow(row);
  }

  private toSignalRow(row: {
    id: string;
    strategyName: StrategyName;
    status: SignalStatus;
    confidence: number | null;
    entryPrice: Prisma.Decimal | null;
    stopLoss: Prisma.Decimal | null;
    targetPrice: Prisma.Decimal | null;
    riskReward: Prisma.Decimal | null;
    timeHorizon: string | null;
    reason: string;
    signalDate: Date;
    expiresAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    symbol: { ticker: string };
  }): SignalRow {
    return {
      id: row.id,
      symbol: row.symbol.ticker,
      strategyName: row.strategyName,
      status: row.status,
      confidence: row.confidence,
      entryPrice: row.entryPrice ? Number(row.entryPrice) : null,
      stopLoss: row.stopLoss ? Number(row.stopLoss) : null,
      targetPrice: row.targetPrice ? Number(row.targetPrice) : null,
      riskReward: row.riskReward ? Number(row.riskReward) : null,
      timeHorizon: row.timeHorizon,
      reason: row.reason,
      signalDate: row.signalDate.toISOString(),
      expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
