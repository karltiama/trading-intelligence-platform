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
import { normalizeOrderNote, resolveHttpTradeSource } from './resolve-trade-source';
import { OrdersService } from './orders.service';

type PlaceOrderBody = {
  symbol?: string;
  side?: string;
  quantity?: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
  signalId?: string;
  source?: string;
  note?: string;
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
    @Query('accountId') accountIdRaw?: string,
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
    if (body.stopLossPrice !== undefined && typeof body.stopLossPrice !== 'number') {
      throw new BadRequestException('stopLossPrice must be a number when provided.');
    }
    if (
      body.takeProfitPrice !== undefined &&
      typeof body.takeProfitPrice !== 'number'
    ) {
      throw new BadRequestException('takeProfitPrice must be a number when provided.');
    }

    const principal = this.accountContextService.resolvePrincipal({
      headerUserEmail,
      queryUserEmail,
    });
    const accountId = accountIdRaw?.trim() || undefined;
    const { source, signalId } = resolveHttpTradeSource(body);
    const note = normalizeOrderNote(body.note);
    return this.ordersService.placeOrder(
      {
        symbol,
        side: sideRaw as PaperOrderSide,
        quantity: body.quantity,
        stopLossPrice: body.stopLossPrice,
        takeProfitPrice: body.takeProfitPrice,
        source,
        signalId,
        note,
      },
      principal.userEmail,
      accountId,
    );
  }

  @Get('stop-suggestion')
  suggestStopLoss(
    @Query('symbol') symbolRaw?: string,
    @Query('lookback') lookbackRaw?: string,
  ) {
    const symbol = symbolRaw?.trim().toUpperCase();
    if (!symbol) {
      throw new BadRequestException('symbol is required.');
    }
    let lookback: number | undefined;
    if (lookbackRaw) {
      const parsed = Number.parseInt(lookbackRaw, 10);
      if (Number.isNaN(parsed) || parsed < 1) {
        throw new BadRequestException('lookback must be an integer >= 1.');
      }
      lookback = parsed;
    }
    return this.ordersService.suggestStopLoss(symbol, lookback);
  }

  @Post(':id/cancel')
  cancelOrder(
    @Param('id') orderId: string,
    @Headers('x-user-email') headerUserEmail?: string,
    @Query('userEmail') queryUserEmail?: string,
    @Query('accountId') accountIdRaw?: string,
  ) {
    const id = orderId.trim();
    if (!id) {
      throw new BadRequestException('order id is required.');
    }
    const principal = this.accountContextService.resolvePrincipal({
      headerUserEmail,
      queryUserEmail,
    });
    const accountId = accountIdRaw?.trim() || undefined;
    return this.ordersService.cancelOrder(id, principal.userEmail, accountId);
  }

  @Get()
  listOrders(
    @Headers('x-user-email') headerUserEmail?: string,
    @Query('userEmail') queryUserEmail?: string,
    @Query('symbol') symbolRaw?: string,
    @Query('status') statusRaw?: string,
    @Query('limit') limitRaw?: string,
    @Query('offset') offsetRaw?: string,
    @Query('cursor') cursorRaw?: string,
    @Query('accountId') accountIdRaw?: string,
    @Query('signalId') signalIdRaw?: string,
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
    const signalId = signalIdRaw?.trim() || undefined;
    const accountId = accountIdRaw?.trim() || undefined;
    const principal = this.accountContextService.resolvePrincipal({
      headerUserEmail,
      queryUserEmail,
    });
    if (cursorRaw) {
      return this.ordersService.listOrdersPage({
        userEmail: principal.userEmail,
        accountId,
        symbol,
        signalId,
        status,
        limit: limit ?? 25,
        cursor: cursorRaw,
      });
    }
    return this.ordersService.listOrders(principal.userEmail, {
      accountId,
      symbol,
      signalId,
      status,
      limit,
      offset,
    });
  }
}
