import { Module } from '@nestjs/common';
import { AccountContextModule } from '../account-context/account-context.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { PaperTradingModule } from '../paper-trading/paper-trading.module';
import { PortfolioController } from './portfolio.controller';
import { PortfolioService } from './portfolio.service';
import { PositionManagementService } from './position-management.service';

@Module({
  imports: [PaperTradingModule, AccountContextModule, MarketDataModule],
  controllers: [PortfolioController],
  providers: [PortfolioService, PositionManagementService],
  exports: [PositionManagementService],
})
export class PortfolioModule {}
