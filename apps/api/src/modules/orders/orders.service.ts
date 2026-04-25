import { Injectable } from '@nestjs/common';
import { PaperOrderSide } from '@prisma/client';
import { PaperTradingService } from '../paper-trading/paper-trading.service';

export type PlaceOrderInput = {
  symbol: string;
  side: PaperOrderSide;
  quantity: number;
};

@Injectable()
export class OrdersService {
  constructor(private readonly paperTradingService: PaperTradingService) {}

  placeOrder(input: PlaceOrderInput) {
    return this.paperTradingService.placeMarketOrder(input);
  }

  cancelOrder(orderId: string) {
    return this.paperTradingService.cancelOrder(orderId);
  }

  listOrders() {
    return this.paperTradingService.listOrders();
  }
}
