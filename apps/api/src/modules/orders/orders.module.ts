import { Module } from '@nestjs/common';
import { PaperTradingModule } from '../paper-trading/paper-trading.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [PaperTradingModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
