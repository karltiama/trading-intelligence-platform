import { Module } from '@nestjs/common';
import { PaperTradingModule } from '../paper-trading/paper-trading.module';
import { RiskModule } from '../risk/risk.module';
import { AutomationController } from './automation.controller';
import { AutomationRepository } from './automation.repository';
import { AutomationService } from './automation.service';

@Module({
  imports: [PaperTradingModule, RiskModule],
  controllers: [AutomationController],
  providers: [AutomationRepository, AutomationService],
  exports: [AutomationService],
})
export class AutomationModule {}
