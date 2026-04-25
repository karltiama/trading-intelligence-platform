import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { IndicatorsModule } from './indicators/indicators.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { MarketDataModule } from './modules/market-data/market-data.module';
import { SymbolsModule } from './modules/symbols/symbols.module';
import { PrismaModule } from './prisma/prisma.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { SignalsModule } from './signals/signals.module';

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    MarketDataModule,
    SymbolsModule,
    DashboardModule,
    IndicatorsModule,
    SignalsModule,
    SchedulerModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
