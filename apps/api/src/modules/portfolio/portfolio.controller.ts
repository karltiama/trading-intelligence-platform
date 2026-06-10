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
import { AccountContextService } from '../account-context/account-context.service';
import { PositionManagementService } from './position-management.service';
import { PortfolioService } from './portfolio.service';

type ClosePositionBody = {
  quantity?: number;
};

@Controller('portfolio')
export class PortfolioController {
  constructor(
    private readonly portfolioService: PortfolioService,
    private readonly positionManagementService: PositionManagementService,
    private readonly accountContextService: AccountContextService,
  ) {}

  @Get()
  getPortfolio(
    @Headers('x-user-email') headerUserEmail?: string,
    @Query('userEmail') queryUserEmail?: string,
    @Query('accountId') accountIdRaw?: string,
  ) {
    const principal = this.accountContextService.resolvePrincipal({
      headerUserEmail,
      queryUserEmail,
    });
    const accountId = accountIdRaw?.trim() || undefined;
    return this.portfolioService.getPortfolio(principal.userEmail, accountId);
  }

  @Get('history')
  getHistory(
    @Headers('x-user-email') headerUserEmail?: string,
    @Query('userEmail') queryUserEmail?: string,
    @Query('accountId') accountIdRaw?: string,
    @Query('limit') limitRaw?: string,
  ) {
    const principal = this.accountContextService.resolvePrincipal({
      headerUserEmail,
      queryUserEmail,
    });
    const accountId = accountIdRaw?.trim() || undefined;
    let limit = 30;
    if (limitRaw !== undefined && limitRaw.trim() !== '') {
      const parsed = Number.parseInt(limitRaw, 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        limit = Math.min(parsed, 90);
      }
    }
    return this.portfolioService.getHistory(
      principal.userEmail,
      accountId,
      limit,
    );
  }

  @Get('positions')
  getPositions(
    @Headers('x-user-email') headerUserEmail?: string,
    @Query('userEmail') queryUserEmail?: string,
    @Query('accountId') accountIdRaw?: string,
  ) {
    const principal = this.accountContextService.resolvePrincipal({
      headerUserEmail,
      queryUserEmail,
    });
    const accountId = accountIdRaw?.trim() || undefined;
    return this.portfolioService.getPositions(principal.userEmail, accountId);
  }

  @Get('summary')
  getSummary(
    @Headers('x-user-email') headerUserEmail?: string,
    @Query('userEmail') queryUserEmail?: string,
    @Query('accountId') accountIdRaw?: string,
  ) {
    const principal = this.accountContextService.resolvePrincipal({
      headerUserEmail,
      queryUserEmail,
    });
    const accountId = accountIdRaw?.trim() || undefined;
    return this.portfolioService.getSummary(principal.userEmail, accountId);
  }

  @Post('positions/:symbol/close')
  closePosition(
    @Param('symbol') symbolRaw: string,
    @Body() body: ClosePositionBody,
    @Headers('x-user-email') headerUserEmail?: string,
    @Query('userEmail') queryUserEmail?: string,
    @Query('accountId') accountIdRaw?: string,
  ) {
    const symbol = symbolRaw?.trim().toUpperCase();
    if (!symbol) {
      throw new BadRequestException('symbol is required.');
    }
    if (
      body.quantity !== undefined &&
      (typeof body.quantity !== 'number' || !Number.isFinite(body.quantity))
    ) {
      throw new BadRequestException('quantity must be a number when provided.');
    }
    const principal = this.accountContextService.resolvePrincipal({
      headerUserEmail,
      queryUserEmail,
    });
    const accountId = accountIdRaw?.trim() || undefined;
    return this.positionManagementService.closePosition(
      principal.userEmail,
      symbol,
      accountId,
      body.quantity,
    );
  }
}
