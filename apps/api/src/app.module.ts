import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { IndicatorsModule } from './indicators/indicators.module';
import { MarketDataModule } from './market-data/market-data.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { SignalsModule } from './signals/signals.module';

@Module({
  imports: [
    HealthModule,
    MarketDataModule,
    IndicatorsModule,
    SignalsModule,
    SchedulerModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
