import { Controller, Get } from '@nestjs/common';
import { MarketStateService } from './market-state.service';

@Controller('market-state')
export class MarketStateController {
  constructor(private readonly marketStateService: MarketStateService) {}

  @Get()
  getLatestMarketState() {
    return this.marketStateService.getLatestMarketState();
  }
}
