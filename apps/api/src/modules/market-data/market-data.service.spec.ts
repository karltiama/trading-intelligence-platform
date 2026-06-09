import { Prisma } from '@prisma/client';
import { AlpacaClient } from './alpaca.client';
import { MarketDataRepository } from './market-data.repository';
import { MarketDataService } from './market-data.service';

describe('MarketDataService', () => {
  it('handles repeated sync calls with same bars consistently', async () => {
    const getDailyBars = jest.fn().mockResolvedValue([
      {
        timestamp: '2026-04-24T00:00:00Z',
        open: 100,
        high: 105,
        low: 99,
        close: 103,
        volume: 1000,
      },
      {
        timestamp: '2026-04-25T00:00:00Z',
        open: 103,
        high: 106,
        low: 102,
        close: 104,
        volume: 900,
      },
    ]);

    const alpacaClient = {
      getDailyBars,
    } as unknown as AlpacaClient;

    const findOrCreateSymbolByTicker = jest
      .fn()
      .mockResolvedValue({ id: 'symbol-1' });
    const upsertDailyBars = jest.fn().mockResolvedValue(undefined);

    const repository = {
      findOrCreateSymbolByTicker,
      upsertDailyBars,
    } as unknown as MarketDataRepository;

    const service = new MarketDataService(alpacaClient, repository);

    const firstCount = await service.syncDailyBars('aapl', 2);
    const secondCount = await service.syncDailyBars('AAPL', 2);

    expect(firstCount).toBe(2);
    expect(secondCount).toBe(2);
    expect(getDailyBars).toHaveBeenCalledTimes(2);
    expect(findOrCreateSymbolByTicker).toHaveBeenNthCalledWith(1, 'AAPL');
    expect(findOrCreateSymbolByTicker).toHaveBeenNthCalledWith(2, 'AAPL');
    expect(upsertDailyBars).toHaveBeenCalledTimes(2);

    const firstRows = upsertDailyBars.mock.calls[0][1] as Array<{
      date: Date;
      open: Prisma.Decimal;
      high: Prisma.Decimal;
      low: Prisma.Decimal;
      close: Prisma.Decimal;
      volume: Prisma.Decimal;
      source: string;
    }>;
    const secondRows = upsertDailyBars.mock.calls[1][1] as Array<{
      date: Date;
      open: Prisma.Decimal;
      high: Prisma.Decimal;
      low: Prisma.Decimal;
      close: Prisma.Decimal;
      volume: Prisma.Decimal;
      source: string;
    }>;

    expect(firstRows).toHaveLength(2);
    expect(secondRows).toHaveLength(2);
    expect(firstRows[0].date.toISOString()).toBe('2026-04-24T00:00:00.000Z');
    expect(firstRows[1].date.toISOString()).toBe('2026-04-25T00:00:00.000Z');
    expect(secondRows[0].date.toISOString()).toBe('2026-04-24T00:00:00.000Z');
    expect(secondRows[1].date.toISOString()).toBe('2026-04-25T00:00:00.000Z');
    expect(firstRows[0].open).toEqual(new Prisma.Decimal(100));
    expect(secondRows[0].open).toEqual(new Prisma.Decimal(100));
    expect(firstRows[0].source).toBe('alpaca');
    expect(secondRows[0].source).toBe('alpaca');
  });

  it('syncHourlyBars uses CORE lookback and prunes after upsert', async () => {
    const getHourlyBars = jest.fn().mockResolvedValue([
      {
        timestamp: '2026-04-24T15:30:00.000Z',
        open: 100,
        high: 105,
        low: 99,
        close: 103,
        volume: 1000,
      },
    ]);

    const alpacaClient = {
      getHourlyBars,
    } as unknown as AlpacaClient;

    const findOrCreateSymbolByTicker = jest
      .fn()
      .mockResolvedValue({ id: 'symbol-1' });
    const latestHourlyTimestamp = jest.fn().mockResolvedValue(null);
    const upsertHourlyBars = jest.fn().mockResolvedValue(undefined);
    const pruneHourlyBars = jest.fn().mockResolvedValue(0);
    const trimHourlyBarsToMax = jest.fn().mockResolvedValue(0);

    const repository = {
      findOrCreateSymbolByTicker,
      latestHourlyTimestamp,
      upsertHourlyBars,
      pruneHourlyBars,
      trimHourlyBarsToMax,
    } as unknown as MarketDataRepository;

    const service = new MarketDataService(alpacaClient, repository);
    const count = await service.syncHourlyBars('spy', 'CORE');

    expect(count).toBe(1);
    expect(getHourlyBars).toHaveBeenCalledTimes(1);
    expect(upsertHourlyBars).toHaveBeenCalledTimes(1);
    expect(pruneHourlyBars).toHaveBeenCalledTimes(1);
    expect(trimHourlyBarsToMax).toHaveBeenCalledTimes(1);

    const hourlyRows = upsertHourlyBars.mock.calls[0][1] as Array<{
      timestamp: Date;
    }>;
    expect(hourlyRows[0].timestamp.toISOString()).toBe('2026-04-24T15:00:00.000Z');
  });

  it('resolveHourlyPolicy maps universe type to sync policy', () => {
    const service = new MarketDataService(
      {} as AlpacaClient,
      {} as MarketDataRepository,
    );

    expect(service.resolveHourlyPolicy('CORE')).toBe('CORE');
    expect(service.resolveHourlyPolicy('ON_DEMAND')).toBe('ON_DEMAND');
  });

  it('ensureHourlyBars skips sync when latest bar is fresh', async () => {
    const syncHourlyBars = jest.fn();
    const service = new MarketDataService({} as AlpacaClient, {
      findSymbolByTicker: jest.fn().mockResolvedValue({
        id: 'symbol-1',
        universeType: 'CORE',
      }),
      latestHourlyTimestamp: jest
        .fn()
        .mockResolvedValue(new Date(Date.now() - 60_000)),
    } as unknown as MarketDataRepository);

    service.syncHourlyBars = syncHourlyBars;

    await service.ensureHourlyBars('SPY');

    expect(syncHourlyBars).not.toHaveBeenCalled();
  });
});
