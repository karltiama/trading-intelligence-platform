import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { PaperOrderSide } from '@prisma/client';
import { AccountContextService } from '../account-context/account-context.service';
import { OrdersService } from './orders.service';

type PlaceOrderBody = {
  symbol?: string;
  side?: string;
  quantity?: number;
};

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly accountContextService: AccountContextService,
  ) {}

  @Post()
  placeOrder(
    @Body() body: PlaceOrderBody,
    @Headers('x-user-email') headerUserEmail?: string,
    @Query('userEmail') queryUserEmail?: string,
  ) {
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

    const userEmail = this.accountContextService.resolveUserEmail(
      headerUserEmail ?? queryUserEmail,
    );
    return this.ordersService.placeOrder({
      symbol,
      side: sideRaw as PaperOrderSide,
      quantity: body.quantity,
    }, userEmail);
  }

  @Post(':id/cancel')
  cancelOrder(
    @Param('id') orderId: string,
    @Headers('x-user-email') headerUserEmail?: string,
    @Query('userEmail') queryUserEmail?: string,
  ) {
    const id = orderId.trim();
    if (!id) {
      throw new BadRequestException('order id is required.');
    }
    const userEmail = this.accountContextService.resolveUserEmail(
      headerUserEmail ?? queryUserEmail,
    );
    return this.ordersService.cancelOrder(id, userEmail);
  }

  @Get()
  listOrders(
    @Headers('x-user-email') headerUserEmail?: string,
    @Query('userEmail') queryUserEmail?: string,
    @Query('symbol') symbolRaw?: string,
    @Query('status') statusRaw?: string,
    @Query('limit') limitRaw?: string,
    @Query('offset') offsetRaw?: string,
  ) {
    let limit: number | undefined;
    if (limitRaw) {
      const parsed = Number.parseInt(limitRaw, 10);
      if (Number.isNaN(parsed) || parsed < 1 || parsed > 100) {
        throw new BadRequestException('limit must be an integer between 1 and 100.');
      }
      limit = parsed;
    }

    let offset: number | undefined;
    if (offsetRaw) {
      const parsed = Number.parseInt(offsetRaw, 10);
      if (Number.isNaN(parsed) || parsed < 0) {
        throw new BadRequestException('offset must be an integer >= 0.');
      }
      offset = parsed;
    }

    let status: 'NEW' | 'FILLED' | 'CANCELED' | undefined;
    if (statusRaw) {
      const normalized = statusRaw.trim().toUpperCase();
      if (normalized !== 'NEW' && normalized !== 'FILLED' && normalized !== 'CANCELED') {
        throw new BadRequestException(
          'status must be one of NEW, FILLED, or CANCELED.',
        );
      }
      status = normalized;
    }

    const symbol = symbolRaw?.trim().toUpperCase() || undefined;
    const userEmail = this.accountContextService.resolveUserEmail(
      headerUserEmail ?? queryUserEmail,
    );
    return this.ordersService.listOrders(userEmail, {
      symbol,
      status,
      limit,
      offset,
    });
  }
}
