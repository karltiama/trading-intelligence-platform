import { Module } from '@nestjs/common';
import { AlpacaClient } from './alpaca.client';
import { MarketDataController } from './market-data.controller';
import { MarketDataRepository } from './market-data.repository';
import { MarketDataService } from './market-data.service';
import { SyncApiKeyGuard } from './sync-api-key.guard';

@Module({
  controllers: [MarketDataController],
  providers: [
    AlpacaClient,
    MarketDataRepository,
    MarketDataService,
    SyncApiKeyGuard,
  ],
  exports: [MarketDataService, MarketDataRepository],
})
export class MarketDataModule {}
