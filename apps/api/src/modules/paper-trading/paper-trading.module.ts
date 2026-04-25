import { Module } from '@nestjs/common';
import { PaperTradingRepository } from './paper-trading.repository';
import { PaperTradingService } from './paper-trading.service';

@Module({
  providers: [PaperTradingRepository, PaperTradingService],
  exports: [PaperTradingService, PaperTradingRepository],
})
export class PaperTradingModule {}
