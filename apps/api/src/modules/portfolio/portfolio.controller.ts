import { Controller, Get, Headers, Query } from '@nestjs/common';
import { AccountContextService } from '../account-context/account-context.service';
import { PortfolioService } from './portfolio.service';

@Controller('portfolio')
export class PortfolioController {
  constructor(
    private readonly portfolioService: PortfolioService,
    private readonly accountContextService: AccountContextService,
  ) {}

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
}
