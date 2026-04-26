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
  ) {
    const userEmail = this.accountContextService.resolveUserEmail(
      headerUserEmail ?? queryUserEmail,
    );
    return this.portfolioService.getPositions(userEmail);
  }

  @Get('summary')
  getSummary(
    @Headers('x-user-email') headerUserEmail?: string,
    @Query('userEmail') queryUserEmail?: string,
  ) {
    const userEmail = this.accountContextService.resolveUserEmail(
      headerUserEmail ?? queryUserEmail,
    );
    return this.portfolioService.getSummary(userEmail);
  }
}
