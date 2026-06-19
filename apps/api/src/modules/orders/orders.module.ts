import { Module } from '@nestjs/common';
import { AccountContextModule } from '../account-context/account-context.module';
import { BrokerModule } from '../broker/broker.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { PaperTradingModule } from '../paper-trading/paper-trading.module';
import { RiskModule } from '../risk/risk.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    PaperTradingModule,
    AccountContextModule,
    MarketDataModule,
    RiskModule,
    BrokerModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
