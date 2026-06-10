import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MarketDataService } from '../modules/market-data/market-data.service';
import { PositionManagementService } from '../modules/portfolio/position-management.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly marketDataService: MarketDataService,
    private readonly positionManagementService: PositionManagementService,
  ) {}

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

  @Cron('5 * * * 1-5', {
    name: 'sync-core-hourly-bars-weekdays',
    timeZone: 'America/New_York',
  })
  async syncCoreHourlyBarsWeekdays(): Promise<void> {
    this.logger.log('Starting scheduled CORE hourly market-data sync.');
    try {
      const result = await this.marketDataService.syncCoreHourlySymbols();
      this.logger.log(
        `Scheduled CORE hourly market-data sync completed. symbolsProcessed=${result.symbolsProcessed} rowsUpserted=${result.rowsUpserted}`,
      );
    } catch (error) {
      this.logger.error(
        `Scheduled CORE hourly market-data sync failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  @Cron('*/5 9-15 * * 1-5', {
    name: 'monitor-position-exits-weekdays',
    timeZone: 'America/New_York',
  })
  async monitorPositionExitsWeekdays(): Promise<void> {
    this.logger.log('Starting scheduled position exit monitor.');
    try {
      const result = await this.positionManagementService.monitorOpenPositions();
      this.logger.log(
        `Scheduled position exit monitor completed. evaluated=${result.evaluated} exited=${result.exited.length} skipped=${result.skipped.length}`,
      );
    } catch (error) {
      this.logger.error(
        `Scheduled position exit monitor failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
