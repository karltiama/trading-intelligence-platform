import { MarketDataService } from '../modules/market-data/market-data.service';
import { SchedulerService } from './scheduler.service';

describe('SchedulerService', () => {
  it('runs scheduled daily sync using market data service', async () => {
    const marketDataService = {
      syncDefaultSymbols: jest.fn().mockResolvedValue({
        message: 'Sync complete',
        symbolsProcessed: 5,
        rowsUpserted: 150,
      }),
    } as unknown as MarketDataService;

    const service = new SchedulerService(marketDataService);
    await service.syncDefaultDailyBarsWeekdays();

    expect(marketDataService.syncDefaultSymbols).toHaveBeenCalledTimes(1);
  });

  it('runs scheduled CORE hourly sync using market data service', async () => {
    const marketDataService = {
      syncCoreHourlySymbols: jest.fn().mockResolvedValue({
        message: 'Hourly sync complete',
        symbolsProcessed: 49,
        rowsUpserted: 320,
      }),
    } as unknown as MarketDataService;

    const service = new SchedulerService(marketDataService);
    await service.syncCoreHourlyBarsWeekdays();

    expect(marketDataService.syncCoreHourlySymbols).toHaveBeenCalledTimes(1);
  });
});
