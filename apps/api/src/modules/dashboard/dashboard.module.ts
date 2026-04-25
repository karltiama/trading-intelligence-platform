import { Module } from '@nestjs/common';
import { MarketDataModule } from '../market-data/market-data.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [MarketDataModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
