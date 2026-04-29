import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MarketDataService } from '../modules/market-data/market-data.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(private readonly marketDataService: MarketDataService) {}

  @Cron('10 18 * * 1-5', {
    name: 'sync-default-daily-bars-weekdays',
    timeZone: 'America/New_York',
  })
  async syncDefaultDailyBarsWeekdays(): Promise<void> {
    this.logger.log('Starting scheduled daily market-data sync.');
    try {
      const result = await this.marketDataService.syncDefaultSymbols();
      this.logger.log(
        `Scheduled daily market-data sync completed. symbolsProcessed=${result.symbolsProcessed} rowsUpserted=${result.rowsUpserted}`,
      );
    } catch (error) {
      this.logger.error(
        `Scheduled daily market-data sync failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
