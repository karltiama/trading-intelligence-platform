import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PaperTradingRepository } from './paper-trading.repository';
import { PaperTradingService } from './paper-trading.service';

@Module({
  imports: [AuditModule],
  providers: [PaperTradingRepository, PaperTradingService],
  exports: [PaperTradingService, PaperTradingRepository],
})
export class PaperTradingModule {}
