import { Module } from '@nestjs/common';
import { AccountContextModule } from '../account-context/account-context.module';
import { PaperTradingModule } from '../paper-trading/paper-trading.module';
import { PortfolioController } from './portfolio.controller';
import { PortfolioService } from './portfolio.service';

@Module({
  imports: [PaperTradingModule, AccountContextModule],
  controllers: [PortfolioController],
  providers: [PortfolioService],
})
export class PortfolioModule {}
