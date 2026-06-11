import { Module } from '@nestjs/common';
import { MarketDataModule } from '../market-data/market-data.module';
import { PaperTradingModule } from '../paper-trading/paper-trading.module';
import { RiskService } from './risk.service';

@Module({
  imports: [PaperTradingModule, MarketDataModule],
  providers: [RiskService],
  exports: [RiskService],
})
export class RiskModule {}
