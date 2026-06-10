import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { MarketDataModule } from '../modules/market-data/market-data.module';
import { PortfolioModule } from '../modules/portfolio/portfolio.module';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [ScheduleModule.forRoot(), MarketDataModule, PortfolioModule],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
