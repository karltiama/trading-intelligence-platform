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
});
