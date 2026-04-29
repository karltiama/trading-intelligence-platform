import { MarketStateService } from './market-state.service';

function buildSeries(start: number, step: number, length = 60): number[] {
  return Array.from({ length }, (_, index) => start + step * index);
}

function toCloseRows(values: number[]): Array<{ close: number }> {
  return values
    .slice()
    .reverse()
    .map((close) => ({ close }));
}

describe('MarketStateService', () => {
  function createService(params: {
    spy: number[];
    qqq: number[];
    vix?: number[];
    caretVix?: number[];
    vxx?: number[];
    vixy?: number[];
    core: number[][];
  }) {
    const dailyPriceFindMany = jest
      .fn()
      .mockImplementation(
        ({ where }: { where: { symbol: { ticker: string } } }) => {
          const ticker = where.symbol.ticker;
          if (ticker === 'SPY') return Promise.resolve(toCloseRows(params.spy));
          if (ticker === 'QQQ') return Promise.resolve(toCloseRows(params.qqq));
          if (ticker === 'VIX')
            return Promise.resolve(toCloseRows(params.vix ?? []));
          if (ticker === '^VIX')
            return Promise.resolve(toCloseRows(params.caretVix ?? []));
          if (ticker === 'VXX')
            return Promise.resolve(toCloseRows(params.vxx ?? []));
          if (ticker === 'VIXY')
            return Promise.resolve(toCloseRows(params.vixy ?? []));
          return Promise.resolve([]);
        },
      );

    const symbolFindMany = jest.fn().mockResolvedValue(
      params.core.map((series) => ({
        dailyPrices: toCloseRows(series),
      })),
    );

    const prisma = {
      dailyPrice: { findMany: dailyPriceFindMany },
      symbol: { findMany: symbolFindMany },
    } as never;

    return new MarketStateService(prisma);
  }

  it('classifies TRENDING_BULL', async () => {
    const service = createService({
      spy: buildSeries(100, 1),
      qqq: buildSeries(200, 1),
      vix: [14],
      core: Array.from({ length: 10 }, () => buildSeries(50, 0.8)),
    });

    const result = await service.getLatestMarketState();
    expect(result.state).toBe('TRENDING_BULL');
    expect(result.breadthState).toBe('STRONG');
    expect(result.volatilityRegime).toBe('CALM');
  });

  it('classifies PULLBACK_RESET', async () => {
    const spy = buildSeries(100, 0.9);
    spy[spy.length - 1] = spy[spy.length - 2] - 30;

    const service = createService({
      spy,
      qqq: buildSeries(200, 0.8),
      vix: [18],
      core: Array.from({ length: 10 }, (_, index) =>
        index < 6 ? buildSeries(80, 0.4) : buildSeries(80, -0.1),
      ),
    });

    const result = await service.getLatestMarketState();
    expect(result.state).toBe('PULLBACK_RESET');
    expect(result.volatilityRegime).toBe('NORMAL');
  });

  it('classifies BEARISH_WEAK', async () => {
    const service = createService({
      spy: buildSeries(300, -1),
      qqq: buildSeries(220, -1),
      vix: [25],
      core: Array.from({ length: 10 }, () => buildSeries(120, -0.7)),
    });

    const result = await service.getLatestMarketState();
    expect(result.state).toBe('BEARISH_WEAK');
    expect(result.breadthState).toBe('WEAK');
    expect(result.volatilityRegime).toBe('ELEVATED');
  });

  it('falls back to CHOPPY_MIXED', async () => {
    const service = createService({
      spy: buildSeries(100, 0),
      qqq: buildSeries(100, 0),
      vix: [17],
      core: Array.from({ length: 10 }, (_, index) =>
        index % 2 === 0 ? buildSeries(50, 0.2) : buildSeries(50, -0.2),
      ),
    });

    const result = await service.getLatestMarketState();
    expect(result.state).toBe('CHOPPY_MIXED');
    expect(result.breadthState).toBe('MIXED');
  });

  it('handles missing VIX without failing', async () => {
    const service = createService({
      spy: buildSeries(100, 1),
      qqq: buildSeries(200, 1),
      core: Array.from({ length: 5 }, () => buildSeries(60, 0.5)),
    });

    const result = await service.getLatestMarketState();
    expect(result.volatilityRegime).toBe('UNKNOWN');
    expect(result.conditions).toContain('VIX data unavailable');
  });

  it('falls back to VXX volatility proxy', async () => {
    const service = createService({
      spy: buildSeries(100, 1),
      qqq: buildSeries(150, 1),
      vxx: [31],
      core: Array.from({ length: 6 }, () => buildSeries(40, 0.3)),
    });

    const result = await service.getLatestMarketState();
    expect(result.volatilityRegime).toBe('ELEVATED');
    expect(result.conditions).toContain('Using VXX volatility proxy');
  });

  it('falls back to VIXY volatility proxy', async () => {
    const service = createService({
      spy: buildSeries(100, 1),
      qqq: buildSeries(150, 1),
      vixy: [24],
      core: Array.from({ length: 6 }, () => buildSeries(40, 0.3)),
    });

    const result = await service.getLatestMarketState();
    expect(result.volatilityRegime).toBe('NORMAL');
    expect(result.conditions).toContain('Using VIXY volatility proxy');
  });

  it('classifies breadth from participation', async () => {
    const service = createService({
      spy: buildSeries(100, 0.2),
      qqq: buildSeries(100, 0.2),
      vix: [16],
      core: [
        buildSeries(10, 1),
        buildSeries(10, 1),
        buildSeries(10, 1),
        buildSeries(10, 1),
        buildSeries(10, -1),
      ],
    });

    const result = await service.getLatestMarketState();
    expect(result.breadthState).toBe('STRONG');
  });

  it('does not expose raw numeric metrics', async () => {
    const service = createService({
      spy: buildSeries(100, 1),
      qqq: buildSeries(200, 1),
      vix: [14],
      core: Array.from({ length: 8 }, () => buildSeries(50, 0.7)),
    });

    const result = await service.getLatestMarketState();
    expect(typeof result.state).toBe('string');
    expect(typeof result.label).toBe('string');
    expect(typeof result.summary).toBe('string');
    expect(Array.isArray(result.conditions)).toBe(true);
    expect(result).not.toHaveProperty('sma20');
    expect(result).not.toHaveProperty('sma50');
    expect(result).not.toHaveProperty('distanceFromSma20');
    expect(result).not.toHaveProperty('breadthPercent');
    expect(result).not.toHaveProperty('vixValue');
  });
});
