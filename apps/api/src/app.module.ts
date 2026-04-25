import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { IndicatorsModule } from './indicators/indicators.module';
import { AutomationModule } from './modules/automation/automation.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { MarketDataModule } from './modules/market-data/market-data.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaperTradingModule } from './modules/paper-trading/paper-trading.module';
import { PortfolioModule } from './modules/portfolio/portfolio.module';
import { RiskModule } from './modules/risk/risk.module';
import { SymbolsModule } from './modules/symbols/symbols.module';
import { PrismaModule } from './prisma/prisma.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { SignalsModule } from './signals/signals.module';

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    AutomationModule,
    MarketDataModule,
    OrdersModule,
    PortfolioModule,
    RiskModule,
    SymbolsModule,
    DashboardModule,
    PaperTradingModule,
    IndicatorsModule,
    SignalsModule,
    SchedulerModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
