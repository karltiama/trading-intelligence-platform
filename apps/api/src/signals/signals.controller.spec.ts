import { StrategyName } from '@prisma/client';
import { SignalsController } from './signals.controller';
import { SignalsService } from './signals.service';

describe('SignalsController', () => {
  it('POST /signals/scan happy path returns scan summary', async () => {
    const scanSignals = jest.fn().mockResolvedValue({
      strategyName: StrategyName.TREND_PULLBACK,
      scannedSymbols: 5,
      qualifiedSignals: 2,
      upsertedSignals: 2,
      expiredSignals: 1,
      skippedSymbols: 1,
      matches: [],
      watchlist: [],
      scanned: [],
      summary: {
        totalScanned: 5,
        strongCount: 2,
        watchlistCount: 1,
        weakCount: 1,
        ignoreCount: 1,
      },
      asOf: '2026-04-26T00:00:00.000Z',
    });
    const service = {
      scanSignals,
      list: jest.fn(),
      getById: jest.fn(),
    } as unknown as SignalsService;
    const controller = new SignalsController(service);

    const response = await controller.scan();

    expect(scanSignals).toHaveBeenCalledTimes(1);
    expect(scanSignals).toHaveBeenCalledWith(StrategyName.TREND_PULLBACK);
    expect(response).toEqual({
      strategyName: StrategyName.TREND_PULLBACK,
      scannedSymbols: 5,
      qualifiedSignals: 2,
      upsertedSignals: 2,
      expiredSignals: 1,
      skippedSymbols: 1,
      matches: [],
      watchlist: [],
      scanned: [],
      summary: {
        totalScanned: 5,
        strongCount: 2,
        watchlistCount: 1,
        weakCount: 1,
        ignoreCount: 1,
      },
      asOf: '2026-04-26T00:00:00.000Z',
    });
  });
});
