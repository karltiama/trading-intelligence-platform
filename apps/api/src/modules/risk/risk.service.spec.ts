import { Prisma } from '@prisma/client';
import { RiskService } from './risk.service';

const decimal = (value: string | number): Prisma.Decimal =>
  new Prisma.Decimal(value);

describe('RiskService.evaluateTradeRisk', () => {
  const service = new RiskService({} as never, {} as never, {} as never);

  it('allows a long entry inside the 1% risk budget and computes metrics', () => {
    const result = service.evaluateTradeRisk({
      entryPrice: decimal(100),
      stopLossPrice: decimal(98),
      takeProfitPrice: decimal(106),
      quantity: decimal(40),
      equity: decimal(10000),
    });

    expect(result.allowed).toBe(true);
    if (!result.allowed) {
      return;
    }
    expect(result.riskPerShare.toNumber()).toBe(2);
    expect(result.totalRisk.toNumber()).toBe(80);
    expect(result.riskPercent.toNumber()).toBeCloseTo(0.008, 6);
    expect(result.riskRewardRatio?.toNumber()).toBe(3);
  });

  it('rejects when no stop loss is provided', () => {
    const result = service.evaluateTradeRisk({
      entryPrice: decimal(100),
      stopLossPrice: null,
      quantity: decimal(10),
      equity: decimal(10000),
    });

    expect(result).toEqual({
      allowed: false,
      reason:
        'stopLossPrice is required and must be a valid number for BUY orders.',
    });
  });

  it('rejects when the stop is at or above the entry price', () => {
    const result = service.evaluateTradeRisk({
      entryPrice: decimal(100),
      stopLossPrice: decimal(100),
      quantity: decimal(10),
      equity: decimal(10000),
    });

    expect(result).toEqual({
      allowed: false,
      reason: 'stopLossPrice must be below reference price (100.00).',
    });
  });

  it('rejects when total risk exceeds the per-trade limit', () => {
    const result = service.evaluateTradeRisk({
      entryPrice: decimal(100),
      stopLossPrice: decimal(98),
      quantity: decimal(100),
      equity: decimal(10000),
    });

    expect(result).toEqual({
      allowed: false,
      reason: 'Risk per trade exceeds limit (1.00%).',
    });
  });

  it('rejects when equity is not positive', () => {
    const result = service.evaluateTradeRisk({
      entryPrice: decimal(100),
      stopLossPrice: decimal(98),
      quantity: decimal(1),
      equity: decimal(0),
    });

    expect(result).toEqual({
      allowed: false,
      reason: 'account equity must be greater than 0.',
    });
  });

  it('returns a null risk/reward ratio when no take profit is provided', () => {
    const result = service.evaluateTradeRisk({
      entryPrice: decimal(100),
      stopLossPrice: decimal(98),
      quantity: decimal(10),
      equity: decimal(10000),
    });

    expect(result.allowed).toBe(true);
    if (!result.allowed) {
      return;
    }
    expect(result.riskRewardRatio).toBeNull();
  });
});

describe('RiskService.resolveAccountEquity', () => {
  const buildService = (overrides: {
    account: { id: string; cashBalance: Prisma.Decimal } | null;
    positions?: Array<{
      symbolId: string;
      symbol: string;
      quantity: Prisma.Decimal;
    }>;
    marks?: Record<string, { close: Prisma.Decimal }>;
  }) => {
    const paperTradingRepository = {
      resolveAccountForUser: jest.fn().mockResolvedValue(overrides.account),
      listPositions: jest.fn().mockResolvedValue(overrides.positions ?? []),
    };
    const marketDataService = {
      ensureHourlyBarsForSymbols: jest.fn().mockResolvedValue(undefined),
    };
    const marketDataRepository = {
      findLatestMarkPricesForSymbols: jest
        .fn()
        .mockResolvedValue(overrides.marks ?? {}),
    };
    const service = new RiskService(
      paperTradingRepository as never,
      marketDataService as never,
      marketDataRepository as never,
    );
    return { service, marketDataRepository, marketDataService };
  };

  it('returns null when the account cannot be resolved', async () => {
    const { service } = buildService({ account: null });
    await expect(
      service.resolveAccountEquity('nobody@example.com'),
    ).resolves.toBeNull();
  });

  it('returns cash only when there are no open positions', async () => {
    const { service, marketDataRepository } = buildService({
      account: { id: 'acc-1', cashBalance: decimal(10000) },
      positions: [],
    });
    const equity = await service.resolveAccountEquity('user@example.com');
    expect(equity?.toNumber()).toBe(10000);
    expect(
      marketDataRepository.findLatestMarkPricesForSymbols,
    ).not.toHaveBeenCalled();
  });

  it('adds marked value of open positions to cash', async () => {
    const { service } = buildService({
      account: { id: 'acc-1', cashBalance: decimal(5000) },
      positions: [
        { symbolId: 'sym-1', symbol: 'AAA', quantity: decimal(10) },
        { symbolId: 'sym-2', symbol: 'BBB', quantity: decimal(5) },
      ],
      marks: {
        'sym-1': { close: decimal(100) },
        'sym-2': { close: decimal(40) },
      },
    });

    const equity = await service.resolveAccountEquity('user@example.com');
    expect(equity?.toNumber()).toBe(5000 + 10 * 100 + 5 * 40);
  });

  it('ignores positions that have no available mark price', async () => {
    const { service } = buildService({
      account: { id: 'acc-1', cashBalance: decimal(2000) },
      positions: [
        { symbolId: 'sym-1', symbol: 'AAA', quantity: decimal(3) },
        { symbolId: 'sym-2', symbol: 'BBB', quantity: decimal(7) },
      ],
      marks: { 'sym-1': { close: decimal(50) } },
    });

    const equity = await service.resolveAccountEquity('user@example.com');
    expect(equity?.toNumber()).toBe(2000 + 3 * 50);
  });
});

describe('RiskService.evaluateLongEntryRisk', () => {
  const buildService = (overrides: {
    mark: { close: number } | null;
    account?: { id: string; cashBalance: Prisma.Decimal } | null;
  }) => {
    const paperTradingRepository = {
      resolveAccountForUser: jest
        .fn()
        .mockResolvedValue(
          overrides.account === undefined
            ? { id: 'acc-1', cashBalance: decimal(100000) }
            : overrides.account,
        ),
      listPositions: jest.fn().mockResolvedValue([]),
    };
    const marketDataService = {
      resolveSymbolMarkPrice: jest.fn().mockResolvedValue(overrides.mark),
      ensureHourlyBarsForSymbols: jest.fn().mockResolvedValue(undefined),
    };
    const marketDataRepository = {
      findLatestMarkPricesForSymbols: jest.fn().mockResolvedValue({}),
    };
    return new RiskService(
      paperTradingRepository as never,
      marketDataService as never,
      marketDataRepository as never,
    );
  };

  it('rejects when the symbol has no resolvable mark price', async () => {
    const service = buildService({ mark: null });
    const result = await service.evaluateLongEntryRisk({
      symbol: 'ZZZZ',
      quantity: 1,
      stopLossPrice: 90,
      userEmail: 'user@example.com',
    });
    expect(result).toEqual({
      allowed: false,
      reason: 'symbol not tracked: ZZZZ',
    });
  });

  it('rejects when the account cannot be resolved', async () => {
    const service = buildService({ mark: { close: 100 }, account: null });
    const result = await service.evaluateLongEntryRisk({
      symbol: 'AAA',
      quantity: 1,
      stopLossPrice: 90,
      userEmail: 'user@example.com',
    });
    expect(result).toEqual({
      allowed: false,
      reason: 'paper account not found for current user',
    });
  });

  it('allows a stop-carrying entry inside the risk budget', async () => {
    const service = buildService({ mark: { close: 100 } });
    const result = await service.evaluateLongEntryRisk({
      symbol: 'AAA',
      quantity: 40,
      stopLossPrice: 98,
      takeProfitPrice: 106,
      userEmail: 'user@example.com',
    });
    expect(result.allowed).toBe(true);
    if (!result.allowed) {
      return;
    }
    expect(result.totalRisk.toNumber()).toBe(80);
    expect(result.riskRewardRatio?.toNumber()).toBe(3);
  });

  it('rejects an entry that exceeds the per-trade risk budget', async () => {
    const service = buildService({
      mark: { close: 100 },
      account: { id: 'acc-1', cashBalance: decimal(10000) },
    });
    const result = await service.evaluateLongEntryRisk({
      symbol: 'AAA',
      quantity: 100,
      stopLossPrice: 98,
      userEmail: 'user@example.com',
    });
    expect(result).toEqual({
      allowed: false,
      reason: 'Risk per trade exceeds limit (1.00%).',
    });
  });
});

describe('RiskService.evaluatePortfolioHeat', () => {
  const buildService = (overrides: {
    account?: { id: string } | null;
    positions?: Array<{ symbolId: string; quantity: Prisma.Decimal }>;
    orderLevels?: Record<string, { stopLossPrice: number | null }>;
    marks?: Record<string, { close: Prisma.Decimal }>;
  }) => {
    const paperTradingRepository = {
      resolveAccountForUser: jest
        .fn()
        .mockResolvedValue(
          overrides.account === undefined ? { id: 'acc-1' } : overrides.account,
        ),
      listPositions: jest.fn().mockResolvedValue(overrides.positions ?? []),
      findLatestFilledBuyOrdersForSymbols: jest
        .fn()
        .mockResolvedValue(overrides.orderLevels ?? {}),
    };
    const marketDataService = {};
    const marketDataRepository = {
      findLatestMarkPricesForSymbols: jest
        .fn()
        .mockResolvedValue(overrides.marks ?? {}),
    };
    return new RiskService(
      paperTradingRepository as never,
      marketDataService as never,
      marketDataRepository as never,
    );
  };

  it('allows when projected heat is within the limit', async () => {
    const service = buildService({ positions: [] });
    const result = await service.evaluatePortfolioHeat({
      userEmail: 'user@example.com',
      equity: decimal(10000),
      newTradeRisk: decimal(80),
    });
    expect(result).toEqual({ allowed: true });
  });

  it('rejects when existing open risk plus the new trade exceeds 6% heat', async () => {
    // Two open positions each risking 250 (mark 100, stop 95, qty 50) = 500,
    // plus a new trade risk of 120 => 620 / 10000 = 6.2% > 6%.
    const service = buildService({
      positions: [
        { symbolId: 'sym-1', quantity: decimal(50) },
        { symbolId: 'sym-2', quantity: decimal(50) },
      ],
      orderLevels: {
        'sym-1': { stopLossPrice: 95 },
        'sym-2': { stopLossPrice: 95 },
      },
      marks: {
        'sym-1': { close: decimal(100) },
        'sym-2': { close: decimal(100) },
      },
    });

    const result = await service.evaluatePortfolioHeat({
      userEmail: 'user@example.com',
      equity: decimal(10000),
      newTradeRisk: decimal(120),
    });

    expect(result).toEqual({
      allowed: false,
      reason: 'Portfolio risk heat exceeds limit (6.00%).',
    });
  });

  it('excludes stopless open positions from heat', async () => {
    const service = buildService({
      positions: [{ symbolId: 'sym-1', quantity: decimal(50) }],
      orderLevels: { 'sym-1': { stopLossPrice: null } },
      marks: { 'sym-1': { close: decimal(100) } },
    });

    const result = await service.evaluatePortfolioHeat({
      userEmail: 'user@example.com',
      equity: decimal(10000),
      newTradeRisk: decimal(80),
    });

    expect(result).toEqual({ allowed: true });
  });

  it('rejects when the account cannot be resolved', async () => {
    const service = buildService({ account: null });
    const result = await service.evaluatePortfolioHeat({
      userEmail: 'nobody@example.com',
      equity: decimal(10000),
      newTradeRisk: decimal(10),
    });
    expect(result).toEqual({
      allowed: false,
      reason: 'paper account not found for current user',
    });
  });
});
