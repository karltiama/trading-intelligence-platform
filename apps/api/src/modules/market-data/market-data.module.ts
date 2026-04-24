import { Module } from '@nestjs/common';
import { AlpacaClient } from './alpaca.client';
import { MarketDataController } from './market-data.controller';
import { MarketDataService } from './market-data.service';

@Module({
  controllers: [MarketDataController],
  providers: [AlpacaClient, MarketDataService],
  exports: [MarketDataService],
})
export class MarketDataModule {}
