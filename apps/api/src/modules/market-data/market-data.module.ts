import { Module } from '@nestjs/common';
import { AlpacaClient } from './alpaca.client';
import { MarketDataController } from './market-data.controller';
import { MarketDataRepository } from './market-data.repository';
import { MarketDataService } from './market-data.service';

@Module({
  controllers: [MarketDataController],
  providers: [AlpacaClient, MarketDataRepository, MarketDataService],
  exports: [MarketDataService, MarketDataRepository],
})
export class MarketDataModule {}
