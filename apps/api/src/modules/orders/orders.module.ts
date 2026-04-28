import { Module } from '@nestjs/common';
import { AccountContextModule } from '../account-context/account-context.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { PaperTradingModule } from '../paper-trading/paper-trading.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [PaperTradingModule, AccountContextModule, MarketDataModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
