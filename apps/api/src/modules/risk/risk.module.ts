import { Module } from '@nestjs/common';
import { PaperTradingModule } from '../paper-trading/paper-trading.module';
import { RiskService } from './risk.service';

@Module({
  imports: [PaperTradingModule],
  providers: [RiskService],
  exports: [RiskService],
})
export class RiskModule {}
