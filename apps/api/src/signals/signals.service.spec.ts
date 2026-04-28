import { SignalStatus, StrategyName } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SignalsService } from './signals.service';

describe('SignalsService', () => {
  function createPrismaMock() {
    return {
      symbol: {
        findMany: jest.fn(),
      },
      signal: {
        upsert: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
        findUnique: jest.fn(),
      },
    } as unknown as PrismaService;
  }

  it('prevents duplicate active signals for same symbol+strategy+date via stable key', async () => {
    const prisma = createPrismaMock();
    const findManySymbols = prisma.symbol.findMany as unknown as jest.Mock;
    const upsertSignal = prisma.signal.upsert as unknown as jest.Mock;
    const findManySignals = prisma.signal.findMany as unknown as jest.Mock;
    const updateManySignals = prisma.signal.updateMany as unknown as jest.Mock;

    findManySymbols.mockResolvedValue([
      {
        id: 'symbol-1',
        ticker: 'AAPL',
        dailyPrices: buildValidDailyBars('2026-04-24'),
      },
    ]);
    findManySignals.mockResolvedValue([{ id: 'signal-1', signalKey: 'AAPL|TREND_PULLBACK|2026-04-24' }]);
    updateManySignals.mockResolvedValue({ count: 0 });

    const service = new SignalsService(prisma);
    await service.scanTrendPullbackSignals();
    await service.scanTrendPullbackSignals();

    expect(upsertSignal).toHaveBeenCalledTimes(2);
    expect(upsertSignal.mock.calls[0][0].where.signalKey).toBe(
      'AAPL|TREND_PULLBACK|2026-04-24',
    );
    expect(upsertSignal.mock.calls[1][0].where.signalKey).toBe(
      'AAPL|TREND_PULLBACK|2026-04-24',
    );
  });

  it('returns scan summary on happy path', async () => {
    const prisma = createPrismaMock();
    const findManySymbols = prisma.symbol.findMany as unknown as jest.Mock;
    const findManySignals = prisma.signal.findMany as unknown as jest.Mock;
    const updateManySignals = prisma.signal.updateMany as unknown as jest.Mock;
    const upsertSignal = prisma.signal.upsert as unknown as jest.Mock;

    findManySymbols.mockResolvedValue([
      {
        id: 'symbol-1',
        ticker: 'AAPL',
        dailyPrices: buildValidDailyBars('2026-04-24'),
      },
      {
        id: 'symbol-2',
        ticker: 'MSFT',
        dailyPrices: buildInsufficientDailyBars(),
      },
    ]);
    upsertSignal.mockResolvedValue({ id: 'signal-1' });
    findManySignals.mockResolvedValue([
      { id: 'signal-1', signalKey: 'AAPL|TREND_PULLBACK|2026-04-24' },
      { id: 'signal-old', signalKey: 'NVDA|TREND_PULLBACK|2026-04-23' },
    ]);
    updateManySignals.mockResolvedValue({ count: 1 });

    const service = new SignalsService(prisma);
    const summary = await service.scanTrendPullbackSignals();

    expect(summary.strategyName).toBe(StrategyName.TREND_PULLBACK);
    expect(summary.scannedSymbols).toBe(2);
    expect(summary.qualifiedSignals).toBe(1);
    expect(summary.upsertedSignals).toBe(1);
    expect(summary.expiredSignals).toBe(1);
    expect(summary.skippedSymbols).toBe(1);
    expect(summary.summary.totalScanned).toBe(2);
    expect(summary.matches.length).toBe(summary.summary.strongCount);
    expect(summary.watchlist.length).toBe(summary.summary.watchlistCount);
    expect(summary.scanned.length).toBe(2);
    expect(summary.scanned[0].presentation).toEqual(
      expect.objectContaining({
        grade: expect.any(String),
        tags: expect.any(Array),
        explanation: expect.any(String),
      }),
    );
    expect(findManySignals).toHaveBeenCalledWith({
      where: {
        strategyName: StrategyName.TREND_PULLBACK,
        status: SignalStatus.ACTIVE,
      },
      select: { id: true, signalKey: true },
    });
    expect(findManySymbols).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isActive: true,
          universeType: 'CORE',
        },
      }),
    );
  });

  it('returns watchlist candidates even when there are zero strong matches', async () => {
    const prisma = createPrismaMock();
    const findManySymbols = prisma.symbol.findMany as unknown as jest.Mock;
    const findManySignals = prisma.signal.findMany as unknown as jest.Mock;
    const updateManySignals = prisma.signal.updateMany as unknown as jest.Mock;
    const upsertSignal = prisma.signal.upsert as unknown as jest.Mock;
    const weakBars = buildWeakButRankableDailyBars();

    findManySymbols.mockResolvedValue([
      { id: 'symbol-1', ticker: 'AAPL', dailyPrices: weakBars },
      { id: 'symbol-2', ticker: 'MSFT', dailyPrices: weakBars },
    ]);
    findManySignals.mockResolvedValue([]);
    updateManySignals.mockResolvedValue({ count: 0 });
    upsertSignal.mockResolvedValue({ id: 'signal-1' });

    const service = new SignalsService(prisma);
    const summary = await service.scanTrendPullbackSignals();

    expect(summary.summary.strongCount).toBe(0);
    expect(summary.matches).toHaveLength(0);
    expect(summary.scanned.length).toBe(2);
    expect(summary.summary.watchlistCount).toBeGreaterThan(0);
    expect(summary.watchlist.length).toBeGreaterThan(0);
    expect(upsertSignal).not.toHaveBeenCalled();
    expect(summary.scanned.every((row) => row.presentation.tags.length > 0)).toBe(true);
  });

  it('returns scanned rows sorted by score descending', async () => {
    const prisma = createPrismaMock();
    const findManySymbols = prisma.symbol.findMany as unknown as jest.Mock;
    const findManySignals = prisma.signal.findMany as unknown as jest.Mock;
    const updateManySignals = prisma.signal.updateMany as unknown as jest.Mock;

    findManySymbols.mockResolvedValue([
      {
        id: 'symbol-1',
        ticker: 'AAA',
        dailyPrices: buildValidDailyBars('2026-04-24'),
      },
      {
        id: 'symbol-2',
        ticker: 'BBB',
        dailyPrices: buildWeakButRankableDailyBars(),
      },
    ]);
    findManySignals.mockResolvedValue([]);
    updateManySignals.mockResolvedValue({ count: 0 });

    const service = new SignalsService(prisma);
    const summary = await service.scanTrendPullbackSignals();

    expect(summary.scanned.length).toBe(2);
    expect(summary.scanned[0].totalScore).toBeGreaterThanOrEqual(
      summary.scanned[1].totalScore,
    );
  });

  it('produces deterministic presentation output for identical component inputs', async () => {
    const prisma = createPrismaMock();
    const findManySymbols = prisma.symbol.findMany as unknown as jest.Mock;
    const findManySignals = prisma.signal.findMany as unknown as jest.Mock;
    const updateManySignals = prisma.signal.updateMany as unknown as jest.Mock;
    const bars = buildWeakButRankableDailyBars();

    findManySymbols.mockResolvedValue([
      { id: 'symbol-1', ticker: 'AAA', dailyPrices: bars },
      { id: 'symbol-2', ticker: 'BBB', dailyPrices: bars },
    ]);
    findManySignals.mockResolvedValue([]);
    updateManySignals.mockResolvedValue({ count: 0 });

    const service = new SignalsService(prisma);
    const summary = await service.scanTrendPullbackSignals();

    expect(summary.scanned).toHaveLength(2);
    expect(summary.scanned[0].presentation).toEqual(summary.scanned[1].presentation);
  });
});

function buildValidDailyBars(latestDate: string): Array<{
  date: Date;
  close: number;
  low: number;
  high: number;
  volume: number;
}> {
  const bars = Array.from({ length: 230 }, (_, index) => {
    const date = new Date('2025-06-01T00:00:00.000Z');
    date.setUTCDate(date.getUTCDate() + index);
    const close = 100 + index * 0.2;
    return {
      date,
      close,
      low: close * 0.99,
      high: close * 1.01,
      volume: 1_000_000,
    };
  });
  const base = bars[209].close;
  for (let index = 210; index < 230; index += 1) {
    bars[index].close = base * (1 + ((index - 210) % 3) * 0.001);
    bars[index].low = bars[index].close * 0.99;
    bars[index].high = bars[index].close * 1.01;
  }
  bars[bars.length - 1].date = new Date(`${latestDate}T00:00:00.000Z`);
  bars[bars.length - 1].close = bars[bars.length - 2].close * 1.001;
  bars[bars.length - 1].low = bars[bars.length - 1].close * 0.99;
  bars[bars.length - 1].high = bars[bars.length - 1].close * 1.01;
  bars[bars.length - 1].volume = 950_000;
  return bars;
}

function buildInsufficientDailyBars(): Array<{
  date: Date;
  close: number;
  low: number;
  high: number;
  volume: number;
}> {
  return Array.from({ length: 50 }, (_, index) => {
    const date = new Date('2026-01-01T00:00:00.000Z');
    date.setUTCDate(date.getUTCDate() + index);
    const close = 100 + index * 0.1;
    return {
      date,
      close,
      low: close * 0.99,
      high: close * 1.01,
      volume: 1_000_000,
    };
  });
}

function buildWeakButRankableDailyBars(): Array<{
  date: Date;
  close: number;
  low: number;
  high: number;
  volume: number;
}> {
  const bars = Array.from({ length: 230 }, (_, index) => {
    const date = new Date('2025-06-01T00:00:00.000Z');
    date.setUTCDate(date.getUTCDate() + index);
    const close = 80 + index * 0.15;
    return {
      date,
      close,
      low: close * 0.99,
      high: close * 1.01,
      volume: 1_000_000,
    };
  });
  const base = bars[209].close;
  for (let index = 210; index < 230; index += 1) {
    bars[index].close = base * (1 + ((index - 210) % 2) * 0.001);
    bars[index].low = bars[index].close * 0.92;
    bars[index].high = bars[index].close * 1.01;
    bars[index].volume = 850_000;
  }
  bars[bars.length - 1].date = new Date('2026-04-24T00:00:00.000Z');
  return bars;
}
