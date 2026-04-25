import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { PaperOrderSide } from '@prisma/client';
import { OrdersService } from './orders.service';

type PlaceOrderBody = {
  symbol?: string;
  side?: string;
  quantity?: number;
};

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  placeOrder(@Body() body: PlaceOrderBody) {
    const symbol = body.symbol?.trim().toUpperCase();
    if (!symbol) {
      throw new BadRequestException('symbol is required.');
    }

    const sideRaw = body.side?.trim().toUpperCase();
    if (sideRaw !== 'BUY' && sideRaw !== 'SELL') {
      throw new BadRequestException('side must be BUY or SELL.');
    }

    if (typeof body.quantity !== 'number') {
      throw new BadRequestException('quantity must be a number.');
    }

    return this.ordersService.placeOrder({
      symbol,
      side: sideRaw as PaperOrderSide,
      quantity: body.quantity,
    });
  }

  @Post(':id/cancel')
  cancelOrder(@Param('id') orderId: string) {
    const id = orderId.trim();
    if (!id) {
      throw new BadRequestException('order id is required.');
    }
    return this.ordersService.cancelOrder(id);
  }

  @Get()
  listOrders() {
    return this.ordersService.listOrders();
  }
}
