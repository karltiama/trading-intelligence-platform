import { Module } from '@nestjs/common';
import { PaperTradingModule } from '../paper-trading/paper-trading.module';
import { PortfolioController } from './portfolio.controller';
import { PortfolioService } from './portfolio.service';

@Module({
  imports: [PaperTradingModule],
  controllers: [PortfolioController],
  providers: [PortfolioService],
})
export class PortfolioModule {}
