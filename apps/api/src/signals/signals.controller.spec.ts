import { StrategyName } from '@prisma/client';
import { SignalsController } from './signals.controller';
import { SignalsService } from './signals.service';

describe('SignalsController', () => {
  it('POST /signals/scan happy path returns scan summary', async () => {
    const scanTrendPullbackSignals = jest.fn().mockResolvedValue({
      strategyName: StrategyName.TREND_PULLBACK,
      scannedSymbols: 5,
      qualifiedSignals: 2,
      upsertedSignals: 2,
      expiredSignals: 1,
      skippedSymbols: 1,
      asOf: '2026-04-26T00:00:00.000Z',
    });
    const service = {
      scanTrendPullbackSignals,
      list: jest.fn(),
      getById: jest.fn(),
    } as unknown as SignalsService;
    const controller = new SignalsController(service);

    const response = await controller.scan();

    expect(scanTrendPullbackSignals).toHaveBeenCalledTimes(1);
    expect(response).toEqual({
      strategyName: StrategyName.TREND_PULLBACK,
      scannedSymbols: 5,
      qualifiedSignals: 2,
      upsertedSignals: 2,
      expiredSignals: 1,
      skippedSymbols: 1,
      asOf: '2026-04-26T00:00:00.000Z',
    });
  });
});
