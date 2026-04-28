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
  matches: ScannerScanRow[];
  watchlist: ScannerScanRow[];
  scanned: ScannerScanRow[];
  summary: {
    totalScanned: number;
    strongCount: number;
    watchlistCount: number;
    weakCount: number;
    ignoreCount: number;
  };
  asOf: string;
};

type ScannerScanRow = {
  symbol: string;
  grade: 'STRONG' | 'WATCHLIST' | 'WEAK' | 'IGNORE';
  totalScore: number;
  components: {
    trend: number;
    pullback: number;
    stochastic: number;
    volume: number;
    riskReward: number;
  };
  reasons: string[];
  confidence: number;
  entryPrice: number | null;
  stopLoss: number | null;
  targetPrice: number | null;
  riskReward: number | null;
  timeHorizon: string | null;
  signalDate: string | null;
  presentation: {
    grade: 'READY' | 'WATCHLIST' | 'NOT_READY';
    tags: string[];
    explanation: string;
  };
};

function toPresentation(input: {
  components: {
    trend: number;
    pullback: number;
    stochastic: number;
    volume: number;
    riskReward: number;
  };
}): {
  grade: 'READY' | 'WATCHLIST' | 'NOT_READY';
  tags: string[];
  explanation: string;
} {
  const tags: string[] = [];
  const { trend, pullback, stochastic, volume, riskReward } = input.components;

  if (trend >= 20) {
    tags.push('Strong Trend');
  } else if (trend > 0) {
    tags.push('Trend Building');
  } else {
    tags.push('Trend Weak');
  }

  if (pullback >= 15) {
    tags.push('Pullback In Zone');
  } else if (pullback > 0) {
    tags.push('Pullback Slightly Extended');
  } else {
    tags.push('No Pullback');
  }

  if (stochastic >= 15) {
    tags.push('Momentum Reset');
  } else if (stochastic > 0) {
    tags.push('Momentum Improving');
  } else {
    tags.push('Momentum Not Reset');
  }

  if (volume >= 15) {
    tags.push('Volume Confirmed');
  } else if (volume > 0) {
    tags.push('Volume Acceptable');
  } else {
    tags.push('Volume Light');
  }

  if (riskReward >= 12) {
    tags.push('Risk Profile Strong');
  } else if (riskReward > 0) {
    tags.push('Risk Profile Acceptable');
  } else {
    tags.push('Risk Profile Weak');
  }

  const goodComponents = [trend, pullback, stochastic, volume, riskReward].filter(
    (value) => value >= 15,
  ).length;
  const weakComponents = [trend, pullback, stochastic, volume, riskReward].filter(
    (value) => value === 0,
  ).length;

  const grade: 'READY' | 'WATCHLIST' | 'NOT_READY' =
    goodComponents >= 4
      ? 'READY'
      : goodComponents >= 2 && weakComponents <= 2
        ? 'WATCHLIST'
        : 'NOT_READY';

  const explanation =
    grade === 'READY'
      ? 'Setup quality is high across trend, pullback, momentum, volume, and risk profile.'
      : grade === 'WATCHLIST'
        ? 'Setup has partial alignment. Monitor for stronger pullback, momentum reset, or volume confirmation.'
        : 'Setup is not ready. Multiple core conditions are missing for a higher-conviction entry.';

  return { grade, tags, explanation };
}

@Injectable()
export class SignalsService {
  constructor(private readonly prisma: PrismaService) {}

  async scanTrendPullbackSignals(): Promise<ScanSummary> {
    const strategyName = StrategyName.TREND_PULLBACK;

    const symbols = await this.prisma.symbol.findMany({
      where: { isActive: true, universeType: 'CORE' },
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
    const scannedRows: ScannerScanRow[] = [];
    const activeKeys = new Set<string>();
    const now = new Date();

    for (const symbol of symbols) {
      if (symbol.dailyPrices.length < 200) {
        skippedSymbols += 1;
        scannedRows.push({
          symbol: symbol.ticker,
          grade: 'IGNORE',
          totalScore: 0,
          components: {
            trend: 0,
            pullback: 0,
            stochastic: 0,
            volume: 0,
            riskReward: 0,
          },
          reasons: ['Insufficient history: need at least 200 daily bars.'],
          confidence: 0,
          entryPrice: null,
          stopLoss: null,
          targetPrice: null,
          riskReward: null,
          timeHorizon: null,
          signalDate: null,
          presentation: {
            grade: 'NOT_READY',
            tags: ['Insufficient Data'],
            explanation:
              'Setup cannot be evaluated yet because historical data is insufficient.',
          },
        });
        continue;
      }

      const closes = symbol.dailyPrices.map((bar) => Number(bar.close));
      const volumes = symbol.dailyPrices.map((bar) => Number(bar.volume));
      const highs = symbol.dailyPrices.map((bar) => Number(bar.high));
      const lows = symbol.dailyPrices.map((bar) => Number(bar.low));
      const latestBar = symbol.dailyPrices[symbol.dailyPrices.length - 1];
      const score = scoreTrendPullback({
        closes,
        volumes,
        highs,
        lows,
      });
      const signalDate = new Date(latestBar.date);
      signalDate.setUTCHours(0, 0, 0, 0);
      scannedRows.push({
        symbol: symbol.ticker,
        grade: score.scannerScore.grade,
        totalScore: score.scannerScore.totalScore,
        components: score.scannerScore.components,
        reasons: score.reasons,
        confidence: score.confidence,
        entryPrice: score.entryPrice,
        stopLoss: score.stopLoss,
        targetPrice: score.targetPrice,
        riskReward: score.riskReward,
        timeHorizon: score.timeHorizon,
        signalDate: signalDate.toISOString(),
        presentation: toPresentation({ components: score.scannerScore.components }),
      });

      if (!score.isValid) {
        continue;
      }

      qualifiedSignals += 1;
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

    scannedRows.sort((a, b) => {
      if (b.totalScore !== a.totalScore) {
        return b.totalScore - a.totalScore;
      }
      return a.symbol.localeCompare(b.symbol);
    });
    const matches = scannedRows.filter((row) => row.grade === 'STRONG');
    const gradeWatchlist = scannedRows.filter((row) => row.grade === 'WATCHLIST');
    const watchlist =
      gradeWatchlist.length > 0
        ? gradeWatchlist
        : scannedRows.filter((row) => row.grade === 'WEAK').slice(0, 5);
    const weakCount = scannedRows.filter((row) => row.grade === 'WEAK').length;
    const ignoreCount = scannedRows.filter((row) => row.grade === 'IGNORE').length;

    return {
      strategyName,
      scannedSymbols: symbols.length,
      qualifiedSignals,
      upsertedSignals,
      expiredSignals,
      skippedSymbols,
      matches,
      watchlist,
      scanned: scannedRows,
      summary: {
        totalScanned: scannedRows.length,
        strongCount: matches.length,
        watchlistCount: watchlist.length,
        weakCount,
        ignoreCount,
      },
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
